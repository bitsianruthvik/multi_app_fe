/**
 * ShiftLog.tsx — account for a machine's time.
 *
 * Shaped like the clipboard it replaces. A supervisor's note reads:
 *
 *     Cutter-1, Tuesday
 *       09:00–11:30   WP-01 cut         12 good
 *       11:30–13:00   DOWN — blade change
 *       13:00–16:00   WP-02 cut         10 good, 2 scrap
 *
 * — one machine, one column of times. It was three cards plus a Save button,
 * which asked the supervisor to sort each line into the right box first. Now it
 * is one table per shift, and whatever is left over shows as unaccounted.
 *
 * TWO STRUCTURAL DECISIONS
 *
 * 1. MACHINES ARE TABS, not a dropdown. Moving between machines is the thing a
 *    supervisor does constantly, and the row of dots creates the instinct to
 *    clear them. The strip scrolls, because there is no per-machine access
 *    scoping yet and production has 43 machines in one company.
 *
 * 2. THE UNIT IS A SHIFT, not a calendar day. A 22:00–06:00 night shift is one
 *    thing a crew worked; grouping by date splits it across two sheets, and
 *    nobody can write that up. Instances are keyed by (shift, the date the shift
 *    STARTED), so both halves stay together.
 *
 * People are read-only here — crew is set on the People tab, and two places to
 * change it meant two mental models of where the roster lives.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Chip, MenuItem, TextField, Typography,
} from '@mui/material';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';
import { getShiftLog, type ShiftLogResponse } from '../api/shiftLog';
import { getCoverage, getRangeGaps, type MachineCoverage, type RangeGaps, type ShiftInstance } from '../api/gaps';
import { getCrew, type CrewMember } from '../api/workers';
import {
  PageHeader, SectionCard, Surface, EmptyState, GapTable, GapExcelBar, MachineTabs,
  ListSkeleton, backendMessage, CrewPanel,
} from '../components';

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 3, label: 'Last 3 days' },
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "Tue 04 Aug · 22:00 → Wed 05 · 06:00" for a night shift; one date for a day shift. */
function instanceLabel(i: ShiftInstance, tz: string) {
  const d = (iso: string, withDay = true) => new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, ...(withDay ? { weekday: 'short', day: '2-digit', month: 'short' } : {}),
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
  return i.crossesMidnight ? `${d(i.start)} → ${d(i.end)}` : d(i.start);
}

