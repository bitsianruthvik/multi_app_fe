import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ViewKanbanRounded from '@mui/icons-material/ViewKanbanRounded';
import ViewListRounded from '@mui/icons-material/ViewListRounded';

import { fabQuery, fabMutate, fabPost } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, FilterBar, FacetChip, PipelineBoard, PipelineCard, type PipelineStage,
  EntityList, EntityRow, StatusBadge, Mono, EmptyState, ListSkeleton, useToast,
} from '../components';
import { statusFamily } from '../statusMap';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerId?: number; customerName?: string; customerPoRef?: string;
  supplierId?: number; supplierName?: string; supplierRef?: string;
  plantId?: number; plantName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

interface PickerOption { id: number; name: string; code: string }

const ORDER_TYPE_CONFIG: Record<string, { label: string; subtypes: string[]; statuses: string[] }> = {
  sales:         { label: 'Sales Order',       subtypes: ['standard', 'rush', 'blanket', 'internal'],                  statuses: ['draft', 'confirmed', 'in_production', 'shipped', 'closed', 'cancelled'] },
  manufacturing: { label: 'Manufacturing Order',subtypes: ['standard', 'rework', 'repair'],                            statuses: ['draft', 'released', 'in_progress', 'completed', 'cancelled'] },
  purchase:      { label: 'Purchase Order',     subtypes: ['standard', 'urgent'],                                      statuses: ['draft', 'sent', 'confirmed', 'received', 'closed', 'cancelled'] },
  planned:       { label: 'Planned Order',      subtypes: ['forecast', 'mrp'],                                         statuses: ['draft', 'confirmed', 'converted', 'cancelled'] },
  subcontract:   { label: 'Subcontract Order',  subtypes: ['standard'],                                                statuses: ['draft', 'sent', 'confirmed', 'in_progress', 'received', 'closed', 'cancelled'] },
  transfer:      { label: 'Transfer Order',     subtypes: ['inter_plant', 'inter_warehouse'],                          statuses: ['draft', 'in_transit', 'received', 'cancelled'] },
};
const ORDER_TYPE_KEYS = Object.keys(ORDER_TYPE_CONFIG);
const ALL_PRIORITIES = ['critical', 'high', 'medium', 'low'];

const TYPE_FACETS = [
  { value: 'all', label: 'All' },
  { value: 'sales', label: 'Sales' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'planned', label: 'Planned' },
  { value: 'subcontract', label: 'Subcontract' },
  { value: 'transfer', label: 'Transfer' },
];

// ── Lifecycle pipeline (DESIGN_SYSTEM.md §4.4 + §5.1 board accents) ──
const STAGES: PipelineStage[] = [
  { key: 'capture',    label: 'Capture',       accent: '#D97706' },
  { key: 'confirmed',  label: 'Confirmed',     accent: '#0284C7' },
  { key: 'scheduled',  label: 'Scheduled',     accent: '#7C3AED' },
  { key: 'production', label: 'In production',  accent: '#DB5A2C' },
  { key: 'done',       label: 'Closed',        accent: '#0E9F6E' },
];
function stageOf(status: string): string {
  if (status === 'draft') return 'capture';
  if (status === 'confirmed' || status === 'sent') return 'confirmed';
  if (status === 'released' || status === 'scheduled') return 'scheduled';
  if (['in_production', 'in_progress', 'in_transit'].includes(status)) return 'production';
  return 'done';
}

