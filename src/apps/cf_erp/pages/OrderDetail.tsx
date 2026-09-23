import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, CircularProgress, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { MasterRecord, Movement, OrderProduction, OrderStatus, Party, Release, SalesOrder, SalesOrderLine } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { recordPath } from '../lib/paths';
import { CONFIRM_MOVE, ORDER_STATUS_LABEL, transitionLabel } from '../lib/orders';
import {
  Badge, DangerBadge, DetailSkeleton, EmptyState, ErrorNotice, Fact, KindChip, Mono, OrderStatusBadge, OrderTypeChip, SectionCard, SkeletonRows, StatusBadge, WarnBadge,
} from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FormDialog } from '../components/FormDialog';
import { RecordPicker } from '../components/RecordPicker';
import { StructureTree } from '../components/StructureTree';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MovementsTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';
import { ReleaseDialog } from '../components/TrackerDialogs';
import { ReleaseView } from '../components/ReleaseView';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const LOCKED: OrderStatus[] = ['closed', 'lost', 'cancelled'];
const DELETABLE: OrderStatus[] = ['draft', 'inquiry', 'lost', 'cancelled'];
const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** A new line: a catalog item (standard) or a template definition (custom — its structure is created at once). */
function AddLineDialog({ order, open, onClose, onDone }: { order: SalesOrder; open: boolean; onClose: () => void; onDone: (o: SalesOrder) => void }) {
  const [rec, setRec] = useState<MasterRecord | null>(null);
  const [form, setForm] = useState({ quantity: '1', committedDate: '', description: '' });
  useEffect(() => { if (open) { setRec(null); setForm({ quantity: '1', committedDate: '', description: '' }); } }, [open]);
  const stock = order.orderType === 'stock';
  const save = async () => onDone(await cfApi.post<SalesOrder>(`/orders/${order.id}/lines`, { recordId: rec?.id ?? null, quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null }));
  const hint = rec?.kind === 'template'
    ? `Creates the temporary item this line sells from ${rec.code ?? rec.name}, with its whole Template BOM copied beneath it — as drafts.`
    : rec?.kind === 'catalog' ? 'A standard line: the catalog item as it is, with its Standard BOM if it has one.'
      : stock ? 'Stock orders make catalog items only.' : 'A catalog item for a standard line, or a template definition for a custom one.';
  return (
    <FormDialog open={open} title={<>Add a line to <Mono sx={{ fontSize: 'inherit' }}>{order.code}</Mono></>} onClose={onClose} onSubmit={save}
      submitLabel="Add line" busyLabel="Adding…" submitDisabled={!rec}>
      <RecordPicker kinds={stock ? ['catalog'] : ['catalog', 'template']} value={rec} onChange={setRec} activeOnly label="What it sells" autoFocus helperText={hint} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '140px minmax(0, 1fr)' }, gap: 2 }}>
        <TextField label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={rec?.kind === 'template' ? 'Identical copies' : undefined} />
        <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Empty = the order's date" />
      </Box>
      <TextField label="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="The customer's wording" />
    </FormDialog>
  );
}

