import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, CircularProgress, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
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
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { recordPath } from '../lib/paths';
import { CONFIRM_MOVE, LOCKED_STATUSES, NEXT_STAGE, ORDER_STATUS_LABEL, transitionLabel } from '../lib/orders';
import {
  DangerBadge, DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, OrderStatusBadge, OrderTypeChip, SectionCard, SkeletonRows,
} from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { BomPanel } from '../components/Bom/BomPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MovementsTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';
import { ReleaseDialog } from '../components/TrackerDialogs';
import { ReleaseView } from '../components/ReleaseView';
import { OrderLinesPanel } from '../components/OrderLinesPanel';
import { OrderStageStrip } from '../components/OrderProcess/StageStrip';
import { OrderProcessDialog } from '../components/OrderProcess/OrderProcessDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const DELETABLE: OrderStatus[] = ['draft', 'inquiry', 'lost', 'cancelled'];

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

/** Record / Detail (DESIGN_SYSTEM.md §4.3) for a sales order — the project. */
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
  // Where this order has got to. Loaded ONCE here and handed to both the strip
  // and the pop-up, so the two cannot show different answers.
  const processView = useLoad(() => cfApi.get<OrderProcessView>(`/orders/${id}/process`), [id]);
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const moves = useLoad(() => (canStock ? cfApi.get<Movement[]>(`/movements${qs({ orderId: id })}`) : Promise.resolve([] as Movement[])), [id, canStock]);
  const [tab, setTab] = useUrlParam('tab', 'lines');
  const [structureLine, setStructureLine] = useState<number | null>(null);
  const [moving, setMoving] = useState<OrderStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [processOpen, setProcessOpen] = useState(false);
  const [processStage, setProcessStage] = useState<string | null>(null);

  const o = order.data;
  useDetailTitle(o ? o.code : null);
  const lines = useMemo(() => o?.lines ?? [], [o]);
  // Falls back when the chosen line has gone (removed, or another order loaded),
  // so the Line picker never sits on a value that is not in its list.
  const shownLine = (structureLine != null && lines.some((l) => l.id === structureLine) ? structureLine : null)
    ?? lines.find((l) => l.lineType === 'custom')?.id ?? lines[0]?.id ?? null;

  // Anything that changes the order moves its stages too, so the two reload together.
  const orderSaved = (saved: SalesOrder) => { order.setData(saved); processView.reload(); };
  const move = async (next: OrderStatus) => {
    setBusy(next); setActionError(null);
    try { orderSaved(await cfApi.post<SalesOrder>(`/orders/${id}/status`, { status: next })); invalidateNavCounts(); toast.success(`${o?.code} is now ${ORDER_STATUS_LABEL[next].toLowerCase()}.`); } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };
  const openStructure = (l: SalesOrderLine) => { setStructureLine(l.id); setTab('structure'); };
  const openProcess = (stageKey?: string) => { setProcessStage(stageKey ?? null); setProcessOpen(true); };

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
      {canTrack && <CrossLink icon={<PrecisionManufacturingRounded />} label="Production" count={production.data?.releases.length} onClick={() => setTab('production')} />}
      {canStock && <CrossLink icon={<SwapHorizRounded />} label="Stock movements" count={moves.data?.length} onClick={() => setTab('stock')} />}
    </>
  );
  const tabs = [
    { value: 'lines', label: 'Lines', count: lines.length },
    ...(lines.length ? [{ value: 'structure', label: 'Structure' }] : []),
    ...(canTrack ? [{ value: 'production', label: 'Production', count: production.data?.releases.length }] : []),
    ...(canStock ? [{ value: 'stock', label: 'Stock', count: moves.data?.length }] : []),
    { value: 'details', label: 'Details' },
  ];

  return (
    <DetailLayout header={header} crossLinks={crossLinks} tabs={tabs} active={tab} onTab={setTab}
      beforeTabs={(
        <OrderStageStrip view={processView.data} loading={processView.loading} error={processView.error}
          onReload={processView.reload} onOpen={openProcess} />
      )}>
      {tab === 'lines' && (
        <OrderLinesPanel order={o} onSaved={orderSaved} onOpenStructure={openStructure} onRelease={canProduce ? setReleasing : undefined} />
      )}

      {tab === 'structure' && shownLine != null && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Line" value={shownLine} onChange={(e) => setStructureLine(Number(e.target.value))} sx={{ minWidth: { xs: '100%', sm: 280 }, maxWidth: '100%' }}>
              {lines.map((l) => <MenuItem key={l.id} value={l.id}>{`${l.lineNo} · ${l.item?.code ?? '—'} · ${l.item?.name ?? ''} ×${l.quantity}`}</MenuItem>)}
            </TextField>
            {/* A standard line's tree explains itself, with a link to the item. */}
            {lines.find((l) => l.id === shownLine)?.lineType === 'custom' && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 220 }}>
                Temporary items are made for this order. Their codes are built from the order number and their place in the structure.
              </Typography>
            )}
          </Box>
          <BomPanel key={shownLine} source={{ kind: 'orderLine', lineId: shownLine }} onChanged={() => { order.reload(); processView.reload(); }} />
        </Box>
      )}

      {tab === 'production' && canTrack && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
          {production.error && <ErrorNotice error={production.error} onRetry={production.reload} />}
          {(production.data?.unreleased ?? []).length > 0 && (
            <SectionCard title="Not released yet" subtitle={o.status === 'confirmed' ? 'A line is released whole: its structure becomes the tracker below, and it is frozen from then on.' : `Lines are released once the order is confirmed — it is ${o.status} now.`}>
              <Box sx={{ display: 'grid', gap: 1 }}>
                {(production.data?.unreleased ?? []).map((u) => {
                  const l = lines.find((x) => x.id === u.id);
                  return (
                    <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Mono muted>{u.lineNo}</Mono>
                      <Mono>{u.item.code}</Mono>
                      <Box sx={{ flex: '1 1 160px', minWidth: 0, color: 'var(--c-text-2)', fontSize: 13.5 }}>{u.item.name} ×{u.quantity}</Box>
                      {canProduce && o.status === 'confirmed' && l && <Button size="small" variant="contained" startIcon={<RocketLaunchRounded />} onClick={() => setReleasing(l)}>Release</Button>}
                    </Box>
                  );
                })}
              </Box>
            </SectionCard>
          )}
          {production.loading && !production.data ? <SkeletonRows rows={3} height={80} /> : (production.data?.releases ?? []).length === 0 ? (
            <EmptyState icon={<PrecisionManufacturingRounded />} title="Nothing released yet" hint="Release a line to see its pieces, their steps and what each waits for." />
          ) : (production.data?.releases ?? []).map((r) => (
            <ReleaseView key={r.id} release={r} canProduce={canProduce} canStock={canReserve} onChange={updateRelease} onTakenBack={reloadAll} onShipped={reloadAll} />
          ))}
        </Box>
      )}

      {tab === 'stock' && canStock && (
        <SectionCard flush title="Stock for this order" subtitle="Issues made against this order — what has gone to it from stock. Receipts and transfers do not name an order."
          actions={isPermitted('cf_erp_inventory_manage') && !locked && <MovementButtons types={['issue']} preset={{ orderId: o.id }} onPosted={moves.reload} />}>
          {moves.error && <Box sx={{ p: 2 }}><ErrorNotice error={moves.error} onRetry={moves.reload} /></Box>}
          <MovementsTable bare rows={moves.data ?? []} loading={moves.loading && !moves.data} empty="Nothing has been issued to this order yet." />
        </SectionCard>
      )}

      {tab === 'details' && <DetailsForm key={o.updatedAt} order={o} onSaved={(saved) => { orderSaved(saved); toast.success('Details saved.'); }} />}

      <OrderProcessDialog open={processOpen} onClose={() => setProcessOpen(false)} startAt={processStage}
        view={processView.data} loading={processView.loading} error={processView.error}
        order={o} production={production.data} productionError={production.error}
        onOrderSaved={orderSaved} onReleaseChanged={updateRelease} onReloadAll={reloadAll} />

      <ReleaseDialog line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? releasing.item?.name ?? 'This line'} ×${releasing.quantity}` } : null}
        onClose={() => setReleasing(null)}
        onReleased={() => { invalidateNavCounts(); toast.success(`Line ${releasing?.lineNo} released to production.`); reloadAll(); setTab('production'); }} />
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
