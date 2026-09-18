/**
 * ItemBomDesigner — what a catalog item is made of, as one tree.
 *
 * ── WHY IT IS A TREE NOW ─────────────────────────────────────────────────────
 *
 * It used to show ONE LEVEL with a breadcrumb to walk down. The reasoning was
 * that a Composite Girder is 247 nodes and nobody reads that — but the cost was
 * worse than the noise: to change a stiffener count you walked Span > Line >
 * Segment, could never see two levels at once, and every step threw away where
 * you had been. The order's Structure step had already settled this question by
 * showing the whole thing and letting rows collapse.
 *
 * So this is the same tree, from the same builder on the server
 * (`/item-bom/:id/tree` -> `draftTree`). The recipe and the order that takes it
 * now look alike on purpose: one thing, rendered one way — literally: both this
 * and `StructureEditor` render through `<TreeEditor>` (EU-17 item 2), which owns
 * indentation, the expand chevron and per-row memoisation, and renders through
 * `react-window` here since this tree has no inline add-picker or drawings
 * panel to make row heights uneven.
 *
 * ── WHAT A LINE STILL CARRIES ────────────────────────────────────────────────
 *
 * The quantity is either a fixed number or VARIES PER JOB with a required
 * default (EU-6 replaced the old "ask the order" dead end — a live question
 * `draftTree` had no way to feed an answer back into). That distinction is
 * the one thing the add dialog still asks about; everything else about a
 * line is edited ON THE ROW.
 *
 * ── A BACKEND GAP THIS FILE WORKS AROUND (EU-16) ─────────────────────────────
 *
 * `draftTree` (bomService.js, shared with the order structure editor) reports
 * ONLY `variesPerJob: boolean` for a line now, not the parameter's name — the
 * name was dropped from the tree projection when EU-6 added the flag. That
 * name is still what `setBomLine` requires alongside a fixed number on EVERY
 * write (insert or edit — there is no partial-patch exemption), so a row this
 * screen cannot ask the name for again cannot be patched without either
 * inventing one or silently converting it to a fixed quantity. So:
 * a `variesPerJob` row's OTHER fields (code, size, flow) are shown disabled
 * here, not merely read-only-by-convention, and its quantity is only ever
 * changed through "Change quantity", which re-collects a full, fresh answer.
 * Flagged for whoever owns `bomService.js`'s `draftTree` next — restoring
 * `qtyParam` as an ADDITIVE field alongside `variesPerJob` removes the need
 * for this workaround entirely.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';

import {
  getItemBomTree, saveItemBomLine, deleteItemBomLine, pickLabel,
  type ItemBomNode, type PickFilterInput,
} from '../api/templates';
import { PickFilterFields, PickFilterDialog } from './PickFilterFields';
import { EMPTY_PICK, pickInputOf, type PickDraft } from './pickFilter';
import { listCatalogItems, createCatalogItem, type CatalogItemRow } from '../api/catalog';
import { fabQuery } from '../api/client';
import { backendMessage } from '../components';
import { PROCUREMENT_TYPES } from '../pages/ItemCatalog/shared';
import TreeEditor from './TreeEditor/TreeEditor';
import type { RowMeta } from './TreeEditor/TreeNode';

/** Sentinel value for the "How many" select's varies-per-job option. */
const VARIES_PER_JOB = '__varies__';

/** The three sizes a recipe may state, in the order a fabricator says them. */
const DIMS = [
  { key: 'thickness_mm', label: 'thk' },
  { key: 'width_mm', label: 'wid' },
  { key: 'length_mm', label: 'len' },
] as const;

/** Every row is this tall — `react-window` needs one fixed number. */
const ROW_HEIGHT = 40;

/**
 * What the add-line picker needs to know about an item: enough to label it.
 * Held on its own rather than as a full `CatalogItemRow` so a just-created
 * item (id + name + code, nothing else yet) can be the picked value too.
 */
type PickOption = Pick<CatalogItemRow, 'id' | 'name' | 'code'>;

/** A line being added. Deliberately two questions, not eight. */
interface Draft {
  parentItemId: number;
  parentName: string;
  childItemId: number | '';
  variesPerJob: boolean;
  qtyNum: string;
  qtyParam: string;
  defaultQty: string;
  sortOrder: number;
  /** A pick line: the child is the role, and each order chooses the item from `pick`. */
  isPick: boolean;
  pick: PickDraft;
}

/** A line's pick filter as the server takes it (names dropped). */
const pickInputOfNode = (n: ItemBomNode): PickFilterInput | null => (n.pick
  ? { categoryId: n.pick.categoryId, groupId: n.pick.groupId, subgroupId: n.pick.subgroupId, defaultItemId: n.pick.defaultItemId }
  : null);

/** Re-asking the quantity on an EXISTING row — see the file header for why this is its own dialog. */
interface QtyEdit {
  node: ItemBomNode;
  parentItemId: number;
  variesPerJob: boolean;
  qtyNum: string;
  qtyParam: string;
  defaultQty: string;
}

