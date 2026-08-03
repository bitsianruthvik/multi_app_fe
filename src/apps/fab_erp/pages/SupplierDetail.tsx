import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Link,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import SaveIcon from '@mui/icons-material/SaveRounded';
import AddIcon from '@mui/icons-material/Add';
import StarRounded from '@mui/icons-material/StarRounded';
import StarBorderRounded from '@mui/icons-material/StarBorderRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';

import { fabQuery, fabMutate } from '../api/client';
import { useDetailTitle } from '../components/nav/detailTitleContext';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, DetailLayout, FactItem, Mono, EmptyState, useToast, DataTable, NumberCell, DetailSkeleton } from '../components';

interface FabSupplier {
  id: number; companyId: number; name: string; code: string;
  contactName?: string; phone?: string; email?: string; address?: string; notes?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}
interface FabSupplierItem {
  id: number; companyId: number; supplierId: number; catalogItemId: number;
  leadTimeDays?: number; unitCost?: number; currency?: string; minOrderQty?: number;
  isPreferred: number; notes?: string;
  supplierName?: string; supplierCode?: string;
  catalogItemName?: string; catalogItemCode?: string; catalogItemUnit?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}
interface CatalogOption { id: number; name: string; code: string; unit?: string }
interface SuppItemDraft {
  catalogItem: CatalogOption | null; leadTimeDays: string; unitCost: string;
  currency: string; minOrderQty: string; isPreferred: boolean; notes: string;
}
const BLANK_ITEM = (): SuppItemDraft => ({
  catalogItem: null, leadTimeDays: '', unitCost: '', currency: 'USD', minOrderQty: '', isPreferred: false, notes: '',
});

export default function SupplierDetail() {
  const { company, supplierId } = useParams<{ company: string; supplierId: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_grn_manage');
  const { toast } = useToast();
  const id = Number(supplierId);

  const [supplier, setSupplier] = useState<FabSupplier | null>(null);
  // Breadcrumb reads the supplier's name rather than its row id.
  useDetailTitle(supplier?.name);
  const [siItems, setSiItems] = useState<FabSupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('details');

  const [draft, setDraft] = useState<Partial<FabSupplier>>({});
  const set = <K extends keyof FabSupplier>(k: K, v: FabSupplier[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [supRes, itemsRes] = await Promise.all([
        fabQuery<{ data: FabSupplier[] }>('fabErpSupplier', { filters: { id }, pagination: { limit: 1 } }),
        fabQuery<{ data: FabSupplierItem[] }>('fabErpSupplierItem', { filters: { supplierId: id }, orderBy: [{ field: 'catalogItemName', direction: 'asc' }] }),
      ]);
      const sup = supRes.data?.[0] ?? null;
      setSupplier(sup);
      if (sup) setDraft({ ...sup });
      setSiItems(itemsRes.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSupplier() {
    if (!supplier) return;
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpSupplier', 'update', {
        id, name: draft.name ?? supplier.name,
        contact_name: draft.contactName ?? null, phone: draft.phone ?? null,
        email: draft.email ?? null, address: draft.address ?? null, notes: draft.notes ?? null,
      });
      toast('Supplier saved'); fetchAll();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  if (loading) return <DetailSkeleton />;
  if (!supplier) return <Alert severity="error">Supplier not found.</Alert>;

  const header = (
    <Box>
      <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => navigate(`/${company}/fab_erp/suppliers`)} sx={{ color: 'var(--c-text-2)', ml: -1, mb: 1.5 }}>
        Suppliers
      </Button>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 600, color: 'var(--c-text)' }}>{supplier.name}</Typography>
        <Mono chip>{supplier.code}</Mono>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
        <FactItem label="Contact" value={supplier.contactName ?? '—'} />
        <FactItem label="Phone" value={supplier.phone ?? '—'} />
        <FactItem label="Email" value={supplier.email ?? '—'} />
      </Box>
    </Box>
  );

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2, maxWidth: 1100, mx: 'auto' }} onClose={() => setError('')}>{error}</Alert>}
      <DetailLayout
        maxWidth={1100}
        header={header}
        tabs={[{ value: 'details', label: 'Details' }, { value: 'items', label: 'Items', count: siItems.length }]}
        active={tab}
        onTab={setTab}
      >
        {tab === 'details' ? (
          <Surface e={1} sx={{ p: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Name" size="small" value={draft.name ?? ''} disabled={!canManage} onChange={(e) => set('name', e.target.value)} />
              <TextField label="Code" size="small" value={supplier.code} disabled helperText="Auto-generated" />
              <TextField label="Contact name" size="small" value={draft.contactName ?? ''} disabled={!canManage} onChange={(e) => set('contactName', e.target.value)} />
              <TextField label="Phone" size="small" value={draft.phone ?? ''} disabled={!canManage} onChange={(e) => set('phone', e.target.value)} />
              <TextField label="Email" size="small" value={draft.email ?? ''} disabled={!canManage} onChange={(e) => set('email', e.target.value)} />
            </Box>
            <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
            <TextField label="Address" size="small" fullWidth multiline minRows={3} value={draft.address ?? ''} disabled={!canManage} onChange={(e) => set('address', e.target.value)} sx={{ mb: 2 }} />
            <TextField label="Notes" size="small" fullWidth multiline minRows={2} value={draft.notes ?? ''} disabled={!canManage} onChange={(e) => set('notes', e.target.value)} />
            {canManage && (
              <Box sx={{ mt: 2.5 }}>
                <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} disabled={saving} onClick={saveSupplier}>
                  Save changes
                </Button>
              </Box>
            )}
          </Surface>
        ) : (
          <SupplierItemsTab supplierId={id} items={siItems} canManage={canManage} company={company!} onRefresh={fetchAll} toast={toast} setError={setError} />
        )}
      </DetailLayout>
    </Box>
  );
}

