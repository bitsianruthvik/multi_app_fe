import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';

/**
 * A small company list, edited in place (CF_HRMS_HIRING_SPEC.md §9 — "super
 * easy to modify"). The pattern for every one-field list: department labels
 * first, then reporting types, leave types and the libraries.
 *
 *   - Click a name to edit it where it stands. Enter saves, Esc cancels,
 *     clicking away saves.
 *   - "Add" appends an empty row that is already being typed in.
 *   - Drag the handle to reorder (mouse or finger); with the handle focused the
 *     up and down arrow keys move the row.
 *   - The remove icon asks on the row itself. When the item is in use it does
 *     not dead-end: it says how many use it and offers "move them to…".
 *
 * NO DIALOGS. Everything happens on the row, and a refusal from the server is
 * shown on the row it belongs to, in the server's words.
 *
 * The component holds no data of its own: the parent passes `items` and four
 * async callbacks, and reloads when one resolves. Order is shown optimistically
 * while a drag is in flight and snaps back if the save is refused.
 */

export interface EditableListItem {
  id: number;
  name: string;
  /** How many records use this item. Absent = the list does not track use. */
  count?: number;
}

export interface EditableListProps {
  items: EditableListItem[];
  /** False shows the list read-only: no handles, no icons, names are plain text. */
  canEdit: boolean;
  /** Removing is its own right. Absent = follows `canEdit`. */
  canRemove?: boolean;
  /** "label" — used in the aria labels and the placeholder: "New label". */
  noun: string;
  /** "3 departments" for a count, in the caller's words. */
  usage?: (count: number) => string;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  /** Present = the order matters and rows can be dragged. */
  onReorder?: (ids: number[]) => Promise<void>;
  /**
   * `moveTo` is set when the item was in use and the user chose where its records go;
   * `'none'` when they chose `clearChoice` instead.
   */
  onRemove: (id: number, moveTo?: number | 'none') => Promise<void>;
  /**
   * Offered beside "move them to…" when records may be left without an item
   * (an optional label group: "Take it off them"). Absent = they must move.
   */
  clearChoice?: string;
  /** The list may not be emptied below this many rows. */
  minItems?: number;
  maxLength?: number;
}

const NEW = -1;
/** The "take it off them" choice in the move-to select. */
const CLEAR = -2;

function words(e: unknown): string {
  const err = e as { message?: string; problems?: string[] } | null;
  const first = err?.problems?.[0];
  return first || err?.message || 'That could not be saved.';
}

