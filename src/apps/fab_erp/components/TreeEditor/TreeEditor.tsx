import { memo, useCallback, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';

import type { TreeNode } from '../../hooks/useTree';
import { TreeNodeRow, type RowMeta } from './TreeNode';

/**
 * TreeEditor — the shared shell behind `StructureEditor` and `ItemBomDesigner`
 * (EU-17 item 2). Both used to keep their own ~250-line `renderNode` closure
 * that recursed the tree, drew indentation and a chevron, and rendered every
 * column inline. That is now split in two: this component owns the SHAPE
 * (indentation, collapse, drag/keyboard reorder, virtualisation), and
 * `renderRow` supplies what a row of THIS tree actually shows.
 *
 * `roots` rather than a single `tree`: the two callers disagree on whether the
 * tree's own root is a row (`StructureEditor`'s root is the order line itself,
 * drawn as the card above; `ItemBomDesigner`'s root IS the catalog item being
 * edited, and is a row). Passing the array of nodes to render at depth 0 lets
 * each caller answer that once, at the call site, instead of this component
 * guessing from a boolean.
 */

export interface TreeEditorProps<T, C = undefined> {
  roots: TreeNode<T>[];
  renderRow: (meta: RowMeta<T, C>) => React.ReactNode;
  /** Non-virtualised only — an add-picker or drawings panel under one row. */
  renderBelow?: (meta: RowMeta<T, C>) => React.ReactNode;
  /** Passed through to every row; shallow-compared so a row only re-renders when a field IT reads changes. */
  ctx: C;
  /** Reordering among siblings. Omit to disable drag entirely (no handle drawn). */
  onMove?: (dragKey: string, overKey: string) => void;
  /** Alt+←/→ — change a row's depth. Omit to leave only up/down reordering. */
  onIndent?: (key: string) => void;
  onOutdent?: (key: string) => void;
  /** Controlled collapse state; omit to let the editor keep its own. */
  collapsed?: Record<string, boolean>;
  onToggle?: (key: string) => void;
  /**
   * FixedSizeList over a flattened, collapse-aware row list. Requires every
   * row to be the same height (`rowHeight`) and does not support
   * `renderBelow` — there is nowhere to put a variable-height panel between
   * fixed-height slots. Use for a long, uniform list (`ItemBomDesigner`);
   * leave off where rows grow an inline panel (`StructureEditor`).
   */
  virtualise?: boolean;
  rowHeight?: number;
  /** Height of the virtualised viewport. Ignored when `virtualise` is false. */
  height?: number;
  width?: number | string;
}

interface FlatRow<T> {
  node: TreeNode<T>;
  depth: number;
  index: number;
  siblingCount: number;
}

/** Everything the virtualised row needs, passed via react-window's `itemData` so the row component itself can live at module scope (item 4). */
interface VirtualRowData<T, C> {
  flat: FlatRow<T>[];
  siblingsFor: TreeNode<T>[][];
  ctx: C;
  renderRow: (meta: RowMeta<T, C>) => React.ReactNode;
  renderBelow?: (meta: RowMeta<T, C>) => React.ReactNode;
  isCollapsed: (key: string) => boolean;
  toggleKey: (key: string) => void;
  onMove?: (dragKey: string, overKey: string) => void;
  onIndent?: (key: string) => void;
  onOutdent?: (key: string) => void;
  dragKey: string | null;
  overKey: string | null;
  setDragKey: (key: string | null) => void;
  setOverKey: (key: string | null) => void;
  dropOn: (targetKey: string) => void;
}

/**
 * MODULE-LEVEL row renderer for the virtualised path (item 4). Defining this
 * inside `TreeEditor`'s render body — as the old `ItemRenderer` did — gives
 * react-window a fresh component IDENTITY every render, so it remounts every
 * visible row (losing focus, re-running effects) instead of re-rendering in
 * place. `data` carries everything the row needs from the parent's closures;
 * `memo` plus react-window's own `itemData`/`itemKey` wiring below is what
 * lets an unrelated parent re-render skip untouched rows.
 */
function VirtualRowInner<T, C>({ index, style, data }: ListChildComponentProps<VirtualRowData<T, C>>) {
  const {
    flat, siblingsFor, ctx, renderRow, renderBelow, isCollapsed, toggleKey,
    onMove, onIndent, onOutdent, dragKey, overKey, setDragKey, setOverKey, dropOn,
  } = data;
  const row = flat[index];
  const siblings = siblingsFor[index];
  const hasKids = row.node.children.length > 0;
  const draggable = !!onMove;
  const doReorder = (dir: 'up' | 'down' | 'in' | 'out') => {
    if (dir === 'in') { onIndent?.(row.node.key); return; }
    if (dir === 'out') { onOutdent?.(row.node.key); return; }
    if (!onMove) return;
    const targetIdx = dir === 'up' ? row.index - 1 : row.index + 1;
    const target = siblings[targetIdx];
    if (target) onMove(row.node.key, target.key);
  };
  return (
    <Box style={style}>
      <TreeNodeRow<T, C>
        node={row.node}
        depth={row.depth}
        hasKids={hasKids}
        isCollapsed={isCollapsed(row.node.key)}
        toggle={() => toggleKey(row.node.key)}
        index={row.index}
        siblingCount={row.siblingCount}
        siblings={siblings}
        ctx={ctx}
        renderRow={renderRow}
        renderBelow={renderBelow}
        draggable={draggable}
        dragging={dragKey === row.node.key}
        isOver={overKey === row.node.key && !!dragKey && dragKey !== row.node.key}
        onDragStart={() => setDragKey(row.node.key)}
        onDragEnd={() => { setDragKey(null); setOverKey(null); }}
        onDragOverRow={() => { if (dragKey && dragKey !== row.node.key) setOverKey(row.node.key); }}
        onDrop={() => dropOn(row.node.key)}
        onReorder={onMove || onIndent || onOutdent ? doReorder : undefined}
      />
    </Box>
  );
}
const VirtualRow = memo(VirtualRowInner) as typeof VirtualRowInner;

function flatten<T>(
  nodes: TreeNode<T>[], depth: number, isCollapsed: (key: string) => boolean, out: FlatRow<T>[],
) {
  nodes.forEach((node, index) => {
    out.push({ node, depth, index, siblingCount: nodes.length });
    if (node.children.length && !isCollapsed(node.key)) {
      flatten(node.children, depth + 1, isCollapsed, out);
    }
  });
}

export default function TreeEditor<T, C = undefined>({
  roots, renderRow, renderBelow, ctx, onMove, onIndent, onOutdent,
  collapsed: collapsedProp, onToggle: onToggleProp,
  virtualise = false, rowHeight = 40, height = 480, width = '100%',
}: TreeEditorProps<T, C>) {
  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>({});
  const collapsed = collapsedProp ?? collapsedState;
  const toggleKey = useCallback((key: string) => {
    if (onToggleProp) { onToggleProp(key); return; }
    setCollapsedState((c) => ({ ...c, [key]: !c[key] }));
  }, [onToggleProp]);
  const isCollapsed = useCallback((key: string) => !!collapsed[key], [collapsed]);

  // ── drag-and-drop, only wired when the caller offers `onMove` ────────────
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const dropOn = useCallback((targetKey: string) => {
    if (dragKey && onMove && dragKey !== targetKey) onMove(dragKey, targetKey);
    setDragKey(null);
    setOverKey(null);
  }, [dragKey, onMove]);

  const rowFor = (
    row: FlatRow<T>, siblings: TreeNode<T>[],
  ) => {
    const hasKids = row.node.children.length > 0;
    const draggable = !!onMove;
    const doReorder = (dir: 'up' | 'down' | 'in' | 'out') => {
      if (dir === 'in') { onIndent?.(row.node.key); return; }
      if (dir === 'out') { onOutdent?.(row.node.key); return; }
      if (!onMove) return;
      const targetIdx = dir === 'up' ? row.index - 1 : row.index + 1;
      const target = siblings[targetIdx];
      if (target) onMove(row.node.key, target.key);
    };
    return (
      <TreeNodeRow<T, C>
        key={row.node.key}
        node={row.node}
        depth={row.depth}
        hasKids={hasKids}
        isCollapsed={isCollapsed(row.node.key)}
        toggle={() => toggleKey(row.node.key)}
        index={row.index}
        siblingCount={row.siblingCount}
        siblings={siblings}
        ctx={ctx}
        renderRow={renderRow}
        renderBelow={renderBelow}
        draggable={draggable}
        dragging={dragKey === row.node.key}
        isOver={overKey === row.node.key && !!dragKey && dragKey !== row.node.key}
        onDragStart={() => setDragKey(row.node.key)}
        onDragEnd={() => { setDragKey(null); setOverKey(null); }}
        onDragOverRow={() => { if (dragKey && dragKey !== row.node.key) setOverKey(row.node.key); }}
        onDrop={() => dropOn(row.node.key)}
        onReorder={onMove || onIndent || onOutdent ? doReorder : undefined}
      />
    );
  };

  // ── non-virtualised: recurse, honouring collapse, allowing `renderBelow` ──
  const renderRecursive = (nodes: TreeNode<T>[], depth: number): React.ReactNode => nodes.map((node, index) => (
    <Box key={node.key}>
      {rowFor({ node, depth, index, siblingCount: nodes.length }, nodes)}
      {node.children.length > 0 && !isCollapsed(node.key) && renderRecursive(node.children, depth + 1)}
    </Box>
  ));

  // ── virtualised: flatten once per (roots, collapsed) change ──────────────
  const flat = useMemo(() => {
    if (!virtualise) return [];
    const out: FlatRow<T>[] = [];
    flatten(roots, 0, isCollapsed, out);
    return out;
  }, [roots, isCollapsed, virtualise]);

  // Parallel array of each flat row's OWN siblings, for reorder-by-offset.
  const siblingsFor = useMemo(() => {
    if (!virtualise) return [];
    const map = new Map<string, TreeNode<T>[]>();
    const walk = (nodes: TreeNode<T>[]) => {
      nodes.forEach((n) => { map.set(n.key, nodes); if (n.children.length) walk(n.children); });
    };
    walk(roots);
    return flat.map((r) => map.get(r.node.key) ?? [r.node]);
  }, [flat, roots, virtualise]);

  const itemData = useMemo<VirtualRowData<T, C>>(() => ({
    flat, siblingsFor, ctx, renderRow, renderBelow, isCollapsed, toggleKey,
    onMove, onIndent, onOutdent, dragKey, overKey, setDragKey, setOverKey, dropOn,
  }), [
    flat, siblingsFor, ctx, renderRow, renderBelow, isCollapsed, toggleKey,
    onMove, onIndent, onOutdent, dragKey, overKey, setDragKey, setOverKey, dropOn,
  ]);

  if (virtualise) {
    return (
      <FixedSizeList<VirtualRowData<T, C>>
        height={height}
        width={width}
        itemCount={flat.length}
        itemSize={rowHeight}
        itemData={itemData}
        itemKey={(i) => flat[i].node.key}
      >
        {VirtualRow}
      </FixedSizeList>
    );
  }

  return <>{renderRecursive(roots, 0)}</>;
}
