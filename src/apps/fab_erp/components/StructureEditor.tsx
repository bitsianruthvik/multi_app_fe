import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';

import { fabGet, fabQuery } from '../api/client';
import { backendMessage, ConfirmDialog, Surface, useToast } from '../components';
import { DialogCloseButton } from './FormDialog';
import DrawingsPanel from './DrawingsPanel';
import TreeEditor from './TreeEditor/TreeEditor';
import type { RowMeta } from './TreeEditor/TreeNode';
import { countPieces, countRows, leaves, newTreeKey, unanswered, useTree } from '../hooks/useTree';
import {
  getDraftTree, getCurrentTree, buildStructure, applyStructure, getPickableItems,
  syncOrderFlows, setOrderFlows,
  type DraftNode, type DraftNodeData, type PickableItem, type QtyRequiredRow,
} from '../api/templates';
import type { OrderReadiness } from '../api/readiness';
import { createCatalogItem } from '../api/catalog';
import { codeRangeLabel } from '../utils/codeRange';

/**
 * A catalog size string ("12 × 150", "32 × 90 × 1700") as row dims. Two
 * numbers are thickness × width (length is the order's to say); three add the
 * length. Anything else — no size, or a section like "ISA 100x100x10" whose
 * numbers are not plate dims — leaves the row blank.
 */
const dimsFromSize = (size: string | null | undefined): Record<string, number> => {
  if (!size || /[A-Za-z]/.test(size)) return {};
  const nums = size.split(/[×x*]/i).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 2) return { thickness_mm: nums[0], width_mm: nums[1] };
  if (nums.length === 3) return { thickness_mm: nums[0], width_mm: nums[1], length_mm: nums[2] };
  return {};
};

/** What the code generator will use as this item's segment if Short code is left blank. */
const initialsOf = (name: string): string => {
  const words = name.trim().split(/[\s\-_/]+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].toUpperCase().slice(0, 4);
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 6);
};

/**
 * The structure, edited directly.
 *
 * ── WHY THIS REPLACED A WIZARD ────────────────────────────────────────────
 * A wizard asks questions in an order somebody chose in advance. Building a
 * span is not that: you look at what the BOM says, change the numbers that are
 * wrong for this job, delete the bits this bridge does not have, add the bit
 * nobody catalogued, and copy the span you just described because the second
 * one is nearly the same. None of that is a question with an answer; all of it
 * is editing a tree.
 *
 * COPYING A ROW IS THE SPLIT CONTROL. The wizard had a grouping grid to say
 * "these four differ from those two", which is a second concept for something
 * the tree already expresses: copy the row and change the copy. One gesture,
 * and it works the same whether you are changing a quantity or adding a part.
 *
 * ── ONE ROW PER THING, QUANTITY ON THE ROW ────────────────────────────────
 * Six diaphragms are one row reading 6. That is what the BOM says, what the
 * editor shows, and what gets written — the composite girder is 32 rows here
 * where expanding it produced 1,276 for the same 669 tonnes. It is also what
 * the rest of the system already assumes: weights multiply unit by quantity, a
 * task covers `task_qty` pieces, and a mark names a design rather than a piece.
 *
 * NOTHING IS WRITTEN UNTIL SAVE (EU-17 item 4). Every edit lives only in
 * `useTree`'s history until then — which is also what makes undo/redo, and a
 * dirty check that actually means something, possible: `dirty` is "has the
 * tree moved away from what Save last wrote or Load last read", not "have any
 * keys been pressed".
 */

type CatalogOption = PickableItem;

/** Three buckets, in the order somebody reaches for them. */
const bucketOf = (o: CatalogOption) => (o.onThisOrder ? 0 : o.lastUsedAt ? 1 : 2);
const BUCKET = ['On this order', 'Used before', 'Everything else'];

export interface StructureEditorLine {
  id: number;
  code: string | null;
  /** The catalog item this line was sold as — its BOM opens here. */
  itemId?: number | null;
  /** What it is called, for the heading. */
  description?: string | null;
  /**
   * How many of this line — edited in the line card's own qty box, which is
   * the row directly above this tree. The root's OWN quantity is pinned at 1
   * and everything below it multiplies by this instead (decision 3).
   */
  qty?: number | null;
  /** The line's steel, which every row inherits unless it states its own. */
  material?: string | null;
  grade?: string | null;
}

/**
 * THE ROW'S OWN STEEL — material or grade, picked not typed (the same lists the
 * line uses). Blank means "the line's", shown in italics so a row that differs
 * stands out from six hundred that do not.
 */
function SteelSelect({ material, grade, inherited, options, onChange, name }: {
  material: number | string | null | undefined;
  grade: number | string | null | undefined;
  /** The line's steel, "MS E350 BO", or null when the line states none. */
  inherited: string | null;
  options: { materials: string[]; byMaterial: Record<string, string[]> };
  onChange: (material: string, grade: string) => void;
  name: string;
}) {
  // ONE pick, "MS E350 BO", not two boxes: the pair is what a blank is keyed
  // on, and a row that is a different steel differs in the pair.
  const m = material == null ? '' : String(material);
  const g = grade == null ? '' : String(grade);
  const own = m && g ? `${m}|${g}` : '';
  const pairs = options.materials.flatMap((mat) => (options.byMaterial[mat] ?? []).map((gr) => `${mat}|${gr}`));
  const label = (v: string) => v.replace('|', ' ');
  return (
    <TextField
      select size="small" variant="standard"
      value={own}
      onChange={(e) => { const [nm, ng] = String(e.target.value).split('|'); onChange(nm ?? '', ng ?? ''); }}
      sx={{
        width: 120, flexShrink: 0,
        '& .MuiInputBase-root': {
          fontSize: 11.5, height: 28, px: 1, borderRadius: 'var(--r-sm)',
          border: '1px solid transparent', transition: 'border-color var(--t-fast) var(--ease)',
          color: own ? 'var(--c-text)' : 'var(--c-text-3)',
        },
        '& .MuiInputBase-root:hover, & .MuiInputBase-root.Mui-focused': { borderColor: 'var(--c-border)', background: 'var(--c-surface)' },
        '& .MuiSelect-select': { py: 0, display: 'flex', alignItems: 'center', minHeight: 'unset !important' },
      }}
      slotProps={{ input: { disableUnderline: true } }}
      SelectProps={{
        displayEmpty: true,
        renderValue: (v) => (v ? label(String(v)) : <em>{inherited || 'steel'}</em>),
      }}
      inputProps={{ 'aria-label': `Steel for ${name}` }}
    >
      <MenuItem value=""><em>{inherited ? `${inherited} — the line's` : 'as the line'}</em></MenuItem>
      {pairs.map((p) => <MenuItem key={p} value={p} sx={{ fontSize: 12.5 }}>{label(p)}</MenuItem>)}
    </TextField>
  );
}

/** What Save actually did, and the readiness it recomputed. */
export interface StructureSaveResult {
  created: number;
  updated: number;
  removed: number;
  sized?: number;
  readiness?: OrderReadiness;
}

/**
 * Match a server-refused `QTY_REQUIRED` row back to the tree node it names —
 * by `itemId` when the row has one (an existing order row), else by `path`
 * (built the identical way `collectUnanswered`, bomService.js, does: the
 * ancestry's names joined by ` / `, ending in the node's own name). Returns
 * null rather than guessing when nothing matches, which a stale tree (edited
 * since the save that got refused) can legitimately produce.
 */
