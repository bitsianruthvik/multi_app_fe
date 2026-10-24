import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import MoveToInboxRounded from '@mui/icons-material/MoveToInboxRounded';
import { cfApi } from '../api/client';
import type { PurchaseLine, PurchaseOrder } from '../api/types';
import { getPendingLines, type PendingLine } from '../api/purchaseRequests';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonBlock } from '../components/ui';
import { FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { ReceiveLineDialog } from '../components/PurchaseDialogs';
import { GrnDialog } from '../components/GrnDialog';
import { useToast } from '../components/toastContext';
import { FullScreenFrame, FullScreenToggle } from '../components/FullScreen';
import { useFullScreen } from '../hooks/useFullScreen';
import { FadeIn, FlashOnChange, SuccessCheck, celebrate } from '../motion';
import { useSavedCheck } from '../hooks/useSavedCheck';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * Stores › Receive against PO (§71): every line still pending on a purchase order that waits for goods (approved by
 * the MD, or the customer's own ₹0 PO). Each GRN is an ordinary stock receipt; a PO may take several. What arrives is
 * earmarked to the order(s) the PO line serves — nobody else can use it. When everything is in, the PO closes.
 */
export default function ReceiveAgainstPo() {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [poParam] = useUrlParam('po', '');
  const [search, setSearch] = useState(poParam);
  const term = useDebounced(search.trim());
  const load = useLoad(() => getPendingLines({ search: term }), [term]);
  const full = useFullScreen('receive');
  const [receiving, setReceiving] = useState<{ po: PurchaseOrder; line: PurchaseLine } | null>(null);
  const rows = load.data?.rows ?? [];
  // Motion: a tick in the header once a GRN is booked; a GRN that completes its PO celebrates (once, rare milestone).
  const [bookedTick, markBooked] = useSavedCheck();
  const booked = (closedPo: boolean) => { markBooked(); if (closedPo) celebrate(); };

  const open = async (r: PendingLine) => {
    try {
      const po = await cfApi.get<PurchaseOrder>(`/purchase-orders/${r.purchaseOrder.id}`);
      const line = po.lines.find((l) => l.id === r.line.id);
      if (line) setReceiving({ po, line });
    } catch (e) { toast.error((e as Error).message); }
  };

  const columns: DataColumn<PendingLine>[] = [
    {
      key: 'po', header: 'Purchase order', alwaysVisible: true, sortValue: (r) => r.purchaseOrder.code,
      render: (r) => (
        <Box sx={{ py: 0.5 }}>
          <Mono chip><Box component={Link} to={appPath(company, `purchase-orders/${r.purchaseOrder.id}`)} sx={linkSx}>{r.purchaseOrder.code}</Box></Mono>
          {r.purchaseOrder.suppliedByCustomer && <Box sx={{ mt: 0.25 }}><Badge family="info" label="Customer supplies" /></Box>}
        </Box>
      ),
    },
    { key: 'vendor', header: 'Vendor', sortValue: (r) => r.supplier?.name ?? '', render: (r) => <>{r.supplier?.name ?? '—'}</> },
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortValue: (r) => r.item.code ?? r.item.name,
      render: (r) => <Box><Mono>{r.item.code ?? '—'}</Mono><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{r.item.name}</Typography></Box>,
    },
    { key: 'ordered', header: 'Ordered', numeric: true, sortValue: (r) => r.ordered, render: (r) => <Mono>{qtyText(r.ordered)}</Mono> },
    { key: 'received', header: 'Received', numeric: true, sortValue: (r) => r.received, render: (r) => <Mono muted={!r.received}>{qtyText(r.received)}</Mono> },
    { key: 'pending', header: 'Pending', numeric: true, alwaysVisible: true, sortValue: (r) => r.pending, render: (r) => <><FlashOnChange value={r.pending}><Mono>{qtyText(r.pending)}</Mono></FlashOnChange> <Mono muted>{r.item.uom}</Mono></> },
    { key: 'due', header: 'Due', sortValue: (r) => r.expectedDate, render: (r) => <Mono muted>{r.expectedDate ?? '—'}</Mono> },
    { key: 'for', header: 'For', render: (r) => (r.forOrders.length ? <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{r.forOrders.map((c) => <Mono key={c} chip>{c}</Mono>)}</Box> : <Mono muted>stock</Mono>) },
  ];
  if (canManage) {
    columns.push({
      key: 'receive', header: '', alwaysVisible: true,
      render: (r) => <Button size="small" variant="outlined" startIcon={<MoveToInboxRounded />} onClick={(e) => { e.stopPropagation(); void open(r); }} data-testid="receive-line">Receive</Button>,
    });
  }

  return (
    <FullScreenFrame on={full.on} onExit={() => full.set(false)}>
    <Box>
      <PageHeader title="Receive against PO" subtitle="Lines still pending on purchase orders that wait for goods. Each receipt is a GRN; a PO may take several. What arrives is locked for the order it was bought for."
        actions={<>{bookedTick > 0 && <SuccessCheck key={bookedTick} size={22} label="GRN booked" style={{ alignSelf: 'center' }} />}<FullScreenToggle on={full.on} onToggle={full.toggle} /></>} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search PO, vendor or item" />
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {!load.data && !load.error && <SkeletonBlock h={240} r={8} />}
      {load.data && (
        <FadeIn variant="rise">
        <DataTable rows={rows} columns={columns} getRowId={(r) => r.line.id} storageKey="receive-against-po" exportName="pending-po-lines"
          empty={<EmptyState icon={<MoveToInboxRounded />} title={term ? 'Nothing pending matches' : 'Nothing is waiting to be received'}
            hint={term ? 'Clear the search.' : 'A purchase order shows here once Management approves it.'} />} />
        </FadeIn>
      )}
      {/* §80: a supplier's PO is booked as a GRN with the money (invoice, price, GST, freight); the customer's own material keeps the plain dialog. */}
      <GrnDialog po={receiving && !receiving.po.suppliedByCustomer ? receiving.po : null} lineId={receiving?.line.id ?? null}
        onClose={() => setReceiving(null)}
        onReceived={(res) => {
          setReceiving(null);
          load.reload();
          invalidateNavCounts();
          const held = res.held ?? [];
          const base = held.length ? `GRN booked. ${held.map((h) => `${qtyText(h.quantity)} locked for ${h.orderCode}`).join('; ')}.` : 'GRN booked into stock.';
          const flag = res.bill.invoice.pending ? ' The supplier invoice is marked to follow.' : '';
          const closed = res.order.stage === 'closed' ? ` ${res.order.code} is closed — everything is in.` : '';
          toast.success(base + flag + closed);
          booked(res.order.stage === 'closed');
        }} />
      <ReceiveLineDialog line={receiving && receiving.po.suppliedByCustomer ? receiving.line : null} orderCode={receiving?.po.code ?? null} customer={!!receiving?.po.suppliedByCustomer}
        onClose={() => setReceiving(null)}
        onReceived={(next, held, x) => {
          setReceiving(null);
          load.reload();
          invalidateNavCounts();
          const base = held.length ? `GRN booked. ${held.map((h) => `${qtyText(h.quantity)} locked for ${h.orderCode}`).join('; ')}.` : 'GRN booked into stock.';
          const closed = next.stage === 'closed' ? ` ${next.code} is closed — everything is in.` : '';
          toast.success([base + closed, x?.substitute, x?.extra].filter(Boolean).join(' '));
          booked(next.stage === 'closed');
        }} />
    </Box>
    </FullScreenFrame>
  );
}
