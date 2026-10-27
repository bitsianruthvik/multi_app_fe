import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type PointerActivationConstraint,
} from '@dnd-kit/core';
import { EntityRow } from '@shared/ui';
import type { Department } from '../api/organisation';
import { descendantIds, idsWithVisibleChildren, visibleRows } from './OrgData';
import { zoneOf, type DropZone, type UnitDrop } from './orgMove';

/**
 * The Org units tree with drag and drop and "+" between rows (CF_HRMS_HIRING_SPEC.md §34.3, §34.4).
 * The same outline as OrgTreeView (indented EntityRows, chevrons, aria-level), plus:
 *
 *   - a drag handle on each row. Mouse / pen: drag (pointer events; it starts after 6 px, so a
 *     click is a click); touch: press and hold, then drag. Keyboard: the handle is a button —
 *     Tab to it, Enter or Space opens "Move to…" (`onKeyboardMove`), the same picker as the
 *     row menu. (dnd-kit's keyboard dragging scrolls the page instead of moving once the row
 *     is below the middle of the window: tried 2026-10-27, not usable on a long tree.)
 *     Drop ONTO a row = "make it a child of that unit", on the top or bottom edge of a row =
 *     "put it before / after that unit, among its siblings".
 *     The tree never moves anything itself: it reports the drop (`onDrop`) and the
 *     page confirms, calls the server and offers Undo. A unit cannot be dropped
 *     into itself or anything under it — those rows do not light up;
 *   - a "+" in the gap above each row (`onAddBefore`): a new sibling at that place.
 *     It shows on hover or keyboard focus.
 *
 * THE DROP IS WHAT IS LIT. The row (and zone) lit while dragging is kept in a ref; the drop
 * reports exactly that, never a target worked out again from the last event (dnd-kit's `over`
 * can lag the pointer by a frame). No highlight, no drop. A cancelled drag (Esc, the window
 * hidden, a drag that ends on nothing) clears everything, and a new drag always starts
 * from a clean state.
 *
 * `draggable` is false while the list is filtered (siblings hidden by a filter
 * would make "before / after" mean something the reader cannot see); `paused` while a move
 * is being confirmed (a drop must never replace the move an open dialog names).
 */
export type { DropZone, UnitDrop };

/** Mouse and pen through pointer events; touch goes to the TouchSensor (press and hold). */
class MousePenSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: e }: { nativeEvent: PointerEvent }) => e.isPrimary && e.button === 0 && e.pointerType !== 'touch',
    },
  ];
}

const MOUSE: PointerActivationConstraint = { distance: 6 };
const TOUCH: PointerActivationConstraint = { delay: 350, tolerance: 8 };

function Handle({ id, name, disabled, paused, onKeyboardMove }: {
  id: number; name: string; disabled: boolean; paused: boolean; onKeyboardMove?: () => void;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: `unit-${id}`, data: { id }, disabled: disabled || paused });
  if (disabled) return null;
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onKeyboardMove && !paused) {
      e.preventDefault();
      onKeyboardMove();
    }
  };
  return (
    <Tooltip title={onKeyboardMove ? 'Drag to move (press and hold on a phone). Enter: Move to…' : 'Drag to move (press and hold on a phone)'}>
      <Box
        ref={setNodeRef}
        {...listeners}
        role={onKeyboardMove ? 'button' : undefined}
        tabIndex={onKeyboardMove ? 0 : -1}
        aria-label={onKeyboardMove ? `Move ${name}…` : `Drag ${name}`}
        aria-haspopup={onKeyboardMove ? 'dialog' : undefined}
        onKeyDown={onKeyDown}
        data-drag-handle=""
        sx={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 28, flexShrink: 0,
          color: 'var(--c-text-3)', cursor: isDragging ? 'grabbing' : 'grab', borderRadius: '4px', touchAction: 'none',
          '&:hover': { color: 'var(--c-text)', background: 'var(--c-surface-3)' },
          '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
        }}
      >
        <DragIndicatorRounded fontSize="small" />
      </Box>
    </Tooltip>
  );
}

function DropRow({ id, lit, children }: { id: number; lit: DropZone | null; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `unit-${id}`, data: { id } });
  return <Box ref={setNodeRef} data-drop-row={id} data-drop-hint={lit ?? undefined} sx={{ flex: 1, minWidth: 0, position: 'relative' }}>{children}</Box>;
}

function pointOf(e: Event | null): { x: number; y: number } | null {
  if (!e) return null;
  if ('touches' in e && (e as TouchEvent).touches?.length) { const t = (e as TouchEvent).touches[0]; return { x: t.clientX, y: t.clientY }; }
  if ('changedTouches' in e && (e as TouchEvent).changedTouches?.length) { const t = (e as TouchEvent).changedTouches[0]; return { x: t.clientX, y: t.clientY }; }
  if ('clientY' in e) return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  return null;
}