function findUnansweredKey(root: DraftNode, row: QtyRequiredRow): string | null {
  let found: string | null = null;
  const walk = (n: DraftNode, ancestry: string[]) => {
    if (found) return;
    const path = [...ancestry, n.name].join(' / ');
    const isMatch = row.itemId != null ? n.itemId === row.itemId : path === row.path;
    if (isMatch) { found = n.key; return; }
    n.children.forEach((c) => walk(c, [...ancestry, n.name]));
  };
  walk(root, []);
  return found;
}

/**
 * The column header of the structure table. Exported so the line card can put
 * it ABOVE the line's own row: the line is the top row of its tree, and its
 * quantity sits in the same Qty column as every quantity beneath it.
 */
export function StructureColumnHeader() {
  const th = { fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' } as const;
  return (
    <Box sx={{
      position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 1,
      pl: '92px', pr: 1.5, py: 0.6, bgcolor: 'var(--c-surface-2)',
      borderBottom: '1px solid var(--c-border)',
    }}>
      <Typography sx={{ flex: 1, ...th }}>Name</Typography>
      <Typography sx={{ width: 76, textAlign: 'right', ...th }}>Qty</Typography>
      <Typography sx={{ width: 204, ...th }}>Size (mm) — thk / wid / len</Typography>
      <Typography sx={{ width: 120, ...th }}>Steel</Typography>
      <Typography sx={{ width: 132, ...th }}>Made by</Typography>
      <Box sx={{ width: 96, flexShrink: 0 }} />
    </Box>
  );
}

/**
 * A NUMBER THAT READS AS TEXT UNTIL YOU CLICK IT.
 *
 * Sixty-nine rows of five bordered inputs each is three hundred boxes, and a
 * table of boxes cannot be scanned — the eye has nothing to rest on. So a
 * value is drawn as plain mono text (tabular, right-aligned, like every
 * quantity column in the app) and becomes an input only on click or keyboard
 * focus; blur, Enter or Escape put the text back. What is MISSING still shows:
 * an empty value is its placeholder in italics, and a required one that is
 * empty carries the danger tint so it cannot hide among the filled ones.
 *
 * The button keeps the `id` a QTY_REQUIRED refusal focuses by name; focusing
 * it opens the editor, so "jump to the row that needs a quantity" still lands
 * in a live input.
 */
function InlineNumber({
  id, value, placeholder, onChange, width, ariaLabel, missing = false, refused = false,
}: {
  id?: string;
  value: number | string | null | undefined;
  placeholder: string;
  onChange: (raw: string) => void;
  width: number;
  ariaLabel: string;
  /** A value the row needs and does not have — drawn in the danger family. */
  missing?: boolean;
  /** The row a server refusal named — outlined, not just tinted. */
  refused?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const empty = value == null || value === '';
  if (!editing) {
    return (
      <Box
        component="button" type="button" id={id}
        onClick={() => setEditing(true)}
        onFocus={() => setEditing(true)}
        aria-label={ariaLabel}
        sx={{
          width, height: 28, px: 1, flexShrink: 0, textAlign: 'right',
          fontFamily: 'var(--font-mono)', fontSize: 12, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          borderRadius: 'var(--r-sm)', cursor: 'text',
          border: `1px solid ${refused ? 'var(--c-danger-600)' : 'transparent'}`,
          background: missing ? 'var(--c-danger-50)' : 'transparent',
          color: empty ? (missing ? 'var(--c-danger-800)' : 'var(--c-text-3)') : 'var(--c-text)',
          fontStyle: empty ? 'italic' : 'normal',
          transition: 'border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease)',
          '&:hover': { borderColor: 'var(--c-border)', background: missing ? 'var(--c-danger-50)' : 'var(--c-surface)' },
          '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
          ...(refused ? { boxShadow: '0 0 0 2px var(--c-danger-500)' } : {}),
        }}
      >
        {empty ? placeholder : String(value)}
      </Box>
    );
  }
  return (
    <TextField
      id={id}
      autoFocus size="small" type="number"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      // Opening the cell SELECTS what is there: the common edit is "replace
      // the 1 with a 2", and typing into an unselected "1" made "12".
      onFocus={(e) => e.target.select()}
      onBlur={() => setEditing(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        // Escape leaves the CELL, not the wizard — the dialog treats an
        // unhandled Escape as "close", which is not what somebody backing out
        // of a number meant. Stop it here.
        e.stopPropagation();
        e.preventDefault();
        (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      error={missing}
      sx={{ width, flexShrink: 0, '& .MuiOutlinedInput-root': { height: 28 } }}
      inputProps={{
        min: 0, step: 1,
        style: { fontSize: 12, textAlign: 'right', padding: '4px 8px', fontFamily: 'var(--font-mono)' },
        'aria-label': ariaLabel,
      }}
    />
  );
}

export default function StructureEditor({
  open, orderId, orderLine, onClose, onDone, onReadinessChanged, source = 'bom', onDirtyChange,
  revisionReason, chrome = 'card', deployedProductionOrders = 0,
}: {
  /**
   * Production orders already on the floor for this sales order. A structure
   * save under one is allowed — that is how a late size or an extra row gets
   * in — but it is asked about first, and told that Re-deploy on the
   * Production step is what carries the change to the shop. Silently saving
   * left two deployed orders quietly out of step with the BOM (prod UAT
   * 2026-09-15, finding 17).
   */
  deployedProductionOrders?: number;
  /**
   * 'card' draws its own bordered table with a header; 'flat' draws rows only,
   * for a container that already IS the table — the line card, which renders
   * the header and the line's row itself so line and structure read as one.
   */
  chrome?: 'card' | 'flat';
  open: boolean;
  orderId: number;
  /**
   * Where the tree comes from. 'bom' takes the catalogue's recipe — a rebuild.
   * 'current' takes what this order settled on — an edit, saved as a diff.
   */
  source?: 'bom' | 'current';
  orderLine: StructureEditorLine | null;
  onClose: () => void;
  /**
   * Set while the wizard is reopened in revision mode (P4/decision-4): a
   * structure apply on a non-draft order requires a reason, and the server
   * records it as one `fab_order_structure_revisions` row. Undefined on a
   * draft order — nothing is recorded while the order is still being set up.
   */
  revisionReason?: string;
  /** A REAL save (Create/Save changes) — worth reloading the line's own row and its built-count. */
  onDone: (result?: StructureSaveResult) => void;
  /**
   * Readiness moved for a reason OTHER than a save — a bulk flow action
   * (item 6), which already re-fetches its OWN tree state when it needs to
   * (`pullBomDefaults`) and must not also make the caller remount this whole
   * editor: that would fire a second `GET .../structure/tree`, which is
   * exactly the extra round trip decision-6's verification checks for.
   */
  onReadinessChanged?: (readiness?: OrderReadiness) => void;
  /**
   * Reports whenever this editor's own dirty state changes, so a container
   * that can open several of these at once (`OrderLinesPanel`) can refuse to
   * collapse or replace one that has unsaved edits — see X4.
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const flat = chrome === 'flat';
  const { toast } = useToast();
  const t = useTree<DraftNodeData>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<number | null>(null);
  /** The order prefix every row code starts with — hidden on screen, kept in the stored code. */
  const [codePrefix, setCodePrefix] = useState<string | null>(null);
  /** The steel lists the line picks from — a row that differs picks from the same. */
  const [steel, setSteel] = useState<{ materials: string[]; byMaterial: Record<string, string[]> }>({ materials: [], byMaterial: {} });
  useEffect(() => {
    if (!open) return;
    fabGet<{ materials: string[]; byMaterial: Record<string, string[]> }>('steel-options')
      .then((r) => setSteel({ materials: r.materials ?? [], byMaterial: r.byMaterial ?? {} }))
      .catch(() => {});
  }, [open]);
  const lineSteel = useMemo(
    () => ({ material: orderLine?.material ?? null, grade: orderLine?.grade ?? null }),
    [orderLine?.material, orderLine?.grade],
  );
  /** A 400 `QTY_REQUIRED` refusal — the rows it named, and the first one's key to focus. */
  const [qtyRequired, setQtyRequired] = useState<{ rows: QtyRequiredRow[]; focusKey: string | null } | null>(null);
  const [addUnder, setAddUnder] = useState<string | null>(null);
  const [showDrawings, setShowDrawings] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [newItem, setNewItem] = useState<{ parentKey: string; name: string; code: string; shortCode: string; groupId: number | ''; subgroupId: number | ''; unit: string; procurement: 'make' | 'buy' } | null>(null);
  /** Bumped after every add so the picker remounts empty — see `addChild`. */
  const [addSeq, setAddSeq] = useState(0);
  const [creating, setCreating] = useState(false);
  const [taxonomy, setTaxonomy] = useState<{
    groups: { id: number; name: string; categoryId: number }[];
    subgroups: { id: number; name: string; groupId: number }[];
  }>({ groups: [], subgroups: [] });

  /** Rows about to be removed by Save — surfaced BEFORE the write happens (item 3). */
  const removedItemIds = useMemo(() => {
    if (!t.baseline || !t.tree) return [] as number[];
    const collect = (n: DraftNode, out: Set<number>) => {
      if (n.itemId != null) out.add(n.itemId);
      n.children.forEach((c) => collect(c, out));
    };
    const before = new Set<number>(); collect(t.baseline, before);
    const after = new Set<number>(); collect(t.tree, after);
    return [...before].filter((id) => !after.has(id));
  }, [t.baseline, t.tree]);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => { onDirtyChange?.(t.dirty); }, [t.dirty, onDirtyChange]);

  // Focus the first unanswered row's qty box once the refusal alert renders it.
  useEffect(() => {
    if (!qtyRequired?.focusKey) return;
    const el = document.getElementById(`qty-input-${qtyRequired.focusKey}`);
    (el as HTMLInputElement | null)?.focus();
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [qtyRequired]);

  /**
   * TWO SOURCES, AND THEY ARE DIFFERENT QUESTIONS.
   *
   *   'bom'      what does the catalogue say this is made of
   *   'current'  what did we settle on
   *
   * They stop being the same answer the moment somebody changes a quantity, and
   * offering only the first meant the only way to alter one row was to throw
   * away all of them and take the recipe again.
   */
  const loadTree = useCallback(() => {
    setLoading(true); setError(''); setExisting(null);
    const read = source === 'current'
      ? getCurrentTree(orderId, orderLine?.id ?? null).then((r) => { setCodePrefix(r.codePrefix ?? null); return r.tree; })
      : (orderLine?.itemId == null
        ? Promise.resolve(null)
        : getDraftTree(Number(orderLine.itemId)).then((r) => { setCodePrefix(null); return r.tree; }));
    return read
      .then((tree) => t.set(tree))
      .catch((e) => setError(backendMessage(e, 'Could not read that structure.')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, orderId, orderLine?.id, orderLine?.itemId]);

  useEffect(() => {
    if (!open) { t.set(null); return; }
    void loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, orderId, orderLine?.id, orderLine?.itemId]);

  /*
   * Anything addable, and enough about each to choose it: size, material, make
   * or bought, the flow its BOM gives it, and how used it is. The server
   * decides what is addable — a structure holds bought-in components as well as
   * fabricated ones (7,212 shear studs live under Fasteners & Hardware), but
   * never raw material, which arrives through nesting.
   */
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try { setCatalog(await getPickableItems(orderId)); } catch { setCatalog([]); }
    finally { setCatalogLoading(false); }
  }, [orderId]);
  useEffect(() => { if (open) void loadCatalog(); }, [open, loadCatalog]);

  // Where a new item can be filed, for the "New item" dialog.
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fabQuery<{ data: { id: number; name: string; categoryId: number }[] }>('fabErpItemGroup', { pagination: { limit: 500 } }),
      fabQuery<{ data: { id: number; name: string; groupId: number }[] }>('fabErpItemSubgroup', { pagination: { limit: 1000 } }),
    ]).then(([g, sg]) => setTaxonomy({ groups: g.data ?? [], subgroups: sg.data ?? [] })).catch(() => {});
  }, [open]);

  /** Buckets first, then name — Autocomplete groups on the order it is given. */
  const options = useMemo(
    () => [...catalog].sort((a, b) => bucketOf(a) - bucketOf(b) || a.name.localeCompare(b.name)),
    [catalog],
  );

  /** The flow on one row. Null is a real answer, not a missing one. */
  const [flows, setFlows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpOperationFlow', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 200 },
    }).then((r) => setFlows(r.data ?? [])).catch(() => setFlows([]));
  }, []);

  /**
   * A CLEARED QUANTITY IS null, NOT ZERO.
   *
   * It used to become 0, and the writers turned 0 into 1 — so emptying the box
   * on "16 splices" silently built one. A blank has to survive as a blank all
   * the way to the server, which refuses it, because 1 reads as a decision in a
   * way that an empty box never does.
   */
  const setQty = useCallback((key: string, raw: string) => {
    t.update(key, { qty: raw === '' ? null : Number(raw) });
    // Typing an answer into the row a refusal named clears that refusal's
    // highlight — it does not clear the OTHER rows still listed above, which
    // stay named until the next Save either fixes or re-refuses them.
    setQtyRequired((qr) => (qr && qr.focusKey === key ? { ...qr, focusKey: null } : qr));
  }, [t]);

  /**
   * THE ROOT'S QTY IS THE LINE'S QTY and it is edited on the line's own row,
   * which the line card draws directly above these rows — not here.
   */
  const setFlow = useCallback((key: string, flowId: number | null) => {
    t.update(key, { defaultFlowId: flowId });
  }, [t]);

  const setDim = useCallback((key: string, field: string, raw: string) => {
    t.update(key, (n) => ({ ...n, dims: { ...(n.dims ?? {}), [field]: raw } }));
  }, [t]);

  const remove = useCallback((key: string) => t.remove(key), [t]);
  const copy = useCallback((key: string) => t.duplicate(key), [t]);

  const addChild = useCallback((parentKey: string, picked: CatalogOption) => {
    t.insert(parentKey, {
      key: newTreeKey(),
      catalogItemId: picked.id,
      name: picked.name,
      unit: null,
      qty: 1,
      // Made or bought travels with the row from the moment it is picked, so
      // a shear stud does not grow thickness/width/length editors it can never
      // use. The save path reads the catalog anyway; this is for the screen.
      procurementType: picked.procurement ?? 'make',
      // The BOM's own abbreviation for this rung. A hand-added row has none,
      // and nothing here needs one: the BOM step writes no codes at all.
      // These ride along for the code pass at production-order time.
      codeSegment: null,
      codeJoin: 'dash',
      defaultFlowId: null,
      bomLineId: null,
      qtyParam: null,
      // An item that STATES a size (a 12 × 150 stiffener plate) hands it to
      // the row, so the row is not "a part without a size" until somebody
      // retypes what the catalog already knows. Length still comes from the
      // order where the item leaves it open.
      dims: dimsFromSize(picked.size),
      children: [],
    });
    // The panel STAYS OPEN: a segment is eight parts, and closing after each
    // one made building a recipe a click-hunt. Remounting the picker clears it
    // and puts the cursor back for the next part; "Done" closes.
    setAddSeq((n) => n + 1);
  }, [t]);

  /**
   * A PART NOBODY CATALOGUED YET, created without leaving the order.
   *
   * The item is the KIND of thing — its size belongs to the row, the way Top
   * Flange's does. The code comes from the code generator, so there is nothing
   * to type but a name and where it is filed.
   */
  const createItem = useCallback(async () => {
    if (!newItem?.name.trim() || !newItem.subgroupId) return;
    setCreating(true);
    try {
      const group = taxonomy.groups.find((g) => g.id === newItem.groupId);
      if (!group) throw new Error('Pick a group first.');
      // The same route the Item Catalog uses, so the code generator mints the
      // item code and the short code lands on the item — the generic insert
      // wrote neither, and a row with no short code derives its segment from
      // the name's initials forever.
      const res = await createCatalogItem({
        name: newItem.name.trim(),
        code: newItem.code.trim() || null,
        shortCode: newItem.shortCode.trim() || null,
        unit: newItem.unit || 'nos',
        categoryId: group.categoryId,
        groupId: newItem.groupId || null,
        subgroupId: newItem.subgroupId,
        procurementType: newItem.procurement,
      });
      await loadCatalog();
      addChild(newItem.parentKey, {
        id: res.id, name: newItem.name.trim(), code: res.code ?? null, unit: newItem.unit || 'nos',
        categoryName: null, groupName: group?.name ?? null, subgroupName: null,
        procurement: newItem.procurement, size: null, material: null, flowName: null,
        bomCount: 0, orderCount: 0, lastUsedAt: null, onThisOrder: true,
      });
      setNewItem(null);
    } catch (e) {
      setError(backendMessage(e, 'Could not create that item.'));
    } finally { setCreating(false); }
  }, [newItem, taxonomy.groups, loadCatalog, addChild]);

  // ── save ─────────────────────────────────────────────────────────────────

  const doCreate = useCallback(async (replace = false) => {
    if (!t.tree) return;
    setBusy(true); setError(''); setExisting(null); setQtyRequired(null);
    try {
      if (source === 'current') {
        // A DIFF: rows that survived keep their ids, and with them the
        // dimensions typed on them and the plate they were nested onto.
        const res = await applyStructure(orderId, {
          tree: t.tree, orderLineId: orderLine?.id ?? null, revisionReason,
        });
        toast(`${res.created} created, ${res.updated} updated, ${res.removed} removed`);
        t.set(t.tree); // Save is the new baseline — dirty clears without a reload.
        onDone({ created: res.created, updated: res.updated, removed: res.removed, sized: res.sized, readiness: res.readiness });
      } else {
        const res = await buildStructure(orderId, {
          tree: t.tree,
          orderLineId: orderLine?.id ?? null,
          ...(replace ? { replace: true } : {}),
        });
        toast(`${res.created} row(s) created`);
        onDone({ created: res.created, updated: 0, removed: 0, readiness: res.readiness });
      }
      onClose();
    } catch (e) {
      const res = (e as {
        response?: { status?: number; data?: { code?: string; existing?: number; detail?: { unanswered?: QtyRequiredRow[] } } };
      }).response;
      if (res?.status === 409 && res.data?.code === 'ALREADY_BUILT') {
        setExisting(res.data.existing ?? 0);
      } else if (res?.data?.code === 'QTY_REQUIRED' && res.data.detail) {
        // A row with no quantity — named specifically, not the generic
        // message, and the first one is focused so fixing it does not start
        // with a search.
        const rows = res.data.detail.unanswered ?? [];
        const focusKey = t.tree && rows[0] ? findUnansweredKey(t.tree, rows[0]) : null;
        setQtyRequired({ rows, focusKey });
      } else {
        // Stay open on any other failure. The edits took effort and losing them
        // is the fastest way to make somebody stop using this.
        setError(backendMessage(e, 'Could not create that structure.'));
      }
    } finally { setBusy(false); }
  }, [t, source, orderId, orderLine?.id, revisionReason, onDone, onClose, toast]);

  /**
   * Save, but ask first when the diff would remove rows (item 3). The backend
   * still refuses outright — with no override — removing a row that has
   * STARTED work; this is about the ordinary case of a row with unstarted
   * tasks, which the server drops silently once told to remove the row.
   */
  /**
   * Editing under a deployed production order asks first (see the prop). It
   * is asked BEFORE the remove-rows question so the bigger fact comes first;
   * confirming it falls through to the ordinary path, remove-check included.
   */
  const [confirmDeployed, setConfirmDeployed] = useState(false);

  const create = useCallback((replace = false, pastDeployed = false) => {
    if (source === 'current' && !replace && !pastDeployed && deployedProductionOrders > 0) {
      setConfirmDeployed(true);
      return;
    }
    if (source === 'current' && !replace && removedItemIds.length > 0) {
      setConfirmRemove(true);
      return;
    }
    void doCreate(replace);
  }, [source, removedItemIds.length, doCreate, deployedProductionOrders]);

  const rows = useMemo(() => (t.tree ? countRows(t.tree) : 0), [t.tree]);
  const pieces = useMemo(() => (t.tree ? countPieces(t.tree) : 0), [t.tree]);
  const missing = useMemo(() => (t.tree ? unanswered(t.tree) : []), [t.tree]);

  // ── multi-select + bulk flow actions (X3 / item 6) ─────────────────────

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const visibleOrder = useMemo(() => {
    const out: string[] = [];
    const walk = (n: DraftNode) => { out.push(n.key); n.children.forEach(walk); };
    t.tree?.children.forEach(walk);
    return out;
  }, [t.tree]);

  const toggleSelect = useCallback((key: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked) {
        const a = visibleOrder.indexOf(lastClicked);
        const b = visibleOrder.indexOf(key);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i += 1) next.add(visibleOrder[i]);
          return next;
        }
      }
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setLastClicked(key);
  }, [lastClicked, visibleOrder]);

  const [bulkFlow, setBulkFlow] = useState<'' | number>('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [confirmPull, setConfirmPull] = useState(false);

  /**
   * Set a flow on a set of keys. Only keys that are REAL rows (`itemId` set)
   * go to the server — a row somebody just added in this session does not
   * exist there yet, so its flow is simply written into the tree the way the
   * single-row selector always has been, and travels to the server on Save.
   */
  const applyFlowToKeys = useCallback(async (keys: string[], flowId: number | null) => {
    const treeAtStart = t.tree;
    if (!treeAtStart) return;
    const nodesByKey = new Map<string, DraftNode>();
    const walk = (n: DraftNode) => { nodesByKey.set(n.key, n); n.children.forEach(walk); };
    treeAtStart.children.forEach(walk);
    const withItemId = keys.map((k) => nodesByKey.get(k)).filter((n): n is DraftNode => !!n && n.itemId != null);
    const withoutItemId = keys.filter((k) => nodesByKey.get(k)?.itemId == null);

    // Unsaved rows: the tree IS the record — just set it locally.
    withoutItemId.forEach((k) => setFlow(k, flowId));

    if (!withItemId.length) return;
    setBulkBusy(true);
    try {
      const res = await setOrderFlows(orderId, withItemId.map((n) => n.itemId as number), flowId);
      if (withoutItemId.length) {
        // A mix of persisted and local-only rows: keep using the per-key
        // updater so the local-only rows' edits still show as dirty (they
        // have not been saved anywhere).
        withItemId.forEach((n) => setFlow(n.key, flowId));
      } else {
        // Every affected row is now persisted server-side. Patching via
        // `setFlow`/`t.update` here would leave `t.dirty` true forever
        // (tree !== baseline) — `t.update` only touches `tree`, not
        // `baseline` — wrongly blocking wizard Next and showing "unsaved
        // edits" after a save that already happened. Build the patched tree
        // directly and hand it to `t.set`, the same "save is the new
        // baseline" convention doCreate uses (~line 351), instead of relying
        // on `t.tree` right after scheduling async `setFlow` updates — those
        // updates would not have landed yet, so `t.tree` here would still be
        // the PRE-patch tree.
        const idSet = new Set(withItemId.map((n) => n.key));
        const patch = (n: DraftNode): DraftNode => ({
          ...n,
          defaultFlowId: idSet.has(n.key) ? flowId : n.defaultFlowId,
          children: n.children.map(patch),
        });
        t.set({ ...treeAtStart, children: treeAtStart.children.map(patch) });
      }
      onReadinessChanged?.(res.readiness);
    } catch (e) {
      setError(backendMessage(e, 'Could not set that flow.'));
    } finally { setBulkBusy(false); }
  }, [t, orderId, setFlow, onReadinessChanged]);

  const setFlowOnAllLeaves = useCallback(() => {
    if (!t.tree || bulkFlow === '') return;
    // Leaves that are MADE. A bought stud is a leaf too, and a fabrication
    // flow on it would raise cut/weld tasks for something that arrives in a box.
    const keys = t.tree.children.flatMap((c) => leaves(c))
      .filter((n) => n.procurementType !== 'buy' && n.procurementType !== 'free_issue')
      .map((n) => n.key);
    void applyFlowToKeys(keys, Number(bulkFlow));
  }, [t.tree, bulkFlow, applyFlowToKeys]);

  const applyFlowToSelection = useCallback(() => {
    if (bulkFlow === '' || !selected.size) return;
    void applyFlowToKeys([...selected], Number(bulkFlow));
    setSelected(new Set());
  }, [bulkFlow, selected, applyFlowToKeys]);

  /**
   * PULL BOM DEFAULTS (§13 "a default flow belongs to the BOM LINE, not the
   * item"): re-reads each item's BOM-line default flow, touching only items
   * that still have none. It does not say which flow each item landed on, so
   * — unlike the bulk-set actions above — this re-reads the tree afterward.
   * Guarded behind a confirm when there are unsaved edits, since the reload
   * replaces them with the server's current state.
   */
  const pullBomDefaults = useCallback(async () => {
    setSyncBusy(true); setError('');
    try {
      const res = await syncOrderFlows(orderId, false);
      await loadTree();
      onReadinessChanged?.(res.readiness);
      toast(`${res.assigned} item(s) picked up their BOM line's flow`);
    } catch (e) {
      setError(backendMessage(e, 'Could not pull the BOM defaults.'));
    } finally { setSyncBusy(false); }
  }, [orderId, loadTree, onReadinessChanged, toast]);

  const clickPullDefaults = useCallback(() => {
    if (t.dirty) { setConfirmPull(true); return; }
    void pullBomDefaults();
  }, [t.dirty, pullBomDefaults]);

  // ── keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z (item 4) ──────────────────
  const onKeyDownShortcuts = useCallback((e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    e.preventDefault();
    if (e.shiftKey) t.redo(); else t.undo();
  }, [t]);

  // ── one row ──────────────────────────────────────────────────────────────

  interface Ctx {
    flows: { id: number; name: string }[];
    selected: Set<string>;
    addUnder: string | null;
    showDrawings: string | null;
    catalogLoading: boolean;
    options: CatalogOption[];
    /** The row a `QTY_REQUIRED` refusal is naming — highlighted, not just focused. */
    qtyRequiredKey: string | null;
  }
  const ctx: Ctx = {
    flows, selected, addUnder, showDrawings, catalogLoading, options,
    qtyRequiredKey: qtyRequired?.focusKey ?? null,
  };

  const renderRow = useCallback(({ node, ctx: rowCtx }: RowMeta<DraftNodeData, Ctx>) => {
    const hasKids = node.children.length > 0;
    const qtyRefused = rowCtx.qtyRequiredKey === node.key;
    return (
      <>
        {/*
          EVERY ROW HERE IS BELOW THE LINE. `roots` is the line's children, so
          depth 0 is a girder, not the line itself — it gets a checkbox, a qty
          and copy/remove like any other row. (The line's own row, pinned at
          qty 1, is drawn by the line card above this table.)
        */}
        <Checkbox
          size="small"
          checked={selected.has(node.key)}
          onClick={(e) => { e.stopPropagation(); toggleSelect(node.key, e.shiftKey); }}
          onChange={() => {}}
          sx={{ p: 0.25 }}
          inputProps={{ 'aria-label': `Select ${node.name}` }}
        />

        {/* A floor on the name column: with every other column fixed, a narrow
            window used to crush this one to nothing. Now the row overflows
            sideways instead and the name (and its code) always show. */}
        <Box sx={{ flex: '1 1 160px', minWidth: 150, display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <Typography noWrap sx={{ fontSize: 13, minWidth: 0 }}>{node.name}</Typography>
          {/*
            THE CODE ON EVERY ROW. Before deploy that is the catalog item's
            code — what the row IS; after deploy the row also has its own
            order code (SPAN1-L1-2), and that one wins because it names THIS
            girder and not the type. Either way a row is never just a name.
          */}
          {(() => {
            /*
             * THE ROW'S ORDER CODE, on every row: written at deploy, previewed
             * before by the same rule. The order prefix (same on every row) is
             * hidden; the full code and the catalog item are one hover away.
             */
            const full = node.code ?? null;
            if (!full) return null;
            // A qty-4 row is pieces 1…4 under each parent: SPAN1-L1-1…4.
            const shown = codeRangeLabel(full, node.codeLast, codePrefix);
            const pieces = node.codeLast ? ` · ${node.qty} pieces under each parent, ${full} to ${node.codeLast}` : '';
            return (
              <Tooltip title={`${full}${node.codeWritten ? '' : ' (written when the production order is deployed)'} · catalog ${node.catalogCode ?? '—'}${pieces}`}>
                <Typography noWrap sx={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: node.codeWritten ? 'var(--c-text-2)' : 'var(--c-text-3)', fontStyle: node.codeWritten ? 'normal' : 'italic', minWidth: 0, lineHeight: 1.3 }}>
                  {shown}
                </Typography>
              </Tooltip>
            );
          })()}
        </Box>

        {/* The row a server-side QTY_REQUIRED refusal named is outlined, not
            just focused — a scrolled-past focus ring is easy to miss. */}
        <InlineNumber
          id={`qty-input-${node.key}`}
          value={node.qty}
          placeholder={node.qtyParam ?? 'how many'}
          onChange={(raw) => setQty(node.key, raw)}
          width={76}
          ariaLabel={`Quantity for ${node.name}`}
          missing={node.qty == null}
          refused={qtyRefused}
        />

        {/*
          THE SIZE, ON THE LEAF ONLY.

          An assembly has no rectangle — a Segment's weight and area are its
          parts summed, not a shape of its own — so three empty boxes beside it
          would be three questions with no answer, and somebody would
          eventually fill them in.
        */}
        {hasKids ? (
          <Box sx={{ width: 204, flexShrink: 0 }} />
        ) : node.procurementType === 'buy' || node.procurementType === 'free_issue' ? (
          // BOUGHT IN, NOT CUT: a stud or a bolt has a catalogue size and no
          // rectangle to nest — three size boxes here would be three questions
          // with no answer, and somebody would eventually fill them in.
          <Box sx={{ width: 204, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
              {node.procurementType === 'free_issue' ? 'supplied by customer — no size to cut' : 'bought in — no size to cut'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0, width: 204 }}>
            {(['thickness_mm', 'width_mm', 'length_mm'] as const).map((f) => (
              <InlineNumber
                key={f}
                value={node.dims?.[f]}
                placeholder={f === 'thickness_mm' ? 'thk' : f === 'width_mm' ? 'wid' : 'len'}
                onChange={(raw) => setDim(node.key, f, raw)}
                width={64}
                ariaLabel={`${f === 'thickness_mm' ? 'Thickness' : f === 'width_mm' ? 'Width' : 'Length'} (mm) for ${node.name}`}
              />
            ))}
          </Box>
        )}

        {/* THE STEEL, on a made leaf. Blank = the line's (shown in italics). */}
        {hasKids || node.procurementType === 'buy' || node.procurementType === 'free_issue' ? (
          <Box sx={{ width: 120, flexShrink: 0 }} />
        ) : (
          <SteelSelect
            material={node.dims?.material} grade={node.dims?.grade}
            inherited={[lineSteel.material, lineSteel.grade].filter(Boolean).join(' ') || null}
            options={steel}
            onChange={(m, g) => { setDim(node.key, 'material', m); setDim(node.key, 'grade', g); }}
            name={node.name}
          />
        )}

        {/*
          HOW IT IS MADE, on the row. NOT leaf-only: an assembly is welded and
          carries a flow like anything else. Blank is a real answer for a level
          that only groups its children — a Span is not made, it is what the
          made things add up to.
        */}
        {/* Quiet until hovered: the flow reads as text with a chevron, and the
            input chrome appears only when the pointer is on it — the same
            click-to-edit calm as the numbers beside it. */}
        <TextField
          select size="small" variant="standard"
          value={node.defaultFlowId ?? ''}
          onChange={(e) => setFlow(node.key, e.target.value === '' ? null : Number(e.target.value))}
          sx={{
            width: 132, flexShrink: 0,
            '& .MuiInputBase-root': {
              fontSize: 11.5, height: 28, px: 1, borderRadius: 'var(--r-sm)',
              border: '1px solid transparent', transition: 'border-color var(--t-fast) var(--ease)',
              color: node.defaultFlowId == null ? 'var(--c-text-3)' : 'var(--c-text)',
            },
            '& .MuiInputBase-root:hover, & .MuiInputBase-root.Mui-focused': { borderColor: 'var(--c-border)', background: 'var(--c-surface)' },
            '& .MuiSelect-select': { py: 0, display: 'flex', alignItems: 'center', minHeight: 'unset !important' },
          }}
          slotProps={{ input: { disableUnderline: true } }}
          SelectProps={{ displayEmpty: true }}
          inputProps={{ 'aria-label': `Flow for ${node.name}` }}
        >
          <MenuItem value=""><em>No flow</em></MenuItem>
          {flows.map((f) => (
            <MenuItem key={f.id} value={f.id} sx={{ fontSize: 12.5 }}>{f.name}</MenuItem>
          ))}
        </TextField>

        {/* ALWAYS VISIBLE now (U4) — a hover affordance told nobody these existed. */}
        <Box sx={{ display: 'flex', width: 96, flexShrink: 0, justifyContent: 'flex-end' }}>
          {node.itemId != null && (
            <Tooltip title="Drawings">
              <IconButton
                size="small" sx={{ p: 0.25 }}
                onClick={() => setShowDrawings((d) => (d === node.key ? null : node.key))}
              >
                <DescriptionRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Add something under this">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setAddUnder(node.key)}>
              <AddRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy this and everything under it">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => copy(node.key)}>
              <ContentCopyRounded sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove this and everything under it">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => remove(node.key)}>
              <DeleteOutlineRounded sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </>
    );
  }, [copy, remove, selected, setDim, setFlow, setQty, toggleSelect, flows, codePrefix, steel, lineSteel]);

  /**
   * THE "ADD UNDER" PANEL, one for any node INCLUDING THE ROOT. The root is
   * not drawn as a tree row (it is the line), so `renderBelow` never fires for
   * it — and a sellable item with an empty recipe had no way to get its first
   * row from the order at all. The body renders this for the root itself.
   */
  const renderAddPanel = useCallback((node: { key: string; name: string }, depth: number) => (
        <Box sx={{ pl: `${(depth + 1) * 20}px`, py: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Autocomplete
            key={addSeq}
            options={options}
            loading={catalogLoading}
            sx={{ flex: '1 1 380px' }}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, v) => { if (v) addChild(node.key, v); }}
            groupBy={(o) => BUCKET[bucketOf(o)]}
            filterOptions={(opts, { inputValue }) => {
              const q = inputValue.trim().toLowerCase();
              const hay = (o: CatalogOption) => [o.name, o.code, o.size?.replace(/ × /g, ' x '),
                o.material, o.categoryName, o.groupName, o.subgroupName]
                .filter(Boolean).join(' ').toLowerCase();
              if (!q) return opts.slice(0, 60);
              const norm = q.replace(/[×*]/g, 'x');
              return opts.filter((o) => hay(o).includes(norm));
            }}
            renderOption={(props, o) => (
              <li {...props} key={o.id}>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 13 }}>{o.name}</Typography>
                    {o.size && (
                      <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--c-text-2)' }}>
                        {o.size}
                      </Typography>
                    )}
                    {o.material && (
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{o.material}</Typography>
                    )}
                    {o.procurement === 'buy' && (
                      <Typography sx={{ fontSize: 10.5, color: 'var(--c-warning-600)' }}>bought in</Typography>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                    {[
                      [o.categoryName, o.groupName, o.subgroupName].filter(Boolean).join(' › '),
                      o.flowName,
                      o.bomCount || o.orderCount
                        ? `in ${o.bomCount} BOM${o.bomCount === 1 ? '' : 's'} · ${o.orderCount} order${o.orderCount === 1 ? '' : 's'}`
                        : 'never used yet',
                    ].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              </li>
            )}
            renderInput={(p) => <TextField {...p} size="small" label={`Add under ${node.name}`} autoFocus />}
          />
          <Tooltip title="Reload the item list">
            <span>
              <IconButton size="small" disabled={catalogLoading} onClick={() => void loadCatalog()}>
                <RefreshRounded sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Button size="small" startIcon={<AddRounded />} onClick={() => setNewItem({ parentKey: node.key, name: '', code: '', shortCode: '', groupId: '', subgroupId: '', unit: 'nos', procurement: 'make' })}>
            New item
          </Button>
          <Button size="small" onClick={() => setAddUnder(null)}>Done</Button>
        </Box>
  ), [options, catalogLoading, addChild, loadCatalog, addSeq]);

  const renderBelow = useCallback(({ node, depth }: RowMeta<DraftNodeData, Ctx>) => (
    <>
      {addUnder === node.key && renderAddPanel(node, depth)}

      {showDrawings === node.key && node.itemId != null && (
        <Box sx={{ pl: `${(depth + 1) * 20}px`, pr: 1.5, py: 1 }}>
          <DrawingsPanel itemId={node.itemId} canManage dense />
        </Box>
      )}
    </>
  ), [addUnder, showDrawings, renderAddPanel]);

  const noItem = orderLine?.itemId == null;

  const body = (
    // A column flex so 'flat' can put the toolbar UNDER the rows (order 2)
    // without moving JSX: in the card the toolbar sits above the table; in the
    // line card the rows must follow the line's own row immediately.
    <Box onKeyDown={onKeyDownShortcuts} sx={{ display: 'flex', flexDirection: 'column' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {existing != null && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This line already has <b>{existing}</b> row(s). Building again would add a second copy of
          everything. Replace what is there, or leave it as it is.
        </Alert>
      )}

      {noItem && (
        <Alert severity="info">
          This line does not say what it is. Set its item on the Line items step and its bill of
          materials will open here.
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={16} />
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading the bill of materials…</Typography>
        </Box>
      )}

      {!loading && !t.tree && !noItem && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {source === 'current'
            ? 'Nothing is built on this line yet. Use "Rebuild from the bill of materials" to take the catalogue’s recipe.'
            : 'This item’s recipe is empty — add lines to its bill of materials first (Item Catalog › this item › BOM).'}
        </Alert>
      )}

      {/*
        THE SERVER REFUSED, NAMED. `missing` below is this editor's own guess,
        computed from the tree in front of you; this is what `requireAllQty`
        (bomService.js) actually found when Save was attempted — the two
        usually agree, but this one is authoritative, so it gets the harder
        colour and lists every row by its full path rather than just a name.
      */}
      {qtyRequired && qtyRequired.rows.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setQtyRequired(null)}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>
            {qtyRequired.rows.length === 1
              ? 'This row has no quantity:'
              : `${qtyRequired.rows.length} rows have no quantity:`}
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {qtyRequired.rows.slice(0, 20).map((r, i) => (
              <li key={r.itemId ?? `${r.path}-${i}`}>
                <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.path || r.name}</span>
              </li>
            ))}
            {qtyRequired.rows.length > 20 && <li>and {qtyRequired.rows.length - 20} more…</li>}
          </Box>
        </Alert>
      )}

      {missing.length > 0 && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {missing.length === 1
            ? <><b>{missing[0]}</b> needs a quantity.</>
            : <><b>{missing.length} rows</b> need a quantity: {missing.slice(0, 4).join(', ')}
              {missing.length > 4 ? `, and ${missing.length - 4} more` : ''}.</>}
          {' '}These change from job to job, so the recipe does not guess.
        </Alert>
      )}

      {t.tree && !loading && (
        <>
          {/* Undo/redo + bulk flow toolbar (X3 / X4). */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
            ...(flat
              ? { order: 2, px: 1.5, py: 0.75, borderTop: '1px solid var(--c-divider)', bgcolor: 'var(--c-surface-2)' }
              : { mb: 1 }),
          }}>
            <Tooltip title="Undo (Ctrl+Z)">
              <span>
                <IconButton size="small" disabled={!t.canUndo} onClick={() => t.undo()} aria-label="Undo">
                  <UndoRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Redo (Ctrl+Shift+Z)">
              <span>
                <IconButton size="small" disabled={!t.canRedo} onClick={() => t.redo()} aria-label="Redo">
                  <RedoRounded fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>

            <Tooltip title={`Add a top-level row under ${t.tree.name} — an assembly or a part straight from the catalog`}>
              <Button
                size="small" startIcon={<AddRounded />}
                onClick={() => setAddUnder((k) => (k === t.tree!.key ? null : t.tree!.key))}
              >
                Add under {t.tree.name}
              </Button>
            </Tooltip>

            <Box sx={{ width: '1px', alignSelf: 'stretch', bgcolor: 'var(--c-divider)', mx: 0.5 }} />

            <TextField
              select size="small" value={bulkFlow}
              onChange={(e) => setBulkFlow(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ width: 160 }}
              SelectProps={{ displayEmpty: true }}
              inputProps={{ 'aria-label': 'Flow to apply' }}
            >
              <MenuItem value=""><em>Choose a flow…</em></MenuItem>
              {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </TextField>
            <Button size="small" disabled={bulkFlow === '' || bulkBusy} onClick={setFlowOnAllLeaves}>
              Set flow on all leaves
            </Button>
            <Button
              size="small" disabled={bulkFlow === '' || !selected.size || bulkBusy}
              onClick={applyFlowToSelection}
            >
              Apply to {selected.size || ''} selected
            </Button>
            {source === 'current' && (
              <Tooltip title="A default flow belongs to the BOM LINE, not the item — this re-pulls each part's line default, touching only parts that still have none.">
                <span>
                  <Button
                    size="small" startIcon={syncBusy ? <CircularProgress size={12} /> : <SyncRounded fontSize="small" />}
                    disabled={syncBusy} onClick={clickPullDefaults}
                  >
                    Pull BOM defaults
                  </Button>
                </span>
              </Tooltip>
            )}
          </Box>

          {/*
            THE ROOT ITSELF IS NOT DRAWN AS A TREE ROW — it is the line, and the
            line card draws that row (with the line's qty) directly above these.
            `roots` is the root's CHILDREN, which is how `TreeEditor` learns not
            to draw it. In 'card' chrome the header is ours; in 'flat' chrome the
            container renders `StructureColumnHeader` above the line's row.
          */}
          <Box sx={flat
            ? { order: 1 }
            : { border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', mb: 2 }}
          >
            {!flat && <StructureColumnHeader />}
            {/* The root's own add panel — see `renderAddPanel`. */}
            {addUnder === t.tree.key && renderAddPanel(t.tree, 0)}
            {t.tree.children.length === 0 && addUnder !== t.tree.key && (
              <Box sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  Nothing under <b>{t.tree.name}</b> yet. Its recipe is empty, so build it here: add the
                  assemblies and parts it is made of, from the catalog or as new items.
                </Typography>
                <Button size="small" variant="outlined" startIcon={<AddRounded />} onClick={() => setAddUnder(t.tree!.key)}>
                  Add the first row
                </Button>
              </Box>
            )}
            <TreeEditor<DraftNodeData, Ctx>
              roots={t.tree.children}
              renderRow={renderRow}
              renderBelow={renderBelow}
              ctx={ctx}
              onMove={(dragKey, overKey) => t.move(dragKey, overKey)}
              onIndent={(key) => t.indent(key)}
              onOutdent={(key) => t.outdent(key)}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 3, ...(flat ? { order: 3, px: 1.5, py: 1 } : {}) }}>
            <Box>
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Rows</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{rows}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pieces</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 600 }}>{pieces.toLocaleString('en-IN')}</Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', alignSelf: 'flex-end', pb: 0.5 }}>
              One row per design, its quantity says how many exist. Alt+↑/↓ reorders a row among its
              siblings, Alt+←/→ changes its level.
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );

  const isEdit = source === 'current';

  const createButton = isEdit ? (
    <Button
      variant="contained" disabled={!t.tree || busy || missing.length > 0}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
      onClick={() => create(false)}
    >
      Save changes
    </Button>
  ) : existing != null ? (
    <Button
      variant="contained" color="warning" disabled={busy}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
      onClick={() => void doCreate(true)}
    >
      Replace the {existing} row(s)
    </Button>
  ) : (
    <Button
      variant="contained" disabled={!t.tree || busy || missing.length > 0}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
      onClick={() => create(false)}
    >
      {t.tree ? `Create ${rows} row(s)` : 'Create'}
    </Button>
  );

  /**
   * INLINE IS THE REAL HOME OF THIS SCREEN.
   *
   * It began as a dialog opened from a button, which meant the Structure step
   * itself showed an empty box and an invitation to open something else. The
   * bill of materials IS the structure — putting it behind one more click made
   * the step look like it had nothing to say.
   *
   * The dialog shape is kept for the one case that still needs it: rebuilding a
   * line that already has rows, where the screen behind is showing the thing
   * being replaced.
   */
  const dialogs = (
    <>
      {newItem && (
        <Dialog open onClose={() => setNewItem(null)} maxWidth="xs" fullWidth>
          <DialogTitle>New item</DialogTitle>
          <DialogCloseButton absolute onClose={() => setNewItem(null)} />
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              size="small" label="Name" autoFocus value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              helperText="What kind of part it is. Its size goes on the row, not here."
            />
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                size="small" label="Code" value={newItem.code} placeholder="Blank = generated"
                onChange={(e) => setNewItem({ ...newItem, code: e.target.value.toUpperCase() })}
                slotProps={{ input: { sx: { fontFamily: 'monospace' } }, inputLabel: { shrink: true } }}
                helperText="The item's own identity."
                sx={{ flex: 1 }}
              />
              <TextField
                size="small" label="Short code" value={newItem.shortCode}
                placeholder={initialsOf(newItem.name) || 'TF'}
                onChange={(e) => setNewItem({ ...newItem, shortCode: e.target.value.toUpperCase().replace(/[^A-Z0-9/#]/g, '').slice(0, 12) })}
                slotProps={{ input: { sx: { fontFamily: 'monospace' } }, inputLabel: { shrink: true } }}
                helperText="Its rung in every order row code. # = number only."
                sx={{ flex: 1 }}
              />
            </Box>
            <TextField
              select size="small" label="Group" value={newItem.groupId}
              onChange={(e) => setNewItem({ ...newItem, groupId: Number(e.target.value), subgroupId: '' })}
            >
              {taxonomy.groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </TextField>
            <TextField
              select size="small" label="Sub-group" value={newItem.subgroupId}
              disabled={!newItem.groupId}
              onChange={(e) => setNewItem({ ...newItem, subgroupId: Number(e.target.value) })}
            >
              {taxonomy.subgroups.filter((sg) => sg.groupId === newItem.groupId)
                .map((sg) => <MenuItem key={sg.id} value={sg.id}>{sg.name}</MenuItem>)}
            </TextField>
            <TextField
              select size="small" label="Made or bought" value={newItem.procurement}
              onChange={(e) => setNewItem({ ...newItem, procurement: e.target.value as 'make' | 'buy' })}
            >
              <MenuItem value="make">Made here</MenuItem>
              <MenuItem value="buy">Bought in</MenuItem>
            </TextField>
            <TextField
              size="small" label="Unit" value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewItem(null)}>Cancel</Button>
            <Button
              variant="contained" disabled={creating || !newItem.name.trim() || !newItem.subgroupId}
              onClick={() => void createItem()}
            >
              {creating ? <CircularProgress size={16} color="inherit" /> : 'Create and add'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      <ConfirmDialog
        open={confirmDeployed}
        title="This order is already on the floor"
        confirmLabel="Save anyway"
        body={(
          <Typography sx={{ fontSize: 13.5 }}>
            <b>{deployedProductionOrders}</b> production order{deployedProductionOrders === 1 ? ' is' : 's are'} deployed
            {' '}for this sales order. Saving changes the BOM underneath {deployedProductionOrders === 1 ? 'it' : 'them'}:
            {' '}the shop keeps working to the old plan until you press <b>Re-deploy</b> on the Production step,
            {' '}which the step will flag as “changed since deploy”.
          </Typography>
        )}
        onClose={() => setConfirmDeployed(false)}
        onConfirm={() => { setConfirmDeployed(false); create(false, true); }}
      />

      <ConfirmDialog
        open={confirmRemove}
        title="Remove these rows?"
        confirmLabel="Save anyway"
        body={(
          <Typography sx={{ fontSize: 13.5 }}>
            Saving will remove <b>{removedItemIds.length}</b> row{removedItemIds.length === 1 ? '' : 's'} that
            {' '}exist on this order. Any tasks generated for them that have not started yet are dropped along
            with them — a row with tasks already IN PROGRESS is refused instead, and this save would fail.
          </Typography>
        )}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => doCreate(false)}
      />

      <ConfirmDialog
        open={confirmPull}
        title="Pull BOM defaults?"
        confirmLabel="Discard edits and pull"
        body={(
          <Typography sx={{ fontSize: 13.5 }}>
            This structure has unsaved edits. Pulling the BOM's default flows re-reads the structure from
            the server, which would discard them. Save first if you want to keep them.
          </Typography>
        )}
        onClose={() => setConfirmPull(false)}
        onConfirm={() => pullBomDefaults()}
      />

    </>
  );

  if (!open) return null;
  if (flat) {
    // The line card is the surface; this is its body. Rows first, then the
    // toolbar and totals, then the one button that writes anything.
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {body}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.5, py: 1, borderTop: '1px solid var(--c-divider)' }}>
          {createButton}
        </Box>
        {dialogs}
      </Box>
    );
  }
  return (
    <Surface e={1} sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/*
        NO HEADING. The card this renders into is already titled with the line,
        and a second title repeating it was the middle of three "Span"s on one
        screen. What the heading's caption said — change the numbers, nothing
        is saved until you press Create — is said by the Create button being
        there and nothing having moved.
      */}
      {body}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>{createButton}</Box>
      {dialogs}
    </Surface>
  );
}
