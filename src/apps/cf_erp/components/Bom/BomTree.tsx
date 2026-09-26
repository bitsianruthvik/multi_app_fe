import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { Badge, KindChip, Mono, StatusBadge, WarnBadge, type Family } from '../ui';
import { FlowTag } from '../FlowTag';
import type { BomRow } from './bomModel';

/** What a row offers, in the order a menu shows it. */
export type BomAction = 'add' | 'choose' | 'change' | 'remove';

const ACTION_LABEL: Record<BomAction, string> = {
  add: 'Add a part…',
  choose: 'Choose the item…',
  change: 'Change quantity, role or flow…',
  remove: 'Remove…',
};

/**
 * How a row waiting in edit mode is marked: a stripe, a tint and a word — the
 * word is what carries it (§6.2, never colour alone). `gone` is a row that goes
 * because a line above it is being removed.
 */
export interface RowMark { tone: 'changed' | 'invalid' | 'removed' | 'gone' | 'pasted'; label: string; title?: string }

const STRUCK = { textDecoration: 'line-through', color: 'var(--c-text-3)' } as const;
const MARK: Record<RowMark['tone'], { family: Family; stripe: string | null; bg: string | null; strike: boolean }> = {
  changed: { family: 'warning', stripe: 'var(--c-warning-600)', bg: 'var(--c-warning-50)', strike: false },
  invalid: { family: 'danger', stripe: 'var(--c-danger-600)', bg: 'var(--c-danger-50)', strike: false },
  removed: { family: 'danger', stripe: 'var(--c-danger-600)', bg: 'var(--c-danger-50)', strike: true },
  gone: { family: 'neutral', stripe: null, bg: null, strike: true },
  pasted: { family: 'info', stripe: 'var(--c-info-600)', bg: 'var(--c-info-50)', strike: false },
};

// Item · per parent · in total · values · status · the row's menu. The values
// column is only there when the caller has values to put in it, so a tree that
// does not read them keeps its old width. Edit mode swaps the values column
// out and widens the last one for the row's own edit controls.
const COLUMNS = (values: boolean, editing: boolean) => (editing
  ? 'minmax(0, 1fr) 112px 84px 104px 132px'
  : values
    ? 'minmax(0, 1fr) 84px 84px 116px 104px 44px'
    : 'minmax(0, 1fr) 90px 90px 110px 44px');
const rowSx = (values: boolean, editing: boolean) => ({ display: 'grid', gridTemplateColumns: COLUMNS(values, editing), gap: 1, px: 1.5 } as const);

/** One step of indentation, with the hairline that shows which parent a row belongs to (§4.7). */
function Guides({ depth }: { depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <Box key={i} aria-hidden sx={{ width: 18, flexShrink: 0, alignSelf: 'stretch', borderLeft: '1px solid var(--c-divider)' }} />
      ))}
    </>
  );
}

/**
 * The BOM, drawn the same way everywhere it appears (DESIGN_SYSTEM.md §4.7):
 * indented rows, each with its quantity per parent and its total. The root is a
 * row like the rest — it sits at its own depth and carries its own quantity —
 * so a BOM reads as one list rather than a heading with a table under it.
 * What a row may do is decided by the caller, which knows whose BOM it is.
 *
 * A row can also be selected, and what the caller draws for the selected row
 * (its specification values) opens inside it. Selection moves on ↑ / ↓ and the
 * branch opens and closes on → / ←, because the job this tree exists for is
 * filling in a hundred nodes without reaching for the mouse.
 *
 * In edit mode the caller draws the quantity, the flow and the row's own
 * controls, and marks what is waiting to be saved; the tree only lays it out.
 */
