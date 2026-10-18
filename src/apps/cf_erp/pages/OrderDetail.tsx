import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, IconButton, TextField, Tooltip } from '@mui/material';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import { cfApi, CfApiError, LONG_WRITE_MS, qs } from '../api/client';
import { lineLock } from '../api/lock';
import type { Movement, OrderProcessView, OrderProduction, OrderRevision, OrderStage, OrderStatus, Party, ReleaseSummary, SalesOrder, SalesOrderLine } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { recordPath } from '../lib/paths';
import {
  CONFIRM_MOVE, LOCKED_STATUSES, NEXT_STAGE, ORDER_STATUS_LABEL, REVISED_NOT_RELEASED, revisionLabel, showRevision, transitionLabel,
} from '../lib/orders';
import {
  checksOn, firstOpenStage, isCutPiecesKey, isOrderValuesKey, isOrderWide, withOrderValuesOpen, landingStage, stageSatisfied, stagesShown, tabAlias, tabFor, tabStages, withCutPiecesOpen,
} from '../lib/process';
import {
  DangerBadge, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, OrderStatusBadge, OrderTypeChip, RevisionBadge, SectionCard, SkeletonRows,
} from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout, type DetailTab } from '../components/DetailLayout';
import { OrderInvoicesCard } from '../components/OrderInvoicesCard';
import { ProductionTabs } from '../components/Production/ProductionTabs';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MovementsTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';
import { ReleaseDialog } from '../components/TrackerDialogs';
import { releasedMessage } from '../lib/materialRequest';
import { MaterialSupplyField } from '../components/Purchase/MaterialSupplyField';
import type { MaterialSupply } from '../api/requisitions';
import { ReleaseView } from '../components/ReleaseView';
import { OrderStructureStep } from '../components/OrderStructure/OrderStructureStep';
import { OrderCostsCard } from '../components/OrderCostsCard';
import { CustomerMaterialPanel } from '../components/CustomerMaterialPanel';
import { OrderCutAllowancePanel } from '../components/CutAllowance';
import { rupeeText } from '../lib/money';
import { Explain, OrderStageTabs, ProcessAbsentChip, ProcessAbsentNote, StageTabsSkeleton } from '../components/OrderProcess/StageTabs';
import { StageBody } from '../components/OrderProcess/StageBody';
import { StageFoot } from '../components/OrderProcess/StageFoot';
import { AcceptanceStep } from '../components/Acceptance/AcceptanceStep';
import { useWorkingLine } from '../components/OrderProcess/workingLine';
import { PartyPicker } from '../components/ServerPicker';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const DELETABLE: OrderStatus[] = ['draft', 'inquiry', 'lost', 'cancelled'];

/**
 * Where a customer order can be revised from. Only the latest revision is ever
 * in one of these; the one it replaced is 'revised'. A closed, lost or
 * cancelled order has stopped, so there is nothing to revise.
 */
const REVISABLE: OrderStatus[] = ['inquiry', 'quoted', 'confirmed'];

/** Tabs that are the same whether or not the order follows a process — drawn before the process has been read. */
const PROCESS_FREE_TABS = ['stock', 'details', 'material', 'allowance'];

/**
 * The order's process, as the tabs need it. Since 2026-10-18 the first steps are for the WHOLE order (Structure &
 * values, Execution plan, and the Material request): while one of them is open every mark is the order's roll-up
 * and there is no line picker. Freeze design, Nesting and Production are still per line (`perLine`): then the
 * line being worked on (the one remembered, else the first line one of those steps still needs) gives those marks.
 * Where a link that names no tab lands is worked out on the roll-up. Null when there is nothing to draw as stages —
 * no process, or a process with none.
 */
function processModel(view: OrderProcessView | null, pickedLine: number | null, perLine: boolean) {
  if (!view?.process || view.stages.length === 0) return null;
  const fallback = view.lines.find((l) => l.stages.some((s) => !isOrderWide(s) && !stageSatisfied(s))) ?? view.lines[0] ?? null;
  const line = view.lines.find((l) => l.lineId === pickedLine) ?? fallback;
  const allStages = stagesShown(view.stages, line, perLine);
  // A stage folded into another (Values into Structure & values) is a check on its host's tab, not a tab.
  const stages = tabStages(allStages);
  const keys = stages.map((s) => s.stageKey);
  const landing = landingStage(view.stages);
  const next = firstOpenStage(allStages);
  return {
    view, process: view.process, line, stages, allStages, keys, perLine,
    landing: landing ? tabFor(landing, view.stages) : keys[0],
    nextKey: next ? tabFor(next, allStages) : null,
  };
}

