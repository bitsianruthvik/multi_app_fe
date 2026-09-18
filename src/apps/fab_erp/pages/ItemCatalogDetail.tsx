/**
 * ItemCatalogDetail — one catalog item, laid out around what people ask
 * about it, top to bottom:
 *
 *   header      name · code · category › group › sub-group · make/buy ·
 *               "25 × 1500 × 9000 · MS E350 BO · 2,650 kg"
 *   Item        the editable record (behind an "Edit" toggle)
 *   Where used  BOMs it appears in, orders whose structure references it
 *   Stock       on hand / reserved / available + the pieces themselves
 *   Buying      lead time, MRP policy, procurement type + recent PO lines
 *   Fields      inherited + item-level custom fields
 *
 * The three read sections come from `routes/catalogDetail.js`. Saving is
 * still ONE button for the whole page (item record + custom fields).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Divider, Link, MenuItem, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';

import { fabQuery, fabMutate } from '../api/client';
import {
  getItemPurchases, getItemStock, getItemWhereUsed,
  type ItemPurchasesResponse, type ItemStockResponse, type WhereUsedResponse,
} from '../api/catalogDetail';
import { useDetailTitle } from '../components/nav/detailTitleContext';
import type { FabItemCatalog, FabItemCategory, FabItemGroup, FabItemSubgroup } from '../types';
import { isNonCatalog } from '../api/catalog';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import ItemBomDesigner from '../components/ItemBomDesigner';
import TemplateRevisionBar from '../components/TemplateRevisionBar';
import {
  SectionCard, StickyActionBar, Surface, DetailLayout, Mono, StatusBadge, EmptyState, DateCell, QtyCell,
  useToast, DetailSkeleton, FieldRowCells, FieldTableHead, InheritedFieldsTable, TaxonomyPicker,
  type InheritedFieldRow,
} from '../components';
import { STANDARD_UOMS } from '../constants/uom';
import { PROCUREMENT_TYPES, MRP_POLICIES, TH, TD } from './ItemCatalog/shared';
import {
  blankRow, commitFieldRows, getFieldValues,
  listFieldDefs, rowFromDef, rowsDiffer, unitsByDimension, useFieldVocabulary,
  type FieldDefRow, type FieldRowDraft, type FieldScope, type ResolvedValue,
} from '../api/fields';

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

/**
 * One editable cell of the item record.
 *
 * DEFINED HERE, NOT INSIDE THE PAGE. It used to be declared in the component
 * body, which makes it a NEW component type on every render — so React threw
 * the old <TextField> away and mounted a fresh one after each keystroke, and
 * the caret went with it. Typing a name meant clicking back into the box for
 * every letter.
 */
function Field({
  label, k, type = 'text', suffix, readOnly = false, help,
  draft, set, canManage,
}: {
  label: string;
  k: keyof FabItemCatalog;
  type?: string;
  suffix?: string;
  readOnly?: boolean;
  help?: string;
  draft: Partial<FabItemCatalog>;
  set: <K extends keyof FabItemCatalog>(k: K, v: FabItemCatalog[K]) => void;
  canManage: boolean;
}) {
  const endAdornment = suffix
    ? <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>{suffix}</Typography>
    : undefined;
  return (
    <TextField
      label={label}
      size="small"
      type={type}
      fullWidth
      disabled={!canManage && !readOnly}
      helperText={help}
      value={(draft[k] as string | number | undefined) ?? ''}
      onChange={readOnly ? undefined : (e) => set(
        k,
        (type === 'number'
          ? (e.target.value === '' ? null : Number(e.target.value))
          : e.target.value) as FabItemCatalog[typeof k],
      )}
      slotProps={{
        input: {
          readOnly,
          ...(endAdornment ? { endAdornment } : {}),
          ...(readOnly ? { sx: { fontFamily: 'var(--font-mono, monospace)', color: 'var(--c-text-2)' } } : {}),
        },
      }}
    />
  );
}

