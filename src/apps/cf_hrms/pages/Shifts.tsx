import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, MenuItem, Switch, TextField, Typography } from '@mui/material';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import {
  ConfirmDialog, DataTable, EmptyState, ErrorNotice, FormDialog, ListSkeleton, Mono, PageHeader, StatusBadge,
  useToast, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  WEEKDAYS, WEEKDAY_NAMES, calendarsApi, dayFigures, hhmm, hoursText, shiftsApi,
  type HolidayCalendar, type Shift, type ShiftInput, type Weekday,
} from '../api/shifts';
import { ORG_STATUS_LABELS, ORG_STATUS_TONES } from '../components/OrgData';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { RowActions } from '../components/list/RowActions';
import { matchesQuery, useListFilters } from '../components/list/useListFilters';

/**
 * Shifts — the hours a position works, day by day (CF_HRMS_HIRING_SPEC.md §6.3).
 *
 * A SHIFT IS SEVEN DAYS, NOT ONE PAIR OF TIMES. Monday to Sunday, each either a
 * working day or not; a working day has a start and an end, or neither — which
 * is "flexible hours", allowed on purpose (an office's General shift) and not a
 * half-filled form. A day whose end is at or before its start ends the next
 * day: that is worked out, never ticked.
 *
 * THE FIGURES BESIDE EACH ROW ARE LIVE: hours that day with the break taken
 * off, and the week's total under them — the same arithmetic the server does,
 * so what is read while typing is what comes back after the save. The server
 * still decides; its refusals are listed in its own words.
 *
 * A shift also picks ONE holiday calendar, or none. The calendars themselves
 * are kept on Setup › Holidays.
 */

interface DayDraft {
  weekday: Weekday;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  breakMinutes: string;
}

interface Draft {
  id: number | null;
  code: string;
  name: string;
  status: string;
  holidayCalendarId: number | '';
  graceInMinutes: string;
  graceOutMinutes: string;
  days: DayDraft[];
}

const blankDraft = (): Draft => ({
  id: null,
  code: '',
  name: '',
  status: 'ACTIVE',
  holidayCalendarId: '',
  graceInMinutes: '0',
  graceOutMinutes: '0',
  // Monday to Saturday working, Sunday off — the common week; every day is changed in the rows.
  days: WEEKDAYS.map((weekday) => ({ weekday, isWorking: weekday !== 7, startTime: '', endTime: '', breakMinutes: '0' })),
});

const draftOf = (s: Shift): Draft => ({
  id: s.id,
  code: s.code,
  name: s.name,
  status: s.status,
  holidayCalendarId: s.holidayCalendar?.id ?? '',
  graceInMinutes: String(s.graceInMinutes ?? 0),
  graceOutMinutes: String(s.graceOutMinutes ?? 0),
  days: WEEKDAYS.map((weekday) => {
    const d = (s.days ?? []).find((x) => x.weekday === weekday);
    return {
      weekday,
      isWorking: d ? d.isWorking : weekday !== 7,
      startTime: hhmm(d?.startTime),
      endTime: hhmm(d?.endTime),
      breakMinutes: String(d?.breakMinutes ?? 0),
    };
  }),
});

const figuresOf = (d: DayDraft) =>
  dayFigures({ isWorking: d.isWorking, startTime: d.startTime, endTime: d.endTime, breakMinutes: Number(d.breakMinutes) || 0 });

const inputOf = (d: Draft): ShiftInput => ({
  code: d.code.trim(),
  name: d.name.trim(),
  status: d.status,
  holidayCalendarId: d.holidayCalendarId === '' ? null : d.holidayCalendarId,
  graceInMinutes: Number(d.graceInMinutes) || 0,
  graceOutMinutes: Number(d.graceOutMinutes) || 0,
  days: d.days.map((x) => ({
    weekday: x.weekday,
    isWorking: x.isWorking,
    // A day off carries no hours; a working day with no times is flexible.
    startTime: x.isWorking && x.startTime ? x.startTime : null,
    endTime: x.isWorking && x.endTime ? x.endTime : null,
    breakMinutes: x.isWorking ? Number(x.breakMinutes) || 0 : 0,
  })),
});

const shrink = { inputLabel: { shrink: true } };

