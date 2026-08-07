/**
 * ShiftLog.tsx — account for one machine's day.
 *
 * The screen is shaped like the clipboard it replaces. A supervisor's paper
 * note reads:
 *
 *     Cutter-1, Tuesday
 *       09:00–11:30   WP-01 cut         12 good
 *       11:30–13:00   DOWN — blade change
 *       13:00–16:00   WP-02 cut         10 good, 2 scrap
 *
 * — one machine, one day, one column of times. It used to be three separate
 * cards (Work, Downtime, People) plus a Save button, which asked the supervisor
 * to sort each line of that note into the right box before writing it down. Now
 * there is ONE table: every line of the note is a row, whatever kind it is, and
 * whatever is left over shows as unaccounted.
 *
 * Decisions that make it fast enough to actually get used:
 *
 *  - **Times, not durations.** People write "9:15–11:40", not "2h 25m". Asking
 *    for a duration forces mental arithmetic at the exact moment someone is
 *    already reluctant to be doing data entry.
 *  - **Each row starts where the last one stopped**, prefilled from the gap.
 *  - **No Save button.** Each row commits as it is entered, because a half-written
 *    day that is lost on navigation is worse than one saved a row at a time —
 *    and crew assignment was already immediate for the same reason.
 *  - **Leaving time unaccounted is allowed.** An honest blank beats a guess; see
 *    GapTable for why that matters to every estimate downstream.
 *
 * People are READ-ONLY here. Crew is set on the People tab; two places to change
 * it meant two mental models of where the roster lives.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, TextField, Typography, createFilterOptions,
} from '@mui/material';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';
import { fabQuery } from '../api/client';
import { getShiftLog, type ShiftLogResponse } from '../api/shiftLog';
import { getCrew, type CrewMember } from '../api/workers';
import {
  PageHeader, SectionCard, Surface, EmptyState, GapTable, GapExcelBar,
  ListSkeleton, backendMessage, CrewPanel,
} from '../components';

interface QueryResult<T> { data: T[]; total?: number }
interface ResourceOption { id: number; name: string; code: string | null; plantName: string | null; resourceTypeName: string | null }

const machineFilter = createFilterOptions<ResourceOption>({
  stringify: (o) => `${o.code ?? ''} ${o.name} ${o.plantName ?? ''} ${o.resourceTypeName ?? ''}`,
});

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** What the gap table reports back up, so the header can summarise the day. */
interface DaySummary { workingMinutes: number; explainedMinutes: number; gapMinutes: number }

