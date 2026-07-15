/**
 * OrderTaskDag.tsx — EU-6: whole-order task-DAG viewer, embedded as a tab in
 * SalesOrderDetail.tsx.
 *
 * Extracted from pages/ProjectDag.tsx (EU-11's standalone project-DAG page).
 * The project picker from that page is intentionally NOT carried over here —
 * `orderId` is fixed by the surrounding route/tab context, so there is
 * nothing to select. This component fetches GET /tasks/graph?orderId=<id>
 * directly on mount/prop-change and renders every task the route returns
 * (across all of the order's top-level items) as one graph.
 *
 * Layout logic (dependency-depth columns + SVG line overlay) and the
 * status color legend are unchanged from ProjectDag.tsx.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import BuildCircleRounded from '@mui/icons-material/BuildCircleRounded';

import { fabGet, fabPost } from '../api/client';
import { Surface, useToast } from '../components';

type TaskStatus = 'blocked' | 'eligible' | 'in_progress' | 'paused' | 'done' | 'cancelled';

interface DagNode {
  id: number;
  operationId: number | null;
  operationName: string | null;
  itemId: number;
  itemName: string | null;
  flowId: number;
  seqNo: number;
  status: TaskStatus;
  dependsOn: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  computedHours: number | null;
}

interface DagEdge {
  from: number;
  to: number;
}

interface GraphResponse {
  ok: boolean;
  orderId?: number;
  orderNumber?: string;
  nodes: DagNode[];
  edges: DagEdge[];
}

/**
 * Status -> color mapping, per exact spec (unchanged from ProjectDag.tsx):
 *   blocked -> grey, eligible (not yet started) -> red,
 *   in_progress -> yellow, done -> light green.
 * `paused` and `cancelled` are not covered by the spec's four buckets — same
 * deliberate call as ProjectDag.tsx is kept here:
 *   paused    -> amber/orange, cancelled -> dark slate w/ strikethrough label.
 */
