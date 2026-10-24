import { useMemo, useState, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { EntityRow } from '@shared/ui';
import type { Department } from '../api/organisation';
import { descendantIds, idsWithVisibleChildren, visibleRows } from './OrgData';

/**
 * The Org units tree with drag and drop and "+" between rows (CF_HRMS_HIRING_SPEC.md §34.3, §34.4).
 * The same outline as OrgTreeView (indented EntityRows, chevrons, aria-level), plus:
 *
 *   - a drag handle on each row (mouse: drag; touch: press and hold, then drag);
 *     drop ONTO a row = "make it a child of that unit", drop on the top or bottom
 *     edge of a row = "put it before / after that unit, among its siblings".
 *     The tree never moves anything itself: it reports the drop (`onDrop`) and the
 *     page confirms, calls the server and offers Undo. A unit cannot be dropped
 *     into itself or anything under it — those rows do not light up;
 *   - a "+" in the gap above each row (`onAddBefore`): a new sibling at that place.
 *     It shows on hover or keyboard focus.
 *
 * `draggable` is false while the list is filtered (siblings hidden by a filter
 * would make "before / after" mean something the reader cannot see).
 * Keyboard and touch alternative to dragging: "Move to…" in the row menu (the page).
 */
export type DropZone = 'before' | 'after' | 'inside';
export interface UnitDrop {
  unitId: number;
  targetId: number;
  zone: DropZone;
}

function Handle({ id, name, disabled }: { id: number; name: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `unit-${id}`, data: { id }, disabled });
  if (disabled) return null;
  return (
    <Tooltip title="Drag to move (press and hold on a phone)">
      <Box
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        // The keyboard path is "Move to…" in the row menu; the handle is for a pointer.
        tabIndex={-1}
        aria-label={`Drag ${name}`}
        data-drag-handle=""
        sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 28, flexShrink: 0,
          color: 'var(--c-text-3)', cursor: isDragging ? 'grabbing' : 'grab', borderRadius: '4px', touchAction: 'none',
          '&:hover': { color: 'var(--c-text)', background: 'var(--c-surface-3)' },
        }}
      >
        <DragIndicatorRounded fontSize="small" />
      </Box>
    </Tooltip>
  );
}

function DropRow({ id, children }: { id: number; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `unit-${id}`, data: { id } });
  return <Box ref={setNodeRef} sx={{ flex: 1, minWidth: 0, position: 'relative' }}>{children}</Box>;
}

/** Where a pointer at clientY falls on a row: its top or bottom quarter is "between", the middle "onto". */
function zoneOf(clientY: number, rect: { top: number; height: number }): DropZone {
  const y = clientY - rect.top;
  if (y < rect.height * 0.25) return 'before';
  if (y > rect.height * 0.75) return 'after';
  return 'inside';
}

function clientYOf(e: Event | null): number | null {
  if (!e) return null;
  if ('touches' in e && (e as TouchEvent).touches?.length) return (e as TouchEvent).touches[0].clientY;
  if ('changedTouches' in e && (e as TouchEvent).changedTouches?.length) return (e as TouchEvent).changedTouches[0].clientY;
  if ('clientY' in e) return (e as MouseEvent).clientY;
  return null;
}

