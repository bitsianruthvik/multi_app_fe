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
 * now look alike on purpose: one thing, rendered one way.
 *
 * ── WHAT ADDING A LINE ASKS ──────────────────────────────────────────────────
 *
 * Two things: which item, and how many. That is the whole dialog.
 *
 * It used to ask for eight — flow, three dimensions, code segment, help text,
 * a per-parent switch — which turned "this segment also has a top flange" into
 * a form. Everything else about a line is now edited ON THE ROW, where you can
 * see it next to its siblings and fill it in when you actually know it. A
 * dimension typed in a modal you had to open is a dimension nobody types.
 *
 * ── WHAT A LINE STILL CARRIES ────────────────────────────────────────────────
 *
 * The quantity is either a fixed number or a NAMED PARAMETER the order answers.
 * That distinction is the reason this is a recipe rather than a parts list, and
 * it is the one thing the add dialog still asks about.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import {
  getItemBomTree, saveItemBomLine, deleteItemBomLine,
  type ItemBomNode,
} from '../api/templates';
import { fabQuery, fabPost, fabMutate } from '../api/client';
import { backendMessage } from '../components';

/** Sentinel for the picker's "create one" row — never a real item id. */
const NEW_ITEM = '__new__';

interface CatalogOption { id: number; name: string; code: string | null }

/** The three sizes a recipe may state, in the order a fabricator says them. */
const DIMS = [
  { key: 'thickness_mm', label: 'thk' },
  { key: 'width_mm', label: 'wid' },
  { key: 'length_mm', label: 'len' },
] as const;

/** A line being added. Deliberately two questions, not eight. */
interface Draft {
  parentItemId: number;
  parentName: string;
  childItemId: number | '';
  qtyMode: 'fixed' | 'parameter';
  qtyNum: string;
  qtyParam: string;
  sortOrder: number;
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

