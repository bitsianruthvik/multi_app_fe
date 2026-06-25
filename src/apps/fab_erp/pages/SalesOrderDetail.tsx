import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  MenuItem,
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
import SaveIcon      from '@mui/icons-material/Save';
import AddIcon       from '@mui/icons-material/Add';

import { fabQuery, fabMutate } from '../api/client';
import type { FabPlant }       from '../types';
import { usePermission }       from '@core/hooks/usePermission';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerName?: string; customerPoRef?: string; plantId?: number; plantName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string; currency?: string;
  paymentTerms?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

interface FabOrderLine {
  id: number; companyId: number; orderId: number; lineNo: number; catalogItemId: number;
  qty: number; unit?: string; unitPrice?: number; discount?: number;
  targetPlantId?: number; requestedDate?: string; notes?: string;
  catalogItemName?: string; catalogItemCode?: string; catalogItemUnit?: string;
  targetPlantName?: string; createdAt: string; updatedAt: string; deletedAt: string | null;
}

interface CatalogOption { id: number; name: string; code: string; unit?: string; }

const SO_TYPES     = ['standard', 'rush', 'blanket', 'internal'];
const SO_STATUSES  = ['draft', 'confirmed', 'in_production', 'shipped', 'closed', 'cancelled'];
const SO_PRIORITIES = ['critical', 'high', 'medium', 'low'];