export function OrgUnitTree({
  rows,
  allRows,
  collapsed,
  onToggle,
  draggable,
  onDrop,
  onAddBefore,
  renderCode,
  renderPrimary,
  renderSecondary,
  renderTrailing,
  renderActions,
  renderBelow,
}: {
  /** Pre-order, already filtered. Collapsing is applied here. */
  rows: Department[];
  /** Every unit (for "not into itself or below it"). */
  allRows: Department[];
  collapsed: Set<number>;
  onToggle: (id: number) => void;
  draggable: boolean;
  onDrop: (drop: UnitDrop) => void;
  /** "+" above a row: add a sibling at its place. Omit for no "+" (no right to add). */
  onAddBefore?: (row: Department) => void;
  renderCode?: (row: Department) => ReactNode;
  renderPrimary: (row: Department) => ReactNode;
  renderSecondary?: (row: Department) => ReactNode;
  renderTrailing?: (row: Department) => ReactNode;
  renderActions?: (row: Department) => ReactNode;
  renderBelow?: (row: Department) => ReactNode;
}) {
  const expandable = idsWithVisibleChildren(rows);
  const shown = visibleRows(rows, collapsed);
  const byId = useMemo(() => new Map(allRows.map((r) => [r.id, r])), [allRows]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [hint, setHint] = useState<{ id: number; zone: DropZone } | null>(null);
  const [startY, setStartY] = useState<number | null>(null);
  const blocked = useMemo(() => (dragId != null ? descendantIds(allRows, dragId) : new Set<number>()), [dragId, allRows]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  );

  const zoneFor = (e: DragMoveEvent | DragEndEvent) => {
    const overId = e.over?.data.current?.id as number | undefined;
    if (overId == null || startY == null || blocked.has(overId)) return null;
    const y = startY + e.delta.y;
    const zone = zoneOf(y, e.over!.rect);
    // Before / after a unit is among ITS siblings: fine unless that is where it already is.
    return { id: overId, zone };
  };

  const onStart = (e: DragStartEvent) => {
    setDragId((e.active.data.current?.id as number) ?? null);
    setStartY(clientYOf(e.activatorEvent));
  };
  const onMove = (e: DragMoveEvent) => {
    const z = zoneFor(e);
    setHint((h) => (h?.id === z?.id && h?.zone === z?.zone ? h : z));
  };
  const onEnd = (e: DragEndEvent) => {
    const z = zoneFor(e);
    const unitId = dragId;
    setDragId(null);
    setHint(null);
    setStartY(null);
    if (unitId == null || !z || z.id === unitId) return;
    onDrop({ unitId, targetId: z.id, zone: z.zone });
  };
  const onCancel = () => { setDragId(null); setHint(null); setStartY(null); };
  const dragged = dragId != null ? byId.get(dragId) ?? null : null;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onStart} onDragMove={onMove} onDragEnd={onEnd} onDragCancel={onCancel}>
      <Box role="tree" aria-label="Org units" sx={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((row) => {
          const canExpand = expandable.has(row.id);
          const open = canExpand && !collapsed.has(row.id);
          const lit = hint?.id === row.id ? hint.zone : null;
          const isBlocked = dragId != null && blocked.has(row.id);
          const guides = Array.from({ length: row.depth }).map((_, i) => (
            <Box key={i} aria-hidden sx={{ width: 20, flexShrink: 0, borderLeft: '1px solid var(--c-divider)', ml: i === 0 ? 1.5 : 0 }} />
          ));
          return (
            <Box key={row.id}>
              {/* The gap above the row: a "+" for a sibling at this place (hover / focus). */}
              <Box
                data-gap=""
                sx={{
                  display: 'flex', alignItems: 'center', height: 10, position: 'relative',
                  '&:hover .gap-add, &:focus-within .gap-add': { opacity: 1 },
                }}
              >
                {guides}
                {onAddBefore && dragId == null && draggable && (
                  <Tooltip title={`Add a unit here, before ${row.name}`}>
                    <IconButton
                      className="gap-add"
                      size="small"
                      aria-label={`Add an org unit before ${row.name}`}
                      onClick={() => onAddBefore(row)}
                      sx={{
                        opacity: 0, transition: 'opacity var(--t-fast) var(--ease)', width: 20, height: 20, p: 0, ml: 0.5, zIndex: 1,
                        color: 'var(--c-primary-700)', background: 'var(--c-surface)', border: '1px solid var(--c-primary-200)',
                        '&:hover': { background: 'var(--c-primary-50)' },
                        '&:focus-visible': { opacity: 1 },
                      }}
                    >
                      <AddRounded sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              <Box
                role="treeitem"
                aria-level={row.depth + 1}
                aria-expanded={canExpand ? open : undefined}
                data-unit-row={row.id}
                sx={{ display: 'flex', alignItems: 'stretch', minWidth: 0, opacity: dragId === row.id ? 0.45 : isBlocked ? 0.6 : 1 }}
              >
                {guides}
                <DropRow id={row.id}>
                  {lit === 'before' && <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, top: -6, height: 3, borderRadius: 2, background: 'var(--c-primary-500)', zIndex: 2 }} />}
                  {lit === 'after' && <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: -6, height: 3, borderRadius: 2, background: 'var(--c-primary-500)', zIndex: 2 }} />}
                  <Box sx={{ borderRadius: 'var(--r-md)', outline: lit === 'inside' ? '2px solid var(--c-primary-500)' : 'none', outlineOffset: 1, background: lit === 'inside' ? 'var(--c-primary-50)' : undefined }}>
                    <EntityRow
                      code={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          <Handle id={row.id} name={row.name} disabled={!draggable} />
                          {canExpand ? (
                            <IconButton
                              size="small"
                              onClick={() => onToggle(row.id)}
                              aria-label={open ? `Collapse ${row.name}` : `Expand ${row.name}`}
                              sx={{ color: 'var(--c-text-2)' }}
                            >
                              {open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                            </IconButton>
                          ) : (
                            <Box aria-hidden sx={{ width: 30, flexShrink: 0 }} />
                          )}
                          {renderCode ? renderCode(row) : null}
                        </Box>
                      }
                      primary={renderPrimary(row)}
                      secondary={renderSecondary?.(row)}
                      trailing={renderTrailing?.(row)}
                      actions={renderActions?.(row)}
                    />
                  </Box>
                  {renderBelow?.(row)}
                </DropRow>
              </Box>
            </Box>
          );
        })}
      </Box>
      <DragOverlay dropAnimation={null}>
        {dragged ? (
          // The overlay's box is the handle's size; the label is wider than that on purpose.
          <Box sx={{ width: 'max-content', px: 1.5, py: 1, borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', boxShadow: 'var(--e-3)', border: '1px solid var(--c-primary-200)', fontSize: 14, fontWeight: 500, color: 'var(--c-text)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
            {dragged.type ? `${dragged.type} · ` : ''}{dragged.name}
          </Box>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