/** Changes a line's quantity, date and wording. What it sells cannot change — remove it and add another. */
function EditOrderLineDialog({ line, onClose, onDone }: { line: SalesOrderLine | null; onClose: () => void; onDone: (o: SalesOrder) => void }) {
  const [form, setForm] = useState({ quantity: '', committedDate: '', description: '' });
  useEffect(() => { if (line) setForm({ quantity: String(line.quantity), committedDate: line.committedDate ?? '', description: line.description ?? '' }); }, [line]);
  const save = async () => onDone(await cfApi.put<SalesOrder>(`/order-lines/${line?.id}`, { quantity: form.quantity, committedDate: form.committedDate || null, description: form.description || null }));
  return (
    <FormDialog open={!!line} title={`Change line ${line?.lineNo ?? ''}`} onClose={onClose} onSubmit={save} maxWidth="xs"
      subtitle="What it sells cannot change — remove the line and add another.">
      <TextField label="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} autoFocus inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
      <TextField label="Committed date" type="date" value={form.committedDate} onChange={(e) => setForm({ ...form, committedDate: e.target.value })} InputLabelProps={{ shrink: true }} />
      <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </FormDialog>
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
  const locked = LOCKED.includes(order.status);
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

function structureText(l: SalesOrderLine) {
  if (l.lineType === 'custom' && l.structure) {
    const s = l.structure;
    return (
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13 }}>{s.temporaryItems} item{s.temporaryItems === 1 ? '' : 's'}</Typography>
        {s.drafts > 0 && <WarnBadge label={`${s.drafts} draft`} title="Release will need every temporary item active." />}
        {s.unresolvedSelections > 0 && <WarnBadge label={`${s.unresolvedSelections} to choose`} title="Selections still without a catalog item." />}
      </Box>
    );
  }
  if (l.bom) return <Typography sx={{ fontSize: 13 }}>Standard BOM <Mono>rev {l.bomRevision ?? '—'}</Mono>{l.bom.currentRevision !== l.bomRevision && <Mono muted> (now {l.bom.currentRevision ?? '—'})</Mono>}</Typography>;
  return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No BOM — bought or traded</Typography>;
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
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const moves = useLoad(() => (canStock ? cfApi.get<Movement[]>(`/movements${qs({ orderId: id })}`) : Promise.resolve([] as Movement[])), [id, canStock]);
  const [tab, setTab] = useUrlParam('tab', 'lines');
  const [structureLine, setStructureLine] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SalesOrderLine | null>(null);
  const [removing, setRemoving] = useState<SalesOrderLine | null>(null);
  const [moving, setMoving] = useState<OrderStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);

  const o = order.data;
  useDetailTitle(o ? o.code : null);
  const lines = useMemo(() => o?.lines ?? [], [o]);
  const shownLine = structureLine ?? lines.find((l) => l.lineType === 'custom')?.id ?? lines[0]?.id ?? null;

  const move = async (next: OrderStatus) => {
    setBusy(next); setActionError(null);
    try { order.setData(await cfApi.post<SalesOrder>(`/orders/${id}/status`, { status: next })); invalidateNavCounts(); toast.success(`${o?.code} is now ${ORDER_STATUS_LABEL[next].toLowerCase()}.`); } catch (e) { setActionError(e as CfApiError); } finally { setBusy(null); }
  };
  const openStructure = (l: SalesOrderLine) => { setStructureLine(l.id); setTab('structure'); };

  if (order.error) return <ErrorNotice error={order.error} onRetry={order.reload} />;
  if (!o) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const locked = LOCKED.includes(o.status);
  const editable = canManage && !locked;

  const lineColumns: DataColumn<SalesOrderLine>[] = [
    { key: 'no', header: 'Line', alwaysVisible: true, render: (l) => <Mono muted>{l.lineNo}</Mono> },
    {
      key: 'sells', header: 'Sells', alwaysVisible: true,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {l.item ? <Mono><Box component={Link} to={to(recordPath(l.item.kind, l.item.id))} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono> : <Mono muted>—</Mono>}
            {l.item && <KindChip kind={l.item.kind} />}
            {l.item && l.item.status !== 'active' && <StatusBadge status={l.item.status} />}
          </Box>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>
            {l.item?.name}{l.lineType === 'custom' ? ` · from ${l.design.code ?? l.design.name}` : ''}{l.description ? ` · “${l.description}”` : ''}
          </Typography>
        </Box>
      ),
    },
    { key: 'qty', header: 'Qty', numeric: true, alwaysVisible: true, render: (l) => <>{l.quantity}{l.item?.uom && <Mono muted> {l.item.uom}</Mono>}</> },
    { key: 'committed', header: 'Committed', alwaysVisible: true, render: (l) => <Mono muted={!l.committedDate}>{l.committedDate ?? o.committedDate ?? '—'}</Mono> },
    { key: 'structure', header: 'Structure', alwaysVisible: true, render: (l) => structureText(l) },
    ...(o.status === 'confirmed' || lines.some((l) => l.release) ? [{
      key: 'production', header: 'Production', alwaysVisible: true,
      render: (l: SalesOrderLine) => (l.release ? <Badge family="info" label="Released" title={`Released ${new Date(l.release.releasedAt).toLocaleDateString()}`} /> : <Badge family="neutral" noIcon label="Not released" />),
    }] : []),
  ];
  const updateRelease = (next: Release) => production.setData((cur) => (cur ? { ...cur, releases: cur.releases.map((x) => (x.id === next.id ? next : x)) } : cur));
  const reloadAll = () => { order.reload(); production.reload(); moves.reload(); };

  const header = (
    <DetailHeader code={o.code} title={o.title ?? 'Untitled'} subtitle={o.customer ? `${o.customer.name}${o.customerReference ? ` · their reference ${o.customerReference}` : ''}` : 'Made for stock'}
      badges={<><OrderTypeChip type={o.orderType} /><OrderStatusBadge status={o.status} />{o.overdue && <DangerBadge label="Past committed date" />}</>}
      actions={canManage && (
        <>
          {o.allowedTransitions.map((next) => (
            <Button key={next} variant={next === 'confirmed' || next === 'quoted' ? 'contained' : 'outlined'} color={next === 'cancelled' ? 'error' : 'primary'} disabled={!!busy}
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
    <DetailLayout header={header} crossLinks={crossLinks} tabs={tabs} active={tab} onTab={setTab}>
      {tab === 'lines' && (
        <SectionCard flush title="Lines" subtitle="Each line sells an item: a catalog item as it is, or a temporary item made for this order from a template."
          actions={editable && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add line</Button>}>
          <DataTable bare rows={lines} columns={lineColumns} getRowId={(l) => l.id}
            empty={<EmptyState title="No lines yet" hint={o.orderType === 'stock' ? 'Add the catalog items to make for stock.' : 'Add a catalog item, or a template definition — its whole structure is created on the spot.'}
              action={editable && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add line</Button>} />}
            rowActions={(l) => (
              <>
                <Tooltip title="Open its structure"><IconButton size="small" aria-label={`Structure of line ${l.lineNo}`} onClick={() => openStructure(l)}><AccountTreeRounded fontSize="small" /></IconButton></Tooltip>
                {canProduce && o.status === 'confirmed' && !l.release && <Button size="small" variant="outlined" startIcon={<RocketLaunchRounded />} onClick={() => setReleasing(l)}>Release</Button>}
                {editable && !l.release && <Tooltip title="Change"><IconButton size="small" aria-label={`Change line ${l.lineNo}`} onClick={() => setEditing(l)}><EditRounded fontSize="small" /></IconButton></Tooltip>}
                {editable && !l.release && <Tooltip title="Remove"><IconButton size="small" aria-label={`Remove line ${l.lineNo}`} onClick={() => setRemoving(l)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>}
              </>
            )} />
        </SectionCard>
      )}

      {tab === 'structure' && shownLine != null && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Line" value={shownLine} onChange={(e) => setStructureLine(Number(e.target.value))} sx={{ minWidth: { xs: '100%', sm: 280 }, maxWidth: '100%' }}>
              {lines.map((l) => <MenuItem key={l.id} value={l.id}>{`${l.lineNo} · ${l.item?.code ?? '—'} · ${l.item?.name ?? ''} ×${l.quantity}`}</MenuItem>)}
            </TextField>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 220 }}>
              {lines.find((l) => l.id === shownLine)?.lineType === 'custom'
                ? 'Temporary items are made for this order. Their codes are built from the order number and their place in the structure.'
                : 'A catalog item’s Standard BOM, shown for reference — change it on the item itself.'}
            </Typography>
          </Box>
          <StructureTree key={shownLine} lineId={shownLine} onChanged={order.reload} />
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

      {tab === 'details' && <DetailsForm key={o.updatedAt} order={o} onSaved={(saved) => { order.setData(saved); toast.success('Details saved.'); }} />}

      <ReleaseDialog line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? ''} ×${releasing.quantity}` } : null}
        onClose={() => setReleasing(null)}
        onReleased={() => { invalidateNavCounts(); toast.success(`Line ${releasing?.lineNo} released to production.`); reloadAll(); setTab('production'); }} />
      <AddLineDialog order={o} open={adding} onClose={() => setAdding(false)} onDone={(saved) => { order.setData(saved); toast.success('Line added.'); }} />
      <EditOrderLineDialog line={editing} onClose={() => setEditing(null)} onDone={(saved) => { order.setData(saved); toast.success('Line saved.'); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove line" title="Remove this line?"
        entityName={removing ? `${o.code} · line ${removing.lineNo} · ${removing.item?.code ?? removing.item?.name ?? ''}` : undefined}
        body={removing?.lineType === 'custom'
          ? `${removing.item?.code ?? 'Its temporary item'} and everything below it exist only for this order, so they are deleted with the line. Their codes are not given out again.`
          : 'The line goes; the catalog item stays.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { order.setData(await cfApi.del<SalesOrder>(`/order-lines/${removing?.id}`)); toast.success('Line removed.'); }} />
      <ConfirmDialog open={!!moving} title={moving ? `${transitionLabel(o.status, moving)}?` : ''} confirmLabel={moving ? transitionLabel(o.status, moving) : 'Confirm'} danger={moving === 'cancelled'}
        entityName={`${o.code}${o.title ? ` · ${o.title}` : ''}`} body={moving ? CONFIRM_MOVE[moving] ?? '' : ''}
        onClose={() => setMoving(null)}
        onConfirm={async () => { const next = moving!; order.setData(await cfApi.post<SalesOrder>(`/orders/${id}/status`, { status: next })); invalidateNavCounts(); toast.success(`${o.code} is now ${ORDER_STATUS_LABEL[next].toLowerCase()}.`); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete order" title="Delete this order?" entityName={`${o.code}${o.title ? ` · ${o.title}` : ''}`}
        body="The order, its lines and every temporary item made for it are deleted. Its number is not given out again."
        onClose={() => setDeleting(false)}
        onConfirm={async () => { await cfApi.del(`/orders/${id}`); invalidateNavCounts(); toast.success(`${o.code} deleted.`); navigate(to('orders')); }} />
    </DetailLayout>
  );
}
