import { Box, Button, Typography } from '@mui/material';
import { useState } from 'react';
import { cfApi } from '../api/client';
import { releaseHold } from '../api/procurement';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './toastContext';
import type { ItemReservation, ItemStock, MasterRecord } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useNavigate } from 'react-router-dom';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import { EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows } from './ui';
import { EntityList, EntityRow } from './EntityList';
import { MovementsTable, StockTable, TotalsStrip } from './StockTables';
import { MovementButtons } from './MovementButtons';

/** An item's Stock tab: totals by what they count as, every area and batch holding it, and its latest movements. */
export function ItemStockPanel({ record }: { record: MasterRecord }) {
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const navigate = useNavigate();
  const company = useCompanySlug();
  const toast = useToast();
  const [letting, setLetting] = useState<ItemReservation | null>(null);
  const st = useLoad(() => cfApi.get<ItemStock>(`/items/${record.id}/stock`), [record.id]);
  if (st.error) return <ErrorNotice error={st.error} onRetry={st.reload} />;
  if (!st.data) return <SkeletonRows rows={4} />;
  const s = st.data;
  if (!s.item.stockable) {
    return <SectionCard title="Stock"><Typography sx={{ color: 'var(--c-text-2)' }}>{record.code ?? record.name} is tracked unit by unit — its stock arrives with production, not through receipts.</Typography></SectionCard>;
  }
  const receivable = record.item?.itemType === 'catalog' && record.status === 'active';
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <TotalsStrip totals={s.totals} uom={s.item.uom} />
      <SectionCard flush title="Where it is" subtitle={s.item.trackedBy === 'batch' ? 'Kept by batch — each row is one batch in one area.' : 'Counted by quantity — one row per area.'}
        actions={canManage && <MovementButtons types={receivable ? ['receipt', 'transfer', 'adjustment'] : ['transfer', 'adjustment']} preset={{ item: record }} onPosted={st.reload} />}>
        <StockTable bare rows={s.rows} hide={['item']}
          empty={<EmptyState icon={<Inventory2Rounded />} title="None in stock"
            hint={canManage && receivable ? 'Use Receive above to book some in.' : 'Nothing has been booked in anywhere.'} />} />
      </SectionCard>
      {(s.reservations ?? []).length > 0 && (
        <SectionCard title="Claimed by a job" subtitle="Set aside for released work, finished and earmarked for the line that sells it, or held for the order it was bought for. Nothing else may take it.">
          <EntityList>
            {(s.reservations ?? []).map((v) => (
              <EntityRow key={v.id} onClick={() => navigate(appPath(company, `orders/${v.order.id}?tab=production`))} code={<Mono chip>{v.order.code}</Mono>}
                primary={v.kind === 'held' ? (v.purchaseOrder ? `Held — bought on ${v.purchaseOrder.code}` : 'Held for the order') : `Line ${v.lineNo}`} secondary={v.batch ? `Batch ${v.batch.code}` : undefined}
                trailing={<Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Mono>{qtyText(v.quantity)} {s.item.uom}</Mono>
                  {v.kind === 'held' && canManage && <Button size="small" color="warning" onClick={(e) => { e.stopPropagation(); setLetting(v); }}>Let go</Button>}
                </Box>} />
            ))}
          </EntityList>
        </SectionCard>
      )}
      <SectionCard flush title="Latest movements"><MovementsTable bare rows={s.movements} /></SectionCard>
      <ConfirmDialog open={!!letting} title="Let go of this hold?" confirmLabel="Let go"
        entityName={letting ? `${qtyText(letting.quantity)} ${s.item.uom} held for ${letting.order.code}` : ''}
        body="Let go of this hold? The stock becomes free for any job."
        onClose={() => setLetting(null)}
        onConfirm={async () => {
          if (!letting) return;
          await releaseHold(letting.id);
          toast.success('Let go — the stock is free.');
          st.reload();
        }} />
    </Box>
  );
}
