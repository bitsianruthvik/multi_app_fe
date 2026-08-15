import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Divider, MenuItem,
  TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackRounded';
import SaveIcon from '@mui/icons-material/SaveRounded';
import FactoryRounded from '@mui/icons-material/FactoryRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import RestartAltRounded from '@mui/icons-material/RestartAltRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';

import { fabQuery, fabMutate } from '../api/client';
import { baselineCcOrder } from '../api/cc';
import { useDetailTitle } from '../components/nav/detailTitleContext';
import { type FabPlant } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import {
  Surface, DetailLayout, CrossLink, FactItem, StatusBadge, Mono, useToast, ConfirmDialog,
} from '../components';
import OrderLinesPanel, { type FabOrderLine } from '../components/OrderLinesPanel';
import SalesOrderWizard from '../components/SalesOrderWizard';
import { statusFamily } from '../statusMap';
import OrderItemsTree from '../components/OrderItemsTree';
import OrderFlowAllocation from '../components/OrderFlowAllocation';
import OrderNesting from '../components/OrderNesting';
import OrderParameters from '../components/OrderParameters';
import OrderProcurement from '../components/OrderProcurement';
import OrderProduction from '../components/OrderProduction';
import OrderTaskDag from '../components/OrderTaskDag';
import OrderStageStrip from '../components/OrderStageStrip';
import { hasSetupWizard, orderTypeLabel } from '../constants/orderTypes';
import { fetchOrderReadiness, type OrderReadiness, type ReadinessStage } from '../api/readiness';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerId?: number; customerName?: string; customerPoRef?: string; plantId?: number; plantName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string; currency?: string; paymentTerms?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

const SO_TYPES = ['standard', 'rush', 'blanket', 'internal'];
/**
 * The statuses a person sets by hand. The rest — scheduled, in_production,
 * ready_to_ship — are consequences the system works out from task progress,
 * and offering them here would invite someone to declare an order in
 * production that has not started.
 *
 * `confirmed` is absent too, and deliberately: an order leaves draft by being
 * confirmed at the END OF THE WIZARD, once its lines, BOM, nesting, flows and
 * project tree are all done. A dropdown that let anyone skip all of that
 * would make the wizard advisory.
 */
const SO_STATUSES = ['draft', 'shipped', 'closed', 'cancelled'];
const SO_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * The dropdown options, always including whatever the order is on now.
 *
 * Without this an automatic status renders as an EMPTY select — the field just
 * looks blank, which reads as data loss on a screen whose whole job is to show
 * the record faithfully.
 */
function statusOptions(current?: string): string[] {
  return current && !SO_STATUSES.includes(current) ? [current, ...SO_STATUSES] : SO_STATUSES;
}

