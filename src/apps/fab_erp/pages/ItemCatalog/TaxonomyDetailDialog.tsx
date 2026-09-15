/**
 * TaxonomyDetailDialog — a Category/Group/Sub-group's own record, its
 * inherited fields, and its own custom fields, all saved together.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Table, TableBody, TableCell, TableHead,
  TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

import { fabMutate } from '../../api/client';
import {
  blankRow, commitFieldRows, getFieldValues, listFieldDefs, rowFromDef, useFieldVocabulary,
  unitsByDimension, type FieldDefRow, type FieldDefScope, type FieldRowDraft,
} from '../../api/fields';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import {
  FieldRowCells, InheritedFieldsTable, StatusBadge, type InheritedFieldRow,
} from '../../components';
import { DialogCloseButton } from '../../components/FormDialog';
import { errMsg } from './shared';

export function TaxonomyDetailDialog({ level, entity, categories, groups, canEdit, canEditFields, onClose, onSaved }: {
  level: 'category' | 'group' | 'subgroup';
  entity: FabItemCategory | FabItemGroup | FabItemSubgroup;
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  canEdit: boolean;
  /**
   * Fields are gated on `fab_erp_items_meta_manage`, which is what both the
   * `fabErpField` resource and `POST /fields/values` require — a different tag
   * from the taxonomy edit above. Showing an editor the server will 403 turns a
   * save into a mystery.
   */
  canEditFields: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isSystem = entity.isSystem === 1;

  const [name, setName]               = useState(entity.name);
  const [code, setCode]               = useState(entity.code);
  const [description, setDescription] = useState(entity.description ?? '');
  const [shortform, setShortform]     = useState(entity.shortform ?? '');
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  const [ownFields,  setOwnFields]  = useState<FieldRowDraft[]>([]);
  const [ownDraft,   setOwnDraft]   = useState<FieldRowDraft[]>([]);
  const [inherited,  setInherited]  = useState<InheritedFieldRow[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [defs, setDefs] = useState<FieldDefRow[]>([]);
  const vocab = useFieldVocabulary();
  const unitGroups = useMemo(() => unitsByDimension(vocab), [vocab]);

  const parentGroup    = level === 'subgroup' ? groups.find((g) => g.id === (entity as FabItemSubgroup).groupId) : undefined;
  const parentCategory = level === 'group'    ? categories.find((c) => c.id === (entity as FabItemGroup).categoryId)
                       : level === 'subgroup'  ? categories.find((c) => c.id === parentGroup?.categoryId)
                       : undefined;

  useEffect(() => {
    setName(entity.name);
    setCode(entity.code);
    setDescription(entity.description ?? '');
    setShortform(entity.shortform ?? '');
    setErr('');
    loadFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id]);

  /**
   * ONE call answers both halves — `GET /fields/values` resolves the whole
   * ladder for this node and reports the rung each value came from, so "own"
   * is simply the keys that resolved HERE and "inherited" is everything that
   * resolved further up.
   */
  async function loadFields() {
    setLoadingFields(true);
    try {
      const [defRes, valRes] = await Promise.all([
        listFieldDefs(),
        getFieldValues(level, entity.id),
      ]);
      const allDefs = defRes.data ?? [];
      setDefs(allDefs);
      const byKey = new Map(allDefs.map((d) => [d.fieldKey, d]));
      const values = valRes.values ?? {};

      const own: FieldRowDraft[] = [];
      const inh: InheritedFieldRow[] = [];
      for (const [key, v] of Object.entries(values)) {
        const def = byKey.get(key);
        if (v.from?.scope === level && Number(v.from.scopeId) === Number(entity.id)) {
          if (def) own.push(rowFromDef(def, v, own.length));
        } else if (v.from?.scope === 'category' || v.from?.scope === 'group' || v.from?.scope === 'subgroup') {
          // A registry-wide default (`from.scope === 'default'`) is deliberately
          // not listed as inherited — it is not taxonomy.
          inh.push({ key, def, inherited: v, effective: v, source: String(v.from.scope) });
        }
      }
      own.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      inh.sort((a, b) => (a.def?.sortOrder ?? 0) - (b.def?.sortOrder ?? 0) || a.key.localeCompare(b.key));
      setOwnFields(own);
      setOwnDraft(own.map((r) => ({ ...r })));
      setInherited(inh);
    } finally {
      setLoadingFields(false);
    }
  }

  function addField() {
    if (ownDraft.length >= 10) return;
    setOwnDraft((d) => [...d, blankRow(d.length)]);
  }
  function patchField(rowId: number, patch: Partial<FieldRowDraft>) {
    setOwnDraft((d) => d.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }
  function removeField(rowId: number) {
    setOwnDraft((d) => d.filter((r) => r.rowId !== rowId));
  }

  function overrideInherited(f: InheritedFieldRow) {
    if (ownDraft.some((d) => d.fieldKey === f.key)) return;
    const row = f.def
      ? rowFromDef(f.def, f.inherited, ownDraft.length)
      : { ...blankRow(ownDraft.length), fieldKey: f.key, label: f.key, value: f.inherited.value == null ? '' : String(f.inherited.value) };
    setOwnDraft((d) => [...d, row]);
  }

  async function save() {
    setSaving(true); setErr('');
    try {
      // The two halves are gated on different permission tags, so each is only
      // attempted by someone who holds its own.
      if (canEdit) {
        const resource = level === 'category' ? 'fabErpItemCategory'
                       : level === 'group'    ? 'fabErpItemGroup'
                                              : 'fabErpItemSubgroup';
        const payload: Record<string, unknown> = {
          id: entity.id,
          description: description.trim() || null,
          shortform: shortform.trim() || null,
        };
        if (!isSystem) {
          if (!name.trim() || !code.trim()) { setErr('Name and Code are required.'); setSaving(false); return; }
          payload.name = name.trim();
          payload.code = code.trim().toUpperCase();
        }
        // `batch_required`/`serial_required`/`heat_required`/`mark_required` used to be
        // written here, but `fab_item_categories` has never had those columns (§13
        // "fab_item_catalog Has No Verified Base DDL" — REPAIR-A already stripped the
        // same four phantom columns from the generic query resourceDef; this direct
        // `/mutate` write was the other half of the same bug, throwing ER_BAD_FIELD_ERROR
        // on save whenever a category was edited with a traceability checkbox toggled).
        await fabMutate(resource, 'update', payload);
      }

      if (canEditFields) {
        const { rejection } = await commitFieldRows({
          scope: level, scopeId: entity.id,
          rows: ownDraft, baseline: ownFields,
          defs, units: vocab.units, defScope: defScope(),
        });
        if (rejection) { setErr(rejection); setSaving(false); await loadFields(); return; }
      }

      await onSaved();
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  const levelLabel = level === 'category' ? 'Category' : level === 'group' ? 'Group' : 'Sub-group';

  /** Where a field invented on this node is filed in the registry. */
  function defScope(): FieldDefScope {
    if (level === 'category') return { categoryId: entity.id, groupId: null, subgroupId: null };
    if (level === 'group') {
      return { categoryId: (entity as FabItemGroup).categoryId ?? null, groupId: entity.id, subgroupId: null };
    }
    const grpId = (entity as FabItemSubgroup).groupId;
    return {
      categoryId: groups.find((g) => g.id === grpId)?.categoryId ?? null,
      groupId: grpId ?? null,
      subgroupId: entity.id,
    };
  }

  const overriddenKeys = new Set(
    ownDraft
      .filter((d) => inherited.some((inh) => inh.key === d.fieldKey))
      .map((d) => d.fieldKey),
  );

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle>
        {levelLabel}: {entity.name}
        {isSystem && <Box component="span" sx={{ ml: 1, display: 'inline-block' }}><StatusBadge status="System" family="info" /></Box>}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {(parentCategory || parentGroup) && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {parentCategory && <Chip label={`Category: ${parentCategory.name}`} size="small" variant="outlined" />}
            {parentGroup && <Chip label={`Group: ${parentGroup.name}`} size="small" variant="outlined" />}
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Name" value={name} size="small" sx={{ flex: 2 }}
            disabled={!canEdit || isSystem} onChange={(e) => setName(e.target.value)} />
          <TextField label="Code" value={code} size="small" sx={{ flex: 1 }}
            disabled={!canEdit || isSystem} onChange={(e) => setCode(e.target.value)} />
        </Box>
        <TextField label="Description" value={description} size="small" fullWidth multiline minRows={2}
          disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
        <TextField label="Shortform" value={shortform} size="small" fullWidth
          disabled={!canEdit} onChange={(e) => setShortform(e.target.value)} />

        {!loadingFields && inherited.length > 0 && (
          <>
            <Divider />
            <InheritedFieldsTable
              rows={inherited} overrides={ownDraft} canEdit={canEditFields} levelLabel={levelLabel}
              onOverride={overrideInherited} onPatch={patchField} onRemove={removeField}
            />
          </>
        )}

        <Divider />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">
            Custom Fields at this {levelLabel} ({ownDraft.length}/10)
          </Typography>
          {canEditFields && (
            <Button size="small" startIcon={<AddIcon />} disabled={ownDraft.length >= 10} onClick={addField}>
              Add Field
            </Button>
          )}
        </Box>
        {!canEditFields && (
          <Alert severity="info" sx={{ py: 0 }}>
            Fields are read-only for you — editing them needs the “Manage item fields” permission.
          </Alert>
        )}

        {loadingFields ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
        ) : ownDraft.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No custom fields at this level yet.{canEditFields ? ' Add up to 10 or override inherited fields above.' : ''}
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Field Name</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 120 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 150 }}>Unit / options</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Default value</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 100 }}>Note</TableCell>
                {canEditFields && <TableCell sx={{ width: 48 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {ownDraft.map((d) => (
                <TableRow key={d.rowId}>
                  <FieldRowCells row={d} canEdit={canEditFields} unitGroups={unitGroups} onPatch={(p) => patchField(d.rowId, p)} />
                  <TableCell sx={{ py: 0.5 }}>
                    {overriddenKeys.has(d.fieldKey) && <StatusBadge status="Override" family="warning" />}
                  </TableCell>
                  {canEditFields && (
                    <TableCell sx={{ py: 0.5 }}>
                      <IconButton size="small" color="error" onClick={() => removeField(d.rowId)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {(canEdit || canEditFields) && (
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