function SupplierItemsTab({ supplierId, items, canManage, company, onRefresh, toast, setError }: {
  supplierId: number; items: FabSupplierItem[]; canManage: boolean; company: string;
  onRefresh: () => void; toast: (m: string) => void; setError: (m: string) => void;
}) {
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [catalogInput, setCatalogInput] = useState('');
  const [addDraft, setAddDraft] = useState<SuppItemDraft>(BLANK_ITEM());
  const [adding, setAdding] = useState(false);
  const [editItem, setEditItem] = useState<FabSupplierItem | null>(null);
  const [editDraft, setEditDraft] = useState<SuppItemDraft>(BLANK_ITEM());
  const [editSaving, setEditSaving] = useState(false);
  const [delItem, setDelItem] = useState<FabSupplierItem | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editDebRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editCatInput, setEditCatInput] = useState('');
  const [editCatOpts, setEditCatOpts] = useState<CatalogOption[]>([]);

  const setAdd = <K extends keyof SuppItemDraft>(k: K, v: SuppItemDraft[K]) => setAddDraft((d) => ({ ...d, [k]: v }));
  const setEdit = <K extends keyof SuppItemDraft>(k: K, v: SuppItemDraft[K]) => setEditDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (!catalogInput.trim()) { setCatalogOptions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', { filters: { name: catalogInput.trim() }, pagination: { limit: 50 } });
        setCatalogOptions(res.data ?? []);
      } catch { /* ignore */ }
    }, 200);
  }, [catalogInput]);

  useEffect(() => {
    if (!editCatInput.trim()) { setEditCatOpts([]); return; }
    if (editDebRef.current) clearTimeout(editDebRef.current);
    editDebRef.current = setTimeout(async () => {
      try {
        const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', { filters: { name: editCatInput.trim() }, pagination: { limit: 50 } });
        setEditCatOpts(res.data ?? []);
      } catch { /* ignore */ }
    }, 200);
  }, [editCatInput]);

  function openEdit(item: FabSupplierItem) {
    setEditDraft({
      catalogItem: { id: item.catalogItemId, name: item.catalogItemName ?? '', code: item.catalogItemCode ?? '' },
      leadTimeDays: item.leadTimeDays != null ? String(item.leadTimeDays) : '',
      unitCost: item.unitCost != null ? String(item.unitCost) : '',
      currency: item.currency ?? 'USD',
      minOrderQty: item.minOrderQty != null ? String(item.minOrderQty) : '',
      isPreferred: item.isPreferred === 1,
      notes: item.notes ?? '',
    });
    setEditCatInput(item.catalogItemName ?? '');
    setEditItem(item);
  }

  async function addItem() {
    if (!addDraft.catalogItem) return;
    setAdding(true);
    try {
      await fabMutate('fabErpSupplierItem', 'insert', {
        supplier_id: supplierId, catalog_item_id: addDraft.catalogItem.id,
        lead_time_days: addDraft.leadTimeDays ? Number(addDraft.leadTimeDays) : null,
        unit_cost: addDraft.unitCost ? Number(addDraft.unitCost) : null,
        currency: addDraft.currency || null,
        min_order_qty: addDraft.minOrderQty ? Number(addDraft.minOrderQty) : null,
        is_preferred: addDraft.isPreferred ? 1 : 0, notes: addDraft.notes || null,
      });
      setAddDraft(BLANK_ITEM()); setCatalogInput('');
      toast('Item added'); onRefresh();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Add failed');
    } finally { setAdding(false); }
  }

  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true);
    try {
      await fabMutate('fabErpSupplierItem', 'update', {
        id: editItem.id, catalog_item_id: editDraft.catalogItem?.id ?? editItem.catalogItemId,
        lead_time_days: editDraft.leadTimeDays ? Number(editDraft.leadTimeDays) : null,
        unit_cost: editDraft.unitCost ? Number(editDraft.unitCost) : null,
        currency: editDraft.currency || null,
        min_order_qty: editDraft.minOrderQty ? Number(editDraft.minOrderQty) : null,
        is_preferred: editDraft.isPreferred ? 1 : 0, notes: editDraft.notes || null,
      });
      setEditItem(null); toast('Saved'); onRefresh();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setEditSaving(false); }
  }

  async function deleteItem(item: FabSupplierItem) {
    try { await fabMutate('fabErpSupplierItem', 'delete', { id: item.id }); setDelItem(null); toast('Item removed'); onRefresh(); }
    catch (e) { setError((e as Error).message); }
  }


  return (
    <Box>
      {canManage && (
        <Surface e={1} sx={{ p: 2, mb: 2 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>
            Add supplier item
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Autocomplete
              sx={{ flex: '2 1 220px' }}
              options={catalogOptions}
              getOptionLabel={(o) => `${o.name} (${o.code})`}
              value={addDraft.catalogItem}
              inputValue={catalogInput}
              onInputChange={(_, v) => setCatalogInput(v)}
              onChange={(_, v) => setAdd('catalogItem', v)}
              filterOptions={(x) => x}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label="Catalog item" size="small" />}
            />
            <TextField label="Lead time (days)" size="small" type="number" value={addDraft.leadTimeDays} sx={{ flex: '0 1 130px' }} onChange={(e) => setAdd('leadTimeDays', e.target.value)} />
            <TextField label="Unit cost" size="small" type="number" value={addDraft.unitCost} sx={{ flex: '0 1 110px' }} onChange={(e) => setAdd('unitCost', e.target.value)} />
            <TextField label="Currency" size="small" value={addDraft.currency} sx={{ flex: '0 1 90px' }} onChange={(e) => setAdd('currency', e.target.value)} />
            <TextField label="Min order qty" size="small" type="number" value={addDraft.minOrderQty} sx={{ flex: '0 1 120px' }} onChange={(e) => setAdd('minOrderQty', e.target.value)} />
            <FormControlLabel control={<Checkbox size="small" checked={addDraft.isPreferred} onChange={(e) => setAdd('isPreferred', e.target.checked)} />} label="Preferred" />
            <TextField label="Notes" size="small" value={addDraft.notes} sx={{ flex: '2 1 160px' }} onChange={(e) => setAdd('notes', e.target.value)} />
            <Button variant="contained" startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />} disabled={adding || !addDraft.catalogItem} onClick={addItem}>
              Add
            </Button>
          </Box>
        </Surface>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Inventory2Rounded />} title="No items linked to this supplier yet" />
      ) : (
        <DataTable
          rows={items}
          getRowId={(i) => i.id}
          storageKey="supplier-items"
          exportName="supplier-items"
          defaultSortKey="catalogItemName"
          columns={[
            {
              key: 'catalogItemName',
              header: 'Item',
              render: (i) => (
                <Link component={RouterLink} to={`/${company}/fab_erp/item-catalog/${i.catalogItemId}`} sx={{ color: 'var(--c-primary-700)', textDecorationColor: 'var(--c-primary-200)' }}>
                  {i.catalogItemName ?? '—'}
                </Link>
              ),
              sortValue: (i) => i.catalogItemName ?? '',
            },
            { key: 'catalogItemCode', header: 'Code', width: 140, render: (i) => (i.catalogItemCode ? <Mono chip>{i.catalogItemCode}</Mono> : '—'), sortValue: (i) => i.catalogItemCode ?? '' },
            { key: 'leadTimeDays', header: 'Lead time', width: 120, numeric: true, render: (i) => (i.leadTimeDays != null ? <Mono tabular>{i.leadTimeDays}d</Mono> : <Mono sx={{ color: 'var(--c-text-3)' }}>—</Mono>), sortValue: (i) => i.leadTimeDays ?? null },
            { key: 'unitCost', header: 'Unit cost', width: 120, numeric: true, render: (i) => <NumberCell value={i.unitCost} />, sortValue: (i) => i.unitCost ?? null },
            { key: 'currency', header: 'Currency', width: 100, render: (i) => i.currency ?? '—', sortValue: (i) => i.currency ?? '' },
            { key: 'minOrderQty', header: 'Min qty', width: 110, numeric: true, render: (i) => <NumberCell value={i.minOrderQty} />, sortValue: (i) => i.minOrderQty ?? null },
            {
              key: 'isPreferred',
              header: 'Preferred',
              width: 110,
              align: 'center',
              render: (i) => (i.isPreferred === 1
                ? <StarRounded fontSize="small" sx={{ color: 'var(--c-warning-600)' }} titleAccess="Preferred supplier for this item" />
                : <StarBorderRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} titleAccess="Not preferred" />),
              // Preferred first — it's the row a buyer looks for.
              sortValue: (i) => (i.isPreferred === 1 ? 0 : 1),
              exportValue: (i) => (i.isPreferred === 1 ? 'preferred' : ''),
            },
            {
              key: 'notes',
              header: 'Notes',
              render: (i) => (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {i.notes ?? '—'}
                </Typography>
              ),
              sortValue: (i) => i.notes ?? '',
            },
          ]}
          rowActions={canManage ? (item) => (
            <>
              <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(item)} aria-label={`Edit ${item.catalogItemName ?? 'item'}`}><EditRounded fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Remove"><IconButton size="small" color="error" onClick={() => setDelItem(item)} aria-label={`Remove ${item.catalogItemName ?? 'item'}`}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
            </>
          ) : undefined}
        />
      )}

      <Dialog open={!!editItem} onClose={() => setEditItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Edit supplier item</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Autocomplete
            options={editCatOpts}
            getOptionLabel={(o) => `${o.name} (${o.code})`}
            value={editDraft.catalogItem}
            inputValue={editCatInput}
            onInputChange={(_, v) => setEditCatInput(v)}
            onChange={(_, v) => setEdit('catalogItem', v)}
            filterOptions={(x) => x}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} label="Catalog item" size="small" />}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="Lead time (days)" size="small" type="number" value={editDraft.leadTimeDays} onChange={(e) => setEdit('leadTimeDays', e.target.value)} />
            <TextField label="Unit cost" size="small" type="number" value={editDraft.unitCost} onChange={(e) => setEdit('unitCost', e.target.value)} />
            <TextField label="Currency" size="small" value={editDraft.currency} onChange={(e) => setEdit('currency', e.target.value)} />
            <TextField label="Min order qty" size="small" type="number" value={editDraft.minOrderQty} onChange={(e) => setEdit('minOrderQty', e.target.value)} />
          </Box>
          <FormControlLabel control={<Checkbox size="small" checked={editDraft.isPreferred} onChange={(e) => setEdit('isPreferred', e.target.checked)} />} label="Preferred supplier for this item" />
          <TextField label="Notes" size="small" fullWidth multiline minRows={2} value={editDraft.notes} onChange={(e) => setEdit('notes', e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditItem(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editSaving}>
            {editSaving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!delItem} onClose={() => setDelItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Remove supplier item</DialogTitle>
        <DialogContent><Typography>Remove <strong>{delItem?.catalogItemName}</strong> from this supplier?</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDelItem(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delItem && deleteItem(delItem)}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
