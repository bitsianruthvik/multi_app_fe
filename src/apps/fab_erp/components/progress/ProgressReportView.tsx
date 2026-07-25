/**
 * ProgressReportView.tsx — Project Progress view (2026-07-24).
 *
 * Portfolio of active projects, each an expandable row with an overall %-bar.
 * Expanding a row fetches its per-stage breakdown (GET /tasks/progress?orderId=)
 * against its resolved progress template, and a <BomDrillPicker> lets you re-scope
 * the breakdown to any BOM subtree. The stage columns come from the template, so
 * they stay fixed as you drill; only the counts change.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, LinearProgress, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';

import { fabGet } from '../../api/client';
import { Surface, EmptyState } from '../index';
import BomDrillPicker, { type BomDrillPickerValue } from '../taskgraph/BomDrillPicker';

interface PortfolioOrder {
  orderId: number;
  orderNumber: string;
  orderType: string;
  status: string;
  customerName: string | null;
  progressPct: number;
  total: number;
  done: number;
  templateId: number | null;
  templateName: string | null;
}
interface Stage { stageId: number | string; name: string; seqNo: number; total: number; done: number; pct: number }
interface BreakdownResponse { ok: boolean; orderId: number; templateId: number | null; templateName: string | null; stages: Stage[] }

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

function OverallBar({ pct }: { pct: number }) {
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <LinearProgress
        variant="determinate"
        value={v}
        sx={{
          flex: 1, maxWidth: 340, height: 6, borderRadius: 3,
          bgcolor: 'var(--c-surface-3, rgba(120,120,140,0.18))',
          '& .MuiLinearProgress-bar': { backgroundColor: v >= 100 ? 'var(--c-success, #2e7d32)' : 'var(--c-accent, #6b5cff)' },
        }}
      />
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flexShrink: 0, minWidth: 30 }}>{v}%</Typography>
    </Box>
  );
}

function StageBar({ stage }: { stage: Stage }) {
  const v = Math.min(100, Math.max(0, Math.round(stage.pct)));
  const unmapped = stage.stageId === 'other';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
      <Typography sx={{ fontSize: 12.5, width: 150, flexShrink: 0, color: unmapped ? 'var(--c-text-3)' : 'var(--c-text)', fontStyle: unmapped ? 'italic' : 'normal' }}>
        {stage.name}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={v}
        sx={{
          flex: 1, height: 8, borderRadius: 4,
          bgcolor: 'var(--c-surface-3, rgba(120,120,140,0.18))',
          '& .MuiLinearProgress-bar': { backgroundColor: v >= 100 ? 'var(--c-success, #2e7d32)' : 'var(--c-accent, #6b5cff)' },
        }}
      />
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', width: 84, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {stage.done}/{stage.total} · {v}%
      </Typography>
    </Box>
  );
}

function ProgressOrderRow({ order }: { order: PortfolioOrder }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [breakdown, setBreakdown] = useState<BreakdownResponse | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<BomDrillPickerValue>({ itemId: null, scope: 'subtree' });

  const fetchBreakdown = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabGet<BreakdownResponse>('tasks/progress', {
        orderId: order.orderId,
        scope: filter.scope,
        itemId: filter.itemId ?? undefined,
      });
      setBreakdown(res);
    } catch (e) {
      setErr(errMsg(e, 'Failed to load progress breakdown.'));
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  }, [order.orderId, filter]);

  useEffect(() => { if (expanded) fetchBreakdown(); }, [expanded, fetchBreakdown]);

  return (
    <Surface e={1} sx={{ mb: 1.5, overflow: 'hidden' }}>
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'var(--c-surface-2)' } }}
      >
        {expanded ? <ExpandMoreRounded sx={{ color: 'var(--c-text-3)' }} /> : <ChevronRightRounded sx={{ color: 'var(--c-text-3)' }} />}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>{order.orderNumber}</Typography>
            {order.customerName && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>· {order.customerName}</Typography>}
            <Chip size="small" label={order.status.replace(/_/g, ' ')} sx={{ height: 18, fontSize: 10.5 }} />
            {order.templateName
              ? <Chip size="small" variant="outlined" label={order.templateName} sx={{ height: 18, fontSize: 10.5 }} />
              : <Chip size="small" variant="outlined" color="warning" label="no template" sx={{ height: 18, fontSize: 10.5 }} />}
          </Box>
          <Box sx={{ mt: 0.75 }}><OverallBar pct={order.progressPct} /></Box>
        </Box>
      </Box>

      {expanded && (
        <Box sx={{ p: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
          <Box sx={{ mb: 1.5 }}>
            <BomDrillPicker orderId={order.orderId} value={filter} onChange={setFilter} />
          </Box>
          {err && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErr('')}>{err}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={22} /></Box>
          ) : !breakdown || !breakdown.templateId ? (
            <Typography sx={{ color: 'var(--c-text-3)', textAlign: 'center', p: 2, fontSize: 13 }}>
              No progress template resolves for this project — assign one (by finished-good category or directly) to see a per-stage breakdown.
            </Typography>
          ) : breakdown.stages.length === 0 ? (
            <Typography sx={{ color: 'var(--c-text-3)', textAlign: 'center', p: 2, fontSize: 13 }}>
              {filter.itemId ? 'No tasks for the selected item.' : 'No tasks in scope.'}
            </Typography>
          ) : (
            <Box>{breakdown.stages.map((s) => <StageBar key={String(s.stageId)} stage={s} />)}</Box>
          )}
        </Box>
      )}
    </Surface>
  );
}

export default function ProgressReportView() {
  const [orders, setOrders] = useState<PortfolioOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabGet<{ ok: boolean; orders: PortfolioOrder[] }>('tasks/progress');
      setOrders(res.orders ?? []);
    } catch (e) {
      setError(errMsg(e, 'Failed to load project progress.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>;
  if (error) return <Alert severity="error" onClose={() => setError('')}>{error}</Alert>;
  if (orders.length === 0) return <EmptyState title="No active projects" hint="Projects appear here once their tasks are materialized and there is open work remaining." />;
  return <Box>{orders.map((o) => <ProgressOrderRow key={o.orderId} order={o} />)}</Box>;
}
