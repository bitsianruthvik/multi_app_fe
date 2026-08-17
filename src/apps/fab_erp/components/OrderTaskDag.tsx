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
 * `orderId` is fixed by the surrounding route/tab context. The view is read-only:
 * the "Materialize tasks" button was removed 2026-08-15 because raising the
 * production order builds the tree in the same transaction, and building it
 * early froze every estimate against parameters nobody had entered yet.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Typography,
} from '@mui/material';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import AutorenewRounded from '@mui/icons-material/AutorenewRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import { fabGet, fabPost } from '../api/client';
import { Surface, useToast } from '../components';
import TaskFlowGraph from './taskgraph/TaskFlowGraph';
import BomDrillPicker, { type BomDrillPickerValue } from './taskgraph/BomDrillPicker';
import type { TaskGraphNode, TaskGraphEdge } from './taskgraph/types';
import { DialogCloseButton } from './FormDialog';

interface GraphResponse {
  ok: boolean;
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
}

// FEAT-07: re-materialization preview shape (mirrors rematerializeService).
interface RematStep { taskId?: number; seqNo: number; operationName: string | null; status?: string; changes?: string[]; retained?: boolean }
interface RematItem {
  itemId: number; itemName: string; flowName: string | null;
  added: RematStep[]; removed: RematStep[]; changed: RematStep[];
}
interface RematPreview {
  ok: boolean;
  summary: { itemsAffected: number; added: number; removed: number; changed: number; retainedStarted: number };
  items: RematItem[];
}

/**
 * POST /tasks/materialize (mirrors taskGatingService.materializeTasks).
 *
 * `itemsSkipped` is the field that matters and the one that used to be thrown
 * away: an item with no operation flow generates no tasks at all. Since new
 * items default to no flow and the Excel importer downgrades an unrecognised
 * flow name to a warning, partial coverage is the normal case, not the rare
 * one — so a bare "Tasks materialized" reads as complete success over a
 * half-built DAG, and the critical chain is then computed over the wrong scope.
 */
export interface MaterializeResponse {
  ok: boolean;
  /** Items that had a flow and produced at least one task. */
  itemsProcessed: number;
  /** Items that produced nothing because they have no operation flow. */
  itemsSkipped: number;
  tasksInserted: number;
  /** Unstarted tasks deleted before the rebuild. Absent when the order had no items. */
  cleared?: number;
}

/**
 * Shared outcome panel for a materialize run, rendered in-page rather than as
 * a toast on purpose: the skipped-item count is exactly the thing a 2.6s
 * auto-dismissing toast loses, and it is also the only warning a planner gets
 * that part of the order will never be scheduled, built, or dispatched.
 * Used from both the Task DAG tab and the Items / BOM tree.
 */
export function MaterializeOutcome({ result, onClose }: {
  result: MaterializeResponse;
  onClose: () => void;
}) {
  const skipped = result.itemsSkipped;
  return (
    <Alert severity={skipped > 0 ? 'warning' : 'success'} sx={{ mb: 2 }} onClose={onClose}>
      <AlertTitle sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>
        {result.tasksInserted} task(s) built from {result.itemsProcessed} item(s)
        {skipped > 0 ? `— ${skipped} item(s) produced none` : ''}
      </AlertTitle>
      {skipped > 0 && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          Those {skipped} item(s) have no operation flow, so nothing was generated for them. They
          will not be scheduled, will not be built, and are invisible to Dispatch and the Task
          Queue. Set a flow in the <strong>Flow</strong> column of the Items / BOM tree, then build
          tasks again.
        </Typography>
      )}
      {!!result.cleared && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: skipped > 0 ? 0.75 : 0 }}>
          {result.cleared} previously generated unstarted task(s) were replaced.
        </Typography>
      )}
    </Alert>
  );
}

