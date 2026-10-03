import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import { getOrderPurchase } from '../../api/purchase';
import type { OrderStage, SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { qtyText } from '../../lib/inventory';
import { ErrorNotice, Mono, SectionCard, SkeletonBlock } from '../ui';
import { useToast } from '../toastContext';
import { StageStateBadge } from '../OrderProcess/stageUi';
import { PurchaseLanes } from './PurchaseLanes';
import { RequestItemsDialog } from './RequestItemsDialog';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * The order's Buying stage: ask for the material straight from the sales order ("Request items"), then watch its
 * purchase orders move through the same lanes as the Purchase tab. After the request everything is the purchase
 * order's: stock check, RFQs, quotes, placing, timeline, GRN. Stock held for this order is listed below.
 */
export function OrderPurchasePanel({ order, stage }: { order: SalesOrder; stage: OrderStage }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canView = isPermitted('cf_erp_inventory_view');
  const canManage = isPermitted('cf_erp_inventory_manage');
  const [requesting, setRequesting] = useState(false);
  const load = useLoad(() => (canView ? getOrderPurchase(order.id) : Promise.resolve(null)), [order.id, canView]);
  const data = load.data;
  const short = data?.shortfall ?? [];
  const pos = data ? data.lanes.reduce((t, l) => t + l.count, 0) : 0;

  return (
    <SectionCard title="Buying" subtitle={`${order.code}'s material: request it from here, then its purchase orders carry it through to the goods receipt.`}
      actions={canView ? <Button size="small" endIcon={<LaunchRounded />} component={Link} to={`${appPath(company, 'purchase')}?order=${order.id}`}>Open on the Purchase board</Button> : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StageStateBadge stage={stage} />
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 240px', minWidth: 0 }}>{stage.detail}</Typography>
        </Box>
        {!canView && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Seeing the purchase orders needs the inventory view permission.</Typography>}
        <ErrorNotice error={load.error} onRetry={load.reload} />
        {canView && !data && !load.error && <SkeletonBlock h={180} r={8} />}
        {data && (
          <>
            <Box data-testid="order-purchase-request" sx={{ display: 'grid', gap: 1 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 13.5 }}>
                  {short.length
                    ? <><strong>{short.length} {short.length === 1 ? 'item' : 'items'} short</strong> and not on a purchase order yet.</>
                    : pos ? 'Nothing more is short — what was asked for is on a purchase order below.' : 'Nothing of this order is short.'}
                </Typography>
                {canManage && (
                  <Button variant="contained" startIcon={<PlaylistAddCheckRounded />} onClick={() => setRequesting(true)}>Request items</Button>
                )}
              </Box>
              {short.length > 0 && (
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, '& td, & th': { py: 0.5, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left', verticalAlign: 'top' }, '& th': { color: 'var(--c-text-3)', fontWeight: 500 } }}>
                  <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Short</th></tr></thead>
                  <tbody>
                    {short.map((r) => (
                      <tr key={r.item.id} data-testid="order-short-row">
                        <td><Mono><Box component={Link} to={appPath(company, `items/${r.item.id}`)} sx={linkSx}>{r.item.code ?? r.item.name}</Box></Mono>{r.item.code && <Box sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{r.item.name}</Box>}</td>
                        <td style={{ textAlign: 'right' }}><Mono>{qtyText(r.toBuy)}</Mono> <Mono muted>{r.uom}</Mono></td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              )}
            </Box>
            <PurchaseLanes lanes={data.lanes} compact />
            {(data.held?.rows.length ?? 0) > 0 && (
              <Box data-testid="order-held" sx={{ display: 'grid', gap: 0.5 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Held for this order</Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Taken from stock at the stock check, or arrived on a purchase order bought for this order. Release uses it first.</Typography>
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, '& td, & th': { py: 0.5, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left', verticalAlign: 'top' }, '& th': { color: 'var(--c-text-3)', fontWeight: 500 } }}>
                  <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Held</th><th>Batch</th><th>Purchase order</th></tr></thead>
                  <tbody>
                    {data.held!.rows.map((h) => (
                      <tr key={h.id} data-testid="order-held-row">
                        <td><Mono><Box component={Link} to={appPath(company, `items/${h.item.id}`)} sx={linkSx}>{h.item.code ?? h.item.name}</Box></Mono>{h.item.code && <Box sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{h.item.name}</Box>}</td>
                        <td style={{ textAlign: 'right' }}><Mono>{qtyText(h.quantity)}</Mono> <Mono muted>{h.item.uom}</Mono></td>
                        <td>{h.batch ? <Mono>{h.batch.code}</Mono> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>}</td>
                        <td>{h.purchaseOrder ? <Box component={Link} to={appPath(company, `purchase-orders/${h.purchaseOrder.id}`)} sx={{ ...linkSx, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{h.purchaseOrder.code}</Box> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>from stock</Box>}</td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
      <RequestItemsDialog open={requesting} order={{ id: order.id, code: order.code }} onClose={() => setRequesting(false)}
        onRequested={(po) => { invalidateNavCounts(); toast.success(`${po.code} requested for ${order.code}. Check stock next.`); navigate(appPath(company, `purchase-orders/${po.id}`)); }} />
    </SectionCard>
  );
}
