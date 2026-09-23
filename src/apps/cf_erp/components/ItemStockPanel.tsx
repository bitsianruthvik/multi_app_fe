import { Box, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { ItemStock, MasterRecord } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useNavigate } from 'react-router-dom';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { ErrorNotice, Mono, SectionCard, SkeletonRows } from './ui';
import { EntityList, EntityRow } from './EntityList';
import { MovementsTable, StockTable, TotalsStrip } from './StockTables';
import { MovementButtons } from './MovementButtons';

/** An item's Stock tab: totals by what they count as, every area and batch holding it, and its latest movements. */
export function ItemStockPanel({ record }: { record: MasterRecord }) {
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const navigate = useNavigate();
  const company = useCompanySlug();
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
        <StockTable bare rows={s.rows} hide={['item']} />
      </SectionCard>
      {(s.reservations ?? []).length > 0 && (
        <SectionCard title="Reserved for" subtitle="Stock set aside for released work. It moves freely between usable areas; nothing else may take it.">
          <EntityList>
            {(s.reservations ?? []).map((v) => (
              <EntityRow key={v.id} onClick={() => navigate(appPath(company, `orders/${v.order.id}?tab=production`))} code={<Mono chip>{v.order.code}</Mono>}
                primary={`Line ${v.lineNo}`} secondary={v.batch ? `Batch ${v.batch.code}` : undefined}
                trailing={<Mono>{qtyText(v.quantity)} {s.item.uom}</Mono>} />
            ))}
          </EntityList>
        </SectionCard>
      )}
      <SectionCard flush title="Latest movements"><MovementsTable bare rows={s.movements} /></SectionCard>
    </Box>
  );
}
