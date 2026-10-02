import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import { getBuyingBoard } from '../api/buying';
import type { Party, SalesOrder } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { ErrorNotice, PageHeader, SkeletonBlock } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { OrderPicker, PartyPicker } from '../components/ServerPicker';
import { BuyingBoardView } from '../components/Buying/BuyingBoardView';

/**
 * Inventory › Buying — every procurement document on one board, by stage
 * (user, 2026-10-02): To buy → Requested → Approved → RFQ out → Quotes in →
 * Awarded → Ordered → Part received → Received, with Closed / cancelled behind
 * a toggle. Supplier, sales order and search filter ON THE SERVER, and live in
 * the URL so a link lands on the same view.
 */
export default function Buying() {
  const company = useCompanySlug();
  const [supplierParam, setSupplierParam] = useUrlParam('supplier', '');
  const [orderParam, setOrderParam] = useUrlParam('order', '');
  const [closed, setClosed] = useUrlParam('closed', '');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  // What the pickers show: the picked record, or (after a reload) the name the board read back.
  const [supplier, setSupplier] = useState<Party | null>(null);
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const supplierId = supplierParam ? Number(supplierParam) : null;
  const orderId = orderParam ? Number(orderParam) : null;
  const load = useLoad(() => getBuyingBoard({ supplierId, orderId, search: term, includeClosed: closed === '1' }), [supplierId, orderId, term, closed]);
  const board = load.data;
  const supplierValue = supplier ?? (board?.filters.supplier ? ({ ...board.filters.supplier, roles: ['supplier'] } as unknown as Party) : null);
  const orderValue = order ?? (board?.filters.order ? ({ ...board.filters.order, title: null, customer: null } as unknown as SalesOrder) : null);
  const docs = board ? board.columns.filter((c) => c.key !== 'to_buy').reduce((t, c) => t + c.count, 0) : 0;
  const filtered = !!(supplierId || orderId || term);

  return (
    <Box>
      <PageHeader title="Buying"
        subtitle="Every purchase request, RFQ and purchase order, by the stage it has reached. A document sits in one column — where the work on it is now — and leaves the board when the next document carries it on."
        actions={<Button startIcon={<RefreshRounded />} onClick={load.reload} disabled={load.loading}>Refresh</Button>} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number, supplier or item">
        <Box sx={{ width: 230 }}>
          <PartyPicker role="supplier" activeOnly={false} label="Supplier" value={supplierValue}
            onChange={(p) => { setSupplier(p); setSupplierParam(p ? String(p.id) : ''); }} />
        </Box>
        <Box sx={{ width: 230 }}>
          <OrderPicker openOnly={false} label="Sales order" value={orderValue}
            onChange={(o) => { setOrder(o); setOrderParam(o ? String(o.id) : ''); }} />
        </Box>
        <FacetChip label="Show closed / cancelled" active={closed === '1'} onClick={() => setClosed(closed === '1' ? '' : '1')} />
      </FilterBar>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {board ? (
        <Box sx={{ opacity: load.loading ? 0.6 : 1, transition: 'opacity var(--t-fast) var(--ease)' }} aria-busy={load.loading}>
          <Typography data-testid="board-summary" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1 }}>
            {docs} {docs === 1 ? 'document' : 'documents'}{filtered ? ' match' : ' in hand'}
            {board.filters.order ? ` · linked to ${board.filters.order.code} through its purchase request lines and the purchase orders bought for it` : ''}
            {board.filters.supplier ? ` · naming ${board.filters.supplier.name} (requests and the buy list have no supplier yet)` : ''}
          </Typography>
          <BuyingBoardView columns={board.columns} />
          {board.toBuy.items > 0 && !supplierId && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>
              <Box component={Link} to={appPath(company, 'buy-list')} sx={{ color: 'var(--c-primary-700)' }}>Open the buy list</Box> to raise a purchase request for what is short.
            </Typography>
          )}
        </Box>
      ) : !load.error && (
        <Box sx={{ display: 'flex', gap: 1, overflow: 'hidden' }} aria-busy="true" aria-label="Loading the board">
          {Array.from({ length: 6 }, (_, i) => <SkeletonBlock key={i} w={240} h={260} r={8} />)}
        </Box>
      )}
    </Box>
  );
}
