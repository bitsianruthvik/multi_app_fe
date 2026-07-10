import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Divider, IconButton, MenuItem, Select, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SaveIcon from '@mui/icons-material/Save';

import { fabQuery, fabMutate } from '../api/client';
import type { FabItemCatalog, FabCustomField, FabItemCategory, FabItemGroup, FabItemSubgroup } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import BomDesigner from '../components/BomDesigner';
import { Surface, DetailLayout, Mono, StatusBadge, useToast } from '../components';
import { STANDARD_UOMS } from '../constants/uom';

const PROCUREMENT_TYPES = [
  { value: 'buy', label: 'Buy (external procurement)' },
  { value: 'make', label: 'Make (in-house production)' },
  { value: 'both', label: 'Both (make or buy)' },
];

const MRP_POLICIES = [
  { value: 'manual', label: 'Manual' },
  { value: 'reorder_point', label: 'Reorder Point' },
  { value: 'lot_for_lot', label: 'Lot-for-Lot' },
];

// Monotonic counter for client-only draft row ids — Date.now() can collide
// when two rows are added within the same millisecond, which corrupts the
// React `key` → row mapping for that row's controls (incl. the Type select).
let cfDraftSeq = 0;
function nextCfDraftId(): number {
  cfDraftSeq -= 1;
  return cfDraftSeq;
}

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

