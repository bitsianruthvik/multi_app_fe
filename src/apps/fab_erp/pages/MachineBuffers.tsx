/**
 * MachineBuffers — how full each machine's input buffer is, over a date range.
 *
 * One of the three analytics the spec asks for (the others being project
 * progress by pipeline, and critical chain / time buffers per project).
 *
 * This is the trimmed remainder of ShopfloorAnalytics, which also carried a
 * constraint headline, machine utilisation with a time-in-state heatstrip, a
 * wait Pareto and a per-project touch-vs-wait breakdown. None of those were
 * asked for, and three of them were the only consumers of
 * /analytics/constraint, /analytics/wait-pareto and /analytics/project/:orderId,
 * which are removed with them.
 *
 * Reads GET /analytics/machines, which is kept because it is the only place
 * inputBufferPct is computed -- it derives from fab_buffer_level_snapshots
 * rather than from live buffer contents, so this screen shows the trend the
 * Machine Board's live gauges cannot.
 *
 * NOTE for Phase 4: buffer load is being re-pointed from fab_buffer_contents to
 * fab_stock_pieces. The snapshot table this screen reads is written by
 * placeOutput/moveContent, both of which that phase deletes -- so the new path
 * must keep calling snapshot() or this screen quietly freezes at its last value.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import { getAnalyticsMachines, type AnalyticsMachine } from '../api/client';
import { PageHeader, Surface, EmptyState, ChartSkeleton } from '../components';

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Matches the Machine Board's gauge thresholds so the two screens agree. */
function fillFor(pct: number): string {
  if (pct >= 90) return 'var(--c-danger-800)';
  if (pct >= 70) return 'var(--c-warning-800)';
  return 'var(--c-primary-400)';
}

function BufferRow({ m }: { m: AnalyticsMachine }) {
  const pct = m.inputBufferPct;

  return (
    <Surface e={1} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>{m.name}</Typography>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--c-text-2)' }}>
          {pct == null ? '—' : `${Math.round(pct)}%`}
        </Typography>
      </Box>

      {pct == null ? (
        // Not the same as an empty buffer, and saying "0%" here would be a lie:
        // it means no buffer is configured on this machine at all.
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          No input buffer configured
        </Typography>
      ) : (
        <Box sx={{ height: 8, borderRadius: 4, background: 'var(--c-border)', overflow: 'hidden' }}
          role="img" aria-label={`${m.name} input buffer ${Math.round(pct)}% full`}>
          <Box sx={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: fillFor(pct) }} />
        </Box>
      )}
    </Surface>
  );
}

export default function MachineBuffers() {
  const defaults = useMemo(() => {
    const now = new Date();
    return { from: ymd(new Date(now.getTime() - 30 * 86400000)), to: ymd(now) };
  }, []);

  const [machines, setMachines] = useState<AnalyticsMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAnalyticsMachines({ from: defaults.from, to: defaults.to });
      setMachines(res.machines ?? []);
    } catch (e) {
      setError(errMsg(e, 'Failed to load machine buffers.'));
    } finally {
      setLoading(false);
    }
  }, [defaults]);

  useEffect(() => { void load(); }, [load]);

  // Fullest first — a buffer at 95% is the thing worth looking at, and machines
  // with no buffer configured sort last rather than reading as empty.
  const sorted = useMemo(
    () => [...machines].sort((a, b) => (b.inputBufferPct ?? -1) - (a.inputBufferPct ?? -1)),
    [machines],
  );

  const configured = sorted.filter((m) => m.inputBufferPct != null).length;

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <PageHeader
        title="Machine buffers"
        subtitle="How full each machine's input buffer is — where WIP is piling up in front of the work."
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ChartSkeleton />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<PrecisionManufacturingRounded />}
          title="No machines"
          hint="Add resources in Setup to see their buffers here."
        />
      ) : (
        <>
          {configured === 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              No machine has an input buffer configured yet, so there is nothing to measure.
              Set capacities under Setup → Buffers.
            </Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1.5 }}>
            {sorted.map((m) => <BufferRow key={m.resourceId} m={m} />)}
          </Box>
        </>
      )}
    </Box>
  );
}
