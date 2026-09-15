import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabMutate } from '../api/client';
import { getOrderLines, getSellableItems, type OrderLineRow, type SellableItem } from '../api/catalog';
import { Surface, EmptyState, useToast, Mono, backendMessage, ConfirmDialog } from '../components';
import StructureEditor, { StructureColumnHeader, type StructureSaveResult } from './StructureEditor';
import { DialogCloseButton } from './FormDialog';
import type { OrderReadiness } from '../api/readiness';

/**
 * Step 1: what this order is selling, AND what each of those is made of.
 *
 * ── WHY THESE ARE ONE SCREEN ─────────────────────────────────────────────────
 *
 * They were two, and the second one was quietly wrong: it rendered the BOM for
 * `buildable[0]` — the FIRST line, hardcoded. An order with two lines showed two
 * line items and one structure, and the second line's BOM could not be reached
 * at all once built. `currentTree` has the same shape of assumption in it: given
 * several roots it returns the first, because a caller that did not say which
 * line it meant had to be answered somehow.
 *
 * Splitting them was the mistake. A line and its BOM are one thought — "we are
 * selling two spans, here is what a span is made of" — and asking on one screen
 * then answering on another is what let the answer go missing for the second
 * line without anyone noticing.
 *
 * So a line is a card, and its BOM is inside the card. ONE LINE OPEN AT A TIME
 * (EU-17 item 7) — a card that opens with the whole recipe under it is long
 * enough that two open together meant scrolling past one to see the other.
 *
 * A line used to be a catalog item. It cannot be — the item catalog holds raw
 * materials and consumables, and nobody is going to add "42m span composite
 * girder" to it, because every job is one-off and the catalog would be a
 * catalog of one. So a line is free text: a description the user types, a
 * structure type derived from the item, and a quantity.
 *
 * No date and no plant here. Both belong to the order: two places to answer one
 * question is two chances to disagree, and it is the order's answer that anyone
 * downstream acts on.
 */

/** Kept for callers outside this file that only ever read `.length` off it (SalesOrderDetail.tsx). */
export interface FabOrderLine {
  id: number; orderId: number; lineNo: number;
  code?: string | null; description?: string | null; lineType?: string | null;
  qty: number; unit?: string | null; unitPrice?: number | null;
  qtyCompleted?: number | null;
  templateItemId?: number | null; catalogItemId?: number | null;
}

