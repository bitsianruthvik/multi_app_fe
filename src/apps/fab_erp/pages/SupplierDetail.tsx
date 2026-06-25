import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  Paper,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon    from '@mui/icons-material/Delete';
import EditIcon      from '@mui/icons-material/Edit';
import SaveIcon      from '@mui/icons-material/Save';
import AddIcon       from '@mui/icons-material/Add';
import StarIcon      from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';

import { fabQuery, fabMutate } from '../api/client';
import { usePermission }       from '@core/hooks/usePermission';

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

interface CatalogOption { id: number; name: string; code: string; unit?: string; }

interface SuppItemDraft {
  catalogItem: CatalogOption | null;
  leadTimeDays: string;
  unitCost: string;
  currency: string;
  minOrderQty: string;
  isPreferred: boolean;
  notes: string;
}

const BLANK_ITEM = (): SuppItemDraft => ({
  catalogItem: null, leadTimeDays: '', unitCost: '', currency: 'USD',
  minOrderQty: '', isPreferred: false, notes: '',
});

export default function SupplierDetail() {
  const { company, supplierId } = useParams<{ company: string; supplierId: string }>();
  const navigate                 = useNavigate();
  const canManage                = usePermission('fab_erp_grn_manage');
  const id                       = Number(supplierId);

  const [supplier, setSupplier] = useState<FabSupplier | null>(null);
  const [siItems,  setSiItems]  = useState<FabSupplierItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [toast,    setToast]    = useState('');
  const [tab,      setTab]      = useState(0);

  const [draft, setDraft] = useState<Partial<FabSupplier>>({});
  const set = <K extends keyof FabSupplier>(k: K, v: FabSupplier[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [supRes, itemsRes] = await Promise.all([
        fabQuery<{ data: FabSupplier[] }>('fabErpSupplier', {
          filters: { id }, pagination: { limit: 1 },
        }),
        fabQuery<{ data: FabSupplierItem[] }>('fabErpSupplierItem', {
          filters: { supplierId: id },
          orderBy: [{ field: 'catalogItemName', direction: 'asc' }],
        }),
      ]);
      const sup = supRes.data?.[0] ?? null;
      setSupplier(sup);
      if (sup) setDraft({ ...sup });
      setSiItems(itemsRes.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSupplier() {
    if (!supplier) return;
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpSupplier', 'update', {
        id,
        name:         draft.name         ?? supplier.name,
        code:         draft.code         ?? supplier.code,
        contact_name: draft.contactName  ?? null,
        phone:        draft.phone        ?? null,
        email:        draft.email        ?? null,
        address:      draft.address      ?? null,
        notes:        draft.notes        ?? null,
      });
      setToast('Saved.');
      fetchAll();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (!supplier) return <Box sx={{ p: 3 }}><Alert severity="error">Supplier not found.</Alert></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_erp/grn`)}>
          Suppliers
        </Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{supplier.name}</Typography>
        <Chip label={supplier.code} variant="outlined" sx={{ fontFamily: 'monospace' }} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Details" />
        <Tab label={`Items (${siItems.length})`} />
      </Tabs>

      {tab === 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="Name" size="small" value={draft.name ?? ''} disabled={!canManage}
              onChange={(e) => set('name', e.target.value)} />
            <TextField label="Code" size="small" value={draft.code ?? ''} disabled={!canManage}
              onChange={(e) => set('code', e.target.value)} />
            <TextField label="Contact Name" size="small" value={draft.contactName ?? ''} disabled={!canManage}
              onChange={(e) => set('contactName', e.target.value)} />
            <TextField label="Phone" size="small" value={draft.phone ?? ''} disabled={!canManage}
              onChange={(e) => set('phone', e.target.value)} />
            <TextField label="Email" size="small" value={draft.email ?? ''} disabled={!canManage}
              onChange={(e) => set('email', e.target.value)} />
          </Box>
          <Divider sx={{ my: 2 }} />
          <TextField label="Address" size="small" fullWidth multiline minRows={3}
            value={draft.address ?? ''} disabled={!canManage}
            onChange={(e) => set('address', e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField label="Notes" size="small" fullWidth multiline minRows={2}
            value={draft.notes ?? ''} disabled={!canManage}
            onChange={(e) => set('notes', e.target.value)}
          />
          {canManage && (
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
                disabled={saving} onClick={saveSupplier}>
                Save
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {tab === 1 && (
        <SupplierItemsTab
          supplierId={id} items={siItems} canManage={canManage} company={company!}
          onRefresh={fetchAll} setToast={setToast} setError={setError}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}

function SupplierItemsTab({ supplierId, items, canManage, company, onRefresh, setToast, setError }: {
  supplierId: number;
  items: FabSupplierItem[];
  canManage: boolean;
  company: string;
  onRefresh: () => void;
  setToast: (m: string) => void;
  setError: (m: string) => void;
}) {
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [catalogInput,   setCatalogInput]   = useState('');
  const [addDraft,       setAddDraft]       = useState<SuppItemDraft>(BLANK_ITEM());
  const [adding,         setAdding]         = useState(false);

  const [editItem,  setEditItem]  = useState<FabSupplierItem | null>(null);
  const [editDraft, setEditDraft] = useState<SuppItemDraft>(BLANK_ITEM());
  const [editSaving,setEditSaving]= useState(false);

  const [delItem, setDelItem] = useState<FabSupplierItem | null>(null);

  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editDebRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editCatInput, setEditCatInput]   = useState('');
  const [editCatOpts,  setEditCatOpts]    = useState<CatalogOption[]>([]);

  const setAdd = <K extends keyof SuppItemDraft>(k: K, v: SuppItemDraft[K]) =>
    setAddDraft((d) => ({ ...d, [k]: v }));
  const setEdit = <K extends keyof SuppItemDraft>(k: K, v: SuppItemDraft[K]) =>
    setEditDraft((d) => ({ ...d, [k]: v }));

  useEffect(() => {
    if (!catalogInput.trim()) { setCatalogOptions([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
          filters: { name: catalogInput.trim() }, pagination: { limit: 50 },
        });
        setCatalogOptions(res.data ?? []);
      } catch { /* ignore */ }
    }, 200);
  }, [catalogInput]);

  useEffect(() => {
    if (!editCatInput.trim()) { setEditCatOpts([]); return; }
    if (editDebRef.current) clearTimeout(editDebRef.current);
    editDebRef.current = setTimeout(async () => {
      try {
        const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
          filters: { name: editCatInput.trim() }, pagination: { limit: 50 },
        });
        setEditCatOpts(res.data ?? []);
      } catch { /* ignore */ }
    }, 200);
  }, [editCatInput]);

  function openEdit(item: FabSupplierItem) {
    setEditDraft({
      catalogItem:  { id: item.catalogItemId, name: item.catalogItemName ?? '', code: item.catalogItemCode ?? '' },
      leadTimeDays: item.leadTimeDays != null ? String(item.leadTimeDays) : '',
      unitCost:     item.unitCost     != null ? String(item.unitCost) : '',
      currency:     item.currency ?? 'USD',
      minOrderQty:  item.minOrderQty  != null ? String(item.minOrderQty) : '',
      isPreferred:  item.isPreferred === 1,
      notes:        item.notes ?? '',
    });
    setEditCatInput(item.catalogItemName ?? '');
    setEditItem(item);
  }

  async function addItem() {
    if (!addDraft.catalogItem) return;
    setAdding(true);
    try {
      await fabMutate('fabErpSupplierItem', 'insert', {
        supplier_id:      supplierId,
        catalog_item_id:  addDraft.catalogItem.id,
        lead_time_days:   addDraft.leadTimeDays  ? Number(addDraft.leadTimeDays)  : null,
        unit_cost:        addDraft.unitCost       ? Number(addDraft.unitCost)       : null,
        currency:         addDraft.currency       || null,
        min_order_qty:    addDraft.minOrderQty    ? Number(addDraft.minOrderQty)   : null,
        is_preferred:     addDraft.isPreferred ? 1 : 0,
        notes:            addDraft.notes || null,
      });
      setAddDraft(BLANK_ITEM()); setCatalogInput('');
      setToast('Item added.'); onRefresh();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setAdding(false); }
  }

  async function saveEdit() {
    if (!editItem) return;
    setEditSaving(true);
    try {
      await fabMutate('fabErpSupplierItem', 'update', {
        id:               editItem.id,
        catalog_item_id:  editDraft.catalogItem?.id ?? editItem.catalogItemId,
        lead_time_days:   editDraft.leadTimeDays ? Number(editDraft.leadTimeDays) : null,
        unit_cost:        editDraft.unitCost      ? Number(editDraft.unitCost)     : null,
        currency:         editDraft.currency      || null,
        min_order_qty:    editDraft.minOrderQty   ? Number(editDraft.minOrderQty)  : null,
        is_preferred:     editDraft.isPreferred ? 1 : 0,
        notes:            editDraft.notes || null,
      });
      setEditItem(null); setToast('Saved.'); onRefresh();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setEditSaving(false); }
  }

  async function deleteItem(item: FabSupplierItem) {
    try {
      await fabMutate('fabErpSupplierItem', 'delete', { id: item.id });
      setDelItem(null); setToast('Deleted.'); onRefresh();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <Box>
      {canManage && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Add Supplier Item</Typography>
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
              renderInput={(params) => <TextField {...params} label="Catalog Item" size="small" />}
            />
            <TextField label="Lead Time (days)" size="small" type="number"
              value={addDraft.leadTimeDays} sx={{ flex: '0 1 130px' }}
              onChange={(e) => setAdd('leadTimeDays', e.target.value)} />
            <TextField label="Unit Cost" size="small" type="number"
              value={addDraft.unitCost} sx={{ flex: '0 1 110px' }}
              onChange={(e) => setAdd('unitCost', e.target.value)} />
            <TextField label="Currency" size="small"
              value={addDraft.currency} sx={{ flex: '0 1 90px' }}
              onChange={(e) => setAdd('currency', e.target.value)} />
            <TextField label="Min Order Qty" size="small" type="number"
              value={addDraft.minOrderQty} sx={{ flex: '0 1 120px' }}
              onChange={(e) => setAdd('minOrderQty', e.target.value)} />
            <FormControlLabel
              control={<Checkbox size="small" checked={addDraft.isPreferred}
                onChange={(e) => setAdd('isPreferred', e.target.checked)} />}
              label="Preferred"
            />
            <TextField label="Notes" size="small"
              value={addDraft.notes} sx={{ flex: '2 1 160px' }}
              onChange={(e) => setAdd('notes', e.target.value)} />
            <Button variant="contained" startIcon={adding ? <CircularProgress size={14} /> : <AddIcon />}
              disabled={adding || !addDraft.catalogItem} onClick={addItem}>
              Add
            </Button>
          </Box>
        </Paper>
      )}

      {items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No items linked to this supplier yet.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 100 }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 110 }} align="right">Lead Time</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 110 }} align="right">Unit Cost</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 70 }}>Currency</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 110 }} align="right">Min Qty</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 80 }} align="center">Preferred</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                {canManage && <TableCell sx={{ width: 80 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Link component={RouterLink}
                      to={`/${company}/fab_erp/item-catalog/${item.catalogItemId}`}>
                      {item.catalogItemName ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {item.catalogItemCode && (
                      <Chip label={item.catalogItemCode} size="small" variant="outlined"
                        sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {item.leadTimeDays != null ? `${item.leadTimeDays} days` : '—'}
                  </TableCell>
                  <TableCell align="right">{item.unitCost != null ? item.unitCost : '—'}</TableCell>
                  <TableCell>{item.currency ?? '—'}</TableCell>
                  <TableCell align="right">{item.minOrderQty != null ? item.minOrderQty : '—'}</TableCell>
                  <TableCell align="center">
                    {item.isPreferred === 1
                      ? <StarIcon fontSize="small" color="warning" />
                      : <StarBorderIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                    }
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
                      {item.notes ?? '—'}
                    </Typography>
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(item)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDelItem(item)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={!!editItem} onClose={() => setEditItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Supplier Item</DialogTitle>
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
            renderInput={(params) => <TextField {...params} label="Catalog Item" size="small" />}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="Lead Time (days)" size="small" type="number"
              value={editDraft.leadTimeDays}
              onChange={(e) => setEdit('leadTimeDays', e.target.value)} />
            <TextField label="Unit Cost" size="small" type="number"
              value={editDraft.unitCost}
              onChange={(e) => setEdit('unitCost', e.target.value)} />
            <TextField label="Currency" size="small"
              value={editDraft.currency}
              onChange={(e) => setEdit('currency', e.target.value)} />
            <TextField label="Min Order Qty" size="small" type="number"
              value={editDraft.minOrderQty}
              onChange={(e) => setEdit('minOrderQty', e.target.value)} />
          </Box>
          <FormControlLabel
            control={<Checkbox size="small" checked={editDraft.isPreferred}
              onChange={(e) => setEdit('isPreferred', e.target.checked)} />}
            label="Preferred supplier for this item"
          />
          <TextField label="Notes" size="small" fullWidth multiline minRows={2}
            value={editDraft.notes}
            onChange={(e) => setEdit('notes', e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditItem(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editSaving}>
            {editSaving ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!delItem} onClose={() => setDelItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove Supplier Item</DialogTitle>
        <DialogContent>
          <Typography>Remove <strong>{delItem?.catalogItemName}</strong> from this supplier?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelItem(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delItem && deleteItem(delItem)}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
