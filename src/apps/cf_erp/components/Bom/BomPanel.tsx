import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, FormControlLabel, IconButton, Menu, MenuItem, Popover, Switch, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import RestoreFromTrashRounded from '@mui/icons-material/RestoreFromTrashRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import type { BomType, Flow, StructureNode } from '../../api/types';
import type { BomChangesResponse } from '../../api/bomChanges';
import { placeholderTitle } from '../../api/placeholders';
import { cutPiecesNote } from '../../api/cutPieces';
import { cfApi, CfApiError } from '../../api/client';
import { applyBomSheet, downloadBomSheet, fileToBase64, previewBomSheet, type BomSheetResult } from '../../api/bomSheet';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { ORDER_STATUS_LABEL, bomPermission } from '../../lib/orders';
import { rememberLineSize } from '../../lib/working';
import { DangerBadge, EmptyState, ErrorNotice, Fact, Mono, SectionCard, SkeletonRows, StatusBadge, Surface, WarnBadge } from '../ui';
import { AddChildDialog, EditLineDialog } from '../BomDialogs';
import { ChooseItemDialog } from '../ChooseItemDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { FlowPicker } from '../FlowPicker';
import { FlowTag } from '../FlowTag';
import { useToast } from '../toastContext';
import {
  allowedChildren, bomTypeOfKind, keysBelow, lineFlowId, nodesByLine, openableKeys,
  parseQuantity, pasteRefusal, pendingChanges, temporaryCount, walkNodes,
  NO_PENDING, VALUES_PERMISSION, cutChip, isCutPiece, withoutCutPieces, type BomRow, type Pending,
} from './bomModel';
import type { BomAction, RowMark } from './BomTree';
import { BomSheetDialog } from './BomSheetDialog';
import { useSpecValues } from './useSpecValues';
import { LOCKED_ORDER, useBom, type BomSource } from './useBom';
import { BomGrid, type GridWrite } from './BomGrid';
import { arrangedRows, duplicateBelow, moveRow, pruneArrangement, undoCopy, type DropPosition } from './bomArrangement';
import type { ValuesView } from '../Values/valuesModel';

const TYPE_TEXT: Record<BomType, { title: string; body: string; empty: string }> = {
  standard: {
    title: 'Standard BOM',
    body: 'What this catalog item is made of, every time. Catalog items only.',
    empty: 'Add the first catalog item it is made of.',
  },
  template: {
    title: 'Template BOM',
    body: 'The usual structure of this blueprint. An order lays it out as its own rows, which can then be changed freely.',
    empty: 'Add the first item or definition it is made of.',
  },
  custom: {
    title: 'Custom BOM',
    body: 'This order’s own structure. Its rows are designs: their pieces get codes when the line is locked.',
    empty: 'Add catalog items, templates (each is laid out as rows) or selections.',
  },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sameNumber = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const copyText = (role: string | null) => (role ? (role.endsWith('(copy)') ? role : role + ' (copy)') : null);

/**
 * Warns before pending edits are lost by leaving: closing or reloading the tab,
 * following a link, switching a tab, or picking another line from a list. The
 * app runs on a plain BrowserRouter, which cannot hold a route change back, so
 * the clicks (and Enter / Space on a tab) that would unmount this panel are
 * caught on their way down — before React sees them — and let through only if
 * the person agrees. A picker's own list is not leaving, so it is let alone.
 * The browser's Back button is the one way out this does not catch.
 */
function useLeaveGuard(active: boolean, message: string) {
  useEffect(() => {
    if (!active) return undefined;
    const leaving = (el: Element | null): boolean => {
      if (!el || el.closest('.MuiAutocomplete-popper')) return false;
      const link = el.closest('a[href]');
      if (link) return link.getAttribute('target') !== '_blank' && !link.hasAttribute('download');
      if (el.closest('[role="tab"][aria-selected="false"]')) return true;
      return false;
    };
    const hold = (e: Event) => { if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); } };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (leaving(e.target instanceof Element ? e.target : null)) hold(e);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest('[role="tab"][aria-selected="false"]')) hold(e);
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, message]);
}

