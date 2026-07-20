/**
 * TaskEngine.tsx — EU-6: global Task Engine landing.
 *
 * Lists every ACTIVE order (from GET /tasks/overview) as a collapsed row with a
 * task-status rollup + progress bar. Expanding a row lazily fetches that order's
 * full task graph (GET /tasks/graph) and renders it via the shared
 * <TaskFlowGraph> (parts collapsed by default). A <BomDrillPicker> lets the user
 * focus a sub-BOM of the expanded order. Read-only.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, LinearProgress, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';

import { fabGet } from '../api/client';
import { PageHeader, Surface, EmptyState, useToast } from '../components';
import TaskFlowGraph from '../components/taskgraph/TaskFlowGraph';
import BomDrillPicker, { type BomDrillPickerValue } from '../components/taskgraph/BomDrillPicker';
import { STATUS_COLOR, type TaskGraphNode, type TaskGraphEdge } from '../components/taskgraph/types';

interface OrderCounts {
  total: number;
  done: number;
  in_progress: number;
  not_started: number;
  paused: number;
}
interface OverviewOrder {
  orderId: number;
  orderNumber: string;
  counts: OrderCounts;
}
interface OverviewResponse {
  ok: boolean;
  orders: OverviewOrder[];
}
interface GraphResponse {
  ok: boolean;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
}

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

function CountPill({ color, label, value }: { color: string; label: string; value: number }) {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} title={label}>
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{value}</Typography>
    </Box>
  );
}

function OrderRow({ order }: { order: OverviewOrder }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<BomDrillPickerValue>({ itemId: null, scope: 'subtree' });

  const fetchGraph = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabGet<GraphResponse>('tasks/graph', {
        orderId: order.orderId,
        scope: filter.scope,
        itemId: filter.itemId ?? undefined,
      });
      setGraph(res);
    } catch (e) {
      setErr(errMsg(e, 'Failed to load task graph.'));
      setGraph(null);
    } finally {
      setLoading(false);
    }
  }, [order.orderId, filter]);

  useEffect(() => { if (expanded) fetchGraph(); }, [expanded, fetchGraph]);

  const c = order.counts;
  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;

  return (
    <Surface e={1} sx={{ mb: 1.5, overflow: 'hidden' }}>
      <Box
        onClick={() => setExpanded((v) => !v)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'var(--c-surface-2)' } }}
      >
        {expanded ? <ExpandMoreRounded sx={{ color: 'var(--c-text-3)' }} /> : <ChevronRightRounded sx={{ color: 'var(--c-text-3)' }} />}

        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>{order.orderNumber}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.75 }}>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{ flex: 1, maxWidth: 320, height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { backgroundColor: STATUS_COLOR.done } }}
            />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flexShrink: 0 }}>{pct}%</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.25, flexShrink: 0, alignItems: 'center' }}>
          <CountPill color={STATUS_COLOR.done} label="Done" value={c.done} />
          <CountPill color={STATUS_COLOR.in_progress} label="In progress" value={c.in_progress} />
          <CountPill color={STATUS_COLOR.eligible} label="Not started" value={c.not_started} />
          <CountPill color={STATUS_COLOR.paused} label="Paused" value={c.paused} />
        </Box>
      </Box>

      {expanded && (
        <Box sx={{ p: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)' }}>
          <Box sx={{ mb: 1.5 }}>
            <BomDrillPicker orderId={order.orderId} value={filter} onChange={setFilter} />
          </Box>
          {err && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErr('')}>{err}</Alert>}
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>
          ) : graph && graph.nodes.length > 0 ? (
            <TaskFlowGraph nodes={graph.nodes} edges={graph.edges} height={560} />
          ) : (
            <Typography sx={{ color: 'var(--c-text-3)', textAlign: 'center', p: 3 }}>
              {filter.itemId ? 'No tasks for the selected item.' : 'No tasks to display for this order.'}
            </Typography>
          )}
        </Box>
      )}
    </Surface>
  );
}

export default function TaskEngine() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<OverviewOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabGet<OverviewResponse>('tasks/overview');
      setOrders(res.orders ?? []);
    } catch (e) {
      const msg = errMsg(e, 'Failed to load task overview.');
      setError(msg);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        title="Task Engine"
        subtitle="Live task graph across all active orders — expand an order to trace its build, drill into any sub-assembly."
        actions={
          <Button size="small" startIcon={<RefreshRounded fontSize="small" />} onClick={load} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
      ) : orders.length === 0 ? (
        <EmptyState title="No active orders" hint="Orders appear here once their tasks are materialized and there is open work remaining." />
      ) : (
        orders.map((o) => <OrderRow key={o.orderId} order={o} />)
      )}
    </Box>
  );
}