/** Every line's release on one screen — the Production tab of an order whose process has no Production stage, or no process at all. */
function ProductionOverview({ order, lines, production, productionError, loading, canProduce, canReserve, onRelease, onReleaseChanged, onReloadAll, onRetry }: {
  order: SalesOrder;
  lines: SalesOrderLine[];
  production: OrderProduction | null;
  productionError: CfApiError | null;
  loading: boolean;
  canProduce: boolean;
  canReserve: boolean;
  onRelease: (l: SalesOrderLine) => void;
  onReleaseChanged: (r: ReleaseSummary) => void;
  onReloadAll: () => void;
  onRetry: () => void;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      {productionError && <ErrorNotice error={productionError} onRetry={onRetry} />}
      {(production?.unreleased ?? []).length > 0 && (
        <SectionCard title="Not released yet" subtitle={order.status === 'confirmed' ? 'A line is released whole: its structure becomes the tracker below, and it is frozen from then on.'
          : order.status === 'revised' ? REVISED_NOT_RELEASED : `Lines are released once the order is confirmed — it is ${order.status} now.`}>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {(production?.unreleased ?? []).map((u) => {
              const l = lines.find((x) => x.id === u.id);
              return (
                <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Mono muted>{u.lineNo}</Mono>
                  <Mono>{u.item.code}</Mono>
                  <Box sx={{ flex: '1 1 160px', minWidth: 0, color: 'var(--c-text-2)', fontSize: 13.5 }}>{u.item.name} ×{u.quantity}</Box>
                  {canProduce && order.status === 'confirmed' && l && <Button size="small" variant="contained" startIcon={<RocketLaunchRounded />} onClick={() => onRelease(l)}>Release</Button>}
                </Box>
              );
            })}
          </Box>
        </SectionCard>
      )}
      {loading && !production ? <SkeletonRows rows={3} height={80} /> : (production?.releases ?? []).length === 0 ? (
        <EmptyState icon={<PrecisionManufacturingRounded />} title="Nothing released yet" hint="Release a line to see its pieces, their steps and what each waits for." />
      ) : (production?.releases ?? []).map((r) => (
        <ReleaseView key={r.id} release={r} canProduce={canProduce} canStock={canReserve} onChange={onReleaseChanged} onTakenBack={onReloadAll} onShipped={onReloadAll} />
      ))}
    </Box>
  );
}

