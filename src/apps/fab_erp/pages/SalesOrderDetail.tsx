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
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';

import { fabQuery, fabMutate } from '../api/client';
import { useDetailTitle } from '../components/nav/detailTitleContext';
import { type FabPlant } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import {
  Surface, DetailLayout, CrossLink, FactItem, StatusBadge, Mono, useToast,
  backendMessage, ConfirmDialog,
} from '../components';
import OrderLinesPanel, { type FabOrderLine } from '../components/OrderLinesPanel';
import SalesOrderWizard from '../components/SalesOrderWizard';
import { statusFamily, MANUAL_ORDER_STATUSES } from '../statusMap';
import BlankNesting from '../components/BlankNesting';
import OrderParameters from '../components/OrderParameters';
import OrderProductionPlan from '../components/OrderProductionPlan';
import OrderStageStrip from '../components/OrderStageStrip';
import { hasSetupWizard, orderTypeLabel, showsField } from '../constants/orderTypes';
import {
  fetchOrderReadiness, reviseOrder, fetchOrderRevisions, convertQuote,
  type OrderReadiness, type ReadinessStage, type OrderRevision,
} from '../api/readiness';

interface FabOrder {
  id: number; companyId: number; orderNumber: string; orderType: string; type: string; status: string;
  customerId?: number; customerName?: string; customerPoRef?: string; plantId?: number; plantName?: string;
  /** The name of the LINKED customer record, if the order names one. */
  customerLinkedName?: string;
  requiredDate?: string; confirmedDate?: string; scheduledShipDate?: string;
  priority?: string; mrpController?: string; notes?: string; currency?: string; paymentTerms?: string;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

const SO_TYPES = ['standard', 'rush', 'blanket', 'internal'];
const SO_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * The dropdown options, always including whatever the order is on now.
 *
 * Without this an automatic status renders as an EMPTY select — the field just
 * looks blank, which reads as data loss on a screen whose whole job is to show
 * the record faithfully.
 *
 * Item 9: `draft` drops out of the list once the order has LEFT draft —
 * `MANUAL_ORDER_STATUSES` (statusMap.ts, the one status vocabulary now — this
 * screen no longer keeps its own `SO_STATUSES` copy) still includes it,
 * because a genuinely draft order needs it to show its own current value.
 * Offering it on a confirmed order would make reverting a confirmation a
 * one-click dropdown choice through this screen, when `/mutate` already
 * allows an admin to do it deliberately through the API.
 */
function statusOptions(current?: string): string[] {
  const manual = current === 'draft' ? MANUAL_ORDER_STATUSES : MANUAL_ORDER_STATUSES.filter((s) => s !== 'draft');
  return current && !manual.includes(current) ? [current, ...manual] : manual;
}

/** `OrderRevision.summary` is applyTree's counts object, not a string — interpolating it
 * directly renders "[object Object]" (caught live on a real Revise + save round trip). */
function revisionSummaryText(summary: NonNullable<OrderRevision['summary']>): string {
  return `${summary.created} created, ${summary.updated} updated, ${summary.removed} removed`;
}

export default function SalesOrderDetail() {
  const { company, soId } = useParams<{ company: string; soId: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_projects_manage');
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
  const [wizardOpen, setWizardOpen] = useState(false);
  // Where the order stands across the five preparation stages. Owned here
  // rather than inside each tab because the strip has to be visible from every
  // tab — the point of it is that you can see the whole sequence while working
  // on one part of it.
  const [readiness, setReadiness] = useState<OrderReadiness | null>(null);
  // P2/decision 4: reopening the wizard on a CONFIRMED order via "Revise".
  // Set only while that reason is live — the wizard reads it to know it is in
  // revision mode (its last step becomes "Finish revision", not "Confirm").
  const [reviseReason, setReviseReason] = useState<string | null>(null);
  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [reviseInput, setReviseInput] = useState('');
  const [revisions, setRevisions] = useState<OrderRevision[]>([]);
  const [converting, setConverting] = useState(false);

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

  // Revisions list (P2/decision 6): read-only, so a failure here shouldn't
  // block the rest of the page — it just leaves the list empty.
  useEffect(() => {
    if (!so || !hasSetupWizard(so.orderType)) return;
    fetchOrderRevisions(id).then(setRevisions).catch(() => setRevisions([]));
  }, [id, so, reviseReason]);

  /** Thrown errors surface inside `ConfirmDialog` itself — it renders them and stays open. */
  async function submitRevise() {
    if (reviseInput.trim().length < 10) throw new Error('At least 10 characters — say what changed and why.');
    const res = await reviseOrder(id, reviseInput.trim());
    setReadiness(res.readiness);
    setReviseReason(reviseInput.trim());
    setWizardOpen(true);
  }

  async function doConvert() {
    setConverting(true); setError('');
    try {
      const res = await convertQuote(id);
      toast(`Converted to ${res.order.orderNumber}`, 'success');
      await fetchAll();
    } catch (e) {
      setError(backendMessage(e, 'Could not convert this quote.'));
    } finally { setConverting(false); }
  }

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

  /**
   * Which fields this order type actually owns (constants/orderTypes.ts).
   *
   * The Overview tab rendered all 40 columns of `fab_orders` for every type, so
   * a sales order asked for an MRP controller and a purchase order offered a
   * customer PO ref. Same definition the create screen reads, so the two cannot
   * disagree about what a sales order is.
   */
  const shows = (field: string) => showsField(so.orderType, field, 'detail');

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
              /*
               * THE LINKED CUSTOMER WINS over the free-text field.
               *
               * customer_id is the real relationship; customer_name is a
               * loose string for an order with no customer record. This read
               * only the string, so an order properly linked to Kalpataru
               * displayed "No customer".
               */
              ? (so.customerLinkedName || so.customerName || 'No customer')
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
        {/* item 10: once an order leaves draft, "Continue setup" no longer
            applies — it is not being set up any more, it is committed. Revise
            replaces it: same wizard, reopened with a reason on record. */}
        {so.status !== 'draft' && isSales && so.orderType !== 'quote' && canManage && (
          <Button
            variant="outlined" startIcon={<HistoryRounded />}
            onClick={() => { setReviseInput(''); setReviseDialogOpen(true); }}
          >
            Revise
          </Button>
        )}
        {so.orderType === 'quote' && canManage && (
          <Button
            variant="contained" startIcon={converting ? <CircularProgress size={14} color="inherit" /> : <SwapHorizRounded />}
            disabled={converting}
            onClick={() => void doConvert()}
          >
            Convert to order
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

  // The Production tab is a wide table — the BOM on the left and a chain of up
  // to 17 steps beside each row — so it gets the whole screen. Everything else
  // keeps the readable 1100.
  const pageWidth = tab === 'production' ? undefined : 1100;

  return (
    <Box>
      {isSales && (
        <SalesOrderWizard
          orderId={id}
          orderNumber={so.orderNumber}
          customerName={so.customerLinkedName ?? so.customerName ?? null}
          requiredDate={so.requiredDate ?? null}
          open={wizardOpen}
          canManage={canManage}
          orderType={so.orderType}
          revisionReason={reviseReason ?? undefined}
          onClose={() => { setWizardOpen(false); setReviseReason(null); fetchAll(); }}
        />
      )}
      <ConfirmDialog
        open={reviseDialogOpen}
        title="Revise this order"
        confirmLabel="Start revision"
        onClose={() => setReviseDialogOpen(false)}
        onConfirm={submitRevise}
        body={(
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography sx={{ fontSize: 13.5 }}>
              Reopens the wizard on this confirmed order. Every structure change made from here on
              is recorded — say what changed and why (at least 10 characters).
            </Typography>
            <TextField
              autoFocus multiline minRows={2} size="small" label="Reason"
              value={reviseInput} onChange={(e) => setReviseInput(e.target.value)}
            />
          </Box>
        )}
      />
      {error && <Alert severity="error" sx={{ mb: 2, maxWidth: pageWidth, mx: 'auto' }} onClose={() => setError('')}>{error}</Alert>}
      {isSales && readiness && (
        <Box sx={{ maxWidth: pageWidth, mx: 'auto' }}>
          <OrderStageStrip readiness={readiness} activeTab={tab} onGoToTab={setTab} />
        </Box>
      )}
      <DetailLayout
        maxWidth={pageWidth}
        header={header}
        crossLinks={crossLinks}
        tabs={[
          { value: 'overview', label: 'Overview' },
          // Ordered as the work is done, and each carrying its own state, so
          // the sequence is legible from the tab bar alone.
          { value: 'lines', label: 'Line items', count: items.length, dot: isSales ? stageDot('lines') : undefined },
          ...(isSales ? [
            // Resequenced 2026-09-10: the rectangle on its own step, then
            // nesting, then everything else. Nesting reads the size and the
            // steel and never touches a flow, so it has no reason to wait
            // behind hole counts and weld runs — and it is the step with the
            // lead time, since nothing can be ordered until it is done.
            { value: 'nesting', label: 'Nesting', dot: stageDot('nesting') },
            { value: 'params', label: 'Other params', dot: stageDot('params') },
            // Buy, cut and make on one tab. Reachable here as well as in the
            // wizard, because deploying and buying happen after the wizard closes.
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
              {shows('customerName') && (
                <TextField label="Customer name" size="small" value={draft.customerName ?? ''} disabled={!canManage} onChange={(e) => set('customerName', e.target.value)} />
              )}
              {shows('customerPoRef') && (
                <TextField label="Customer PO ref" size="small" value={draft.customerPoRef ?? ''} disabled={!canManage} onChange={(e) => set('customerPoRef', e.target.value)} />
              )}
            </FormGrid>

            <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
            <SectionLabel>Dates</SectionLabel>
            <FormGrid cols={3}>
              {shows('requiredDate') && (
                <TextField label="Required date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.requiredDate?.slice(0, 10) ?? ''} disabled={!canManage} onChange={(e) => set('requiredDate', e.target.value)} />
              )}
              {shows('confirmedDate') && (
                <TextField label="Confirmed date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.confirmedDate?.slice(0, 10) ?? ''} disabled={!canManage} onChange={(e) => set('confirmedDate', e.target.value)} />
              )}
              {shows('scheduledShipDate') && (
                <TextField label="Scheduled ship date" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }} value={draft.scheduledShipDate?.slice(0, 10) ?? ''} disabled={!canManage} onChange={(e) => set('scheduledShipDate', e.target.value)} />
              )}
            </FormGrid>


            <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
            <SectionLabel>Production</SectionLabel>
            <FormGrid cols={2}>
              {shows('plantId') && (
                <TextField select label="Plant" size="small" value={draft.plantId ?? ''} disabled={!canManage} onChange={(e) => set('plantId', e.target.value === '' ? undefined : (Number(e.target.value) as FabOrder['plantId']))}>
                  <MenuItem value="">— none —</MenuItem>
                  {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              )}
              {shows('currency') && (
                <TextField label="Currency" size="small" value={draft.currency ?? ''} disabled={!canManage} onChange={(e) => set('currency', e.target.value)} />
              )}
              {shows('paymentTerms') && (
                <TextField label="Payment terms" size="small" value={draft.paymentTerms ?? ''} disabled={!canManage} onChange={(e) => set('paymentTerms', e.target.value)} />
              )}
              {/* MRP controller is a planning field on a production order. It was
                  asked of every sales order, which is one of the fields that
                  prompted this split. */}
              {shows('mrpController') && (
                <TextField label="MRP controller" size="small" value={draft.mrpController ?? ''} disabled={!canManage} onChange={(e) => set('mrpController', e.target.value)} />
              )}
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

            {/* item 10: the paper trail for every revision made on this order
                after it was confirmed — each one a reason someone was asked
                to give before the structure could change under a promised date. */}
            {revisions.length > 0 && (
              <>
                <Divider sx={{ my: 2.5, borderColor: 'var(--c-divider)' }} />
                <SectionLabel>Revisions</SectionLabel>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {revisions.map((r) => (
                    <Box key={r.id} sx={{ fontSize: 12.5 }}>
                      <Typography component="span" sx={{ fontWeight: 600 }}>Rev {r.rev}</Typography>
                      {' — '}{r.reason}
                      <Typography component="span" sx={{ color: 'var(--c-text-3)', ml: 1 }}>
                        {r.createdAt?.slice(0, 10)}{r.summary ? ` · ${revisionSummaryText(r.summary)}` : ''}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Surface>
        ) : tab === 'lines' ? (
          <>
            {/* item 9: structure edits from this tab go through applyStructure with
                no revisionReason, which 400s REVISION_REASON_REQUIRED on a confirmed
                order — there is nowhere here to type one. Read-only + a pointer at
                Revise (which reopens the wizard WITH a reason) instead of threading
                one through this tab. */}
            {so.status !== 'draft' && (
              <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
                This order is {so.status} — lines are read-only here.
                {isSales && so.orderType !== 'quote' && <> Use <b>Revise</b> above to change them.</>}
              </Alert>
            )}
            <OrderLinesPanel orderId={id} canManage={canManage && so.status === 'draft'} onChanged={fetchAll} />
          </>
        ) : !isSales ? null : tab === 'params' ? (
          <OrderParameters orderId={id} canManage={canManage} onStageChanged={refreshReadiness} only="rest" />
        ) : tab === 'nesting' ? (
          <BlankNesting orderId={id} canManage={canManage} onStageChanged={refreshReadiness} />
        ) : tab === 'production' ? (
          <OrderProductionPlan
            orderId={id} canManage={canManage} onChanged={refreshReadiness}
            isEstimate={so.orderType === 'quote'} orderStatus={so.status}
            onGoToParams={() => setTab('params')}
          />
        ) : null}
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

