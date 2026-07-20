/**
 * TaskFlowGraph.tsx — the shared, fetch-agnostic Task DAG renderer (EU-3).
 * Parents pass the GET /tasks/graph `{ nodes, edges }` payload; this component
 * lays them out (React Flow + dagre), draws collapsible per-part swimlanes with
 * cross-BOM component edges, and provides zoom/pan/fit/minimap.
 *
 * Parts start COLLAPSED by default (progressive expand) so large orders don't
 * render thousands of operation nodes up front.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, Panel,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Node, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Button, Typography } from '@mui/material';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';

import OperationNode from './OperationNode';
import PartGroupNode from './PartGroupNode';
import StatusLegend from './StatusLegend';
import { buildTaskGraphLayout } from './graphLayout';
import type { TaskGraphNode, TaskGraphEdge } from './types';

const NODE_TYPES = { operation: OperationNode, partGroup: PartGroupNode };

export interface TaskFlowGraphProps {
  nodes: TaskGraphNode[];
  edges: TaskGraphEdge[];
  onOpenTask?: (taskId: number) => void;
  height?: number | string;
}

function FitOnDataChange({ signature, hasNodes }: { signature: string; hasNodes: boolean }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!hasNodes) return;
    const t = setTimeout(() => fitView({ duration: 400, padding: 0.15 }), 60);
    return () => clearTimeout(t);
  }, [signature, hasNodes, fitView]);
  return null;
}

function TaskFlowGraphInner({ nodes: taskNodes, edges: taskEdges, onOpenTask, height }: TaskFlowGraphProps) {
  const allItemIds = useMemo(
    () => Array.from(new Set(taskNodes.map((t) => t.itemId))),
    [taskNodes],
  );
  // Signature of the item SET — used to reset collapse state only when the
  // underlying data (order / filter) changes, not on every re-render.
  const signature = useMemo(() => allItemIds.slice().sort((a, b) => a - b).join(','), [allItemIds]);

  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set(allItemIds));
  const lastSig = useRef(signature);
  useEffect(() => {
    if (lastSig.current !== signature) {
      lastSig.current = signature;
      setCollapsed(new Set(allItemIds)); // default: all parts collapsed
    }
  }, [signature, allItemIds]);

  const toggleGroup = useCallback((itemId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }, []);

  const layout = useMemo(
    () => buildTaskGraphLayout(taskNodes, taskEdges, collapsed, { onOpenTask, onToggleGroup: toggleGroup }),
    [taskNodes, taskEdges, collapsed, onOpenTask, toggleGroup],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => { setRfNodes(layout.nodes); }, [layout, setRfNodes]);
  useEffect(() => { setRfEdges(layout.edges); }, [layout, setRfEdges]);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => setCollapsed(new Set(allItemIds)), [allItemIds]);

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
        height: height ?? 640, minHeight: 360, position: 'relative',
        border: '1px solid var(--c-border)', borderRadius: 'var(--r-md, 8px)',
        overflow: 'hidden', background: 'var(--c-surface)',
      }}
    >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        minZoom={0.05}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} color="#94a3b8" gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          style={{ width: 150, height: 100 }}
          nodeColor={(n) => (n.type === 'partGroup' ? '#c4b5fd' : '#cbd5e1')}
        />
        <Panel position="top-left">
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" startIcon={<UnfoldMoreRounded fontSize="small" />} onClick={expandAll}>
              Expand all
            </Button>
            <Button size="small" variant="outlined" startIcon={<UnfoldLessRounded fontSize="small" />} onClick={collapseAll}>
              Collapse all
            </Button>
          </Box>
        </Panel>
        <Panel position="top-right">
          <StatusLegend />
        </Panel>
        <FitOnDataChange signature={signature} hasNodes={rfNodes.length > 0} />
      </ReactFlow>
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
