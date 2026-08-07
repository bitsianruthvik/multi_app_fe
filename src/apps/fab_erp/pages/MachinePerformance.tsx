/**
 * MachinePerformance.tsx — one honest picture of every machine.
 *
 * Three questions on one screen, because they are only useful together: a
 * machine can look busy and produce nothing, or produce a lot in a way nobody
 * can repeat.
 *
 *   Where did the time go?     available = running + stopped + unaccounted
 *   What came off it?          metric tonnes
 *   How fast, and how steady?  t/h over touch time, with its spread
 *
 * ── THREE THINGS THIS SCREEN REFUSES TO DO ────────────────────────────────
 *
 * 1. IT NEVER HIDES THE PROVENANCE OF A NUMBER. `produced_qty` holds zero rows
 *    in production, so tonnage is computed from the item's PLANNED quantity. A
 *    figure that silently blends "what we made" with "what we meant to make" is
 *    worse than no figure, because it looks like measurement. Every tonnage
 *    carries a "planned"/"measured" chip.
 *
 * 2. IT NEVER SHOWS A SPREAD IT DOES NOT HAVE. Production has machines with one
 *    completed run in 30 days. The variation is shown with its `n` and marked
 *    provisional below five runs — not hidden, because hiding it just moves the
 *    guessing somewhere nobody can see.
 *
 * 3. IT IS NOT CUT BY OPERATOR, and must not be. Per FAB_ERP_PEOPLE_PLAN §0, a
 *    number that can be used against the person who entered it stops being true
 *    — and these streams are shared, so that fiction reaches every estimate
 *    downstream. This describes a machine.
 *
 * Time use is read from the same `rangeGaps` derivation the Shift Log renders,
 * so this page and the page people write to cannot disagree.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Chip, MenuItem, TextField, Tooltip, Typography } from '@mui/material';

import { useAuth } from '@core/contexts/AuthContext';
import { usePermission } from '@core/hooks/usePermission';
import { isAdminRole } from '@core/utils/roles';
import {
  getFleetPerformance, getMachinePerformance,
  type FleetRow, type MachinePerformance as Perf, type TonnesSource,
} from '../api/machinePerformance';
import {
  PageHeader, SectionCard, Surface, EmptyState, DataTable, ListSkeleton,
  backendMessage, BarChart, Mono, type DataColumn, type BarDatum,
} from '../components';

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hrs = (min: number) => (min >= 60 ? `${(min / 60).toFixed(1)}h` : `${Math.round(min)}m`);
const t3 = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(n >= 10 ? 1 : 2));

/** The chip that stops a planned figure being read as a measured one. */
function SourceChip({ source }: { source: TonnesSource }) {
  if (source === 'none') return null;
  const measured = source === 'produced';
  const label = measured ? 'measured' : source === 'mixed' ? 'part measured' : 'planned';
  const title = measured
    ? 'From output recorded at /stop.'
    : source === 'mixed'
      ? 'Some runs recorded output; the rest fall back to the planned quantity.'
      : 'No output was recorded, so this is the planned quantity of what ran — not a weighbridge figure.';
  return (
    <Tooltip title={title}>
      <Chip
        size="small" label={label}
        sx={{
          height: 17, fontSize: 10, ml: 0.75,
          bgcolor: measured ? 'var(--c-success-50, transparent)' : 'var(--c-warning-50)',
          color: measured ? 'var(--c-text-2)' : 'var(--c-warning-800)',
        }}
      />
    </Tooltip>
  );
}

function Stat({ label, value, sub, hint }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; hint?: string;
}) {
  const body = (
    <Box sx={{ minWidth: 150 }}>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.25 }}>{label}</Typography>
      <Box sx={{ fontSize: 21, fontWeight: 600, fontFamily: 'var(--font-mono)', lineHeight: 1.15 }}>
        {value}
      </Box>
      {sub && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25 }}>{sub}</Box>}
    </Box>
  );
  return hint ? <Tooltip title={hint}><Box>{body}</Box></Tooltip> : body;
}

