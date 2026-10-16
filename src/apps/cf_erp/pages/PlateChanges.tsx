import { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { CfApiError } from '../api/client';
import { listPlateChanges, type PlateChangeList } from '../api/plateChanges';
import { useCompanySlug } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, ListSkeleton, PageHeader } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { PlateChangeCard } from '../components/Nesting/PlateChange';

type Filter = 'pending' | 'open' | 'done' | 'all';
const FILTERS: [Filter, string][] = [['pending', 'Waiting for approval'], ['open', 'Open'], ['done', 'Done'], ['all', 'All']];
const EMPTY: Record<Filter, string> = {
  pending: 'Nothing is waiting for approval.',
  open: 'No plate change is waiting for approval or for the buyer.',
  done: 'No plate change is finished yet.',
  all: 'No plate change has been asked for yet.',
};

/**
 * PLATE CHANGES (init.sql §62): every change to a line's plates asked after a purchase order covers it, across
 * orders. The MD approves or rejects here; the buyer ticks the purchase-order changes of the approved ones.
 * Gated by "Approve plate changes" or the buying permission.
 */
export default function PlateChanges() {
  const company = useCompanySlug();
  const [filter, setFilter] = useUrlParam('status', 'pending');
  const want = (FILTERS.some(([f]) => f === filter) ? filter : 'pending') as Filter;
  const [data, setData] = useState<PlateChangeList | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    listPlateChanges(want).then(setData).catch((e) => setError(e as CfApiError));
  }, [want]);
  useEffect(() => { setData(null); load(); }, [load]);

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <PageHeader
        title="Plate changes"
        subtitle="Changes to a line's plates after a purchase order covers it. The MD approves them; the buyer then changes the purchase orders."
      />
      <FilterBar>
        {FILTERS.map(([f, label]) => (
          <FacetChip key={f} label={label} active={want === f} onClick={() => setFilter(f)}
            count={f === 'pending' && data ? data.counts.pending + data.counts.stale : undefined} />
        ))}
      </FilterBar>
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <ListSkeleton rows={4} />}
      {data && !data.requests.length && <EmptyState icon={<SwapHorizRounded />} title={EMPTY[want]} />}
      {data && data.requests.length > 0 && (
        <Box data-testid="plate-changes-list" sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
          {data.requests.map((r) => (
            <PlateChangeCard key={r.id} request={r} showLine lineHref={appPath(company, `orders/${r.order.id}`)} onChanged={load} />
          ))}
        </Box>
      )}
    </Box>
  );
}