export default function Shifts() {
  const { company = '' } = useParams<{ company: string }>();
  const can = useCan();
  const canManage = can.time.edit;
  const canRemove = can.time.remove;
  const toast = useToast();

  const [rows, setRows] = useState<Shift[] | null>(null);
  const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [doomed, setDoomed] = useState<Shift | null>(null);
  const filters = useListFilters(['calendar', 'status']);

  // Calendars for the filter: the company's own, plus any a shift uses that the list could not read.
  const calendarOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const c of calendars) seen.set(c.id, c.name);
    for (const s of rows ?? []) if (s.holidayCalendar && !seen.has(s.holidayCalendar.id)) seen.set(s.holidayCalendar.id, s.holidayCalendar.name);
    return [...seen.entries()].map(([id, name]) => ({ value: String(id), label: name }));
  }, [calendars, rows]);

  const defs: FilterDef[] = useMemo(
    () => [
      { key: 'calendar', label: 'Holiday calendar', options: calendarOptions },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'ACTIVE', label: ORG_STATUS_LABELS.ACTIVE ?? 'Active' },
          { value: 'INACTIVE', label: ORG_STATUS_LABELS.INACTIVE ?? 'Inactive' },
        ],
      },
    ],
    [calendarOptions],
  );

  // The server's rules for GET /organisation/shifts: the search is in the name or
  // the code, `calendar` is a holiday calendar id, `status` the shift's status.
  const shownRows = useMemo(() => {
    const { calendar, status } = filters.values;
    const q = filters.params.q ?? '';
    return (rows ?? []).filter((s) => {
      if (calendar && String(s.holidayCalendar?.id ?? '') !== calendar) return false;
      if (status && s.status.toLowerCase() !== status.toLowerCase()) return false;
      return matchesQuery([s.name, s.code], q);
    });
  }, [rows, filters.values, filters.params.q]);

  const load = useCallback(() => {
    setLoading(true);
    shiftsApi
      .list()
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
    // The calendars only fill the editor's select; a company without any still has shifts.
    calendarsApi.list().then(setCalendars).catch(() => setCalendars([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setDay = (weekday: Weekday, patch: Partial<DayDraft>) =>
    setDraft((d) => (d ? { ...d, days: d.days.map((x) => (x.weekday === weekday ? { ...x, ...patch } : x)) } : d));

  const copyMonday = () =>
    setDraft((d) => {
      if (!d) return d;
      const mon = d.days[0];
      return {
        ...d,
        days: d.days.map((x) =>
          x.weekday === 1 || !x.isWorking ? x : { ...x, startTime: mon.startTime, endTime: mon.endTime, breakMinutes: mon.breakMinutes },
        ),
      };
    });

  const figures = useMemo(() => (draft ? draft.days.map(figuresOf) : []), [draft]);
  const weekly = figures.reduce((t, f) => t + (f.hours ?? 0), 0);
  const workingDays = draft ? draft.days.filter((d) => d.isWorking).length : 0;
  const timedDays = figures.filter((f) => f.hours != null).length;
  const rowProblem = figures.some((f) => f.problem);

  const save = async () => {
    if (!draft) return;
    const body = inputOf(draft);
    if (draft.id) await shiftsApi.update(draft.id, body);
    else await shiftsApi.create(body);
    toast.success(draft.id ? 'Shift saved.' : 'Shift added.');
    load();
  };

  const columns: DataColumn<Shift>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Shift',
        alwaysVisible: true,
        render: (s) => (
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
              {s.name} <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{s.code}</Mono>
            </Typography>
            {/* The server's own line: "Mon–Sat 08:00–20:00". */}
            <Typography data-shiftsummary="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
              {s.summary || 'No days set'}
            </Typography>
          </Box>
        ),
        sortValue: (s) => s.name,
        exportValue: (s) => s.name,
      },
      {
        key: 'summary',
        header: 'Days and hours',
        defaultHidden: true,
        render: (s) => s.summary || '—',
        exportValue: (s) => s.summary ?? '',
      },
      {
        key: 'weekly',
        header: 'Hours a week',
        width: 130,
        numeric: true,
        align: 'right',
        render: (s) => <Mono sx={{ fontSize: 13 }}>{s.weeklyHours == null ? 'Flexible' : hoursText(s.weeklyHours)}</Mono>,
        sortValue: (s) => s.weeklyHours ?? -1,
        exportValue: (s) => s.weeklyHours ?? '',
      },
      {
        key: 'calendar',
        header: 'Holiday calendar',
        render: (s) =>
          s.holidayCalendar ? s.holidayCalendar.name : <Typography component="span" sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>No holidays</Typography>,
        sortValue: (s) => s.holidayCalendar?.name ?? '',
        exportValue: (s) => s.holidayCalendar?.name ?? '',
      },
      {
        key: 'positions',
        header: 'Positions on it',
        width: 130,
        numeric: true,
        align: 'right',
        render: (s) => <Mono sx={{ fontSize: 13 }}>{s.positionCount ?? 0}</Mono>,
        sortValue: (s) => s.positionCount ?? 0,
        exportValue: (s) => s.positionCount ?? 0,
      },
      {
        key: 'status',
        header: 'Status',
        width: 110,
        render: (s) => <StatusBadge status={s.status} map={ORG_STATUS_TONES} labelMap={ORG_STATUS_LABELS} />,
        sortValue: (s) => s.status,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Shifts"
        subtitle="the hours a position works, day by day — and the holiday calendar that goes with them"
      />

      <ListToolbar
        filters={filters}
        defs={defs}
        shown={shownRows.length}
        total={(rows ?? []).length}
        noun={['shift', 'shifts']}
        searchPlaceholder="Search shifts by name or code"
        add={canManage ? { label: 'New shift', onClick: () => setDraft(blankDraft()) } : undefined}
        excel={
          <ExcelButtons
            entity="shifts"
            noun={['shift', 'shifts']}
            filters={filters.params}
            count={shownRows.length}
            canDownload={can.time.view}
            canUpload={can.time.upload}
            onApplied={load}
          />
        }
      />

      {!!error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !rows ? (
        <ListSkeleton rows={4} />
      ) : (
        <DataTable
          rows={shownRows}
          columns={columns}
          getRowId={(s) => s.id}
          onRowClick={(s) => setDraft(draftOf(s))}
          rowActions={
            canManage || canRemove
              ? (s) => (
                  <RowActions
                    name={s.name}
                    onEdit={canManage ? () => setDraft(draftOf(s)) : undefined}
                    onRemove={canRemove ? () => setDoomed(s) : undefined}
                  />
                )
              : undefined
          }
          loading={loading}
          storageKey="cf_hrms.shifts.v2"
          exportName="shifts"
          defaultSortKey="name"
          empty={
            filters.isFiltered && (rows ?? []).length > 0 ? (
              <EmptyState
                icon={<ScheduleRounded />}
                title="No shift matches"
                hint="Nothing fits the search and filters."
                action={<Button size="small" onClick={filters.clear}>Clear</Button>}
              />
            ) : (
              <EmptyState
                icon={<ScheduleRounded />}
                title="No shifts yet"
                hint="A shift says which days of the week are worked and from when to when. Every position is on one shift."
                action={canManage ? <Button size="small" variant="contained" onClick={() => setDraft(blankDraft())}>New shift</Button> : undefined}
              />
            )
          }
        />
      )}

      <FormDialog
        open={!!draft}
        title={draft?.id ? `${draft.name || 'Shift'}` : 'New shift'}
        subtitle="Set each day of the week. A working day with no times has flexible hours."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Add shift'}
        submitDisabled={!canManage || !draft?.code.trim() || !draft?.name.trim() || rowProblem}
        maxWidth="md"
        enterSubmits={false}
      >
        {draft && (
          <Box sx={{ display: 'grid', gap: 2, pt: 0.75 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px minmax(0, 1fr) 150px' }, gap: 1.5 }}>
              <TextField
                label="Code"
                required
                size="small"
                value={draft.code}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                slotProps={{ htmlInput: { style: { fontFamily: 'var(--font-mono)' } } }}
              />
              <TextField label="Name" required size="small" value={draft.name} disabled={!canManage} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <TextField select label="Status" size="small" value={draft.status} disabled={!canManage} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <MenuItem value="ACTIVE">{ORG_STATUS_LABELS.ACTIVE ?? 'Active'}</MenuItem>
                <MenuItem value="INACTIVE">{ORG_STATUS_LABELS.INACTIVE ?? 'Inactive'}</MenuItem>
              </TextField>
            </Box>

            {/* ── The week ─────────────────────────────────────────────────── */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.75 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, flex: '1 1 160px' }}>The week</Typography>
                {canManage && (
                  <Button size="small" onClick={copyMonday} data-copymonday="">
                    Copy Monday to every working day
                  </Button>
                )}
              </Box>
              <Box component="ol" data-shiftweek="" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
                {draft.days.map((d, i) => {
                  const f = figures[i];
                  const day = WEEKDAY_NAMES[d.weekday];
                  return (
                    <Box
                      component="li"
                      key={d.weekday}
                      data-shiftday={d.weekday}
                      sx={{
                        display: 'grid',
                        alignItems: 'center',
                        columnGap: 1,
                        rowGap: 0.75,
                        gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr) 84px', md: '170px 130px 130px 110px minmax(0, 1fr)' },
                        gridTemplateAreas: { xs: '"day day day" "start end brk" "fig fig fig"', md: '"day start end brk fig"' },
                        border: '1px solid var(--c-divider)',
                        borderRadius: 'var(--r-sm)',
                        px: 1.25,
                        py: 0.75,
                        background: d.isWorking ? 'var(--c-surface)' : 'var(--c-surface-2)',
                      }}
                    >
                      <Box sx={{ gridArea: 'day', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Switch
                          size="small"
                          checked={d.isWorking}
                          disabled={!canManage}
                          onChange={(e) => setDay(d.weekday, { isWorking: e.target.checked })}
                          slotProps={{ input: { 'aria-label': `${day} is a working day` } }}
                        />
                        <Typography sx={{ fontSize: 14, fontWeight: 500, color: d.isWorking ? 'var(--c-text)' : 'var(--c-text-2)' }}>{day}</Typography>
                      </Box>
                      {d.isWorking ? (
                        <>
                          <TextField
                            sx={{ gridArea: 'start' }}
                            label="Start"
                            type="time"
                            size="small"
                            value={d.startTime}
                            disabled={!canManage}
                            onChange={(e) => setDay(d.weekday, { startTime: hhmm(e.target.value) })}
                            slotProps={{ ...shrink, htmlInput: { 'aria-label': `${day} start` } }}
                          />
                          <TextField
                            sx={{ gridArea: 'end' }}
                            label="End"
                            type="time"
                            size="small"
                            value={d.endTime}
                            disabled={!canManage}
                            onChange={(e) => setDay(d.weekday, { endTime: hhmm(e.target.value) })}
                            slotProps={{ ...shrink, htmlInput: { 'aria-label': `${day} end` } }}
                          />
                          <TextField
                            sx={{ gridArea: 'brk' }}
                            label="Break (min)"
                            size="small"
                            value={d.breakMinutes}
                            disabled={!canManage}
                            onChange={(e) => setDay(d.weekday, { breakMinutes: e.target.value.replace(/\D/g, '') })}
                            slotProps={{ ...shrink, htmlInput: { inputMode: 'numeric', 'aria-label': `${day} break in minutes` } }}
                          />
                          <Typography
                            data-dayhours=""
                            sx={{ gridArea: 'fig', fontSize: 13, color: f?.problem ? 'var(--c-danger-600)' : 'var(--c-text-2)', minWidth: 0 }}
                          >
                            {f?.problem
                              ? f.problem
                              : f?.hours == null
                                ? 'Flexible hours'
                                : `${hoursText(f.hours)}${f.nextDay ? ' · ends next day' : ''}`}
                          </Typography>
                        </>
                      ) : (
                        <Typography sx={{ gridColumn: { xs: '1 / -1', md: '2 / -1' }, fontSize: 13, color: 'var(--c-text-3)' }}>Not a working day</Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
              <Typography data-weektotal="" role="status" sx={{ fontSize: 13.5, mt: 1 }}>
                {workingDays === 0
                  ? 'No working days.'
                  : timedDays === 0
                    ? `${workingDays} working day${workingDays === 1 ? '' : 's'} a week, flexible hours.`
                    : `${workingDays} working day${workingDays === 1 ? '' : 's'} · ${hoursText(Math.round(weekly * 100) / 100)} a week${timedDays < workingDays ? ` on the ${timedDays} with set hours` : ''}.`}
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1.4fr) 1fr 1fr' }, gap: 1.5, alignItems: 'start' }}>
              <TextField
                select
                label="Holiday calendar"
                size="small"
                value={draft.holidayCalendarId}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, holidayCalendarId: e.target.value === '' ? '' : Number(e.target.value) })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                helperText={
                  <Box component={RouterLink} to={`/${company}/cf_hrms/holidays`} sx={{ color: 'var(--c-primary-700)' }}>
                    {canManage ? 'Manage holiday calendars' : 'See holiday calendars'}
                  </Box>
                }
              >
                <MenuItem value="">No holidays</MenuItem>
                {/* A calendar this shift already uses still shows, even if the list could not be read. */}
                {[
                  ...calendars.map((c) => ({ id: c.id, name: c.name })),
                  ...(rows ?? [])
                    .map((s) => s.holidayCalendar)
                    .filter((c): c is { id: number; name: string } => !!c && c.id === draft.holidayCalendarId && !calendars.some((x) => x.id === c.id))
                    .slice(0, 1),
                ].map((c) => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Grace coming in (min)"
                size="small"
                value={draft.graceInMinutes}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, graceInMinutes: e.target.value.replace(/\D/g, '') })}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
              <TextField
                label="Grace going out (min)"
                size="small"
                value={draft.graceOutMinutes}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, graceOutMinutes: e.target.value.replace(/\D/g, '') })}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            </Box>
          </Box>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!doomed}
        title={`Delete ${doomed?.name ?? "this shift"}?`}
        danger
        confirmLabel="Delete"
        body={
          doomed?.positionCount
            ? `${doomed.positionCount} position${doomed.positionCount === 1 ? ' is' : 's are'} on this shift, so it cannot be deleted. Move them to another shift first.`
            : 'No position is on this shift. This cannot be undone.'
        }
        onClose={() => setDoomed(null)}
        onConfirm={async () => {
          if (!doomed) return;
          // The server refuses a shift that is in use, and says how many positions hold it.
          await shiftsApi.remove(doomed.id);
          toast.success('Shift deleted.');
          load();
        }}
      />
    </>
  );
}
