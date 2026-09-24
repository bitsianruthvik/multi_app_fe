import { useCallback, useMemo, useState } from 'react';
import { Box, Button, FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EventRounded from '@mui/icons-material/EventRounded';
import {
  ConfirmDialog,
  EmptyState,
  EntityRow,
  ErrorNotice,
  FacetChip,
  FilterBar,
  FormDialog,
  ListSkeleton,
  Mono,
  PageHeader,
  SectionCard,
  StatSkeleton,
  StatStrip,
  ToneBadge,
  useIsPermitted,
  useToast,
  type Stat,
} from '@shared/ui';
import { orgApi, ORG_MANAGE, type Holiday, type Lookups } from '../api/organisation';
import { formatHolidayDate, norm, todayIso, useOrgLoad } from '../components/OrgData';

/**
 * Holidays — the calendar attendance reads to decide whether an absent day is
 * an absence.
 *
 * Grouped by YEAR because that is how a holiday list is actually used: it is
 * published once a year, checked against last year's, and argued over as a
 * block. One flat list of 60 dates spanning three years answers none of those.
 *
 * A row with no location is company-wide; a row WITH one does not override it —
 * both apply, and the attendance service treats a date as a holiday if any
 * applicable row matches (init.sql §1f). The screen says so rather than
 * implying a precedence that does not exist.
 */

interface DraftState {
  id: number | null;
  holidayDate: string;
  name: string;
  locationId: number | '';
  isOptional: boolean;
}

const emptyDraft = (): DraftState => ({
  id: null,
  holidayDate: todayIso(),
  name: '',
  locationId: '',
  isOptional: false,
});

const yearOf = (iso: string) => iso.slice(0, 4);

export default function Holidays() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const load = useCallback(
    () =>
      Promise.all([orgApi.holidays.list(), orgApi.lookups()]).then(([rows, lookups]) => ({
        rows,
        lookups,
      })),
    [],
  );
  const { data, error, loading, reload } = useOrgLoad<{ rows: Holiday[]; lookups: Lookups }>(load);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const lookups = data?.lookups;

  const [query, setQuery] = useState('');
  const [yearFacet, setYearFacet] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Holiday | null>(null);

  const today = todayIso();
  const thisYear = today.slice(0, 4);

  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((r) => {
      if (yearFacet && yearOf(r.holidayDate) !== yearFacet) return false;
      if (!q) return true;
      return norm(`${r.name} ${r.holidayDate} ${r.locationName ?? ''}`).includes(q);
    });
  }, [rows, query, yearFacet]);

  const byYear = useMemo(() => {
    const groups = new Map<string, Holiday[]>();
    for (const r of filtered) {
      const y = yearOf(r.holidayDate);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y)!.push(r);
    }
    // Newest year first: the one being planned is the one people open this for.
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const years = useMemo(() => {
    const out = new Map<string, number>();
    for (const r of rows) {
      const y = yearOf(r.holidayDate);
      out.set(y, (out.get(y) ?? 0) + 1);
    }
    return [...out.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const stats: Stat[] = useMemo(() => {
    const inYear = rows.filter((r) => yearOf(r.holidayDate) === thisYear).length;
    const upcoming = rows.filter((r) => r.holidayDate >= today).length;
    const optional = rows.filter((r) => r.isOptional).length;
    // A public holiday declared on a Sunday gives nobody a day off. It is the
    // single most common slip when a calendar is copied from a government list.
    const onSunday = rows.filter((r) => formatHolidayDate(r.holidayDate).weekday === 'Sunday').length;
    return [
      { label: `Holidays in ${thisYear}`, value: inYear },
      { label: 'Still to come', value: upcoming, tone: 'info', hint: 'Dated today or later.' },
      {
        label: 'Optional',
        value: optional,
        hint: 'Staff choose whether to take these. Attendance still expects a decision per person.',
      },
      {
        label: 'Falls on a Sunday',
        value: onSunday,
        tone: 'warning',
        hint: 'A holiday on the weekly off buys nobody a day off — check the date against the calendar it was copied from.',
      },
    ];
  }, [rows, thisYear, today]);

  const openEdit = (row: Holiday) =>
    setDraft({
      id: row.id,
      holidayDate: row.holidayDate,
      name: row.name,
      locationId: row.locationId ?? '',
      isOptional: row.isOptional,
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      holidayDate: draft.holidayDate,
      name: draft.name,
      locationId: draft.locationId === '' ? null : draft.locationId,
      isOptional: draft.isOptional,
    };
    if (draft.id) await orgApi.holidays.update(draft.id, body);
    else await orgApi.holidays.create(body);
    success(draft.id ? 'Holiday saved.' : 'Holiday added.');
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.holidays.remove(doomed.id);
    success(`${doomed.name} removed from the calendar.`);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Holidays"
        subtitle="The calendar attendance reads before it calls a day an absence"
        actions={
          canManage ? (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft())}>
              New holiday
            </Button>
          ) : undefined
        }
      />

      <ErrorNotice error={error} fallback="Could not load the holiday calendar." onRetry={reload} />

      {loading ? (
        <>
          <StatSkeleton count={4} />
          <Box sx={{ mt: 2 }}>
            <ListSkeleton rows={6} />
          </Box>
        </>
      ) : (
        <>
          <StatStrip stats={stats} />
          <Box sx={{ mt: 2, mb: 2 }}>
            <FilterBar
              search={query}
              onSearch={setQuery}
              placeholder="Search holidays by name, date or location"
            >
              {years.map(([y, n]) => (
                <FacetChip
                  key={y}
                  label={y}
                  count={n}
                  active={yearFacet === y}
                  onClick={() => setYearFacet(yearFacet === y ? null : y)}
                />
              ))}
            </FilterBar>
          </Box>

          {rows.length === 0 ? (
            <EmptyState
              icon={<EventRounded />}
              title="No holidays on the calendar"
              hint="Add the year's public holidays. Until they are here, attendance has no way to tell a declared holiday from an unexplained absence."
              action={
                canManage ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft())}>
                    Add the first holiday
                  </Button>
                ) : undefined
              }
            />
          ) : byYear.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              hint="Search covers the name, the date and the location."
              action={
                <Button
                  onClick={() => {
                    setQuery('');
                    setYearFacet(null);
                  }}
                >
                  Clear the filters
                </Button>
              }
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {byYear.map(([year, list]) => {
                const optional = list.filter((h) => h.isOptional).length;
                return (
                  <SectionCard
                    key={year}
                    title={year}
                    subtitle={`${list.length} ${list.length === 1 ? 'holiday' : 'holidays'}${
                      optional ? ` · ${optional} optional` : ''
                    }`}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {list.map((row) => {
                        const { day, weekday } = formatHolidayDate(row.holidayDate);
                        const past = row.holidayDate < today;
                        return (
                          <EntityRow
                            key={row.id}
                            code={
                              <Mono tabular sx={{ minWidth: 104, opacity: past ? 0.6 : 1 }}>
                                {day}
                              </Mono>
                            }
                            primary={row.name}
                            secondary={
                              [
                                weekday,
                                row.locationName ? `${row.locationName} only` : 'Company-wide',
                              ].join(' · ')
                            }
                            trailing={
                              <>
                                {row.isOptional && (
                                  <ToneBadge
                                    tone="warning"
                                    noIcon
                                    label="Optional"
                                    title="Staff choose whether to take it."
                                  />
                                )}
                                {weekday === 'Sunday' && (
                                  <ToneBadge
                                    tone="warning"
                                    label="On a Sunday"
                                    title="Falls on the weekly off — check the date."
                                  />
                                )}
                                {past && <ToneBadge tone="neutral" noIcon label="Past" />}
                              </>
                            }
                            actions={
                              canManage ? (
                                <>
                                  <Tooltip title="Edit">
                                    <IconButton size="small" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
                                      <EditRounded fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Remove">
                                    <IconButton size="small" onClick={() => setDoomed(row)} aria-label={`Remove ${row.name}`}>
                                      <DeleteOutlineRounded fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              ) : undefined
                            }
                          />
                        );
                      })}
                    </Box>
                  </SectionCard>
                );
              })}
            </Box>
          )}
        </>
      )}

      <FormDialog
        open={!!draft}
        title={draft?.id ? 'Edit holiday' : 'New holiday'}
        subtitle="One row per date per scope. A company-wide row and a location row both apply."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim() || !draft?.holidayDate}
      >
        {draft && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Date"
                type="date"
                value={draft.holidayDate}
                onChange={(e) => setDraft({ ...draft, holidayDate: e.target.value })}
                required
                size="small"
                sx={{ flex: '1 1 180px' }}
                slotProps={{ inputLabel: { shrink: true } }}
                helperText={
                  draft.holidayDate
                    ? formatHolidayDate(draft.holidayDate).weekday
                    : undefined
                }
              />
              <TextField
                label="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                autoFocus
                size="small"
                sx={{ flex: '2 1 240px' }}
              />
            </Box>
            <TextField
              select
              label="Applies to"
              value={draft.locationId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  locationId: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
              size="small"
              fullWidth
              helperText="A location row does not replace a company-wide one — both apply."
            >
              <MenuItem value="">
                <em>The whole company</em>
              </MenuItem>
              {(lookups?.locations ?? []).map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={draft.isOptional}
                  onChange={(e) => setDraft({ ...draft, isOptional: e.target.checked })}
                />
              }
              label="Optional holiday"
            />
            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: -1.5 }}>
              Staff choose whether to take an optional holiday, so attendance still expects a
              decision for each person on that date.
            </Box>
          </>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Remove this holiday?"
        entityName={doomed ? `${doomed.holidayDate} — ${doomed.name}` : undefined}
        body="Attendance already recorded against the date keeps its status; only the calendar entry goes."
        confirmLabel="Remove"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
