import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, Link, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SaveIcon from '@mui/icons-material/SaveRounded';
import AddIcon from '@mui/icons-material/Add';
import FactoryRounded from '@mui/icons-material/FactoryRounded';
import CalendarViewWeekRounded from '@mui/icons-material/CalendarViewWeekRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabPlant } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import {
  Surface, DetailLayout, CrossLink, FactItem, StatusBadge, Mono, EmptyState, useToast,
} from '../components';
import { statusFamily } from '../statusMap';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerName?: string; customerPoRef?: string; plantId?: number; plantName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string; currency?: string; paymentTerms?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}
interface FabOrderLine {
  id: number; companyId: number; orderId: number; lineNo: number; catalogItemId: number;
  qty: number; unit?: string; unitPrice?: number; discount?: number;
  targetPlantId?: number; requestedDate?: string; notes?: string;
  catalogItemName?: string; catalogItemCode?: string; catalogItemUnit?: string;
  targetPlantName?: string; createdAt: string; updatedAt: string; deletedAt: string | null;
}
interface CatalogOption { id: number; name: string; code: string; unit?: string }

const SO_TYPES = ['standard', 'rush', 'blanket', 'internal'];
const SO_STATUSES = ['draft', 'confirmed', 'in_production', 'shipped', 'closed', 'cancelled'];
const SO_PRIORITIES = ['critical', 'high', 'medium', 'low'];

