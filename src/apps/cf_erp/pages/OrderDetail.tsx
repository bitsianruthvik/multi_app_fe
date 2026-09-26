import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Autocomplete, Box, Button, CircularProgress, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { Movement, OrderProcessView, OrderProduction, OrderStatus, Party, Release, SalesOrder, SalesOrderLine } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { recordPath } from '../lib/paths';
import { CONFIRM_MOVE, LOCKED_STATUSES, NEXT_STAGE, ORDER_STATUS_LABEL, transitionLabel } from '../lib/orders';
import { firstOpenStage, landingStage, stageSatisfied } from '../lib/process';
import {
  DangerBadge, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, OrderStatusBadge, OrderTypeChip, SectionCard, SkeletonRows,
} from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout, type DetailTab } from '../components/DetailLayout';
import { BomPanel } from '../components/Bom/BomPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MovementsTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';
import { ReleaseDialog } from '../components/TrackerDialogs';
import { ReleaseView } from '../components/ReleaseView';
import { OrderLinesPanel } from '../components/OrderLinesPanel';
import { OrderStageTabs, ProcessAbsentNote, StageTabsSkeleton } from '../components/OrderProcess/StageTabs';
import { StageBody } from '../components/OrderProcess/StageBody';
import { StageFoot } from '../components/OrderProcess/StageFoot';
import { useWorkingLine } from '../components/OrderProcess/workingLine';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const DELETABLE: OrderStatus[] = ['draft', 'inquiry', 'lost', 'cancelled'];

/** Tabs that are the same whether or not the order follows a process — drawn before the process has been read. */
const PROCESS_FREE_TABS = ['stock', 'details'];

/**
 * The order's process, as the tabs need it: the line being worked on (the one
 * remembered, else the first line the order's next stage still needs), that
 * line's own stages, and where a link that names no tab should land. Null when
 * there is nothing to draw as stages — no process, or a process with none.
 */
