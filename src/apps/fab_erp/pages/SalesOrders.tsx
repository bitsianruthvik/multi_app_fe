import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, LinearProgress, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import ViewKanbanRounded from '@mui/icons-material/ViewKanbanRounded';
import ViewListRounded from '@mui/icons-material/ViewListRounded';

import { fabQuery, fabMutate, fabPost } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import {
  PageHeader, FilterBar, FacetChip, PipelineBoard, PipelineCard, type PipelineStage,
  EntityList, EntityRow, StatusBadge, Mono, EmptyState, ListSkeleton, useToast,
  StatStrip, type Stat,
} from '../components';
import { statusFamily } from '../statusMap';
import {
  hasSetupWizard, orderTypeLabel, showsField,
  CREATABLE_ORDER_TYPES, ORDER_TYPE_ORIGIN, ORDER_TYPE_LABELS,
} from '../constants/orderTypes';
import SalesOrderWizard from '../components/SalesOrderWizard';
import { DialogCloseButton } from '../components/FormDialog';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerId?: number; customerName?: string; customerPoRef?: string;
  plantId?: number; plantName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string;
  progressPct?: number;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

interface PickerOption { id: number; name: string; code: string }

/**
 * The order types a person CREATES here. Only sales: a purchase order is raised
 * from a sales order's Procurement tab against a supplier, and a manufacturing
 * order is raised from its Production tab — both are consequences of a sales
 * order, not documents somebody opens this dialog to type in.
 */
const ORDER_TYPE_CONFIG: Record<string, { label: string; subtypes: string[]; statuses: string[] }> = {
  sales:         { label: 'Sales Order',       subtypes: ['standard', 'rush', 'blanket', 'internal'],                  statuses: ['draft', 'confirmed', 'waiting_material', 'in_production', 'ready_to_ship', 'shipped', 'closed', 'cancelled'] },
};
// The creatable set now comes from CREATABLE_ORDER_TYPES in constants/orderTypes.ts,
// which the type-picker screen reads alongside every type's origin copy. This
// held the same list derived from ORDER_TYPE_CONFIG's keys.
const ALL_PRIORITIES = ['critical', 'high', 'medium', 'low'];

// How every type READS — including the two nobody creates by hand — lives in
// constants/orderTypes.ts. "What can be created" and "what can be displayed"
// are different questions, and answering both from ORDER_TYPE_CONFIG meant a
// raised purchase order rendered as the raw string `purchase` on the board.
const typeLabel = orderTypeLabel;

const TYPE_FACETS = [
  { value: 'all', label: 'All' },
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'manufacturing', label: 'Production' },
];

// ── Lifecycle pipeline (DESIGN_SYSTEM.md §4.4 + §5.1 board accents) ──
const STAGES: PipelineStage[] = [
  // Board stage accents come from tokens.css (--c-stage-*), which already
  // defined this exact palette — these were duplicated literals.
  { key: 'capture',    label: 'Capture',       accent: 'var(--c-stage-capture)' },
  { key: 'confirmed',  label: 'Confirmed',     accent: 'var(--c-stage-planned)' },
  // 'Scheduled' used to mean the DAG existed. That is now true the moment a
  // production order is raised and says nothing about whether the shop can
  // start; what a planner needs at this stage is whether it is held up.
  { key: 'scheduled',  label: 'Waiting for material', accent: 'var(--c-stage-scheduled)' },
  { key: 'production', label: 'In production', accent: 'var(--c-stage-production)' },
  { key: 'done',       label: 'Closed',        accent: 'var(--c-stage-shipped)' },
];
/** Stages that mean the order no longer needs attention. */
const CLOSED_STAGES = new Set(['done']);

function stageOf(status: string): string {
  if (status === 'draft') return 'capture';
  if (status === 'confirmed' || status === 'sent') return 'confirmed';
  if (['released', 'scheduled', 'waiting_material'].includes(status)) return 'scheduled';
  if (['in_production', 'in_progress', 'in_transit'].includes(status)) return 'production';
  return 'done';
}

function orderSummary(o: FabOrder): string {
  if (o.orderType === 'sales') return o.customerName || 'No customer';
  return `${typeLabel(o.orderType)} order`;
}

