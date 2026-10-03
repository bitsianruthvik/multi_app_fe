import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import { getPurchaseBoard } from '../api/purchase';
import type { Party, SalesOrder } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { EmptyState, ErrorNotice, PageHeader, SkeletonBlock } from '../components/ui';
import { FilterBar } from '../components/FilterBar';
import { OrderPicker, PartyPicker } from '../components/ServerPicker';
import { PurchaseLanes } from '../components/Purchase/PurchaseLanes';
import { RequestItemsDialog } from '../components/Purchase/RequestItemsDialog';
import { useToast } from '../components/toastContext';

const idOf = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

/**
 * Purchase: every open purchase order in its lane — Requested, Stock checked, RFQ out, Quotes in, Ordered, Part
 * received, Received. A card opens the purchase order, where the next step for its lane is done. Filters live in the
 * URL (?order=&supplier=&q=) so a link from a sales order lands filtered.
 */
export default function PurchaseBoard() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [orderParam, setOrderParam] = useUrlParam('order', '');
  const [supplierParam, setSupplierParam] = useUrlParam('supplier', '');
  const [searchParam, setSearchParam] = useUrlParam('q', '');
  const [search, setSearch] = useState(searchParam);
  const [pickedOrder, setPickedOrder] = useState<SalesOrder | null>(null);
  const [pickedSupplier, setPickedSupplier] = useState<Party | null>(null);
  const [requesting, setRequesting] = useState(false);
  useNewParam(() => { if (canManage) setRequesting(true); });
  const orderId = idOf(orderParam);
  const supplierId = idOf(supplierParam);
  const term = useDebounced(search.trim());
  const load = useLoad(() => getPurchaseBoard({ orderId, supplierId, search: term }), [orderId, supplierId, term]);
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
      <PageHeader title="Purchase" subtitle="Each purchase order moves left to right: requested, stock checked, RFQ out, quotes in, ordered, received. Open a card to do its next step."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setRequesting(true)}>New request</Button>} />
      <FilterBar search={search} onSearch={(v) => { setSearch(v); setSearchParam(v); }} placeholder="Search number or supplier">
        <Box sx={{ width: { xs: '100%', sm: 260 } }}>
          <OrderPicker value={orderValue} openOnly={false} label="Sales order"
            onChange={(o) => { setPickedOrder(o); setOrderParam(o ? String(o.id) : ''); }} />
        </Box>
        <Box sx={{ width: { xs: '100%', sm: 260 } }}>
          <PartyPicker role="supplier" value={supplierValue} label="Supplier"
            onChange={(p) => { setPickedSupplier(p); setSupplierParam(p ? String(p.id) : ''); }} />
        </Box>
        {filtered && <Button size="small" onClick={() => { setOrderParam(''); setSupplierParam(''); setSearch(''); setSearchParam(''); setPickedOrder(null); setPickedSupplier(null); }}>Clear filters</Button>}
      </FilterBar>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {!load.data && !load.error && <SkeletonBlock h={260} r={8} />}
      {load.data && total === 0 && (
        <EmptyState icon={<ShoppingCartRounded />} title={filtered ? 'No purchase order matches' : 'Nothing to buy yet'}
          hint={filtered ? 'Clear the filters to see every purchase order.' : 'Request items from a sales order\'s Buying stage, or start a request here.'}
          action={canManage && !filtered ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setRequesting(true)}>New request</Button> : undefined} />
      )}
      {load.data && total > 0 && <PurchaseLanes lanes={lanes} />}
      {load.data && total > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>Received orders stay in the last lane for 30 days. Every order is under Purchase orders.</Typography>}
      <RequestItemsDialog open={requesting} order={null} onClose={() => setRequesting(false)}
        onRequested={(po) => { invalidateNavCounts(); toast.success(`${po.code} requested. Check stock next.`); navigate(appPath(company, `purchase-orders/${po.id}`)); }} />
    </Box>
  );
}