function processModel(view: OrderProcessView | null, pickedLine: number | null) {
  if (!view?.process || view.stages.length === 0) return null;
  const fallback = view.lines.find((l) => {
    const s = l.stages.find((x) => x.stageKey === view.nextStage);
    return s ? !stageSatisfied(s) : false;
  }) ?? view.lines[0] ?? null;
  const line = view.lines.find((l) => l.lineId === pickedLine) ?? fallback;
  // Every state on the tabs is this line's own; with no lines, the order's roll-up is all there is.
  const stages = line ? line.stages : view.stages;
  const keys = stages.map((s) => s.stageKey);
  return { view, process: view.process, line, stages, keys, landing: landingStage(stages) ?? keys[0] };
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
  onReleaseChanged: (r: Release) => void;
  onReloadAll: () => void;
  onRetry: () => void;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      {productionError && <ErrorNotice error={productionError} onRetry={onRetry} />}
      {(production?.unreleased ?? []).length > 0 && (
        <SectionCard title="Not released yet" subtitle={order.status === 'confirmed' ? 'A line is released whole: its structure becomes the tracker below, and it is frozen from then on.' : `Lines are released once the order is confirmed — it is ${order.status} now.`}>
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
  const [customer, setCustomer] = useState<Party | null>(null);
  const customers = useLoad(() => (order.orderType === 'customer' ? cfApi.get<Party[]>(`/parties${qs({ role: 'customer' })}`) : Promise.resolve([])), [order.orderType]);
  useEffect(() => { setCustomer((customers.data ?? []).find((p) => p.id === order.customer?.id) ?? null); }, [customers.data, order.customer?.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const locked = LOCKED_STATUSES.includes(order.status);
  const hasLines = (order.lines ?? []).length > 0;
  const save = async () => {
    setBusy(true); setError(null);
    const body: Record<string, unknown> = {
      title: form.title || null, customerReference: form.customerReference || null, receivedOn: form.receivedOn || null, committedDate: form.committedDate || null,
      deliveryAddress: form.deliveryAddress || null, notes: form.notes || null,
    };
    if (!hasLines) body.code = form.code;
    if (order.orderType === 'customer' && customer) body.customerId = customer.id;
    try { onSaved(await cfApi.put<SalesOrder>(`/orders/${order.id}`, body)); } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };
  return (
    <SectionCard title="Details" sx={{ maxWidth: 880 }} subtitle={locked ? `A ${ORDER_STATUS_LABEL[order.status].toLowerCase()} order does not change.` : undefined}>
      <ErrorNotice error={error} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Order number" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={hasLines || locked}
          helperText={hasLines ? 'Fixed once the order has lines — item codes are built from it' : 'Can change until the first line'} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
        <TextField label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={locked} />
        {order.orderType === 'customer' && (
          <Autocomplete size="small" options={customers.data ?? []} value={customer} onChange={(_, v) => setCustomer(v)} disabled={locked}
            getOptionLabel={(p) => `${p.code} · ${p.name}`} isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(p) => <TextField {...p} label="Customer" />} />
        )}
        {order.orderType === 'customer' && <TextField label="Customer's reference" value={form.customerReference} onChange={(e) => setForm({ ...form, customerReference: e.target.value })} disabled={locked} />}
        <TextField label="Received on" type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} InputLabelProps={{ shrink: true }} disabled={locked} />
        <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} disabled={locked} />
        <TextField label="Delivery address" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} disabled={locked} />
        <TextField label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} disabled={locked} />
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
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Only THIS order's answers. A link from one order to another reuses the
  // page, and the last order's answers are still in hand for a moment.
  const o = order.data && order.data.id === id ? order.data : null;
  const view = processView.data && processView.data.order.id === id ? processView.data : null;
  useDetailTitle(o ? o.code : null);
  const lines = useMemo(() => o?.lines ?? [], [o]);

  const model = processModel(view, pickedLine);
  // Without stages, the plain Structure tab picks its own line: the remembered
  // one, else the first custom line — it has a tree worth seeing — else the first.
  const plainLine = lines.find((l) => l.id === pickedLine)?.id ?? lines.find((l) => l.lineType === 'custom')?.id ?? lines[0]?.id ?? null;

  // ── the tabs ──
  const releases = production.data?.releases.length;
  const stockTab: DetailTab[] = canStock ? [{ value: 'stock', label: 'Stock', count: moves.data?.length }] : [];
  const tabs: DetailTab[] = model
    ? [
      // Not stages. The three before Stock appear only when the process leaves
      // their stage out, so every screen the order has stays one click away.
      ...(model.keys.includes('lines') ? [] : [{ value: 'lines', label: 'Lines', count: lines.length }]),
      ...(model.keys.includes('structure') || !lines.length ? [] : [{ value: 'structure', label: 'Structure' }]),
      ...(model.keys.includes('production') || !canTrack ? [] : [{ value: 'production', label: 'Production', count: releases }]),
      ...stockTab,
      { value: 'details', label: 'Details' },
    ]
    : [
      { value: 'lines', label: 'Lines', count: lines.length },
      ...(lines.length ? [{ value: 'structure', label: 'Structure' }] : []),
      ...(canTrack ? [{ value: 'production', label: 'Production', count: releases }] : []),
      ...stockTab,
      { value: 'details', label: 'Details' },
    ];
  // Settled once the process question has an answer: stages, none, or an error.
  const settled = !!o && (!!view || !!processView.error);
  const valid = [...(model?.keys ?? []), ...tabs.map((t) => t.value)];
  const tab = settled
    ? (tabParam && valid.includes(tabParam) ? tabParam : model?.landing ?? 'lines')
    : (tabParam ?? '');

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
  const goStage = useCallback((key: string) => {
    setTab(key);
    tabsRef.current?.scrollIntoView({ block: 'nearest' });
  }, [setTab]);

  // Anything that changes the order moves its stages too, so the two reload together.
  const orderSaved = (saved: SalesOrder) => { order.setData(saved); processView.reload(); };
  const move = async (next: OrderStatus) => {
    setBusy(next); setActionError(null);
    try { orderSaved(await cfApi.post<SalesOrder>(`/orders/${id}/status`, { status: next })); invalidateNavCounts(); toast.success(`${o?.code} is now ${ORDER_STATUS_LABEL[next].toLowerCase()}.`); } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };
  const openStructure = (l: SalesOrderLine) => { pickLine(l.id); setTab('structure'); };

  if (order.error) return <ErrorNotice error={order.error} onRetry={order.reload} />;
  if (!o) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const locked = LOCKED_STATUSES.includes(o.status);

  const updateRelease = (next: Release) => production.setData((cur) => (cur ? { ...cur, releases: cur.releases.map((x) => (x.id === next.id ? next : x)) } : cur));
  const reloadAll = () => { order.reload(); production.reload(); moves.reload(); processView.reload(); };

  const header = (
    <DetailHeader code={o.code} title={o.title ?? 'Untitled'} subtitle={o.customer ? `${o.customer.name}${o.customerReference ? ` · their reference ${o.customerReference}` : ''}` : 'Made for stock'}
      badges={<><OrderTypeChip type={o.orderType} /><OrderStatusBadge status={o.status} />{o.overdue && <DangerBadge label="Past committed date" />}</>}
      actions={canManage && (
        <>
          {o.allowedTransitions.map((next) => (
            <Button key={next} variant={next === NEXT_STAGE[o.status] ? 'contained' : 'outlined'} color={next === 'cancelled' ? 'error' : 'primary'} disabled={!!busy}
              startIcon={busy === next ? <CircularProgress size={14} color="inherit" /> : undefined}
              onClick={() => (CONFIRM_MOVE[next] ? setMoving(next) : move(next))}>
              {transitionLabel(o.status, next)}
            </Button>
          ))}
          {!locked && <Button startIcon={<EditRounded />} onClick={() => setTab('details')} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>}
          {DELETABLE.includes(o.status) && (
            <Tooltip title="Delete — only drafts, inquiries, lost and cancelled orders"><IconButton aria-label="Delete order" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>
          )}
        </>
      )}
      facts={(
        <>
          <Fact label="Customer">{o.customer ? o.customer.name : 'For stock'}</Fact>
          <Fact label="Received"><Mono muted={!o.receivedOn}>{o.receivedOn ?? '—'}</Mono></Fact>
          <Fact label="Committed"><Mono muted={!o.committedDate}>{o.committedDate ?? '—'}</Mono></Fact>
          {o.confirmedAt && <Fact label="Confirmed"><Mono muted>{new Date(o.confirmedAt).toLocaleDateString()}</Mono></Fact>}
          <Fact label="Lines"><Mono>{lines.length}</Mono></Fact>
        </>
      )}>
      <ErrorNotice error={actionError} sx={{ mt: 2, mb: 0 }} />
    </DetailHeader>
  );
  const crossLinks = (
    <>
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
        <OrderStageTabs process={model.process} lines={model.view.lines} stages={model.stages} line={model.line}
          nextKey={firstOpenStage(model.stages)} active={tab} onTab={setTab} onPickLine={pickLine} reference={tabs} />
      </Box>
    );
  } else if (settled) {
    band = <ProcessAbsentNote view={view} error={processView.error} onRetry={processView.reload} />;
  } else {
    band = <StageTabsSkeleton />;
  }

  // ── the body ──
  const stage = model?.stages.find((s) => s.stageKey === tab) ?? null;
  let body: ReactNode = null;
  if (!settled && !PROCESS_FREE_TABS.includes(tab)) {
    body = <SkeletonRows rows={4} height={72} />;
  } else if (model && stage) {
    body = (
      <>
        <StageBody key={`${stage.stageKey}:${model.line?.lineId ?? 'order'}`}
          view={model.view} stage={stage} line={model.line} order={o} production={production.data} productionError={production.error}
          onPickLine={pickLine} onOrderSaved={orderSaved} onReleaseChanged={updateRelease} onReloadAll={reloadAll} onGoStage={goStage} />
        <StageFoot key={`foot:${stage.stageKey}`} view={model.view} stages={model.stages} current={stage} order={o}
          onGo={goStage} onOrderSaved={orderSaved} onReloadAll={reloadAll} />
      </>
    );
  } else if (tab === 'lines') {
    body = <OrderLinesPanel order={o} onSaved={orderSaved} onOpenStructure={openStructure} onRelease={canProduce ? setReleasing : undefined} />;
  } else if (tab === 'structure') {
    // With stages the switcher above the tabs already names the line; without, this tab has its own picker.
    const lineId = model ? model.line?.lineId ?? null : plainLine;
    body = lineId != null && (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
        {!model && (
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Line" value={lineId} onChange={(e) => pickLine(Number(e.target.value))} sx={{ minWidth: { xs: '100%', sm: 280 }, maxWidth: '100%' }}>
              {lines.map((l) => <MenuItem key={l.id} value={l.id}>{`${l.lineNo} · ${l.item?.code ?? '—'} · ${l.item?.name ?? ''} ×${l.quantity}`}</MenuItem>)}
            </TextField>
            {/* A standard line's tree explains itself, with a link to the item. */}
            {lines.find((l) => l.id === lineId)?.lineType === 'custom' && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 220 }}>
                Temporary items are made for this order. Their codes are built from the order number and their place in the structure.
              </Typography>
            )}
          </Box>
        )}
        <BomPanel key={lineId} source={{ kind: 'orderLine', lineId }} onChanged={() => { order.reload(); processView.reload(); }} />
      </Box>
    );
  } else if (tab === 'production' && canTrack) {
    body = (
      <ProductionOverview order={o} lines={lines} production={production.data} productionError={production.error} loading={production.loading}
        canProduce={canProduce} canReserve={canReserve} onRelease={setReleasing} onReleaseChanged={updateRelease} onReloadAll={reloadAll} onRetry={production.reload} />
    );
  } else if (tab === 'stock' && canStock) {
    body = (
      <SectionCard flush title="Stock for this order" subtitle="Issues made against this order — what has gone to it from stock. Receipts and transfers do not name an order."
        actions={canReserve && !locked && <MovementButtons types={['issue']} preset={{ orderId: o.id }} onPosted={moves.reload} />}>
        {moves.error && <Box sx={{ p: 2 }}><ErrorNotice error={moves.error} onRetry={moves.reload} /></Box>}
        <MovementsTable bare rows={moves.data ?? []} loading={moves.loading && !moves.data} empty="Nothing has been issued to this order yet." />
      </SectionCard>
    );
  } else if (tab === 'details') {
    body = <DetailsForm key={o.updatedAt} order={o} onSaved={(saved) => { orderSaved(saved); toast.success('Details saved.'); }} />;
  }

  return (
    <DetailLayout header={header} crossLinks={crossLinks} beforeTabs={band}
      // With stages the tab row above is the tabs; without, the plain ones draw here.
      tabs={model || !settled ? undefined : tabs}
      // A new line is a new screen too, so switching it cross-fades like a tab.
      active={model && stage ? `${tab}:${model.line?.lineId ?? 'order'}` : tab || 'loading'}
      onTab={setTab}>
      {body}

      <ReleaseDialog line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? releasing.item?.name ?? 'This line'} ×${releasing.quantity}` } : null}
        onClose={() => setReleasing(null)}
        onReleased={() => {
          invalidateNavCounts();
          toast.success(`Line ${releasing?.lineNo} released to production.`);
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
        body="The order, its lines and every temporary item made for it are deleted. Its number is not given out again."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await cfApi.del(`/orders/${id}`); invalidateNavCounts(); toast.success(`${o.code} deleted.`); navigate(to('orders')); }} />
    </DetailLayout>
  );
}