export default function ItemCatalogDetail() {
  const { company, itemId } = useParams<{ company: string; itemId: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_items_meta_view');
  const id = Number(itemId);
  const { toast } = useToast();

  const [item, setItem] = useState<FabItemCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);

  const [draft, setDraft] = useState<Partial<FabItemCatalog>>({});
  function set<K extends keyof FabItemCatalog>(k: K, v: FabItemCatalog[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  // mrp_policy replaced the old mrp_active boolean; not yet reflected in the
  // shared FabItemCatalog type, so it's tracked separately rather than on draft.
  const [mrpPolicy, setMrpPolicy] = useState<string>('manual');

  const [configs, setConfigs] = useState<FabCustomField[]>([]);
  const [configDraft, setConfigDraft] = useState<FabCustomField[]>([]);
  const [configSaving, setConfigSaving] = useState(false);
  const [ancestorFields, setAncestorFields] = useState<{ fields: FabCustomField[]; source: 'category' | 'group' | 'subgroup' }[]>([]);

  const [categories, setCategories] = useState<FabItemCategory[]>([]);
  const [groups, setGroups] = useState<FabItemGroup[]>([]);
  const [subgroups, setSubgroups] = useState<FabItemSubgroup[]>([]);
  const [categoryError, setCategoryError] = useState('');

  const availableGroups = useMemo(
    () => groups.filter((g) => !draft.categoryId || g.categoryId === draft.categoryId),
    [groups, draft.categoryId],
  );
  const availableSubgroups = useMemo(
    () => subgroups.filter((s) => !draft.groupId || s.groupId === draft.groupId),
    [subgroups, draft.groupId],
  );

  function onCategoryChange(value: string) {
    const categoryId = value === '' ? null : Number(value);
    setCategoryError('');
    setDraft((d) => {
      const groupOk = d.groupId != null && groups.some((g) => g.id === d.groupId && g.categoryId === categoryId);
      return { ...d, categoryId, groupId: groupOk ? d.groupId : null, subgroupId: groupOk ? d.subgroupId : null };
    });
  }
  function onGroupChange(value: string) {
    const groupId = value === '' ? null : Number(value);
    setDraft((d) => {
      const sgOk = d.subgroupId != null && subgroups.some((s) => s.id === d.subgroupId && s.groupId === groupId);
      return { ...d, groupId, subgroupId: sgOk ? d.subgroupId : null };
    });
  }
  function onSubgroupChange(value: string) {
    setDraft((d) => ({ ...d, subgroupId: value === '' ? null : Number(value) }));
  }

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const itemRes = await fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', { filters: { id }, pagination: { limit: 1 } });
      const it = itemRes.data?.[0] ?? null;
      setItem(it);
      if (it) {
        setDraft({ ...it });
        setMrpPolicy(it.mrpPolicy ?? 'manual');
      }

      const [catRes, grpRes, subRes] = await Promise.all([
        fabQuery<{ data: FabItemCategory[] }>('fabErpItemCategory', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
        fabQuery<{ data: FabItemGroup[] }>('fabErpItemGroup', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
        fabQuery<{ data: FabItemSubgroup[] }>('fabErpItemSubgroup', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
      ]);
      setCategories(catRes.data ?? []);
      setGroups(grpRes.data ?? []);
      setSubgroups(subRes.data ?? []);

      const configRes = await fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', {
        filters: { level: 'item', levelId: id }, orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 100 },
      });
      const cfgs = configRes.data ?? [];
      setConfigs(cfgs);
      setConfigDraft(cfgs.map((c) => ({ ...c })));

      if (it) {
        const ancestorQueries: Promise<{ fields: FabCustomField[]; source: 'category' | 'group' | 'subgroup' }>[] = [];
        if (it.categoryId) {
          ancestorQueries.push(fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', { filters: { level: 'category', levelId: it.categoryId }, orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 100 } }).then((r) => ({ fields: r.data ?? [], source: 'category' as const })));
        }
        if (it.groupId) {
          ancestorQueries.push(fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', { filters: { level: 'group', levelId: it.groupId }, orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 100 } }).then((r) => ({ fields: r.data ?? [], source: 'group' as const })));
        }
        if (it.subgroupId) {
          ancestorQueries.push(fabQuery<{ data: FabCustomField[] }>('fabErpCustomField', { filters: { level: 'subgroup', levelId: it.subgroupId }, orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 100 } }).then((r) => ({ fields: r.data ?? [], source: 'subgroup' as const })));
        }
        setAncestorFields(await Promise.all(ancestorQueries));
      }
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveItem() {
    if (!item) return;
    if (!draft.categoryId) { setCategoryError('Category is required.'); return; }
    setCategoryError('');
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpItemCatalog', 'update', {
        id,
        name: draft.name ?? item.name, code: draft.code ?? item.code, unit: draft.unit ?? null, description: draft.description ?? null,
        procurement_type: draft.procurementType ?? 'buy', lead_time_days: draft.leadTimeDays ?? null, mrp_policy: mrpPolicy,
        category_id: draft.categoryId ?? null, group_id: draft.groupId ?? null, subgroup_id: draft.subgroupId ?? null,
        hsn_code: draft.hsnCode ?? null,
      });
      toast('Item saved');
      fetchAll();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const mergedInherited = useMemo(() => {
    const map = new Map<string, { field: FabCustomField; source: string }>();
    for (const src of ['category', 'group', 'subgroup'] as const) {
      const entry = ancestorFields.find((a) => a.source === src);
      if (entry) for (const f of entry.fields) map.set(f.fieldKey, { field: f, source: src });
    }
    return Array.from(map.values());
  }, [ancestorFields]);

  function addConfigRow() {
    if (configDraft.length >= 10) return;
    const placeholder: FabCustomField = {
      id: nextCfDraftId(), companyId: 0, level: 'item', levelId: id,
      fieldKey: '', fieldType: 'text', fieldValue: null, sortOrder: configDraft.length, createdAt: '', updatedAt: '', deletedAt: null,
    };
    setConfigDraft((d) => [...d, placeholder]);
  }

  async function saveConfigs() {
    setConfigSaving(true); setError('');
    try {
      const removedIds = configs.filter((c) => !configDraft.find((d) => d.id === c.id)).map((c) => c.id);
      for (const rid of removedIds) await fabMutate('fabErpCustomField', 'delete', { id: rid });
      for (let i = 0; i < configDraft.length; i++) {
        const d = configDraft[i];
        if (!d.fieldKey.trim()) continue;
        if (d.id < 0) await fabMutate('fabErpCustomField', 'insert', { level: 'item', level_id: id, field_key: d.fieldKey.trim(), field_type: d.fieldType, field_value: d.fieldValue ?? null, sort_order: i });
        else await fabMutate('fabErpCustomField', 'update', { id: d.id, field_key: d.fieldKey.trim(), field_type: d.fieldType, field_value: d.fieldValue ?? null, sort_order: i });
      }
      toast('Custom fields saved');
      fetchAll();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setConfigSaving(false); }
  }

  function Field({ label, k, type = 'text', suffix }: { label: string; k: keyof FabItemCatalog; type?: string; suffix?: string }) {
    return (
      <TextField
        label={label} size="small" type={type} fullWidth disabled={!canManage}
        value={(draft[k] as string | number | undefined) ?? ''}
        onChange={(e) => set(k, (type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value) as FabItemCatalog[typeof k])}
        slotProps={suffix ? { input: { endAdornment: <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>{suffix}</Typography> } } : undefined}
      />
    );
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (!item) return <Box><Alert severity="error">Item not found.</Alert></Box>;

  return (
    <DetailLayout
      header={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_erp/item-catalog`)}>Item Catalog</Button>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)' }}>
              {item.name} <Mono chip sx={{ ml: 0.5 }}>{item.code}</Mono>
            </Typography>
          </Box>
        </Box>
      }
      tabs={[{ value: '0', label: 'Item Details' }, { value: '1', label: 'Bill of Materials' }]}
      active={String(tab)}
      onTab={(v) => setTab(Number(v))}
      maxWidth={1100}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {tab === 0 && (
        <Surface e={1} sx={{ p: 3 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>General</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
            <Field label="Name" k="name" />
            <Field label="Code" k="code" />
            <Autocomplete freeSolo fullWidth options={STANDARD_UOMS.map((u) => u.value)} disabled={!canManage}
              value={(draft.unit as string | undefined) ?? ''}
              onInputChange={(_, value) => set('unit', value as FabItemCatalog['unit'])}
              renderInput={(params) => <TextField {...params} label="Unit" size="small" />} />
            <Field label="Description" k="description" />
          </Box>
          <Divider sx={{ my: 2, borderColor: 'var(--c-divider)' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>MRP / Planning</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 3 }}>
            <TextField select label="Procurement type" size="small" fullWidth disabled={!canManage} value={draft.procurementType ?? 'buy'} onChange={(e) => set('procurementType', e.target.value as FabItemCatalog['procurementType'])}>
              {PROCUREMENT_TYPES.map((pt) => <MenuItem key={pt.value} value={pt.value}>{pt.label}</MenuItem>)}
            </TextField>
            <TextField label="Default lead time" size="small" fullWidth type="number" disabled={!canManage}
              value={(draft.leadTimeDays as number | undefined) ?? ''}
              onChange={(e) => set('leadTimeDays', (e.target.value === '' ? null : Number(e.target.value)) as FabItemCatalog['leadTimeDays'])}
              slotProps={{ input: { endAdornment: <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>days</Typography> } }} />
            <TextField select label="MRP policy" size="small" fullWidth disabled={!canManage} value={mrpPolicy} onChange={(e) => setMrpPolicy(e.target.value)}>
              {MRP_POLICIES.map((mp) => <MenuItem key={mp.value} value={mp.value}>{mp.label}</MenuItem>)}
            </TextField>
          </Box>
          <Divider sx={{ my: 2, borderColor: 'var(--c-divider)' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>Classification</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 3 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Category *</Typography>
              <Select fullWidth size="small" displayEmpty disabled={!canManage} value={draft.categoryId ?? ''}
                onChange={(e) => onCategoryChange(String(e.target.value))} error={!!categoryError}>
                <MenuItem value=""><em>None</em></MenuItem>
                {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </Select>
              {categoryError && <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{categoryError}</Typography>}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Group</Typography>
              <Select fullWidth size="small" displayEmpty disabled={!canManage} value={draft.groupId ?? ''}
                onChange={(e) => onGroupChange(String(e.target.value))}>
                <MenuItem value=""><em>None</em></MenuItem>
                {availableGroups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
              </Select>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Sub-group</Typography>
              <Select fullWidth size="small" displayEmpty disabled={!canManage} value={draft.subgroupId ?? ''}
                onChange={(e) => onSubgroupChange(String(e.target.value))}>
                <MenuItem value=""><em>None</em></MenuItem>
                {availableSubgroups.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </Select>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
            <Field label="HSN code" k="hsnCode" />
          </Box>
          {canManage && (
            <Box sx={{ mt: 3 }}>
              <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} disabled={saving} onClick={saveItem}>Save</Button>
            </Box>
          )}

          <Divider sx={{ my: 3, borderColor: 'var(--c-divider)' }} />
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>Custom Fields</Typography>
          <Typography variant="caption" sx={{ display: 'block', mb: 2, color: 'var(--c-text-3)' }}>
            Item specs like weight, dimensions, barcode, or material grade are recorded here as custom fields rather than built-in columns.
          </Typography>
          {mergedInherited.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>Inherited from taxonomy ({mergedInherited.length})</Typography>
              <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'var(--c-text-3)' }}>To override an inherited field at the item level, add an item field with the same field name.</Typography>
              <Table size="small" sx={{ mb: 3 }}>
                <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                  <TableCell sx={th}>Field name</TableCell><TableCell sx={{ ...th, width: 100 }}>Type</TableCell>
                  <TableCell sx={th}>Effective default</TableCell><TableCell sx={{ ...th, width: 110 }}>From</TableCell>
                  <TableCell sx={{ ...th, width: 180 }}>Override at item level</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {mergedInherited.map(({ field, source }) => {
                    const overrideIdx = configDraft.findIndex((d) => d.fieldKey === field.fieldKey);
                    const isOverridden = overrideIdx >= 0;
                    return (
                      <TableRow key={field.fieldKey}>
                        <TableCell sx={td}><Mono>{field.fieldKey}</Mono></TableCell>
                        <TableCell sx={td}><Mono chip>{field.fieldType}</Mono></TableCell>
                        <TableCell sx={td}>
                          <Typography sx={isOverridden ? { textDecoration: 'line-through', color: 'var(--c-text-3)', fontSize: 13 } : { fontSize: 13, color: 'var(--c-text-2)' }}>{field.fieldValue ?? '—'}</Typography>
                        </TableCell>
                        <TableCell sx={td}><StatusBadge status={source === 'category' ? 'Category' : source === 'group' ? 'Group' : 'Sub-group'} family="info" /></TableCell>
                        <TableCell sx={td}>
                          {isOverridden ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <TextField size="small" value={configDraft[overrideIdx].fieldValue ?? ''} disabled={!canManage} sx={{ flex: 1, minWidth: 80 }} placeholder="Override value…"
                                onChange={(e) => setConfigDraft((d) => d.map((r, j) => (j === overrideIdx ? { ...r, fieldValue: e.target.value } : r)))} />
                              {canManage && <IconButton size="small" color="error" onClick={() => setConfigDraft((d) => d.filter((_, j) => j !== overrideIdx))}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                            </Box>
                          ) : canManage ? (
                            <Button size="small" variant="outlined" onClick={() => setConfigDraft((d) => [...d, { id: nextCfDraftId(), companyId: 0, level: 'item' as const, levelId: id, fieldKey: field.fieldKey, fieldType: field.fieldType as FabCustomField['fieldType'], fieldValue: field.fieldValue, sortOrder: d.length, createdAt: '', updatedAt: '', deletedAt: null }])}>Override</Button>
                          ) : (
                            <Typography sx={{ color: 'var(--c-text-3)' }}>—</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Divider sx={{ mb: 2, borderColor: 'var(--c-divider)' }} />
            </>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>Item fields ({configDraft.length}/10)</Typography>
            {canManage && <Button size="small" startIcon={<AddIcon />} disabled={configDraft.length >= 10} onClick={addConfigRow}>Add field</Button>}
          </Box>
          {configDraft.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No item-specific fields yet. Add up to 10.</Typography>
          ) : (
            <Table size="small">
              <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Field name</TableCell><TableCell sx={{ ...th, width: 130 }}>Type</TableCell>
                <TableCell sx={th}>Value</TableCell>{canManage && <TableCell sx={{ ...th, width: 48 }} />}
              </TableRow></TableHead>
              <TableBody>
                {configDraft.map((cfg, i) => (
                  <TableRow key={cfg.id}>
                    <TableCell sx={{ ...td, py: 0.5 }}><TextField size="small" fullWidth value={cfg.fieldKey} disabled={!canManage} placeholder="e.g. Material Grade" onChange={(e) => setConfigDraft((d) => d.map((r, j) => (j === i ? { ...r, fieldKey: e.target.value } : r)))} /></TableCell>
                    <TableCell sx={{ ...td, py: 0.5 }}>
                      <TextField select size="small" fullWidth value={cfg.fieldType ?? 'text'} disabled={!canManage} onChange={(e) => setConfigDraft((d) => d.map((r, j) => (j === i ? { ...r, fieldType: e.target.value as FabCustomField['fieldType'] } : r)))}>
                        <MenuItem value="text">Text</MenuItem><MenuItem value="number">Number</MenuItem><MenuItem value="date">Date</MenuItem><MenuItem value="dropdown">Dropdown</MenuItem>
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ ...td, py: 0.5 }}><TextField size="small" fullWidth value={cfg.fieldValue ?? ''} disabled={!canManage} placeholder="e.g. IS2062 E250" onChange={(e) => setConfigDraft((d) => d.map((r, j) => (j === i ? { ...r, fieldValue: e.target.value } : r)))} /></TableCell>
                    {canManage && <TableCell sx={{ ...td, py: 0.5 }}><IconButton size="small" color="error" onClick={() => setConfigDraft((d) => d.filter((_, j) => j !== i))}><DeleteOutlineRounded fontSize="small" /></IconButton></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canManage && configDraft.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" startIcon={configSaving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} disabled={configSaving} onClick={saveConfigs}>Save fields</Button>
            </Box>
          )}
        </Surface>
      )}

      {tab === 1 && (
        <Surface e={1} sx={{ height: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 0 }}>
          <BomDesigner catalogItemId={id} catalogItemName={item.name} catalogItemCode={item.code} catalogItemUnit={item.unit ?? undefined} mode={canManage ? 'edit' : 'readonly'} />
        </Surface>
      )}
    </DetailLayout>
  );
}
