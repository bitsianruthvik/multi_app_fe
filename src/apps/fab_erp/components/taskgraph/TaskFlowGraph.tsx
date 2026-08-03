/**
 * TaskFlowGraph.tsx — the shared, fetch-agnostic Task DAG renderer (EU-3).
 * Parents pass the GET /tasks/graph `{ nodes, edges }` payload; this component
 * lays them out (React Flow + dagre), draws collapsible per-part swimlanes with
 * cross-BOM component edges, and provides zoom/pan/fit/minimap.
 *
 * Parts start COLLAPSED by default (progressive expand) so large orders don't
 * render thousands of operation nodes up front.
 *
 * Phase 6b changes:
 *
 *  - **The controls are docked, not floating.** Expand/Collapse and the legend
 *    used to sit in React Flow <Panel>s, which float *over* the canvas — the
 *    legend covered the top-right corner, which is exactly where dagre puts the
 *    end of a left-to-right graph. They now live in a strip above the canvas,
 *    so nothing the graph draws can be hidden by chrome that isn't part of it.
 *
 *  - **The canvas can be driven from the keyboard.** A pan-and-zoom surface is
 *    otherwise pure mouse: arrow keys pan, +/− zoom, F fits, and the toolbar
 *    controls are ordinary focusable buttons. The graph advertises this rather
 *    than leaving it to be discovered.
 *
 *  - **No hardcoded colours.** Dots, minimap and edges read the --c-graph-*
 *    and --c-task-* tokens, so the canvas follows the theme like every other
 *    surface instead of staying light-mode grey in dark mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Button, Divider, Tooltip, Typography } from '@mui/material';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import CenterFocusStrongRounded from '@mui/icons-material/CenterFocusStrongRounded';
import KeyboardRounded from '@mui/icons-material/KeyboardRounded';

import OperationNode from './OperationNode';
import PartGroupNode from './PartGroupNode';
import StatusLegend from './StatusLegend';
import { buildTaskGraphLayout } from './graphLayout';
import { STATUS_COLOR } from './types';
import type { TaskGraphNode, TaskGraphEdge, TaskStatus } from './types';

const NODE_TYPES = { operation: OperationNode, partGroup: PartGroupNode };

const PAN_STEP = 80;      // px per arrow press — about one node's width

// Viewport animation durations. React Flow drives these through d3-zoom
// transitions, which run on requestAnimationFrame — so in a hidden or
// background tab they don't advance until it becomes visible again. That is
// correct behaviour, and worth knowing when an automated check reports "the
// viewport never moved": it means no frames were painted, not that the call
// failed.
const PAN_MS = 120;
const ZOOM_MS = 150;
const FIT_MS = 300;

// Kept next to the <ReactFlow> props that use them so the manual fit below can
// clamp to exactly the same range the flow enforces.
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2.5;

export interface TaskFlowGraphProps {
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  onOpenTask?: (taskId: number) => void;
  height?: number | string;
}

/** What the toolbar and the keyboard handler are allowed to do to the viewport. */
interface ViewportApi {
  pan: (dx: number, dy: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

/**
 * Owns every viewport call, and is rendered inside <ReactFlow> alongside the
 * flow's own children. The outer toolbar and the keyboard handler reach it
 * through a ref rather than calling useReactFlow() themselves, so there is one
 * place that talks to the viewport.
 *
 * It also re-fits when the data changes, which is what the old FitOnDataChange
 * component did.
 */
function ViewportController({
  api, paneRef, signature, hasNodes,
}: {
  api: React.MutableRefObject<ViewportApi | null>;
  /** The canvas box — its size is the area fit has to fill. */
  paneRef: React.RefObject<HTMLDivElement | null>;
  signature: string;
  hasNodes: boolean;
}) {
  const { zoomIn, zoomOut, getViewport, setViewport, getNodes } = useReactFlow();

  /**
   * Fit is computed here rather than delegated to `fitView()`.
   *
   * `fitView()` is a no-op on this graph — verified with animations disabled,
   * where pan and zoom both moved the viewport and fit changed nothing, and
   * React Flow's own fit-view button was equally dead while its zoom buttons
   * worked. So the graph has always opened at 100% showing the top-left corner
   * of a layout that is usually taller than the pane, and the "fit on data
   * change" effect that has been here since EU-3 has never done anything.
   *
   * The bounds are simple — dagre already told us where every node is — so this
   * derives them from the public node list and drives the viewport through
   * setViewport, which is proven to work.
   */
  const fit = useCallback(() => {
    const el = paneRef.current;
    const nodes = getNodes();
    if (!el || !nodes.length) return;

    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      // Child nodes are positioned relative to their parent group; the group
      // itself already covers them, so relative positions can't widen bounds.
      if (n.parentId) continue;
      const nw = n.measured?.width ?? (typeof n.style?.width === 'number' ? n.style.width : 0);
      const nh = n.measured?.height ?? (typeof n.style?.height === 'number' ? n.style.height : 0);
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + nw);
      maxY = Math.max(maxY, n.position.y + nh);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return;

    const gw = Math.max(1, maxX - minX);
    const gh = Math.max(1, maxY - minY);
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(w / (gw * 1.15), h / (gh * 1.15))));
    setViewport(
      { x: w / 2 - (minX + gw / 2) * zoom, y: h / 2 - (minY + gh / 2) * zoom, zoom },
      { duration: FIT_MS },
    );
  }, [getNodes, setViewport, paneRef]);

  useEffect(() => {
    api.current = {
      pan: (dx, dy) => {
        const v = getViewport();
        setViewport({ ...v, x: v.x + dx, y: v.y + dy }, { duration: PAN_MS });
      },
      zoomIn: () => zoomIn({ duration: ZOOM_MS }),
      zoomOut: () => zoomOut({ duration: ZOOM_MS }),
      fit,
    };
    return () => { api.current = null; };
  }, [api, zoomIn, zoomOut, getViewport, setViewport, fit]);

  // Fit whenever the underlying data changes. The delay lets React Flow measure
  // the freshly-laid-out nodes first.
  useEffect(() => {
    if (!hasNodes) return;
    const t = setTimeout(fit, 80);
    return () => clearTimeout(t);
  }, [signature, hasNodes, fit]);

  return null;
}