function orderSummary(o: FabOrder): string {
  if (o.orderType === 'sales') return o.customerName || 'No customer';
  if (o.orderType === 'purchase' || o.orderType === 'subcontract')
    return o.supplierName || (o.supplierRef ? `Ref: ${o.supplierRef}` : 'No supplier');
  return ORDER_TYPE_CONFIG[o.orderType]?.label ?? o.orderType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs (functionally unchanged; inherit the violet MUI theme)
// ─────────────────────────────────────────────────────────────────────────────
interface OrderDraft {
  orderNumber: string; orderType: string; type: string; status: string;
  customerId: number | null; customerPoRef: string;
  supplierId: number | null; supplierRef: string;
  priority: string; requiredDate: string; confirmedDate: string;
}
const BLANK = (orderType = 'sales'): OrderDraft => ({
  orderNumber: '', orderType,
  type: ORDER_TYPE_CONFIG[orderType]?.subtypes[0] ?? 'standard',
  status: 'draft', customerId: null, customerPoRef: '', supplierId: null, supplierRef: '',
  priority: '', requiredDate: '', confirmedDate: '',
});

function OrderDialog({ open, initial, defaultOrderType, onClose, onSaved }: {
  open: boolean; initial: FabOrder | null; defaultOrderType?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !initial;
  const [draft, setDraft] = useState<OrderDraft>(BLANK());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [customers, setCustomers] = useState<PickerOption[]>([]);
  const [suppliers, setSuppliers] = useState<PickerOption[]>([]);

  useEffect(() => {
    if (!open) return;
    fabQuery<{ data: PickerOption[] }>('fabErpCustomer', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } })
      .then((res) => setCustomers(res.data ?? [])).catch(() => setCustomers([]));
    fabQuery<{ data: PickerOption[] }>('fabErpSupplier', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } })
      .then((res) => setSuppliers(res.data ?? [])).catch(() => setSuppliers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setDraft(initial ? {
      orderNumber: initial.orderNumber, orderType: initial.orderType, type: initial.type ?? '',
      status: initial.status, customerId: initial.customerId ?? null, customerPoRef: initial.customerPoRef ?? '',
      supplierId: initial.supplierId ?? null, supplierRef: initial.supplierRef ?? '', priority: initial.priority ?? '',
      requiredDate: initial.requiredDate?.slice(0, 10) ?? '', confirmedDate: initial.confirmedDate?.slice(0, 10) ?? '',
    } : BLANK(defaultOrderType ?? 'sales'));
  }, [open, initial, defaultOrderType]);

  const set = <K extends keyof OrderDraft>(k: K, v: OrderDraft[K]) =>
    setDraft((d) => {
      const next = { ...d, [k]: v };
      if (k === 'orderType') {
        const cfg = ORDER_TYPE_CONFIG[v as string];
        next.type = cfg?.subtypes[0] ?? 'standard';
        next.status = 'draft';
      }
      return next;
    });

  const cfg = ORDER_TYPE_CONFIG[draft.orderType];
  const showCustomer = ['sales'].includes(draft.orderType);
  const showSupplier = ['purchase', 'subcontract'].includes(draft.orderType);
  const customerMissing = showCustomer && !draft.customerId;
  const supplierMissing = showSupplier && !draft.supplierId;

  async function save() {
    if (!draft.orderNumber.trim()) { setErr('Order number is required.'); return; }
    if (customerMissing) { setErr('Customer is required for sales orders.'); return; }
    if (supplierMissing) { setErr('Supplier is required for purchase/subcontract orders.'); return; }
    setSaving(true); setErr('');
    try {
      const selectedCustomer = customers.find((c) => c.id === draft.customerId);
      const payload: Record<string, unknown> = {
        order_number: draft.orderNumber.trim(), order_type: draft.orderType, type: draft.type || null,
        status: draft.status, customer_id: draft.customerId, customer_name: selectedCustomer?.name ?? null,
        customer_po_ref: draft.customerPoRef.trim() || null,
        supplier_id: draft.supplierId, supplier_ref: draft.supplierRef.trim() || null,
        priority: draft.priority || null, required_date: draft.requiredDate || null,
        confirmed_date: draft.confirmedDate || null,
      };
      if (isNew) await fabMutate('fabErpOrder', 'insert', payload);
      else await fabMutate('fabErpOrder', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setErr(ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New order' : `Edit — ${initial?.orderNumber}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Order number *" value={draft.orderNumber} size="small" autoFocus
            onChange={(e) => set('orderNumber', e.target.value)} />
          <TextField select label="Order type *" value={draft.orderType} size="small"
            onChange={(e) => set('orderType', e.target.value)} disabled={!isNew}>
            {ORDER_TYPE_KEYS.map((t) => <MenuItem key={t} value={t}>{ORDER_TYPE_CONFIG[t].label}</MenuItem>)}
          </TextField>
          {cfg && (
            <TextField select label="Sub-type" value={draft.type} size="small"
              onChange={(e) => set('type', e.target.value)}>
              {cfg.subtypes.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
            </TextField>
          )}
          <TextField select label="Status" value={draft.status} size="small"
            onChange={(e) => set('status', e.target.value)}>
            {(cfg?.statuses ?? ['draft']).map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TextField select label="Priority" value={draft.priority} size="small"
            onChange={(e) => set('priority', e.target.value)}>
            <MenuItem value="">— none —</MenuItem>
            {ALL_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
          {showCustomer && (<>
            <Autocomplete
              options={customers}
              getOptionLabel={(o) => `${o.code} — ${o.name}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={customers.find((c) => c.id === draft.customerId) ?? null}
              onChange={(_, v) => set('customerId', v?.id ?? null)}
              renderInput={(params) => (
                <TextField {...params} label="Customer *" size="small" error={customerMissing} helperText={customerMissing ? 'Required' : ' '} />
              )}
            />
            <TextField label="Customer PO ref" value={draft.customerPoRef} size="small"
              onChange={(e) => set('customerPoRef', e.target.value)} />
          </>)}
          {showSupplier && (<>
            <Autocomplete
              options={suppliers}
              getOptionLabel={(o) => `${o.code} — ${o.name}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={suppliers.find((s) => s.id === draft.supplierId) ?? null}
              onChange={(_, v) => set('supplierId', v?.id ?? null)}
              renderInput={(params) => (
                <TextField {...params} label="Supplier *" size="small" error={supplierMissing} helperText={supplierMissing ? 'Required' : ' '} />
              )}
            />
            <TextField label="Supplier ref" value={draft.supplierRef} size="small"
              onChange={(e) => set('supplierRef', e.target.value)} />
          </>)}
          <TextField label="Required date" value={draft.requiredDate} size="small" type="date"
            slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => set('requiredDate', e.target.value)} />
          <TextField label="Confirmed date" value={draft.confirmedDate} size="small" type="date"
            slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => set('confirmedDate', e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.orderNumber.trim() || customerMissing || supplierMissing}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ order, onClose, onDeleted }: { order: FabOrder | null; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!order) return;
    setBusy(true);
    try { await fabMutate('fabErpOrder', 'delete', { id: order.id }); onDeleted(); }
    catch { /* ignore */ } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!order} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Delete order</DialogTitle>
      <DialogContent>
        <Typography>Delete <strong>{order?.orderNumber}</strong>? This cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function FirmDialog({ order, onClose, onFirmed }: { order: FabOrder | null; onClose: () => void; onFirmed: (wo: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function confirm() {
    if (!order) return;
    setBusy(true); setErr('');
    try {
      const res = await fabPost<{ orderNumber: string }>(`orders/${order.id}/firm`, {});
      onFirmed(res.orderNumber);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setErr(ax.response?.data?.message ?? ax.message ?? 'Firm failed');
    } finally { setBusy(false); }
  }
  return (
    <Dialog open={!!order} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Firm planned order</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Typography gutterBottom>Convert <strong>{order?.orderNumber}</strong> into a manufacturing work order?</Typography>
        <Typography variant="body2" color="text.secondary">
          The order will be locked from MRP changes and scheduled immediately.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="success" onClick={confirm} disabled={busy}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleOutlineIcon />}>
          Firm order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── View toggle (Board | List) ──
function ViewToggle({ view, onChange }: { view: 'board' | 'list'; onChange: (v: 'board' | 'list') => void }) {
  return (
    <Box sx={{ display: 'inline-flex', p: '3px', borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
      {([['board', ViewKanbanRounded, 'Board'], ['list', ViewListRounded, 'List']] as const).map(([key, Icon, label]) => {
        const on = view === key;
        return (
          <Box
            key={key}
            component="button"
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={on}
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.25, height: 28,
              border: 'none', borderRadius: 'calc(var(--r-sm) - 2px)', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500,
              background: on ? 'var(--c-surface)' : 'transparent',
              color: on ? 'var(--c-primary-700)' : 'var(--c-text-2)',
              boxShadow: on ? 'var(--e-1)' : 'none',
              transition: 'all var(--t-fast) var(--ease)',
              '& svg': { fontSize: 16 },
            }}
          >
            <Icon /> {label}
          </Box>
        );
      })}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function Orders() {
  const canManage = usePermission('fab_erp_projects_manage');
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const { toast } = useToast();

  const [view, setView] = useState<'board' | 'list'>('board');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<FabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState<{ open: boolean; order: FabOrder | null }>({ open: false, order: null });
  const [delOrder, setDelOrder] = useState<FabOrder | null>(null);
  const [firmOrder, setFirmOrder] = useState<FabOrder | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabOrder[] }>('fabErpOrder', {
        orderBy: [{ field: 'createdAt', direction: 'desc' }],
        pagination: { limit: 500 },
      });
      setOrders(res.data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (typeFilter !== 'all' && o.orderType !== typeFilter) return false;
      if (!q) return true;
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        (o.customerName ?? '').toLowerCase().includes(q) ||
        (o.supplierRef ?? '').toLowerCase().includes(q)
      );
    });
  }, [orders, typeFilter, search]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.orderType] = (c[o.orderType] ?? 0) + 1;
    return c;
  }, [orders]);

  const cardsByStage = useMemo(() => {
    const map: Record<string, React.ReactNode[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const o of filtered) {
      const key = stageOf(o.status);
      const accent = STAGES.find((s) => s.key === key)?.accent ?? '#5A5E78';
      map[key].push(
        <PipelineCard key={o.id} accent={accent} onClick={() => navigate(`/${company}/fab_erp/orders/${o.id}`)}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
            <Mono chip>{o.orderNumber}</Mono>
            {canManage && o.orderType === 'planned' && o.status === 'draft' && (
              <Tooltip title="Firm — convert to work order">
                <IconButton size="small" color="success"
                  onClick={(e) => { e.stopPropagation(); setFirmOrder(o); }}>
                  <CheckCircleOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {orderSummary(o)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
              {ORDER_TYPE_CONFIG[o.orderType]?.label.replace(' Order', '') ?? o.orderType}
            </Typography>
            <StatusBadge status={o.status} family={statusFamily(o.status)} />
          </Box>
          {o.requiredDate && (
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mt: 0.75, fontFamily: 'var(--font-mono)' }}>
              due {o.requiredDate.slice(0, 10)}
            </Typography>
          )}
        </PipelineCard>,
      );
    }
    return map;
  }, [filtered, canManage, company, navigate]);

  const newOrder = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, order: null })}>
      New order
    </Button>
  ) : null;

  return (
    <Box>
      <PageHeader
        title="Orders"
        subtitle="Sales, manufacturing, purchase, planned, subcontract and transfer — across their lifecycle."
        actions={<>
          <ViewToggle view={view} onChange={setView} />
          {newOrder}
        </>}
      />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search order #, customer, supplier ref…">
        {TYPE_FACETS.map((f) => (
          <FacetChip key={f.value} label={f.label} count={typeCounts[f.value] ?? 0}
            active={typeFilter === f.value} onClick={() => setTypeFilter(f.value)} />
        ))}
      </FilterBar>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ReceiptLongRounded />}
          title={`No ${typeFilter === 'all' ? '' : (ORDER_TYPE_CONFIG[typeFilter]?.label ?? typeFilter) + ' '}orders${search ? ' match your search' : ' yet'}`}
          hint={search ? 'Try a different search or clear the filter.' : 'Create your first order to start the production flow.'}
          action={newOrder ?? undefined}
        />
      ) : view === 'board' ? (
        <PipelineBoard stages={STAGES} cardsByStage={cardsByStage} />
      ) : (
        <EntityList>
          {filtered.map((o) => (
            <EntityRow
              key={o.id}
              code={<Mono chip>{o.orderNumber}</Mono>}
              primary={orderSummary(o)}
              secondary={
                <Box component="span" sx={{ display: 'inline-flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <span>{ORDER_TYPE_CONFIG[o.orderType]?.label ?? o.orderType}</span>
                  {o.requiredDate && <span>Required {o.requiredDate.slice(0, 10)}</span>}
                  {o.priority && <span>Priority: {o.priority}</span>}
                </Box>
              }
              trailing={<StatusBadge status={o.status} family={statusFamily(o.status)} />}
              onClick={() => navigate(`/${company}/fab_erp/orders/${o.id}`)}
              actions={canManage ? (<>
                {o.orderType === 'planned' && o.status === 'draft' && (
                  <Tooltip title="Firm order"><IconButton size="small" color="success" onClick={() => setFirmOrder(o)}><CheckCircleOutlineIcon fontSize="small" /></IconButton></Tooltip>
                )}
                <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg({ open: true, order: o })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelOrder(o)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
              </>) : undefined}
            />
          ))}
        </EntityList>
      )}

      <OrderDialog
        open={dlg.open} initial={dlg.order}
        defaultOrderType={typeFilter === 'all' ? 'sales' : typeFilter}
        onClose={() => setDlg({ open: false, order: null })}
        onSaved={() => { setDlg({ open: false, order: null }); toast('Order saved'); fetchAll(); }}
      />
      <DeleteDialog order={delOrder} onClose={() => setDelOrder(null)}
        onDeleted={() => { setDelOrder(null); toast('Order deleted'); fetchAll(); }} />
      <FirmDialog order={firmOrder} onClose={() => setFirmOrder(null)}
        onFirmed={(wo) => { setFirmOrder(null); toast(`Firmed → ${wo} · scheduling started`); fetchAll(); }} />
    </Box>
  );
}
