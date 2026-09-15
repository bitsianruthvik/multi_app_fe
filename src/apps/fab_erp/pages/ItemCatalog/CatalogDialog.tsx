/**
 * CatalogDialog — add/edit a catalog item, and DeleteDialog — remove one.
 *
 * `save()` now calls EU-15's `POST /catalog/items`, which inserts the item,
 * writes its custom-field VALUES and recomputes its derived weight in one
 * transaction — replacing the old three-round-trip sequence (pre-fetch a
 * code from `codegen/next-code`, insert, then a separate `/fields/values`
 * write) that could burn a code sequence on an item that then failed to
 * insert (EU-16 item 9). A brand-new custom field's DEFINITION still has to
 * be created first via `ensureFieldDef` — the server only writes values for
 * keys already in the registry — so a dialog with new custom fields is two
 * round trips, not one; one with none, or only pre-existing keys, is one.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Table, TableBody, TableRow,
  TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { fabMutate } from '../../api/client';
import { createCatalogItem, getCatalogItemUsage, type CatalogItemUsage } from '../../api/catalog';
import {
  blankRow, commitFieldRows, ensureFieldDef, useFieldVocabulary, unitsByDimension, type FieldRowDraft,
} from '../../api/fields';
import type { FabItemCatalog, FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import { FieldRowCells, FieldTableHead, TaxonomyPicker, backendMessage } from '../../components';
import { DialogCloseButton } from '../../components/FormDialog';
import { STANDARD_UOMS } from '../../constants/uom';
import { TaxonomyAddForm } from './TaxonomyTab';
import { useFieldDefs, BLANK_ITEM, PROCUREMENT_TYPES, MRP_POLICIES, type ItemDraft } from './shared';

export function CatalogDialog({ open, initial, categories, groups, subgroups, canManageTaxonomy, onClose, onSaved, refetchTaxonomy }: {
  open: boolean; initial: FabItemCatalog | null;
  categories: FabItemCategory[]; groups: FabItemGroup[]; subgroups: FabItemSubgroup[];
  canManageTaxonomy: boolean; onClose: () => void; onSaved: (code?: string) => void;
  refetchTaxonomy: () => Promise<void>;
}) {
  const isNew = !initial;
  const [draft,  setDraft]  = useState<ItemDraft>(BLANK_ITEM());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [addingLevel, setAddingLevel] = useState<'category' | 'group' | 'subgroup' | null>(null);
  const [customFields, setCustomFields] = useState<FieldRowDraft[]>([]);
  const defs = useFieldDefs(open);
  const vocab = useFieldVocabulary();
  const unitGroups = useMemo(() => unitsByDimension(vocab), [vocab]);
  useEffect(() => {
    if (!open) return;
    setCustomFields([]);
    setDraft(initial ? {
      name: initial.name, code: initial.code, unit: initial.unit ?? 'PC',
      description: initial.description ?? '', categoryId: initial.categoryId ?? null,
      groupId: initial.groupId ?? null, subgroupId: initial.subgroupId ?? null,
      hsnCode: initial.hsnCode ?? '',
      procurementType: initial.procurementType ?? 'buy', mrpPolicy: initial.mrpPolicy ?? 'manual',
    } : BLANK_ITEM());
    setErr(''); setCategoryError(''); setAddingLevel(null);
  }, [open, initial]);

  const set = (k: keyof ItemDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const advancedFieldCount = ([draft.hsnCode] as string[]).filter((v) => v.trim() !== '').length;

  function onTaxonomyChange(next: { categoryId: number | null; groupId: number | null; subgroupId: number | null }) {
    setCategoryError('');
    setDraft((d) => ({ ...d, ...next }));
  }
  async function handleTaxonomyCreated(level: 'category' | 'group' | 'subgroup', id: number) {
    await refetchTaxonomy(); setAddingLevel(null);
    if (level === 'category') setDraft((d) => ({ ...d, categoryId: id, groupId: null, subgroupId: null }));
    if (level === 'group')    setDraft((d) => ({ ...d, groupId: id, subgroupId: null }));
    if (level === 'subgroup') setDraft((d) => ({ ...d, subgroupId: id }));
  }

  function addCf() {
    if (customFields.length >= 10) return;
    setCustomFields((d) => [...d, blankRow(d.length)]);
  }
  function patchCf(rowId: number, patch: Partial<FieldRowDraft>) {
    setCustomFields((d) => d.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!draft.name.trim()) { setErr('Name is required.'); return; }
    if (!isNew && !draft.code.trim()) { setErr('Code is required.'); return; }
    if (!draft.categoryId) { setCategoryError('Category is required.'); setErr('Category is required.'); return; }
    setCategoryError('');
    setSaving(true); setErr('');
    try {
      // Taxonomy is stored exactly as the user chose it — an unset Group or
      // Sub-group is persisted as NULL, never bucketed into an invented
      // "Default" node (see the field ladder note this comment used to carry
      // in full, ItemCatalog.tsx history). A sub-group chosen with Group left
      // on "None" adopts the sub-group's real parent group.
      const subgroupId = draft.subgroupId;
      const groupId = draft.groupId
        ?? (subgroupId != null ? subgroups.find((s) => s.id === subgroupId)?.groupId ?? null : null);

      if (isNew) {
        // Field DEFINITIONS have to exist before the server's bulk value
        // write can resolve them — it looks up `fab_fields` by key and never
        // invents a missing one. This is the one part of "add an item" that
        // cannot become a single request while a dialog also invents fields.
        const fields: Record<string, { value: string | null; unit?: string }> = {};
        for (const row of customFields) {
          if (!row.label.trim() && !row.fieldKey) continue;
          const key = await ensureFieldDef(row, {
            existing: defs, units: vocab.units,
            scope: { categoryId: draft.categoryId, groupId, subgroupId },
          });
          fields[key] = { value: row.value.trim() === '' ? null : row.value.trim(), unit: row.unit || undefined };
        }
        const res = await createCatalogItem({
          name: draft.name.trim(),
          code: draft.code.trim() || undefined,
          unit: draft.unit.trim() || 'PC',
          description: draft.description.trim() || null,
          categoryId: draft.categoryId, groupId, subgroupId,
          hsnCode: draft.hsnCode.trim() || null,
          procurementType: draft.procurementType as 'make' | 'buy',
          mrpPolicy: draft.mrpPolicy as 'manual' | 'reorder_point' | 'lot_for_lot',
        }, fields);
        if (res.rejected?.length) {
          setErr(`Item created — code: ${res.code}. Not saved: ${res.rejected.map((r) => `${r.fieldKey} — ${r.why}`).join('; ')}`);
          setSaving(false);
          return;
        }
        onSaved(res.code);
        return;
      }

      // Editing an existing item still goes through the generic mutate path —
      // EU-15's transactional route is for CREATE, where the code/field-write
      // sequencing actually matters. `commitFieldRows` (defs then one
      // validated value write) is the right shape for an edit.
      await fabMutate('fabErpItemCatalog', 'update', {
        id: initial!.id,
        name: draft.name.trim(), code: draft.code.trim().toUpperCase(),
        unit: draft.unit.trim() || 'PC', description: draft.description.trim() || null,
        category_id: draft.categoryId, group_id: groupId, subgroup_id: subgroupId,
        hsn_code: draft.hsnCode.trim() || null,
        procurement_type: draft.procurementType || 'buy', mrp_policy: draft.mrpPolicy || 'manual',
      });

      const { rejection } = await commitFieldRows({
        scope: 'catalog_item', scopeId: initial!.id,
        rows: customFields, baseline: [],
        defs, units: vocab.units,
        defScope: { categoryId: draft.categoryId, groupId, subgroupId },
      });
      if (rejection) { setErr(`Item was saved. ${rejection}`); setSaving(false); return; }

      onSaved();
    } catch (e) { setErr(backendMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle>{isNew ? 'Add Catalog Item' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Item Name" value={draft.name} size="small" required autoFocus sx={{ flex: 3 }}
            onChange={(e) => set('name', e.target.value)} />
          {/*
            THE CODE CAN BE TYPED. A new item's code field did not exist at
            all — the dialog only ever showed one, read-only, on an existing
            item — so a shop with its own numbering had no way to enter it and
            every new item got the generated one. The server has always
            accepted a typed code and generated only for a blank one; now the
            screen offers the choice.
          */}
          <TextField
            label="Code" value={draft.code} size="small" sx={{ flex: 1.2 }}
            placeholder={isNew ? 'Blank = generated' : undefined}
            slotProps={{
              input: { readOnly: !isNew, style: { fontFamily: 'var(--font-mono)' } },
              inputLabel: { shrink: true },
              htmlInput: { title: isNew ? 'Type your own code, or leave it blank to use the Items rule under Setup → Code rules' : undefined },
            }}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
          />
          <Autocomplete freeSolo options={STANDARD_UOMS.map((u) => u.value)} sx={{ flex: 1 }}
            value={draft.unit}
            onInputChange={(_, value) => set('unit', value)}
            renderInput={(params) => <TextField {...params} label="Unit" size="small" placeholder="PC" />} />
        </Box>
        <TextField label="Description (optional)" value={draft.description} size="small" fullWidth multiline minRows={2}
          onChange={(e) => set('description', e.target.value)} />

        <TaxonomyPicker
          categories={categories} groups={groups} subgroups={subgroups}
          value={{ categoryId: draft.categoryId, groupId: draft.groupId, subgroupId: draft.subgroupId }}
          onChange={onTaxonomyChange}
          required categoryError={categoryError}
          labels={{ category: 'Category', group: 'Group', subgroup: 'Sub-group' }}
          onAddNew={canManageTaxonomy ? (level) => setAddingLevel(level) : undefined}
        />

        {/* BUG-05: make-vs-buy + MRP policy, so a manufactured item isn't silently stored as 'buy'. */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField select label="Procurement type" size="small" sx={{ flex: 1 }}
            value={draft.procurementType} onChange={(e) => set('procurementType', e.target.value)}
            helperText="'Make' is required for anything you manufacture in-house.">
            {PROCUREMENT_TYPES.map((pt) => <MenuItem key={pt.value} value={pt.value}>{pt.label}</MenuItem>)}
          </TextField>
          <TextField select label="MRP policy" size="small" sx={{ flex: 1 }}
            value={draft.mrpPolicy} onChange={(e) => set('mrpPolicy', e.target.value)}>
            {MRP_POLICIES.map((mp) => <MenuItem key={mp.value} value={mp.value}>{mp.label}</MenuItem>)}
          </TextField>
        </Box>
        {addingLevel === 'category' && (
          <TaxonomyAddForm level="category" categories={categories} groups={groups}
            onCancel={() => setAddingLevel(null)} onCreated={(id) => handleTaxonomyCreated('category', id)} />
        )}
        {addingLevel === 'group' && (
          <TaxonomyAddForm level="group" categories={categories} groups={groups}
            defaultCategoryId={draft.categoryId}
            onCancel={() => setAddingLevel(null)} onCreated={(id) => handleTaxonomyCreated('group', id)} />
        )}
        {addingLevel === 'subgroup' && (
          <TaxonomyAddForm level="subgroup" categories={categories} groups={groups}
            defaultCategoryId={draft.categoryId} defaultGroupId={draft.groupId}
            onCancel={() => setAddingLevel(null)} onCreated={(id) => handleTaxonomyCreated('subgroup', id)} />
        )}

        <Accordion disableGutters elevation={0} variant="outlined" sx={{ '&::before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">
              Additional details
              {(advancedFieldCount + customFields.length) > 0 && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  ({advancedFieldCount + customFields.length} filled)
                </Typography>
              )}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField label="HSN Code" value={draft.hsnCode} size="small" sx={{ flex: '1 1 120px' }} onChange={(e) => set('hsnCode', e.target.value)} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              Need to record weight, dimensions, barcode, or other specs? Add them below as Custom Fields.
            </Typography>

            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* The 10-field cap is UI-only, no longer enforced server-side (EU-16 item 9) — kept
                  as a soft nudge (the Add button disables past it) rather than a hard rule. */}
              <Typography variant="subtitle2">Custom Fields ({customFields.length}/10)</Typography>
              <Button size="small" startIcon={<AddIcon />} disabled={customFields.length >= 10} onClick={addCf}>
                Add Field
              </Button>
            </Box>

            {customFields.length === 0 ? (
              <Typography variant="caption" color="text.secondary">No custom fields yet.</Typography>
            ) : (
              <Table size="small">
                <FieldTableHead valueLabel="Value" canEdit />
                <TableBody>
                  {customFields.map((cf) => (
                    <TableRow key={cf.rowId}>
                      <FieldRowCells
                        row={cf} canEdit unitGroups={unitGroups}
                        onPatch={(p) => patchCf(cf.rowId, p)}
                        onRemove={() => setCustomFields((d) => d.filter((r) => r.rowId !== cf.rowId))}
                      />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || (!isNew && !draft.code.trim())}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── DeleteDialog (catalog items) ──────────────────────────────────────────────

export function DeleteDialog({ item, onClose, onDeleted, onError }: {
  item: FabItemCatalog | null; onClose: () => void; onDeleted: () => void;
  /** EU-16 item 7: this used to swallow the error entirely (`catch {}`). */
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<CatalogItemUsage | null>(null);
  // The old copy here ("Existing BOM entries... are unaffected") was simply
  // wrong — the backend's generic delete had no usage guard at all until it
  // gained one alongside this fetch, so a used item's BOM rows and order
  // items were left pointing at a soft-deleted row. Fetching the same counts
  // `GET /catalog/items/:id/usage` was built for (EU-15) lets the dialog show
  // the real answer before the user commits, instead of only after a refusal.
  useEffect(() => {
    setUsage(null);
    if (!item) return;
    let alive = true;
    getCatalogItemUsage(item.id).then((u) => { if (alive) setUsage(u); }).catch(() => { /* refusal still gates on Remove */ });
    return () => { alive = false; };
  }, [item]);
  const inUse = !!usage && (usage.bomCount > 0 || usage.orderCount > 0);
  async function confirm() {
    if (!item) return;
    setBusy(true);
    try {
      await fabMutate('fabErpItemCatalog', 'delete', { id: item.id });
      onDeleted();
    } catch (e) {
      onError(backendMessage(e, 'Could not remove that item.'));
      onClose();
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!item} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle>Remove from Catalog</DialogTitle>
      <DialogContent>
        <Typography>Remove <strong>{item?.name}</strong> from the catalog?</Typography>
        {usage == null ? (
          <Typography variant="caption" color="text.secondary">Checking whether it's in use…</Typography>
        ) : inUse ? (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            Still referenced by {[
              usage.bomCount > 0 ? `${usage.bomCount} BOM row${usage.bomCount === 1 ? '' : 's'}` : null,
              usage.orderCount > 0 ? `${usage.orderCount} order${usage.orderCount === 1 ? '' : 's'}` : null,
            ].filter(Boolean).join(' and ')}. Remove those references first.
          </Alert>
        ) : (
          <Typography variant="caption" color="text.secondary">Not referenced by any BOM or order (0/0) — safe to remove.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy || inUse}>
          {busy ? <CircularProgress size={16} /> : 'Remove'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