function DetailsForm({ order, onSaved }: { order: SalesOrder; onSaved: (o: SalesOrder) => void }) {
  const [form, setForm] = useState({
    title: order.title ?? '', customerReference: order.customerReference ?? '', receivedOn: order.receivedOn ?? '', committedDate: order.committedDate ?? '',
    deliveryAddress: order.deliveryAddress ?? '', notes: order.notes ?? '', code: order.code,
  });
  // The picker searches the server; the order's own customer is the starting value.
  const [customer, setCustomer] = useState<Party | null>(order.customer ? ({ id: order.customer.id, code: order.customer.code ?? '', name: order.customer.name ?? '' } as Party) : null);
  useEffect(() => { setCustomer(order.customer ? ({ id: order.customer.id, code: order.customer.code ?? '', name: order.customer.name ?? '' } as Party) : null); }, [order.customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const locked = LOCKED_STATUSES.includes(order.status);
  const hasLines = (order.lines ?? []).length > 0;
  // §66: who supplies the material — sent only when changed (the server refuses a change once an MR is raised).
  const [supply, setSupply] = useState<MaterialSupply>(order.materialSupply ?? 'we_buy');
  useEffect(() => { setSupply(order.materialSupply ?? 'we_buy'); }, [order.materialSupply]);
  const save = async () => {
    setBusy(true); setError(null);
    const body: Record<string, unknown> = {
      title: form.title || null, customerReference: form.customerReference || null, receivedOn: form.receivedOn || null, committedDate: form.committedDate || null,
      deliveryAddress: form.deliveryAddress || null, notes: form.notes || null,
    };
    if (!hasLines) body.code = form.code;
    if (order.orderType === 'customer' && customer) body.customerId = customer.id;
    if (order.orderType === 'customer' && supply !== (order.materialSupply ?? 'we_buy')) body.materialSupply = supply;
    try { onSaved(await cfApi.put<SalesOrder>(`/orders/${order.id}`, body)); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  return (
    <SectionCard title="Details" sx={{ maxWidth: 880 }} subtitle={order.status === 'revised' ? `Rev ${order.revision} was revised — it is kept as it was.`
      : locked ? `A ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order does not change.` : undefined}>
      <ErrorNotice error={error} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Order number" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={hasLines || locked}
          helperText={hasLines ? 'Fixed once the order has lines — item codes are built from it' : 'Can change until the first line'} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={locked} />
        {order.orderType === 'customer' && (
          <PartyPicker role="customer" activeOnly={false} value={customer} onChange={setCustomer} disabled={locked} />
        )}
        {order.orderType === 'customer' && <TextField label="Customer's reference" value={form.customerReference} onChange={(e) => setForm({ ...form, customerReference: e.target.value })} disabled={locked} />}
        <TextField label="Received on" type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} InputLabelProps={{ shrink: true }} disabled={locked} />
        <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} disabled={locked} />
        <TextField label="Delivery address" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} disabled={locked} />
        <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} disabled={locked} />
        {order.orderType === 'customer' && <MaterialSupplyField value={supply} onChange={setSupply} disabled={locked} />}
      </Box>
      {!locked && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save details'}</Button>
        </Box>
      )}
    </SectionCard>
  );
}

/**
 * Record / Detail (DESIGN_SYSTEM.md §4.3) for a sales order — the project.
 *
 * THE TABS ARE THE PROCESS. When the order follows one, its tabs are the
 * process's stages in sequence — each marked with the chosen line's state,
 * joined by chevrons — then Stock and Details, which are not stages. A stage
 * tab is that stage's own screen with Back / Next at its foot. There is no
 * second way round the order — no strip above the tabs, no pop-up beside them —
 * so what the tabs say is the only thing on screen to disagree with.
 *
 * An order with no process gets plain tabs and the API's own sentence saying why.
 *
 * `?tab=` names a stage key or a plain tab. `lines`, `structure` and
 * `production` are stage keys as well as the old tab names, so every link
 * written before still lands: on the stage when the process has it, otherwise
 * on the plain tab kept beside Stock and Details for exactly that case.
 * `?line=` picks the line to work on, then drops out of the address.
 */
