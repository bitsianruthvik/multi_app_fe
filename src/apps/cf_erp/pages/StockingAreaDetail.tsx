import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { cfApi } from '../api/client';
import type { AreaInventory } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { PURPOSE_HELP } from '../lib/inventory';
import { DetailSkeleton, EmptyState, ErrorNotice, Fact, Mono, SectionCard, StatusBadge } from '../components/ui';
import { CrossLink, DetailHeader, DetailLayout } from '../components/DetailLayout';
import { PurposeChip } from '../components/inventoryUi';
import { MovementsTable, StockTable, TotalsStrip } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';
import { AreaDialog } from '../components/AreaDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** Record / Detail (§4.3) for a stocking area: its inventory and what moved through it. */
export default function StockingAreaDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [tab, setTab] = useUrlParam('tab', 'inventory');
  const inv = useLoad(() => cfApi.get<AreaInventory>(`/stocking-areas/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const d = inv.data;
  useDetailTitle(d?.area.code ?? null);
  if (inv.error) return <ErrorNotice error={inv.error} onRetry={inv.reload} />;
  if (!d) return <DetailSkeleton />;
  const a = d.area;
  const to = (path: string) => appPath(company, path);

  const header = (
    <DetailHeader code={a.code} title={a.name} subtitle={PURPOSE_HELP[a.purpose]}
      badges={<><PurposeChip purpose={a.purpose} /><StatusBadge status={a.status} /></>}
      actions={canManage && (
        <>
          <MovementButtons types={a.purpose === 'quarantine' ? ['transfer', 'adjustment', 'scrap'] : ['receipt', 'issue', 'transfer', 'adjustment']} preset={{ areaId: a.id }} onPosted={inv.reload} />
          <Button startIcon={<EditRounded />} onClick={() => setEditing(true)} sx={{ color: 'var(--c-text-2)' }}>Edit</Button>
          <Tooltip title="Delete — only an area that never held stock"><IconButton aria-label="Delete area" onClick={() => setDeleting(true)}><DeleteOutlineRounded /></IconButton></Tooltip>
        </>
      )}
      facts={(
        <>
          <Fact label="Items held"><Mono>{new Set(d.rows.map((r) => r.item.id)).size}</Mono></Fact>
          <Fact label="Stock lines"><Mono>{d.rows.length}</Mono></Fact>
          {a.machine && <Fact label="Beside machine"><Mono><Box component={Link} to={to(`machines/${a.machine.id}`)} sx={linkSx}>{a.machine.code}</Box></Mono> {a.machine.name}</Fact>}
        </>
      )}>
      {a.notes && <Typography sx={{ mt: 2, color: 'var(--c-text-2)', fontSize: 13 }}>{a.notes}</Typography>}
    </DetailHeader>
  );
  const crossLinks = (
    <>
      <CrossLink icon={<Inventory2Rounded />} label="Inventory" count={d.rows.length} onClick={() => setTab('inventory')} />
      <CrossLink icon={<SwapHorizRounded />} label="Movements" count={d.movements.length} onClick={() => setTab('movements')} />
      {a.machine && <CrossLink icon={<PrecisionManufacturingRounded />} label={a.machine.code} to={to(`machines/${a.machine.id}`)} />}
    </>
  );

  return (
    <DetailLayout maxWidth={1200} header={header} crossLinks={crossLinks} active={tab} onTab={setTab}
      tabs={[{ value: 'inventory', label: 'Inventory', count: d.rows.length }, { value: 'movements', label: 'Movements', count: d.movements.length }]}>
      {tab === 'inventory' && (
        <>
          <TotalsStrip totals={d.totals} />
          <SectionCard flush title="Its inventory" subtitle="What this area holds now, by item and batch.">
            <StockTable bare rows={d.rows} hide={['area']}
              empty={<EmptyState icon={<Inventory2Rounded />} title="Nothing here now"
                hint={canManage ? 'Use Receive at the top of this page to book material into it.' : 'Nothing has been booked into this area.'} />} />
          </SectionCard>
        </>
      )}
      {tab === 'movements' && (
        <SectionCard flush title="Latest movements" subtitle={`The last ${d.movements.length} that came in, went out or were counted here, newest first.`}>
          <MovementsTable bare rows={d.movements} empty="Nothing has moved through it yet." />
        </SectionCard>
      )}
      <AreaDialog open={editing} existing={a} onClose={() => setEditing(false)} onSaved={(saved) => { toast.success(`${saved.code} saved.`); inv.reload(); }} />
      <ConfirmDialog open={deleting} danger confirmLabel="Delete" title="Delete this stocking area?" entityName={`${a.code} · ${a.name}`}
        body="Only an area that never held stock can be deleted — one with history is made inactive instead."
        onClose={() => setDeleting(false)} onConfirm={async () => { await cfApi.del(`/stocking-areas/${id}`); invalidateNavCounts(); toast.success('Deleted.'); navigate(to('stocking-areas')); }} />
    </DetailLayout>
  );
}