export default function ShiftLog() {
  const { user } = useAuth();
  const hasTag = usePermission('fab_erp_time_backfill');
  const canLog = isAdminRole(user?.role) || hasTag;

  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [resource, setResource] = useState<ResourceOption | null>(null);
  const [date, setDate] = useState<string>(todayStr());

  const [data, setData] = useState<ShiftLogResponse | null>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fabQuery<QueryResult<ResourceOption>>('fabErpResource', {
      fields: ['id', 'name', 'code', 'plantName', 'resourceTypeName'],
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 5000 },
    })
      .then((res) => setResources(res.data ?? []))
      .catch(() => setError('Failed to load machines.'));
  }, []);

  const load = useCallback(async () => {
    if (!resource) { setData(null); setCrew([]); setSummary(null); return; }
    setLoading(true); setError('');
    try {
      const res = await getShiftLog(resource.id, date);
      setData(res);
      // Crew for the header. Advisory — a failure here must not stop the day
      // from being written up.
      try {
        const c = await getCrew(resource.id, `${date}T00:00:00`, `${date}T23:59:59`);
        setCrew(c.crew ?? []);
      } catch { setCrew([]); }
    } catch (e) {
      setError(backendMessage(e, 'Failed to load the shift log.'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [resource, date]);

  useEffect(() => { load(); }, [load]);

  if (!canLog) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <PageHeader title="Shift Log" subtitle="Write up a machine's day from paper" />
        <EmptyState title="You don't have back-entry access" hint="The fab_erp_time_backfill permission is required to log past work." />
      </Box>
    );
  }

  const onCrew = crew.filter((c) => !(c.away ?? []).length);
  const awayCrew = crew.filter((c) => (c.away ?? []).length > 0);

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="Shift Log"
        subtitle="Account for a machine's whole day in one table — what ran, what stopped it, and what is still unexplained"
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Autocomplete<ResourceOption, false, false, false>
          options={resources}
          value={resource}
          getOptionLabel={(o) => (o.code ? `${o.code} — ${o.name}` : o.name)}
          filterOptions={machineFilter}
          autoHighlight
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 320 }}
          onChange={(_e, v) => setResource(v)}
          renderInput={(params) => <TextField {...params} label="Machine" size="small" placeholder="Select a machine…" />}
        />
        <TextField
          label="Date" type="date" size="small" value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayStr() } }}
          sx={{ width: 190 }}
        />

        {/* Two facts about the day, side by side: how much of it is accounted
            for, and who was on it. They answer the same question from opposite
            ends — a large unaccounted figure on a machine with nobody assigned
            usually needs no further explanation. */}
        {data && (
          <Box sx={{ ml: 'auto', display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 240 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
                <span>Day accounted for</span>
                <span>
                  <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-text)' }}>
                    {fmtMinutes(summary?.explainedMinutes ?? 0)}
                  </Box>
                  {(summary?.workingMinutes ?? 0) > 0 && ` of ${fmtMinutes(summary!.workingMinutes)}`}
                </span>
              </Box>
              <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--c-surface-3)' }}>
                <Box sx={{
                  width: `${(summary?.workingMinutes ?? 0) > 0 ? (summary!.explainedMinutes / summary!.workingMinutes) * 100 : 0}%`,
                  background: 'var(--c-state-running)',
                }} />
              </Box>
              {(summary?.workingMinutes ?? 0) === 0 && (
                <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.5 }}>
                  No shift calendar for this plant — there is nothing to account for.
                </Typography>
              )}
              {(summary?.gapMinutes ?? 0) > 0 && (
                <Typography sx={{ fontSize: 11, color: 'var(--c-warning-800)', mt: 0.5 }}>
                  {fmtMinutes(summary!.gapMinutes)} unaccounted for
                </Typography>
              )}
            </Box>

            <Box sx={{ minWidth: 200 }}>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>People assigned</Typography>
              {crew.length === 0 ? (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                  Nobody — assign crew on the People tab
                </Typography>
              ) : (
                <>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text)' }}>
                    {onCrew.map((c) => c.name).join(', ') || '—'}
                  </Typography>
                  {awayCrew.length > 0 && (
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>
                      away: {awayCrew.map((c) => c.name).join(', ')}
                    </Typography>
                  )}
                </>
              )}
            </Box>
          </Box>
        )}
      </Surface>

      {!resource && (
        <EmptyState title="Pick a machine and a date" hint="Then account for its day — jobs, stoppages and everything in between go in one table." />
      )}

      {resource && loading && <ListSkeleton rows={4} />}

      {resource && !loading && data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SectionCard
            title="The day"
            subtitle={`Everything ${data.resource.name} did on ${date}, and everything still unexplained. Add a row for each — or leave time unaccounted; an honest blank beats a guess.`}
          >
            <GapTable
              resourceId={data.resource.id}
              date={date}
              // Every job that could have run here today. This is what turns
              // "Worked on a job" on — without it the table could only explain
              // why NOTHING happened, and removing the Work card would have
              // taken the commonest entry with it.
              workTasks={(data.tasks ?? []).map((t) => ({
                id: t.id,
                label: [t.itemMark, t.operationName ?? `Step ${t.seqNo}`, t.itemName]
                  .filter(Boolean).join(' · '),
                plannedQty: t.plannedQty == null ? null : Number(t.plannedQty),
              }))}
              onSummary={setSummary}
              onChanged={load}
            />
            {/* The whole-day Excel path sits under the single-machine table:
                writing up eight machines is a sheet, writing up one is a form. */}
            <GapExcelBar date={date} onApplied={load} />
          </SectionCard>

          <SectionCard
            title="People"
            subtitle={`Who was on ${data.resource.name} on ${date}. Change this on the People tab.`}
          >
            <CrewPanel
              resourceId={data.resource.id}
              resourceName={data.resource.name}
              from={`${date}T00:00:00`}
              to={`${date}T23:59:59`}
              canManage={false}
            />
          </SectionCard>
        </Box>
      )}
    </Box>
  );
}
