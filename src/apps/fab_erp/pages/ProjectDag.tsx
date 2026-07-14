/**
 * ProjectDag.tsx — EU-11: project task-DAG viewer.
 *
 * Project picker + node-link rendering of GET /tasks/graph?projectId=.
 *
 * Project picker note: resourceDef.json has NO top-level `fabErpProject`
 * resource (fab_projects only appears as a JOIN target, e.g. aliases
 * `fproj_fi` / `fproj_pt` — searched the whole file, confirmed). The closest
 * queryable resource carrying project identity is `fabErpProjectTask`
 * (table fab_project_tasks), which exposes `projectId` / `projectName` /
 * `projectCode` fields. The picker below queries that resource and
 * client-side de-dupes rows into a distinct project list. This only surfaces
 * projects that already have materialized tasks — acceptable here since a
 * project with zero fab_project_tasks rows has an empty DAG anyway.
 *
 * Layout: no graph library in fab_erp (and none is being added here) — nodes
 * are grouped into columns by dependency depth (depth 0 = no predecessors,
 * depth N = 1 + max(depth of predecessors)) and laid out as absolutely
 * positioned boxes with an SVG line overlay connecting dependent nodes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Autocomplete, Box, CircularProgress, TextField, Typography } from '@mui/material';

import { fabQuery, fabGet } from '../api/client';
import { PageHeader, Surface, useToast } from '../components';

interface QueryResult<T> { data: T[]; total?: number }

interface ProjectTaskRow {
  projectId: number;
  projectName: string | null;
  projectCode: string | null;
}

interface ProjectOption {
  id: number;
  name: string;
  code: string | null;
}

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
  nodes: DagNode[];
  edges: DagEdge[];
}

/**
 * Status -> color mapping, per exact spec:
 *   blocked -> grey, eligible (not yet started) -> red,
 *   in_progress -> yellow, done -> light green.
 * `paused` and `cancelled` are not covered by the spec's four buckets — a
 * deliberate call was made (documented here rather than silently reusing
 * blocked/grey):
 *   paused    -> amber/orange — visually close to in_progress (it WAS
 *                running) but distinct, since a paused task is not actively
 *                advancing the same way blocked/eligible/in_progress are.
 *   cancelled -> dark slate, with strikethrough label — reads as "removed
 *                from the flow" rather than any of the four active states.
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

export default function ProjectDag() {
  useParams<{ company: string }>();
  const { toast } = useToast();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [project, setProject] = useState<ProjectOption | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [error, setError] = useState('');
  const [graph, setGraph] = useState<GraphResponse | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fabQuery<QueryResult<ProjectTaskRow>>('fabErpProjectTask', {
        fields: ['projectId', 'projectName', 'projectCode'],
        orderBy: [{ field: 'projectId', direction: 'asc' }],
        pagination: { limit: 5000 },
      });
      const byId = new Map<number, ProjectOption>();
      for (const row of res.data ?? []) {
        if (!byId.has(row.projectId)) {
          byId.set(row.projectId, {
            id: row.projectId,
            name: row.projectName ?? `Project #${row.projectId}`,
            code: row.projectCode,
          });
        }
      }
      const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
      setProjects(list);
    } catch (e) {
      setError((e as Error).message || 'Failed to load projects.');
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const fetchGraph = useCallback(async (projectId: number) => {
    setLoadingGraph(true);
    setError('');
    try {
      const res = await fabGet<GraphResponse>('tasks/graph', { projectId });
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
  }, [toast]);

  useEffect(() => {
    if (project) fetchGraph(project.id);
    else setGraph(null);
  }, [project, fetchGraph]);

  const { laid, width, height } = useMemo(
    () => (graph ? layoutNodes(graph.nodes, graph.edges) : { laid: [], width: 0, height: 0 }),
    [graph],
  );

  const posById = useMemo(() => new Map(laid.map((n) => [n.id, n])), [laid]);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <PageHeader title="Project Task DAG" subtitle="Full dependency graph of every task across a project's items" />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Surface e={1} sx={{ p: 2.5, mb: 2.5 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Autocomplete<ProjectOption, false, false, false>
            options={projects}
            value={project}
            loading={loadingProjects}
            getOptionLabel={(o) => (o.code ? `${o.code} — ${o.name}` : o.name)}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            sx={{ minWidth: 320 }}
            onChange={(_e, newVal) => setProject(newVal)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Project"
                size="small"
                placeholder="Select a project…"
                slotProps={{
                  input: {
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingProjects ? <CircularProgress size={16} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  },
                }}
              />
            )}
          />

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', ml: { sm: 2 } }}>
            {(Object.keys(STATUS_COLOR) as TaskStatus[]).map((s) => (
              <Box key={s} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '3px', background: STATUS_COLOR[s], border: '1px solid rgba(0,0,0,.15)' }} />
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{STATUS_LABEL[s]}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Surface>

      {!project && (
        <Surface e={1} sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--c-text-3)' }}>Select a project to view its task graph.</Typography>
        </Surface>
      )}

      {project && loadingGraph && (
        <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Surface>
      )}

      {project && !loadingGraph && graph && graph.nodes.length === 0 && (
        <Surface e={1} sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: 'var(--c-text-3)' }}>
            No tasks have been materialized for this project yet.
          </Typography>
        </Surface>
      )}

      {project && !loadingGraph && graph && graph.nodes.length > 0 && (
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