export default function ShiftLog() {
  const { user } = useAuth();
  const hasTag = usePermission('fab_erp_time_backfill');
  const canLog = isAdminRole(user?.role) || hasTag;

  const [days, setDays] = useState(7);
  const [machines, setMachines] = useState<MachineCoverage[]>([]);
  const [resourceId, setResourceId] = useState<number | null>(null);

  const [range, setRange] = useState<RangeGaps | null>(null);
  const [data, setData] = useState<ShiftLogResponse | null>(null);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return { from: ymd(start), to: ymd(end) };
  }, [days]);

  // The dots. One request for every machine — see GET /gaps/coverage.
  const loadCoverage = useCallback(async () => {
    try {
      const res = await getCoverage(from, to);
      setMachines(res.machines ?? []);
      setResourceId((cur) => (cur ?? res.machines?.[0]?.resourceId ?? null));
    } catch (e) {
      setError(backendMessage(e, 'Failed to load machines.'));
    }
  }, [from, to]);

  useEffect(() => { void loadCoverage(); }, [loadCoverage]);

  // The Excel sheet's day. Follows the range end when the period changes, but
  // stays put otherwise so picking a day does not fight the period selector.
  const [sheetDate, setSheetDate] = useState(to);
  useEffect(() => { setSheetDate(to); }, [to]);

  const load = useCallback(async () => {
    if (!resourceId) { setRange(null); setData(null); setCrew([]); return; }
    setLoading(true); setError('');
    try {
      const r = await getRangeGaps(resourceId, from, to);
      setRange(r);
      // The candidate job list still comes from the shift-log read, keyed on the
      // most recent day in range — it is what "Worked on a job" offers.
      try { setData(await getShiftLog(resourceId, to)); } catch { setData(null); }
      try {
        const c = await getCrew(resourceId, `${to}T00:00:00`, `${to}T23:59:59`);
        setCrew(c.crew ?? []);
      } catch { setCrew([]); }
    } catch (e) {
      setError(backendMessage(e, 'Failed to load.'));
      setRange(null);
    } finally {
      setLoading(false);
    }
  }, [resourceId, from, to]);

  useEffect(() => { void load(); }, [load]);

  // A write anywhere changes both the sheet and the tab dots.
  const refreshAll = useCallback(async () => {
    await Promise.all([load(), loadCoverage()]);
  }, [load, loadCoverage]);

  if (!canLog) {
    return (
      <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
        <PageHeader title="Shift Log" subtitle="Write up a machine's day from paper" />
        <EmptyState title="You don't have back-entry access" hint="The fab_erp_time_backfill permission is required to log past work." />
      </Box>
    );
  }

  const onCrew = crew.filter((c) => !(c.away ?? []).length);
  const awayCrew = crew.filter((c) => (c.away ?? []).length > 0);
  const workTasks = (data?.tasks ?? []).map((t) => ({
    id: t.id,
    label: [t.itemMark, t.operationName ?? `Step ${t.seqNo}`, t.itemName].filter(Boolean).join(' · '),
    plannedQty: t.plannedQty == null ? null : Number(t.plannedQty),
  }));

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Shift Log"
        subtitle="Account for each shift a machine worked — what ran, what stopped it, and what is still unexplained"
        actions={
          <TextField
            select size="small" label="Period" sx={{ minWidth: 160 }}
            value={days} onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => <MenuItem key={r.days} value={r.days}>{r.label}</MenuItem>)}
          </TextField>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <MachineTabs machines={machines} value={resourceId} onChange={setResourceId} />

      {!resourceId && <EmptyState title="No machines" hint="Add machines under Setup → Plants before writing up a shift." />}

      {resourceId && loading && <ListSkeleton rows={4} />}

      {resourceId && !loading && range && (
        <>
          <Surface e={1} sx={{ p: 2, mb: 2.5, display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            <Box sx={{ minWidth: 250 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-text-2)', mb: 0.5 }}>
                <span>Accounted for</span>
                <span>
                  <Box component="span" sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--c-text)' }}>
                    {fmtMinutes(range.explainedMinutes)}
                  </Box>
                  {range.workingMinutes > 0 && ` of ${fmtMinutes(range.workingMinutes)}`}
                </span>
              </Box>
              <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--c-surface-3)' }}>
                <Box sx={{
                  width: `${range.workingMinutes > 0 ? (range.explainedMinutes / range.workingMinutes) * 100 : 0}%`,
                  background: 'var(--c-state-running)',
                }} />
              </Box>
              {range.gapMinutes > 0 && (
                <Typography sx={{ fontSize: 11, color: 'var(--c-warning-800)', mt: 0.5 }}>
                  {fmtMinutes(range.gapMinutes)} unaccounted across {range.instances.length} shift
                  {range.instances.length === 1 ? '' : 's'}
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
                  <Typography sx={{ fontSize: 13 }}>{onCrew.map((c) => c.name).join(', ') || '—'}</Typography>
                  {awayCrew.length > 0 && (
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>
                      away: {awayCrew.map((c) => c.name).join(', ')}
                    </Typography>
                  )}
                </>
              )}
            </Box>

            <Box sx={{ ml: 'auto' }}>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>times are {range.timezone}</Typography>
            </Box>
          </Surface>

          {range.instances.length === 0 ? (
            <EmptyState
              title="No shifts in this period"
              hint={`${range.resourceName} has no working time configured for these dates — nothing to account for. Set a shift calendar under Setup → Calendars.`}
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {range.instances.map((i) => (
                <SectionCard
                  key={i.key}
                  title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <span>{i.shiftName ?? 'Shift'}</span>
                      <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', fontWeight: 400 }}>
                        {instanceLabel(i, range.timezone)}
                      </Typography>
                      {i.crossesMidnight && (
                        <Chip size="small" label="crosses midnight" sx={{ height: 17, fontSize: 10 }} />
                      )}
                      <Chip
                        size="small"
                        label={i.gapMinutes > 0 ? `${fmtMinutes(i.gapMinutes)} unaccounted` : 'accounted for'}
                        sx={{
                          height: 18, fontSize: 10.5,
                          bgcolor: i.gapMinutes > 0 ? 'var(--c-warning-50)' : 'var(--c-surface-2)',
                          color: i.gapMinutes > 0 ? 'var(--c-warning-800)' : 'var(--c-text-3)',
                        }}
                      />
                    </Box>
                  }
                >
                  {/* Instance mode: the table renders THIS shift, not the
                      calendar day around it. Writes are anchored to the date the
                      shift started — which is the day the crew would call it,
                      and what the backend rolls a past-midnight `to` off. */}
                  <GapTable
                    resourceId={resourceId}
                    date={i.localDate}
                    instance={i}
                    timezone={range.timezone}
                    resourceName={range.resourceName}
                    workTasks={workTasks}
                    onChanged={refreshAll}
                  />
                </SectionCard>
              ))}
            </Box>
          )}

          {/* The sheet is one DAY across EVERY machine — the opposite cut to the
              rest of this page, and deliberately so: a supervisor writing up
              eight machines wants one file, not eight. So it gets its own day
              picker rather than silently meaning whichever day the range ends. */}
          <Box sx={{ mt: 2 }}>
            <SectionCard
              title="Excel"
              subtitle="One sheet for a single day, covering every machine"
              action={
                <TextField
                  size="small" type="date" label="Sheet for" sx={{ width: 175 }}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: from, max: to }}
                  value={sheetDate} onChange={(e) => setSheetDate(e.target.value)}
                />
              }
            >
              <GapExcelBar date={sheetDate} onApplied={refreshAll} />
            </SectionCard>
          </Box>

          <Box sx={{ mt: 2 }}>
            <SectionCard
              title="People"
              subtitle={`Who was on ${range.resourceName}. Change this on the People tab.`}
            >
              <CrewPanel
                resourceId={resourceId}
                resourceName={range.resourceName}
                from={`${to}T00:00:00`}
                to={`${to}T23:59:59`}
                canManage={false}
              />
            </SectionCard>
          </Box>
        </>
      )}
    </Box>
  );
}
