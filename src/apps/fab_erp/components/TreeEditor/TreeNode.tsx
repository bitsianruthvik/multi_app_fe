import { memo } from 'react';
import { Box, IconButton } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import type { TreeNode } from '../../hooks/useTree';
import { shallowEqual } from '../../utils/shallowEqual';

export type { TreeNode };

/** What a row renderer receives about its own place in the tree. */
export interface RowMeta<T, C> {
  node: TreeNode<T>;
  depth: number;
  hasKids: boolean;
  isCollapsed: boolean;
  toggle: () => void;
  index: number;
  siblingCount: number;
  ctx: C;
}

export interface TreeNodeRowProps<T, C> {
  node: TreeNode<T>;
  depth: number;
  hasKids: boolean;
  isCollapsed: boolean;
  toggle: () => void;
  index: number;
  siblingCount: number;
  ctx: C;
  /**
   * The row's own siblings array, identity-compared only (not read by
   * `TreeNodeRowInner`) — `onReorder` closes over it, and a reorder anywhere
   * among these siblings rebuilds this array even when THIS row's own
   * `index`/`siblingCount` don't change, so it must be able to force a
   * re-render on its own (item 10) or the memoised row keeps a stale
   * `onReorder` closure over the pre-reorder siblings.
   */
  siblings: TreeNode<T>[];
  renderRow: (meta: RowMeta<T, C>) => React.ReactNode;
  /** Below the row's own line, indented one further — an add-picker, a drawings panel. */
  renderBelow?: (meta: RowMeta<T, C>) => React.ReactNode;
  draggable: boolean;
  dragging: boolean;
  isOver: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOverRow?: () => void;
  onDrop?: () => void;
  onReorder?: (dir: 'up' | 'down' | 'in' | 'out') => void;
}

/**
 * ONE ROW'S CHROME: indentation, the expand chevron, the (always-visible, per
 * U4) drag handle, and keyboard reordering. What the row actually SHOWS is
 * `renderRow`'s business — this only owns the shape every row shares.
 *
 * Memoised on `node` identity plus a shallow compare of `ctx`, NOT on
 * `renderRow`/`renderBelow` themselves (those are expected to be fresh
 * closures every render). Since every tree edit here is immutable —
 * `mapNode` only rebuilds nodes on the path to the one that changed — a
 * keystroke on one row leaves every sibling's `node` reference untouched, so
 * only the row that actually changed re-renders. This is the fix for
 * `countPieces`/`unanswered`/`countRows` (and the 254-line render closure
 * they used to live inside) recomputing on every keystroke.
 */
function TreeNodeRowInner<T, C>({
  node, depth, hasKids, isCollapsed, toggle, index, siblingCount, ctx,
  renderRow, renderBelow, draggable, dragging, isOver,
  onDragStart, onDragEnd, onDragOverRow, onDrop, onReorder,
}: TreeNodeRowProps<T, C>) {
  const meta: RowMeta<T, C> = { node, depth, hasKids, isCollapsed, toggle, index, siblingCount, ctx };
  return (
    <Box>
      <Box
        draggable={draggable}
        onDragStart={(e) => { onDragStart?.(); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => onDragEnd?.()}
        onDragOver={(e) => {
          if (!draggable) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOverRow?.();
        }}
        onDrop={(e) => { e.preventDefault(); onDrop?.(); }}
        onKeyDown={(e) => {
          if (!onReorder) return;
          if (!e.altKey) return;
          if (e.key === 'ArrowUp') { e.preventDefault(); onReorder('up'); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); onReorder('down'); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); onReorder('out'); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); onReorder('in'); }
        }}
        tabIndex={onReorder ? 0 : undefined}
        aria-label={onReorder ? `${node.key} — Alt+arrow keys to reorder` : undefined}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          pl: `${depth * 20}px`, py: 0.4,
          borderBottom: '1px solid var(--c-divider)',
          opacity: dragging ? 0.4 : 1,
          boxShadow: isOver ? 'inset 0 2px 0 0 var(--c-primary-500)' : undefined,
          '&:focus-visible': { outline: '2px solid var(--c-primary-400)', outlineOffset: -2 },
        }}
      >
        {/*
          The handle is a grip, not a button — the whole row is draggable. It is
          ALWAYS VISIBLE now (U4): a hover-only affordance told nobody the row
          could be moved unless their pointer happened to be sitting on it.
        */}
        {draggable ? (
          <Box
            aria-hidden
            sx={{
              width: 10, flexShrink: 0, cursor: 'grab', color: 'var(--c-text-3)',
              fontSize: 13, lineHeight: 1, userSelect: 'none', opacity: 0.55,
            }}
          >
            ⣿
          </Box>
        ) : (
          <Box sx={{ width: 10, flexShrink: 0 }} />
        )}

        <IconButton
          size="small"
          sx={{ p: 0.25, visibility: hasKids ? 'visible' : 'hidden' }}
          onClick={toggle}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? <ChevronRightRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
        </IconButton>

        {renderRow(meta)}
      </Box>

      {renderBelow?.(meta)}
    </Box>
  );
}

const propsEqual = <T, C>(prev: TreeNodeRowProps<T, C>, next: TreeNodeRowProps<T, C>) => (
  prev.node === next.node
  && prev.depth === next.depth
  && prev.hasKids === next.hasKids
  && prev.isCollapsed === next.isCollapsed
  && prev.index === next.index
  && prev.siblingCount === next.siblingCount
  && prev.draggable === next.draggable
  && prev.dragging === next.dragging
  && prev.isOver === next.isOver
  && prev.siblings === next.siblings
  && shallowEqual(prev.ctx, next.ctx)
);

export const TreeNodeRow = memo(TreeNodeRowInner, propsEqual as (
  prev: TreeNodeRowProps<unknown, unknown>, next: TreeNodeRowProps<unknown, unknown>,
) => boolean) as typeof TreeNodeRowInner;