export default function SalesOrderDetail() {
  const { company, soId } = useParams<{ company: string; soId: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_projects_manage');
  const { toast } = useToast();
  const id = Number(soId);
  const go = (p: string) => navigate(`/${company}/fab_erp/${p}`);

  const [so, setSo] = useState<FabOrder | null>(null);
  const [items, setItems] = useState<FabOrderLine[]>([]);
  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [draft, setDraft] = useState<Partial<FabOrder>>({});

  const set = <K extends keyof FabOrder>(k: K, v: FabOrder[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [soRes, itemsRes, plantsRes] = await Promise.all([
        fabQuery<{ data: FabOrder[] }>('fabErpOrder', { filters: { id }, pagination: { limit: 1 } }),
        fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', { filters: { orderId: id }, orderBy: [{ field: 'lineNo', direction: 'asc' }] }),
        fabQuery<{ data: FabPlant[] }>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 } }),
      ]);
      const record = soRes.data?.[0] ?? null;
      setSo(record);
      if (record) setDraft({ ...record });
      setItems(itemsRes.data ?? []);
      setPlants(plantsRes.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveSo() {
    if (!so) return;
    setSaving(true); setError('');
    try {
      await fabMutate('fabErpOrder', 'update', {
        id,
        order_number: draft.orderNumber ?? so.orderNumber,
        order_type: 'sales',
        type: draft.type ?? so.type,
        status: draft.status ?? so.status,
        priority: draft.priority ?? null,
        customer_name: draft.customerName ?? null,
        customer_po_ref: draft.customerPoRef ?? null,
        required_date: draft.requiredDate ?? null,
        confirmed_date: draft.confirmedDate ?? null,
        scheduled_ship_date: draft.scheduledShipDate ?? null,
        plant_id: draft.plantId ?? null,
        currency: draft.currency ?? null,
        payment_terms: draft.paymentTerms ?? null,
        mrp_controller: draft.mrpController ?? null,
        notes: draft.notes ?? null,
      });
      toast('Order saved');
      fetchAll();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  if (loading) {
    return (
      <Surface e={1} sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Surface>
    );
  }
  if (!so) return <Alert severity="error">Order not found.</Alert>;

  const header = (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Button startIcon={<ArrowBackIcon />} size="small" onClick={() => go('orders')} sx={{ color: 'var(--c-text-2)', ml: -1 }}>
          Orders
        </Button>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <Mono sx={{ fontSize: 18, fontWeight: 500, color: 'var(--c-text)' }}>{so.orderNumber}</Mono>
            <StatusBadge status={so.status} family={statusFamily(so.status)} />
          </Box>
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
            {so.customerName || 'No customer'}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
        <FactItem label="Type" value={so.type?.replace(/_/g, ' ') ?? '—'} />
        <FactItem label="Required" value={so.requiredDate ? <Mono>{so.requiredDate.slice(0, 10)}</Mono> : '—'} />
        <FactItem label="Plant" value={so.plantName ?? '—'} />
        <FactItem label="Priority" value={so.priority ?? '—'} />
      </Box>
    </Box>
  );

  const crossLinks = (
    <>
      <CrossLink icon={<Inventory2Rounded />} label="Line items" count={items.length} onClick={() => setTab('lines')} />
      {so.plantId && <CrossLink icon={<FactoryRounded />} label={so.plantName ?? 'Plant'} onClick={() => go('plants')} />}
      <CrossLink icon={<CalendarViewWeekRounded />} label="Scheduler" onClick={() => go('scheduler')} />
    </>
  );

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2, maxWidth: 1100, mx: 'auto' }} onClose={() => setError('')}>{error}</Alert>}
      <DetailLayout
        maxWidth={1100}
        header={header}
        crossLinks={crossLinks}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'lines', label: 'Line items', count: items.length },
        ]}
        active={tab}
        onTab={setTab}
      >
        {tab === 'overview' ? (
          <Surface e={1} sx={{ p: 3 }}>
            <SectionLabel>Identity</SectionLabel>
            <FormGrid cols={2}>
              <TextField label="Order number" size="small" value={draft.orderNumber ?? ''} disabled={!canManage} onChange={(e) => set('orderNumber', e.target.value)} />
              <TextField select label="Type" size="small" value={draft.type ?? ''} disabled={!canManage} onChange={(e) => set('type', e.target.value)}>
                {SO_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField select label="Status" size="small" value={draft.status ?? ''} disabled={!canManage} onChange={(e) => set('status', e.target.value)}>
                {SO_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
              <TextField select label="Priority" size="small" value={draft.priority ?? ''} disabled={!canManage} onChange={(e) => set('priority', e.target.value)}>
                <MenuItem value="">— none —</MenuItem>
                {SO_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
              <TextField label="Customer name" size="small" value={draft.customerName ?? ''} disabled={!canManage} onChange={(e) => set('customerName', e.target.value)} />
              <TextField label="Customer PO ref" size="small" value={draft.customerPoRef ?? ''} disabled={!canManage} onChange={(e) => set('customerPoRef', e.target.value)} />
            </FormGrid>

            <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
            <SectionLabel>Dates</SectionLabel>
            <FormGrid cols={3}>
              <TextField label="Required date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.requiredDate?.slice(0, 10) ?? ''} disabled={!canManage} onChange={(e) => set('requiredDate', e.target.value)} />
              <TextField label="Confirmed date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.confirmedDate?.slice(0, 10) ?? ''} disabled={!canManage} onChange={(e) => set('confirmedDate', e.target.value)} />
              <TextField label="Scheduled ship date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.scheduledShipDate?.slice(0, 10) ?? ''} disabled={!canManage} onChange={(e) => set('scheduledShipDate', e.target.value)} />
            </FormGrid>

            <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
            <SectionLabel>Production</SectionLabel>
            <FormGrid cols={2}>
              <TextField select label="Plant" size="small" value={draft.plantId ?? ''} disabled={!canManage} onChange={(e) => set('plantId', e.target.value === '' ? undefined : (Number(e.target.value) as FabOrder['plantId']))}>
                <MenuItem value="">— none —</MenuItem>
                {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
              <TextField label="Currency" size="small" value={draft.currency ?? ''} disabled={!canManage} onChange={(e) => set('currency', e.target.value)} />
              <TextField label="Payment terms" size="small" value={draft.paymentTerms ?? ''} disabled={!canManage} onChange={(e) => set('paymentTerms', e.target.value)} />
              <TextField label="MRP controller" size="small" value={draft.mrpController ?? ''} disabled={!canManage} onChange={(e) => set('mrpController', e.target.value)} />
            </FormGrid>

            <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
            <TextField label="Notes" size="small" fullWidth multiline minRows={3} value={draft.notes ?? ''} disabled={!canManage} onChange={(e) => set('notes', e.target.value)} />

            {canManage && (
              <Box sx={{ mt: 2.5 }}>
                <Button variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} disabled={saving} onClick={saveSo}>
                  Save changes
                </Button>
              </Box>
            )}
          </Surface>
        ) : (
          <LineItemsTab soId={id} items={items} plants={plants} canManage={canManage} company={company!} onRefresh={fetchAll} toast={toast} setError={setError} />
        )}
      </DetailLayout>
    </Box>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}>
      {children}
    </Typography>
  );
}
function FormGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>{children}</Box>;
}