export function EditableList({
  items,
  canEdit,
  canRemove = canEdit,
  noun,
  usage,
  onAdd,
  onRename,
  onReorder,
  onRemove,
  minItems = 0,
  maxLength = 40,
  clearChoice,
}: EditableListProps) {
  /** The row being typed in: an item id, NEW for the appended row, or null. */
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  /** The row whose removal is being confirmed. */
  const [removing, setRemoving] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState<number | ''>('');
  const [problem, setProblem] = useState<{ id: number; text: string } | null>(null);
  /** The order while a drag is in flight; null = the parent's order. */
  const [order, setOrder] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Enter and blur both fire on a save; the second must not save again.
  const committing = useRef(false);

  // The parent reloaded: its order is the truth again.
  const signature = items.map((i) => i.id).join(",");
  useEffect(() => {
    setOrder(null);
  }, [signature]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const shown = (order ?? items.map((i) => i.id)).map((id) => byId.get(id)).filter(Boolean) as EditableListItem[];

  const startEdit = (item: EditableListItem) => {
    if (!canEdit || busy != null) return;
    setRemoving(null);
    setProblem(null);
    setEditing(item.id);
    setText(item.name);
  };

  const startAdd = () => {
    setRemoving(null);
    setProblem(null);
    setEditing(NEW);
    setText('');
  };

  const cancel = () => {
    setEditing(null);
    setText('');
    setProblem(null);
  };

  const commit = async () => {
    if (editing == null || committing.current) return;
    const id = editing;
    const name = text.trim();
    const before = id === NEW ? '' : byId.get(id)?.name ?? '';
    // Nothing typed, or nothing changed: the same as Esc.
    if (!name || name === before) {
      cancel();
      return;
    }
    committing.current = true;
    setBusy(id);
    setProblem(null);
    try {
      if (id === NEW) await onAdd(name);
      else await onRename(id, name);
      setEditing(null);
      setText('');
    } catch (e) {
      // The row stays open with what was typed, and says why.
      setProblem({ id, text: words(e) });
    } finally {
      setBusy(null);
      committing.current = false;
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const askRemove = (item: EditableListItem) => {
    setEditing(null);
    setProblem(null);
    setMoveTo('');
    setRemoving(item.id);
  };

  const doRemove = async (item: EditableListItem) => {
    setBusy(item.id);
    setProblem(null);
    try {
      await onRemove(item.id, moveTo === '' ? undefined : moveTo === CLEAR ? 'none' : moveTo);
      setRemoving(null);
    } catch (e) {
      setProblem({ id: item.id, text: words(e) });
    } finally {
      setBusy(null);
    }
  };

  /* ── reorder ─────────────────────────────────────────────────────────── */

  const saveOrder = async (ids: number[]) => {
    if (!onReorder) return;
    const same = ids.length === items.length && ids.every((id, i) => items[i]?.id === id);
    if (same) {
      setOrder(null);
      return;
    }
    try {
      await onReorder(ids);
    } catch (e) {
      setOrder(null);
      setProblem({ id: ids[0], text: words(e) });
    }
  };

  const moveBy = (id: number, delta: number) => {
    const ids = shown.map((i) => i.id);
    const at = ids.indexOf(id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(at, 1));
    setOrder(ids);
    void saveOrder(ids);
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLElement>, id: number) => {
    if (!onReorder || busy != null) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(id);
    setEditing(null);
    setRemoving(null);
    let ids = shown.map((i) => i.id);

    const move = (ev: PointerEvent) => {
      const rowsEl = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-el-row]') ?? []);
      // The row whose middle the pointer has crossed.
      let target = ids.indexOf(id);
      for (let i = 0; i < rowsEl.length; i++) {
        const r = rowsEl[i].getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          target = i;
          break;
        }
      }
      const at = ids.indexOf(id);
      if (target !== at && target >= 0) {
        const next = [...ids];
        next.splice(target, 0, ...next.splice(at, 1));
        ids = next;
        setOrder(next);
      }
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setDragging(null);
      void saveOrder(ids);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  /* ── rows ────────────────────────────────────────────────────────────── */

  const input = (id: number) => (
    <TextField
      autoFocus
      fullWidth
      size="small"
      variant="outlined"
      value={text}
      placeholder={id === NEW ? `New ${noun}` : undefined}
      disabled={busy === id}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => void commit()}
      slotProps={{ htmlInput: { maxLength, 'aria-label': id === NEW ? `New ${noun}` : `Rename ${noun}`, 'data-el-input': '' } }}
    />
  );

  const rowSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    minHeight: 44,
    px: 0.5,
    borderRadius: 'var(--r-sm)',
  } as const;

  return (
    <Box data-editable-list="">
      <Box ref={listRef} role="list">
        {shown.map((item) => {
          const isEditing = editing === item.id;
          const isRemoving = removing === item.id;
          const inUse = (item.count ?? 0) > 0;
          const others = shown.filter((o) => o.id !== item.id);
          const cannotRemove = shown.length <= minItems;
          return (
            <Box
              key={item.id}
              role="listitem"
              data-el-row={item.id}
              sx={{
                borderBottom: '1px solid var(--c-border)',
                background: dragging === item.id ? 'var(--c-surface-2)' : 'transparent',
                py: 0.25,
              }}
            >
              <Box sx={rowSx}>
                {canEdit && onReorder && (
                  <Tooltip title="Drag to reorder" enterDelay={600}>
                    <Box
                      component="span"
                      role="button"
                      tabIndex={0}
                      aria-label={`Move ${item.name}. Use the up and down arrow keys.`}
                      data-el-handle=""
                      onPointerDown={(e) => onHandleDown(e, item.id)}
                      onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          moveBy(item.id, -1);
                        } else if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          moveBy(item.id, 1);
                        }
                      }}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 36,
                        flexShrink: 0,
                        color: 'var(--c-text-3)',
                        cursor: dragging === item.id ? 'grabbing' : 'grab',
                        touchAction: 'none',
                        borderRadius: 'var(--r-sm)',
                        '&:hover': { color: 'var(--c-text-2)', background: 'var(--c-surface-2)' },
                        '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                      }}
                    >
                      <DragIndicatorRounded fontSize="small" />
                    </Box>
                  </Tooltip>
                )}

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    input(item.id)
                  ) : canEdit ? (
                    <Box
                      component="button"
                      type="button"
                      data-el-name=""
                      title="Click to rename"
                      onClick={() => startEdit(item)}
                      sx={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        border: '1px solid transparent',
                        background: 'none',
                        font: 'inherit',
                        fontSize: 14,
                        color: 'var(--c-text)',
                        px: 1,
                        py: 0.875,
                        borderRadius: 'var(--r-sm)',
                        cursor: 'text',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        '&:hover': { borderColor: 'var(--c-border)', background: 'var(--c-surface-2)' },
                        '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                      }}
                    >
                      {item.name}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 14, px: 1, py: 0.875 }}>{item.name}</Typography>
                  )}
                </Box>

                {item.count !== undefined && !isEditing && (
                  <Typography data-el-count="" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {usage ? usage(item.count) : item.count}
                  </Typography>
                )}

                {canRemove && !isEditing && (
                  <Tooltip title={cannotRemove ? `Keep at least ${minItems === 1 ? 'one' : minItems}` : 'Remove'}>
                    <Box component="span" sx={{ flexShrink: 0 }}>
                      <IconButton
                        size="small"
                        aria-label={`Remove ${item.name}`}
                        disabled={cannotRemove || busy != null}
                        onClick={() => (isRemoving ? setRemoving(null) : askRemove(item))}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Box>
                  </Tooltip>
                )}
              </Box>

              {isRemoving && (
                <Box
                  data-el-remove=""
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1,
                    ml: onReorder ? 4.5 : 1,
                    mr: 0.5,
                    mb: 1,
                    p: 1,
                    background: 'var(--c-surface-2)',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  {inUse ? (
                    <>
                      <Typography sx={{ fontSize: 13, flex: '1 1 160px' }}>
                        {usage ? usage(item.count ?? 0) : item.count} use{(item.count ?? 0) === 1 ? 's' : ''} “{item.name}”. Move {(item.count ?? 0) === 1 ? 'it' : 'them'} to
                      </Typography>
                      <TextField
                        select
                        size="small"
                        value={moveTo}
                        onChange={(e) => setMoveTo(e.target.value === '' ? '' : Number(e.target.value))}
                        sx={{ minWidth: 150 }}
                        slotProps={{ htmlInput: { 'aria-label': `Move them to` }, select: { displayEmpty: true } }}
                      >
                        <MenuItem value="" disabled>
                          <em>Choose…</em>
                        </MenuItem>
                        {others.map((o) => (
                          <MenuItem key={o.id} value={o.id}>
                            {o.name}
                          </MenuItem>
                        ))}
                        {clearChoice && (
                          <MenuItem value={CLEAR}>
                            <em>{clearChoice}</em>
                          </MenuItem>
                        )}
                      </TextField>
                      <Button size="small" variant="contained" color="error" disabled={moveTo === '' || busy === item.id} onClick={() => void doRemove(item)}>
                        Move and remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <Typography sx={{ fontSize: 13, flex: '1 1 160px' }}>
                        Remove “{item.name}”?{item.count === 0 ? ' Nothing uses it.' : ''}
                      </Typography>
                      <Button size="small" variant="contained" color="error" disabled={busy === item.id} onClick={() => void doRemove(item)}>
                        Remove
                      </Button>
                    </>
                  )}
                  <Button size="small" color="inherit" onClick={() => setRemoving(null)}>
                    Cancel
                  </Button>
                </Box>
              )}

              {problem?.id === item.id && (
                <Typography role="alert" data-el-problem="" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)', ml: onReorder ? 5.5 : 1.5, mb: 0.75 }}>
                  {problem.text}
                </Typography>
              )}
            </Box>
          );
        })}

        {editing === NEW && (
          <Box role="listitem" data-el-row="new" sx={{ borderBottom: '1px solid var(--c-border)', py: 0.25 }}>
            <Box sx={rowSx}>
              {onReorder && <Box sx={{ width: 28, flexShrink: 0 }} />}
              <Box sx={{ flex: 1, minWidth: 0 }}>{input(NEW)}</Box>
            </Box>
            {problem?.id === NEW && (
              <Typography role="alert" data-el-problem="" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)', ml: onReorder ? 5.5 : 1.5, mb: 0.75 }}>
                {problem.text}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {shown.length === 0 && editing !== NEW && (
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)', py: 1.5, px: 1 }}>Nothing in this list yet.</Typography>
      )}

      {canEdit && (
        <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button size="small" startIcon={<AddRounded />} onClick={startAdd} disabled={editing === NEW || busy != null} data-el-add="">
            Add
          </Button>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            Click a name to change it. Enter saves, Esc cancels.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default EditableList;
