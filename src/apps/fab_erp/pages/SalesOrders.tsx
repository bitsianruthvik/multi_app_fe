import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, Paper, Snackbar,
  Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon            from '@mui/icons-material/Add';
import DeleteIcon         from '@mui/icons-material/Delete';
import EditIcon           from '@mui/icons-material/Edit';
import ReceiptIcon        from '@mui/icons-material/Receipt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import { fabQuery, fabMutate, fabPost } from '../api/client';
import { usePermission }       from '@core/hooks/usePermission';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerName?: string; customerPoRef?: string; supplierRef?: string;
  plantId?: number; plantName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

// ── Per-type config: sub-types, statuses, badge colour ────────────────────────
const ORDER_TYPE_CONFIG: Record<string, {
  label:     string;
  subtypes:  string[];
  statuses:  string[];
  chipColor: 'default' | 'primary' | 'secondary' | 'info' | 'warning' | 'error' | 'success';
}> = {
  sales: {
    label: 'Sales Order',
    subtypes: ['standard', 'rush', 'blanket', 'internal'],
    statuses: ['draft', 'confirmed', 'in_production', 'shipped', 'closed', 'cancelled'],
    chipColor: 'primary',
  },
  manufacturing: {
    label: 'Manufacturing Order',
    subtypes: ['standard', 'rework', 'repair'],
    statuses: ['draft', 'released', 'in_progress', 'completed', 'cancelled'],
    chipColor: 'secondary',
  },
  purchase: {
    label: 'Purchase Order',
    subtypes: ['standard', 'urgent'],
    statuses: ['draft', 'sent', 'confirmed', 'received', 'closed', 'cancelled'],
    chipColor: 'info',
  },
  planned: {
    label: 'Planned Order',
    subtypes: ['forecast', 'mrp'],
    statuses: ['draft', 'confirmed', 'converted', 'cancelled'],
    chipColor: 'warning',
  },
  subcontract: {
    label: 'Subcontract Order',
    subtypes: ['standard'],
    statuses: ['draft', 'sent', 'confirmed', 'in_progress', 'received', 'closed', 'cancelled'],
    chipColor: 'error',
  },
  transfer: {
    label: 'Transfer Order',
    subtypes: ['inter_plant', 'inter_warehouse'],
    statuses: ['draft', 'in_transit', 'received', 'cancelled'],
    chipColor: 'success',
  },
};

const ORDER_TYPE_KEYS = Object.keys(ORDER_TYPE_CONFIG);
const ALL_PRIORITIES  = ['critical', 'high', 'medium', 'low'];

const TABS = [
  { value: 'all',           label: 'All' },
  { value: 'sales',         label: 'Sales' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'purchase',      label: 'Purchase' },
  { value: 'planned',       label: 'Planned' },
  { value: 'subcontract',   label: 'Subcontract' },
  { value: 'transfer',      label: 'Transfer' },
];

function statusColor(s: string): 'default' | 'primary' | 'warning' | 'success' | 'info' | 'error' {
  switch (s) {
    case 'confirmed':
    case 'released':      return 'primary';
    case 'in_production':
    case 'in_progress':
    case 'in_transit':    return 'warning';
    case 'shipped':
    case 'received':
    case 'completed':
    case 'converted':     return 'success';
    case 'closed':
    case 'sent':          return 'info';
    case 'cancelled':     return 'error';
    default:              return 'default';
  }
}

// ── Draft ─────────────────────────────────────────────────────────────────────
interface OrderDraft {
  orderNumber: string; orderType: string; type: string; status: string;
  customerName: string; customerPoRef: string; supplierRef: string;
  priority: string; requiredDate: string; confirmedDate: string;
}

const BLANK = (orderType = 'sales'): OrderDraft => ({
  orderNumber: '', orderType,
  type:        ORDER_TYPE_CONFIG[orderType]?.subtypes[0] ?? 'standard',
  status:      'draft',
  customerName: '', customerPoRef: '', supplierRef: '',
  priority: '', requiredDate: '', confirmedDate: '',
});

