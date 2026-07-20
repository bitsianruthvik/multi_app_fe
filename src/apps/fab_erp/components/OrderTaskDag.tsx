/**
 * OrderTaskDag.tsx — EU-6 / EU-5: whole-order task-DAG viewer, embedded as a tab
 * in SalesOrderDetail.tsx.
 *
 * Rewritten (2026-07-20) to render via the shared React Flow renderer
 * <TaskFlowGraph> (collapsible per-part swimlanes, cross-BOM component edges,
 * zoom/pan/minimap) instead of the old hand-rolled SVG, and to add a
 * <BomDrillPicker> that filters the graph to an item subtree (or that item
 * alone) via the GET /tasks/graph `itemId` / `scope` params.
 *
 * `orderId` is fixed by the surrounding route/tab context. The "Materialize
 * tasks" action and the read-only nature of the view are unchanged.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import BuildCircleRounded from '@mui/icons-material/BuildCircleRounded';

import { fabGet, fabPost } from '../api/client';
import { Surface, useToast } from '../components';
import TaskFlowGraph from './taskgraph/TaskFlowGraph';
import BomDrillPicker, { type BomDrillPickerValue } from './taskgraph/BomDrillPicker';
import type { TaskGraphNode, TaskGraphEdge } from './taskgraph/types';

interface GraphResponse {
  ok: boolean;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
}

export default function OrderTaskDag({ orderId, canManage }: { orderId: number; canManage?: boolean }) {
  const { toast } = useToast();

  const [loadingGraph, setLoadingGraph] = useState(true);
  const [materializing, setMaterializing] = useState(false);
  const [error, setError] = useState('');
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [filter, setFilter] = useState<BomDrillPickerValue>({ itemId: null, scope: 'subtree' });

  const fetchGraph = useCallback(async () => {
    setLoadingGraph(true);
    setError('');
    try {
      const res = await fabGet<GraphResponse>('tasks/graph', {
        orderId,
        scope: filter.scope,
        itemId: filter.itemId ?? undefined,
      });
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
  }, [orderId, filter, toast]);

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

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <BomDrillPicker orderId={orderId} value={filter} onChange={setFilter} />

          <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
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
            {filter.itemId
              ? 'No tasks for the selected item.'
              : 'No tasks have been materialized for this order yet.'}
          </Typography>
        </Surface>
      )}

      {!loadingGraph && graph && graph.nodes.length > 0 && (
        <TaskFlowGraph nodes={graph.nodes} edges={graph.edges} />
      )}
    </Box>
  );
}
