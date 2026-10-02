import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import type { CfApiError } from '../../api/client';
import { getBuyingBoard } from '../../api/buying';
import { raiseFromBuyList } from '../../api/procurement';
import type { OrderStage, SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { qtyText } from '../../lib/inventory';
import { NOT_PRICED, stillToRequest } from '../../lib/buying';
import { rupeeText } from '../../lib/money';
import { ErrorNotice, Mono, SectionCard, SkeletonBlock } from '../ui';
import { useToast } from '../toastContext';
import { StageStateBadge } from '../OrderProcess/stageUi';
import { BuyingBoardView } from './BuyingBoardView';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };


/**
 * The order's Buying stage (user, 2026-10-02: "the sales order's Buying stage
 * showing its material through the same stages"): the board for THIS order —
 * the documents its purchase request lines reached, by stage — then what is
 * still to raise, with "Raise purchase request". The stage's own readiness
 * (confirm first, freeze first, nest first) is the process's, shown above this
 * by the stage body; nothing here works it out again.
 */
export function OrderBuyingPanel({ order, stage }: { order: SalesOrder; stage: OrderStage }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canView = isPermitted('cf_erp_inventory_view');
  const canManage = isPermitted('cf_erp_inventory_manage');
  const [busy, setBusy] = useState(false);
  const load = useLoad(() => (canView ? getBuyingBoard({ orderId: order.id, withRows: true, includeClosed: false, limit: 30 }) : Promise.resolve(null)), [order.id, canView]);
  const board = load.data;
  const rows = board?.toBuy.rows ?? [];
  const raise = stillToRequest(rows);
  const waiting = !!stage.waitingOn && stage.state !== 'done';

  const raiseRequest = async () => {
    setBusy(true);
    try {
      const made = await raiseFromBuyList({ rows: raise });
      invalidateNavCounts();
      toast.success(`${made.code} drafted for ${order.code}. Check it, then submit it for approval.`);
      navigate(appPath(company, `purchase-requests/${made.id}`));
    } catch (e) {
      toast.error((e as CfApiError).code === 'NOTHING_TO_REQUEST' ? 'Everything short is already in a purchase request or an RFQ.' : (e as Error).message ?? 'The request could not be raised.');
      load.reload();
    } finally { setBusy(false); }
  };

  const estimate = raise.length ? rows.filter((r) => r.toRequest > 0).reduce((t, r) => t + (r.estCost ?? 0), 0) : 0;
  const unpriced = rows.filter((r) => r.toRequest > 0 && r.estCost == null).length;
  return (
    <SectionCard title="Buying" subtitle={`${order.code}'s material through the buying stages: the documents that cover it, and what is still to raise.`}
      actions={canView ? <Button size="small" endIcon={<LaunchRounded />} component={Link} to={`${appPath(company, 'buying')}?order=${order.id}`}>Open on the Buying board</Button> : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StageStateBadge stage={stage} />
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 240px', minWidth: 0 }}>{stage.detail}</Typography>
        </Box>
        {!canView && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Seeing the buying documents needs the inventory view permission.</Typography>}
        <ErrorNotice error={load.error} onRetry={load.reload} />
        {canView && !board && !load.error && <SkeletonBlock h={180} r={8} />}
        {board && (
          <>
            <Box data-testid="order-buying-raise" sx={{ display: 'grid', gap: 1 }}>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 13.5 }}>
                  {raise.length
                    ? <><strong>{raise.length} {raise.length === 1 ? 'item' : 'items'} still to request</strong>{' '}— about {estimate > 0 ? rupeeText(estimate, 0) : NOT_PRICED}{unpriced > 0 && estimate > 0 ? ` + ${unpriced} not priced` : ''}.</>
                    : rows.length ? 'Everything short is already in a purchase request, an RFQ or on order.' : 'Nothing of this order is short on the buy list.'}
                </Typography>
                {canManage && raise.length > 0 && (
                  <Button variant="contained" size="small" startIcon={<PlaylistAddCheckRounded />} disabled={busy || waiting} onClick={() => void raiseRequest()}>
                    Raise purchase request
                  </Button>
                )}
              </Box>
              {rows.length > 0 && (
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, '& td, & th': { py: 0.5, px: 0.75, borderBottom: '1px solid var(--c-divider)', textAlign: 'left', verticalAlign: 'top' }, '& th': { color: 'var(--c-text-3)', fontWeight: 500 } }}>
                  <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Short</th><th style={{ textAlign: 'right' }}>To request</th><th>Being handled</th><th style={{ textAlign: 'right' }}>Est.</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.item.id}:${i}`} data-testid="order-buy-row">
                        <td><Mono><Box component={Link} to={appPath(company, `items/${r.item.id}`)} sx={linkSx}>{r.item.code ?? r.item.name}</Box></Mono>
                          {r.planned && <Box component="span" sx={{ ml: 0.5, fontSize: 11, color: 'var(--c-info-700)' }}>planned</Box>}
                          {r.sharedWith.length > 0 && <Box sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>shared with {r.sharedWith.map((o) => o.code).join(', ')} — the quantity is the item's whole shortage</Box>}
                        </td>
                        <td style={{ textAlign: 'right' }}><Mono>{qtyText(r.toBuy)}</Mono> <Mono muted>{r.item.uom}</Mono></td>
                        <td style={{ textAlign: 'right' }}><Mono muted={!r.toRequest}>{qtyText(r.toRequest)}</Mono></td>
                        <td>
                          {[...r.purchaseRequests.map((d) => ({ ...d, to: `purchase-requests/${d.id}` })), ...r.rfqs.map((d) => ({ ...d, to: `rfqs/${d.id}` })), ...r.purchaseOrders.map((d) => ({ ...d, to: `purchase-orders/${d.id}` }))]
                            .map((d) => <Box key={d.to} component={Link} to={appPath(company, d.to)} sx={{ ...linkSx, mr: 0.75, fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{d.code}</Box>)}
                          {!r.purchaseRequests.length && !r.rfqs.length && !r.purchaseOrders.length && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>}
                        </td>
                        <td style={{ textAlign: 'right' }}><Mono muted={r.estCost == null}>{r.estCost == null ? (r.toRequest > 0 ? NOT_PRICED : '—') : rupeeText(r.estCost, 0)}</Mono></td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              )}
            </Box>
            <BuyingBoardView columns={board.columns} compact />
            {(board.receipts?.length ?? 0) > 0 && (
              <Box data-testid="order-receipts" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                Receipts: {board.receipts!.map((r) => (
                  <Box key={r.id} component={Link} to={appPath(company, r.link)} sx={{ ...linkSx, mr: 1, fontFamily: 'var(--font-mono)' }} title={`${r.purchaseOrder.code}, ${String(r.date).slice(0, 10)}`}>{r.code}</Box>
                ))}
              </Box>
            )}
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              Documents are linked to this order through the buy list: a purchase request raised from it keeps the order on each line, and its RFQs and purchase orders follow. A purchase order raised by hand or by “Suggest what to buy” names no order, so it is not shown here.
            </Typography>
          </>
        )}
      </Box>
    </SectionCard>
  );
}
