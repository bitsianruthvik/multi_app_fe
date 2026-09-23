import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import PauseCircleRounded from '@mui/icons-material/PauseCircleRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { cfApi, qs } from '../api/client';
import type { BatchDetail as BatchDetailT, BatchStatus, Movement } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { DataTable, type DataColumn } from '../components/DataTable';
import { BatchStatusBadge, PurposeChip } from '../components/inventoryUi';
import { SpecsTable } from '../components/SpecsTable';
import { MovementsTable } from '../components/StockTables';
import { ValueHistory } from '../components/ValueHistory';
import { PromptDialog } from '../components/PromptDialog';
import { BatchDialog } from '../components/BatchDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

type Location = BatchDetailT['locations'][number];
const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** Record / Detail (§4.3) for a batch: what it records, where it is, what happened to it. */
export default function BatchDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [tab, setTab] = useUrlParam('tab', 'overview');
  const bt = useLoad(() => cfApi.get<BatchDetailT>(`/batches/${id}`), [id]);
  const moves = useLoad(() => cfApi.get<Movement[]>(`/movements${qs({ batchId: id })}`), [id]);
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [version, setVersion] = useState(0);
  const b = bt.data;
  useDetailTitle(b?.code ?? null);
  if (bt.error) return <ErrorNotice error={bt.error} onRetry={bt.reload} />;
  if (!b) return <DetailSkeleton />;
  const to = (path: string) => appPath(company, path);
  const setTo = async (s: BatchStatus, note = '') => {
    bt.setData(await cfApi.post<BatchDetailT>(`/batches/${id}/status`, { status: s, note }));
    invalidateNavCounts();
    toast.success(s === 'available' ? 'Released.' : s === 'on_hold' ? 'On hold.' : 'Rejected.');
  };
  const locColumns: DataColumn<Location>[] = [
    { key: 'area', header: 'Area', alwaysVisible: true, sortValue: (l) => l.area.code, render: (l) => <><Mono><Box component={Link} to={to(`stocking-areas/${l.area.id}`)} sx={linkSx}>{l.area.code}</Box></Mono> {l.area.name}</> },
    { key: 'purpose', header: 'Counts as', alwaysVisible: true, render: (l) => <PurposeChip purpose={l.area.purpose} /> },
    { key: 'qty', header: 'Quantity', numeric: true, alwaysVisible: true, sortValue: (l) => l.quantity, render: (l) => <>{qtyText(l.quantity)} <Mono muted>{b.item.uom}</Mono></> },
  ];

  const header = (
    <DetailHeader code={b.code} badges={<BatchStatusBadge status={b.status} note={b.statusNote} />}
      title={<><Box component={Link} to={to(`items/${b.item.id}`)} sx={{ ...linkSx, fontFamily: 'var(--font-mono)' }}>{b.item.code}</Box> · {b.item.name}</>}
      subtitle={b.statusNote && b.status !== 'available' ? <Box component="span" sx={{ color: 'var(--c-warning-800)' }}>{b.statusNote}</Box> : undefined}
      actions={canManage && (
        <>
          {b.status !== 'available' && <Button variant="contained" startIcon={<CheckCircleRounded />} onClick={() => setTo('available')}>Release</Button>}
          {b.status !== 'on_hold' && <Button variant="outlined" startIcon={<PauseCircleRounded />} onClick={() => setStatus('on_hold')}>Put on hold</Button>}
          {b.status !== 'rejected' && <Button variant="outlined" color="error" startIcon={<CancelRounded />} onClick={() => setStatus('rejected')}>Reject</Button>}
          <Button startIcon={<EditRounded />} onClick={() => setEditing(true)} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>
        </>
      )}
      facts={(
        <>
          <Fact label="On hand"><Mono>{qtyText(b.onHand)} {b.item.uom}</Mono></Fact>
          <Fact label="Received"><Mono>{b.receivedOn ?? '—'}</Mono></Fact>
          <Fact label="Supplier">{b.supplier?.name ?? '—'}</Fact>
          <Fact label="Supplier’s lot"><Mono muted={!b.supplierRef}>{b.supplierRef ?? '—'}</Mono></Fact>
        </>
      )}>
      {b.notes && <Typography sx={{ mt: 2, color: 'var(--c-text-2)', fontSize: 13 }}>{b.notes}</Typography>}
    </DetailHeader>
  );
  const crossLinks = (
    <>
      <CrossLink icon={<Inventory2Rounded />} label={b.item.code ?? b.item.name} to={to(`items/${b.item.id}`)} />
      {b.supplier && <CrossLink icon={<PeopleRounded />} label={b.supplier.name} to={to('customers?role=supplier')} />}
      <CrossLink icon={<SwapHorizRounded />} label="Movements" count={moves.data?.length} onClick={() => setTab('movements')} />
    </>
  );

  return (
    <DetailLayout maxWidth={1200} header={header} crossLinks={crossLinks} active={tab} onTab={setTab}
      tabs={[{ value: 'overview', label: 'Overview' }, { value: 'movements', label: 'Movements', count: moves.data?.length }, { value: 'history', label: 'History' }]}>
      {tab === 'overview' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
          <SectionCard title="What this batch records" subtitle="Batch-level specifications of its item — required ones were entered when it was received. Corrections keep their history.">
            <SpecsTable resolution={b.specs} emptyHint="Its item records nothing per batch."
              onSave={canManage ? async (values) => { bt.setData(await cfApi.put<BatchDetailT>(`/batches/${id}/values`, { values })); setVersion((v) => v + 1); toast.success('Values saved.'); } : undefined} />
          </SectionCard>
          <SectionCard flush title="Where it is" subtitle="Every area holding some of it now.">
            <DataTable bare rows={b.locations} columns={locColumns} getRowId={(l) => l.area.id} empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>None left.</Typography>} />
          </SectionCard>
        </Box>
      )}
      {tab === 'movements' && (
        <SectionCard flush title="Movements" subtitle="Every receipt, issue, transfer and count that touched this batch.">
          {moves.error && <Box sx={{ p: 2 }}><ErrorNotice error={moves.error} onRetry={moves.reload} /></Box>}
          <MovementsTable bare rows={moves.data ?? []} loading={moves.loading && !moves.data} />
        </SectionCard>
      )}
      {tab === 'history' && <ValueHistory path={`/batches/${id}/history`} version={version} subtitle="Every change to a value this batch records — who, when, from what to what." />}
      <PromptDialog open={!!status} title={status === 'rejected' ? `Reject ${b.code}?` : `Put ${b.code} on hold?`} label="Why"
        body={status === 'rejected' ? 'A rejected batch is never issued; it can be moved or scrapped.' : 'Held stock is not issued until the batch is released.'}
        confirmLabel={status === 'rejected' ? 'Reject' : 'Hold'} danger={status === 'rejected'} onClose={() => setStatus(null)}
        onConfirm={(note) => setTo(status!, note)} />
      <BatchDialog open={editing} batch={b} onClose={() => setEditing(false)} onSaved={(nb) => { bt.setData(nb); toast.success('Saved.'); }} />
    </DetailLayout>
  );
}
