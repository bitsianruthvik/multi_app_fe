/**
 * TaxonomyTab — the taxonomy CRUD dialogs: `TaxonomyAddForm` (the inline
 * add-panel used from inside `CatalogDialog`), `AddTaxonomyDialog` (the
 * standalone modal the tree's "Add" buttons open) and `TaxonomyDeleteDialog`
 * (cascade delete with the server's in-use check). The tree itself lives in
 * `TaxonomyTree.tsx`; the old per-level list component is gone.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, MenuItem, Select, Table, TableBody, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

import { fabMutate } from '../../api/client';
import { blankRow, commitFieldRows, useFieldVocabulary, unitsByDimension, type FieldRowDraft } from '../../api/fields';
import { deleteTaxonomy } from '../../api/catalog';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import { FieldRowCells, FieldTableHead } from '../../components';
import { DialogCloseButton } from '../../components/FormDialog';
import { errMsg, useFieldDefs } from './shared';

type TaxonomyLevel = 'category' | 'group' | 'subgroup';
type TaxonomyEntity = FabItemCategory | FabItemGroup | FabItemSubgroup;

// ── TaxonomyAddForm (used inline inside CatalogDialog) ────────────────────────

export function TaxonomyAddForm({
  level, categories, groups, defaultCategoryId, defaultGroupId, onCancel, onCreated,
}: {
  level: TaxonomyLevel;
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  defaultCategoryId?: number | null;
  defaultGroupId?: number | null;
  onCancel: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName]               = useState('');
  const [code, setCode]               = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId]   = useState<number | ''>(defaultCategoryId ?? '');
  const [groupId, setGroupId]         = useState<number | ''>(defaultGroupId ?? '');
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  const groupOptions = level === 'subgroup'
    ? groups.filter((g) => !categoryId || g.categoryId === categoryId)
    : groups;

  useEffect(() => { setCode(autoCodeLocal(name)); }, [name]);

  async function handleSave() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (level === 'group'    && !categoryId) { setErr('Category is required.'); return; }
    if (level === 'subgroup' && !groupId)    { setErr('Group is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(), code: (code.trim() || autoCodeLocal(name)).toUpperCase(),
        description: description.trim() || null,
      };
      let resource = 'fabErpItemCategory';
      if (level === 'group')    { resource = 'fabErpItemGroup';    payload.category_id = categoryId; }
      if (level === 'subgroup') { resource = 'fabErpItemSubgroup'; payload.group_id    = groupId; }
      const res = await fabMutate<{ ok: boolean; id: number }>(resource, 'insert', payload);
      onCreated(res.id);
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1, mt: 1 }}>
      {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
      {level === 'group' && (
        <Select size="small" displayEmpty value={categoryId}
          onChange={(e) => setCategoryId(e.target.value as number | '')}>
          <MenuItem value="" disabled><em>Select category…</em></MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </Select>
      )}
      {level === 'subgroup' && (
        <>
          <Select size="small" displayEmpty value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value as number | ''); setGroupId(''); }}>
            <MenuItem value=""><em>Filter by category (optional)…</em></MenuItem>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={groupId}
            onChange={(e) => setGroupId(e.target.value as number | '')}>
            <MenuItem value="" disabled><em>Select group…</em></MenuItem>
            {groupOptions.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
          </Select>
        </>
      )}
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField label="Name" value={name} size="small" sx={{ flex: 2 }} autoFocus onChange={(e) => setName(e.target.value)} />
        <TextField label="Code" value={code} size="small" sx={{ flex: 1 }} onChange={(e) => setCode(e.target.value)} />
      </Box>
      <TextField label="Description (optional)" value={description} size="small" fullWidth multiline minRows={1} onChange={(e) => setDescription(e.target.value)} />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={14} /> : 'Add'}
        </Button>
      </Box>
    </Box>
  );
}

function autoCodeLocal(name: string): string {
  const c = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20);
  return c || 'CODE';
}

// ── AddTaxonomyDialog (standalone modal for tab Add buttons) ──────────────────

export function AddTaxonomyDialog({ open, level, categories, groups, defaultCategoryId, defaultGroupId, nonCatalog = false, onClose, onCreated }: {
  open: boolean;
  level: TaxonomyLevel;
  /** A CATEGORY added from the Non-catalog view starts non-catalog: items created in it are templates. */
  nonCatalog?: boolean;
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  /** Pre-selected parents when opened from a "+ group" / "+ sub-group" on the tree. */
  defaultCategoryId?: number | null;
  defaultGroupId?: number | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName]               = useState('');
  const [code, setCode]               = useState('');
  const [description, setDescription] = useState('');
  const [shortform, setShortform]     = useState('');
  const [categoryId, setCategoryId]   = useState<number | ''>('');
  const [groupId, setGroupId]         = useState<number | ''>('');
  const [customFields, setCustomFields] = useState<FieldRowDraft[]>([]);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');
  const defs = useFieldDefs(open);
  const vocab = useFieldVocabulary();
  const unitGroups = useMemo(() => unitsByDimension(vocab), [vocab]);

  useEffect(() => {
    if (!open) return;
    setName(''); setCode(''); setDescription(''); setShortform('');
    setCategoryId(defaultCategoryId ?? ''); setGroupId(defaultGroupId ?? '');
    setCustomFields([]); setErr('');
  }, [open, defaultCategoryId, defaultGroupId]);

  useEffect(() => { setCode(autoCodeLocal(name)); }, [name]);

  const availableGroups = groups.filter((g) => !categoryId || g.categoryId === categoryId);
  const levelLabel = level === 'category' ? 'Category' : level === 'group' ? 'Group' : 'Sub-group';

  function addCf() {
    if (customFields.length >= 10) return;
    setCustomFields((d) => [...d, blankRow(d.length)]);
  }
  function patchCf(rowId: number, patch: Partial<FieldRowDraft>) {
    setCustomFields((d) => d.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (level === 'group'    && !categoryId) { setErr('Category is required.'); return; }
    if (level === 'subgroup' && !groupId)    { setErr('Group is required.'); return; }
    setSaving(true); setErr('');
    try {
      const finalCode = (code.trim() || autoCodeLocal(name)).toUpperCase();
      const payload: Record<string, unknown> = {
        name: name.trim(), code: finalCode,
        description: description.trim() || null,
        shortform: shortform.trim() || null,
      };
      let resource = 'fabErpItemCategory';
      if (level === 'category') payload.default_cataloged = nonCatalog ? 0 : 1;
      if (level === 'group')    { resource = 'fabErpItemGroup';    payload.category_id = categoryId; }
      if (level === 'subgroup') { resource = 'fabErpItemSubgroup'; payload.group_id    = groupId; }

      const res = await fabMutate<{ ok: boolean; id: number }>(resource, 'insert', payload);

      const parentCatId = level === 'subgroup'
        ? (groups.find((g) => g.id === groupId)?.categoryId ?? null)
        : (categoryId === '' ? null : Number(categoryId));
      const { rejection } = await commitFieldRows({
        scope: level, scopeId: res.id,
        rows: customFields, baseline: [],
        defs, units: vocab.units,
        defScope: {
          categoryId: level === 'category' ? res.id : parentCatId,
          groupId: level === 'group' ? res.id : (level === 'subgroup' ? Number(groupId) : null),
          subgroupId: level === 'subgroup' ? res.id : null,
        },
      });
      if (rejection) { setErr(`${levelLabel} created. ${rejection}`); setSaving(false); return; }

      await onCreated();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle>Add {levelLabel}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {level === 'group' && (
          <Box>
            <Typography variant="caption" color="text.secondary">Category *</Typography>
            <Select fullWidth size="small" displayEmpty value={categoryId}
              onChange={(e) => setCategoryId(e.target.value as number | '')}>
              <MenuItem value="" disabled><em>Select category…</em></MenuItem>
              {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </Select>
          </Box>
        )}

        {level === 'subgroup' && (
          <>
            <Box>
              <Typography variant="caption" color="text.secondary">Category (filter)</Typography>
              <Select fullWidth size="small" displayEmpty value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value as number | ''); setGroupId(''); }}>
                <MenuItem value=""><em>All categories</em></MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Group *</Typography>
              <Select fullWidth size="small" displayEmpty value={groupId}
                onChange={(e) => setGroupId(e.target.value as number | '')}>
                <MenuItem value="" disabled><em>Select group…</em></MenuItem>
                {availableGroups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </Select>
            </Box>
          </>
        )}

        <TextField label={`${levelLabel} Name *`} value={name} size="small" fullWidth autoFocus
          onChange={(e) => setName(e.target.value)} />
        <TextField label="Code (auto-generated, editable)" value={code} size="small" fullWidth
          helperText="Unique identifier — auto-populated from name."
          onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <TextField label="Description" value={description} size="small" fullWidth multiline minRows={2}
          onChange={(e) => setDescription(e.target.value)} />
        <TextField label="Shortform" value={shortform} size="small" fullWidth
          onChange={(e) => setShortform(e.target.value)} />

        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">Custom Fields ({customFields.length}/10)</Typography>
          <Button size="small" startIcon={<AddIcon />} disabled={customFields.length >= 10} onClick={addCf}>
            Add Field
          </Button>
        </Box>

        {customFields.length === 0 ? (
          <Typography variant="caption" color="text.secondary">No custom fields yet.</Typography>
        ) : (
          <Table size="small">
            <FieldTableHead valueLabel="Default value" canEdit />
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? <CircularProgress size={16} /> : `Add ${levelLabel}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── TaxonomyDeleteDialog (cascade delete confirmation) ─────────────────────────

export function TaxonomyDeleteDialog({ open, type, entity, groups, subgroups, onClose, onDeleted, setToast }: {
  open: boolean;
  type: TaxonomyLevel | null;
  entity: TaxonomyEntity | null;
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  onClose: () => void;
  onDeleted: () => Promise<void>;
  setToast: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!entity || !type) return null;

  const affectedGroups = type === 'category'
    ? groups.filter((g) => g.categoryId === entity.id)
    : [];
  const affectedGroupIds = new Set(affectedGroups.map((g) => g.id));

  const affectedSubgroups = type === 'category'
    ? subgroups.filter((s) => affectedGroupIds.has(s.groupId))
    : type === 'group'
    ? subgroups.filter((s) => s.groupId === entity.id)
    : [];

  const levelLabel = type === 'category' ? 'Category' : type === 'group' ? 'Group' : 'Sub-group';

  async function handleDelete() {
    if (!entity || !type) return;
    setBusy(true);
    try {
      // ONE authority now (EU-15's DELETE /taxonomy/:level/:id) — it refuses
      // (409 + count) if any catalog item still references this node or a
      // descendant, instead of this loop deleting subgroups/groups first and
      // then discovering the category itself is still in use.
      await deleteTaxonomy(type, entity.id);
      setToast('Deleted.');
      await onDeleted();
    } catch (e) {
      setToast(taxonomyInUseMessage(e));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle>Delete {levelLabel}?</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete <strong>{entity.name}</strong>?
        </Typography>
        {(affectedGroups.length > 0 || affectedSubgroups.length > 0) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              The following will also be permanently deleted:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {affectedGroups.length > 0 && (
                <li>
                  <Typography variant="body2">
                    {affectedGroups.length} group{affectedGroups.length !== 1 ? 's' : ''}: {affectedGroups.map((g) => g.name).join(', ')}
                  </Typography>
                </li>
              )}
              {affectedSubgroups.length > 0 && (
                <li>
                  <Typography variant="body2">
                    {affectedSubgroups.length} sub-group{affectedSubgroups.length !== 1 ? 's' : ''}: {affectedSubgroups.map((s) => s.name).join(', ')}
                  </Typography>
                </li>
              )}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handleDelete} disabled={busy}>
          {busy ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function taxonomyInUseMessage(e: unknown): string {
  const ax = e as { response?: { data?: { code?: string; count?: number; message?: string } } };
  const data = ax.response?.data;
  if (data?.code === 'TAXONOMY_IN_USE') return data.message ?? `${data.count} item(s) still reference this.`;
  return errMsg(e);
}

