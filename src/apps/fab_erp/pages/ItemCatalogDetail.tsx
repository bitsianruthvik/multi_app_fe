import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Divider, IconButton, ListSubheader, MenuItem, Select, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SaveIcon from '@mui/icons-material/Save';

import { fabQuery, fabMutate } from '../api/client';
import { useDetailTitle } from '../components/nav/detailTitleContext';
import type { FabItemCatalog, FabItemCategory, FabItemGroup, FabItemSubgroup } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import BomDesigner from '../components/BomDesigner';
import { SectionCard, StickyActionBar, Surface, DetailLayout, Mono, StatusBadge, useToast, DetailSkeleton } from '../components';
import { STANDARD_UOMS } from '../constants/uom';
import {
  blankRow, boolValue, BOOL_OPTIONS, commitFieldRows, displayValue, fieldValueError, getFieldValues,
  listFieldDefs, parseAllowed, rowFromDef, rowsDiffer, uiTypeOf,
  UI_FIELD_TYPES, unitsByDimension, useFieldVocabulary, valuePlaceholder,
  type FieldDefRow, type FieldRowDraft, type FieldScope, type ResolvedValue, type UiFieldType,
} from '../api/fields';

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

/**
 * The narrowest taxonomy node above an item — where its inherited values come
 * from.
 *
 * Falls through rather than assuming all three levels exist: an item may now
 * carry a NULL group and sub-group, and the server's ladder skips those rungs
 * too, so a category-only item resolves against its category and nothing here
 * has to special-case it.
 */
function ancestorScopeOf(it: FabItemCatalog | null): { scope: FieldScope; scopeId: number } | null {
  if (!it) return null;
  if (it.subgroupId) return { scope: 'subgroup', scopeId: Number(it.subgroupId) };
  if (it.groupId) return { scope: 'group', scopeId: Number(it.groupId) };
  if (it.categoryId) return { scope: 'category', scopeId: Number(it.categoryId) };
  return null;
}

/** Where an inherited value came from, as the badge reads. */
const SOURCE_LABEL: Record<string, string> = {
  category: 'Category', group: 'Group', subgroup: 'Sub-group', default: 'Field default',
};

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