type Hint = { id: number; zone: DropZone } | null;

/**
 * The row under a point, read from the page as it is NOW (not from rects measured at drag start).
 * For a release that came before any highlight could be drawn (a very fast flick).
 */
function placeAt(x: number, y: number, blocked: Set<number>, me: number | null): Hint {
  for (const el of document.elementsFromPoint(x, y)) {
    const row = (el as HTMLElement).closest?.('[data-drop-row]');
    if (!row) continue;
    const id = Number(row.getAttribute('data-drop-row'));
    if (blocked.has(id) || id === me) return null;
    return { id, zone: zoneOf(y, row.getBoundingClientRect()) };
  }
  return null;
}

export function OrgUnitTree({
  rows,
  allRows,
  collapsed,
  onToggle,
  draggable,
  paused = false,
  onDrop,
  onAddBefore,
  onKeyboardMove,
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
  /** Handles stay but do nothing (a move is being confirmed). */
  paused?: boolean;
  onDrop: (drop: UnitDrop) => void;
  /** "+" above a row: add a sibling at its place. Omit for no "+" (no right to add). */
  onAddBefore?: (row: Department) => void;
  /** Enter / Space on a handle: the keyboard way to move (the page opens "Move to…"). */
  onKeyboardMove?: (row: Department) => void;
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
  const [hint, setHint] = useState<Hint>(null);
  // The live values for the event handlers (state in a closure can be a render behind).
  const live = useRef<{ dragId: number | null; start: { x: number; y: number } | null; hint: Hint; blocked: Set<number> }>({ dragId: null, start: null, hint: null, blocked: new Set() });
  const blocked = useMemo(() => (dragId != null ? descendantIds(allRows, dragId) : new Set<number>()), [dragId, allRows]);
  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: MOUSE }),
    useSensor(TouchSensor, { activationConstraint: TOUCH }),
  );

  const reset = () => {
    live.current = { dragId: null, start: null, hint: null, blocked: new Set() };
    setDragId(null);
    setHint(null);
  };

  /** The place under the pointer. */
  const placeOf = (e: DragMoveEvent): Hint => {
    const overId = e.over?.data.current?.id as number | undefined;
    const { start, blocked: no, dragId: me } = live.current;
    if (overId == null || !e.over || start == null || no.has(overId) || overId === me) return null;
    return { id: overId, zone: zoneOf(start.y + e.delta.y, e.over.rect) };
  };

  const onStart = (e: DragStartEvent) => {
    const id = (e.active.data.current?.id as number) ?? null;
    live.current = { dragId: id, start: pointOf(e.activatorEvent), hint: null, blocked: id != null ? descendantIds(allRows, id) : new Set() };
    setDragId(id);
    setHint(null);
  };
  const onMove = (e: DragMoveEvent) => {
    const z = placeOf(e);
    live.current.hint = z;
    setHint((h) => (h?.id === z?.id && h?.zone === z?.zone ? h : z));
  };
  const onEnd = (e: DragEndEvent) => {
    // Exactly the last lit place (what the reader saw). Nothing lit yet (released before the
    // highlight was drawn): the row under the pointer on the page now — never dnd-kit's `over`,
    // which can still name the row of the previous pointer event.
    const { hint, start, blocked: no, dragId: me } = live.current;
    const z = hint ?? (start ? placeAt(start.x + e.delta.x, start.y + e.delta.y, no, me) : null);
    const unitId = live.current.dragId;
    reset();
    if (unitId == null || !z || z.id === unitId) return;
    onDrop({ unitId, targetId: z.id, zone: z.zone });
  };
  const dragged = dragId != null ? byId.get(dragId) ?? null : null;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onStart} onDragMove={onMove} onDragEnd={onEnd} onDragCancel={reset}>
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
                <DropRow id={row.id} lit={lit}>
                  {lit === 'before' && <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, top: -6, height: 3, borderRadius: 2, background: 'var(--c-primary-500)', zIndex: 2 }} />}
                  {lit === 'after' && <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: -6, height: 3, borderRadius: 2, background: 'var(--c-primary-500)', zIndex: 2 }} />}
                  <Box sx={{ borderRadius: 'var(--r-md)', outline: lit === 'inside' ? '2px solid var(--c-primary-500)' : 'none', outlineOffset: 1, background: lit === 'inside' ? 'var(--c-primary-50)' : undefined }}>
                    <EntityRow
                      code={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          <Handle id={row.id} name={row.name} disabled={!draggable} paused={paused} onKeyboardMove={onKeyboardMove ? () => onKeyboardMove(row) : undefined} />
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