/** "25 × 1500 × 9000 · MS E350 BO · 2,650 kg" from the resolved field values; "—" for what the item does not state. */
function identityLine(values: Record<string, ResolvedValue>): { dims: string; material: string; weight: string } {
  const num = (k: string) => {
    const v = values[k]?.value;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const text = (k: string) => {
    const v = values[k]?.value;
    return v == null || v === '' ? null : String(v);
  };
  const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 3 }));
  const dims = [num('thickness_mm'), num('width_mm'), num('length_mm')].map(fmt).join(' × ');
  const material = [text('material'), text('grade')].filter(Boolean).join(' ') || '—';
  const w = num('unit_weight_kg');
  const weight = w == null ? '—' : `${w.toLocaleString(undefined, { maximumFractionDigits: w < 10 ? 2 : 0 })} kg`;
  return { dims, material, weight };
}

const SUBHEAD = { fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 } as const;

function DirtyMarker({ saving, label = 'Unsaved changes' }: { saving?: boolean; label?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'var(--c-warning-600)' }}>
      {saving
        ? <CircularProgress size={13} color="inherit" />
        : <Box aria-hidden sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'var(--c-warning-600)' }} />}
      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{saving ? 'Saving…' : label}</Typography>
    </Box>
  );
}

/** A section's loading / error / content switch, so each read section reads the same. */
function Loaded<T>({ state, children }: { state: { loading: boolean; error: string; data: T | null }; children: (d: T) => React.ReactNode }) {
  if (state.loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>;
  if (state.error) return <Alert severity="warning">{state.error}</Alert>;
  if (!state.data) return null;
  return <>{children(state.data)}</>;
}

type Fetch<T> = { loading: boolean; error: string; data: T | null };
function useFetch<T>(fn: (id: number) => Promise<T>, id: number): Fetch<T> {
  const [state, setState] = useState<Fetch<T>>({ loading: true, error: '', data: null });
  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: '', data: null });
    fn(id)
      .then((data) => { if (alive) setState({ loading: false, error: '', data }); })
      .catch((e: { response?: { data?: { message?: string } }; message?: string }) => {
        if (alive) setState({ loading: false, error: e.response?.data?.message ?? e.message ?? 'Could not load.', data: null });
      });
    return () => { alive = false; };
  }, [fn, id]);
  return state;
}

const PROCUREMENT_LABEL: Record<string, string> = { buy: 'Buy', make: 'Make', free_issue: 'Free issue' };
const PROCUREMENT_FAMILY: Record<string, 'info' | 'success' | 'neutral'> = { buy: 'info', make: 'success', free_issue: 'neutral' };