export default function ItemCatalogDetail() {
  const { company, itemId } = useParams<{ company: string; itemId: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_items_meta_view');
  /**
   * Fields are gated separately, and on the MANAGE tag.
   *
   * `POST /fields/values` and the `fabErpField` resource both require
   * `fab_erp_items_meta_manage`; the item record above is gated on the view tag
   * this page has always used. Showing an editor the server will 403 is how a
   * save turns into a mystery, so the field section simply goes read-only.
   */
  const { user } = useAuth();
  const canManageFields = usePermission('fab_erp_items_meta_manage') || isAdminRole(user?.role);
  const id = Number(itemId);
  const { toast } = useToast();

  const [item, setItem] = useState<FabItemCatalog | null>(null);
  // Breadcrumb reads "Items / FG-GIRDER-PG1500", not "Items / 42".
  useDetailTitle(item?.code);
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

  /**
   * FIELDS COME FROM THE REGISTRY NOW, NOT `fab_custom_fields`.
   *
   * `defs` is `fab_fields` (the definitions — type, unit, options, and the id a
   * write needs). `itemValues` is what `GET /fields/values` resolves for THIS
   * item, walking sub-group → group → category, so an item-level override is
   * already applied. `ancestorValues` is the same call against the item's
   * narrowest taxonomy node — i.e. the inherited value BEFORE this item has its
   * say — which is what lets the inherited table show the taxonomy default and
   * the effective value side by side instead of labelling one as the other.
   */
  const [defs, setDefs] = useState<FieldDefRow[]>([]);
  const [itemValues, setItemValues] = useState<Record<string, ResolvedValue>>({});
  const [ancestorValues, setAncestorValues] = useState<Record<string, ResolvedValue>>({});
  const [configs, setConfigs] = useState<FieldRowDraft[]>([]);
  const [configDraft, setConfigDraft] = useState<FieldRowDraft[]>([]);
  const [configSaving, setConfigSaving] = useState(false);
  /** Server-side refusals from the last save. Kept apart from `error` so the
   *  refetch that follows a save cannot wipe them off the screen. */
  const [rejected, setRejected] = useState('');
  const vocab = useFieldVocabulary();
  const unitGroups = useMemo(() => unitsByDimension(vocab), [vocab]);
  const defsByKey = useMemo(() => new Map(defs.map((d) => [d.fieldKey, d])), [defs]);

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

      /**
       * ONE resolve for the item, ONE for its taxonomy.
       *
       * The old code fired a query per ancestor level against
       * `fab_custom_fields` and merged them here — reimplementing the ladder in
       * the browser, where it could (and did) disagree with the server's. The
       * server walks the same chain for both calls, so the two agree by
       * construction, and a NULL group or sub-group is simply a shorter walk
       * rather than a case this code has to know about.
       */
      const defRes = await listFieldDefs();
      const allDefs = defRes.data ?? [];
      setDefs(allDefs);
      const defMap = new Map(allDefs.map((d) => [d.fieldKey, d]));

      const anc = ancestorScopeOf(it);
      const [itemFieldRes, ancRes] = await Promise.all([
        getFieldValues('catalog_item', id),
        anc ? getFieldValues(anc.scope, anc.scopeId) : Promise.resolve(null),
      ]);
      setItemValues(itemFieldRes.values ?? {});
      setAncestorValues(ancRes?.values ?? {});

      // The item's OWN rows are the keys whose resolved value stopped at this
      // rung. Anything broader belongs in the inherited table, not here.
      const own = Object.entries(itemFieldRes.values ?? {})
        .filter(([, v]) => v.from?.scope === 'catalog_item')
        .map(([key, v], i) => {
          const def = defMap.get(key);
          return def ? rowFromDef(def, v, i) : null;
        })
        .filter((r): r is FieldRowDraft => r != null);
      setConfigs(own);
      setConfigDraft(own.map((r) => ({ ...r })));
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /**
   * ONE honest save for the whole Item Details tab.
   *
   * The tab writes to two different places — the item record and its custom
   * fields — and used to expose a button for each ("Save item" in the card
   * header, "Save fields" buried further down). Overriding an inherited field
   * and then pressing the visually-primary "Save item" fired exactly one
   * request, toasted success, and silently dropped the field edit on the next
   * reload. Splitting one mental action ("save this item") across two buttons
   * IS the bug; no amount of relabelling fixes it. So there is now a single
   * save that awaits both writes and only reports success once both landed.
   */
  async function saveAll() {
    if (!item) return;
    if (!draft.categoryId) {
      setCategoryError('Category is required.');
      // Loud, never silent: nothing was written and nothing was discarded —
      // configDraft still holds the pending field edits.
      setError('Nothing was saved — Category is required. Your changes are still on screen.');
      return;
    }
    setCategoryError('');
    setSaving(true); setError(''); setRejected('');
    try {
      await fabMutate('fabErpItemCatalog', 'update', {
        id,
        name: draft.name ?? item.name, code: draft.code ?? item.code, unit: draft.unit ?? null, description: draft.description ?? null,
        procurement_type: draft.procurementType ?? 'buy', lead_time_days: draft.leadTimeDays ?? null, mrp_policy: mrpPolicy,
        category_id: draft.categoryId ?? null, group_id: draft.groupId ?? null, subgroup_id: draft.subgroupId ?? null,
        hsn_code: draft.hsnCode ?? null,
      });

      /**
       * Field flush — definitions first, then ONE validated value write.
       *
       * Both halves are new. The old flush wrote `fab_custom_fields` rows
       * through the generic /mutate path, which stored a key and a string and
       * validated neither, so `VERIFY-Z600` sat happily in a "number" field.
       * Now each row's DEFINITION is created or updated in `fab_fields` (type,
       * unit, options), and the values go through `POST /fields/values`, which
       * refuses a non-number in a number field and an out-of-list option — and
       * says which key it refused and why, below.
       *
       * Run unconditionally rather than behind a dirty check, because a false
       * negative in change detection would reintroduce precisely the silent
       * data loss this function exists to remove.
       */
      setConfigSaving(true);
      const { wrote: wroteFields, rejection } = await commitFieldRows({
        scope: 'catalog_item', scopeId: id,
        rows: configDraft, baseline: configs,
        defs, units: vocab.units, defScope: defScopeForItem(),
      });

      // One toast and one refetch for the whole operation, never two. A
      // rejection is NOT a success — it is shown instead of the toast, because
      // a refused value that toasts "saved" is the bug that started all this.
      // Set after the refetch, which clears `error` on the way in.
      if (!rejection) toast(wroteFields ? 'Item and custom fields saved' : 'Item saved');
      await fetchAll();
      setRejected(rejection ?? '');
    } catch (e) {
      // Deliberately no fetchAll() here: on a mid-sequence failure the draft
      // keeps the user's edits rather than being overwritten by a
      // partially-written server state, and no success is reported.
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); setConfigSaving(false); }
  }

  /** Where a field invented on this item is filed in the registry. */
  const defScopeForItem = useCallback(() => ({
    categoryId: draft.categoryId ?? item?.categoryId ?? null,
    groupId: draft.groupId ?? item?.groupId ?? null,
    subgroupId: draft.subgroupId ?? item?.subgroupId ?? null,
  }), [draft.categoryId, draft.groupId, draft.subgroupId, item]);

  /**
   * What this item inherits, and what it will actually use.
   *
   * `taxonomy` is the value resolved at the item's narrowest taxonomy node —
   * the number the item gets if it says nothing. `effective` is the value
   * resolved AT THE ITEM, so an override is already applied. Keeping both is
   * the whole fix for the column that was headed "effective default" and showed
   * the pre-override figure: 350 is the taxonomy default, 410 is what the
   * system will use, and the table now says which is which.
   *
   * Registry-wide defaults (`from.scope === 'default'`) are excluded: they are
   * not taxonomy, so calling them inherited would be a third meaning for the
   * word on one screen.
   */
  const mergedInherited = useMemo(() => {
    return Object.entries(ancestorValues)
      .filter(([, v]) => v.from?.scope === 'category' || v.from?.scope === 'group' || v.from?.scope === 'subgroup')
      .map(([key, v]) => ({
        key,
        def: defsByKey.get(key),
        taxonomy: v,
        effective: itemValues[key],
        source: String(v.from.scope),
      }))
      .sort((a, b) => (a.def?.sortOrder ?? 0) - (b.def?.sortOrder ?? 0) || a.key.localeCompare(b.key));
  }, [ancestorValues, itemValues, defsByKey]);

  function addConfigRow() {
    if (configDraft.length >= 10) return;
    setConfigDraft((d) => [...d, blankRow(d.length)]);
  }

  /** Start an item-level override of an inherited field, seeded with its current value. */
  function overrideInherited(key: string, def: FieldDefRow | undefined, current: ResolvedValue) {
    if (configDraft.some((d) => d.fieldKey === key)) return;
    const row = def
      ? rowFromDef(def, current, configDraft.length)
      : { ...blankRow(configDraft.length), fieldKey: key, label: key, value: current.value == null ? '' : String(current.value) };
    setConfigDraft((d) => [...d, row]);
  }

  // Which half of the tab has unsaved edits. Used ONLY to render the
  // "unsaved changes" markers — saveAll never consults these, so a wrong
  // answer here can mislabel a badge but can never skip a write.
  const itemDirty = useMemo(() => {
    if (!item) return false;
    const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
    const pairs: [unknown, unknown][] = [
      [draft.name, item.name],
      [draft.code, item.code],
      [draft.unit, item.unit],
      [draft.description, item.description],
      [draft.procurementType ?? 'buy', item.procurementType ?? 'buy'],
      [draft.leadTimeDays, item.leadTimeDays],
      [mrpPolicy, item.mrpPolicy ?? 'manual'],
      [draft.categoryId, item.categoryId],
      [draft.groupId, item.groupId],
      [draft.subgroupId, item.subgroupId],
      [draft.hsnCode, item.hsnCode],
    ];
    return pairs.some(([a, b]) => norm(a) !== norm(b));
  }, [draft, item, mrpPolicy]);

  const fieldsDirty = useMemo(() => {
    if (configDraft.length !== configs.length) return true;
    return configDraft.some((d) => {
      const orig = configs.find((c) => c.rowId === d.rowId);
      return !orig || rowsDiffer(orig, d);
    });
  }, [configs, configDraft]);

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

  if (loading) return <DetailSkeleton />;
  if (!item) return <Box><Alert severity="error">Item not found.</Alert></Box>;

  const dirtyMessage = itemDirty && fieldsDirty ? 'Unsaved changes in Item and Custom fields'
    : itemDirty ? 'Unsaved changes in Item'
    : fieldsDirty ? 'Unsaved changes in Custom fields'
    : 'No unsaved changes';

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
      {/* Refusals from the field write. A warning, not an error: the item and
          every other field did save — these specific values did not, and the
          server says why for each one. */}
      {rejected && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setRejected('')}>{rejected}</Alert>}

      {/* One card per concern, but only ONE save. This tab writes to two
          endpoints (the item record and its custom fields) and previously put
          a save button in each card header — which reads as "this button
          saves this card" and so invited the user to press one and lose the
          other card's work. Both writes now hang off the single button in the
          StickyActionBar below, which stays in the viewport from either
          section; the cards themselves only report whether they are dirty. */}
      {tab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <SectionCard
          title="Item"
          subtitle="Identity, planning defaults and where it sits in the taxonomy"
          action={canManage && itemDirty ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--c-warning-600)' }}>
              <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'var(--c-warning-600)' }} />
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>Unsaved changes</Typography>
            </Box>
          ) : undefined}
        >
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
        </SectionCard>

        <SectionCard
          title="Custom fields"
          subtitle="Item specs like weight, dimensions, barcode or material grade live here rather than as built-in columns"
          action={canManageFields && (configSaving || fieldsDirty) ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--c-warning-600)' }}>
              {configSaving
                ? <CircularProgress size={13} color="inherit" />
                : <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'var(--c-warning-600)' }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{configSaving ? 'Saving…' : 'Unsaved changes'}</Typography>
            </Box>
          ) : undefined}
        >
          {mergedInherited.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>Inherited from taxonomy ({mergedInherited.length})</Typography>
              <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'var(--c-text-3)' }}>
                Taxonomy default is what this item inherits; Effective is what the system will actually use.
              </Typography>
              <Table size="small" sx={{ mb: 3 }}>
                <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                  <TableCell sx={th}>Field name</TableCell><TableCell sx={{ ...th, width: 100 }}>Type</TableCell>
                  {/* Two columns, because they are two different numbers. The
                      single column that used to sit here was headed "effective
                      default" and showed the taxonomy figure — so after an
                      override it stated a value the system would not use. */}
                  <TableCell sx={th}>Taxonomy default</TableCell><TableCell sx={{ ...th, width: 110 }}>From</TableCell>
                  <TableCell sx={th}>Effective</TableCell>
                  <TableCell sx={{ ...th, width: 180 }}>Override at item level</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {mergedInherited.map(({ key, def, taxonomy, effective, source }) => {
                    const overrideIdx = configDraft.findIndex((d) => d.fieldKey === key);
                    const isOverridden = overrideIdx >= 0;
                    const row = isOverridden ? configDraft[overrideIdx] : null;
                    const type: UiFieldType = def ? uiTypeOf(def) : 'text';
                    const allowed = parseAllowed(def?.allowedValues);
                    const valueErr = row ? fieldValueError(type, row.value, allowed) : null;
                    return (
                      <TableRow key={key}>
                        <TableCell sx={td}>
                          <Typography sx={{ fontSize: 13 }}>{def?.label ?? key}</Typography>
                          <Mono sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{key}</Mono>
                        </TableCell>
                        <TableCell sx={td}>
                          <Mono chip>{type}</Mono>
                          {def?.defaultUnit && <Mono sx={{ ml: 0.5, fontSize: 11, color: 'var(--c-text-3)' }}>{def.defaultUnit}</Mono>}
                        </TableCell>
                        <TableCell sx={td}>
                          <Typography sx={isOverridden ? { textDecoration: 'line-through', color: 'var(--c-text-3)', fontSize: 13 } : { fontSize: 13, color: 'var(--c-text-2)' }}>{displayValue(taxonomy)}</Typography>
                        </TableCell>
                        <TableCell sx={td}><StatusBadge status={SOURCE_LABEL[source] ?? source} family="info" /></TableCell>
                        <TableCell sx={td}>
                          {/* The saved effective value. While an override is
                              being typed it has not been resolved yet, so the
                              pending figure is shown and marked as such rather
                              than pretending the server has agreed to it. */}
                          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                            {isOverridden && row && row.value.trim() !== '' && String(effective?.value ?? '') !== row.value.trim()
                              ? `${row.value.trim()}${def?.defaultUnit ? ` ${def.defaultUnit}` : ''} (unsaved)`
                              : displayValue(effective ?? taxonomy)}
                          </Typography>
                        </TableCell>
                        <TableCell sx={td}>
                          {isOverridden && row ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <TextField size="small"
                                select={type === 'bool' || (type === 'dropdown' && allowed.length > 0)}
                                value={type === 'bool' ? boolValue(row.value) : row.value}
                                disabled={!canManageFields} sx={{ flex: 1, minWidth: 80 }}
                                placeholder={valuePlaceholder(type, def?.defaultUnit)}
                                error={!!valueErr} helperText={valueErr ?? undefined}
                                onChange={(e) => setConfigDraft((d) => d.map((r) => (r.rowId === row.rowId ? { ...r, value: e.target.value } : r)))}>
                                {type === 'bool'
                                  ? [<MenuItem key="" value="">— none —</MenuItem>,
                                     ...BOOL_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)]
                                  : allowed.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                              </TextField>
                              {canManageFields && <IconButton size="small" color="error" onClick={() => setConfigDraft((d) => d.filter((r) => r.rowId !== row.rowId))}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                            </Box>
                          ) : canManageFields ? (
                            <Button size="small" variant="outlined" onClick={() => overrideInherited(key, def, taxonomy)}>Override</Button>
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
            {canManageFields && <Button size="small" startIcon={<AddIcon />} disabled={configDraft.length >= 10} onClick={addConfigRow}>Add field</Button>}
          </Box>
          {!canManageFields && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              Fields are read-only for you — editing them needs the “Manage Item Metrics” permission.
            </Alert>
          )}
          {configDraft.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No item-specific fields yet. Add up to 10.</Typography>
          ) : (
            <Table size="small">
              <TableHead><TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Field name</TableCell><TableCell sx={{ ...th, width: 120 }}>Type</TableCell>
                {/* One column for the two things that qualify a value: a unit
                    for a number, the option list for a dropdown. A number with
                    no unit is why stock ended up holding the string "2000 mm". */}
                <TableCell sx={{ ...th, width: 150 }}>Unit / options</TableCell>
                <TableCell sx={th}>Value</TableCell>{canManageFields && <TableCell sx={{ ...th, width: 48 }} />}
              </TableRow></TableHead>
              <TableBody>
                {configDraft.map((cfg) => {
                  const allowed = cfg.options.split(',').map((s) => s.trim()).filter(Boolean);
                  const valueErr = fieldValueError(cfg.type, cfg.value, allowed);
                  const patch = (p: Partial<FieldRowDraft>) =>
                    setConfigDraft((d) => d.map((r) => (r.rowId === cfg.rowId ? { ...r, ...p } : r)));
                  return (
                    <TableRow key={cfg.rowId}>
                      <TableCell sx={{ ...td, py: 0.5 }}>
                        <TextField size="small" fullWidth value={cfg.label} disabled={!canManageFields || cfg.isStandard} placeholder="e.g. Material Grade"
                          helperText={cfg.fieldKey ? cfg.fieldKey : undefined}
                          onChange={(e) => patch({ label: e.target.value })} />
                      </TableCell>
                      <TableCell sx={{ ...td, py: 0.5 }}>
                        <Tooltip title={cfg.isStandard ? 'Standard field — features are written against its type' : ''}>
                          <TextField select size="small" fullWidth value={cfg.type} disabled={!canManageFields || cfg.isStandard}
                            onChange={(e) => patch({ type: e.target.value as UiFieldType })}>
                            {UI_FIELD_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                          </TextField>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ ...td, py: 0.5 }}>
                        {cfg.type === 'number' ? (
                          <TextField select size="small" fullWidth value={cfg.unit} disabled={!canManageFields || cfg.isStandard}
                            onChange={(e) => patch({ unit: e.target.value })}>
                            <MenuItem value="">— no unit —</MenuItem>
                            {unitGroups.flatMap((g) => [
                              <ListSubheader key={`h-${g.group}`} sx={{ fontSize: 11, lineHeight: '26px' }}>{g.group}</ListSubheader>,
                              ...g.units.map((u) => <MenuItem key={u.code} value={u.code}>{u.code}</MenuItem>),
                            ])}
                          </TextField>
                        ) : cfg.type === 'dropdown' ? (
                          <TextField size="small" fullWidth value={cfg.options} disabled={!canManageFields || cfg.isStandard}
                            placeholder="Option1, Option2, …" onChange={(e) => patch({ options: e.target.value })} />
                        ) : (
                          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>—</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...td, py: 0.5 }}>
                        {cfg.type === 'bool' ? (
                          <TextField select size="small" fullWidth value={boolValue(cfg.value)} disabled={!canManageFields}
                            onChange={(e) => patch({ value: e.target.value })}>
                            <MenuItem value="">— none —</MenuItem>
                            {BOOL_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                          </TextField>
                        ) : cfg.type === 'dropdown' && allowed.length ? (
                          <TextField select size="small" fullWidth value={allowed.includes(cfg.value) ? cfg.value : ''} disabled={!canManageFields}
                            onChange={(e) => patch({ value: e.target.value })}>
                            <MenuItem value="">— none —</MenuItem>
                            {allowed.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                          </TextField>
                        ) : (
                          <TextField size="small" fullWidth value={cfg.value} disabled={!canManageFields}
                            placeholder={valuePlaceholder(cfg.type, cfg.unit)}
                            error={!!valueErr} helperText={valueErr ?? undefined}
                            onChange={(e) => patch({ value: e.target.value })} />
                        )}
                      </TableCell>
                      {canManageFields && <TableCell sx={{ ...td, py: 0.5 }}><IconButton size="small" color="error" onClick={() => setConfigDraft((d) => d.filter((r) => r.rowId !== cfg.rowId))}><DeleteOutlineRounded fontSize="small" /></IconButton></TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        {/* The one and only save on this tab. Sticky so it is reachable from
            the fields section without scrolling back up, and its message line
            names which sections are pending before you click. */}
        {canManage && (
          <StickyActionBar message={dirtyMessage}>
            <Button
              variant="contained" size="small"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              disabled={saving} onClick={saveAll}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </StickyActionBar>
        )}
        </Box>
      )}

      {tab === 1 && (
        <Surface e={1} sx={{ height: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 0 }}>
          <BomDesigner catalogItemId={id} catalogItemName={item.name} catalogItemCode={item.code} catalogItemUnit={item.unit ?? undefined} mode={canManage ? 'edit' : 'readonly'} />
        </Surface>
      )}
    </DetailLayout>
  );
}
