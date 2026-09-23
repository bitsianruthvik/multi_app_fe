import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import UndoRounded from '@mui/icons-material/UndoRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { cfApi } from '../api/client';
import type { MovementDetail as MovementDetailT, MovementLine } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { BatchStatusBadge, MovementTypeChip } from '../components/inventoryUi';
import { PromptDialog } from '../components/PromptDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** Record / Detail (§4.3) for a stock movement: its lines, where each went, and its reversal. */
export default function MovementDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const mv = useLoad(() => cfApi.get<MovementDetailT>(`/movements/${id}`), [id]);
  const [reversing, setReversing] = useState(false);
  const m = mv.data;
  useDetailTitle(m?.code ?? null);
  if (mv.error) return <ErrorNotice error={mv.error} onRetry={mv.reload} />;
  if (!m) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const area = (a: MovementLine['from']) => (a ? <Mono><Box component={Link} to={to(`stocking-areas/${a.id}`)} sx={linkSx} title={a.name}>{a.code}</Box></Mono> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>);
  const canReverse = canManage && !m.reversalOf && !m.reversedBy;
  const isCount = m.movementType === 'adjustment';

  const columns: DataColumn<MovementLine>[] = [
    { key: 'no', header: '#', render: (l) => <Mono muted>{l.lineNo}</Mono>, alwaysVisible: true },
    {
      key: 'item', header: 'Item', alwaysVisible: true,
      render: (l) => <Box sx={{ py: 0.5 }}><Mono><Box component={Link} to={to(`items/${l.item.id}`)} sx={linkSx}>{l.item.code ?? '—'}</Box></Mono><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{l.item.name}</Typography></Box>,
    },
    {
      key: 'batch', header: 'Batch', alwaysVisible: true,
      render: (l) => (l.batch ? <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Mono><Box component={Link} to={to(`batches/${l.batch.id}`)} sx={linkSx}>{l.batch.code}</Box></Mono>{l.batch.status !== 'available' && <BatchStatusBadge status={l.batch.status} />}</Box> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>),
    },
    { key: 'from', header: 'From', render: (l) => area(l.from), alwaysVisible: true },
    { key: 'to', header: 'To', render: (l) => area(l.to), alwaysVisible: true },
    {
      key: 'qty', header: isCount ? 'Change' : 'Quantity', numeric: true, alwaysVisible: true,
      render: (l) => <>{isCount ? `${l.change > 0 ? '+' : ''}${qtyText(l.change)}` : qtyText(l.quantity)} <Mono muted>{l.item.uom}</Mono></>,
    },
  ];

  const header = (
    <DetailHeader code={m.code} subtitle={m.reason ?? undefined}
      badges={<MovementTypeChip type={m.movementType} reversal={!!m.reversalOf} />}
      actions={canReverse && <Button variant="outlined" startIcon={<UndoRounded />} onClick={() => setReversing(true)}>Reverse</Button>}
      facts={(
        <>
          <Fact label="Date"><Mono>{m.movementDate}</Mono></Fact>
          {m.party && <Fact label="Supplier">{m.party.name}</Fact>}
          {m.order && <Fact label="For order"><Mono><Box component={Link} to={to(`orders/${m.order.id}`)} sx={linkSx}>{m.order.code}</Box></Mono></Fact>}
          {m.reference && <Fact label="Reference"><Mono>{m.reference}</Mono></Fact>}
          <Fact label="Lines"><Mono>{m.lines.length}</Mono></Fact>
          <Fact label="Posted"><Mono muted>{new Date(m.createdAt).toLocaleString()}</Mono></Fact>
        </>
      )}>
      {m.notes && <Typography sx={{ mt: 2, color: 'var(--c-text-2)', fontSize: 13 }}>{m.notes}</Typography>}
    </DetailHeader>
  );
  const crossLinks = (m.reversedBy || m.reversalOf || m.order || m.party) ? (
    <>
      {m.reversedBy && <CrossLink icon={<UndoRounded />} label={`Reversed by ${m.reversedBy.code}`} to={to(`movements/${m.reversedBy.id}`)} />}
      {m.reversalOf && <CrossLink icon={<SwapHorizRounded />} label={`Reverses ${m.reversalOf.code}`} to={to(`movements/${m.reversalOf.id}`)} />}
      {m.order && <CrossLink icon={<ReceiptLongRounded />} label={`Order ${m.order.code}`} to={to(`orders/${m.order.id}`)} />}
      {m.party && <CrossLink icon={<PeopleRounded />} label={m.party.name} to={to('customers?role=all')} />}
    </>
  ) : undefined;

  return (
    <DetailLayout maxWidth={1100} header={header} crossLinks={crossLinks}>
      <SectionCard flush title="Lines" subtitle={isCount ? 'Each line posts the difference between what was counted and what was recorded.' : 'What moved, from where to where.'}>
        <DataTable bare rows={m.lines} columns={columns} getRowId={(l) => l.lineNo} />
      </SectionCard>
      <PromptDialog open={reversing} title={`Reverse ${m.code}?`} label="Why" confirmLabel="Reverse" danger
        body="Posts the exact opposite, dated today; both stay in the ledger. Refused if the stock it put somewhere has since moved on."
        onClose={() => setReversing(false)}
        onConfirm={async (reason) => { const rev = await cfApi.post<MovementDetailT>(`/movements/${id}/reverse`, { reason }); invalidateNavCounts(); toast.success(`${rev.code} posted.`); navigate(to(`movements/${rev.id}`)); }} />
    </DetailLayout>
  );
}
