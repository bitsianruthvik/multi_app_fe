import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import { getPurchaseBoard } from '../api/purchase';
import type { Party, SalesOrder } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, PageHeader, SkeletonBlock } from '../components/ui';
import { FilterBar } from '../components/FilterBar';
import { OrderPicker, PartyPicker } from '../components/ServerPicker';
import { PurchaseLanes } from '../components/Purchase/PurchaseLanes';
import { RequisitionBoard } from '../components/Purchase/RequisitionBoard';

const idOf = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

/**
 * Purchase: every open purchase order in its lane — Requested, Stock checked, RFQ out, Quotes in, Ordered, Part
 * received, Received. A card opens the purchase order, where the next step for its lane is done. Filters live in the
 * URL (?order=&supplier=&q=) so a link from a sales order lands filtered.
 */
export default function PurchaseBoard() {
  const company = useCompanySlug();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [orderParam, setOrderParam] = useUrlParam('order', '');
  const [supplierParam, setSupplierParam] = useUrlParam('supplier', '');
  const [searchParam, setSearchParam] = useUrlParam('q', '');
  const [viewParam, setViewParam] = useUrlParam('view', 'requisitions');
  const view: 'requisitions' | 'orders' = viewParam === 'orders' ? 'orders' : 'requisitions';
  const [search, setSearch] = useState(searchParam);
  const [pickedOrder, setPickedOrder] = useState<SalesOrder | null>(null);
  const [pickedSupplier, setPickedSupplier] = useState<Party | null>(null);
  const orderId = idOf(orderParam);
  const supplierId = idOf(supplierParam);
  const term = useDebounced(search.trim());
  const load = useLoad(() => (view === 'orders' ? getPurchaseBoard({ orderId, supplierId, search: term }) : Promise.resolve(null)), [view, orderId, supplierId, term]);
  const lanes = load.data?.lanes ?? [];
  const cards = lanes.flatMap((l) => l.cards);
  const total = cards.length;

  // The URL holds the ids; the pickers need a record to show. Until one is picked, read it off the cards.
  const orderValue: SalesOrder | null = orderId == null ? null
    : pickedOrder?.id === orderId ? pickedOrder
      : ({ id: orderId, code: cards.find((c) => c.forOrder?.id === orderId)?.forOrder?.code ?? `Order ${orderId}`, title: null } as unknown as SalesOrder);
  const supplierValue: Party | null = supplierId == null ? null
    : pickedSupplier?.id === supplierId ? pickedSupplier
      : ({ id: supplierId, code: cards.find((c) => c.supplier?.id === supplierId)?.supplier?.code ?? '', name: cards.find((c) => c.supplier?.id === supplierId)?.supplier?.name ?? `Supplier ${supplierId}` } as Party);
  const filtered = orderId != null || supplierId != null || !!term;

  return (
    <Box>
      <PageHeader title="Purchase" subtitle={view === 'requisitions'
        ? 'Each requisition shows how its material is covered: held from stock, on order with a date, or skipped. Open one to decide the rest.'
        : 'Each purchase order moves left to right: requested, stock checked, RFQ out, quotes in, ordered, received. Open a card to do its next step.'}
        actions={canManage && view === 'orders' && <Button variant="outlined" startIcon={<AddRounded />} component={Link} to={appPath(company, 'purchase-orders?new=1')}>Buy for stock</Button>} />
      <Box role="tablist" aria-label="Purchase view" sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
        {([['requisitions', 'Requisitions'], ['orders', 'Purchase orders']] as const).map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={view === k} data-testid={`view-${k}`} size="small" variant={view === k ? 'contained' : 'outlined'} onClick={() => setViewParam(k)}>{l}</Button>
        ))}
      </Box>
      <FilterBar search={search} onSearch={(v) => { setSearch(v); setSearchParam(v); }} placeholder="Search number or supplier">
        <Box sx={{ width: { xs: '100%', sm: 260 } }}>
          <OrderPicker value={orderValue} openOnly={false} label="Sales order"
            onChange={(o) => { setPickedOrder(o); setOrderParam(o ? String(o.id) : ''); }} />
        </Box>
        {view === 'orders' && <Box sx={{ width: { xs: '100%', sm: 260 } }}>
          <PartyPicker role="supplier" value={supplierValue} label="Supplier"
            onChange={(p) => { setPickedSupplier(p); setSupplierParam(p ? String(p.id) : ''); }} />
        </Box>}
        {filtered && <Button size="small" onClick={() => { setOrderParam(''); setSupplierParam(''); setSearch(''); setSearchParam(''); setPickedOrder(null); setPickedSupplier(null); }}>Clear filters</Button>}
      </FilterBar>
      {view === 'requisitions' && <RequisitionBoard orderId={orderId} search={term} canManage={canManage} />}
      {view === 'orders' && <ErrorNotice error={load.error} onRetry={load.reload} />}
      {view === 'orders' && !load.data && !load.error && <SkeletonBlock h={260} r={8} />}
      {view === 'orders' && load.data && total === 0 && (
        <EmptyState icon={<ShoppingCartRounded />} title={filtered ? 'No purchase order matches' : 'Nothing to buy yet'}
          hint={filtered ? 'Clear the filters to see every purchase order.' : 'Request items from a sales order\'s Buying stage, or start a request here.'}
          action={canManage && !filtered ? <Button variant="outlined" startIcon={<AddRounded />} component={Link} to={appPath(company, 'purchase-orders?new=1')}>Buy for stock</Button> : undefined} />
      )}
      {view === 'orders' && load.data && total > 0 && <PurchaseLanes lanes={lanes} />}
      {view === 'orders' && load.data && total > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>Received orders stay in the last lane for 30 days. Every order is under Purchase orders.</Typography>}
    </Box>
  );
}
