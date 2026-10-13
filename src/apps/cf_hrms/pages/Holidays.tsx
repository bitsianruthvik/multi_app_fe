import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import {
  Callout, ConfirmDialog, EmptyState, ErrorNotice, FormDialog, ListSkeleton, Mono, PageHeader, SectionCard, ToneBadge,
  errorMessage, useToast,
} from '@shared/ui';
import type { ApiProblem } from '../api/client';
import { useCan } from '../access/can';
import { niceDate } from '../api/hiring';
import { NATIONAL_HOLIDAYS, calendarsApi, type CopyYearResult, type Holiday, type HolidayCalendar } from '../api/shifts';

/**
 * Holidays — the company's holiday calendars (CF_HRMS_HIRING_SPEC.md §6.3).
 *
 * A CALENDAR IS A NAMED LIST OF DATED HOLIDAYS, and a shift picks one (on
 * Setup › Shifts). So "the office calendar" and "the plant calendar" are two
 * cards here, each used by the shifts that say so.
 *
 * NO LIST IS INVENTED. Festival dates differ by state, by faith and by year, so
 * a new calendar starts empty and the company enters its own. The one thing
 * offered is the three national holidays, whose dates never move: 26 January,
 * 15 August, 2 October.
 *
 * "COPY TO NEXT YEAR" copies day and month as they are — right for a fixed
 * date, wrong for a festival that moves. It says so before it copies, and
 * after, and names every date it skipped because next year already had it.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const thisYear = () => new Date().getFullYear();

interface HolidayDraft { id: number | null; date: string; name: string; isOptional: boolean }
interface CalendarDraft { id: number | null; name: string; description: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function Holidays() {
  const can = useCan();
  const canManage = can.time.edit;
  const canRemove = can.time.remove;
  const toast = useToast();

  const [calendars, setCalendars] = useState<HolidayCalendar[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [year, setYear] = useState(thisYear());
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [detailError, setDetailError] = useState<unknown>(null);

  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft | null>(null);
  const [holidayDraft, setHolidayDraft] = useState<HolidayDraft | null>(null);
  const [doomedCalendar, setDoomedCalendar] = useState<HolidayCalendar | null>(null);
  const [doomedHoliday, setDoomedHoliday] = useState<Holiday | null>(null);
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState<(CopyYearResult & { toYear: number }) | null>(null);
  const [addingNational, setAddingNational] = useState(false);

  const loadCalendars = useCallback(
    () =>
      calendarsApi
        .list()
        .then((list) => {
          setCalendars(list);
          setError(null);
          return list;
        })
        .catch((e) => {
          setError(e);
          setCalendars((cur) => cur ?? []);
          return [] as HolidayCalendar[];
        }),
    [],
  );

  useEffect(() => {
    // The only calendar is opened straight away: one card with nothing under it is a wasted click.
    void loadCalendars().then((list) => setOpenId((cur) => cur ?? (list.length === 1 ? list[0].id : null)));
  }, [loadCalendars]);

  const loadHolidays = useCallback(() => {
    if (openId == null) return;
    setDetailError(null);
    calendarsApi
      .get(openId, year)
      .then((r) => {
        setHolidays(r.holidays ?? []);
        setYears(r.years ?? []);
      })
      .catch((e) => {
        setDetailError(e);
        setHolidays([]);
      });
  }, [openId, year]);

  useEffect(() => {
    setHolidays(null);
    loadHolidays();
  }, [loadHolidays]);

  const open = calendars?.find((c) => c.id === openId) ?? null;
  const refresh = () => {
    loadHolidays();
    void loadCalendars();
  };

  // The years offered: every year the calendar has holidays in, this year and the next, and the one on screen.
  const yearOptions = useMemo(
    () => [...new Set([...years, thisYear(), thisYear() + 1, year])].sort((a, b) => a - b),
    [years, year],
  );

  const saveCalendar = async () => {
    if (!calendarDraft) return;
    const body = { name: calendarDraft.name.trim(), description: calendarDraft.description.trim() || null };
    if (calendarDraft.id) await calendarsApi.update(calendarDraft.id, body);
    else {
      const { calendar } = await calendarsApi.create(body);
      if (calendar?.id) setOpenId(calendar.id);
    }
    toast.success(calendarDraft.id ? 'Calendar saved.' : 'Calendar added. It has no holidays yet.');
    void loadCalendars();
  };

  const saveHoliday = async () => {
    if (!holidayDraft || openId == null) return;
    const body = { date: holidayDraft.date, name: holidayDraft.name.trim(), isOptional: holidayDraft.isOptional };
    if (holidayDraft.id) await calendarsApi.updateHoliday(holidayDraft.id, body);
    else await calendarsApi.addHoliday(openId, body);
    toast.success(holidayDraft.id ? 'Holiday saved.' : 'Holiday added.');
    // A holiday entered for another year is shown by going to that year.
    const y = Number(holidayDraft.date.slice(0, 4));
    if (y && y !== year) setYear(y);
    else loadHolidays();
    void loadCalendars();
  };

  const addNational = async () => {
    if (openId == null) return;
    setAddingNational(true);
    let added = 0;
    let had = 0;
    let failed: unknown = null;
    for (const h of NATIONAL_HOLIDAYS) {
      try {
        await calendarsApi.addHoliday(openId, { date: `${year}-${pad(h.month)}-${pad(h.day)}`, name: h.name, isOptional: false });
        added += 1;
      } catch (e) {
        // Already there for that date: that is the result wanted, not a failure.
        if ((e as ApiProblem)?.code === 'DUPLICATE' || (e as ApiProblem)?.status === 409) had += 1;
        else failed = e;
      }
    }
    setAddingNational(false);
    if (failed) toast.error(errorMessage(failed, 'The national holidays could not all be added.'));
    else toast.success(added ? `${plural(added, 'national holiday')} added for ${year}${had ? `; ${had} already there` : ''}.` : `All three were already there for ${year}.`);
    refresh();
  };

  const copyYear = async () => {
    if (openId == null) return;
    const r = await calendarsApi.copyYear(openId, { fromYear: year, toYear: year + 1 });
    setCopied({ ...r, toYear: year + 1 });
    refresh();
  };

  const hasNational = (holidays ?? []).filter((h) => NATIONAL_HOLIDAYS.some((n) => h.date.slice(5) === `${pad(n.month)}-${pad(n.day)}`)).length;

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader
        title="Holidays"
        subtitle="the company's holiday calendars — each shift picks the one that applies to it"
        actions={
          canManage && (
            <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setCalendarDraft({ id: null, name: '', description: '' })}>
              New calendar
            </Button>
          )
        }
      />

      {!!error && <ErrorNotice error={error} onRetry={() => void loadCalendars()} sx={{ mb: 2 }} />}

      {calendars == null ? (
        <ListSkeleton rows={3} />
      ) : calendars.length === 0 && !error ? (
        <EmptyState
          icon={<EventRounded />}
          title="No holiday calendar yet"
          hint="A calendar is a named list of the days the company is closed. Add one, enter its holidays, then pick it on a shift."
          action={
            canManage ? (
              <Button size="small" variant="contained" onClick={() => setCalendarDraft({ id: null, name: '', description: '' })}>
                New calendar
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Box
          component="ul"
          aria-label="Holiday calendars"
          sx={{ listStyle: 'none', m: 0, mb: 2, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 1.5 }}
        >
          {calendars.map((c) => {
            const on = c.id === openId;
            return (
              <Box component="li" key={c.id} sx={{ minWidth: 0 }}>
                <Box
                  component="button"
                  type="button"
                  data-calendar={c.id}
                  aria-pressed={on}
                  onClick={() => {
                    setOpenId(c.id);
                    setCopied(null);
                  }}
                  sx={{
                    width: '100%',
                    height: '100%',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    p: 1.75,
                    borderRadius: 'var(--r-md)',
                    border: '1px solid',
                    borderColor: on ? 'var(--c-primary-500)' : 'var(--c-border)',
                    background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                    '&:hover': { borderColor: 'var(--c-primary-500)' },
                    '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                  }}
                >
                  <Typography sx={{ fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{c.name}</Typography>
                  {c.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{c.description}</Typography>}
                  <Typography sx={{ fontSize: 13, mt: 0.75 }}>
                    {plural(c.holidayCount ?? 0, 'holiday')} · {c.shiftCount ? `used by ${plural(c.shiftCount, 'shift')}` : 'no shift uses it yet'}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {c.nextHoliday ? `Next: ${c.nextHoliday.name}, ${niceDate(c.nextHoliday.date)}` : 'No holiday coming up'}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {open && (
        <SectionCard
          title={open.name}
          subtitle={`Holidays in ${year}${holidays ? ` · ${holidays.length}` : ''}`}
          action={
            (canManage || canRemove) && (
              <Stack direction="row" spacing={0.5}>
                {canManage && (
                  <Tooltip title="Rename this calendar">
                    <IconButton size="small" aria-label={`Rename ${open.name}`} onClick={() => setCalendarDraft({ id: open.id, name: open.name, description: open.description ?? '' })}>
                      <EditRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {canRemove && (
                  <Tooltip title="Delete this calendar…">
                    <IconButton size="small" aria-label={`Delete ${open.name}`} onClick={() => setDoomedCalendar(open)}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            )
          }
        >
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            <TextField
              select
              size="small"
              label="Year"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setCopied(null);
              }}
              sx={{ width: 120 }}
            >
              {yearOptions.map((y) => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </TextField>
            {canManage && (
              <>
                <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setHolidayDraft({ id: null, date: `${year}-01-01`, name: '', isOptional: false })}>
                  Add a holiday
                </Button>
                {hasNational < NATIONAL_HOLIDAYS.length && (
                  <Button size="small" variant="outlined" disabled={addingNational} data-addnational="" onClick={() => void addNational()}>
                    {addingNational ? 'Adding…' : `Add the three national holidays for ${year}`}
                  </Button>
                )}
                {(holidays?.length ?? 0) > 0 && (
                  <Button size="small" onClick={() => setCopying(true)} data-copyyear="">
                    Copy to {year + 1}
                  </Button>
                )}
              </>
            )}
          </Box>

          {!!detailError && <ErrorNotice error={detailError} onRetry={loadHolidays} sx={{ mb: 1.5 }} />}

          {copied && (
            <Callout
              tone={copied.skipped?.length ? 'warning' : 'info'}
              title={`${plural(copied.copied ?? 0, 'holiday')} copied to ${copied.toYear}`}
              sx={{ mb: 1.5 }}
            >
              <Typography sx={{ fontSize: 13, lineHeight: 1.55 }}>
                {copied.message ?? copied.note ?? 'Each one keeps its day and month. Festival dates move from year to year — open that year and correct them.'}
              </Typography>
              {copied.skipped?.length > 0 && (
                <Box data-copyskipped="" sx={{ mt: 0.75 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Not copied</Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13, lineHeight: 1.55 }}>
                    {copied.skipped.map((s) => (
                      <li key={`${s.date}-${s.name}`}>
                        {niceDate(s.date)} · {s.name} — {s.why}
                      </li>
                    ))}
                  </Box>
                </Box>
              )}
              <Button size="small" sx={{ mt: 0.75, ml: -0.5 }} onClick={() => { setYear(copied.toYear); setCopied(null); }}>
                Open {copied.toYear}
              </Button>
            </Callout>
          )}

          {holidays == null ? (
            <ListSkeleton rows={4} />
          ) : holidays.length === 0 ? (
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              No holidays entered for {year}. Nothing is filled in for you — festival dates differ by place and by year.
            </Typography>
          ) : (
            <Box component="ul" data-holidays="" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
              {holidays.map((h) => (
                <Box
                  component="li"
                  key={h.id}
                  data-holiday={h.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: '130px 110px minmax(0, 1fr) auto' },
                    gridTemplateAreas: { xs: '"name act" "date act"', sm: '"date day name act"' },
                    alignItems: 'center',
                    columnGap: 1.5,
                    px: 1.25,
                    py: 0.75,
                    border: '1px solid var(--c-divider)',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <Mono sx={{ gridArea: 'date', fontSize: 13 }}>
                    {niceDate(h.date)}
                    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' }, color: 'var(--c-text-2)' }}> · {h.weekday}</Box>
                  </Mono>
                  <Typography sx={{ gridArea: 'day', display: { xs: 'none', sm: 'block' }, fontSize: 13, color: 'var(--c-text-2)' }}>{h.weekday}</Typography>
                  <Box sx={{ gridArea: 'name', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 500, overflowWrap: 'anywhere' }}>{h.name}</Typography>
                    {h.isOptional && <ToneBadge tone="neutral" noIcon label="Optional" />}
                  </Box>
                  {(canManage || canRemove) && (
                    <Box sx={{ gridArea: 'act', display: 'flex' }}>
                      {canManage && (
                        <IconButton size="small" aria-label={`Edit ${h.name}`} onClick={() => setHolidayDraft({ id: h.id, date: h.date.slice(0, 10), name: h.name, isOptional: h.isOptional })}>
                          <EditRounded fontSize="small" />
                        </IconButton>
                      )}
                      {canRemove && (
                        <IconButton size="small" aria-label={`Remove ${h.name}`} onClick={() => setDoomedHoliday(h)}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </SectionCard>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <FormDialog
        open={!!calendarDraft}
        title={calendarDraft?.id ? 'Rename the calendar' : 'New holiday calendar'}
        subtitle={calendarDraft?.id ? undefined : 'It starts empty. Its holidays are added afterwards, year by year.'}
        onClose={() => setCalendarDraft(null)}
        onSubmit={saveCalendar}
        submitLabel={calendarDraft?.id ? 'Save' : 'Add calendar'}
        submitDisabled={!calendarDraft?.name.trim()}
        maxWidth="xs"
      >
        {calendarDraft && (
          <Stack spacing={1.5} sx={{ pt: 0.75 }}>
            <TextField
              label="Name"
              required
              size="small"
              autoFocus
              placeholder="Plant holidays"
              value={calendarDraft.name}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, name: e.target.value })}
            />
            <TextField
              label="Who it is for (optional)"
              size="small"
              value={calendarDraft.description}
              onChange={(e) => setCalendarDraft({ ...calendarDraft, description: e.target.value })}
            />
          </Stack>
        )}
      </FormDialog>

      <FormDialog
        open={!!holidayDraft}
        title={holidayDraft?.id ? 'Edit the holiday' : 'Add a holiday'}
        subtitle={open?.name}
        onClose={() => setHolidayDraft(null)}
        onSubmit={saveHoliday}
        submitLabel={holidayDraft?.id ? 'Save' : 'Add holiday'}
        submitDisabled={!holidayDraft?.date || !holidayDraft?.name.trim()}
        maxWidth="xs"
      >
        {holidayDraft && (
          <Stack spacing={1.5} sx={{ pt: 0.75 }}>
            <TextField
              label="Date"
              type="date"
              required
              size="small"
              value={holidayDraft.date}
              onChange={(e) => setHolidayDraft({ ...holidayDraft, date: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="Name"
              required
              size="small"
              autoFocus
              value={holidayDraft.name}
              onChange={(e) => setHolidayDraft({ ...holidayDraft, name: e.target.value })}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={holidayDraft.isOptional} onChange={(e) => setHolidayDraft({ ...holidayDraft, isOptional: e.target.checked })} />}
              label={<Typography sx={{ fontSize: 13.5 }}>Optional — people choose whether to take it</Typography>}
            />
          </Stack>
        )}
      </FormDialog>

      <ConfirmDialog
        open={copying}
        title={`Copy ${year}'s holidays to ${year + 1}?`}
        confirmLabel={`Copy to ${year + 1}`}
        body={
          <Box>
            <Typography sx={{ fontSize: 14, lineHeight: 1.55, mb: 1 }}>
              Each holiday is copied with the same day and month. Dates that {year + 1} already has are left alone and listed.
            </Typography>
            <Typography data-copywarning="" sx={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--c-warning-800)' }}>
              Festivals move every year — Diwali, Eid, Holi, Dussehra and others will be on the wrong date after
              copying. Go through {year + 1} afterwards and correct them.
            </Typography>
          </Box>
        }
        onClose={() => setCopying(false)}
        onConfirm={copyYear}
      />

      <ConfirmDialog
        open={!!doomedHoliday}
        title={`Remove ${doomedHoliday?.name ?? 'this holiday'}?`}
        danger
        confirmLabel="Remove"
        body={doomedHoliday ? `${niceDate(doomedHoliday.date)} becomes an ordinary day in this calendar.` : undefined}
        onClose={() => setDoomedHoliday(null)}
        onConfirm={async () => {
          if (!doomedHoliday) return;
          await calendarsApi.removeHoliday(doomedHoliday.id);
          toast.success('Holiday removed.');
          refresh();
        }}
      />

      <ConfirmDialog
        open={!!doomedCalendar}
        title={`Delete ${doomedCalendar?.name ?? 'this calendar'}?`}
        danger
        confirmLabel="Delete"
        body={
          doomedCalendar?.shiftCount
            ? `${plural(doomedCalendar.shiftCount, 'shift')} use${doomedCalendar.shiftCount === 1 ? 's' : ''} this calendar, so it cannot be deleted. Pick another calendar on ${doomedCalendar.shiftCount === 1 ? 'that shift' : 'those shifts'} first.`
            : `The calendar and its ${plural(doomedCalendar?.holidayCount ?? 0, 'holiday')} are deleted. This cannot be undone.`
        }
        onClose={() => setDoomedCalendar(null)}
        onConfirm={async () => {
          if (!doomedCalendar) return;
          // The server refuses a calendar a shift still selects, in its own words.
          await calendarsApi.remove(doomedCalendar.id);
          toast.success('Calendar deleted.');
          if (openId === doomedCalendar.id) {
            setOpenId(null);
            setHolidays(null);
          }
          void loadCalendars();
        }}
      />
    </Box>
  );
}