/** A compact icon button for a row's edit controls — always labelled, since it shows no text. */
function RowButton({ label, onClick, children, pressed, danger, disabled }: {
  label: string; onClick: () => void; children: ReactNode; pressed?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}
          sx={{
            color: danger ? 'var(--c-danger-700)' : pressed ? 'var(--c-primary-700)' : 'var(--c-text-2)',
            background: pressed ? 'var(--c-primary-50)' : undefined,
          }}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

/**
 * Every BOM on screen: a record's own on its BOM tab, and the whole structure a
 * sales line sells on the order's Structure tab. One tree, one set of rows, one
 * set of actions — the root is a row at its own depth like every other, and what
 * may be changed is worked out per row from the BOM that holds the line, the way
 * the backend does it (routes/boms.js `permFor`).
 *
 * The grid changes many lines at once: quantities and values, flows chosen,
 * lines marked to remove, copied or moved — all held here, marked on the
 * rows, and sent together by Save (POST /bom-changes, all or nothing). It reaches
 * exactly the rows the per-line menus reach, by the same `mine` rule.
 */
export function BomPanel({ source, ownsBom = false, showWhereUsed = false, onChanged }: {
  source: BomSource;
  /** This screen is the BOM's home: its own lines are changed here, and its status and revision are managed here. */
  ownsBom?: boolean;
  /** A record's own tab also answers "where else is this used?". */
  showWhereUsed?: boolean;
  /** Reloads the screen around it — a change moves roll-ups and counts above. */
  onChanged?: () => void;
}) {
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const bom = useBom(source, { whereUsed: showWhereUsed, onChanged });
  const state = bom.state;
  const orderGrid = source.kind === 'orderLine';
  const gridLineId = source.kind === 'orderLine' ? source.lineId : null;
  const gridValues = useLoad(() => gridLineId == null ? Promise.resolve(null) : cfApi.get<ValuesView>(`/order-lines/${gridLineId}/values`), [gridLineId, state?.root]);
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [adding, setAdding] = useState<StructureNode | null>(null);
  const [editing, setEditing] = useState<BomRow | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<BomRow | null>(null);
  const [sheet, setSheet] = useState<{ file: File; base64: string; result: BomSheetResult } | null>(null);
  const [sheetBusy, setSheetBusy] = useState<'download' | 'preview' | 'apply' | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);

  // ── edit mode's own state ─────────────────────────────────────────────────
  const [pending, setPending] = useState<Pending>(NO_PENDING);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  /** A dry run's answer, kept with the pending state it answered for — any edit makes it stale. */
  const [checked, setChecked] = useState<{ for: Pending; out: BomChangesResponse } | null>(null);
  const [confirming, setConfirming] = useState<'save' | null>(null);
  const [flowPick, setFlowPick] = useState<{ anchor: HTMLElement; row: BomRow } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; row: BomRow } | null>(null);
  const pasteNo = useRef(0);
  // Quiet switches for the order's grid: the automatic cut pieces are out of sight, and so are the columns no row uses.
  const [showCut, setShowCut] = useState(false);
  const [onlyUsed, setOnlyUsed] = useState(true);
  const errorAt = useRef<HTMLDivElement>(null);
  // A refusal lands at the top of the panel while the person is at the bar
  // below a long tree — so it is brought into view, once it has rendered. A
  // jump, not an animation: it is the answer to what they just pressed.
  const [showRefusal, setShowRefusal] = useState(0);
  useEffect(() => {
    if (showRefusal) errorAt.current?.scrollIntoView({ block: 'start' });
  }, [showRefusal]);

  // The slow screens after this one (Lock, release) quote how big the line is.
  useEffect(() => { if (gridLineId != null && state) rememberLineSize(gridLineId, { rows: state.stats.nodes - 1 }); }, [gridLineId, state]);

  // Open everything the first time; after that the person's choice stands across reloads.
  const expanded = useMemo(() => open ?? new Set(state ? openableKeys(state.root) : []), [open, state]);

  // Every node of the structure, open or shut — what the values sweep reads and
  // what "the next gap" walks, so a jump can reach into a folded branch.
  const flat = useMemo(() => (state ? walkNodes(state.root) : []), [state]);
  const ids = useMemo(() => flat.map((f) => f.node.id), [flat]);
  const values = useSpecValues(ids, !!state && !orderGrid);
  /**
   * What this screen is about at all: the BOM it was opened for, and an order's
   * own temporary items. Anything else in the tree belongs to another record and
   * is changed there — the backend wants that record's grant, so offering it
   * here would only fail. (Before the tree has loaded nothing is anybody's.)
   */
  const frozen = state?.frozen ?? true;
  const mine = (node: StructureNode | null) => !frozen
    && !!node && (node.kind === 'temporary' || (node.depth === 0 && ownsBom));
  /**
   * Whether the lines of one record's BOM may be changed from this screen.
   */
  const mayEdit = (holder: StructureNode | null, bomType: BomType | null) => mine(holder)
    && bomType != null && isPermitted(bomPermission(bomType === 'custom'));
  /** Edit mode is offered when there is anything at all this person may change here. */
  const canEditHere = !!state && (mayEdit(state.root, state.bomType) || flat.some(({ node }) => node.kind === 'temporary' && mayEdit(node, 'custom'))
    || !orderGrid && ownsBom && !frozen && isPermitted(VALUES_PERMISSION));
  /**
   * A LOCKED line, not yet released: only how each of the order's own rows is
   * made (its flow) may change (user, 2026-09-30). Edit mode opens for that
   * alone — every other cell, copy, move and removal stays read-only.
   */
  const flowsOnly = !!state?.flowsOnly;
  const canChangeFlowsHere = flowsOnly && isPermitted(bomPermission(true)) && flat.some(({ node }) => node.kind === 'temporary');
  const canSheetEdit = !!state && !frozen && (source.kind === 'record'
    ? ownsBom && isPermitted(bomPermission(state.bomType === 'custom'))
    : isPermitted(bomPermission(true)));
  const editOn = canEditHere || canChangeFlowsHere;

  // What is waiting, as Save would send it.
  const byLine = useMemo(() => (state ? nodesByLine(state.root) : new Map<number, StructureNode>()), [state]);
  const { changes, invalid } = useMemo(() => pendingChanges(pruneArrangement(pending, state?.root), byLine), [pending, byLine, state]);
  const invalidKeys = useMemo(() => new Set(invalid), [invalid]);
  const dirty = changes.length > 0 || invalid.length > 0;
  useLeaveGuard(editOn && dirty, `${plural(changes.length + invalid.length, 'change', 'changes')} to this BOM ${changes.length + invalid.length === 1 ? 'is' : 'are'} not saved. Leave and lose ${changes.length + invalid.length === 1 ? 'it' : 'them'}?`);

  // Rows marked to go, and every row that goes with them.
  const removedKeys = useMemo(() => new Set(Object.keys(pending.remove).map((id) => byLine.get(Number(id))?.key).filter((k): k is string => !!k)), [pending.remove, byLine]);
  const goneKeys = useMemo(() => {
    const out = new Set<string>();
    for (const id of Object.keys(pending.remove)) { const n = byLine.get(Number(id)); if (n) keysBelow(n, out); }
    return out;
  }, [pending.remove, byLine]);

  const allRows = useMemo(() => state ? arrangedRows(state.root, expanded, pending) : [], [state, expanded, pending]);
  // Cut pieces are made by the system after every save; hidden, the grid shows the designs the person drew.
  const cutCount = orderGrid ? flat.filter((f) => f.node.role === 'Cut from').length : 0;
  const hideCut = orderGrid && !showCut;
  const rows = useMemo(() => (hideCut ? withoutCutPieces(allRows) : allRows), [allRows, hideCut]);
  const cutChipOf = (row: BomRow): string | null => (hideCut ? cutChip(row.node) : null);

  // A flow's code for a chosen id — read once, only while editing.
  const flows = useLoad(() => (editOn ? cfApi.get<Flow[]>('/flows') : Promise.resolve(null)), [editOn]);
  const flowById = useMemo(() => new Map((flows.data ?? []).map((f) => [f.id, f])), [flows.data]);

  const usedCard = (
    <SectionCard title="Where it is used" subtitle="BOMs that hold it — directly, or as the item chosen for a selection.">
      <ErrorNotice error={bom.whereUsedError} onRetry={bom.reloadWhereUsed} />
      {bom.whereUsed.length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>Not used in any BOM.</Typography> : (
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          {bom.whereUsed.map((u) => (
            <Box key={u.lineId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
              <Mono><Link to={appPath(company, recordPath(u.parent.kind, u.parent.id))}>{u.parent.code ?? '—'}</Link></Mono>
              <Typography sx={{ flex: 1, fontSize: 13, minWidth: 140 }}>{u.parent.name}</Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{TYPE_TEXT[u.bomType].title}{u.via === 'selection' ? ' · via selection' : ''}</Typography>
              {u.order && <Mono muted><Link to={appPath(company, `orders/${u.order.id}`)}>{u.order.code}</Link></Mono>}
              <Mono>×{u.quantity}</Mono>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );

  if (bom.error) return <ErrorNotice error={bom.error} onRetry={bom.reload} />;
  if (!state) return <SkeletonRows rows={5} height={40} />;

  const root = state.root;
  const label = root.code ?? root.name;
  // Whether this record holds a BOM at all is the server's call (`canHaveBom`);
  // its kind only names the BOM when there is one.
  const holdsBom = state.canHaveBom ?? state.bomType != null;
  const type = holdsBom && state.bomType ? TYPE_TEXT[state.bomType] : null;
  if (!type) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <SectionCard title="No BOM"><Typography sx={{ color: 'var(--c-text-2)' }}>A selection definition chooses an existing catalog item, so it has no BOM of its own.</Typography></SectionCard>
        {showWhereUsed && usedCard}
      </Box>
    );
  }
  const custom = state.bomType === 'custom';

  /**
   * Whether a node's specification values may be typed here. The same reach as
   * the line actions — frozen, released and closed-order cases included, because
   * `mine` carries them — but a different grant: `PUT /records/:id/values` is
   * `PERM.catalog` whatever the node belongs to (see `VALUES_PERMISSION`).
   */
  const mayEditValues = (node: StructureNode) => mine(node) && isPermitted(VALUES_PERMISSION);
  /**
   * What a node may be given. The server answered for the root of a record's
   * own BOM; deeper nodes of an order's structure were never asked about, so
   * those fall back to the local table — and a node that holds no BOM offers
   * nothing rather than somebody else's list.
   */
  const allowedUnder = (node: StructureNode) => allowedChildren(
    bomTypeOfKind(node.kind),
    node.key === root.key ? state.allowedChildKinds : null,
  );
  const canAddToRoot = mayEdit(root, state.bomType) && allowedUnder(root).length > 0;
  const actionsFor = (row: BomRow): BomAction[] => {
    const list: BomAction[] = [];
    if (mayEdit(row.node, bomTypeOfKind(row.node.kind)) && allowedUnder(row.node).length > 0) list.push('add');
    if (mayEdit(row.parent, row.bomType)) {
      if (row.node.selection) list.push('choose');
      list.push('change', 'remove');
    }
    return list;
  };
  const onAction = (action: BomAction, row: BomRow) => {
    if (action === 'add') setAdding(row.node);
    else if (action === 'choose') setChoosing(row.node.lineId);
    else if (action === 'change') setEditing(row);
    else setRemoving(row);
  };

  // Why it cannot be changed — said here, rather than leaving a tree with no
  // menus and no explanation, or letting a save come back as a bare refusal.
  const why: ReactNode = state.line?.lineType === 'standard' ? (
    <>
      This is <Mono>{label}</Mono>’s Standard BOM, shared by every order that sells it. Change it on{' '}
      <Link to={appPath(company, `${recordPath(root.kind, root.id)}?tab=bom`)}>the item itself</Link>.
    </>
  ) : root.status === 'obsolete'
    ? `${label} is obsolete, so its lines cannot change. Reactivate the record to edit them.`
    : state.order && LOCKED_ORDER.includes(state.order.status)
      ? `Order ${state.order.code} is ${ORDER_STATUS_LABEL[state.order.status].toLowerCase()}, so everything made for it is frozen.`
      : state.flowsOnly
        ? `${state.line ? `Line ${state.line.lineNo}` : 'Its line'} is locked, so its structure, quantities and values no longer change.${canChangeFlowsHere ? ' How each row is made can still change until the line is released: click the flow under a row’s name, then Save.' : ''}`
      : state.released
        ? `Released to production${state.order ? ` on order ${state.order.code}` : ''}${state.line ? `, line ${state.line.lineNo}` : ''}, so its structure is frozen. Take the release back — while nothing has started — to change it.`
        : !isPermitted(bomPermission(custom))
          ? `You can see this ${type.title}, but your role cannot change ${custom ? 'an order’s structure' : 'the catalog'}.`
          : null;

  // ── the values on the tree ────────────────────────────────────────────────
  // A node whose required values are still empty is what stops its line being
  // locked (and a catalog item being activated) — so the count is a column of
  // its own rather than something you find by opening each node.
  const order = flat.map((f) => f.node);
  const gapsAt = (node: StructureNode) => (mayEditValues(node) ? values.get(node.id)?.missing.length ?? 0 : 0);
  const gapNodes = order.filter((n) => gapsAt(n) > 0);
  const gapIds = new Set(gapNodes.map((n) => n.id));
  const gapCount = orderGrid ? gridValues.data?.counts.missingOwn ?? 0 : [...gapIds].reduce((n, id) => n + (values.get(id)?.missing.length ?? 0), 0);

  // ── edit mode ─────────────────────────────────────────────────────────────
  /** A line this screen may change, and that is not going with a removal above it. */
  const lineEditable = (row: BomRow) => !row.paste && row.node.lineId != null
    && mayEdit(row.parent, row.bomType) && !goneKeys.has(row.node.key);
  /** A line whose flow may change: any line this screen may change, and on a locked line an order row's line. */
  const flowEditable = (row: BomRow) => lineEditable(row)
    || (canChangeFlowsHere && !row.paste && row.node.lineId != null && row.parent?.kind === 'temporary' && !goneKeys.has(row.node.key));
  /** A flow is how a thing is made in its parent; a selection takes its chosen item's (EditLineDialog's rule). */
  const canHaveFlow = (node: StructureNode) => !node.selection && node.kind !== 'selection';
  /** Why a line cannot change from here — the words the per-line menus would use. */
  const whyNotLine = (row: BomRow): string => {
    const p = row.parent;
    const pl = p ? p.code ?? p.name : '';
    if (!p) return '';
    if (goneKeys.has(row.node.key)) return 'It goes with the line above it that is being removed.';
    if (flowsOnly && p.kind === 'temporary') return 'The line is locked. Only how it is made can change, until the line is released.';
    if (p.kind === 'catalog') return `${pl}’s Standard BOM is shared by everything that uses it — change it on ${pl} itself.`;
    if (p.kind === 'template') return `${pl}’s Template BOM is changed on the template itself.`;
    return `${pl} is not this screen’s to change.`;
  };
  const onGridWrites = (writes: GridWrite[]) => setPending((p) => {
    const next = { ...p, quantity: { ...p.quantity }, values: { ...p.values }, pastes: [...p.pastes] };
    for (const w of writes) {
      if (w.code === '$quantity') {
        if (w.row.paste) next.pastes = next.pastes.map((x) => x.key === w.row.paste?.key ? { ...x, quantity: w.text } : x);
        else if (w.row.node.lineId != null) {
          const id = w.row.node.lineId, savedQuantity = byLine.get(id)?.quantity ?? Number(w.saved);
          if (parseQuantity(w.text) === savedQuantity) delete next.quantity[id];
          else next.quantity[id] = w.text;
        }
      } else {
        const id = w.row.node.id, cells = { ...next.values[id] };
        if (w.text === w.saved) delete cells[w.code]; else cells[w.code] = w.text;
        next.values[id] = cells;
      }
    }
    return next;
  });
  const duplicate = (row: BomRow) => {
    if (busy) return;
    if (Object.keys(pending.remove).length) { toast.info('Save or discard removals before copying rows.'); return; }
    if (!row.parent || row.node.lineId == null) return;
    const key = `copy-${++pasteNo.current}`;
    const source = { ...row.node, role: copyText(roleOf(row)) };
    setPending((p) => duplicateBelow(p, row, { key, sourceLineId: row.node.lineId as number, source, parentId: row.parent!.id,
      parentKey: row.parent!.key, quantity: p.quantity[row.node.lineId as number] ?? String(row.node.quantity) }));
    setOpen(new Set([...expanded, row.parent.key]));
  };
  const dropRefusal = (from: BomRow, to: BomRow, position: DropPosition): string | null => {
    if (!editOn || busy) return 'This structure cannot be changed right now.';
    if (Object.keys(pending.remove).length) return 'Save or discard removals before moving rows.';
    if (!from.parent || (!from.paste && !lineEditable(from))) return 'This row cannot move here.';
    if (from.node.key === to.node.key) return 'Choose a different row.';
    const target = position === 'inside' ? to.node : to.parent;
    if (!target) return 'Drop inside the root or beside one of its rows.';
    if (to.paste && position === 'inside') return 'Save a new copy before moving rows inside it.';
    if (!mayEdit(target, bomTypeOfKind(target.kind))) return 'This shared BOM is changed on the item itself.';
    if ([from.node.key, to.node.key, target.key].some((k) => removedKeys.has(k) || goneKeys.has(k))) return 'Keep the removed row before moving it or using it as a destination.';
    if (target.id === from.node.id || keysBelow(from.node).has(target.key)) return 'A row cannot go inside itself or its children.';
    return pasteRefusal(from.node, from.node.key, target, rows.map((r) => ({ node: r.node, parentKey: r.parent?.key ?? null })));
  };
  const onGridMove = (from: BomRow, to: BomRow, position: DropPosition) => {
    const refusal = dropRefusal(from, to, position);
    if (refusal) { toast.info(refusal); return; }
    setPending((p) => moveRow(p, from, to, position));
    if (position === 'inside') setOpen(new Set([...expanded, to.node.key]));
  };
  const setFlow = (row: BomRow, flowId: number | null) => {
    const id = row.node.lineId as number;
    setPending((p) => {
      const flow = { ...p.flow };
      if ((flowId ?? null) === lineFlowId(row.node)) delete flow[id];
      else flow[id] = flowId;
      return { ...p, flow };
    });
  };
  /** The description as it will be: what was typed, else what is saved. */
  const roleOf = (row: BomRow): string | null => {
    const id = row.node.lineId;
    const typed = !row.paste && id != null ? pending.role?.[id] : undefined;
    return (typed ?? row.node.role)?.trim() || null;
  };
  const canEditRole = (row: BomRow) => !busy && !row.paste && !isCutPiece(row.node) && lineEditable(row);
  const onRole = (row: BomRow, text: string) => {
    const id = row.node.lineId;
    if (id == null) return;
    setPending((p) => {
      const role = { ...p.role };
      if (text.trim() === (byLine.get(id)?.role ?? '')) delete role[id]; else role[id] = text;
      return { ...p, role };
    });
  };
  const toggleRemove = (row: BomRow) => {
    if (busy) return;
    if (changes.some((ch) => ch.op === 'arrange' || ch.op === 'paste')) { toast.info('Save or discard row moves and copies before removing rows.'); return; }
    const id = row.node.lineId as number;
    if (pending.remove[id]) {
      setPending((p) => { const remove = { ...p.remove }; delete remove[id]; return { ...p, remove }; });
      return;
    }
    // A change and a removal of the same thing cannot both be saved, so what
    // was waiting inside it goes — and it is said, not done quietly.
    const inside = keysBelow(row.node);
    const insideRecords = new Set(walkNodes(row.node).map((f) => f.node.id));
    const within = (lineId: string) => { const k = byLine.get(Number(lineId))?.key; return !!k && (k === row.node.key || inside.has(k)); };
    const dropped = Object.keys(pending.quantity).filter(within).length + Object.keys(pending.role ?? {}).filter(within).length + Object.keys(pending.flow).filter(within).length
      + Object.keys(pending.remove).filter((l) => byLine.get(Number(l))?.key !== row.node.key && within(l)).length
      + pending.pastes.filter((x) => x.parentKey === row.node.key || inside.has(x.parentKey)).length
      + Object.entries(pending.values ?? {}).filter(([id]) => insideRecords.has(Number(id))).reduce((n, [, cells]) => n + Object.keys(cells).length, 0);
    setPending((p) => {
      const keep = <T,>(rec: Record<number, T>) => Object.fromEntries(Object.entries(rec).filter(([l]) => !within(l))) as Record<number, T>;
      return {
        ...p,
        quantity: keep(p.quantity),
        flow: keep(p.flow),
        role: p.role ? keep(p.role) : undefined,
        remove: { ...keep(p.remove), [id]: true },
        pastes: p.pastes.filter((x) => x.parentKey !== row.node.key && !inside.has(x.parentKey)),
        values: Object.fromEntries(Object.entries(p.values ?? {}).filter(([recordId]) => !insideRecords.has(Number(recordId)))),
      };
    });
    if (dropped) toast.info(`${plural(dropped, 'change', 'changes')} inside ${row.node.code ?? row.node.name} went with it.`);
  };
  const discard = () => { setPending(NO_PENDING); setChecked(null); bom.clearActionError(); };
  const showError = () => setShowRefusal((n) => n + 1);

  const counts = {
    quantity: changes.filter((ch) => ch.op === 'quantity').length,
    flow: changes.filter((ch) => ch.op === 'flow').length,
    role: changes.filter((ch) => ch.op === 'role').length,
    remove: changes.filter((ch) => ch.op === 'remove').length,
    paste: changes.filter((ch) => ch.op === 'paste').length,
    arranged: changes.filter((ch) => ch.op === 'arrange').length,
    values: Object.values(pending.values ?? {}).reduce((n, cells) => n + Object.keys(cells).length, 0),
  };
  const breakdown = [
    counts.quantity && plural(counts.quantity, 'quantity', 'quantities'),
    counts.flow && plural(counts.flow, 'flow', 'flows'),
    counts.role && plural(counts.role, 'description', 'descriptions'),
    counts.remove && plural(counts.remove, 'removal', 'removals'),
    counts.paste && plural(counts.paste, 'copy', 'copies'),
    counts.arranged && 'row order',
    counts.values && plural(counts.values, 'value', 'values'),
  ].filter(Boolean).join(' · ');
  // What a removal deletes: its rows, everything below included.
  const removals = changes.flatMap((ch) => (ch.op === 'remove' ? [byLine.get(ch.lineId)].filter((n): n is StructureNode => !!n) : []));
  const doomedTemporary = removals.reduce((n, node) => n + temporaryCount(node), 0);
  const checkedNow = checked && checked.for === pending ? checked.out : null;

  const save = async () => {
    setBusy('save');
    const out = await bom.saveChanges(changes);
    setBusy(null);
    if (!out) {
      showError();
      return;
    }
    setPending(NO_PENDING);
    setChecked(null);
    if (orderGrid) gridValues.reload();
    if (!orderGrid) void values.refreshAll();
    const notes = out.results.flatMap((r) => (r?.op === 'paste' ? r.notes : []));
    toast.success(`Saved — ${out.summary.sentence}.`);
    if (notes.length) toast.info(notes[0]);
    const cut = cutPiecesNote(out.cutPieces);
    if (cut) toast[cut.tone](cut.text);
  };
  const onSave = () => { if (doomedTemporary > 0) setConfirming('save'); else void save(); };
  const check = async () => {
    setBusy('check');
    const snapshot = pending;
    const out = await bom.saveChanges(changes, { dryRun: true });
    setBusy(null);
    if (out) setChecked({ for: snapshot, out });
    else showError();
  };
  // A row has no code until its line is locked: the code its pieces will get stands in.
  const placeholderOf = (row: BomRow) => {
    const p = bom.placeholderOf(row.node);
    return p?.code ? { code: p.code, title: `${placeholderTitle(p)} # = numbered when the line is locked; a row with quantity 3 covers 2–4, so its code changes with the quantity (L1-1 becomes L1-#).` } : null;
  };

  const markOf = (row: BomRow): RowMark | null => {
    if (row.paste) {
      if (invalidKeys.has(row.paste.key)) return { tone: 'invalid', label: 'Fix quantity', title: 'A quantity is a number above zero.' };
      const deep = bomTypeOfKind(row.parent?.kind ?? 'catalog') === 'custom' && row.paste.source.kind === 'temporary';
      return { tone: 'pasted', label: 'New copy', title: deep ? 'Saved as new rows — it and everything below it, as they are saved now.' : 'Saved as another line to the same item.' };
    }
    const k = row.node.key;
    if (removedKeys.has(k)) {
      const t = temporaryCount(row.node);
      return { tone: 'removed', label: 'Removing', title: t ? `Deletes ${plural(t, 'row', 'rows')} with it when saved.` : 'The line goes; the item itself stays.' };
    }
    if (goneKeys.has(k)) return { tone: 'gone', label: 'Goes with it', title: 'A line above it is being removed.' };
    if (invalidKeys.has(k)) return { tone: 'invalid', label: 'Fix quantity', title: 'A quantity is a number above zero.' };
    const id = row.node.lineId;
    if (id == null) return null;
    const text = pending.quantity[id];
    const q = text != null ? parseQuantity(text) : null;
    const flowChanged = id in pending.flow && (pending.flow[id] ?? null) !== lineFlowId(row.node);
    const roleChanged = pending.role != null && id in pending.role && pending.role[id].trim() !== (row.node.role ?? '');
    if ((q != null && !sameNumber(q, byLine.get(id)?.quantity ?? q)) || flowChanged || roleChanged) return { tone: 'changed', label: 'Changed' };
    return null;
  };

  const flowCell = (row: BomRow) => {
    const n = row.node;
    if (row.paste || !flowEditable(row) || removedKeys.has(n.key) || !canHaveFlow(n)) return <FlowTag flow={n.flow} />;
    const id = n.lineId as number;
    const has = id in pending.flow;
    const chosen = has ? pending.flow[id] : undefined;
    const changed = has && (chosen ?? null) !== lineFlowId(n);
    const text = changed ? (chosen == null ? 'usual flow' : flowById.get(chosen)?.code ?? `flow ${chosen}`) : n.flow?.code ?? 'flow';
    return (
      <Box component="button" type="button" disabled={!!busy} onClick={(e) => setFlowPick({ anchor: e.currentTarget as HTMLElement, row })}
        aria-label={`How ${n.code ?? n.name} is made here: ${n.flow && !changed ? n.flow.code : text}${changed ? ' (changed)' : ''}. Choose another flow`}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 0.75, py: 0.125, borderRadius: 'var(--r-sm)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'nowrap', '& svg': { fontSize: 13 },
          border: `1px ${n.flow || changed ? 'solid' : 'dashed'} ${changed ? 'var(--c-warning-600)' : 'var(--c-border)'}`,
          background: changed ? 'var(--c-warning-50)' : 'var(--c-surface-2)',
          color: changed ? 'var(--c-warning-800)' : n.flow ? 'var(--c-text-2)' : 'var(--c-text-3)',
          '&:hover': { borderColor: 'var(--c-primary-400)' },
        }}>
        <RouteRounded />{text}
      </Box>
    );
  };

  const trailingCell = (row: BomRow) => {
    const n = row.node;
    const name = n.code ?? n.name;
    if (row.paste) {
      const key = row.paste.key;
      return <RowButton disabled={!!busy} label={`Take back the copy of ${name}`} onClick={() => setPending((p) => undoCopy(p, key))}><UndoRounded fontSize="small" /></RowButton>;
    }
    if (!lineEditable(row)) {
      if (!row.parent || goneKeys.has(n.key)) return null;
      return (
        <Tooltip title={whyNotLine(row)}>
          <Box component="span" tabIndex={0} aria-label={`Read only: ${whyNotLine(row)}`} sx={{ display: 'inline-flex', p: 0.75, color: 'var(--c-text-3)' }}><LockOutlined sx={{ fontSize: 16 }} /></Box>
        </Tooltip>
      );
    }
    const removed = removedKeys.has(n.key);
    return (
      <>
        {!removed && <Tooltip title={dirty ? 'Save changes before adding lines or editing details' : `More actions for ${name}`}><span><IconButton size="small" aria-label={`More actions for ${name}`} disabled={dirty || !!busy} onClick={(e) => setRowMenu({ anchor: e.currentTarget, row })}><MoreHorizRounded fontSize="small" /></IconButton></span></Tooltip>}
        {!removed && (
          <RowButton disabled={!!busy} label={`Copy ${name} below`}
            onClick={() => duplicate(row)}>
            <ContentCopyRounded fontSize="small" />
          </RowButton>
        )}
        <RowButton disabled={!!busy} label={removed ? `Keep ${name}` : `Remove ${name}`} danger={!removed} pressed={removed} onClick={() => toggleRemove(row)}>
          {removed ? <RestoreFromTrashRounded fontSize="small" /> : <DeleteOutlineRounded fontSize="small" />}
        </RowButton>
      </>
    );
  };

  const addingBomType = adding ? bomTypeOfKind(adding.kind) : null;
  const addingKinds = adding ? allowedUnder(adding) : [];
  const removingNode = removing?.node;
  const run = async (done: string, change: Promise<boolean>) => { if (await change) toast.success(done); };
  const addButton = (variant?: 'contained') => (
    <Button variant={variant} startIcon={<AddRounded />} onClick={() => setAdding(root)}>Add line</Button>
  );
  // Only worth offering once something below the first level can be folded away.
  const deep = state.stats.maxDepth > 1;
  const pickRow = flowPick?.row ?? null;
  const pickId = pickRow?.node.lineId ?? null;
  const pickValue = pickRow && pickId != null ? (pickId in pending.flow ? pending.flow[pickId] ?? null : lineFlowId(pickRow.node)) : null;
  // Rows, not items: what a copy makes afresh (cut plates are shared, catalog
  // items referenced) is the server's answer, and Check gives it exactly.
  const firstNewCode = checkedNow?.results.flatMap((r) => (r?.op === 'paste' ? r.items : []))[0]?.code ?? null;

  const doDownloadSheet = async () => {
    setSheetBusy('download');
    try {
      await downloadBomSheet(source);
      toast.success('Excel workbook downloaded.');
    } catch (e) {
      toast.error(e instanceof CfApiError ? e.message : 'Could not download the workbook.');
    } finally { setSheetBusy(null); }
  };
  const chooseSheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSheetBusy('preview');
    try {
      const base64 = await fileToBase64(file);
      const result = await previewBomSheet(source, base64);
      setSheet({ file, base64, result });
    } catch (e) {
      toast.error(e instanceof CfApiError ? e.message : 'Could not read that workbook.');
    } finally { setSheetBusy(null); }
  };
  const applySheet = async () => {
    if (!sheet) return;
    setSheetBusy('apply');
    try {
      const result = await applyBomSheet(source, sheet.base64);
      setSheet(null);
      toast.success(`Excel changes applied: ${result.summary.sentence}.`);
      bom.reload();
    } catch (e) {
      if (e instanceof CfApiError && e.problems.length) {
        setSheet({ ...sheet, result: { ...sheet.result, ok: false, problems: e.problems } });
      }
      toast.error(e instanceof CfApiError ? e.message : 'Could not apply the workbook.');
    } finally { setSheetBusy(null); }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      {bom.actionError && <Box ref={errorAt} sx={{ scrollMarginTop: 96 }}><ErrorNotice error={bom.actionError} sx={{ mb: 0 }} /></Box>}
      <SectionCard title={type.title} subtitle={type.body}
        actions={(
          // The card's action box never shrinks, so on a phone these would run
          // off the card; at min-content they stack instead.
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: 'min-content', sm: 'auto' }, '& > *': { whiteSpace: 'nowrap' } }}>
            <Button size="small" startIcon={sheetBusy === 'download' ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}
              onClick={doDownloadSheet} disabled={sheetBusy != null || dirty}>
              Download Excel
            </Button>
            {canSheetEdit && <>
              <Button size="small" startIcon={sheetBusy === 'preview' ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}
                onClick={() => sheetInput.current?.click()} disabled={sheetBusy != null || dirty}>
                Upload Excel
              </Button>
              <input ref={sheetInput} type="file" accept=".xlsx,.csv" hidden onChange={chooseSheet} />
            </>}
            {deep && <Button size="small" startIcon={<UnfoldMoreRounded />} onClick={() => setOpen(new Set(openableKeys(root)))}>Expand all</Button>}
            {deep && <Button size="small" startIcon={<UnfoldLessRounded />} onClick={() => setOpen(new Set([root.key]))}>Collapse all</Button>}
            {!orderGrid && <Button size="small" disabled={values.scanning || dirty || !!busy} startIcon={<PlaylistAddCheckRounded />} onClick={values.tooMany ? values.start : () => void values.refreshAll()}>{values.tooMany ? 'Read values' : 'Refresh values'}</Button>}
            {!dirty && !busy && canAddToRoot && addButton()}
          </Box>
        )}>
        {why && <Alert severity="info" sx={{ mb: 2 }}>{why}</Alert>}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          {state.bom && !custom && <Fact label="Status"><StatusBadge status={state.bom.status} /></Fact>}
          {state.bom && !custom && <Fact label="Revision"><Mono>{state.bom.revision ?? '—'}</Mono></Fact>}
          <Fact label="In the structure"><Mono>{state.stats.nodes - 1}</Mono></Fact>
          {state.stats.drafts > 0 && <Fact label="Still draft"><WarnBadge label={`${state.stats.drafts} draft`} title="Catalog items in the structure that are not active yet — release needs every one of them active." /></Fact>}
          {state.stats.unresolved > 0 && <Fact label="To choose"><WarnBadge label={`${state.stats.unresolved} selection${state.stats.unresolved > 1 ? 's' : ''}`} title="Choose a catalog item for each of them before release." /></Fact>}
          {gapCount > 0 && (
            <Fact label="Values missing">
              <DangerBadge label={`${gapCount} missing`}
                title="Required values that are still empty. The line cannot be locked until they are filled." />
            </Fact>
          )}
          {/* Worth naming only when the person did not arrive from the order itself. */}
          {state.order && !state.line && <Fact label="Order"><Mono><Link to={appPath(company, `orders/${state.order.id}`)}>{state.order.code}</Link></Mono></Fact>}
          <Box sx={{ flex: 1 }} />
          {/* In this row rather than the card's header, because this row wraps
              on a phone and the header's actions do not. */}
          {/* Status and revision belong to the BOM itself, so they are managed
              where the BOM lives — not on an order that happens to show it. */}
          {!dirty && !busy && ownsBom && state.bom && !custom && isPermitted(bomPermission(false)) && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {state.bom.status === 'draft' && <Button variant="contained" size="small" startIcon={<CheckCircleRounded />} onClick={() => run('BOM activated.', bom.setStatus('active'))}>Activate BOM</Button>}
              {state.bom.status === 'active' && <Button size="small" startIcon={<ArchiveRounded />} onClick={() => run('BOM marked obsolete.', bom.setStatus('obsolete'))}>Mark obsolete</Button>}
              {state.bom.status === 'obsolete' && <Button size="small" startIcon={<CheckCircleRounded />} onClick={() => run('BOM reactivated.', bom.setStatus('active'))}>Reactivate</Button>}
              {state.bom.status !== 'obsolete' && <Button size="small" startIcon={<HistoryRounded />} onClick={() => run('Revision moved on.', bom.revise())}>New revision</Button>}
            </Box>
          )}
        </Box>
        {state.truncated && <Box sx={{ mb: 1 }}><WarnBadge label="Deeper levels not shown" title="The structure is deeper than this view goes." /></Box>}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline', mb: 1, minHeight: 18, flexWrap: 'wrap' }}>
          {/* A count that moves every few frames is not worth announcing; the
              tree carries aria-busy instead (§6.8). */}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            {orderGrid ? gridValues.loading ? 'Reading values…' : ''
              : values.scanning ? `Checking values… ${values.done} of ${values.total}`
                : values.tooMany ? `${values.total} nodes — values are read on request.`
                  : ''}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {orderGrid && cutCount > 0 && (
            <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'var(--c-text-3)' } }}
              control={<Switch size="small" checked={showCut} onChange={(e) => setShowCut(e.target.checked)} />}
              label={`Show cut pieces (${cutCount})`} />
          )}
          {orderGrid && (
            <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, color: 'var(--c-text-3)' } }}
              control={<Switch size="small" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />}
              label="Only columns these rows use" />
          )}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            {flowsOnly ? 'Only flows can change · changes wait for Save' : 'Copy inserts a row below · drag to rearrange · changes wait for Save'}
          </Typography>
        </Box>
        <>
            <ErrorNotice error={gridValues.error} onRetry={gridValues.reload} />
            <BomGrid key={rows.map((r) => r.node.key).join('|')} rows={rows} view={gridValues.data ?? null} records={orderGrid ? undefined : values} recordIds={ids} pending={pending} busy={!!busy || !!sheetBusy || (orderGrid ? gridValues.loading : values.scanning)}
              canEdit={(row) => editOn && !removedKeys.has(row.node.key) && !goneKeys.has(row.node.key) && (!!row.paste || lineEditable(row) || row.node.depth === 0 && mine(row.node))}
              canEditValues={(row) => !removedKeys.has(row.node.key) && !goneKeys.has(row.node.key) && (orderGrid ? editOn && mine(row.node) : mayEditValues(row.node))}
              onToggle={(key) => { const next = new Set(expanded); if (next.has(key)) next.delete(key); else next.add(key); setOpen(next); }}
              onlyUsedColumns={orderGrid && onlyUsed} roleOf={roleOf} canEditRole={canEditRole} onRole={onRole} cutChipOf={cutChipOf}
              onWrites={onGridWrites} onMove={onGridMove} dropRefusal={dropRefusal} trailingCell={trailingCell} flowCell={flowCell} markOf={markOf} placeholderOf={placeholderOf}
              footer={root.children.length === 0 && pending.pastes.length === 0 && <EmptyState title="Nothing below it yet" action={canAddToRoot && addButton('contained')} />} />
        </>
      </SectionCard>

      <BomSheetDialog open={!!sheet} fileName={sheet?.file.name ?? ''} result={sheet?.result ?? null}
        busy={sheetBusy === 'apply'} onClose={() => setSheet(null)} onApply={applySheet} />

      {/* What is waiting, and the one way to save it. Sticky, so it is at hand
          wherever in a long tree the last change was made. */}
      {editOn && (
        <Box sx={{ position: 'sticky', bottom: 12, zIndex: 'var(--z-sticky)', minWidth: 0 }}>
          <Surface e={2} role="region" aria-label="Edit mode — changes waiting to be saved"
            sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, px: 2, py: 1.25, borderColor: dirty ? 'var(--c-warning-200)' : 'var(--c-border)' }}>
            <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }} aria-live="polite">
                {changes.length ? `${plural(changes.length, 'change', 'changes')} waiting` : 'No unsaved changes'}
                {breakdown && <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)' }}>{` · ${breakdown}`}</Box>}
              </Typography>
              {Object.keys(pending.remove).length > 0 && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>
                  Removals are saved on their own — Save removals first, then copy or move rows.
                </Typography>
              )}
              {counts.paste > 0 && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>
                  A copy can be edited once it is saved. Its description reads “… (copy)” until you change it.
                </Typography>
              )}
              {checkedNow && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-success-800)', mt: 0.25, overflowWrap: 'anywhere' }}>
                  Checked, nothing refused. Save would do this: {checkedNow.summary.sentence}.
                  {firstNewCode && <> First new code: <Mono>{firstNewCode}</Mono>.</>}
                </Typography>
              )}
            </Box>
            {invalid.length > 0 && <DangerBadge label={`${plural(invalid.length, 'quantity', 'quantities')} to fix`} title="A quantity is a number above zero. Save waits for it." />}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button onClick={discard} disabled={!dirty || !!busy}>Cancel</Button>
              <Tooltip title="Runs the save and takes it back — every problem it would meet, and what it would make.">
                <span>
                  <Button onClick={check} disabled={!changes.length || invalid.length > 0 || !!busy}
                    startIcon={busy === 'check' ? <CircularProgress size={14} color="inherit" /> : undefined}>
                    {busy === 'check' ? 'Checking…' : 'Check'}
                  </Button>
                </span>
              </Tooltip>
              <Button variant="contained" onClick={onSave} disabled={!changes.length || invalid.length > 0 || !!busy}
                startIcon={busy === 'save' ? <CircularProgress size={14} color="inherit" /> : undefined}>
                {busy === 'save' ? 'Saving…' : changes.length ? `Save ${plural(changes.length, 'change', 'changes')}` : 'Save'}
              </Button>
            </Box>
          </Surface>
        </Box>
      )}

      {showWhereUsed && usedCard}

      <Menu open={!!rowMenu} anchorEl={rowMenu?.anchor} onClose={() => setRowMenu(null)}>
        {rowMenu && actionsFor(rowMenu.row).filter((a) => a !== 'remove').map((action) => <MenuItem key={action} onClick={() => { onAction(action, rowMenu.row); setRowMenu(null); }}>
          {action === 'add' ? 'Add a line inside' : action === 'choose' ? 'Choose item' : 'Edit line details'}
        </MenuItem>)}
      </Menu>

      <Popover open={!!flowPick} anchorEl={flowPick?.anchor} onClose={() => setFlowPick(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <Box sx={{ p: 2, width: 340, maxWidth: 'calc(100vw - 32px)' }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
            How <Mono>{pickRow?.node.code ?? pickRow?.node.name}</Mono> is made in {pickRow?.parent?.code ?? pickRow?.parent?.name}
          </Typography>
          {pickRow && (
            <FlowPicker value={pickValue} flows={flows.data} autoFocus label="Made by, in this parent" helperText="Empty: the way it is usually made"
              onChange={(id) => { setFlow(pickRow, id); setFlowPick(null); }} />
          )}
        </Box>
      </Popover>

      <ConfirmDialog open={confirming === 'save'} danger confirmLabel={`Save ${plural(changes.length, 'change', 'changes')}`}
        title={`Save and remove ${plural(removals.length, 'line', 'lines')}?`}
        body={`${plural(doomedTemporary, 'row', 'rows')} ${doomedTemporary === 1 ? 'is' : 'are'} deleted with ${removals.length === 1 ? 'it' : 'them'}, everything below included. Everything else in this save happens with it, or nothing does.`}
        onClose={() => setConfirming(null)}
        onConfirm={async () => { setConfirming(null); await save(); }} />
      <AddChildDialog open={!!adding && addingKinds.length > 0} parentId={adding?.id ?? 0} parentLabel={adding?.code ?? adding?.name ?? ''}
        allowedKinds={addingKinds} custom={addingBomType === 'custom'}
        onClose={() => setAdding(null)}
        onDone={() => {
          // Open what was just added to, or the new line lands out of sight.
          if (adding) setOpen(new Set([...expanded, adding.key]));
          toast.success('Line added.');
          bom.reload();
        }} />
      <EditLineDialog open={!!editing} lineId={editing?.node.lineId ?? null} label={editing ? (editing.node.code ?? editing.node.name) : ''}
        quantity={editing?.node.quantity ?? 1} role={editing?.node.role ?? null}
        flowId={editing?.node.flow?.from === 'line' ? editing.node.flow.id : null}
        canHaveFlow={!!editing && !editing.node.selection && editing.node.kind !== 'selection'} custom={editing?.bomType === 'custom'}
        onClose={() => setEditing(null)} onDone={() => { toast.success('Line saved.'); bom.reload(); }} />
      <ChooseItemDialog open={choosing != null} lineId={choosing} onClose={() => setChoosing(null)} onDone={() => { toast.success('Item chosen.'); bom.reload(); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove line" title={`Remove ${removingNode?.code ?? removingNode?.name}?`}
        body={removingNode?.kind === 'temporary'
          ? `${removingNode.code ?? removingNode.name} exists only for this order, so it is deleted with everything below it.`
          : 'The line goes; the item itself stays in the catalog.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { if (removingNode?.lineId != null) { await bom.removeLine(removingNode.lineId); toast.success('Line removed.'); } }} />
    </Box>
  );
}