export default function ItemCatalogDetail() {
  const { company, itemId } = useParams<{ company: string; itemId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  /**
   * ONE TAG FOR THE WHOLE PAGE, and it is the one the server enforces: the
   * item record, its custom fields and its BOM all require
   * `fab_erp_items_meta_manage`, with the same admin bypass the rest of
   * fab_erp has.
   */
  const canManage = usePermission('fab_erp_items_meta_manage') || isAdminRole(user?.role);
  const canManageFields = canManage;
  const id = Number(itemId);
  const { toast } = useToast();

  const [item, setItem] = useState<FabItemCatalog | null>(null);
  /** Bumped each time the BOM designer reloads (after every saved edit), so the revision bar re-reads. */
  const [bomVersion, setBomVersion] = useState(0);
  const bumpBomVersion = useCallback(() => setBomVersion((v) => v + 1), []);
  // Breadcrumb reads "Items / FG-GIRDER-PG1500", not "Items / 42".
  useDetailTitle(item?.code);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);

  const [draft, setDraft] = useState<Partial<FabItemCatalog>>({});
  function set<K extends keyof FabItemCatalog>(k: K, v: FabItemCatalog[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  /**
   * `defs` is `fab_fields` (the definitions). `itemValues` is what
   * `GET /fields/values` resolves for THIS item, walking sub-group → group →
   * category, so an item-level override is already applied. `ancestorValues`
   * is the same call against the item's narrowest taxonomy node — the
   * inherited value BEFORE this item has its say.
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

  const whereUsed = useFetch<WhereUsedResponse>(getItemWhereUsed, id);
  const stock = useFetch<ItemStockResponse>(getItemStock, id);
  const purchases = useFetch<ItemPurchasesResponse>(getItemPurchases, id);

  function onTaxonomyChange(next: { categoryId: number | null; groupId: number | null; subgroupId: number | null }) {
    setCategoryError('');
    setDraft((d) => ({ ...d, ...next }));
  }

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const itemRes = await fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', { filters: { id }, pagination: { limit: 1 } });
      const it = itemRes.data?.[0] ?? null;
      setItem(it);
      if (it) setDraft({ ...it });

      const [catRes, grpRes, subRes] = await Promise.all([
        fabQuery<{ data: FabItemCategory[] }>('fabErpItemCategory', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
        fabQuery<{ data: FabItemGroup[] }>('fabErpItemGroup', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
        fabQuery<{ data: FabItemSubgroup[] }>('fabErpItemSubgroup', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } }),
      ]);
      setCategories(catRes.data ?? []);
      setGroups(grpRes.data ?? []);
      setSubgroups(subRes.data ?? []);

      // ONE resolve for the item, ONE for its taxonomy — the server walks the
      // same ladder for both, so the two agree by construction.
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
   * ONE honest save for the whole page: the item record and its custom
   * fields, awaited together, success reported only once both landed.
   */
  async function saveAll() {
    if (!item) return;
    if (!draft.categoryId) {
      setCategoryError('Category is required.');
      setEditing(true);
      setError('Nothing was saved — Category is required. Your changes are still on screen.');
      return;
    }
    setCategoryError('');
    setSaving(true); setError(''); setRejected('');
    try {
      await fabMutate('fabErpItemCatalog', 'update', {
        id,
        // `code` is deliberately absent. It is generated, and every nest, task,
        // mark and stock row that names this item names it by code — none of
        // which would follow a rename.
        name: draft.name ?? item.name,
        unit: draft.unit ?? null,
        description: draft.description ?? null,
        procurement_type: draft.procurementType ?? 'buy', lead_time_days: draft.leadTimeDays ?? null, mrp_policy: draft.mrpPolicy ?? 'manual',
        category_id: draft.categoryId ?? null, group_id: draft.groupId ?? null, subgroup_id: draft.subgroupId ?? null,
        hsn_code: draft.hsnCode ?? null,
      });

      // Field flush — definitions first, then ONE validated value write. Run
      // unconditionally rather than behind a dirty check: a false negative in
      // change detection would be silent data loss.
      setConfigSaving(true);
      const { wrote: wroteFields, rejection } = await commitFieldRows({
        scope: 'catalog_item', scopeId: id,
        rows: configDraft, baseline: configs,
        defs, units: vocab.units, defScope: defScopeForItem(),
      });

      if (!rejection) toast(wroteFields ? 'Item and custom fields saved' : 'Item saved');
      await fetchAll();
      setRejected(rejection ?? '');
    } catch (e) {
      // No fetchAll() here: on a mid-sequence failure the draft keeps the
      // user's edits rather than being overwritten by partial server state.
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
   * What this item inherits (`taxonomy` = resolved at its narrowest node) and
   * what it will actually use (`effective` = resolved AT the item). Registry
   * -wide defaults are excluded: they are not taxonomy.
   */
  const mergedInherited: InheritedFieldRow[] = useMemo(() => {
    return Object.entries(ancestorValues)
      .filter(([, v]) => v.from?.scope === 'category' || v.from?.scope === 'group' || v.from?.scope === 'subgroup')
      .map(([key, v]) => ({
        key,
        def: defsByKey.get(key),
        inherited: v,
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
  function overrideInherited(f: InheritedFieldRow) {
    if (configDraft.some((d) => d.fieldKey === f.key)) return;
    const row = f.def
      ? rowFromDef(f.def, f.inherited, configDraft.length)
      : { ...blankRow(configDraft.length), fieldKey: f.key, label: f.key, value: f.inherited.value == null ? '' : String(f.inherited.value) };
    setConfigDraft((d) => [...d, row]);
  }

  // Which parts of the page have unsaved edits. Used ONLY for the markers —
  // saveAll never consults these, so a wrong answer can never skip a write.
  const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
  const itemDirty = useMemo(() => {
    if (!item) return false;
    const pairs: [unknown, unknown][] = [
      [draft.name, item.name], [draft.unit, item.unit], [draft.description, item.description],
      [draft.categoryId, item.categoryId], [draft.groupId, item.groupId], [draft.subgroupId, item.subgroupId],
      [draft.hsnCode, item.hsnCode],
    ];
    return pairs.some(([a, b]) => norm(a) !== norm(b));
  }, [draft, item]);
  const buyingDirty = useMemo(() => {
    if (!item) return false;
    const pairs: [unknown, unknown][] = [
      [draft.procurementType ?? 'buy', item.procurementType ?? 'buy'],
      [draft.leadTimeDays, item.leadTimeDays],
      [draft.mrpPolicy ?? 'manual', item.mrpPolicy ?? 'manual'],
    ];
    return pairs.some(([a, b]) => norm(a) !== norm(b));
  }, [draft, item]);
  const fieldsDirty = useMemo(() => {
    if (configDraft.length !== configs.length) return true;
    return configDraft.some((d) => {
      const orig = configs.find((c) => c.rowId === d.rowId);
      return !orig || rowsDiffer(orig, d);
    });
  }, [configs, configDraft]);

  const identity = useMemo(() => identityLine(itemValues), [itemValues]);

  if (loading) return <DetailSkeleton />;
  if (!item) return <Box><Alert severity="error">Item not found.</Alert></Box>;

  const dirtyParts = [itemDirty && 'Item', buyingDirty && 'Buying', fieldsDirty && 'Fields'].filter(Boolean) as string[];
  const dirtyMessage = dirtyParts.length ? `Unsaved changes in ${dirtyParts.join(', ')}` : 'No unsaved changes';
  const anyDirty = dirtyParts.length > 0;

  const procurement = item.procurementType ?? 'buy';
  const crumbs = [item.categoryName, item.groupName, item.subgroupName].filter(Boolean) as string[];
  const itemLink = (itemId2: number) => `/${company}/fab_erp/item-catalog/${itemId2}`;
  const orderLink = (orderId: number) => `/${company}/fab_erp/orders/${orderId}`;

  // Which list this item belongs to decides what the page shows and where
  // Back goes. A cut plate is non-catalog but IS stock; a template part is
  // neither stock nor bought.
  const nonCatalog = isNonCatalog(item);
  const isCutPlate = (item as FabItemCatalog & { materialForm?: string | null }).materialForm === 'blank';
  const isTemplatePart = nonCatalog && !isCutPlate;
  const backTo = nonCatalog
    ? `/${company}/fab_erp/item-catalog?tab=non-catalog${isCutPlate ? '&list=cutplate' : ''}`
    : `/${company}/fab_erp/item-catalog`;

  return (
    <DetailLayout
      header={
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)} sx={{ mt: 0.25 }}>
            {isTemplatePart ? 'Templates' : isCutPlate ? 'Cut plates' : 'Catalog'}
          </Button>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: 'var(--c-text)' }}>{item.name}</Typography>
              <Mono chip>{item.code}</Mono>
              {nonCatalog
                ? <StatusBadge status={isCutPlate ? 'Cut plate' : 'Template part'} family="neutral" />
                : <StatusBadge status={PROCUREMENT_LABEL[procurement] ?? procurement} family={PROCUREMENT_FAMILY[procurement] ?? 'neutral'} />}
            </Box>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>
              {crumbs.length ? crumbs.join(' › ') : 'No category'}
            </Typography>
            {/* The identity line: what it is, in one glance, without scrolling. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Mono sx={{ fontSize: 14, color: 'var(--c-text)' }}>{identity.dims}</Mono>
              <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>·</Typography>
              <Typography component="span" sx={{ fontSize: 14, color: 'var(--c-text)' }}>{identity.material}</Typography>
              <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>·</Typography>
              <Mono sx={{ fontSize: 14, color: 'var(--c-text)' }}>{identity.weight}</Mono>
              {item.unit && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>per {item.unit}</Typography>}
            </Box>
            {item.description && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.75 }}>{item.description}</Typography>
            )}
          </Box>
          {canManage && tab === 0 && (
            <Button
              variant={editing ? 'contained' : 'outlined'} size="small" startIcon={<EditIcon />}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? 'Editing' : 'Edit'}
            </Button>
          )}
        </Box>
      }
      tabs={[{ value: '0', label: 'Overview' }, { value: '1', label: 'Bill of Materials' }]}
      active={String(tab)}
      onTab={(v) => setTab(Number(v))}
      maxWidth={1100}
    >
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {rejected && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setRejected('')}>{rejected}</Alert>}

      {tab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* ── Item (edit) ─────────────────────────────────────────────── */}
          {(editing || itemDirty) && (
            <SectionCard
              title="Item"
              subtitle="Name, unit, description and where it sits in the taxonomy"
              action={canManage && itemDirty ? <DirtyMarker /> : undefined}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                <Field label="Name" k="name" draft={draft} set={set} canManage={canManage} />
                <Field label="Code" k="code" readOnly help="Generated — cannot be edited" draft={draft} set={set} canManage={canManage} />
                <Autocomplete freeSolo fullWidth options={STANDARD_UOMS.map((u) => u.value)} disabled={!canManage}
                  value={(draft.unit as string | undefined) ?? ''}
                  onInputChange={(_, value) => set('unit', value as FabItemCatalog['unit'])}
                  renderInput={(params) => <TextField {...params} label="Unit" size="small" />} />
                <Field label="Description" k="description" draft={draft} set={set} canManage={canManage} />
              </Box>
              <Divider sx={{ my: 2, borderColor: 'var(--c-divider)' }} />
              <Typography sx={SUBHEAD}>Classification</Typography>
              <Box sx={{ mb: 3 }}>
                <TaxonomyPicker
                  categories={categories} groups={groups} subgroups={subgroups}
                  value={{ categoryId: draft.categoryId ?? null, groupId: draft.groupId ?? null, subgroupId: draft.subgroupId ?? null }}
                  onChange={onTaxonomyChange}
                  disabled={!canManage} required categoryError={categoryError}
                  labels={{ category: 'Category', group: 'Group', subgroup: 'Sub-group' }}
                />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                <Field label="HSN code" k="hsnCode" draft={draft} set={set} canManage={canManage} />
              </Box>
            </SectionCard>
          )}

          {/* ── Where it is used ────────────────────────────────────────── */}
          <SectionCard title="Where it is used" subtitle="The BOMs this item is a part of, and the orders whose structure names it">
            <Loaded state={whereUsed}>
              {(d) => (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                  <Box>
                    <Typography sx={SUBHEAD}>BOMs ({d.bomTotal})</Typography>
                    {d.boms.length === 0 ? (
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Not on any BOM yet.</Typography>
                    ) : (
                      <Table size="small">
                        <TableHead><TableRow>
                          <TableCell sx={TH}>Parent item</TableCell>
                          <TableCell sx={TH} align="right">Qty</TableCell>
                        </TableRow></TableHead>
                        <TableBody>
                          {d.boms.map((b) => (
                            <TableRow key={b.bomId} hover>
                              <TableCell sx={TD}>
                                <Link component={RouterLink} to={itemLink(b.parentItemId)} underline="hover" sx={{ color: 'var(--c-text)', fontWeight: 500 }}>
                                  {b.parentName}
                                </Link>
                                <Mono chip sx={{ ml: 1 }}>{b.parentCode}</Mono>
                              </TableCell>
                              <TableCell sx={TD} align="right">
                                {b.qtyParam
                                  ? <Mono>{b.qtyParam}{b.defaultQty != null ? ` (default ${b.defaultQty})` : ''}</Mono>
                                  : <QtyCell value={b.qtyNum} />}
                                {b.perInstanceQty && <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)', ml: 0.5 }}>per instance</Typography>}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {d.bomTotal > d.boms.length && (
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>Showing the first {d.boms.length} of {d.bomTotal}.</Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography sx={SUBHEAD}>Orders ({d.orderTotal})</Typography>
                    {d.orders.length === 0 ? (
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No order structure references it yet.</Typography>
                    ) : (
                      <Table size="small">
                        <TableHead><TableRow>
                          <TableCell sx={TH}>Order</TableCell>
                          <TableCell sx={TH}>Status</TableCell>
                          <TableCell sx={TH} align="right">Rows</TableCell>
                        </TableRow></TableHead>
                        <TableBody>
                          {d.orders.map((o) => (
                            <TableRow key={o.orderId} hover>
                              <TableCell sx={TD}>
                                <Link component={RouterLink} to={orderLink(o.orderId)} underline="hover" sx={{ color: 'var(--c-text)' }}>
                                  <Mono>{o.orderNumber}</Mono>
                                </Link>
                                {o.customerName && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 1 }}>{o.customerName}</Typography>}
                                {o.orderType !== 'sales' && <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)', ml: 1 }}>{o.orderType}</Typography>}
                              </TableCell>
                              <TableCell sx={TD}><StatusBadge status={o.status} /></TableCell>
                              <TableCell sx={TD} align="right"><Mono tabular>{o.rowCount}</Mono></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {d.orderTotal > d.orders.length && (
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>Showing the first {d.orders.length} of {d.orderTotal}.</Typography>
                    )}
                  </Box>
                </Box>
              )}
            </Loaded>
          </SectionCard>

          {/* A template part is never stock (the physical thing is the order's piece); a cut plate is. */}
          {!isTemplatePart && (<>
          {/* ── Stock ───────────────────────────────────────────────────── */}
          <SectionCard title="Stock" subtitle="Pieces on hand for this item — the same numbers the Buy step sees">
            <Loaded state={stock}>
              {(d) => (
                <>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 2 }}>
                    {([
                      ['On hand', d.onHand, 'var(--c-text)'],
                      ['Reserved', d.reserved, d.reserved > 0 ? 'var(--c-warning-600)' : 'var(--c-text-3)'],
                      ['Available', d.available, d.available > 0 ? 'var(--c-success-600)' : 'var(--c-text-3)'],
                    ] as [string, number, string][]).map(([label, value, color]) => (
                      <Surface key={label} e={0} sx={{ p: 1.5 }}>
                        <Typography sx={{ ...SUBHEAD, mb: 0.5 }}>{label}</Typography>
                        <Mono sx={{ fontSize: 20, fontWeight: 600, color }} tabular>
                          {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </Mono>
                        {item.unit && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.5 }}>{item.unit}</Typography>}
                      </Surface>
                    ))}
                  </Box>
                  {d.pieces.length === 0 ? (
                    <EmptyState title="Nothing in stock" hint="No pieces of this item are on hand. Received stock and offcuts will show here." />
                  ) : (
                    <Table size="small">
                      <TableHead><TableRow>
                        <TableCell sx={TH}>Piece</TableCell>
                        <TableCell sx={TH} align="right">Qty</TableCell>
                        <TableCell sx={TH}>Size</TableCell>
                        <TableCell sx={TH}>Location</TableCell>
                        <TableCell sx={TH}>Heat / batch</TableCell>
                        <TableCell sx={TH}>Received</TableCell>
                      </TableRow></TableHead>
                      <TableBody>
                        {d.pieces.map((p) => (
                          <TableRow key={p.id} hover>
                            <TableCell sx={TD}>
                              <Mono chip>{p.code ?? p.serialNo ?? `#${p.id}`}</Mono>
                              {p.isOffcut && <StatusBadge status="Offcut" family="warning" />}
                            </TableCell>
                            <TableCell sx={TD} align="right"><QtyCell value={p.qty} uom={p.uom} /></TableCell>
                            <TableCell sx={TD}>
                              {p.lengthMm != null || p.widthMm != null
                                ? <Mono>{p.widthMm ?? '—'} × {p.lengthMm ?? '—'}</Mono>
                                : <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>—</Typography>}
                            </TableCell>
                            <TableCell sx={TD}>{[p.plantName, p.locationName].filter(Boolean).join(' / ') || '—'}</TableCell>
                            <TableCell sx={TD}>{[p.heatNo && `Heat ${p.heatNo}`, p.batchNo && `Batch ${p.batchNo}`].filter(Boolean).join(' · ') || '—'}</TableCell>
                            <TableCell sx={TD}><DateCell value={p.receivedDate} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {d.pieces.some((p) => p.isOffcut) && (
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
                      Offcuts are listed but not counted in the totals — they are matched by size when nesting, not as whole units.
                    </Typography>
                  )}
                </>
              )}
            </Loaded>
          </SectionCard>

          </>)}

          {/* Nothing non-catalog is bought — lead time, MRP policy and PO lines do not apply. */}
          {!nonCatalog && (<>
          {/* ── Buying ──────────────────────────────────────────────────── */}
          <SectionCard
            title="Buying"
            subtitle="How this item is sourced and planned, and what has been ordered recently"
            action={canManage && buyingDirty ? <DirtyMarker /> : undefined}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
              <TextField select label="Procurement type" size="small" fullWidth disabled={!canManage} value={draft.procurementType ?? 'buy'} onChange={(e) => set('procurementType', e.target.value as FabItemCatalog['procurementType'])}>
                {PROCUREMENT_TYPES.map((pt) => <MenuItem key={pt.value} value={pt.value}>{pt.label}</MenuItem>)}
              </TextField>
              <TextField label="Default lead time" size="small" fullWidth type="number" disabled={!canManage}
                value={(draft.leadTimeDays as number | undefined) ?? ''}
                onChange={(e) => set('leadTimeDays', (e.target.value === '' ? null : Number(e.target.value)) as FabItemCatalog['leadTimeDays'])}
                slotProps={{ input: { endAdornment: <Typography variant="caption" sx={{ color: 'var(--c-text-3)' }}>days</Typography> } }} />
              <TextField select label="MRP policy" size="small" fullWidth disabled={!canManage} value={draft.mrpPolicy ?? 'manual'} onChange={(e) => set('mrpPolicy', e.target.value as FabItemCatalog['mrpPolicy'])}>
                {MRP_POLICIES.map((mp) => <MenuItem key={mp.value} value={mp.value}>{mp.label}</MenuItem>)}
              </TextField>
            </Box>
            <Typography sx={SUBHEAD}>Recent purchase orders</Typography>
            <Loaded state={purchases}>
              {(d) => d.lines.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Never bought yet.</Typography>
              ) : (
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell sx={TH}>PO</TableCell>
                    <TableCell sx={TH}>Supplier</TableCell>
                    <TableCell sx={TH}>Status</TableCell>
                    <TableCell sx={TH} align="right">Ordered</TableCell>
                    <TableCell sx={TH} align="right">Received</TableCell>
                    <TableCell sx={TH}>Date</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {d.lines.map((l) => (
                      <TableRow key={l.lineId} hover>
                        <TableCell sx={TD}>
                          <Link component={RouterLink} to={orderLink(l.orderId)} underline="hover" sx={{ color: 'var(--c-text)' }}>
                            <Mono>{l.orderNumber}</Mono>
                          </Link>
                        </TableCell>
                        <TableCell sx={TD}>{l.supplierName ?? <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>No supplier yet</Typography>}</TableCell>
                        <TableCell sx={TD}><StatusBadge status={l.status} /></TableCell>
                        <TableCell sx={TD} align="right"><QtyCell value={l.qty} uom={l.unit} /></TableCell>
                        <TableCell sx={TD} align="right"><QtyCell value={l.qtyReceived} uom={l.unit} /></TableCell>
                        <TableCell sx={TD}><DateCell value={l.expectedDate ?? l.orderedAt} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Loaded>
          </SectionCard>

          </>)}

          {/* ── Fields ──────────────────────────────────────────────────── */}
          <SectionCard
            title="Fields"
            subtitle="Specs like size, grade or barcode — inherited from the taxonomy, overridable here"
            action={canManageFields && (configSaving || fieldsDirty) ? <DirtyMarker saving={configSaving} /> : undefined}
          >
            {mergedInherited.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <InheritedFieldsTable
                  rows={mergedInherited} overrides={configDraft} canEdit={canManageFields} levelLabel="Item"
                  onOverride={overrideInherited}
                  onPatch={(rowId, patch) => setConfigDraft((d) => d.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))}
                  onRemove={(rowId) => setConfigDraft((d) => d.filter((r) => r.rowId !== rowId))}
                />
                <Divider sx={{ mt: 2, borderColor: 'var(--c-divider)' }} />
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography sx={{ ...SUBHEAD, mb: 0 }}>Item fields ({configDraft.length}/10)</Typography>
              {canManageFields && <Button size="small" startIcon={<AddIcon />} disabled={configDraft.length >= 10} onClick={addConfigRow}>Add field</Button>}
            </Box>
            {!canManageFields && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                Fields are read-only for you — editing them needs the “Manage item fields” permission.
              </Alert>
            )}
            {configDraft.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No item-specific fields yet. Add up to 10.</Typography>
            ) : (
              <Table size="small">
                <FieldTableHead valueLabel="Value" canEdit={canManageFields} />
                <TableBody>
                  {configDraft.map((cfg) => (
                    <TableRow key={cfg.rowId}>
                      <FieldRowCells
                        row={cfg} canEdit={canManageFields} unitGroups={unitGroups}
                        onPatch={(p) => setConfigDraft((d) => d.map((r) => (r.rowId === cfg.rowId ? { ...r, ...p } : r)))}
                        onRemove={() => setConfigDraft((d) => d.filter((r) => r.rowId !== cfg.rowId))}
                      />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          {/* The one and only save on this page. Sticky, so it is reachable
              from any section, and it names which sections are pending. */}
          {canManage && (
            <StickyActionBar message={dirtyMessage}>
              <Button
                variant="contained" size="small"
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                disabled={saving || !anyDirty} onClick={saveAll}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </StickyActionBar>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Surface e={1} sx={{ height: 600, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 0 }}>
          {/* The BOM is the template's WORKING COPY; the bar says which released
              revision new orders get, and releases the next one. */}
          <TemplateRevisionBar templateItemId={id} canRelease={canManage} refreshKey={bomVersion} />
          {/* fab_item_bom is the real structure (Span → Girder → Segment → parts). */}
          <ItemBomDesigner
            catalogItemId={id}
            catalogItemName={item.name}
            mode={canManage ? 'edit' : 'readonly'}
            onLoaded={bumpBomVersion}
          />
        </Surface>
      )}
    </DetailLayout>
  );
}
