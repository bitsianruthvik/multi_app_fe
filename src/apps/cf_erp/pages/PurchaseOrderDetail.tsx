import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import { cfApi } from '../api/client';
import type { PurchaseLine, PurchaseOrder } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { PurchaseStatusBadge } from '../components/purchaseUi';
import { AddPurchaseLineDialog, ReceiveLineDialog, SendPurchaseDialog } from '../components/PurchaseDialogs';
import { PromptDialog } from '../components/PromptDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** One purchase order: what was asked for, what has arrived, and against which receipt. */
export default function PurchaseOrderDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const po = useLoad(() => cfApi.get<PurchaseOrder>(`/purchase-orders/${id}`), [id]);
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseLine | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const p = po.data;
  useDetailTitle(p?.code ?? null);
  if (po.error) return <ErrorNotice error={po.error} onRetry={po.reload} />;
  if (!p) return <DetailSkeleton />;

  const done = (next: PurchaseOrder, message: string) => { po.setData(next); invalidateNavCounts(); toast.success(message); };
  const removeLine = async (l: PurchaseLine) => {
    try { done(await cfApi.del<PurchaseOrder>(`/purchase-lines/${l.id}`), `${l.item.code ?? l.item.name} removed.`); }
    catch (e) { toast.error((e as Error).message); }
  };
  const open = p.status === 'draft' || p.status === 'ordered' || p.status === 'partially_received';
  const editable = canManage && open;

  const columns: DataColumn<PurchaseLine>[] = [
    { key: 'no', header: '#', alwaysVisible: true, render: (l) => <Mono muted>{l.lineNo}</Mono> },
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortValue: (l) => l.item.code ?? l.item.name,
      render: (l) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{l.item.name}</Typography>
        </Box>
      ),
    },
    { key: 'quantity', header: 'Ordered', numeric: true, alwaysVisible: true, sortValue: (l) => l.quantity, render: (l) => <>{qtyText(l.quantity)} <Mono muted>{l.item.uom}</Mono></> },
    { key: 'received', header: 'Received', numeric: true, sortValue: (l) => l.received, render: (l) => <Mono muted={!l.received}>{qtyText(l.received)}</Mono> },
    {
      key: 'outstanding', header: 'Outstanding', numeric: true, alwaysVisible: true, sortValue: (l) => l.outstanding,
      render: (l) => (l.outstanding > 0 ? <Mono>{qtyText(l.outstanding)}</Mono> : <Mono muted>—</Mono>),
    },
    { key: 'expected', header: 'Expected', sortValue: (l) => l.expectedDate, render: (l) => <Mono muted>{l.expectedDate ?? '—'}</Mono> },
    {
      key: 'receipts', header: 'Deliveries', exportValue: (l) => l.receipts.map((r) => r.code).join(' '),
      render: (l) => (l.receipts.length
        ? <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {l.receipts.map((r) => (
            <Box key={r.id} title={`${qtyText(r.quantity)} on ${r.date}`}>
              <Mono chip><Box component={Link} to={appPath(company, `movements/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono>
            </Box>
          ))}
        </Box>
        : <Mono muted>—</Mono>),
    },
  ];
  if (editable) {
    columns.push({
      key: 'actions', header: '', alwaysVisible: true,
      render: (l) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
          {p.status !== 'draft' && l.outstanding > 0 && (
            <Button size="small" variant="outlined" startIcon={<Inventory2Rounded />} onClick={() => setReceiving(l)}>Receive</Button>
          )}
          {!l.received && (
            <Tooltip title="Remove the line">
              <IconButton size="small" aria-label={`Remove ${l.item.code ?? l.item.name}`} onClick={() => removeLine(l)}><DeleteOutlineRounded fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Box>
      ),
    });
  }

  return (
    <DetailLayout
      header={
        <DetailHeader
          code={p.code}
          title={p.supplier?.name ?? 'No supplier yet'}
          subtitle={p.suggested ? 'Suggested from the buy list — running it again rewrites this order.' : undefined}
          badges={<PurchaseStatusBadge status={p.status} />}
          actions={canManage && <>
            {p.status === 'draft' && <Button variant="contained" startIcon={<SendRounded />} onClick={() => setSending(true)} disabled={!p.lines.length}>Send to supplier</Button>}
            {editable && <Button startIcon={<AddRounded />} onClick={() => setAdding(true)}>Add a line</Button>}
            {open && !p.totals.received && <Button color="error" startIcon={<BlockRounded />} onClick={() => setCancelling(true)}>Cancel</Button>}
          </>}
          facts={<>
            <Fact label="Supplier">{p.supplier ? p.supplier.name : <Typography component="span" sx={{ color: 'var(--c-text-3)' }}>Named when it is sent</Typography>}</Fact>
            <Fact label="Lines"><Mono>{p.totals.lines}</Mono></Fact>
            <Fact label="Ordered"><Mono>{qtyText(p.totals.ordered)}</Mono></Fact>
            <Fact label="Received"><Mono>{qtyText(p.totals.received)}</Mono></Fact>
            <Fact label="Outstanding"><Mono>{qtyText(p.totals.outstanding)}</Mono></Fact>
            <Fact label="Expected"><Mono muted>{p.expectedDate ?? '—'}</Mono></Fact>
          </>}
        />
      }
    >
      <SectionCard title="Lines" subtitle="Each line is one item. A delivery is booked against its line and posts an ordinary stock receipt.">
        <DataTable rows={p.lines} columns={columns} getRowId={(l) => l.id} bare storageKey="purchase-lines" exportName={`${p.code}-lines`}
          empty={<Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)', py: 2 }}>No lines yet — add what is being bought.</Typography>} />
      </SectionCard>
      {p.notes && <SectionCard title="Notes"><Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{p.notes}</Typography></SectionCard>}
      <AddPurchaseLineDialog orderId={adding ? p.id : null} onClose={() => setAdding(false)} onAdded={(n) => { setAdding(false); done(n, 'Line added.'); }} />
      <SendPurchaseDialog order={sending ? p : null} onClose={() => setSending(false)} onSent={(n) => { setSending(false); done(n, `${n.code} sent to ${n.supplier?.name ?? 'the supplier'}.`); }} />
      <ReceiveLineDialog line={receiving} orderCode={p.code} onClose={() => setReceiving(null)} onReceived={(n) => { setReceiving(null); done(n, 'Delivery booked into stock.'); }} />
      <PromptDialog open={cancelling} title={`Cancel ${p.code}?`} label="Why" confirmLabel="Cancel the order" danger
        body="Nothing has been received against it. It stays on the list under All."
        onClose={() => setCancelling(false)}
        onConfirm={async (reason: string) => { done(await cfApi.post<PurchaseOrder>(`/purchase-orders/${p.id}/cancel`, { reason }), `${p.code} cancelled.`); setCancelling(false); }} />
    </DetailLayout>
  );
}