// FEAT-03: task-count production progress bar. Hidden until there's real
// progress (draft/not-started orders stay clean); turns green at 100%.
function OrderProgressBar({ pct, compact = false }: { pct?: number; compact?: boolean }) {
  if (pct == null || pct <= 0) return null;
  const v = Math.min(100, Math.max(0, Math.round(pct)));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: compact ? 0 : 0.75, minWidth: compact ? 92 : undefined }}>
      <LinearProgress
        variant="determinate"
        value={v}
        sx={{
          flex: 1, height: 5, borderRadius: 3, minWidth: compact ? 52 : undefined,
          bgcolor: 'var(--c-surface-3, rgba(120,120,140,0.18))',
          '& .MuiLinearProgress-bar': { bgcolor: v >= 100 ? 'var(--c-success-600)' : 'var(--c-primary-500)' },
        }}
      />
      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums', minWidth: 26, textAlign: 'right' }}>
        {v}%
      </Typography>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs (functionally unchanged; inherit the violet MUI theme)
// ─────────────────────────────────────────────────────────────────────────────
interface OrderDraft {
  orderNumber: string; orderType: string; type: string; status: string;
  customerId: number | null; customerPoRef: string;
  priority: string; requiredDate: string;
}
const BLANK = (orderType = 'sales'): OrderDraft => ({
  orderNumber: '', orderType,
  type: ORDER_TYPE_CONFIG[orderType]?.subtypes[0] ?? 'standard',
  status: 'draft', customerId: null, customerPoRef: '',
  priority: '', requiredDate: '',
});