export default function OrderTaskDag({ orderId, canManage }: { orderId: number; canManage?: boolean }) {
  const { toast } = useToast();

  const [loadingGraph, setLoadingGraph] = useState(true);
  // Retained only as a disabled-guard for the re-generate buttons.
  const [materializing] = useState(false);
  const [error, setError] = useState('');
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [filter, setFilter] = useState<BomDrillPickerValue>({ itemId: null, scope: 'subtree' });
  const [materializeResult, setMaterializeResult] = useState<MaterializeResponse | null>(null);

  // FEAT-07: re-generate (preview → apply) state.
  const [preview, setPreview] = useState<RematPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

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

  // materialize() removed 2026-08-15 — raising the production order is the only
  // trigger. setMaterializing is kept: re-materialize below still uses it.

  // FEAT-07: fetch the diff and open the confirmation dialog.
  async function openRegenerate() {
    setPreviewing(true);
    setError('');
    try {
      const res = await fabPost<RematPreview>('tasks/rematerialize/preview', { orderId });
      setPreview(res);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to compute re-generation preview.';
      setError(msg);
      toast(msg, 'error');
    } finally {
      setPreviewing(false);
    }
  }

  // FEAT-07: apply the re-generation, then refresh the graph.
  async function applyRegenerate() {
    setApplying(true);
    try {
      const res = await fabPost<{ deletedUnstarted: number; rebuilt: { tasksInserted: number } }>('tasks/rematerialize', { orderId });
      toast(`Re-generated — ${res.rebuilt?.tasksInserted ?? 0} task(s) rebuilt, ${res.deletedUnstarted ?? 0} unstarted replaced.`, 'success');
      setPreview(null);
      // A re-generation supersedes whatever the last materialize run reported;
      // leaving that panel up would describe a DAG that no longer exists.
      setMaterializeResult(null);
      await fetchGraph();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      const msg = ax.response?.data?.message ?? ax.message ?? 'Failed to re-generate tasks.';
      toast(msg, 'error');
    } finally {
      setApplying(false);
    }
  }

  const hasChanges = !!preview && (preview.summary.added + preview.summary.removed + preview.summary.changed) > 0;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {materializeResult && (
        <MaterializeOutcome result={materializeResult} onClose={() => setMaterializeResult(null)} />
      )}

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
            {/* "Materialize tasks" REMOVED 2026-08-15.
                Raising the production order already builds the DAG in the same
                transaction — `ensureProductionOrder` calls materializeOrderTasks
                — so this button let the tree be built BEFORE the order that is
                supposed to own it existed, and before the Parameters step had
                been done. Materialization is where every formula is evaluated
                and frozen, so building early froze estimates computed from
                values nobody had entered yet. One trigger now: the Production
                step. Re-materialize (below) is unaffected — that is a deliberate
                correction of an existing tree, not a way to create one. */}
            {canManage !== false && (graph?.nodes.length ?? 0) > 0 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={previewing ? <CircularProgress size={14} color="inherit" /> : <AutorenewRounded fontSize="small" />}
                disabled={previewing || materializing}
                onClick={openRegenerate}
              >
                Re-generate
              </Button>
            )}
          </Box>
        </Box>
      </Surface>

      {/* FEAT-07: re-generation diff/preview + confirm. */}
      <Dialog open={!!preview} onClose={applying ? undefined : () => setPreview(null)} maxWidth="sm" fullWidth>
      <DialogCloseButton absolute onClose={() => (() => setPreview(null))()} disabled={applying} />
        <DialogTitle>Re-generate task DAG</DialogTitle>
        <DialogContent dividers>
          {!hasChanges ? (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
              The task DAG already matches the current flow definitions — nothing to re-generate.
            </Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
                <Chip size="small" color="success" variant="outlined" label={`${preview!.summary.added} added`} />
                <Chip size="small" color="error" variant="outlined" label={`${preview!.summary.removed} removed`} />
                <Chip size="small" color="warning" variant="outlined" label={`${preview!.summary.changed} changed`} />
              </Box>
              {preview!.summary.retainedStarted > 0 && (
                <Alert severity="info" icon={<WarningAmberRounded fontSize="inherit" />} sx={{ mb: 1.5 }}>
                  {preview!.summary.retainedStarted} affected task(s) are already started or done — they’ll be
                  kept as-is (their flow change won’t take effect until they’re re-run). Only unstarted tasks are rebuilt.
                </Alert>
              )}
              {preview!.items.map((it) => (
                <Box key={it.itemId} sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                    {it.itemName}{it.flowName ? ` · ${it.flowName}` : ''}
                  </Typography>
                  <Divider sx={{ my: 0.5 }} />
                  {it.added.map((s, i) => (
                    <Typography key={`a${i}`} sx={{ fontSize: 12.5, color: 'var(--c-success-600)' }}>
                      + add · seq {s.seqNo} · {s.operationName ?? '—'}
                    </Typography>
                  ))}
                  {it.removed.map((s, i) => (
                    <Typography key={`r${i}`} sx={{ fontSize: 12.5, color: 'var(--c-danger-600)' }}>
                      − remove · seq {s.seqNo} · {s.operationName ?? '—'}{s.retained ? ' (started — kept)' : ''}
                    </Typography>
                  ))}
                  {it.changed.map((s, i) => (
                    <Typography key={`c${i}`} sx={{ fontSize: 12.5, color: 'var(--c-warning-600)' }}>
                      ~ change · seq {s.seqNo} · {s.operationName ?? '—'} · {(s.changes ?? []).join(', ')}
                      {s.retained ? ' (started — kept)' : ''}
                    </Typography>
                  ))}
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)} disabled={applying}>Cancel</Button>
          <Button
            onClick={applyRegenerate}
            variant="contained"
            disabled={applying || !hasChanges}
          >
            {applying ? <CircularProgress size={18} /> : 'Apply re-generation'}
          </Button>
        </DialogActions>
      </Dialog>

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