export default function OrderDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = isPermitted('cf_erp_orders_manage');
  const canStock = isPermitted('cf_erp_inventory_view');
  const canTrack = isPermitted('cf_erp_production_view');
  const canProduce = isPermitted('cf_erp_production_manage');
  const canReserve = isPermitted('cf_erp_inventory_manage');
  const canInvoices = isPermitted('cf_erp_orders_view');
  const order = useLoad(() => cfApi.get<SalesOrder>(`/orders/${id}`), [id]);
  const production = useLoad(() => (canTrack ? cfApi.get<OrderProduction>(`/orders/${id}/production`) : Promise.resolve(null)), [id, canTrack]);
  // Where this order has got to, line by line. Loaded ONCE here: the marks on
  // the tabs, each stage's screen and its foot all read this one answer.
  const processView = useLoad(() => cfApi.get<OrderProcessView>(`/orders/${id}/process`), [id]);
  const moves = useLoad(() => (canStock ? cfApi.get<Movement[]>(`/movements${qs({ orderId: id })}`) : Promise.resolve([] as Movement[])), [id, canStock]);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab');
  const lineParam = params.get('line');
  const [pickedLine, pickLine] = useWorkingLine(id);
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const [moving, setMoving] = useState<OrderStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [revising, setRevising] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Only THIS order's answers. A link from one order to another reuses the
  // page, and the last order's answers are still in hand for a moment.
  const o = order.data && order.data.id === id ? order.data : null;
  const view = processView.data && processView.data.order.id === id ? processView.data : null;
  // The breadcrumb names the revision too, once there is more than one.
  useDetailTitle(o ? (showRevision(o) ? `${o.code} ${revisionLabel(o.revision)}` : o.code) : null);
  const lines = useMemo(() => o?.lines ?? [], [o]);

  // Worked out on the order's roll-up first; a per-line tab (Freeze design, Nesting, Production) then shows its line.
  const base = processModel(view, pickedLine, false);

  // ── the tabs ──
  const releases = production.data?.releases.length;
  const stockTab: DetailTab[] = canStock ? [{ value: 'stock', label: 'Stock', count: moves.data?.length }] : [];
  // Only a customer's order can have customer material.
  const materialTab: DetailTab[] = canStock && order.data?.customer ? [{ value: 'material', label: 'Customer material' }] : [];
  // Cutting allowance (init.sql §64): a customer order with a structure — its parts can be cut a little long.
  const allowanceTab: DetailTab[] = order.data?.orderType === 'customer' && (order.data?.lines ?? []).some((l) => l.lineType === 'custom') ? [{ value: 'allowance', label: 'Cutting allowance' }] : [];
  // Order values (init.sql §65) are no tab of their own since 2026-10-18: they open inside Structure & values
  // ("Values for the whole order"); an old ?tab=ordervalues lands there with them open (lib/process tabAlias).
  // Structure & values (Line items merged into it, 2026-10-18) — the plain tab when there is no such stage.
  const structureTab: DetailTab = { value: 'structure', label: 'Structure & values', count: lines.length };
  // Customer acceptance (§73) — a customer's order is confirmed only by it; the plain tab when the process has no such stage.
  const acceptanceTab: DetailTab[] = order.data?.orderType === 'customer' ? [{ value: 'acceptance', label: 'Customer acceptance' }] : [];
  const tabs: DetailTab[] = base
    ? [
      // Not stages. The two before Stock appear only when the process leaves
      // their stage out, so every screen the order has stays one click away.
      ...(base.keys.includes('structure') ? [] : [structureTab]),
      ...(base.keys.includes('acceptance') ? [] : acceptanceTab),
      ...(base.keys.includes('production') || !canTrack ? [] : [{ value: 'production', label: 'Production', count: releases }]),
      ...stockTab,
      ...materialTab,
      ...allowanceTab,
      { value: 'details', label: 'Details' },
    ]
    : [
      structureTab,
      ...acceptanceTab,
      ...(canTrack ? [{ value: 'production', label: 'Production', count: releases }] : []),
      ...stockTab,
      ...materialTab,
      ...allowanceTab,
      { value: 'details', label: 'Details' },
    ];
  // Settled once the process question has an answer: stages, none, or an error.
  const settled = !!o && (!!view || !!processView.error);
  const valid = [...(base?.keys ?? []), ...tabs.map((t) => t.value)];
  // A link to a folded stage (?tab=values) lands on the tab that draws it; an old ?tab=lines on Structure & values.
  const asked = tabAlias(tabParam);
  const wanted = asked && base ? tabFor(asked, base.allStages) : asked;
  const tab = settled
    ? (wanted && valid.includes(wanted) ? wanted : base?.landing ?? 'structure')
    : (asked ?? '');
  // The open tab decides whether the marks are the order's or the chosen line's.
  const openStage = base?.allStages.find((s) => s.stageKey === tab) ?? null;
  const model = base && openStage && !isOrderWide(openStage) ? processModel(view, pickedLine, true) : base;

  const setTab = useCallback((next: string) => {
    setParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', next); return p; }, { replace: true });
  }, [setParams]);

  /*
   * The address always says where you are. A link naming a line picks it, then
   * drops out so the switcher stays in charge. A missing, unknown or retired
   * tab is replaced by where it landed — once, so a stage finishing under
   * somebody never carries them on to the next one. Only on a real answer,
   * though: while the process could not be read, a link to a stage is kept, so
   * Retry can still honour it.
   */
  const answered = !!o && !!view;
  useEffect(() => {
    // An old link to the retired Cut pieces stage opens Nesting with the cut-pieces dialog (2026-10-02).
    if (isCutPiecesKey(tabParam)) {
      setParams(withCutPiecesOpen, { replace: true });
      return;
    }
    // The retired Order values tab opens Structure & values with that panel open (2026-10-18).
    if (isOrderValuesKey(tabParam)) {
      setParams(withOrderValuesOpen, { replace: true });
      return;
    }
    if (lineParam != null) {
      const n = Number(lineParam);
      if (Number.isInteger(n) && n > 0) pickLine(n);
      setParams((prev) => { const p = new URLSearchParams(prev); p.delete('line'); return p; }, { replace: true });
      return;
    }
    if (answered && tab && tabParam !== tab) setTab(tab);
  }, [lineParam, answered, tab, tabParam, pickLine, setParams, setTab]);

  // Walking on from the foot of a long screen brings the tabs back into view,
  // so the next stage starts at its top. Wherever the tabs can be seen already,
  // nothing moves.
  const allStagesRef = useRef<OrderStage[]>([]);
  allStagesRef.current = model?.allStages ?? [];
  const goStage = useCallback((key: string) => {
    if (isCutPiecesKey(key)) {
      // Not a stage any more: the cut pieces open as a dialog over Nesting.
      setParams(withCutPiecesOpen, { replace: true });
    } else {
      setTab(tabFor(key, allStagesRef.current));
    }
    tabsRef.current?.scrollIntoView({ block: 'nearest' });
  }, [setTab, setParams]);

  // Anything that changes the order moves its stages too, so the two reload together.
  const orderSaved = (saved: SalesOrder) => { order.setData(saved); processView.reload(); };
  const move = async (next: OrderStatus) => {
    setBusy(next); setActionError(null);
    try { orderSaved(await cfApi.post<SalesOrder>(`/orders/${id}/status`, { status: next })); invalidateNavCounts(); toast.success(`${o?.code} is now ${ORDER_STATUS_LABEL[next].toLowerCase()}.`); } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };

  if (order.error) return <ErrorNotice error={order.error} onRetry={order.reload} />;
  if (!o) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const locked = LOCKED_STATUSES.includes(o.status);

  // ── revisions ──
  // A locked line no longer changes, so changing one means a new revision.
  // While nothing is locked yet, the order itself is still open to change.
  const anyLocked = lines.some((l) => lineLock(l) != null);
  const canRevise = o.orderType === 'customer' && REVISABLE.includes(o.status) && anyLocked;
  // Taking a revision back makes the one before it current again. Once one of
  // its lines is locked its pieces have codes, so it stays.
  const canDiscard = o.revision > 1 && o.status !== 'revised' && !anyLocked;
  const otherRevisions = (o.revisions ?? []).filter((r) => r.id !== o.id);
  const newest = otherRevisions.reduce<OrderRevision | null>((best, r) => (!best || r.revision > best.revision ? r : best), null);
  const entityName = `${o.code} ${revisionLabel(o.revision)}${o.title ? ` · ${o.title}` : ''}`;

  const updateRelease = (next: ReleaseSummary) => production.setData((cur) => (cur ? { ...cur, releases: cur.releases.map((x) => (x.id === next.id ? next : x)) } : cur));
  const reloadAll = () => { order.reload(); production.reload(); moves.reload(); processView.reload(); };

  const noProcessChip = settled && !model && view ? <ProcessAbsentChip view={view} /> : null;
  const header = (
    <DetailHeader code={o.code} title={o.title ?? 'Untitled'} subtitle={o.customer ? `${o.customer.name}${o.customerReference ? ` · their reference ${o.customerReference}` : ''}` : 'Made for stock'}
      badges={<>{showRevision(o) && <RevisionBadge revision={o.revision} />}<OrderTypeChip type={o.orderType} /><OrderStatusBadge status={o.status} />{o.overdue && <DangerBadge label="Past committed date" />}{noProcessChip}</>}
      actions={canManage && (
        <>
          {o.allowedTransitions.map((next) => (
            <Button key={next} variant={next === NEXT_STAGE[o.status] ? 'contained' : 'outlined'} color={next === 'cancelled' ? 'error' : 'primary'} disabled={!!busy}
              startIcon={busy === next ? <CircularProgress size={14} color="inherit" /> : undefined}
              onClick={() => (CONFIRM_MOVE[next] ? setMoving(next) : move(next))}>
              {transitionLabel(o.status, next)}
            </Button>
          ))}
          {/* A customer's order is confirmed by its Customer acceptance (§73), not by a status button. */}
          {o.orderType === 'customer' && ['inquiry', 'quoted'].includes(o.status) && (
            <Button variant="contained" disabled={!!busy} onClick={() => setTab('acceptance')} data-testid="go-acceptance">Customer acceptance</Button>
          )}
          {canRevise && <Button variant="outlined" disabled={!!busy} onClick={() => setRevising(true)}>Revise</Button>}
          {!locked && <Button startIcon={<EditRounded />} onClick={() => setTab('details')} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>}
          {/* A later revision is taken back by discarding it, never deleted: the revision before it becomes current again. */}
          {o.revision > 1
            ? canDiscard && <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setDiscarding(true)}>Discard revision</Button>
            : DELETABLE.includes(o.status) && (
              <Tooltip title="Delete — only drafts, inquiries, lost and cancelled orders"><IconButton aria-label="Delete order" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>
            )}
        </>
      )}
      facts={(
        <>
          <Fact label="Received"><Mono muted={!o.receivedOn}>{o.receivedOn ?? '—'}</Mono></Fact>
          <Fact label="Committed"><Mono muted={!o.committedDate}>{o.committedDate ?? '—'}</Mono></Fact>
          {o.confirmedAt && <Fact label="Confirmed"><Mono muted>{new Date(o.confirmedAt).toLocaleDateString()}</Mono></Fact>}
          <Fact label="Lines"><Mono>{lines.length}</Mono></Fact>
          {o.total && lines.length > 0 && (
            <Fact label="Order value">{o.total.unpricedLines.length >= lines.length ? <Mono muted>not priced</Mono> : <><Mono>{rupeeText(o.total.amount)}</Mono>{!o.total.complete && <Mono muted> · not complete</Mono>}</>}</Fact>
          )}
        </>
      )}>
      <ErrorNotice error={actionError} sx={{ mt: 2, mb: 0 }} />
    </DetailHeader>
  );
  const crossLinks = (
    <>
      {/* Every other revision of this order is one click away, not only through the list. */}
      {otherRevisions.map((r) => <CrossLink key={`rev:${r.id}`} icon={<HistoryRounded />} label={revisionLabel(r.revision)} to={to(`orders/${r.id}`)} />)}
      {o.customer && <CrossLink icon={<PersonRounded />} label={o.customer.name ?? o.customer.code ?? 'Customer'} to={to('customers?role=all')} />}
      {lines.filter((l) => l.item).map((l) => (
        <CrossLink key={l.id} icon={<AccountTreeRounded />} label={l.item?.code ?? l.item?.name ?? ''} to={to(recordPath(l.item!.kind, l.item!.id))} />
      ))}
      {canTrack && <CrossLink icon={<PrecisionManufacturingRounded />} label="Production" count={releases} onClick={() => setTab('production')} />}
      {canStock && <CrossLink icon={<SwapHorizRounded />} label="Stock movements" count={moves.data?.length} onClick={() => setTab('stock')} />}
    </>
  );

  // ── above the body: the stage tabs, or why there are none ──
  let band: ReactNode;
  if (model) {
    band = (
      <Box ref={tabsRef} sx={{ scrollMarginTop: 16 }}>
        {/* A reload that failed: the tabs keep the last answer, and say so. */}
        <ErrorNotice error={processView.error} onRetry={processView.reload} />
        <OrderStageTabs process={model.process} lines={model.view.lines} stages={model.stages} line={model.line} showPicker={model.perLine}
          nextKey={model.nextKey} checksFor={(key) => checksOn(key, model.allStages)} active={tab} onTab={setTab} onPickLine={pickLine} reference={tabs} />
      </Box>
    );
  } else if (settled) {
    // With a view the reason is a chip in the header line; only a failed read keeps a row.
    band = view ? null : <ProcessAbsentNote view={view} error={processView.error} onRetry={processView.reload} />;
  } else {
    band = <StageTabsSkeleton />;
  }
  // An earlier revision is kept exactly as it was. Say so before anything else,
  // and point at the revision that replaced it — that is where work goes on.
  const revisedNote = o.status === 'revised' && (
    <Explain action={newest && (
      <Box component={Link} to={to(`orders/${newest.id}`)} sx={{ fontSize: 13, color: 'var(--c-primary-700)', flexShrink: 0 }}>Open {revisionLabel(newest.revision)}</Box>
    )}>
      {o.revisedAt ? `Revised on ${new Date(o.revisedAt).toLocaleDateString()} — kept as it was.` : 'Revised — kept as it was.'}
    </Explain>
  );

  // ── the body ──
  const stage = model?.stages.find((s) => s.stageKey === tab) ?? null;
  let body: ReactNode = null;
  if (!settled && !PROCESS_FREE_TABS.includes(tab)) {
    body = <SkeletonRows rows={4} height={72} />;
  } else if (model && stage) {
    body = (
      <>
        <StageBody key={`${stage.stageKey}:${model.perLine ? model.line?.lineId ?? 'order' : 'order'}`}
          view={model.view} stage={stage} line={model.line} order={o} production={production.data} productionError={production.error}
          onPickLine={pickLine} onOrderSaved={orderSaved} onReleaseChanged={updateRelease} onReloadAll={reloadAll} onGoStage={goStage} />
        <StageFoot key={`foot:${stage.stageKey}`} stages={model.stages} current={stage} checks={checksOn(stage.stageKey, model.allStages)} onGo={goStage} />
      </>
    );
  } else if (tab === 'structure') {
    // Every line of the order, with its parts and values, in one view — with or without a process.
    body = <OrderStructureStep order={o} view={view} onOrderSaved={orderSaved} onChanged={() => { order.reload(); processView.reload(); }} />;
  } else if (tab === 'acceptance' && o.orderType === 'customer') {
    // The customer's yes (§73) — with or without a process stage for it.
    body = <AcceptanceStep order={o} onChanged={() => { order.reload(); processView.reload(); }} />;
  } else if (tab === 'production' && canTrack) {
    const overview = (
      <ProductionOverview order={o} lines={lines} production={production.data} productionError={production.error} loading={production.loading}
        canProduce={canProduce} canReserve={canReserve} onRelease={setReleasing} onReleaseChanged={updateRelease} onReloadAll={reloadAll} onRetry={production.reload} />
    );
    // Times and Contractors sit beside the release view, which is untouched.
    body = lines.length === 0 ? overview : (
      <ProductionTabs orderId={o.id} released={(production.data?.releases ?? []).length > 0} tracker={overview}
        lines={lines.map((l) => ({ id: l.id, lineNo: l.lineNo, label: l.item?.name ?? l.item?.code ?? 'Line' }))} />
    );
  } else if (tab === 'stock' && canStock) {
    body = (
      <SectionCard flush title="Stock for this order" subtitle="Issues made against this order — what has gone to it from stock. Receipts and transfers do not name an order."
        actions={canReserve && !locked && <MovementButtons types={['issue']} preset={{ orderId: o.id }} onPosted={moves.reload} />}>
        {moves.error && <Box sx={{ p: 2 }}><ErrorNotice error={moves.error} onRetry={moves.reload} /></Box>}
        <MovementsTable bare rows={moves.data ?? []} loading={moves.loading && !moves.data} empty="Nothing has been issued to this order yet." />
      </SectionCard>
    );
  } else if (tab === 'material' && canStock && o.customer) {
    body = <CustomerMaterialPanel order={o} />;
  } else if (tab === 'allowance') {
    body = <OrderCutAllowancePanel orderId={o.id} canEdit={canManage} />;
  } else if (tab === 'details') {
    body = (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <DetailsForm key={o.updatedAt} order={o} onSaved={(saved) => { orderSaved(saved); toast.success('Details saved.'); }} />
        {canStock && o.orderType === 'customer' && <OrderCostsCard order={o} />}
        {canInvoices && o.orderType === 'customer' && o.status !== 'draft' && <OrderInvoicesCard orderId={o.id} />}
      </Box>
    );
  }

  return (
    <DetailLayout header={header} crossLinks={crossLinks} beforeTabs={<>{revisedNote}{band}</>} maxWidth="none"
      collapsible={{ id: 'order', summary: (
        <>
          <Mono sx={{ fontWeight: 500, color: 'var(--c-text)' }}>{o.code}</Mono>
          <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{o.customer ? o.customer.name : 'For stock'}</Box>
          <OrderStatusBadge status={o.status} />
          {noProcessChip}
          {o.total && lines.length > 0 && o.total.unpricedLines.length < lines.length && <Mono>{rupeeText(o.total.amount)}</Mono>}
        </>
      ) }}
      // With stages the tab row above is the tabs; without, the plain ones draw here.
      tabs={model || !settled ? undefined : tabs}
      // A new line is a new screen too, so switching it cross-fades like a tab.
      active={model && stage ? `${tab}:${model.perLine ? model.line?.lineId ?? 'order' : 'order'}` : tab || 'loading'}
      onTab={setTab}>
      {body}

      <ReleaseDialog line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? releasing.item?.name ?? 'This line'} ×${releasing.quantity}` } : null}
        onClose={() => setReleasing(null)}
        onReleased={(r) => {
          invalidateNavCounts();
          toast.success(releasedMessage(releasing?.lineNo, r));
          // Production is per line when it is a stage: open the line just released.
          if (releasing) pickLine(releasing.id);
          reloadAll();
          setTab('production');
        }} />
      <ConfirmDialog open={!!moving} title={moving ? `${transitionLabel(o.status, moving)}?` : ''} confirmLabel={moving ? transitionLabel(o.status, moving) : 'Confirm'} danger={moving === 'cancelled'}
        entityName={`${o.code}${o.title ? ` · ${o.title}` : ''}`} body={moving ? CONFIRM_MOVE[moving] ?? '' : ''}
        onClose={() => setMoving(null)}
        onConfirm={async () => { const next = moving!; orderSaved(await cfApi.post<SalesOrder>(`/orders/${id}/status`, { status: next })); invalidateNavCounts(); toast.success(`${o.code} is now ${ORDER_STATUS_LABEL[next].toLowerCase()}.`); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete order" title="Delete this order?" entityName={`${o.code}${o.title ? ` · ${o.title}` : ''}`}
        body="The order, its lines and their structures are deleted. Its number is not given out again."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await cfApi.del(`/orders/${id}`); invalidateNavCounts(); toast.success(`${o.code} deleted.`); navigate(to('orders')); }} />
      {/* Both copy or remove a whole revision — every line, structure and value — so both get the long wait. */}
      <ConfirmDialog open={revising} confirmLabel="Revise" title={`Revise ${o.code}?`} entityName={entityName}
        body={(
          <>
            <Box component="p" sx={{ m: 0 }}>Rev {o.revision + 1} starts as a copy of rev {o.revision} — every line, with its structure and values. Cut pieces are made again from the values.</Box>
            <Box component="p" sx={{ mt: 1, mb: 0 }}>Rev {o.revision} is kept exactly as it is and becomes read-only.</Box>
            <Box component="p" sx={{ mt: 1, mb: 0 }}>Nothing in rev {o.revision + 1} is frozen yet. Freeze the design of its lines when they are right, and their pieces get their codes again — the same codes wherever nothing changed.</Box>
          </>
        )}
        onClose={() => setRevising(false)}
        onConfirm={async () => {
          const next = await cfApi.post<SalesOrder>(`/orders/${id}/revise`, {}, { timeoutMs: LONG_WRITE_MS });
          invalidateNavCounts();
          toast.success(`${o.code} rev ${next.revision} created — rev ${o.revision} is kept as it was.`);
          navigate(to(`orders/${next.id}`));
        }} />
      <ConfirmDialog open={discarding} danger confirmLabel="Discard revision" title={`Discard rev ${o.revision}?`} entityName={entityName}
        body={`Rev ${o.revision} and everything in it — its lines, structure, values and cut pieces — are removed. Rev ${o.revision - 1} becomes the current revision again, exactly as it was.`}
        onClose={() => setDiscarding(false)}
        onConfirm={async () => {
          const prev = await cfApi.del<SalesOrder>(`/orders/${id}/revision`, { timeoutMs: LONG_WRITE_MS });
          invalidateNavCounts();
          toast.success(`Rev ${o.revision} discarded — ${o.code} rev ${prev.revision} is current again.`);
          navigate(to(`orders/${prev.id}`));
        }} />
    </DetailLayout>
  );
}