const STATUS_COLOR: Record<TaskStatus, string> = {
  eligible: '#ef4444',
  blocked: '#9ca3af',
  in_progress: '#eab308',
  done: '#86efac',
  paused: '#f97316',
  cancelled: '#475569',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  eligible: 'Not yet started',
  blocked: 'Blocked',
  in_progress: 'In progress',
  done: 'Done',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const NODE_W = 200;
const NODE_H = 68;
const COL_GAP = 64;
const ROW_GAP = 18;

interface LayoutNode extends DagNode {
  x: number;
  y: number;
  depth: number;
}

function layoutNodes(nodes: DagNode[], edges: DagEdge[]): { laid: LayoutNode[]; width: number; height: number } {
  const predecessorsOf = new Map<number, number[]>();
  for (const e of edges) {
    if (!predecessorsOf.has(e.to)) predecessorsOf.set(e.to, []);
    predecessorsOf.get(e.to)!.push(e.from);
  }

  const depthById = new Map<number, number>();
  const visiting = new Set<number>();

  function depthOf(id: number): number {
    const cached = depthById.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // cycle guard — should not happen, but never hang the UI
    visiting.add(id);
    const preds = predecessorsOf.get(id) ?? [];
    const d = preds.length === 0 ? 0 : 1 + Math.max(...preds.map((p) => depthOf(p)));
    visiting.delete(id);
    depthById.set(id, d);
    return d;
  }

  for (const n of nodes) depthOf(n.id);

  const byDepth = new Map<number, DagNode[]>();
  for (const n of nodes) {
    const d = depthById.get(n.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(n);
  }

  const maxDepth = Math.max(0, ...[...byDepth.keys()]);
  const laid: LayoutNode[] = [];
  let maxRows = 1;

  for (let d = 0; d <= maxDepth; d++) {
    const col = (byDepth.get(d) ?? []).slice().sort((a, b) => (a.itemId - b.itemId) || (a.seqNo - b.seqNo));
    maxRows = Math.max(maxRows, col.length);
    col.forEach((n, i) => {
      laid.push({ ...n, depth: d, x: d * (NODE_W + COL_GAP), y: i * (NODE_H + ROW_GAP) });
    });
  }

  const width = (maxDepth + 1) * NODE_W + maxDepth * COL_GAP;
  const height = maxRows * NODE_H + Math.max(0, maxRows - 1) * ROW_GAP;

  return { laid, width, height };
}

export default function OrderTaskDag({ orderId, canManage }: { orderId: number; canManage?: boolean }) {
  const { toast } = useToast();

  const [loadingGraph, setLoadingGraph] = useState(true);
  const [materializing, setMaterializing] = useState(false);
  const [error, setError] = useState('');
  const [graph, setGraph] = useState<GraphResponse | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoadingGraph(true);
    setError('');
    try {
      const res = await fabGet<GraphResponse>('tasks/graph', { orderId });
      setGraph(res);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to load task graph.';
      setError(msg);
      toast(msg, 'error');
      setGraph(null);
    } finally {
      setLoadingGraph(false);
    }
  }, [orderId, toast]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  async function materialize() {
    setMaterializing(true);
    setError('');
    try {
      await fabPost('tasks/materialize', { orderId });
      toast('Tasks materialized');
      await fetchGraph();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to materialize tasks.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setMaterializing(false);
    }
  }

  const { laid, width, height } = useMemo(
    () => (graph ? layoutNodes(graph.nodes, graph.edges) : { laid: [], width: 0, height: 0 }),
    [graph],
  );

  const posById = useMemo(() => new Map(laid.map((n) => [n.id, n])), [laid]);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {(Object.keys(STATUS_COLOR) as TaskStatus[]).map((s) => (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '3px', background: STATUS_COLOR[s], border: '1px solid rgba(0,0,0,.15)' }} />
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{STATUS_LABEL[s]}</Typography>
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<RefreshRounded fontSize="small" />}
              onClick={fetchGraph}
              disabled={loadingGraph}
            >
              Refresh
            </Button>
            {canManage !== false && (
              <Button
                size="small"
                variant="contained"
                startIcon={materializing ? <CircularProgress size={14} color="inherit" /> : <BuildCircleRounded fontSize="small" />}
                disabled={materializing}
                onClick={materialize}
              >
                Materialize tasks
              </Button>
            )}
          </Box>
        </Box>
      </Surface>

      {loadingGraph && (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Surface>
      )}

      {!loadingGraph && graph && graph.nodes.length === 0 && (
        <Surface e={1} sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--c-text-3)' }}>
            No tasks have been materialized for this order yet.
          </Typography>
        </Surface>
      )}

      {!loadingGraph && graph && graph.nodes.length > 0 && (
        <Surface e={1} sx={{ p: 2.5, overflow: 'auto' }}>
          <Box sx={{ position: 'relative', width: Math.max(width, 400), height: Math.max(height, 100) }}>
            <svg
              width={width}
              height={height}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
            >
              {graph.edges.map((e, i) => {
                const from = posById.get(e.from);
                const to = posById.get(e.to);
                if (!from || !to) return null;
                const x1 = from.x + NODE_W;
                const y1 = from.y + NODE_H / 2;
                const x2 = to.x;
                const y2 = to.y + NODE_H / 2;
                const midX = (x1 + x2) / 2;
                return (
                  <path
                    key={`${e.from}-${e.to}-${i}`}
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="var(--c-border, #cbd5e1)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </svg>

            {laid.map((n) => {
              const color = STATUS_COLOR[n.status] ?? '#9ca3af';
              return (
                <Box
                  key={n.id}
                  sx={{
                    position: 'absolute',
                    left: n.x,
                    top: n.y,
                    width: NODE_W,
                    height: NODE_H,
                    borderRadius: 'var(--r-md, 8px)',
                    border: `2px solid ${color}`,
                    background: 'var(--c-surface)',
                    boxShadow: 'var(--e-1)',
                    p: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 0.25,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <Typography
                      sx={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: 'var(--c-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textDecoration: n.status === 'cancelled' ? 'line-through' : 'none',
                      }}
                      title={n.operationName ?? `Operation #${n.operationId ?? ''}`}
                    >
                      {n.operationName ?? `Op #${n.operationId ?? '?'}`}
                    </Typography>
                  </Box>
                  <Typography
                    sx={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={n.itemName ?? `Item #${n.itemId}`}
                  >
                    {n.itemName ?? `Item #${n.itemId}`} · seq {n.seqNo}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
                    {STATUS_LABEL[n.status] ?? n.status}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Surface>
      )}
    </Box>
  );
}
