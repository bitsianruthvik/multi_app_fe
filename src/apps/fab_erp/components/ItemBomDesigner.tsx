/**
 * ItemBomDesigner — what a catalog item is made of, and how many.
 *
 * WHY THIS REPLACED WHAT WAS ON THIS TAB. The "Bill of Materials" tab rendered
 * `BomDesigner`, which reads `fab_material_boms` — a table holding zero rows in
 * this company. Meanwhile `fab_item_bom` held the real structure: Span contains
 * Girder contains Segment contains seven parts, for all six girder types. So a
 * Span with a perfectly good BOM read as having none, and the only way to see it
 * was to query the database.
 *
 * WHAT MAKES THIS BOM DIFFERENT from a flat parts list is the QUANTITY. A line
 * either has a fixed number — a Segment always has one Web Plate — or it names a
 * PARAMETER the order will be asked for, like "how many girders". The set of
 * parameters is not declared anywhere; it is derived from the tree, so deleting
 * the last line that asks a question removes the question.
 *
 * ONE LEVEL AT A TIME, with the child's own line count shown beside it. The
 * whole tree of a Composite Girder is 247 nodes and nobody reads that; what an
 * author needs is "this level has these children" and a way to walk down. The
 * breadcrumb is the walk.
 *
 * The expansion preview is the existing `/templates/:itemId/preview`, not a
 * second implementation — two answers to "what would this build" is exactly the
 * duplication that let a Span look like it had no BOM in the first place.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Link, MenuItem,
  Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';

import {
  getItemBom, saveItemBomLine, deleteItemBomLine, previewTemplate,
  type ItemBomLine, type TemplateParameter, type TemplatePreview,
} from '../api/templates';
import { fabQuery, fabPost, fabMutate } from '../api/client';
import { backendMessage } from '../components';

/** Sentinel for the picker's "create one" row — never a real item id. */
const NEW_ITEM = '__new__';

interface CatalogOption { id: number; name: string; code: string | null }

/** A line being edited. `qtyMode` is UI-only — the wire has one or the other. */
interface Draft {
  id: number | null;
  childItemId: number | '';
  qtyMode: 'fixed' | 'parameter';
  qtyNum: string;
  qtyParam: string;
  defaultQty: string;
  perInstanceQty: boolean;
  codeSegment: string;
  helpText: string;
  sortOrder: number;
  /** '' means no flow — a valid answer for a level that only groups. */
  defaultFlowId: number | '';
}

const blankDraft = (sortOrder: number): Draft => ({
  id: null, childItemId: '', qtyMode: 'fixed', qtyNum: '1', qtyParam: '',
  defaultQty: '', perInstanceQty: false, codeSegment: '', helpText: '', sortOrder,
  defaultFlowId: '',
});

const draftFrom = (l: ItemBomLine): Draft => ({
  id: l.id,
  childItemId: l.childItemId,
  qtyMode: l.qtyParam ? 'parameter' : 'fixed',
  qtyNum: l.qtyNum == null ? '' : String(Number(l.qtyNum)),
  qtyParam: l.qtyParam ?? '',
  defaultQty: l.defaultQty == null ? '' : String(Number(l.defaultQty)),
  perInstanceQty: !!l.perInstanceQty,
  codeSegment: l.codeSegment ?? '',
  helpText: l.helpText ?? '',
  sortOrder: l.sortOrder ?? 0,
  defaultFlowId: l.defaultFlowId ?? '',
});