function LineItemsTab({ soId, items, plants, canManage, company, onRefresh, toast, setError }: {
  soId: number; items: FabOrderLine[]; plants: FabPlant[]; canManage: boolean; company: string;
  onRefresh: () => void; toast: (m: string, t?: 'success' | 'error' | 'info') => void; setError: (m: string) => void;
}) {
  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [catalogInput, setCatalogInput] = useState('');
  const [selectedItem, setSelectedItem] = useState<CatalogOption | null>(null);
  const [qty, setQty] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [targetPlantId, setTargetPlantId] = useState<number | ''>('');
  const [reqDate, setReqDate] = useState('');
  const [adding, setAdding] = useState(false);
  const [delItem, setDelItem] = useState<FabOrderLine | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCatalog = useCallback(async (search = '') => {
    try {
      const res = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
        filters: search ? { name: search } : undefined,
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 50 },
      });
      setCatalogOptions(res.data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadCatalog(catalogInput.trim()), 200);
  }, [catalogInput, loadCatalog]);

  async function addItem() {
    if (!selectedItem || !qty) return;
    setAdding(true);
    try {
      await fabMutate('fabErpOrderLine', 'insert', {
        order_id: soId, catalog_item_id: selectedItem.id, qty: Number(qty),
        unit: selectedItem.unit ?? null, unit_price: unitPrice ? Number(unitPrice) : null,
        target_plant_id: targetPlantId || null, requested_date: reqDate || null,
      });
      setSelectedItem(null); setCatalogInput(''); setQty(''); setUnitPrice(''); setTargetPlantId(''); setReqDate('');
      toast('Line item added'); onRefresh();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Add failed');
    } finally { setAdding(false); }
  }

  async function deleteItem(item: FabOrderLine) {
    try { await fabMutate('fabErpOrderLine', 'delete', { id: item.id }); setDelItem(null); toast('Line item removed'); onRefresh(); }
    catch (e) { setError((e as Error).message); }
  }

  const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
  const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Box>
      {canManage && (
        <Surface e={1} sx={{ p: 2, mb: 2 }}>
          <SectionLabel>Add line item</SectionLabel>
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
              renderInput={(params) => <TextField {...params} label="Catalog item" size="small" />}
            />
            <TextField label="Qty" size="small" type="number" value={qty} sx={{ flex: '0 1 80px' }} onChange={(e) => setQty(e.target.value)} />
            <TextField label="Unit price" size="small" type="number" value={unitPrice} sx={{ flex: '0 1 110px' }} onChange={(e) => setUnitPrice(e.target.value)} />
            <TextField select label="Target plant" size="small" value={targetPlantId} sx={{ flex: '1 1 160px' }} onChange={(e) => setTargetPlantId(e.target.value === '' ? '' : Number(e.target.value))}>
              <MenuItem value="">— none —</MenuItem>
              {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
            <TextField label="Requested date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={reqDate} sx={{ flex: '0 1 150px' }} onChange={(e) => setReqDate(e.target.value)} />
            <Button variant="contained" startIcon={adding ? <CircularProgress size={14} color="inherit" /> : <AddIcon />} disabled={adding || !selectedItem || !qty} onClick={addItem}>
              Add
            </Button>
          </Box>
        </Surface>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Inventory2Rounded />} title="No line items yet" hint="Add catalog items above to build out this order." />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Item</TableCell>
                <TableCell sx={{ ...th, width: 110 }}>Code</TableCell>
                <TableCell sx={{ ...th, width: 80 }} align="right">Qty</TableCell>
                <TableCell sx={{ ...th, width: 60 }}>Unit</TableCell>
                <TableCell sx={{ ...th, width: 110 }} align="right">Unit price</TableCell>
                <TableCell sx={{ ...th, width: 120 }}>Req. date</TableCell>
                <TableCell sx={{ ...th, width: 130 }}>Target plant</TableCell>
                {canManage && <TableCell sx={{ ...th, width: 48 }} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell sx={td}>
                    <Link component={RouterLink} to={`/${company}/fab_erp/item-catalog/${item.catalogItemId}`} sx={{ color: 'var(--c-primary-700)', textDecorationColor: 'var(--c-primary-200)' }}>
                      {item.catalogItemName ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell sx={td}>{item.catalogItemCode ? <Mono chip>{item.catalogItemCode}</Mono> : '—'}</TableCell>
                  <TableCell sx={td} align="right"><Mono tabular>{item.qty}</Mono></TableCell>
                  <TableCell sx={td}>{item.unit ?? item.catalogItemUnit ?? '—'}</TableCell>
                  <TableCell sx={td} align="right">{item.unitPrice != null ? <Mono tabular>{item.unitPrice}</Mono> : '—'}</TableCell>
                  <TableCell sx={td}>{item.requestedDate ? <Mono>{item.requestedDate.slice(0, 10)}</Mono> : '—'}</TableCell>
                  <TableCell sx={td}>{item.targetPlantName ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell sx={td}>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => setDelItem(item)}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}

      <Dialog open={!!delItem} onClose={() => setDelItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Remove line item</DialogTitle>
        <DialogContent>
          <Typography>Remove <strong>{delItem?.catalogItemName}</strong> from this order?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelItem(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => delItem && deleteItem(delItem)}>Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