const dimOf = (n: ItemBomNode, k: string) => {
  const v = n.dims?.[k];
  return v == null ? '' : String(v);
};

export default function ItemBomDesigner({
  catalogItemId, catalogItemName, mode = 'edit',
}: {
  catalogItemId: number;
  catalogItemName: string;
  mode?: 'edit' | 'readonly';
}) {
  const canEdit = mode === 'edit';

  const [tree, setTree] = useState<ItemBomNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getItemBomTree(catalogItemId);
      setTree(res.tree ?? null);
    } catch (err) {
      setError(backendMessage(err, 'Could not read this item’s BOM.'));
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, [catalogItemId]);

  useEffect(() => { void load(); }, [load]);

  // Every node's PARENT catalog item id, so a row can identify its own BOM
  // line (`parentItemId` + `childItemId`) without threading it through the
  // recursion by hand — `<TreeEditor>` hands a row its own node, not its path.
  const parentOf = useMemo(() => {
    const map = new Map<string, number>();
    const walk = (n: ItemBomNode) => {
      n.children.forEach((c) => { map.set(c.key, n.catalogItemId); walk(c); });
    };
    if (tree) walk(tree);
    return map;
  }, [tree]);

  // ── the pick list ────────────────────────────────────────────────────────
  /**
   * Search-driven, not a 1,000-row load on mount (EU-16 item 6). `q` empty
   * still returns a page — the most-recently-touched items are usually the
   * next line too — but nothing here ever asks for more than one page.
   */
  const [pickerSearch, setPickerSearch] = useState('');
  const [options, setOptions] = useState<CatalogItemRow[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const loadOptions = useCallback((q: string) => {
    setOptionsLoading(true);
    return listCatalogItems({ q: q || undefined, pageSize: 50 })
      .then((r) => { setOptions(r.rows ?? []); return r.rows ?? []; })
      .catch(() => { setOptions([]); return [] as CatalogItemRow[]; })
      .finally(() => setOptionsLoading(false));
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { void loadOptions(pickerSearch); }, 250);
    return () => clearTimeout(t);
  }, [pickerSearch, loadOptions]);

  /**
   * THE PICKED ITEM LIVES HERE, NOT IN `options`.
   *
   * It used to be re-derived as `options.find(id)` on every render, and
   * `options` is one page of a SERVER search driven by whatever the input
   * box says. Choosing an item rewrites the box to its label
   * ("Box Girder — BOXGIR-GDR"), that label matched nothing, the page came
   * back empty, the value collapsed to null, MUI reset the box to "", the
   * empty search brought the item back, the box became the label again…
   * The field flickered or blanked and a line could never be added for an
   * item that was not on the first page. So: the choice is its own state,
   * the search term only follows what is TYPED (`reason === 'input'`), and
   * the choice is merged into the options so MUI always finds it.
   */
  const [picked, setPicked] = useState<PickOption | null>(null);
  const pickerOptions = useMemo<PickOption[]>(
    () => (picked && !options.some((o) => o.id === picked.id) ? [picked, ...options] : options),
    [options, picked],
  );

  /** The flows a line can default to. Same list the order's Flows tab offers. */
  const [flows, setFlows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpOperationFlow', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 200 },
    })
      .then((r) => setFlows(r.data ?? []))
      .catch(() => setFlows([]));
  }, []);

  /**
   * CREATING THE CHILD FROM HERE, because the moment you need it is here.
   *
   * Deliberately the smallest item that is still valid: name, category, unit,
   * and now a procurement choice (EU-16 item 9 — this used to force `make`
   * regardless of what was actually being added, which is wrong for a bought
   * part like a bolt or a shear stud).
   */
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpItemCategory', {
      orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 },
    })
      .then((r) => setCategories(r.data ?? []))
      .catch(() => setCategories([]));
  }, []);

  /*
   * UAT 2: the same fields the order's structure editor asks for. Group and
   * sub-group place the item in the catalogue (an ungrouped item is invisible
   * on the catalogue screens), Code is its identity (blank = generated), and
   * Short code is its rung in every order row code (blank = initials).
   */
  const [newItem, setNewItem] = useState<{
    name: string; code: string; shortCode: string; categoryId: number | '';
    groupId: number | ''; subgroupId: number | ''; unit: string; procurementType: string;
  } | null>(null);
  const [taxonomy, setTaxonomy] = useState<{
    groups: { id: number; name: string; categoryId: number }[];
    subgroups: { id: number; name: string; groupId: number }[];
  }>({ groups: [], subgroups: [] });
  useEffect(() => {
    Promise.all([
      fabQuery<{ data: { id: number; name: string; categoryId: number }[] }>('fabErpItemGroup', { pagination: { limit: 500 } }),
      fabQuery<{ data: { id: number; name: string; groupId: number }[] }>('fabErpItemSubgroup', { pagination: { limit: 1000 } }),
    ]).then(([g, sg]) => setTaxonomy({ groups: g.data ?? [], subgroups: sg.data ?? [] })).catch(() => {});
  }, []);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [qtyEdit, setQtyEdit] = useState<QtyEdit | null>(null);
  const [qtySaving, setQtySaving] = useState(false);
  const [qtyError, setQtyError] = useState<string | null>(null);
  /** The row whose pick filter is being set or changed. */
  const [pickEdit, setPickEdit] = useState<{ node: ItemBomNode; parentItemId: number } | null>(null);
  const pickTaxonomy = useMemo(() => ({ categories, groups: taxonomy.groups, subgroups: taxonomy.subgroups }), [categories, taxonomy]);

  const createItem = useCallback(async () => {
    if (!newItem || !newItem.name.trim() || newItem.categoryId === '') return;
    setCreating(true);
    setCreateError(null);
    try {
      // EU-16 item 9: no more codegen pre-fetch before the insert — that burned
      // a code sequence whenever the insert itself then failed. One call now
      // creates the item and hands back the id/code it actually got.
      const res = await createCatalogItem({
        name: newItem.name.trim(),
        code: newItem.code.trim() || null,
        shortCode: newItem.shortCode.trim() || null,
        unit: newItem.unit.trim() || 'PC',
        categoryId: newItem.categoryId,
        groupId: newItem.groupId === '' ? null : newItem.groupId,
        subgroupId: newItem.subgroupId === '' ? null : newItem.subgroupId,
        procurementType: newItem.procurementType as 'make' | 'buy',
      });
      await loadOptions(pickerSearch);
      setPicked({ id: res.id, name: newItem.name.trim(), code: res.code });
      setDraft((d) => (d ? { ...d, childItemId: res.id } : d));
      setNewItem(null);
    } catch (err) {
      setCreateError(backendMessage(err, 'Could not create that item.'));
    } finally {
      setCreating(false);
    }
  }, [newItem, loadOptions, pickerSearch]);

  // ── writing one line ─────────────────────────────────────────────────────

  /**
   * Save a change made ON a row. Everything the tree edits inline goes through
   * here, so one edit is one request and the tree is reloaded from the server
   * rather than patched locally — the server is the thing that knows whether a
   * change made a cycle.
   *
   * Never called for a `variesPerJob` node — see the file header. That row's
   * code/size/flow controls are disabled instead of routing here, because this
   * function has no way to resend the quantity answer such a row needs on
   * every write without silently flattening it to a fixed number.
   */
  const patchLine = useCallback(async (
    node: ItemBomNode, parentItemId: number, patch: Record<string, unknown>,
  ) => {
    if (!node.bomLineId || node.variesPerJob) return;
    setBusy(true);
    setError(null);
    try {
      await saveItemBomLine({
        id: node.bomLineId,
        parentItemId,
        childItemId: node.catalogItemId,
        qtyNum: node.qty,
        qtyParam: null,
        codeSegment: node.codeSegment,
        defaultFlowId: node.defaultFlowId,
        ...patch,
      });
      await load();
    } catch (err) {
      setError(backendMessage(err, 'That change could not be saved.'));
      await load();
    } finally {
      setBusy(false);
    }
  }, [load]);

  const addLine = useCallback(async () => {
    if (!draft || draft.childItemId === '') return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveItemBomLine({
        id: null,
        parentItemId: draft.parentItemId,
        childItemId: Number(draft.childItemId),
        qtyNum: draft.variesPerJob ? null : draft.qtyNum,
        qtyParam: draft.variesPerJob ? draft.qtyParam : null,
        defaultQty: draft.variesPerJob ? draft.defaultQty : null,
        sortOrder: draft.sortOrder,
        ...(draft.isPick ? { pick: pickInputOf(draft.pick) } : {}),
      });
      setDraft(null);
      await load();
    } catch (err) {
      setSaveError(backendMessage(err, 'That line could not be saved.'));
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const saveQtyEdit = useCallback(async () => {
    if (!qtyEdit || !qtyEdit.node.bomLineId) return;
    setQtySaving(true);
    setQtyError(null);
    try {
      await saveItemBomLine({
        id: qtyEdit.node.bomLineId,
        parentItemId: qtyEdit.parentItemId,
        childItemId: qtyEdit.node.catalogItemId,
        qtyNum: qtyEdit.variesPerJob ? null : qtyEdit.qtyNum,
        qtyParam: qtyEdit.variesPerJob ? qtyEdit.qtyParam : null,
        defaultQty: qtyEdit.variesPerJob ? qtyEdit.defaultQty : null,
        // The rest of the row is untouched by this dialog — resend what the
        // tree already told us so this save cannot clear them.
        codeSegment: qtyEdit.node.codeSegment,
        defaultFlowId: qtyEdit.node.defaultFlowId,
      });
      setQtyEdit(null);
      await load();
    } catch (err) {
      setQtyError(backendMessage(err, 'That quantity could not be saved.'));
    } finally {
      setQtySaving(false);
    }
  }, [qtyEdit, load]);

  /**
   * COPY A ROW. The same item under the same parent, a second time.
   *
   * A `variesPerJob` row copies as a FIXED quantity at its current resolved
   * default — the backend gap this file works around (see header) means its
   * question name cannot be read back to give the copy the same one.
   */
  const duplicate = useCallback(async (node: ItemBomNode, parentItemId: number, at: number) => {
    setBusy(true);
    setError(null);
    try {
      await saveItemBomLine({
        id: null,
        parentItemId,
        childItemId: node.catalogItemId,
        qtyNum: node.qty,
        qtyParam: null,
        codeSegment: node.codeSegment,
        defaultFlowId: node.defaultFlowId,
        sortOrder: at + 1,
        // A copied pick line is still a pick line, with the same filter.
        ...(node.pick ? { pick: pickInputOfNode(node) } : {}),
      });
      await load();
    } catch (err) {
      setError(backendMessage(err, 'That line could not be copied.'));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const remove = useCallback(async (node: ItemBomNode) => {
    if (!node.bomLineId) return;
    setBusy(true);
    try {
      await deleteItemBomLine(node.bomLineId);
      await load();
    } catch (err) {
      setError(backendMessage(err, 'That line could not be removed.'));
    } finally {
      setBusy(false);
    }
  }, [load]);

  const counts = useMemo(() => {
    let rows = 0;
    let asks = 0;
    const walk = (n: ItemBomNode) => {
      for (const c of n.children) { rows += 1; if (c.variesPerJob) asks += 1; walk(c); }
    };
    if (tree) walk(tree);
    return { rows, asks };
  }, [tree]);

  function openQtyEdit(node: ItemBomNode, parentItemId: number) {
    setQtyError(null);
    setQtyEdit({
      node, parentItemId,
      variesPerJob: node.variesPerJob,
      qtyNum: node.variesPerJob ? '' : String(node.qty ?? ''),
      qtyParam: '',
      defaultQty: node.variesPerJob ? String(node.qty ?? '') : '',
    });
  }

  // ── one row (EU-17 item 2 — through <TreeEditor>, not a hand-rolled recursion) ──

  interface Ctx { flows: { id: number; name: string }[]; busy: boolean; canEdit: boolean }
  const ctx: Ctx = { flows, busy, canEdit };

  const renderRow = useCallback(({ node, depth, hasKids, index }: RowMeta<ItemBomNode, Ctx>) => {
    const parentItemId = parentOf.get(node.key) ?? 0;
    const isRoot = depth === 0;
    const isLeaf = !hasKids;
    /*
     * A BOUGHT ITEM IS NOT ASKED ITS SIZE.
     *
     * "Shear Stud 25 dia x 175 (headed)" states its own dimensions — they are
     * why you picked that stud and not another. Offering three empty boxes
     * beside it invites a second copy of the same fact, and the copy that gets
     * read is the catalogue's, so the typed one is wrong the moment they differ.
     */
    const isBought = (node.procurementType ?? 'make') !== 'make';
    // A varies-per-job row's other fields are DISABLED, not just read-only —
    // see the file header for why patching them here would be unsafe.
    const rowLocked = node.variesPerJob;

    return (
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          height: ROW_HEIGHT, boxSizing: 'border-box', pr: 1,
          borderBottom: '1px solid var(--c-divider)',
          bgcolor: isRoot ? 'var(--c-surface-2)' : undefined,
          '& .pick-hint': { opacity: 0, transition: 'opacity 120ms' },
          '&:hover .pick-hint, &:focus-within .pick-hint': { opacity: 1 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography noWrap sx={{ fontSize: 13.5, fontWeight: isRoot ? 600 : 500 }}>
              {node.name}
            </Typography>
            {hasKids && (
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                {node.children.length}
              </Typography>
            )}
            {/*
              * A PICK LINE says what the order will choose from. The row is the
              * role; the chip is the filter — click it to change either.
              */}
            {node.pick ? (
              <Tooltip title={rowLocked
                ? 'This line varies per job — change its quantity to a fixed number to edit what it picks from.'
                : 'Each order chooses one catalog item from here for this row.'}>
                <Chip
                  size="small" variant="outlined" color="secondary"
                  label={`Order picks: ${pickLabel(node.pick)}${node.pick.defaultItemName ? ` · ${node.pick.defaultItemName}` : ''}`}
                  onClick={canEdit && !rowLocked && !busy ? () => setPickEdit({ node, parentItemId }) : undefined}
                  sx={{ maxWidth: 300, fontSize: 11.5 }}
                />
              </Tooltip>
            ) : canEdit && !isRoot && !hasKids && !rowLocked && (
              <Chip
                className="pick-hint" size="small" variant="outlined" label="Let the order pick…"
                onClick={busy ? undefined : () => setPickEdit({ node, parentItemId })}
                sx={{ fontSize: 11.5 }}
              />
            )}
          </Stack>
        </Box>

        {/* HOW MANY — a number, or "varies per job". */}
        <Box sx={{ width: 148, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isRoot ? null : node.variesPerJob ? (
            <>
              <Tooltip title="The order answers this — its default is shown on the row until it does.">
                <Chip size="small" color="primary" variant="outlined" label={`varies (${node.qty ?? '—'})`} sx={{ maxWidth: 96 }} />
              </Tooltip>
              {canEdit && (
                <Tooltip title="Change quantity">
                  <IconButton size="small" onClick={() => openQtyEdit(node, parentItemId)} disabled={busy}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              <TextField
                size="small" type="number" disabled={!canEdit || busy}
                defaultValue={node.qty ?? ''}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (String(node.qty ?? '') === v) return;
                  void patchLine(node, parentItemId, { qtyNum: v === '' ? null : Number(v), qtyParam: null });
                }}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 13, width: 48 }, 'aria-label': `Quantity for ${node.name}` } }}
              />
              {canEdit && (
                <Tooltip title="Make this vary per job">
                  <IconButton size="small" onClick={() => openQtyEdit(node, parentItemId)} disabled={busy}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </Box>

        {/*
          * THE CODE SEGMENT, out here on the row.
          *
          * It used to be the ninth question of the add dialog, which is why
          * almost nothing had one. It is an abbreviation — "TF", "WEB" — that
          * only makes sense beside its siblings, so beside its siblings is
          * where it is typed.
          */}
        <Box sx={{ width: 92, flexShrink: 0 }}>
          {isRoot ? null : (
            <Tooltip title={rowLocked ? 'This line varies per job — use "Change quantity" first.' : ''}>
              <TextField
                size="small" placeholder="code" disabled={!canEdit || busy || rowLocked}
                defaultValue={node.codeSegment ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if ((node.codeSegment ?? '') === v) return;
                  void patchLine(node, parentItemId, { codeSegment: v || null });
                }}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5, width: 68 }, 'aria-label': `Code segment for ${node.name}` } }}
              />
            </Tooltip>
          )}
        </Box>

        {/*
          * THE SIZE, on leaves only. An assembly is welded from its parts and
          * has no rectangle of its own; a box there would invite a number that
          * means nothing. Optional throughout — plenty of parts are sized per
          * job, and a recipe that guesses is worse than one that says nothing.
          */}
        <Stack direction="row" spacing={0.5} sx={{ width: 186, flexShrink: 0 }}>
          {isRoot || isBought ? null : isLeaf ? DIMS.map((d) => (
            // A pick line's thickness and width are the picked item's own
            // (a "Stiffener Plate 12 × 170"); only its length is the design's.
            node.pick && d.key !== 'length_mm' ? (
              <Tooltip key={d.key} title="From the item the order picks">
                <Typography sx={{ width: 56, fontSize: 11.5, color: 'var(--c-text-3)', alignSelf: 'center', textAlign: 'center' }}>
                  item
                </Typography>
              </Tooltip>
            ) : (
            <TextField
              key={d.key} size="small" placeholder={d.label} disabled={!canEdit || busy || rowLocked}
              defaultValue={dimOf(node, d.key)}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (dimOf(node, d.key) === v) return;
                void patchLine(node, parentItemId, {
                  defaults: node.pick
                    ? { length_mm: v }
                    : {
                      thickness_mm: d.key === 'thickness_mm' ? v : dimOf(node, 'thickness_mm'),
                      width_mm: d.key === 'width_mm' ? v : dimOf(node, 'width_mm'),
                      length_mm: d.key === 'length_mm' ? v : dimOf(node, 'length_mm'),
                    },
                });
              }}
              slotProps={{ htmlInput: { style: { padding: '4px 6px', fontSize: 12, width: 44 }, 'aria-label': `${d.label} for ${node.name}` } }}
            />
            )
          )) : <Box sx={{ width: 186 }} />}
          {isBought && !isRoot && (
            <Tooltip title="A bought item states its own size — that is what you chose it by.">
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', alignSelf: 'center' }}>
                bought in
              </Typography>
            </Tooltip>
          )}
        </Stack>

        {/* WHAT MAKES IT. Blank is a real answer for a level that only groups. */}
        <Box sx={{ width: 156, flexShrink: 0 }}>
          {isRoot ? null : (
            <TextField
              select size="small" fullWidth disabled={!canEdit || busy || rowLocked}
              value={node.defaultFlowId ?? ''}
              onChange={(e) => void patchLine(node, parentItemId, {
                defaultFlowId: e.target.value === '' ? null : Number(e.target.value),
              })}
              slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5 }, 'aria-label': `Default flow for ${node.name}` } }}
            >
              <MenuItem value=""><em>No flow</em></MenuItem>
              {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
            </TextField>
          )}
        </Box>

        {/*
          * EXPLODE / CODE JOIN — how this line becomes rows when an order is
          * built from it (REPAIR-B/C). See `bomService.expand`'s "DOES A
          * QUANTITY MEAN MANY THINGS, OR ONE THING MANY TIMES?" comment.
          */}
        <Box sx={{ width: 76, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {/* UAT 4: a bought item or a rung with nothing under it has nothing
              to explode into — an ON switch there was a question with no
              answer. Only an assembly (a made rung with its own lines) shows one. */}
          {isRoot || isBought || node.children.length === 0 ? null : (
            <Tooltip title={rowLocked
              ? "Varies-per-job rows can't set this here — their quantity is resolved per order, not fixed on the BOM."
              : 'Assemblies explode into their own parts when the order is built; parts do not.'}>
              <span>
                <Switch
                  size="small" disabled={!canEdit || busy || rowLocked}
                  checked={node.explode}
                  onChange={(e) => void patchLine(node, parentItemId, { explode: e.target.checked })}
                  inputProps={{ 'aria-label': `Explode ${node.name}` }}
                />
              </span>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ width: 108, flexShrink: 0 }}>
          {isRoot ? null : (
            <Tooltip title={rowLocked
              ? "Varies-per-job rows can't set this here — their quantity is resolved per order, not fixed on the BOM."
              : "Dash joins this code onto its parent's with a hyphen (PARENT-CHILD); absorb continues the parent's code with no separator."}>
              <TextField
                select size="small" fullWidth disabled={!canEdit || busy || rowLocked}
                value={node.codeJoin === 'absorb' ? 'absorb' : 'dash'}
                onChange={(e) => void patchLine(node, parentItemId, { codeJoin: e.target.value })}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5 }, 'aria-label': `Code join for ${node.name}` } }}
              >
                <MenuItem value="dash">Dash</MenuItem>
                <MenuItem value="absorb">Absorb</MenuItem>
              </TextField>
            </Tooltip>
          )}
        </Box>

        {canEdit && (
          <Stack direction="row" spacing={0} sx={{ flexShrink: 0, width: 104 }}>
            <Tooltip title={`Add something inside ${node.name}`}>
              <IconButton size="small" disabled={busy} aria-label={`Add something inside ${node.name}`} onClick={() => {
                setPicked(null);
                setPickerSearch('');
                setSaveError(null);
                setDraft({
                  parentItemId: node.catalogItemId,
                  parentName: node.name,
                  childItemId: '',
                  variesPerJob: false,
                  qtyNum: '1',
                  qtyParam: '',
                  defaultQty: '',
                  sortOrder: node.children.length,
                  isPick: false,
                  pick: EMPTY_PICK,
                });
              }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {!isRoot && (
              <>
                <Tooltip title="Copy this line">
                  <IconButton size="small" disabled={busy} aria-label={`Copy ${node.name}`}
                    onClick={() => void duplicate(node, parentItemId, index)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove this line">
                  <IconButton size="small" disabled={busy} aria-label={`Remove ${node.name}`} onClick={() => void remove(node)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
        )}
      </Stack>
    );
  }, [parentOf, canEdit, busy, flows, patchLine, duplicate, remove]);

  if (loading) {
    return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>;
  }

  return (
    <Box sx={{ p: 2, overflowY: 'auto' }}>
      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1.5 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          {counts.rows === 0
            ? `${catalogItemName} contains nothing yet.`
            : `${counts.rows} row${counts.rows === 1 ? '' : 's'}`}
        </Typography>
        {counts.asks > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            {counts.asks} of them vary per job
          </Typography>
        )}
      </Stack>

      {/* Column headings, so the boxes on each row are not a guess. */}
      {counts.rows > 0 && (
        <Stack direction="row" spacing={1} sx={{ pb: 0.5, borderBottom: '1px solid var(--c-border)' }}>
          <Box sx={{ width: 26, flexShrink: 0 }} />
          <Box sx={{ flex: 1 }} />
          {[['How many', 148], ['Code', 92], ['Size (mm)', 186], ['Made by', 156], ['Explode', 76], ['Code join', 108]].map(([label, w]) => (
            <Typography key={String(label)} sx={{
              width: w as number, flexShrink: 0, fontSize: 10.5, fontWeight: 600,
              letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)',
            }}>{label}</Typography>
          ))}
          {canEdit && <Box sx={{ width: 104, flexShrink: 0 }} />}
        </Stack>
      )}

      {tree ? (
        <TreeEditor<ItemBomNode, Ctx>
          roots={[tree]}
          renderRow={renderRow}
          ctx={ctx}
          virtualise
          rowHeight={ROW_HEIGHT}
          height={Math.min((counts.rows + 1) * ROW_HEIGHT, 640)}
        />
      ) : (
        <Alert severity="info" variant="outlined">
          <b>{catalogItemName}</b> contains nothing yet. Add what it is made of — a fixed
          quantity for something there is always one of, or mark it as varying per job for
          something the order should confirm.
        </Alert>
      )}

      {/* ── what a row lets the order pick ─────────────────────────────────── */}
      <PickFilterDialog
        open={!!pickEdit}
        title={pickEdit?.node.pick ? `What the order picks for ${pickEdit.node.name}` : `Let the order pick ${pickEdit?.node.name ?? ''}`}
        initial={pickEdit ? pickInputOfNode(pickEdit.node) : null}
        taxonomy={pickTaxonomy}
        onClose={() => setPickEdit(null)}
        onSave={async (pick) => {
          if (!pickEdit || !pickEdit.node.bomLineId) return;
          const { node, parentItemId } = pickEdit;
          // Sent whole, like patchLine: this dialog is only offered on a
          // fixed-quantity row (a varies-per-job row cannot resend its question).
          await saveItemBomLine({
            id: node.bomLineId,
            parentItemId,
            childItemId: node.catalogItemId,
            qtyNum: node.qty,
            qtyParam: null,
            codeSegment: node.codeSegment,
            defaultFlowId: node.defaultFlowId,
            pick,
            // Becoming a pick line drops a stated thickness and width: the
            // picked item carries its own.
            ...(pick && !node.pick ? { defaults: { thickness_mm: '', width_mm: '' } } : {}),
          });
          setPickEdit(null);
          await load();
        }}
      />

      {/* ── add a line ──────────────────────────────────────────────────── */}
      <Dialog open={!!draft} onClose={() => setDraft(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>
          What does {draft?.parentName} contain?
        </DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="warning" sx={{ mb: 2 }}>{saveError}</Alert>}
          {draft && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Autocomplete
                options={pickerOptions}
                loading={optionsLoading}
                filterOptions={(x) => x}
                getOptionLabel={(o) => `${o.name}${o.code ? ` — ${o.code}` : ''}`}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                value={picked}
                // Only a keystroke is a search. A selection or a reset also
                // changes the input text, and searching by that label is what
                // used to empty the page and lose the pick — see `picked`.
                onInputChange={(_, value, reason) => { if (reason === 'input') setPickerSearch(value); }}
                onChange={(_, value) => {
                  setPicked(value);
                  setDraft({ ...draft, childItemId: value ? value.id : '' });
                }}
                renderInput={(params) => <TextField {...params} label="Item" size="small" placeholder="Search by name or code…" />}
              />
              <Button size="small" onClick={() => setNewItem({ name: pickerSearch, code: '', shortCode: '', categoryId: '', groupId: '', subgroupId: '', unit: 'PC', procurementType: 'make' })} sx={{ alignSelf: 'flex-start' }}>
                ＋ Create a new item{pickerSearch ? ` named "${pickerSearch}"` : ''} instead
              </Button>

              <TextField
                select size="small" label="How many" value={draft.variesPerJob ? VARIES_PER_JOB : 'fixed'}
                onChange={(e) => setDraft({ ...draft, variesPerJob: e.target.value === VARIES_PER_JOB })}
              >
                <MenuItem value="fixed">A fixed number</MenuItem>
                <MenuItem value={VARIES_PER_JOB}>Varies per job</MenuItem>
              </TextField>

              {!draft.variesPerJob ? (
                <TextField
                  size="small" type="number" label="Quantity" value={draft.qtyNum}
                  onChange={(e) => setDraft({ ...draft, qtyNum: e.target.value })}
                />
              ) : (
                <>
                  <TextField
                    size="small" label="What to call the question" value={draft.qtyParam}
                    placeholder="lines"
                    helperText="Shown to whoever confirms this order's parameters."
                    onChange={(e) => setDraft({ ...draft, qtyParam: e.target.value })}
                  />
                  <TextField
                    size="small" type="number" label="Default quantity" value={draft.defaultQty} required
                    helperText="Required — this is what makes an unanswered line buildable."
                    onChange={(e) => setDraft({ ...draft, defaultQty: e.target.value })}
                  />
                </>
              )}

              {/*
                * A PICK LINE: the item above is the ROLE (e.g. a template part
                * "Intermediate Stiffener"); each order chooses the actual
                * catalog item from the filter below.
                */}
              <Stack direction="row" alignItems="center" spacing={1}>
                <Switch size="small" checked={draft.isPick}
                  onChange={(e) => setDraft({ ...draft, isPick: e.target.checked })}
                  inputProps={{ 'aria-label': 'The order chooses the item' }} />
                <Typography sx={{ fontSize: 13 }}>The order chooses the item from the catalog</Typography>
              </Stack>
              {draft.isPick && (
                <PickFilterFields value={draft.pick} onChange={(pick) => setDraft({ ...draft, pick })} taxonomy={pickTaxonomy} />
              )}

              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                Code, size and flow are set on the row afterwards.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || !draft || draft.childItemId === ''
              || (draft.isPick && draft.pick.categoryId === '')
              || (draft.variesPerJob && (!draft.qtyParam.trim() || !draft.defaultQty.trim() || Number(draft.defaultQty) <= 0))}
            onClick={() => void addLine()}
          >
            {saving ? 'Saving…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── change an existing row's quantity ────────────────────────────── */}
      <Dialog open={!!qtyEdit} onClose={() => setQtyEdit(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>Change quantity — {qtyEdit?.node.name}</DialogTitle>
        <DialogContent>
          {qtyError && <Alert severity="warning" sx={{ mb: 2 }}>{qtyError}</Alert>}
          {qtyEdit && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField
                select size="small" label="How many" value={qtyEdit.variesPerJob ? VARIES_PER_JOB : 'fixed'}
                onChange={(e) => setQtyEdit({ ...qtyEdit, variesPerJob: e.target.value === VARIES_PER_JOB })}
              >
                <MenuItem value="fixed">A fixed number</MenuItem>
                <MenuItem value={VARIES_PER_JOB}>Varies per job</MenuItem>
              </TextField>
              {!qtyEdit.variesPerJob ? (
                <TextField
                  size="small" type="number" label="Quantity" value={qtyEdit.qtyNum}
                  onChange={(e) => setQtyEdit({ ...qtyEdit, qtyNum: e.target.value })}
                />
              ) : (
                <>
                  <TextField
                    size="small" label="What to call the question" value={qtyEdit.qtyParam}
                    placeholder="lines"
                    onChange={(e) => setQtyEdit({ ...qtyEdit, qtyParam: e.target.value })}
                  />
                  <TextField
                    size="small" type="number" label="Default quantity" value={qtyEdit.defaultQty} required
                    helperText="Required — this is what makes an unanswered line buildable."
                    onChange={(e) => setQtyEdit({ ...qtyEdit, defaultQty: e.target.value })}
                  />
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQtyEdit(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={qtySaving || !qtyEdit
              || (qtyEdit.variesPerJob && (!qtyEdit.qtyParam.trim() || !qtyEdit.defaultQty.trim() || Number(qtyEdit.defaultQty) <= 0))
              || (!qtyEdit.variesPerJob && qtyEdit.qtyNum.trim() === '')}
            onClick={() => void saveQtyEdit()}
          >
            {qtySaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── the smallest new item that is still valid ───────────────────── */}
      <Dialog open={!!newItem} onClose={() => setNewItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>New item</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="warning" sx={{ mb: 2 }}>{createError}</Alert>}
          {newItem && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField
                size="small" label="Name" value={newItem.name} autoFocus
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
              <TextField
                select size="small" label="Category" value={newItem.categoryId}
                helperText="Everything this item inherits hangs off its category."
                onChange={(e) => setNewItem({
                  ...newItem,
                  categoryId: e.target.value === '' ? '' : Number(e.target.value),
                })}
              >
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  select size="small" fullWidth label="Group" value={newItem.groupId}
                  helperText="Where it sits in the catalogue."
                  onChange={(e) => {
                    const groupId = e.target.value === '' ? '' : Number(e.target.value);
                    const group = taxonomy.groups.find((g) => g.id === groupId);
                    // Group and category must agree — the group knows its category.
                    setNewItem({ ...newItem, groupId, subgroupId: '', categoryId: group ? group.categoryId : newItem.categoryId });
                  }}
                >
                  <MenuItem value="">—</MenuItem>
                  {taxonomy.groups
                    .filter((g) => newItem.categoryId === '' || g.categoryId === newItem.categoryId)
                    .map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
                </TextField>
                <TextField
                  select size="small" fullWidth label="Sub-group" value={newItem.subgroupId}
                  disabled={newItem.groupId === ''}
                  onChange={(e) => setNewItem({ ...newItem, subgroupId: e.target.value === '' ? '' : Number(e.target.value) })}
                >
                  <MenuItem value="">—</MenuItem>
                  {taxonomy.subgroups
                    .filter((sg) => sg.groupId === newItem.groupId)
                    .map((sg) => <MenuItem key={sg.id} value={sg.id}>{sg.name}</MenuItem>)}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  size="small" fullWidth label="Code" value={newItem.code} placeholder="Blank = generated"
                  helperText="The item's own identity."
                  onChange={(e) => setNewItem({ ...newItem, code: e.target.value })}
                />
                <TextField
                  size="small" fullWidth label="Short code" value={newItem.shortCode} placeholder="e.g. TF"
                  helperText="Its rung in every order row code."
                  onChange={(e) => setNewItem({ ...newItem, shortCode: e.target.value })}
                />
              </Stack>
              <TextField
                select size="small" label="Procurement" value={newItem.procurementType}
                helperText="'Make' plans this in-house; 'Buy' plans it as a purchase."
                onChange={(e) => setNewItem({ ...newItem, procurementType: e.target.value })}
              >
                {PROCUREMENT_TYPES.map((pt) => <MenuItem key={pt.value} value={pt.value}>{pt.label}</MenuItem>)}
              </TextField>
              <TextField
                size="small" label="Unit" value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewItem(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={creating || !newItem?.name.trim() || newItem?.categoryId === ''}
            onClick={() => void createItem()}
          >
            {creating ? 'Creating…' : 'Create and use'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