// ── OrderDialog ───────────────────────────────────────────────────────────────
function OrderDialog({ open, initial, defaultOrderType, onClose, onSaved }: {
  open: boolean; initial: FabOrder | null;
  defaultOrderType?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !initial;
  const [draft,  setDraft]  = useState<OrderDraft>(BLANK());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    setDraft(initial ? {
      orderNumber:   initial.orderNumber,
      orderType:     initial.orderType,
      type:          initial.type ?? '',
      status:        initial.status,
      customerName:  initial.customerName  ?? '',
      customerPoRef: initial.customerPoRef ?? '',
      supplierRef:   initial.supplierRef   ?? '',
      priority:      initial.priority ?? '',
      requiredDate:  initial.requiredDate?.slice(0, 10)  ?? '',
      confirmedDate: initial.confirmedDate?.slice(0, 10) ?? '',
    } : BLANK(defaultOrderType ?? 'sales'));
  }, [open, initial, defaultOrderType]);

  const set = (k: keyof OrderDraft, v: string) =>
    setDraft((d) => {
      const next = { ...d, [k]: v };
      if (k === 'orderType') {
        const cfg = ORDER_TYPE_CONFIG[v];
        next.type   = cfg?.subtypes[0] ?? 'standard';
        next.status = 'draft';
      }
      return next;
    });

  const cfg = ORDER_TYPE_CONFIG[draft.orderType];
  const showCustomer = ['sales'].includes(draft.orderType);
  const showSupplier = ['purchase', 'subcontract'].includes(draft.orderType);

  async function save() {
    if (!draft.orderNumber.trim()) { setErr('Order Number is required.'); return; }
    if (!draft.orderType)          { setErr('Order Type is required.');   return; }
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        order_number:    draft.orderNumber.trim(),
        order_type:      draft.orderType,
        type:            draft.type    || null,
        status:          draft.status,
        customer_name:   draft.customerName.trim()  || null,
        customer_po_ref: draft.customerPoRef.trim() || null,
        supplier_ref:    draft.supplierRef.trim()   || null,
        priority:        draft.priority || null,
        required_date:   draft.requiredDate  || null,
        confirmed_date:  draft.confirmedDate || null,
      };
      if (isNew) await fabMutate('fabErpOrder', 'insert', payload);
      else       await fabMutate('fabErpOrder', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e: any) { setErr(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Order' : `Edit — ${initial?.orderNumber}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>

          <TextField label="Order Number *" value={draft.orderNumber} size="small" autoFocus
            onChange={(e) => set('orderNumber', e.target.value)} />

          <TextField select label="Order Type *" value={draft.orderType} size="small"
            onChange={(e) => set('orderType', e.target.value)} disabled={!isNew}>
            {ORDER_TYPE_KEYS.map((t) => (
              <MenuItem key={t} value={t}>{ORDER_TYPE_CONFIG[t].label}</MenuItem>
            ))}
          </TextField>

          {cfg && (
            <TextField select label="Sub-type" value={draft.type} size="small"
              onChange={(e) => set('type', e.target.value)}>
              {cfg.subtypes.map((t) => (
                <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>
              ))}
            </TextField>
          )}

          <TextField select label="Status" value={draft.status} size="small"
            onChange={(e) => set('status', e.target.value)}>
            {(cfg?.statuses ?? ['draft']).map((s) => (
              <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>
            ))}
          </TextField>

          <TextField select label="Priority" value={draft.priority} size="small"
            onChange={(e) => set('priority', e.target.value)}>
            <MenuItem value="">— none —</MenuItem>
            {ALL_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>

          {showCustomer && (<>
            <TextField label="Customer Name" value={draft.customerName} size="small"
              onChange={(e) => set('customerName', e.target.value)} />
            <TextField label="Customer PO Ref" value={draft.customerPoRef} size="small"
              onChange={(e) => set('customerPoRef', e.target.value)} />
          </>)}

          {showSupplier && (
            <TextField label="Supplier Ref" value={draft.supplierRef} size="small"
              onChange={(e) => set('supplierRef', e.target.value)} />
          )}

          <TextField label="Required Date" value={draft.requiredDate} size="small" type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => set('requiredDate', e.target.value)} />
          <TextField label="Confirmed Date" value={draft.confirmedDate} size="small" type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => set('confirmedDate', e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.orderNumber.trim()}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── DeleteDialog ──────────────────────────────────────────────────────────────
function DeleteDialog({ order, onClose, onDeleted }: {
  order: FabOrder | null; onClose: () => void; onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!order) return;
    setBusy(true);
    try { await fabMutate('fabErpOrder', 'delete', { id: order.id }); onDeleted(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={!!order} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Order</DialogTitle>
      <DialogContent>
        <Typography>Delete <strong>{order?.orderNumber}</strong>? This cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── FirmDialog ────────────────────────────────────────────────────────────────
function FirmDialog({ order, onClose, onFirmed }: {
  order: FabOrder | null; onClose: () => void; onFirmed: (woNumber: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState('');
  async function confirm() {
    if (!order) return;
    setBusy(true); setErr('');
    try {
      const res = await fabPost<{ orderNumber: string }>(`orders/${order.id}/firm`, {});
      onFirmed(res.orderNumber);
    } catch (e: any) {
      setErr(e.response?.data?.message ?? e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!order} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Firm Planned Order</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Typography gutterBottom>
          Convert <strong>{order?.orderNumber}</strong> into a manufacturing work order?
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The order will be locked from MRP changes and scheduled immediately.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="success" onClick={confirm} disabled={busy}
          startIcon={busy ? <CircularProgress size={14} /> : <CheckCircleOutlineIcon />}>
          Firm Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Summary line per order type ───────────────────────────────────────────────
function orderSummary(o: FabOrder): string {
  if (o.orderType === 'sales')    return o.customerName || 'No customer';
  if (o.orderType === 'purchase' || o.orderType === 'subcontract')
    return o.supplierRef ? `Ref: ${o.supplierRef}` : 'No supplier ref';
  return ORDER_TYPE_CONFIG[o.orderType]?.label ?? o.orderType;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Orders() {
  const canManage   = usePermission('fab_erp_projects_manage');
  const navigate    = useNavigate();
  const { company } = useParams<{ company: string }>();

  const [tab,       setTab]       = useState('all');
  const [orders,    setOrders]    = useState<FabOrder[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [toast,     setToast]     = useState('');
  const [dlg,       setDlg]       = useState<{ open: boolean; order: FabOrder | null }>({ open: false, order: null });
  const [delOrder,  setDelOrder]  = useState<FabOrder | null>(null);
  const [firmOrder, setFirmOrder] = useState<FabOrder | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const filters = tab === 'all' ? {} : { orderType: tab };
      const res = await fabQuery<{ data: FabOrder[] }>('fabErpOrder', {
        filters,
        orderBy:    [{ field: 'createdAt', direction: 'desc' }],
        pagination: { limit: 500 },
      });
      setOrders(res.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function onSaved()   { setDlg({ open: false, order: null }); setToast('Saved.');   fetchAll(); }
  function onDeleted() { setDelOrder(null);                     setToast('Deleted.'); fetchAll(); }
  function onFirmed(woNumber: string) {
    setFirmOrder(null);
    setToast(`Firmed → ${woNumber} (scheduling started)`);
    fetchAll();
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Orders</Typography>
          <Typography variant="body2" color="text.secondary">
            Sales, manufacturing, purchase, planned, subcontract and transfer orders — all in one place
          </Typography>
        </Box>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => setDlg({ open: true, order: null })}>
            New Order
          </Button>
        )}
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} />)}
      </Tabs>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : orders.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <ReceiptIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" gutterBottom>
            No {tab === 'all' ? '' : (ORDER_TYPE_CONFIG[tab]?.label ?? tab) + ' '}orders yet.
          </Typography>
          {canManage && (
            <Button variant="contained" startIcon={<AddIcon />} sx={{ mt: 1 }}
              onClick={() => setDlg({ open: true, order: null })}>
              Create First Order
            </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {orders.map((o) => {
            const cfg = ORDER_TYPE_CONFIG[o.orderType];
            return (
              <Paper key={o.id} variant="outlined"
                sx={{ px: 2, py: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => navigate(`/${company}/fab_erp/orders/${o.id}`)}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="body2"
                    sx={{ fontFamily: 'monospace', bgcolor: 'action.selected', px: 0.75, py: 0.25, borderRadius: 0.5, whiteSpace: 'nowrap' }}>
                    {o.orderNumber}
                  </Typography>
                  <Chip
                    label={cfg?.label ?? o.orderType}
                    size="small" color={cfg?.chipColor ?? 'default'} variant="outlined"
                    sx={{ fontSize: '0.65rem', height: 20 }}
                  />
                  <Typography fontWeight={700} sx={{ flex: 1 }}>
                    {orderSummary(o)}
                  </Typography>
                  {o.type && <Chip label={o.type.replace(/_/g, ' ')} size="small" variant="outlined" />}
                  <Chip label={o.status.replace(/_/g, ' ')} size="small" color={statusColor(o.status)} />
                  {canManage && (<>
                    {o.orderType === 'planned' && o.status === 'draft' && (
                      <Tooltip title="Firm Order — convert to Manufacturing Work Order">
                        <IconButton size="small" color="success"
                          onClick={(e) => { e.stopPropagation(); setFirmOrder(o); }}>
                          <CheckCircleOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDlg({ open: true, order: o }); }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelOrder(o); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>)}
                </Box>
                <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {o.requiredDate ? `Required: ${o.requiredDate.slice(0, 10)}` : 'No required date'}
                    {o.confirmedDate ? ` → Confirmed: ${o.confirmedDate.slice(0, 10)}` : ''}
                  </Typography>
                  {o.plantName && (
                    <Typography variant="caption" color="text.secondary">Plant: {o.plantName}</Typography>
                  )}
                  {o.priority && (
                    <Typography variant="caption" color="text.secondary">Priority: {o.priority}</Typography>
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <OrderDialog
        open={dlg.open} initial={dlg.order}
        defaultOrderType={tab === 'all' ? 'sales' : tab}
        onClose={() => setDlg({ open: false, order: null })}
        onSaved={onSaved}
      />
      <DeleteDialog order={delOrder} onClose={() => setDelOrder(null)} onDeleted={onDeleted} />
      <FirmDialog order={firmOrder} onClose={() => setFirmOrder(null)} onFirmed={onFirmed} />
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