export default function ItemBomDesigner({
  catalogItemId, catalogItemName, mode = 'edit',
}: {
  catalogItemId: number;
  catalogItemName: string;
  mode?: 'edit' | 'readonly';
}) {
  const canEdit = mode === 'edit';

  /** The walk down. Index 0 is always the item whose page this is. */
  const [trail, setTrail] = useState<{ id: number; name: string }[]>(
    [{ id: catalogItemId, name: catalogItemName }],
  );
  const here = trail[trail.length - 1];

  const [lines, setLines] = useState<ItemBomLine[]>([]);
  const [parameters, setParameters] = useState<TemplateParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getItemBom(here.id);
      setLines(res.lines);
      setParameters(res.parameters ?? []);
    } catch (err) {
      setError(backendMessage(err, 'Could not read this item’s BOM.'));
      setLines([]);
      setParameters([]);
    } finally {
      setLoading(false);
    }
  }, [here.id]);

  useEffect(() => { void load(); }, [load]);

  // Reset the walk when the page moves to a different item.
  useEffect(() => {
    setTrail([{ id: catalogItemId, name: catalogItemName }]);
  }, [catalogItemId, catalogItemName]);

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

  /**
   * CREATING THE CHILD FROM HERE, because the moment you need it is here.
   *
   * Authoring a BOM is where you discover the catalogue is missing a part — an
   * End Stiffener that nobody had entered, say. Sending someone to the Items
   * page to create it loses the line they were half way through writing, and
   * they come back to an empty dialog.
   *
   * Deliberately the SMALLEST item that is still valid: name, category, unit.
   * Category because the whole field-inheritance ladder hangs off it and an item
   * without one inherits nothing; the code comes from the generator, exactly as
   * the Items page does it, so the two cannot drift into different formats.
   * Everything else is editable on the item's own page afterwards.
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
      // Drop it straight into the line being written, which is the whole point.
      setDraft((d) => (d ? { ...d, childItemId: res.id } : d));
      setNewItem(null);
    } catch (err) {
      setCreateError(backendMessage(err, 'Could not create that item.'));
    } finally {
      setCreating(false);
    }
  }, [newItem, loadOptions]);

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

  // ── editing one line ─────────────────────────────────────────────────────
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (!draft || draft.childItemId === '') return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveItemBomLine({
        id: draft.id,
        parentItemId: here.id,
        childItemId: Number(draft.childItemId),
        // Exactly one of these reaches the server. The other is sent as null so
        // switching a line from fixed to parameter actually clears the old one.
        qtyNum: draft.qtyMode === 'fixed' ? draft.qtyNum : null,
        qtyParam: draft.qtyMode === 'parameter' ? draft.qtyParam : null,
        defaultQty: draft.qtyMode === 'parameter' ? draft.defaultQty : null,
        perInstanceQty: draft.qtyMode === 'parameter' && draft.perInstanceQty,
        codeSegment: draft.codeSegment || null,
        helpText: draft.helpText || null,
        sortOrder: draft.sortOrder,
        defaultFlowId: draft.defaultFlowId === '' ? null : Number(draft.defaultFlowId),
      });
      setDraft(null);
      await load();
    } catch (err) {
      setSaveError(backendMessage(err, 'That line could not be saved.'));
    } finally {
      setSaving(false);
    }
  }, [draft, here.id, load]);

  const remove = useCallback(async (line: ItemBomLine) => {
    try {
      await deleteItemBomLine(line.id);
      await load();
    } catch (err) {
      setError(backendMessage(err, 'That line could not be removed.'));
    }
  }, [load]);

  // ── "what would this build" ──────────────────────────────────────────────
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    // Seed each question with the BOM's own default — the numbers that used to
    // be typed into React state and are now data.
    setAnswers(Object.fromEntries(parameters.map((p) => [p.param, String(p.defaultQty ?? 1)])));
    setPreview(null);
  }, [parameters]);

  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const params: Record<string, number> = {};
      for (const p of parameters) params[p.param] = Number(answers[p.param]) || 0;
      setPreview(await previewTemplate(here.id, params));
    } catch (err) {
      setError(backendMessage(err, 'Could not work out what this would build.'));
    } finally {
      setPreviewing(false);
    }
  }, [parameters, answers, here.id]);

  return (
    <Box sx={{ p: 2, overflowY: 'auto' }}>
      <Breadcrumbs separator={<ChevronRightIcon fontSize="small" />} sx={{ mb: 1 }}>
        {trail.map((t, i) => (i === trail.length - 1 ? (
          <Typography key={t.id} variant="body2" sx={{ fontWeight: 600 }}>{t.name}</Typography>
        ) : (
          <Link
            key={t.id}
            component="button"
            variant="body2"
            underline="hover"
            onClick={() => setTrail((cur) => cur.slice(0, i + 1))}
          >
            {t.name}
          </Link>
        )))}
      </Breadcrumbs>

      {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>
      ) : (
        <>
          {lines.length === 0 ? (
            <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
              <b>{here.name}</b> contains nothing yet. Add what it is made of — a fixed
              quantity for something there is always one of, or a parameter for something
              the order should be asked about.
            </Alert>
          ) : (
            <Box sx={{ mb: 2 }}>
              {lines.map((l) => {
                const goesDeeper = l.childLineCount > 0;
                return (
                  <Stack
                    key={l.id}
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider' }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                          {l.childName}
                        </Typography>
                        {l.childCode && (
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {l.childCode}
                          </Typography>
                        )}
                        {l.codeSegment && (
                          <Chip size="small" variant="outlined" label={`code ${l.codeSegment}`} />
                        )}
                        {l.defaultFlowName && (
                          <Tooltip title="Every item built from this line starts with this flow">
                            <Chip size="small" color="primary" variant="outlined" label={l.defaultFlowName} />
                          </Tooltip>
                        )}
                      </Stack>
                      {l.helpText && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {l.helpText}
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ width: 210, flexShrink: 0 }}>
                      {l.qtyParam ? (
                        <Tooltip title="The order is asked this. The number beside it is what the question starts at.">
                          <Chip
                            size="small"
                            color="primary"
                            variant="outlined"
                            label={`asks “${l.qtyParam}”${l.defaultQty != null ? ` · default ${Number(l.defaultQty)}` : ''}${l.perInstanceQty ? ' · per parent' : ''}`}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2">× {Number(l.qtyNum)}</Typography>
                      )}
                    </Box>

                    {goesDeeper ? (
                      <Button
                        size="small"
                        endIcon={<ChevronRightIcon />}
                        onClick={() => setTrail((cur) => [...cur, { id: l.childItemId, name: l.childName ?? '' }])}
                      >
                        {l.childLineCount} inside
                      </Button>
                    ) : (
                      <Box sx={{ width: 96, flexShrink: 0 }} />
                    )}

                    {canEdit && (
                      <>
                        <IconButton size="small" onClick={() => setDraft(draftFrom(l))} title="Edit this line">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => void remove(l)} title="Remove this line">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </Stack>
                );
              })}
            </Box>
          )}

          {canEdit && (
            <Button
              startIcon={<AddIcon />}
              onClick={() => setDraft(blankDraft(lines.length))}
              size="small"
            >
              Add what {here.name} contains
            </Button>
          )}

          {/*
            * The questions, and what the answers would build.
            *
            * Shown on the item whose page this is rather than at every level,
            * because "what does this template ask an order" is a property of the
            * whole tree beneath it, not of one rung.
            */}
          {trail.length === 1 && parameters.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                What an order is asked when it builds a {catalogItemName}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Derived from the lines above — no separate list to keep in step. Remove the last
                line that asks a question and the question goes with it.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                {parameters.map((p) => (
                  <TextField
                    key={p.param}
                    size="small"
                    label={p.askedBy ? `How many ${p.askedBy}?` : p.param}
                    helperText={p.helpText ?? p.param}
                    value={answers[p.param] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [p.param]: e.target.value }))}
                    sx={{ width: 240 }}
                  />
                ))}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PlayArrowRounded />}
                  disabled={previewing}
                  onClick={() => void runPreview()}
                  sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                >
                  {previewing ? 'Working…' : 'What would this build?'}
                </Button>
              </Stack>

              {preview && (
                <Alert severity="success" variant="outlined">
                  <b>{preview.nodes}</b> items in total —{' '}
                  {Object.entries(preview.byName).map(([n, c]) => `${c} × ${n}`).join(', ')}.
                  {preview.sample.length > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                      Codes read like {preview.sample.slice(0, 4).map((s) => s.code).join(', ')}
                    </Typography>
                  )}
                </Alert>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={!!draft} onClose={() => setDraft(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{draft?.id ? 'Edit line' : `What does ${here.name} contain?`}</DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="warning" sx={{ mb: 2 }}>{saveError}</Alert>}
          {draft && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField
                select
                size="small"
                label="Item"
                value={draft.childItemId}
                onChange={(e) => {
                  if (e.target.value === NEW_ITEM) {
                    setNewItem({ name: '', categoryId: '', unit: 'nos' });
                    return;
                  }
                  setDraft({ ...draft, childItemId: Number(e.target.value) });
                }}
              >
                <MenuItem value={NEW_ITEM} sx={{ fontWeight: 600 }}>
                  ＋ Create a new item…
                </MenuItem>
                <Divider />
                {options.map((o) => (
                  <MenuItem key={o.id} value={o.id}>
                    {o.name}{o.code ? ` — ${o.code}` : ''}
                  </MenuItem>
                ))}
              </TextField>

              {/*
                * THE DEFAULT FLOW, and the reason it lives on the LINE.
                *
                * A Top Flange inside a Girder Segment can be made differently
                * from a Top Flange inside a PEB member — same catalog item,
                * different context — and the line is the only place that
                * distinction exists. This replaced `fab_flow_rules`, which
                * matched (line type, level, code suffix) and so could only ever
                * see the type.
                *
                * Blank is a real answer, not a missing one.
                */}
              <TextField
                select
                size="small"
                label="Default flow"
                value={draft.defaultFlowId}
                onChange={(e) => setDraft({
                  ...draft,
                  defaultFlowId: e.target.value === '' ? '' : Number(e.target.value),
                })}
                helperText="How every one of these gets made. Leave blank for a level that only groups its children."
              >
                <MenuItem value="">No flow — this level only groups</MenuItem>
                {flows.map((f) => <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>)}
              </TextField>

              <TextField
                select
                size="small"
                label="How many"
                value={draft.qtyMode}
                onChange={(e) => setDraft({ ...draft, qtyMode: e.target.value as Draft['qtyMode'] })}
                helperText="A fixed number, or a question the order answers."
              >
                <MenuItem value="fixed">A fixed quantity</MenuItem>
                <MenuItem value="parameter">Ask the order</MenuItem>
              </TextField>

              {draft.qtyMode === 'fixed' ? (
                <TextField
                  size="small"
                  label="Quantity"
                  value={draft.qtyNum}
                  onChange={(e) => setDraft({ ...draft, qtyNum: e.target.value })}
                />
              ) : (
                <>
                  <TextField
                    size="small"
                    label="Parameter name"
                    value={draft.qtyParam}
                    onChange={(e) => setDraft({ ...draft, qtyParam: e.target.value })}
                    helperText="Lines sharing a name ask one question — e.g. segmentsPerGirder."
                  />
                  <TextField
                    size="small"
                    label="Default"
                    value={draft.defaultQty}
                    onChange={(e) => setDraft({ ...draft, defaultQty: e.target.value })}
                    helperText="What the question starts at."
                  />
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={draft.perInstanceQty}
                        onChange={(e) => setDraft({ ...draft, perInstanceQty: e.target.checked })}
                      />
                    )}
                    label="Each parent may have a different count"
                  />
                </>
              )}

              <TextField
                size="small"
                label="Code segment"
                value={draft.codeSegment}
                onChange={(e) => setDraft({ ...draft, codeSegment: e.target.value })}
                helperText="How this level reads in a code — “G” gives G1, G2. Blank gives a bare number."
              />
              <TextField
                size="small"
                label="Help text"
                value={draft.helpText}
                onChange={(e) => setDraft({ ...draft, helpText: e.target.value })}
                helperText="Shown beside the question when an order is built."
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || !draft || draft.childItemId === ''}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/*
        * Creating the missing part without leaving the line you are writing.
        * Stacks over the line dialog rather than replacing it, so cancelling
        * puts you back exactly where you were.
        */}
      <Dialog open={!!newItem} onClose={() => setNewItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle>New item</DialogTitle>
        <DialogContent>
          {createError && <Alert severity="warning" sx={{ mb: 2 }}>{createError}</Alert>}
          {newItem && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField
                autoFocus
                size="small"
                label="Name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              />
              <TextField
                select
                size="small"
                label="Category"
                value={newItem.categoryId}
                onChange={(e) => setNewItem({ ...newItem, categoryId: Number(e.target.value) })}
                helperText="Decides which field defaults the item inherits."
              >
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
              <TextField
                size="small"
                label="Unit"
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              />
              <Typography variant="caption" color="text.secondary">
                The code is generated. Everything else — description, taxonomy, custom fields —
                is editable on the item’s own page.
              </Typography>
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