export default function MachinePerformance() {
  const { user } = useAuth();
  const hasTag = usePermission('fab_erp_shopfloor_analytics_view');
  const canView = isAdminRole(user?.role) || hasTag;

  const [days, setDays] = useState(30);
  const [fleet, setFleet] = useState<FleetRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Perf | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return { from: ymd(start), to: ymd(end) };
  }, [days]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getFleetPerformance(from, to);
      setFleet(res.machines ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load machine performance.'));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    getMachinePerformance(selected, from, to)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e) => { if (!cancelled) setError(backendMessage(e, 'Failed to load the machine.')); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected, from, to]);

  const columns: DataColumn<FleetRow>[] = useMemo(() => [
    {
      key: 'name', header: 'Machine', sortValue: (r) => r.name,
      render: (r) => <Box sx={{ fontWeight: 500 }}>{r.name}</Box>,
    },
    {
      key: 'util', header: 'Running', numeric: true, sortValue: (r) => r.utilisationPct ?? -1,
      render: (r) => (r.utilisationPct == null ? '—' : (
        <Box>
          <Mono>{r.utilisationPct.toFixed(1)}%</Mono>
          <Box sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
            {hrs(r.runningMinutes)} of {hrs(r.availableMinutes)}
          </Box>
        </Box>
      )),
    },
    {
      key: 'stopped', header: 'Stopped', numeric: true, sortValue: (r) => r.stoppageMinutes,
      render: (r) => <Mono>{hrs(r.stoppageMinutes)}</Mono>,
    },
    {
      key: 'unaccounted', header: 'Unaccounted', numeric: true, sortValue: (r) => r.unaccountedMinutes,
      render: (r) => (
        <Mono sx={{ color: r.unaccountedMinutes > 0 ? 'var(--c-warning-800)' : undefined }}>
          {hrs(r.unaccountedMinutes)}
        </Mono>
      ),
    },
    {
      key: 'tonnes', header: 'Output (t)', numeric: true, sortValue: (r) => r.tonnes,
      render: (r) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Mono>{t3(r.tonnes)}</Mono><SourceChip source={r.tonnesSource} />
        </Box>
      ),
    },
    {
      key: 'tph', header: 't/h running', numeric: true, sortValue: (r) => r.tonnesPerHour ?? -1,
      render: (r) => (r.tonnesPerHour == null ? '—' : (
        <Box>
          <Mono>{t3(r.tonnesPerHour)}</Mono>
          <Box sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>over {r.touchHours.toFixed(1)}h</Box>
        </Box>
      )),
    },
    {
      key: 'cv', header: 'Variation', numeric: true, sortValue: (r) => r.coefficientOfVariation ?? -1,
      render: (r) => {
        if (r.coefficientOfVariation == null) {
          return <Tooltip title={r.n === 1 ? 'One run — nothing to compare it against.' : 'No completed runs in this period.'}>
            <Box sx={{ color: 'var(--c-text-3)' }}>n={r.n}</Box>
          </Tooltip>;
        }
        return (
          <Tooltip title={`Coefficient of variation across ${r.n} run${r.n === 1 ? '' : 's'}${r.reliable ? '' : ' — provisional below 5'}`}>
            <Box>
              <Mono sx={{ opacity: r.reliable ? 1 : 0.55 }}>±{(r.coefficientOfVariation * 100).toFixed(0)}%</Mono>
              <Box sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
                n={r.n}{r.reliable ? '' : ' · provisional'}
              </Box>
            </Box>
          </Tooltip>
        );
      },
    },
  ], []);

  if (!canView) {
    return (
      <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
        <PageHeader title="Machine performance" subtitle="Time, output and throughput per machine" />
        <EmptyState title="You don't have analytics access" hint="The fab_erp_shopfloor_analytics_view permission is required." />
      </Box>
    );
  }

  const timeBars: BarDatum[] = detail ? [
    { key: 'run', label: 'Running', value: detail.timeUse.runningMinutes, display: hrs(detail.timeUse.runningMinutes), color: 'var(--c-state-running)' },
    ...detail.timeUse.stoppages.map((s) => ({
      key: s.code, label: s.label, value: s.minutes, display: hrs(s.minutes),
      color: 'var(--c-danger-500, #DC2626)',
    })),
    { key: 'gap', label: 'Unaccounted', value: detail.timeUse.unaccountedMinutes, display: hrs(detail.timeUse.unaccountedMinutes), color: 'var(--c-warning-600, #D97706)' },
  ].filter((b) => b.value > 0) : [];

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
      <PageHeader
        title="Machine performance"
        subtitle="Where each machine's time went, what came off it, and how fast it runs when it runs"
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

      {loading ? <ListSkeleton rows={6} /> : (
        <SectionCard
          title="Every machine"
          subtitle="Select a machine to see where its hours went and how each run performed"
          flush
        >
          <DataTable
            rows={fleet}
            columns={columns}
            getRowId={(r) => r.resourceId}
            onRowClick={(r) => setSelected(r.resourceId === selected ? null : r.resourceId)}
            storageKey="fab_erp_machine_perf"
            exportName={`Machine_performance_${from}_${to}`}
            defaultSortKey="tonnes"
            defaultSortDir="desc"
            empty={<EmptyState title="No machines" hint="Add machines under Setup → Resources." />}
          />
        </SectionCard>
      )}

      {selected && detailLoading && <Box sx={{ mt: 2 }}><ListSkeleton rows={4} /></Box>}

      {selected && !detailLoading && detail && (
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Surface e={1} sx={{ p: 2.5, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Stat
              label="Running"
              value={detail.timeUse.availableMinutes > 0
                ? `${((detail.timeUse.runningMinutes / detail.timeUse.availableMinutes) * 100).toFixed(1)}%`
                : '—'}
              sub={`${hrs(detail.timeUse.runningMinutes)} of ${hrs(detail.timeUse.availableMinutes)} on shift`}
              hint="Share of the machine's shift time that a job was actually on it."
            />
            <Stat
              label="Output"
              value={<Box sx={{ display: 'flex', alignItems: 'baseline' }}>
                {t3(detail.output.tonnes)}<Box component="span" sx={{ fontSize: 13, ml: 0.5 }}>t</Box>
                <SourceChip source={detail.output.tonnesSource} />
              </Box>}
              sub={`${detail.output.runs} run${detail.output.runs === 1 ? '' : 's'}${detail.output.runsMissingWeight > 0 ? ` · ${detail.output.runsMissingWeight} unweighed` : ''}`}
            />
            <Stat
              label="Throughput"
              value={<Box sx={{ display: 'flex', alignItems: 'baseline' }}>
                {t3(detail.throughput.overallTonnesPerHour)}
                <Box component="span" sx={{ fontSize: 13, ml: 0.5 }}>t/h</Box>
              </Box>}
              sub={`over ${detail.throughput.ratedTouchHours.toFixed(1)}h of running time · ${detail.throughput.n} run${detail.throughput.n === 1 ? '' : 's'}`}
              hint="Tonnes ÷ running hours, counting only runs that have both a weight and touch time, with non-working time and known stoppages removed."
            />
            <Stat
              label="Variation"
              value={detail.throughput.coefficientOfVariation == null
                ? '—'
                : `±${(detail.throughput.coefficientOfVariation * 100).toFixed(0)}%`}
              sub={detail.throughput.n === 0
                ? 'no completed runs'
                : `n=${detail.throughput.n}${detail.throughput.reliable ? '' : ' · provisional'}` +
                  (detail.throughput.p10 != null ? ` · ${t3(detail.throughput.p10)}–${t3(detail.throughput.p90)} t/h` : '')}
              hint="Spread of the per-run rate. Provisional below five runs — one run has no spread to measure."
            />
          </Surface>

          <SectionCard
            title="Where the time went"
            subtitle={`${detail.timeUse.shiftCount} shift${detail.timeUse.shiftCount === 1 ? '' : 's'} · times are ${detail.timezone}`}
          >
            <BarChart data={timeBars} labelWidth={190} emptyMessage="No shift time in this period." />
            {detail.timeUse.unaccountedMinutes > 0 && (
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1.5 }}>
                Unaccounted time is not a fault — it is time nobody has written up yet. Account for it in the Shift Log.
              </Typography>
            )}
          </SectionCard>

          <SectionCard
            title="Every run"
            subtitle="Touch time is the working time inside each run with known stoppages removed — an upper bound, so the rate is a lower one"
            flush
          >
            <DataTable
              rows={detail.runsDetail}
              columns={[
                { key: 'when', header: 'Completed', sortValue: (r) => r.completedAt,
                  render: (r) => <Mono sx={{ fontSize: 11.5 }}>{new Intl.DateTimeFormat('en-GB', { timeZone: detail.timezone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(r.completedAt))}</Mono> },
                { key: 'job', header: 'Job', sortValue: (r) => r.operationName ?? '',
                  render: (r) => (
                    <Box>
                      <Box sx={{ fontSize: 12.5 }}>{r.operationName ?? `Task #${r.taskId}`}</Box>
                      <Box sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
                        {[r.itemMark, r.itemName].filter(Boolean).join(' · ')}
                      </Box>
                    </Box>
                  ) },
                { key: 'elapsed', header: 'Elapsed', numeric: true, sortValue: (r) => r.elapsedMinutes,
                  render: (r) => <Mono>{hrs(r.elapsedMinutes)}</Mono> },
                { key: 'touch', header: 'Touch', numeric: true, sortValue: (r) => r.touchMinutes,
                  render: (r) => (
                    <Tooltip title={r.elapsedMinutes > r.touchMinutes
                      ? `${hrs(r.elapsedMinutes - r.touchMinutes)} removed — outside shift, or a recorded stoppage`
                      : 'Nothing to remove — the whole run was working time'}>
                      <Box><Mono>{hrs(r.touchMinutes)}</Mono></Box>
                    </Tooltip>
                  ) },
                { key: 'qty', header: 'Qty', numeric: true, sortValue: (r) => r.qty,
                  render: (r) => <Mono>{r.qty}</Mono> },
                { key: 'tonnes', header: 'Tonnes', numeric: true, sortValue: (r) => r.tonnes ?? -1,
                  render: (r) => (r.tonnes == null
                    ? <Tooltip title="This item has no unit weight, so it cannot be counted toward tonnage."><Box sx={{ color: 'var(--c-text-3)' }}>no weight</Box></Tooltip>
                    : <Mono>{t3(r.tonnes)}</Mono>) },
                { key: 'tph', header: 't/h', numeric: true, sortValue: (r) => r.tonnesPerHour ?? -1,
                  render: (r) => <Mono>{t3(r.tonnesPerHour)}</Mono> },
              ]}
              getRowId={(r) => r.taskId}
              storageKey="fab_erp_machine_perf_runs"
              exportName={`${detail.resourceName}_runs_${from}_${to}`}
              defaultSortKey="when"
              defaultSortDir="desc"
              pageSize={25}
              empty={<EmptyState title="No completed runs" hint="Nothing finished on this machine in the period." />}
            />
          </SectionCard>
        </Box>
      )}
    </Box>
  );
}