function TaskFlowGraphInner({ nodes: taskNodes, edges: taskEdges, onOpenTask, height }: TaskFlowGraphProps) {
  const viewport = useRef<ViewportApi | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);

  const allItemIds = useMemo(
    () => Array.from(new Set(taskNodes.map((t) => t.itemId))),
    [taskNodes],
  );
  // Signature of the item SET — used to reset collapse state only when the
  // underlying data (order / filter) changes, not on every re-render.
  const signature = useMemo(() => allItemIds.slice().sort((a, b) => a - b).join(','), [allItemIds]);

  // Which parts are OPENED. Starts empty: the graph opens at the top level of
  // the BOM and you drill in. It used to track the inverse — every part in the
  // order rendered at once, collapsed — which meant a fifty-part girder opened
  // as a wall of fifty lanes.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const lastSig = useRef(signature);
  useEffect(() => {
    if (lastSig.current !== signature) {
      lastSig.current = signature;
      setExpanded(new Set());
    }
  }, [signature]);

  const toggleGroup = useCallback((itemId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }, []);

  const layout = useMemo(
    () => buildTaskGraphLayout(taskNodes, taskEdges, expanded, { onOpenTask, onToggleGroup: toggleGroup }),
    [taskNodes, taskEdges, expanded, onOpenTask, toggleGroup],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => { setRfNodes(layout.nodes); }, [layout, setRfNodes]);
  useEffect(() => { setRfEdges(layout.edges); }, [layout, setRfEdges]);

  const expandAll = useCallback(() => setExpanded(new Set(allItemIds)), [allItemIds]);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);
  const expandedCount = expanded.size;
  // What's actually on the canvas right now — the honest denominator for a
  // drill-down, where most parts are deliberately not drawn yet.
  const visibleCount = layout.nodes.filter((n) => n.type === 'partGroup').length;

  // Keyboard driving. React Flow's own pane doesn't pan on arrow keys, so the
  // viewport is moved directly. Only fires when focus is inside the canvas
  // wrapper, so arrows still scroll the page everywhere else.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const v = viewport.current;
    if (!v) return;
    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); v.pan(PAN_STEP, 0); break;
      case 'ArrowRight': e.preventDefault(); v.pan(-PAN_STEP, 0); break;
      case 'ArrowUp':    e.preventDefault(); v.pan(0, PAN_STEP); break;
      case 'ArrowDown':  e.preventDefault(); v.pan(0, -PAN_STEP); break;
      case '+': case '=': e.preventDefault(); v.zoomIn(); break;
      case '-': case '_': e.preventDefault(); v.zoomOut(); break;
      case 'f': case 'F': e.preventDefault(); v.fit(); break;
      default: break;
    }
  }, []);

  if (taskNodes.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ color: 'var(--c-text-3)' }}>No tasks to display.</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        border: '1px solid var(--c-border)', borderRadius: 'var(--r-md, 8px)',
        overflow: 'hidden', background: 'var(--c-surface)',
      }}
    >
      {/* Docked toolbar — chrome lives here, never over the graph. */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
          px: 1.5, py: 1,
          borderBottom: '1px solid var(--c-divider)',
          background: 'var(--c-surface-2)',
        }}
      >
        <Button size="small" variant="outlined" startIcon={<UnfoldMoreRounded fontSize="small" />} onClick={expandAll} disabled={expandedCount === allItemIds.length}>
          Expand all
        </Button>
        <Button size="small" variant="outlined" startIcon={<UnfoldLessRounded fontSize="small" />} onClick={collapseAll} disabled={expandedCount === 0}>
          Top level
        </Button>
        <Button size="small" variant="text" startIcon={<CenterFocusStrongRounded fontSize="small" />} onClick={() => viewport.current?.fit()}>
          Fit
        </Button>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
          Showing {visibleCount} of {allItemIds.length} parts
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'var(--c-divider)' }} />
        <StatusLegend inline />

        <Tooltip title="Click the graph, then: arrows pan · + / − zoom · F fits everything">
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5, color: 'var(--c-text-3)' }}>
            <KeyboardRounded sx={{ fontSize: 16 }} />
            <Typography sx={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>arrows · +/− · F</Typography>
          </Box>
        </Tooltip>
      </Box>

      <Box
        ref={paneRef}
        tabIndex={0}
        role="application"
        aria-label="Task dependency graph. Arrow keys pan, plus and minus zoom, F fits the whole graph."
        onKeyDown={onKeyDown}
        sx={{
          height: height ?? 640, minHeight: 360, position: 'relative',
          '&:focus-visible': { outline: '2px solid var(--c-focus)', outlineOffset: '-2px' },
        }}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          nodesDraggable={false}
          nodesConnectable={false}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} color="var(--c-graph-dots)" gap={20} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            style={{ width: 150, height: 100, background: 'var(--c-surface-2)' }}
            nodeColor={(n) => (n.type === 'partGroup'
              ? 'var(--c-graph-lane)'
              : STATUS_COLOR[(n.data as { status?: TaskStatus })?.status ?? 'eligible'])}
          />
          <ViewportController api={viewport} paneRef={paneRef} signature={signature} hasNodes={rfNodes.length > 0} />
        </ReactFlow>
      </Box>
    </Box>
  );
}

export default function TaskFlowGraph(props: TaskFlowGraphProps) {
  return (
    <ReactFlowProvider>
      <TaskFlowGraphInner {...props} />
    </ReactFlowProvider>
  );
}