export default function SalesOrderDetail() {
  const { company, soId } = useParams<{ company: string; soId: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_projects_manage');
  // Re-baselining is a critical-chain action, not an order edit — same gate as
  // the Critical chain page's replan.
  const canCcManage = usePermission('fab_erp_cc_manage');
  const { toast } = useToast();
  const id = Number(soId);
  const go = (p: string) => navigate(`/${company}/fab_erp/${p}`);

  const [so, setSo] = useState<FabOrder | null>(null);
  // Breadcrumb reads "Orders / SO-20260715-0002", not "Orders / 81".
  useDetailTitle(so?.orderNumber);
  const [items, setItems] = useState<FabOrderLine[]>([]);
  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [draft, setDraft] = useState<Partial<FabOrder>>({});
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  // Where the order stands across the five preparation stages. Owned here
  // rather than inside each tab because the strip has to be visible from every
  // tab — the point of it is that you can see the whole sequence while working
  // on one part of it.
  const [readiness, setReadiness] = useState<OrderReadiness | null>(null);

  const set = <K extends keyof FabOrder>(k: K, v: FabOrder[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [soRes, itemsRes, plantsRes, readinessRes] = await Promise.all([
        fabQuery<{ data: FabOrder[] }>('fabErpOrder', { filters: { id }, pagination: { limit: 1 } }),
        fabQuery<{ data: FabOrderLine[] }>('fabErpOrderLine', { filters: { orderId: id }, orderBy: [{ field: 'lineNo', direction: 'asc' }] }),
        fabQuery<{ data: FabPlant[] }>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 } }),
        // The strip is a guide, not a gate: if readiness cannot be read the
        // order still opens and every tab still works.
        fetchOrderReadiness(id).catch(() => null),
      ]);
      const record = soRes.data?.[0] ?? null;
      setSo(record);
      if (record) setDraft({ ...record });
      setItems(itemsRes.data ?? []);
      setPlants(plantsRes.data ?? []);
      setReadiness(readinessRes);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /**
   * Re-read readiness after something changed a step.
   *
   * Also reconciles the status, because confirming inside the wizard moves the
   * order out of draft server-side — the badge in the header would otherwise
   * keep showing the status the page loaded with. An unsaved choice in the
   * Status dropdown is left alone: the user's edit outranks the automation.
   */
  const soStatus = so?.status;
  const refreshReadiness = useCallback(async (next?: OrderReadiness | null) => {
    try {
      // Most write endpoints already recomputed this and handed it back, so the
      // common path costs nothing.
      const r = next ?? await fetchOrderReadiness(id);
      setReadiness(r);
      if (soStatus && r.status !== soStatus) {
        setSo((prev) => (prev ? { ...prev, status: r.status } : prev));
        setDraft((d) => (d.status === soStatus ? { ...d, status: r.status } : d));
      }
    } catch { /* leave the last known state on screen */ }
  }, [id, soStatus]);

  async function saveSo() {
    if (!so) return;
    setSaving(true); setError('');
    try {
      // DATE columns reject full ISO timestamps (e.g. "2026-07-19T18:30:00.000Z")
      // under MySQL strict mode — these fields round-trip from the API as ISO
      // strings, so truncate to the date-only portion before writing back.
      const dateOnly = (v?: string | null) => (v ? v.slice(0, 10) : null);
      await fabMutate('fabErpOrder', 'update', {
        id,
        order_number: draft.orderNumber ?? so.orderNumber,
        order_type: so.orderType,
        type: draft.type ?? so.type,
        status: draft.status ?? so.status,
        priority: draft.priority ?? null,
        customer_id: so.customerId ?? null,
        customer_name: draft.customerName ?? null,
        customer_po_ref: draft.customerPoRef ?? null,
        required_date: dateOnly(draft.requiredDate),
        confirmed_date: dateOnly(draft.confirmedDate),
        scheduled_ship_date: dateOnly(draft.scheduledShipDate),
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

  /**
   * Everything below the Overview tab describes preparing a thing to BUILD:
   * its BOM, its nesting, its flows, its task tree, and the two documents that
   * tree leads to. All of it belongs to the sales order.
   *
   * A purchase order is a list of steel ordered from a supplier and a
   * manufacturing order is the DAG this sales order already produced — they get
   * the record and its lines, and nothing that would invite someone to nest
   * plate for a document with no geometry.
   */
  const isSales = hasSetupWizard(so.orderType);

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
            {isSales
              ? (so.customerName || 'No customer')
              : `${orderTypeLabel(so.orderType)} order`}
          </Typography>
        </Box>
        {/* A draft SALES order is one still in the wizard, so the wizard is the
            headline action while it is one — the tabs below are for looking
            things up, not for working through the sequence. A draft purchase or
            production order is simply not approved yet; there is no wizard. */}
        {so.status === 'draft' && isSales && canManage && (
          <Button variant="contained" startIcon={<PlayArrowRounded />} onClick={() => setWizardOpen(true)}>
            Continue setup
          </Button>
        )}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
        <FactItem label="Type" value={so.type?.replace(/_/g, ' ') ?? '—'} />
        <FactItem label="Required" value={so.requiredDate ? <Mono>{so.requiredDate.slice(0, 10)}</Mono> : '—'} />
        <FactItem label="Plant" value={so.plantName ?? '—'} />
        <FactItem label="Priority" value={so.priority ?? '—'} />
      </Box>
    </Box>
  );

  /** A tab's completion marker, or undefined while readiness is unknown. */
  const stageDot = (key: ReadinessStage['key']) =>
    readiness?.stages.find((s) => s.key === key)?.state;

  const crossLinks = (
    <>
      <CrossLink icon={<Inventory2Rounded />} label="Line items" count={items.length} onClick={() => setTab('lines')} />
      {so.plantId && <CrossLink icon={<FactoryRounded />} label={so.plantName ?? 'Plant'} onClick={() => go('plants')} />}
    </>
  );

  return (
    <Box>
      {isSales && (
        <SalesOrderWizard
          orderId={id}
          orderNumber={so.orderNumber}
          open={wizardOpen}
          canManage={canManage}
          onClose={() => { setWizardOpen(false); fetchAll(); }}
        />
      )}
      {error && <Alert severity="error" sx={{ mb: 2, maxWidth: 1100, mx: 'auto' }} onClose={() => setError('')}>{error}</Alert>}
      {isSales && readiness && (
        <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
          <OrderStageStrip readiness={readiness} activeTab={tab} onGoToTab={setTab} />
        </Box>
      )}
      <DetailLayout
        maxWidth={1100}
        header={header}
        crossLinks={crossLinks}
        tabs={[
          { value: 'overview', label: 'Overview' },
          // Ordered as the work is done, and each carrying its own state, so
          // the sequence is legible from the tab bar alone.
          { value: 'lines', label: 'Line items', count: items.length, dot: isSales ? stageDot('lines') : undefined },
          ...(isSales ? [
            // Resequenced 2026-08-15: flows before parameters (the flow decides
            // which values a part needs), nesting after (it needs the dimensions).
            { value: 'items', label: 'Structure', dot: stageDot('boq') },
            { value: 'flows', label: 'Flows', dot: stageDot('flows') },
            { value: 'params', label: 'Parameters', dot: stageDot('params') },
            { value: 'nesting', label: 'Nesting', dot: stageDot('nesting') },
            { value: 'dag', label: 'Project tree', dot: stageDot('tasks') },
            // The two documents the finished tree leads to. Reachable here as
            // well as in the wizard, because receiving a delivery happens long
            // after the order was confirmed and the wizard closed.
            { value: 'procurement', label: 'Procurement', dot: stageDot('procurement') },
            { value: 'production', label: 'Production', dot: stageDot('production') },
          ] : []),
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
                {statusOptions(draft.status ?? so.status).map((s) => (
                  <MenuItem key={s} value={s}>{s.replace(/_/g, ' ')}</MenuItem>
                ))}
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

            {/* Placed with the dates because this is where a wrong committed
                date gets noticed. Deliberately a plain text button — it is a
                rare corrective action, not part of editing the order. */}
            {canCcManage && (
              <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Button size="small" startIcon={<RestartAltRounded fontSize="small" />} onClick={() => setRebaseOpen(true)}>
                  Re-baseline critical chain
                </Button>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  Recomputes this order’s buffer and committed date — use after a calendar, capacity or BOM change.
                </Typography>
              </Box>
            )}

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
        ) : tab === 'lines' ? (
          <OrderLinesPanel orderId={id} canManage={canManage} onChanged={fetchAll} />
        ) : !isSales ? null : tab === 'items' ? (
          <OrderItemsTree
            orderId={id}
            canManage={canManage}
            readiness={readiness}
            onStageChanged={refreshReadiness}
          />
        ) : tab === 'flows' ? (
          <OrderFlowAllocation orderId={id} canManage={canManage} onStageChanged={refreshReadiness} />
        ) : tab === 'params' ? (
          <OrderParameters orderId={id} canManage={canManage} onStageChanged={refreshReadiness} />
        ) : tab === 'nesting' ? (
          <OrderNesting orderId={id} canManage={canManage} onStageChanged={refreshReadiness} />
        ) : tab === 'procurement' ? (
          <OrderProcurement orderId={id} canManage={canManage} onChanged={refreshReadiness} />
        ) : tab === 'production' ? (
          <OrderProduction orderId={id} canManage={canManage} onChanged={refreshReadiness} />
        ) : (
          <OrderTaskDag orderId={id} canManage={canManage} />
        )}
      </DetailLayout>

      <ConfirmDialog
        open={rebaseOpen}
        title="Re-baseline critical chain?"
        entityName={so.orderNumber}
        confirmLabel="Re-baseline"
        body="Rebuilds this order’s critical chain from its tasks now and recomputes its buffer and committed date — the date given to the customer can move."
        onClose={() => setRebaseOpen(false)}
        onConfirm={async () => {
          const res = await baselineCcOrder(id);
          // created:false means the builder found no tasks — a success with
          // nothing planned, which must not read as "re-baselined".
          if (res.created === false) {
            toast('No tasks to plan yet — baseline unchanged.', 'info');
          } else {
            toast('Critical chain re-baselined');
          }
          fetchAll();
        }}
      />
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