export default function SalesOrderDetail() {
  const { company, soId } = useParams<{ company: string; soId: string }>();
  const navigate           = useNavigate();
  const canManage          = usePermission('fab_erp_projects_manage');
  const id                 = Number(soId);

  const [so,      setSo]      = useState<FabOrder | null>(null);
  const [items,   setItems]   = useState<FabOrderLine[]>([]);
  const [plants,  setPlants]  = useState<FabPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState('');
  const [tab,     setTab]     = useState(0);

  const [draft, setDraft] = useState<Partial<FabOrder>>({});
  const set = <K extends keyof FabOrder>(k: K, v: FabOrder[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [soRes, itemsRes, plantsRes] = await Promise.all([
        fabQuery<{ data: FabOrder[] }>('fabErpOrder', {
          filters: { id }, pagination: { limit: 1 },
        }),
        fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', {
          filters: { orderId: id },
          orderBy: [{ field: 'lineNo', direction: 'asc' }],
        }),
        fabQuery<{ data: FabPlant[] }>('fabErpPlant', {
          orderBy: [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 200 },
        }),
      ]);
      const record = soRes.data?.[0] ?? null;
      setSo(record);
      if (record) setDraft({ ...record });
      setItems(itemsRes.data ?? []);
      setPlants(plantsRes.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSo() {
    if (!so) return;
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpOrder', 'update', {
        id,
        order_number:        draft.orderNumber        ?? so.orderNumber,
        order_type:          'sales',
        type:                draft.type               ?? so.type,
        status:              draft.status             ?? so.status,
        priority:            draft.priority           ?? null,
        customer_name:       draft.customerName       ?? null,
        customer_po_ref:     draft.customerPoRef      ?? null,
        required_date:       draft.requiredDate       ?? null,
        confirmed_date:      draft.confirmedDate      ?? null,
        scheduled_ship_date: draft.scheduledShipDate  ?? null,
        plant_id:            draft.plantId            ?? null,
        currency:            draft.currency           ?? null,
        payment_terms:       draft.paymentTerms       ?? null,
        mrp_controller:      draft.mrpController      ?? null,
        notes:               draft.notes              ?? null,
      });
      setToast('Saved.');
      fetchAll();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
  if (!so)     return <Box sx={{ p: 3 }}><Alert severity="error">Sales Order not found.</Alert></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_erp/orders`)}>
          Orders
        </Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{so.orderNumber}</Typography>
        <Chip label={so.status.replace(/_/g, ' ')} size="small" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Overview" />
        <Tab label={`Line Items (${items.length})`} />
      </Tabs>

      {tab === 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>Identity</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
            <TextField label="Order Number" size="small" value={draft.orderNumber ?? ''} disabled={!canManage}
              onChange={(e) => set('orderNumber', e.target.value)} />
            <TextField select label="Type" size="small" value={draft.type ?? ''} disabled={!canManage}
              onChange={(e) => set('type', e.target.value)}>
              {SO_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </TextField>
            <TextField select label="Status" size="small" value={draft.status ?? ''} disabled={!canManage}
              onChange={(e) => set('status', e.target.value)}>
              {SO_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField select label="Priority" size="small" value={draft.priority ?? ''} disabled={!canManage}
              onChange={(e) => set('priority', e.target.value)}>
              <MenuItem value="">— none —</MenuItem>
              {SO_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField label="Customer Name" size="small" value={draft.customerName ?? ''} disabled={!canManage}
              onChange={(e) => set('customerName', e.target.value)} />
            <TextField label="Customer PO Ref" size="small" value={draft.customerPoRef ?? ''} disabled={!canManage}
              onChange={(e) => set('customerPoRef', e.target.value)} />
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>Dates</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 3 }}>
            <TextField label="Required Date" size="small" type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={draft.requiredDate?.slice(0, 10) ?? ''} disabled={!canManage}
              onChange={(e) => set('requiredDate', e.target.value)} />
            <TextField label="Confirmed Date" size="small" type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={draft.confirmedDate?.slice(0, 10) ?? ''} disabled={!canManage}
              onChange={(e) => set('confirmedDate', e.target.value)} />
            <TextField label="Scheduled Ship Date" size="small" type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={draft.scheduledShipDate?.slice(0, 10) ?? ''} disabled={!canManage}
              onChange={(e) => set('scheduledShipDate', e.target.value)} />
          </Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>Production</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
            <TextField select label="Plant" size="small" value={draft.plantId ?? ''} disabled={!canManage}
              onChange={(e) => set('plantId', e.target.value === '' ? undefined : Number(e.target.value) as any)}>
              <MenuItem value="">— none —</MenuItem>
              {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            <TextField label="Currency" size="small" value={draft.currency ?? ''} disabled={!canManage}
              onChange={(e) => set('currency', e.target.value)} />
            <TextField label="Payment Terms" size="small" value={draft.paymentTerms ?? ''} disabled={!canManage}
              onChange={(e) => set('paymentTerms', e.target.value)} />
            <TextField label="MRP Controller" size="small" value={draft.mrpController ?? ''} disabled={!canManage}
              onChange={(e) => set('mrpController', e.target.value)} />
          </Box>
          <Divider sx={{ my: 2 }} />
          <TextField label="Notes" size="small" fullWidth multiline minRows={3}
            value={draft.notes ?? ''} disabled={!canManage}
            onChange={(e) => set('notes', e.target.value)} />
          {canManage && (
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
                disabled={saving} onClick={saveSo}>
                Save
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {tab === 1 && (
        <LineItemsTab
          soId={id} items={items} plants={plants} canManage={canManage} company={company!}
          onRefresh={fetchAll}
          setToast={setToast}
          setError={setError}
        />
      )}

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}

function LineItemsTab({ soId, items, plants, canManage, company, onRefresh, setToast, setError }: {
  soId: number;
  items: FabOrderLine[];
  plants: FabPlant[];
  canManage: boolean;
  company: string;
  onRefresh: () => void;
  setToast: (m: string) => void;
  setError: (m: string) => void;
}) {
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [catalogInput,   setCatalogInput]   = useState('');
  const [selectedItem,   setSelectedItem]   = useState<CatalogOption | null>(null);
  const [qty,            setQty]            = useState('');
  const [unitPrice,      setUnitPrice]      = useState('');
  const [targetPlantId,  setTargetPlantId]  = useState<number | ''>('');
  const [reqDate,        setReqDate]        = useState('');
  const [adding,         setAdding]         = useState(false);
  const [delItem,        setDelItem]        = useState<FabOrderLine | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadCatalog(search = '') {
    try {
      const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
        filters: search ? { name: search } : undefined,
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 50 },
      });
      setCatalogOptions(res.data ?? []);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadCatalog(catalogInput.trim()), 200);
  }, [catalogInput]);

  async function addItem() {
    if (!selectedItem || !qty) return;
    setAdding(true);
    try {
      await fabMutate('fabErpOrderLine', 'insert', {
        order_id:         soId,
        catalog_item_id:  selectedItem.id,
        qty:              Number(qty),
        unit:             selectedItem.unit ?? null,
        unit_price:       unitPrice ? Number(unitPrice) : null,
        target_plant_id:  targetPlantId || null,
        requested_date:   reqDate || null,
      });
      setSelectedItem(null); setCatalogInput(''); setQty('');
      setUnitPrice(''); setTargetPlantId(''); setReqDate('');
      setToast('Line item added.');
      onRefresh();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setAdding(false); }
  }

  async function deleteItem(item: FabOrderLine) {
    try {
      await fabMutate('fabErpOrderLine', 'delete', { id: item.id });
      setDelItem(null); setToast('Deleted.'); onRefresh();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <Box>
      {canManage && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Add Line Item</Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Autocomplete
              sx={{ flex: '2 1 220px' }}
              options={catalogOptions}
              getOptionLabel={(o) => `${o.name}${o.code ? ` (${o.code})` : ''}`}
              value={selectedItem}
              inputValue={catalogInput}
              onOpen={() => loadCatalog(catalogInput.trim())}
              onInputChange={(_, v) => setCatalogInput(v)}
              onChange={(_, v) => setSelectedItem(v)}
              filterOptions={(x) => x}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box>
                    <Typography variant="body2">{o.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{o.code}</Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Catalog Item" size="small" />}
            />
            <TextField label="Qty" size="small" type="number" value={qty} sx={{ flex: '0 1 80px' }}
              onChange={(e) => setQty(e.target.value)} />
            <TextField label="Unit Price" size="small" type="number" value={unitPrice} sx={{ flex: '0 1 110px' }}
              onChange={(e) => setUnitPrice(e.target.value)} />
            <TextField select label="Target Plant" size="small" value={targetPlantId} sx={{ flex: '1 1 160px' }}
              onChange={(e) => setTargetPlantId(e.target.value === '' ? '' : Number(e.target.value))}>
              <MenuItem value="">— none —</MenuItem>
              {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            <TextField label="Requested Date" size="small" type="date"
              slotProps={{ inputLabel: { shrink: true } }}
              value={reqDate} sx={{ flex: '0 1 150px' }}
              onChange={(e) => setReqDate(e.target.value)} />
            <Button variant="contained" startIcon={adding ? <CircularProgress size={14} /> : <AddIcon />}
              disabled={adding || !selectedItem || !qty} onClick={addItem}>
              Add
            </Button>
          </Box>
        </Paper>
      )}

      {items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No line items yet.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 100 }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 80 }} align="right">Qty</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 60 }}>Unit</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 110 }} align="right">Unit Price</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 120 }}>Req. Date</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 130 }}>Target Plant</TableCell>
                {canManage && <TableCell sx={{ width: 48 }} />}
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
                  <TableCell align="right">{item.qty}</TableCell>
                  <TableCell>{item.unit ?? item.catalogItemUnit ?? '—'}</TableCell>
                  <TableCell align="right">{item.unitPrice != null ? item.unitPrice : '—'}</TableCell>
                  <TableCell>{item.requestedDate?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>{item.targetPlantName ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell>
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

      <Dialog open={!!delItem} onClose={() => setDelItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Line Item</DialogTitle>
        <DialogContent>
          <Typography>Remove <strong>{delItem?.catalogItemName}</strong> from this order?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelItem(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delItem && deleteItem(delItem)}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