function OrderDialog({ open, initial, defaultOrderType, onClose, onSaved }: {
  open: boolean; initial: FabOrder | null; defaultOrderType?: string;
  onClose: () => void; onSaved: (orderNumber?: string, newId?: number) => void;
}) {
  const isNew = !initial;
  const [draft, setDraft] = useState<OrderDraft>(BLANK());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [customers, setCustomers] = useState<PickerOption[]>([]);

  useEffect(() => {
    if (!open) return;
    fabQuery<{ data: PickerOption[] }>('fabErpCustomer', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } })
      .then((res) => setCustomers(res.data ?? [])).catch(() => setCustomers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setDraft(initial ? {
      orderNumber: initial.orderNumber, orderType: initial.orderType, type: initial.type ?? '',
      status: initial.status, customerId: initial.customerId ?? null, customerPoRef: initial.customerPoRef ?? '',
      priority: initial.priority ?? '',
      requiredDate: initial.requiredDate?.slice(0, 10) ?? '',
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
  /**
   * Creating is TWO screens: pick the type, then answer that type's questions.
   *
   * Editing is one — the type is already decided and cannot change, so a type
   * screen on the way to fixing a date would be pure ceremony.
   */
  const [phase, setPhase] = useState<'type' | 'fields'>('type');
  useEffect(() => { if (open) setPhase(isNew ? 'type' : 'fields'); }, [open, isNew]);

  /** Which fields this order type asks for. Editing keeps the wider detail set. */
  const asks = (field: string) => showsField(draft.orderType, field, isNew ? 'create' : 'detail');
  const showCustomer = asks('customerId') || asks('customerName');
  const customerMissing = draft.orderType === 'sales' && !draft.customerId;

  async function save() {
    if (!isNew && !draft.orderNumber.trim()) { setErr('Order number is required.'); return; }
    if (customerMissing) { setErr('Customer is required for sales orders.'); return; }
    setSaving(true); setErr('');
    try {
      const selectedCustomer = customers.find((c) => c.id === draft.customerId);

      let orderNumber = draft.orderNumber.trim();
      if (isNew) {
        try {
          const entityType = `${draft.orderType}_order`;
          const codeRes = await fabPost<{ code: string }>('codegen/next-code', { entityType, context: {} });
          orderNumber = codeRes.code;
        } catch {
          setErr('Failed to generate order number. Please try again.');
          setSaving(false);
          return;
        }
      }

      const payload: Record<string, unknown> = {
        order_number: orderNumber, order_type: draft.orderType, type: draft.type || null,
        status: draft.status, customer_id: draft.customerId, customer_name: selectedCustomer?.name ?? null,
        customer_po_ref: draft.customerPoRef.trim() || null,
        priority: draft.priority || null, required_date: draft.requiredDate || null,
      };
      if (isNew) {
        const res = await fabMutate<{ id: number }>('fabErpOrder', 'insert', payload);
        // The id goes back so the caller can open the wizard on the order that
        // was just created — creating an order and then setting it up are one
        // action to the person doing it, not two.
        onSaved(orderNumber, res?.id);
      } else {
        await fabMutate('fabErpOrder', 'update', { id: initial!.id, ...payload });
        onSaved();
      }
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
      setErr(ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle sx={{ fontWeight: 600 }}>
        {!isNew ? `Edit — ${initial?.orderNumber}`
          : phase === 'type' ? 'What kind of order?'
            : `New ${orderTypeLabel(draft.orderType).toLowerCase()} order`}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {phase === 'type' ? (
          /* Every type is listed, not just the creatable one. A screen showing a
             single option reads like something is broken; showing all three with
             where the other two come from answers the question it provokes. */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {Object.keys(ORDER_TYPE_LABELS).map((t) => {
              const creatable = (CREATABLE_ORDER_TYPES as readonly string[]).includes(t);
              const body = (
                <>
                  <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                    {orderTypeLabel(t)} order
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
                    {ORDER_TYPE_ORIGIN[t]}
                  </Typography>
                </>
              );
              /* Same box, two different things. The creatable type is a real
                 <button>, so Tab reaches it and Enter/Space fires it — it used
                 to be a div with onClick, which put the entry point to the whole
                 order flow out of reach of a keyboard entirely.
                 The other two are NOT buttons and must not be: they are here to
                 answer "where do those come from", and rendering them as
                 disabled controls would announce three choices where there is
                 one, then refuse two of them. Prose stays prose. */
              const look = {
                p: 1.75, borderRadius: 'var(--r-md)',
                border: '1px solid var(--c-border)',
                textAlign: 'left' as const,
              };
              return creatable ? (
                <ButtonBase
                  key={t}
                  onClick={() => { set('orderType', t); setPhase('fields'); }}
                  sx={{
                    ...look,
                    display: 'block', width: '100%',
                    background: 'var(--c-surface)',
                    '&:hover': { borderColor: 'var(--c-primary-500)', background: 'var(--c-surface-2)' },
                    '&:focus-visible': {
                      borderColor: 'var(--c-primary-500)',
                      outline: '2px solid var(--c-primary-500)',
                      outlineOffset: 2,
                    },
                  }}
                >
                  {body}
                </ButtonBase>
              ) : (
                <Box
                  key={t}
                  sx={{ ...look, background: 'var(--c-surface-2)', opacity: 0.65 }}
                >
                  {body}
                </Box>
              );
            })}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {asks('orderNumber') && (
              <TextField label="Order number" value={draft.orderNumber} size="small"
                slotProps={{ input: { readOnly: true } }} />
            )}
            {asks('type') && cfg && (
              <TextField select label="Sub-type" value={draft.type} size="small"
                onChange={(e) => set('type', e.target.value)}>
                {cfg.subtypes.map((t) => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            )}
            {/* Status is not asked when creating — a new order is a draft by
                definition, and offering the full lifecycle invited someone to
                create an order already marked 'shipped'. */}
            {asks('status') && (
              <TextField select label="Status" value={draft.status} size="small"
                onChange={(e) => set('status', e.target.value)}>
                {(cfg?.statuses ?? ['draft']).map((s) => <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>)}
              </TextField>
            )}
            {asks('priority') && (
              <TextField select label="Priority" value={draft.priority} size="small"
                onChange={(e) => set('priority', e.target.value)}>
                <MenuItem value="">— none —</MenuItem>
                {ALL_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
            )}
            {showCustomer && (
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
            )}
            {asks('customerPoRef') && (
              <TextField label="Customer PO ref" value={draft.customerPoRef} size="small"
                onChange={(e) => set('customerPoRef', e.target.value)} />
            )}
            {/* No "Confirmed date" here. It is stamped by the server when the
                order actually moves to 'confirmed' — asking for it up front
                invited a date typed before the thing it records had happened.
                Corrections still live on the order's Overview tab. */}
            {asks('requiredDate') && (
              <TextField label="Required date" value={draft.requiredDate} size="small" type="date"
                slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => set('requiredDate', e.target.value)} />
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {phase === 'fields' && isNew && (
          <Button onClick={() => setPhase('type')}>Back</Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        {phase === 'fields' && (
          <Button variant="contained" onClick={save} disabled={saving || (!isNew && !draft.orderNumber.trim()) || customerMissing}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
          </Button>
        )}
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
      <DialogCloseButton absolute onClose={() => onClose()} />
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
  /** The order whose setup wizard is open, if any. */
  const [wizard, setWizard] = useState<{ id: number; number?: string } | null>(null);

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
        (o.customerPoRef ?? '').toLowerCase().includes(q)
      );
    });
  }, [orders, typeFilter, search]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.orderType] = (c[o.orderType] ?? 0) + 1;
    return c;
  }, [orders]);

  /**
   * Header metrics, derived from the rows already loaded — no extra request.
   * These describe the *filtered* set so the numbers always agree with the
   * board below; a strip that ignores the active filter is worse than none.
   */
  const stats: Stat[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const open = filtered.filter((o) => !CLOSED_STAGES.has(stageOf(o.status)));
    const overdue = open.filter((o) => o.requiredDate && new Date(o.requiredDate) < today);
    const inProduction = filtered.filter((o) => stageOf(o.status) === 'production');
    return [
      { label: 'Shown', value: filtered.length },
      { label: 'Open', value: open.length, tone: 'info' },
      { label: 'Overdue', value: overdue.length, tone: overdue.length ? 'danger' : 'default' },
      { label: 'In production', value: inProduction.length, tone: inProduction.length ? 'success' : 'default' },
    ];
  }, [filtered]);

  const cardsByStage = useMemo(() => {
    const map: Record<string, React.ReactNode[]> = {};
    for (const s of STAGES) map[s.key] = [];
    for (const o of filtered) {
      const key = stageOf(o.status);
      const accent = STAGES.find((s) => s.key === key)?.accent ?? 'var(--c-neutral-600)';
      map[key].push(
        <PipelineCard key={o.id} accent={accent} onClick={() => navigate(`/${company}/fab_erp/orders/${o.id}`)}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
            <Mono chip>{o.orderNumber}</Mono>
          </Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)', mb: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {orderSummary(o)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
              {typeLabel(o.orderType)}
            </Typography>
            <StatusBadge status={o.status} family={statusFamily(o.status)} />
          </Box>
          <OrderProgressBar pct={o.progressPct} />
          {o.requiredDate && (
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mt: 0.75, fontFamily: 'var(--font-mono)' }}>
              due {o.requiredDate.slice(0, 10)}
            </Typography>
          )}
          {/* A draft SALES order is one part-way through its wizard, so the
              wizard is one click from the board — the whole point of being able
              to close it is being able to get back in without hunting. A draft
              purchase or production order is not mid-wizard, it is simply not
              approved yet, which is why hasSetupWizard gates this.
              stopPropagation because the card itself navigates to the order. */}
          {o.status === 'draft' && hasSetupWizard(o.orderType) && canManage && (
            <Button
              size="small" variant="outlined" fullWidth
              sx={{ mt: 1, fontSize: 11.5, py: 0.25 }}
              startIcon={<PlayArrowRounded sx={{ fontSize: 14 }} />}
              onClick={(e) => { e.stopPropagation(); setWizard({ id: o.id, number: o.orderNumber }); }}
            >
              Continue setup
            </Button>
          )}
        </PipelineCard>,
      );
    }
    return map;
  }, [filtered, company, navigate, canManage]);

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

      {!loading && orders.length > 0 && <StatStrip stats={stats} />}

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
          title={`No ${typeFilter === 'all' ? '' : typeLabel(typeFilter) + ' '}orders${search ? ' match your search' : ' yet'}`}
          // BUG-14: don't tell users to "create an order" when they lack the
          // permission to (the action button is null for non-manage roles).
          hint={search
            ? 'Try a different search or clear the filter.'
            : canManage
              ? 'Create your first order to start the production flow.'
              : 'No orders yet. You don’t have permission to create one — ask an administrator.'}
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
                  <span>{typeLabel(o.orderType)} order</span>
                  {o.requiredDate && <span>Required {o.requiredDate.slice(0, 10)}</span>}
                  {o.priority && <span>Priority: {o.priority}</span>}
                </Box>
              }
              trailing={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <OrderProgressBar pct={o.progressPct} compact />
                  <StatusBadge status={o.status} family={statusFamily(o.status)} />
                </Box>
              }
              onClick={() => navigate(`/${company}/fab_erp/orders/${o.id}`)}
              actions={canManage ? (<>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg({ open: true, order: o })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelOrder(o)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
              </>) : undefined}
            />
          ))}
        </EntityList>
      )}

      <OrderDialog
        open={dlg.open} initial={dlg.order}
        // Always sales — the facet may be filtered to Purchase or Production,
        // but neither is a thing this dialog can create (see ORDER_TYPE_CONFIG).
        defaultOrderType="sales"
        onClose={() => setDlg({ open: false, order: null })}
        onSaved={(orderNumber, newId) => {
          setDlg({ open: false, order: null });
          toast(orderNumber ? `Order created — ${orderNumber}` : 'Order saved');
          fetchAll();
          // Straight into the wizard. Creating the order is step zero of setting
          // it up, and making someone find the order again to carry on would be
          // an odd place to stop.
          if (newId) setWizard({ id: newId, number: orderNumber });
        }}
      />
      {wizard && (
        <SalesOrderWizard
          orderId={wizard.id}
          orderNumber={wizard.number}
          open
          canManage={canManage}
          onClose={() => { setWizard(null); fetchAll(); }}
        />
      )}
      <DeleteDialog order={delOrder} onClose={() => setDelOrder(null)}
        onDeleted={() => { setDelOrder(null); toast('Order deleted'); fetchAll(); }} />
    </Box>
  );
}