  /*
   * COLLAPSED, NOT EXPANDED, is the state worth holding: a freshly loaded tree
   * is open, and a reload must not silently fold up everything somebody opened.
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = useCallback((key: string) => {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

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

  // ── the pick list ────────────────────────────────────────────────────────
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const loadOptions = useCallback(
    () => fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 1000 },
    })
      .then((r) => { setOptions(r.data ?? []); return r.data ?? []; })
      .catch(() => { setOptions([]); return [] as CatalogOption[]; }),
    [],
  );
  useEffect(() => { void loadOptions(); }, [loadOptions]);

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
   * Authoring a BOM is where you discover the catalogue is missing a part — an
   * End Stiffener nobody had entered. Sending someone to the Items page loses
   * the line they were half way through writing.
   *
   * Deliberately the smallest item that is still valid: name, category, unit.
   * Category because the field-inheritance ladder hangs off it; the code comes
   * from the generator so the two screens cannot drift into different formats.
   */
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpItemCategory', {
      orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 },
    })
      .then((r) => setCategories(r.data ?? []))
      .catch(() => setCategories([]));
  }, []);

  const [newItem, setNewItem] = useState<{ name: string; categoryId: number | ''; unit: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const createItem = useCallback(async () => {
    if (!newItem || !newItem.name.trim() || newItem.categoryId === '') return;
    setCreating(true);
    setCreateError(null);
    try {
      const { code } = await fabPost<{ code: string }>('codegen/next-code', {
        entityType: 'item', context: { categoryId: newItem.categoryId },
      });
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpItemCatalog', 'insert', {
        name: newItem.name.trim(),
        code: String(code).toUpperCase(),
        unit: newItem.unit.trim() || 'nos',
        category_id: newItem.categoryId,
        procurement_type: 'make',
        mrp_policy: 'manual',
      });
      await loadOptions();
      setDraft((d) => (d ? { ...d, childItemId: res.id } : d));
      setNewItem(null);
    } catch (err) {
      setCreateError(backendMessage(err, 'Could not create that item.'));
    } finally {
      setCreating(false);
    }
  }, [newItem, loadOptions]);

  // ── writing one line ─────────────────────────────────────────────────────

  /**
   * Save a change made ON a row. Everything the tree edits inline goes through
   * here, so one edit is one request and the tree is reloaded from the server
   * rather than patched locally — the server is the thing that knows whether a
   * change made a cycle.
   */
  const patchLine = useCallback(async (
    node: ItemBomNode, parentItemId: number, patch: Record<string, unknown>,
  ) => {
    if (!node.bomLineId) return;
    setBusy(true);
    setError(null);
    try {
      await saveItemBomLine({
        id: node.bomLineId,
        parentItemId,
        childItemId: node.catalogItemId,
        qtyNum: node.qtyParam ? null : node.qty,
        qtyParam: node.qtyParam,
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
        // Exactly one of these reaches the server; the other is nulled so
        // switching a line actually clears the old answer.
        qtyNum: draft.qtyMode === 'fixed' ? draft.qtyNum : null,
        qtyParam: draft.qtyMode === 'parameter' ? draft.qtyParam : null,
        sortOrder: draft.sortOrder,
      });
      setDraft(null);
      await load();
    } catch (err) {
      setSaveError(backendMessage(err, 'That line could not be saved.'));
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  /**
   * COPY A ROW. The same item under the same parent, a second time.
   *
   * The case this exists for is real and common: a Line holds three Segments at
   * 12,000 and two at 11,650. One row cannot say that, so you copy the row and
   * change the copy. The children come along on the server's side because the
   * copy names the same catalog item, and what is inside a Segment is a property
   * of Segment, not of the line pointing at it.
   */
  const duplicate = useCallback(async (node: ItemBomNode, parentItemId: number, at: number) => {
    setBusy(true);
    setError(null);
    try {
      await saveItemBomLine({
        id: null,
        parentItemId,
        childItemId: node.catalogItemId,
        qtyNum: node.qtyParam ? null : node.qty,
        qtyParam: node.qtyParam,
        codeSegment: node.codeSegment,
        defaultFlowId: node.defaultFlowId,
        sortOrder: at + 1,
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
      for (const c of n.children) { rows += 1; if (c.qtyParam) asks += 1; walk(c); }
    };
    if (tree) walk(tree);
    return { rows, asks };
  }, [tree]);

  // ── one row ──────────────────────────────────────────────────────────────
  const renderNode = (node: ItemBomNode, parentItemId: number, depth: number, index: number) => {
    const hasKids = node.children.length > 0;
    const isCollapsed = collapsed.has(node.key);
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

    return (
      <Box key={node.key}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            py: 0.6,
            pl: `${depth * 20}px`,
            borderBottom: '1px solid var(--c-divider)',
            '&:hover .row-actions': { opacity: 1 },
            bgcolor: isRoot ? 'var(--c-surface-2)' : undefined,
          }}
        >
          {hasKids ? (
            <IconButton size="small" onClick={() => toggle(node.key)} sx={{ p: 0.25 }}
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
              {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          ) : <Box sx={{ width: 26, flexShrink: 0 }} />}

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
            </Stack>
          </Box>

          {/* HOW MANY — a number, or the question the order will be asked. */}
          <Box sx={{ width: 132, flexShrink: 0 }}>
            {isRoot ? null : node.qtyParam ? (
              <Tooltip title={`The order answers “${node.qtyParam}”`}>
                <Chip size="small" color="primary" variant="outlined"
                  label={`asks ${node.qtyParam}`} sx={{ maxWidth: '100%' }} />
              </Tooltip>
            ) : (
              <TextField
                size="small" type="number" disabled={!canEdit || busy}
                defaultValue={node.qty ?? ''}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (String(node.qty ?? '') === v) return;
                  void patchLine(node, parentItemId, { qtyNum: v === '' ? null : Number(v), qtyParam: null });
                }}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 13, width: 56 } } }}
              />
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
              <TextField
                size="small" placeholder="code" disabled={!canEdit || busy}
                defaultValue={node.codeSegment ?? ''}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if ((node.codeSegment ?? '') === v) return;
                  void patchLine(node, parentItemId, { codeSegment: v || null });
                }}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5, width: 68 } } }}
              />
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
              <TextField
                key={d.key} size="small" placeholder={d.label} disabled={!canEdit || busy}
                defaultValue={dimOf(node, d.key)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (dimOf(node, d.key) === v) return;
                  void patchLine(node, parentItemId, {
                    defaults: {
                      thickness_mm: d.key === 'thickness_mm' ? v : dimOf(node, 'thickness_mm'),
                      width_mm: d.key === 'width_mm' ? v : dimOf(node, 'width_mm'),
                      length_mm: d.key === 'length_mm' ? v : dimOf(node, 'length_mm'),
                    },
                  });
                }}
                slotProps={{ htmlInput: { style: { padding: '4px 6px', fontSize: 12, width: 44 } } }}
              />
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
                select size="small" fullWidth disabled={!canEdit || busy}
                value={node.defaultFlowId ?? ''}
                onChange={(e) => void patchLine(node, parentItemId, {
                  defaultFlowId: e.target.value === '' ? null : Number(e.target.value),
                })}
                slotProps={{ htmlInput: { style: { padding: '4px 8px', fontSize: 12.5 } } }}
              >
                <MenuItem value=""><em>No flow</em></MenuItem>
                {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </TextField>
            )}
          </Box>

          {canEdit && (
            <Stack direction="row" spacing={0} className="row-actions"
              sx={{ opacity: 0, transition: 'opacity .12s', flexShrink: 0, width: 104 }}>
              <Tooltip title={`Add something inside ${node.name}`}>
                <IconButton size="small" disabled={busy} onClick={() => setDraft({
                  parentItemId: node.catalogItemId,
                  parentName: node.name,
                  childItemId: '',
                  qtyMode: 'fixed',
                  qtyNum: '1',
                  qtyParam: '',
                  sortOrder: node.children.length,
                })}>
                  <AddIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {!isRoot && (
                <>
                  <Tooltip title="Copy this line">
                    <IconButton size="small" disabled={busy}
                      onClick={() => void duplicate(node, parentItemId, index)}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove this line">
                    <IconButton size="small" disabled={busy} onClick={() => void remove(node)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          )}
        </Stack>

        {!isCollapsed && node.children.map((c, i) => renderNode(c, node.catalogItemId, depth + 1, i))}
      </Box>
    );
  };

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
            {counts.asks} of them ask the order a question
          </Typography>
        )}
      </Stack>

      {/* Column headings, so the boxes on each row are not a guess. */}
      {counts.rows > 0 && (
        <Stack direction="row" spacing={1} sx={{ pb: 0.5, borderBottom: '1px solid var(--c-border)' }}>
          <Box sx={{ width: 26, flexShrink: 0 }} />
          <Box sx={{ flex: 1 }} />
          {[['How many', 132], ['Code', 92], ['Size (mm)', 186], ['Made by', 156]].map(([label, w]) => (
            <Typography key={String(label)} sx={{
              width: w as number, flexShrink: 0, fontSize: 10.5, fontWeight: 600,
              letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)',
            }}>{label}</Typography>
          ))}
          {canEdit && <Box sx={{ width: 104, flexShrink: 0 }} />}
        </Stack>
      )}

      {tree ? renderNode(tree, 0, 0, 0) : (
        <Alert severity="info" variant="outlined">
          <b>{catalogItemName}</b> contains nothing yet. Add what it is made of — a fixed
          quantity for something there is always one of, or a parameter for something the
          order should be asked about.
        </Alert>
      )}

      {/* ── add a line ──────────────────────────────────────────────────── */}
      <Dialog open={!!draft} onClose={() => setDraft(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 16 }}>
          What does {draft?.parentName} contain?
        </DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="warning" sx={{ mb: 2 }}>{saveError}</Alert>}
          {draft && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField
                select size="small" label="Item" value={draft.childItemId}
                onChange={(e) => {
                  if (e.target.value === NEW_ITEM) {
                    setNewItem({ name: '', categoryId: '', unit: 'nos' });
                    return;
                  }
                  setDraft({ ...draft, childItemId: Number(e.target.value) });
                }}
              >
                <MenuItem value={NEW_ITEM} sx={{ fontWeight: 600 }}>＋ Create a new item…</MenuItem>
                <Divider />
                {options.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.name}{o.code ? ` — ${o.code}` : ''}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select size="small" label="How many" value={draft.qtyMode}
                onChange={(e) => setDraft({ ...draft, qtyMode: e.target.value as Draft['qtyMode'] })}
              >
                <MenuItem value="fixed">A fixed number</MenuItem>
                <MenuItem value="parameter">Ask the order</MenuItem>
              </TextField>

              {draft.qtyMode === 'fixed' ? (
                <TextField
                  size="small" type="number" label="Quantity" value={draft.qtyNum}
                  onChange={(e) => setDraft({ ...draft, qtyNum: e.target.value })}
                />
              ) : (
                <TextField
                  size="small" label="What to call the question" value={draft.qtyParam}
                  placeholder="lines"
                  helperText="No default. The order states the number; a guessed one gets taken by mistake."
                  onChange={(e) => setDraft({ ...draft, qtyParam: e.target.value })}
                />
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
              || (draft.qtyMode === 'parameter' && !draft.qtyParam.trim())}
            onClick={() => void addLine()}
          >
            {saving ? 'Saving…' : 'Add'}
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