export default function OrderLinesPanel({
  orderId, canManage, onChanged, onDirtyChange, revisionReason, expandLineId,
}: {
  orderId: number;
  canManage: boolean;
  /** Fired after any write, with the readiness the write returned when it has one. */
  onChanged?: (readiness?: OrderReadiness) => void;
  /**
   * Fired whenever ANY open line's structure has unsaved edits. `SalesOrderWizard`
   * does not consume this yet (EU-17 cannot edit that file — flagged for EU-19);
   * it exists so closing the wizard or switching steps can eventually ask first.
   * This panel already guards its OWN actions that would discard those edits
   * (switching which line is open, and the browser tab closing).
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Set while the wizard is reopened in revision mode (P4/decision-4): every
   * `StructureEditor` this panel mounts must carry it, so a structure apply on
   * a non-draft order records it against `fab_order_structure_revisions`
   * instead of 400ing with `REVISION_REASON_REQUIRED`. Undefined on a draft
   * order.
   */
  revisionReason?: string;
  /**
   * "Where is this part" (X1) — set to a line id to open that line's card and
   * scroll it into view, collapsing whichever other line was open (EU-17's
   * one-open-at-a-time rule). `SalesOrderWizard`'s `BlankNesting.onGoToStructure`
   * resolves the item's line and hands it here.
   */
  expandLineId?: number | null;
}) {
  const { toast } = useToast();
  const [lines, setLines] = useState<OrderLineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** Which line's card is open — ONE AT A TIME (item 7). Null until the first load picks one. */
  const [openLineId, setOpenLineId] = useState<number | null>(null);
  /** Unsaved-edit state per line, reported by that line's own `StructureEditor`. */
  const [dirtyByLine, setDirtyByLine] = useState<Record<number, boolean>>({});
  const [discardPrompt, setDiscardPrompt] = useState<{ from: number; to: number | null } | null>(null);

  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  /**
   * WHAT THE STEEL IS, stated once for the whole line.
   *
   * An order is normally one material and one grade throughout, and every part
   * under this line inherits these; a part that differs overrides them on
   * itself. Stating it here rather than on six hundred BOM rows is the point —
   * copy it onto every row and changing the line stops meaning anything,
   * because each row now overrides it.
   *
   * Two of the three axes nesting matches on; thickness is the part's own.
   * WHICH PLATE a part is cut from is decided later, at nesting.
   */
  const [material, setMaterial] = useState('');
  const [grade, setGrade] = useState('');

  /**
   * THE STEEL IS PICKED, NOT TYPED.
   *
   * A blank's identity is material + grade + size, so "E350 BO", "E350BO" and
   * "e350 bo" would mint three catalog items for one piece of steel. The real
   * list is one material and four grades, read off the raw materials somebody
   * can actually buy — short enough that free text only ever added spellings.
   *
   * Grades are held per material rather than flat. Every grade pairs with MS
   * today so the distinction is invisible; it stops being on the first job in
   * something other than mild steel.
   */
  const [steel, setSteel] = useState<{ materials: string[]; byMaterial: Record<string, string[]> }>(
    { materials: [], byMaterial: {} },
  );
  useEffect(() => {
    api.get<{ materials: string[]; byMaterial: Record<string, string[]> }>(
      `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/steel-options`,
    ).then((r) => setSteel(r.data)).catch(() => {});
  }, []);
  const gradesFor = useCallback(
    (m: string) => (m && steel.byMaterial[m]) ? steel.byMaterial[m]
      : [...new Set(Object.values(steel.byMaterial).flat())].sort(),
    [steel],
  );
  /**
   * EDITING A LINE, not just its steel.
   *
   * There was no way to change a line once added — only to set its material and
   * grade, or delete it and start again. Deleting is not equivalent: the
   * structure built under a line is attached to it, so "change the quantity from
   * 1 to 2" meant losing 32 rows and rebuilding them.
   */
  const [editLine, setEditLine] = useState<{
    line: OrderLineRow; item: SellableItem | null;
    description: string; qty: string; unitPrice: string; material: string; grade: string;
  } | null>(null);
  const [savingSpec, setSavingSpec] = useState(false);
  const [adding, setAdding] = useState(false);
  const [delLine, setDelLine] = useState<OrderLineRow | null>(null);
  /** A delete refused with 409 LINE_HAS_STRUCTURE — the count it carried. */
  const [cascadeConfirm, setCascadeConfirm] = useState<{ line: OrderLineRow; count: number } | null>(null);

  /**
   * ONE ROUND TRIP (EU-17 item — was 2N+2: one query for the lines, N for
   * "how many rows are built under it", N for "what steel did this line
   * state"). `GET /orders/:id/lines` (EU-15) batches all three per line
   * server-side.
   */
  const load = useCallback(async () => {
    try {
      const rows = await getOrderLines(orderId);
      setLines(rows);
      setOpenLineId((cur) => (cur != null && rows.some((r) => r.id === cur) ? cur : rows[0]?.id ?? null));
    } catch (e) {
      setError(backendMessage(e, 'Could not load line items.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const anyDirty = useMemo(() => Object.values(dirtyByLine).some(Boolean), [dirtyByLine]);
  useEffect(() => { onDirtyChange?.(anyDirty); }, [anyDirty, onDirtyChange]);
  /** The one guard EU-17 CAN wire without touching `SalesOrderWizard.tsx` — a real tab close/refresh. */
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

  /**
   * Switch which line's card is open. Guarded: leaving a dirty line behind —
   * by opening a different one, or by collapsing it — would silently discard
   * whatever it holds, since its `StructureEditor` unmounts (X4).
   */
  const requestOpen = useCallback((lineId: number) => {
    const next = openLineId === lineId ? null : lineId;
    if (openLineId != null && dirtyByLine[openLineId]) {
      setDiscardPrompt({ from: openLineId, to: next });
      return;
    }
    setOpenLineId(next);
  }, [openLineId, dirtyByLine]);

  const confirmDiscardAndSwitch = useCallback(() => {
    if (!discardPrompt) return;
    setDirtyByLine((d) => ({ ...d, [discardPrompt.from]: false }));
    setOpenLineId(discardPrompt.to);
    setDiscardPrompt(null);
  }, [discardPrompt]);

  /**
   * JUMP TO A LINE (X1's "where is this part", the other half of
   * `BlankNesting.onGoToStructure`). This is a navigation the caller asked
   * for, not an edit the user is choosing to abandon, so — unlike
   * `requestOpen` — it does not go through the discard prompt; it simply
   * opens the target line (collapsing whatever else was open, per the
   * one-open-at-a-time rule) and scrolls its card into view once the DOM has
   * it, which is why the scroll waits a frame.
   */
  const appliedExpandLineIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (expandLineId == null) return;
    if (appliedExpandLineIdRef.current === expandLineId) return; // already applied — a later reload() must not reopen/rescroll
    if (!lines.some((l) => l.id === expandLineId)) return; // not loaded yet
    appliedExpandLineIdRef.current = expandLineId;
    setOpenLineId(expandLineId);
    const id = window.requestAnimationFrame(() => {
      document.getElementById(`order-line-${expandLineId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [expandLineId, lines]);

  /**
   * HOW MANY OF THIS LINE, typed where it is read.
   *
   * CONTROLLED, not the box's own DOM value (item 8) — the box used to be
   * uncontrolled and `saveQty` returned early on a rejected number, so a typed
   * "0" or a typed "-3" stayed on screen looking accepted while the server had
   * refused it. This is also the value decision 3 now multiplies everything
   * under the line by, so it must never show one the server did not agree to.
   */
  const [qtyDrafts, setQtyDrafts] = useState<Record<number, string>>({});
  const [qtyErrors, setQtyErrors] = useState<Record<number, string>>({});
  const qtyValueFor = (line: OrderLineRow) => qtyDrafts[line.id] ?? String(Number(line.qty ?? 1));

  /**
   * Returns whether the qty landed (write succeeded, or the typed number
   * already matched — a no-op). `StructureEditor`'s root-row qty box calls
   * this SAME function (via `onSaveLineQty` below) so the tree's "quantity
   * of this line" editing and the line card's own box share one write path,
   * one validation, and one readiness refresh.
   */
  const saveQty = useCallback(async (line: OrderLineRow, raw: string): Promise<boolean> => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      setQtyErrors((e) => ({ ...e, [line.id]: 'Must be a positive number' }));
      setQtyDrafts((d) => ({ ...d, [line.id]: raw })); // keep what was typed, marked invalid
      return false;
    }
    if (n === Number(line.qty ?? 1)) {
      setQtyDrafts((d) => omitKey(d, line.id));
      setQtyErrors((e) => omitKey(e, line.id));
      return true;
    }
    try {
      await fabMutate('fabErpOrderLine', 'update', { id: line.id, qty: n });
      setQtyErrors((e) => omitKey(e, line.id));
      setQtyDrafts((d) => omitKey(d, line.id));
      await load();
      onChanged?.();
      return true;
    } catch (e) {
      // REJECTED — revert to the server's own value rather than leaving the
      // typed one on screen looking accepted.
      setQtyDrafts((d) => omitKey(d, line.id));
      setQtyErrors((er) => ({ ...er, [line.id]: backendMessage(e, 'Could not change that quantity.') }));
      return false;
    }
  }, [load, onChanged]);

  async function saveLine() {
    if (!editLine) return;
    setSavingSpec(true); setError('');
    try {
      const e = editLine;
      await fabMutate('fabErpOrderLine', 'update', {
        id: e.line.id,
        description: e.description.trim() || null,
        qty: Number(e.qty) || 1,
        unit_price: e.unitPrice ? Number(e.unitPrice) : null,
        /*
         * Sent even when unchanged so a line that predates the picker acquires
         * it the first time somebody edits it. `line_type` is NOT sent — the
         * server derives it from the item's own group the moment
         * `catalog_item_id` is part of the write (`deriveOrderLineType`,
         * EU-15), so a client-typed value could only ever disagree with it.
         */
        catalog_item_id: e.item?.id ?? null,
        template_item_id: e.item?.id ?? null,
      });
      // The steel is its own route: it is a field value on the line, not a
      // column, so the generic update cannot carry it.
      await api.post(`${specBase()}/spec/lines/${e.line.id}`, {
        material: e.material.trim(), grade: e.grade.trim(),
      });
      setEditLine(null);
      await load();
      onChanged?.();
      toast('Line updated');
    } catch (e) {
      setError(backendMessage(e, 'Could not update the line.'));
    } finally { setSavingSpec(false); }
  }

  /**
   * WHAT IS BEING SOLD, picked from the catalog rather than typed twice.
   *
   * `getSellableItems` (EU-15) is the server's own rule for "what may a line
   * sell" — Fabricated-category items only — replacing a client-side
   * `categoryId` filter that silently returned the WRONG set once the
   * category list ran past its own page limit. On THIS company it currently
   * returns nothing (no category is named "Fabricated" locally, see below);
   * that is a data-setup gap, not a bug in the picker, so the empty state
   * says so rather than the Autocomplete just looking broken.
   */
  const [sellable, setSellable] = useState<SellableItem[]>([]);
  const [sellableLoaded, setSellableLoaded] = useState(false);
  useEffect(() => {
    getSellableItems().then(setSellable).catch(() => setSellable([])).finally(() => setSellableLoaded(true));
  }, []);

  const [item, setItem] = useState<SellableItem | null>(null);
  const pickItem = (picked: SellableItem | null) => {
    setItem(picked);
    if (!picked) return;
    // Only fill what is still blank — retyping over somebody's edit because
    // they changed their mind about the item is worse than leaving it stale.
    setDescription((d) => (d.trim() ? d : picked.name));
  };

  // Not `lines.length + 1` (item 15): 1,2,3 minus a deleted 2 is length 2,
  // which would reissue line 3 a second time. The highest number actually in
  // use is what must never repeat.
  const lineNo = lines.reduce((max, l) => Math.max(max, l.lineNo), 0) + 1;

  async function add() {
    if (!item || !qty) return;
    setAdding(true); setError('');
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpOrderLine', 'insert', {
        order_id: orderId,
        line_no: lineNo,
        description: description.trim() || null,
        qty: Number(qty),
        /**
         * ONE PICK, TWO COLUMNS — `catalog_item_id` is what was chosen,
         * `template_item_id` is the BOM to expand and is the same item.
         * `line_type` is derived server-side from `catalog_item_id` the
         * moment it is part of the write (EU-15 `deriveOrderLineType`).
         */
        catalog_item_id: item?.id ?? null,
        template_item_id: item?.id ?? null,
        unit_price: unitPrice ? Number(unitPrice) : null,
      });
      /**
       * The steel is a SECOND call, because a line has to exist before a field
       * value can hang off it. `/mutate` insert returns `{ok, id}` (§13) —
       * read the new row's id straight off the response rather than
       * re-querying by line number.
       */
      if (material.trim() || grade.trim()) {
        await api.post(`${specBase()}/spec/lines/${res.id}`, {
          material: material.trim(), grade: grade.trim(),
        });
      }
      // The item clears with the rest, or the next pick finds the description
      // already filled and leaves the previous line's values in place.
      setItem(null);
      setDescription(''); setQty('1'); setUnitPrice('');
      setMaterial(''); setGrade('');
      await load();
      setOpenLineId(res.id); // a line you just added opens itself
      onChanged?.();
      toast('Line item added');
    } catch (e) {
      setError(backendMessage(e, 'Could not add the line.'));
    } finally { setAdding(false); }
  }

  async function remove(line: OrderLineRow, cascade = false) {
    try {
      await fabMutate('fabErpOrderLine', 'delete', { id: line.id, ...(cascade ? { cascade: true } : {}) });
      setDelLine(null); setCascadeConfirm(null);
      await load();
      onChanged?.();
      toast('Line item removed');
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: { code?: string; detail?: { count?: number } } } }).response;
      if (!cascade && res?.status === 409 && res.data?.code === 'LINE_HAS_STRUCTURE') {
        setDelLine(null);
        setCascadeConfirm({ line, count: res.data?.detail?.count ?? 0 });
        return;
      }
      setError(backendMessage(e, 'Could not remove the line.'));
    }
  }

  const onStructureDone = useCallback((result?: StructureSaveResult) => {
    // No treeVersion bump (item 12): `StructureEditor.doCreate` already
    // re-baselines its own tree via `t.set(t.tree)` on a save, so forcing a
    // remount here only bought a wasted `GET .../structure/tree`. The key
    // below still remounts on the ACTUAL 'new'→'built' transition, via
    // `rowsBuilt` changing once `load()` refreshes it.
    void load();
    onChanged?.(result?.readiness);
  }, [load, onChanged]);

  if (loading) {
    return <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>;
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {canManage && (
        <Surface e={1} sx={{ p: 2, mb: 2 }}>
          <Typography sx={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5,
          }}>
            Add line item
          </Typography>

          {sellableLoaded && sellable.length === 0 && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              Nothing is set up to sell yet. A line is picked from the catalog's finished structures —
              an item under a "Fabricated" category, or any item that heads a bill of materials. Add one
              in the Item Catalog first.
            </Alert>
          )}

          {/*
            ONE BAR, NOT A FORM. What has to be chosen (the item) is wide and
            first; the two numbers are narrow beside it; Add closes the row.
            The steel — material and grade — is a second, quieter row that
            appears once an item is picked, with ONE hint for the pair rather
            than a helper line under every box (three helper lines made a
            one-line bar a three-line block).
          */}
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {/*
              THE ONE THING THAT HAS TO BE CHOSEN. It decides the structure, so
              it comes first and everything after it is a detail of this line.
            */}
            <Autocomplete
              options={sellable}
              value={item}
              onChange={(_, v) => pickItem(v)}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              sx={{ flex: '2 1 280px' }}
              disabled={sellable.length === 0}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box sx={{ py: 0.25 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{o.name}</Typography>
                    {/* Several catalog items share a name (e.g. "Span") — the
                        taxonomy is what actually tells them apart here. */}
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                      {[o.categoryName, o.groupName, o.subgroupName].filter(Boolean).join(' › ')}
                      {o.code ? ` · ${o.code}` : ''}
                    </Typography>
                  </Box>
                </li>
              )}
              filterOptions={(opts, { inputValue }) => {
                const q = inputValue.trim().toLowerCase();
                if (!q) return opts;
                return opts.filter((o) => [o.name, o.code].filter(Boolean).join(' ').toLowerCase().includes(q));
              }}
              renderInput={(params) => (
                <TextField
                  {...params} label="Item to sell" size="small" required
                  placeholder="Its BOM becomes the structure"
                />
              )}
            />
            {/*
              NO CODE HERE ANY MORE.

              A line's code was the top level of every item code beneath it, and
              the BOQ sheet keyed its rows on it. Neither exists now: the BOM
              step mints no codes, and the sheet is retired. A line is
              identified by its number and what it is selling; codes come back
              at production-order time, on the pieces that need them.
            */}
            <TextField
              label="Qty" size="small" type="number" value={qty} sx={{ flex: '0 0 84px' }}
              onChange={(e) => setQty(e.target.value)}
              slotProps={{ htmlInput: { min: 1, style: { fontFamily: 'var(--font-mono)', textAlign: 'right' } } }}
            />
            <TextField
              label="Unit price" size="small" type="number" value={unitPrice} sx={{ flex: '0 0 128px' }}
              onChange={(e) => setUnitPrice(e.target.value)}
              slotProps={{ htmlInput: { min: 0, style: { fontFamily: 'var(--font-mono)', textAlign: 'right' } } }}
            />
            <Button
              variant="contained"
              startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
              disabled={adding || !item || !qty}
              onClick={add}
              sx={{ flexShrink: 0 }}
            >
              Add line
            </Button>
          </Box>

          {/* The steel, stated once for everything under this line. Blank is
              fine — a part can state its own, and nesting will ask for one
              before it can choose a plate. */}
          {item && (
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mt: 1.5 }}>
              <TextField
                select label="Material" size="small" value={material} sx={{ flex: '0 0 150px' }}
                onChange={(e) => {
                  const next = e.target.value;
                  setMaterial(next);
                  // A grade that does not exist for the new material is not a
                  // choice somebody made — it is one they made about the old one.
                  if (next && grade && !gradesFor(next).includes(grade)) setGrade('');
                }}
              >
                <MenuItem value="">—</MenuItem>
                {steel.materials.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
              <TextField
                select label="Grade" size="small" value={grade} sx={{ flex: '0 0 150px' }}
                onChange={(e) => setGrade(e.target.value)}
              >
                <MenuItem value="">—</MenuItem>
                {gradesFor(material).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </TextField>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: '1 1 220px', minWidth: 0 }}>
                Steel for every part under this line. Optional — a part can state its own, and nesting asks before it picks a plate.
              </Typography>
            </Box>
          )}
        </Surface>
      )}

      {lines.length === 0 ? (
        <EmptyState
          icon={<Inventory2Rounded />}
          title="No line items yet"
          hint="Add what this order is selling — an item, a description and a quantity. Its bill of materials becomes this line's structure."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {lines.map((line) => {
            const isOpen = openLineId === line.id;
            const rowsBuilt = line.builtCount ?? 0;
            const steelStated = [line.material, line.grade].filter(Boolean).join(' · ');
            const qtyError = qtyErrors[line.id];
            return (
              <Surface key={line.id} id={`order-line-${line.id}`} e={1} sx={{ overflow: 'hidden' }}>
                {/*
                  ── the line IS the top row of its own table ──────────────
                  Same columns as every row beneath it (gutter · name · qty ·
                  size · made-by · actions), the column header ABOVE it when it
                  is open, and the structure rows straight after — so line and
                  bill of materials read as one piece, not a card in a card.
                */}
                {isOpen && <StructureColumnHeader />}
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1,
                  pl: 1, pr: 1.5, py: 0.4, minHeight: 40,
                  borderBottom: isOpen ? '1px solid var(--c-divider)' : undefined,
                  background: isOpen ? 'var(--c-primary-50)' : 'var(--c-surface-2)',
                }}>
                  {/* gutter — same 92px the tree rows indent by */}
                  <Box sx={{ width: 84, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                      size="small" sx={{ p: 0.25 }}
                      onClick={() => requestOpen(line.id)}
                      aria-label={isOpen ? 'Collapse this line' : 'Expand this line'}
                    >
                      {isOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                    </IconButton>
                    <Mono chip>{line.lineNo}</Mono>
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, flexShrink: 0 }}>
                      {line.description ?? '—'}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-3)', minWidth: 0 }}>
                      {[steelStated || null, dirtyByLine[line.id] ? 'unsaved edits' : null]
                        .filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>

                  {/* the LINE's quantity, in the Qty column — everything beneath is per one of these */}
                  <Tooltip title={`How many of this line. Every row beneath is per one ${line.description ?? 'unit'}.`}>
                    <TextField
                      size="small" type="number" disabled={!canManage}
                      value={qtyValueFor(line)}
                      error={!!qtyError}
                      onChange={(e) => setQtyDrafts((d) => ({ ...d, [line.id]: e.target.value }))}
                      onBlur={(e) => void saveQty(line, e.target.value)}
                      sx={{ width: 76, flexShrink: 0 }}
                      inputProps={{ min: 1, style: { fontSize: 12, textAlign: 'right', fontWeight: 600 }, 'aria-label': `Quantity for line ${line.lineNo}` }}
                    />
                  </Tooltip>

                  <Box sx={{ width: 234, flexShrink: 0 }}>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                      {rowsBuilt > 0 ? `${rowsBuilt} rows below` : 'nothing built yet'}
                    </Typography>
                  </Box>
                  <Box sx={{ width: 150, flexShrink: 0 }}>
                    <Typography noWrap sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{line.lineType ?? ''}</Typography>
                  </Box>

                  {canManage && (
                    <Box sx={{ display: 'flex', flexShrink: 0, width: 96, justifyContent: 'flex-end' }}>
                      <Tooltip title="Edit this line">
                        <IconButton
                          size="small"
                          onClick={() => setEditLine({
                            line,
                            item: sellable.find((c) => c.id === (line.templateItemId ?? line.catalogItemId)) ?? null,
                            description: line.description ?? '',
                            // Number() first: the API returns DECIMAL as "1.0000",
                            // and a box that opens reading 1.0000 invites somebody
                            // to "fix" it.
                            qty: String(Number(line.qty ?? 1)),
                            unitPrice: line.unitPrice == null ? '' : String(line.unitPrice),
                            material: line.material ?? '',
                            grade: line.grade ?? '',
                          })}
                          aria-label={`Edit ${line.description ?? `line ${line.lineNo}`}`}
                        >
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton
                          size="small" color="error" onClick={() => setDelLine(line)}
                          aria-label={`Remove ${line.description ?? `line ${line.lineNo}`}`}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
                {qtyError && (
                  <Typography sx={{ fontSize: 11, color: 'var(--c-danger-600)', px: 1.5, pt: 0.5 }}>{qtyError}</Typography>
                )}

                {/*
                  ── AND WHAT IT IS MADE OF, in the same card ──────────────

                  `source` is per line: a line with nothing built opens on the
                  CATALOGUE's recipe, one that has opens on what this order
                  settled on. On a two-line order those can differ, which is the
                  case the old single-structure screen could not express at all.
                */}
                {isOpen && (
                  <StructureEditor
                    key={`line-${line.id}-${rowsBuilt > 0 ? 'built' : 'new'}`}
                    source={rowsBuilt > 0 ? 'current' : 'bom'}
                    open
                    orderId={orderId}
                    orderLine={{
                      id: line.id,
                      code: line.code ?? null,
                      description: line.description ?? null,
                      itemId: line.templateItemId ?? line.catalogItemId ?? null,
                      qty: Number(line.qty ?? 1),
                    }}
                    revisionReason={revisionReason}
                    chrome="flat"
                    // `inline` fires `onClose` after every successful save too (it is
                    // also what the old dialog variant's Cancel/X meant) — a no-op
                    // here, same as before EU-17, so saving does not collapse the
                    // card. Collapsing is the chevron's job (`requestOpen`), which
                    // already guards against discarding unsaved edits.
                    onClose={() => {}}
                    onDone={onStructureDone}
                    // A bulk flow action (item 6) — readiness moved, but nothing
                    // this panel shows (row count, built count) did, so this
                    // must NOT reload/remount the editor: that would be the
                    // exact extra `GET .../structure/tree` decision 6's
                    // verification checks for.
                    onReadinessChanged={(readiness) => onChanged?.(readiness)}
                    /*
                     * BAIL OUT WHEN UNCHANGED — returning the SAME object
                     * reference makes React skip the re-render entirely.
                     * Without this, StructureEditor's own `useEffect(() =>
                     * onDirtyChange?.(t.dirty), [t.dirty, onDirtyChange])`
                     * sees a fresh `onDirtyChange` closure every time this
                     * panel re-renders (an inline arrow is a new reference
                     * every render), re-fires, calls back in, and re-renders
                     * this panel again — forever ("Maximum update depth
                     * exceeded"). A functional update that returns `d`
                     * unchanged stops the cycle at the first no-op tick.
                     */
                    onDirtyChange={(dirty) => setDirtyByLine((d) => (
                      d[line.id] === dirty ? d : { ...d, [line.id]: dirty }
                    ))}
                  />
                )}
              </Surface>
            );
          })}
        </Box>
      )}

      <ConfirmDialog
        open={!!discardPrompt}
        title="Discard unsaved edits?"
        confirmLabel="Discard and switch"
        body={(
          <Typography sx={{ fontSize: 13.5 }}>
            This line's structure has changes that have not been saved. Opening a different line —
            or collapsing this one — discards them.
          </Typography>
        )}
        onClose={() => setDiscardPrompt(null)}
        onConfirm={() => confirmDiscardAndSwitch()}
      />

      <Dialog open={!!delLine} onClose={() => setDelLine(null)} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => (() => setDelLine(null))()} />
        <DialogTitle sx={{ fontWeight: 600 }}>Remove line item</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5 }}>
            Remove <strong>{delLine?.description ?? `line ${delLine?.lineNo}`}</strong> from this
            order?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelLine(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delLine && remove(delLine)}>Remove</Button>
        </DialogActions>
      </Dialog>

      {/* The delete above was refused: this line still has structure under it. */}
      <ConfirmDialog
        open={!!cascadeConfirm}
        title="This line has structure under it"
        confirmLabel={`Remove line and ${cascadeConfirm?.count ?? 0} row(s)`}
        body={(
          <Typography sx={{ fontSize: 13.5 }}>
            <strong>{cascadeConfirm?.line.description ?? `Line ${cascadeConfirm?.line.lineNo}`}</strong> has{' '}
            <b>{cascadeConfirm?.count ?? 0}</b> structure row{cascadeConfirm?.count === 1 ? '' : 's'} built under it.
            Removing the line removes those rows too, along with any of their tasks that have not started.
            A row with tasks already in progress is refused instead.
          </Typography>
        )}
        onClose={() => setCascadeConfirm(null)}
        onConfirm={() => { if (cascadeConfirm) return remove(cascadeConfirm.line, true); }}
      />

      {/*
        WHAT THIS LINE IS MADE OF.

        Set here rather than on each BOM row because it is one statement about
        the whole line, and every part inherits it. A part that genuinely
        differs — a stainless insert in a mild-steel span — overrides it on
        itself, and nesting refuses any plate that disagrees with either.
      */}
      {/*
        ONE DIALOG FOR THE WHOLE LINE.
        It used to set only material and grade, so a line's item, quantity and
        price were fixed the moment it was added — and deleting to re-add is not
        equivalent, because the structure built under a line belongs to it.
      */}
      <Dialog open={!!editLine} onClose={() => setEditLine(null)} maxWidth="sm" fullWidth>
        <DialogCloseButton absolute onClose={() => setEditLine(null)} />
        <DialogTitle sx={{ fontWeight: 600 }}>
          Line {editLine?.line.lineNo}
        </DialogTitle>
        <DialogContent>
          {editLine && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
              <Autocomplete
                options={sellable}
                value={editLine.item}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onChange={(_, v) => setEditLine((e) => (e ? {
                  ...e, item: v, description: v ? v.name : e.description,
                } : e))}
                filterOptions={(opts, { inputValue }) => {
                  const q = inputValue.trim().toLowerCase();
                  if (!q) return opts.slice(0, 50);
                  return opts.filter((o) => [o.name, o.code].filter(Boolean).join(' ').toLowerCase().includes(q));
                }}
                renderOption={(props, o) => (
                  <li {...props} key={o.id}>
                    <Box>
                      <Typography sx={{ fontSize: 13 }}>{o.name}</Typography>
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                        {[o.categoryName, o.groupName, o.subgroupName].filter(Boolean).join(' › ')}
                        {o.code ? ` · ${o.code}` : ''}
                      </Typography>
                    </Box>
                  </li>
                )}
                renderInput={(p) => <TextField {...p} size="small" label="Item" />}
              />

              {/*
                CHANGING THE ITEM IS NOT A SMALL EDIT once a structure exists:
                those rows came from the old item's BOM and would stay exactly as
                they are. Said out loud, with the count, rather than discovered.
              */}
              {(editLine.line.builtCount ?? 0) > 0
                && editLine.item?.id !== (editLine.line.templateItemId ?? editLine.line.catalogItemId) && (
                <Alert severity="warning" sx={{ py: 0.5 }}>
                  This line already has <b>{editLine.line.builtCount}</b> structure row(s), built
                  from the item it was. They stay as they are — rebuild the structure if they should
                  follow the change.
                </Alert>
              )}

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Qty" size="small" type="number" sx={{ flex: '0 1 110px' }}
                  value={editLine.qty}
                  onChange={(e) => setEditLine((v) => (v ? { ...v, qty: e.target.value } : v))}
                />
                <TextField
                  label="Unit price" size="small" type="number" sx={{ flex: '0 1 150px' }}
                  value={editLine.unitPrice}
                  onChange={(e) => setEditLine((v) => (v ? { ...v, unitPrice: e.target.value } : v))}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  select label="Material" size="small" sx={{ flex: 1 }}
                  value={editLine.material}
                  onChange={(e) => setEditLine((v) => {
                    if (!v) return v;
                    const next = e.target.value;
                    const keep = !next || !v.grade || gradesFor(next).includes(v.grade);
                    return { ...v, material: next, grade: keep ? v.grade : '' };
                  })}
                >
                  <MenuItem value="">—</MenuItem>
                  {steel.materials.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
                <TextField
                  select label="Grade" size="small" sx={{ flex: 1 }}
                  value={editLine.grade}
                  onChange={(e) => setEditLine((v) => (v ? { ...v, grade: e.target.value } : v))}
                >
                  <MenuItem value="">—</MenuItem>
                  {gradesFor(editLine.material).map((g) => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </TextField>
              </Box>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                Clearing the steel removes it, and the parts stop inheriting that value.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditLine(null)} disabled={savingSpec}>Cancel</Button>
          <Button
            variant="contained" onClick={saveLine} disabled={savingSpec || !editLine?.item}
            startIcon={savingSpec ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** The fab_erp app root, which the spec routes hang off. */
function specBase() {
  return `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;
}

/** A copy of `obj` without `key` — `delete` would mutate state in place. */
function omitKey<T>(obj: Record<number, T>, key: number): Record<number, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}