export function BomTree({
  rows, label, actionsFor, onToggle, onAction, footer, busy = false, selectedKey = null, onSelect, valueCell, editorFor,
  editing = false, quantityCell, flowCell, trailingCell, markOf,
}: {
  rows: BomRow[];
  /** Something is still being read into the rows — announced rather than narrated. */
  busy?: boolean;
  /** Names the tree for screen readers. */
  label: string;
  actionsFor: (row: BomRow) => BomAction[];
  onToggle: (key: string) => void;
  onAction: (action: BomAction, row: BomRow) => void;
  /** Shown under the last row — the empty state when nothing hangs below the root. */
  footer?: ReactNode;
  /** The row whose panel is open. Rows become selectable as soon as `onSelect` is given. */
  selectedKey?: string | null;
  /**
   * `keepFocus` means the arrows are walking the tree: the row stays focused so
   * the next arrow works, and whatever opens below must not take the cursor.
   */
  onSelect?: (row: BomRow | null, opts?: { keepFocus?: boolean }) => void;
  /** The "Values" column's content for one row; the column appears only when this is given. */
  valueCell?: (row: BomRow) => ReactNode;
  /** Opened inside the selected row, under it. */
  editorFor?: (row: BomRow) => ReactNode;
  /** Edit mode: the columns become quantity, total, status and the row's own controls. */
  editing?: boolean;
  /** Edit mode: what stands in the "Per parent" column. */
  quantityCell?: (row: BomRow) => ReactNode;
  /** Edit mode: what stands where the flow tag is. */
  flowCell?: (row: BomRow) => ReactNode;
  /** Edit mode: the last column, in place of the row's menu. */
  trailingCell?: (row: BomRow) => ReactNode;
  /** Edit mode: how a row waiting to be saved is marked, or null. */
  markOf?: (row: BomRow) => RowMark | null;
}) {
  const company = useCompanySlug();
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: BomRow } | null>(null);
  const menuActions = menu ? actionsFor(menu.row) : [];
  const refs = useRef(new Map<string, HTMLDivElement>());
  // Focus follows selection only when the keys moved it, so clicking a row (or
  // jumping to the next gap, which focuses a field) does not steal it back.
  const navigating = useRef(false);
  const withValues = !!valueCell && !editing;
  const SX = rowSx(withValues, editing);
  // A selected row can fold away under a collapsed parent, or go with a reload.
  // Without this the roving tabindex would leave no row reachable by Tab at all.
  const onScreen = rows.some((r) => r.node.key === selectedKey);

  useEffect(() => {
    if (!navigating.current) return;
    navigating.current = false;
    if (selectedKey) refs.current.get(selectedKey)?.focus();
  }, [selectedKey]);

  const move = (from: number, delta: number) => {
    const to = rows[from + delta];
    if (!to || !onSelect) return;
    navigating.current = true;
    onSelect(to, { keepFocus: true });
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>, row: BomRow, i: number) => {
    if (!onSelect) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(i, 1); break;
      case 'ArrowUp': e.preventDefault(); move(i, -1); break;
      case 'Home': e.preventDefault(); move(i, -i); break;
      case 'End': e.preventDefault(); move(i, rows.length - 1 - i); break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.hasChildren && !row.open) onToggle(row.node.key); else move(i, 1);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if (row.hasChildren && row.open) { onToggle(row.node.key); break; }
        // Otherwise up to the parent: the nearest row above at a shallower depth.
        for (let j = i - 1; j >= 0; j -= 1) if (rows[j].node.depth < row.node.depth) { move(i, j - i); break; }
        break;
      }
      // Opens the row's values and puts the cursor in the first gap. Not a
      // toggle: someone who arrowed here pressed Enter to start typing.
      case 'Enter':
      case ' ':
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onSelect(row);
        break;
      case 'Escape':
        if (selectedKey === row.node.key) { e.preventDefault(); onSelect(null); }
        break;
      default:
    }
  };

  return (
    <Box role="tree" aria-label={label} aria-busy={busy || undefined} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflowX: 'auto' }}>
      <Box sx={{ minWidth: editing ? 780 : withValues ? 820 : 720 }}>
        <Box sx={{ ...SX, py: 1, borderBottom: '1px solid var(--c-divider)', color: 'var(--c-text-3)', fontSize: 12, fontWeight: 600 }}>
          <span>Item</span>
          <Box sx={{ textAlign: 'right' }}>Per parent</Box>
          <Box sx={{ textAlign: 'right' }} title="Quantity per parent, multiplied by everything above it.">In total</Box>
          {withValues && <Box title="Required specification values that are still empty. They stop the item being activated, and a draft item stops release.">Values</Box>}
          <span>Status</span>
          {editing ? <Box sx={{ textAlign: 'right', pr: 0.5 }}>Edit</Box> : <span />}
        </Box>
        {rows.map((row, i) => {
          const n = row.node;
          const actions = editing ? [] : actionsFor(row);
          const selected = selectedKey === n.key;
          const editor = selected ? editorFor?.(row) : null;
          const mark = markOf?.(row) ?? null;
          const look = mark ? MARK[mark.tone] : null;
          return (
            <Box key={n.key} role="treeitem" aria-level={n.depth + 1} aria-expanded={row.hasChildren ? row.open : undefined}
              aria-selected={onSelect ? selected : undefined}
              tabIndex={onSelect ? (selected || (!onScreen && i === 0) ? 0 : -1) : undefined}
              ref={(el: HTMLDivElement | null) => { if (el) refs.current.set(n.key, el); else refs.current.delete(n.key); }}
              onKeyDown={(e) => onRowKeyDown(e, row, i)}
              sx={{
                borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
                '&:focus-visible': { outline: '2px solid var(--c-focus)', outlineOffset: '-2px' },
              }}>
              {/* The click lives on the visual row, not on the item: what opens
                  below it is a form, and clicking inside a form is not a click
                  on the row that holds it. */}
              <Box
                onClick={(e) => {
                  if (!onSelect || (e.target as HTMLElement).closest('a, button')) return;
                  onSelect(selected ? null : row);
                }}
                sx={{
                  ...SX, py: 0.75, alignItems: 'center',
                  background: selected ? 'var(--c-primary-50)' : look?.bg ?? undefined,
                  boxShadow: selected ? 'inset 3px 0 0 var(--c-primary-600)' : look?.stripe ? `inset 3px 0 0 ${look.stripe}` : undefined,
                  '&:hover': { background: selected ? 'var(--c-primary-50)' : look?.bg ?? 'var(--c-surface-2)' },
                  ...(onSelect && { cursor: 'pointer' }),
                }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                  <Guides depth={n.depth} />
                  {row.hasChildren ? (
                    <IconButton size="small" aria-label={row.open ? `Collapse ${n.code ?? n.name}` : `Expand ${n.code ?? n.name}`} onClick={() => onToggle(n.key)} sx={{ p: 0.25, flexShrink: 0 }}>
                      {row.open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                    </IconButton>
                  ) : <Box sx={{ width: 26, flexShrink: 0 }} />}
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      {n.lineNo != null && <Mono muted>{n.lineNo}</Mono>}
                      {/* A copy that is not saved yet has no record to link to — and will not carry this code. */}
                      {row.paste
                        ? <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Copy of <Mono>{n.code ?? n.name}</Mono></Typography>
                        : <Mono sx={look?.strike ? STRUCK : undefined}><Link to={appPath(company, recordPath(n.kind, n.id))}>{n.code ?? '—'}</Link></Mono>}
                      <KindChip kind={n.kind} />
                      {flowCell ? flowCell(row) : <FlowTag flow={n.flow} />}
                      {mark && <Badge family={look?.family ?? 'neutral'} label={mark.label} title={mark.title} noIcon={mark.tone === 'gone'} />}
                      {n.selection && !n.resolved && <WarnBadge label="Choose item" title={`Choose a catalog item for ${n.selection.code ?? n.selection.name}.`} />}
                    </Box>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(look?.strike && STRUCK) }}>
                      {n.name}{n.role ? ` · ${n.role}` : ''}{n.selection && n.resolved ? ` · for ${n.selection.code ?? n.selection.name}` : ''}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right', minWidth: 0 }}>{quantityCell ? quantityCell(row) : <Mono>×{n.quantity}</Mono>}</Box>
                <Box sx={{ textAlign: 'right' }}><Mono>{n.total}</Mono>{n.uom && <Mono muted> {n.uom}</Mono>}</Box>
                {withValues && <Box sx={{ minWidth: 0 }}>{valueCell?.(row)}</Box>}
                <Box sx={{ minWidth: 0 }}><StatusBadge status={n.status} /></Box>
                <Box sx={editing ? { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.25, minWidth: 0 } : undefined}>
                  {editing ? trailingCell?.(row) : actions.length > 0 && (
                    <Tooltip title="Actions">
                      <IconButton size="small" aria-label={`Actions for ${n.code ?? n.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, row })}><MoreVertRounded fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
              {editor}
            </Box>
          );
        })}
        {footer}
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menuActions.map((action) => (
          <MenuItem key={action} onClick={() => { if (menu) onAction(action, menu.row); setMenu(null); }}
            sx={action === 'remove' ? { color: 'var(--c-danger-700)' } : undefined}>
            {ACTION_LABEL[action]}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
