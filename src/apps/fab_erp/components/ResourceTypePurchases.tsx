/**
 * ResourceTypePurchases — what has been ordered against this machine TYPE.
 *
 * The other half of BuyMachineDialog. Raising a purchase order for a new
 * machine worked, and then the order vanished from view: the only place it
 * appeared was the Orders board, mixed in with material POs, with nothing
 * saying which machine type it was for. Asking "have we already ordered another
 * plate cutter" had no answer short of reading every purchase order.
 *
 * Machine purchases only. Spares are raised against a specific RESOURCE and are
 * shown on that machine's panel, because "what has this table cost us" and
 * "what have we spent on tables in general" are different questions and merging
 * them answers neither.
 */

import { useCallback, useEffect, useState } from 'react';
import { Box, Chip, CircularProgress, Typography } from '@mui/material';

import { fetchAssetPurchases, type AssetPurchase } from '../api/assets';
import { Mono } from '../components';

const money = (n: number | null, ccy: string | null) =>
  n == null ? '—' : `${ccy ? `${ccy} ` : ''}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function ResourceTypePurchases({ resourceTypeId, refreshKey }: {
  resourceTypeId: number;
  /** Bumped by the caller after a PO is raised, so the list follows along. */
  refreshKey?: number;
}) {
  const [orders, setOrders] = useState<AssetPurchase[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchAssetPurchases({ resourceTypeId });
      setOrders(r.orders ?? []);
    } catch {
      setOrders([]);
    } finally { setLoading(false); }
  }, [resourceTypeId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (loading) return <Box sx={{ py: 2 }}><CircularProgress size={18} /></Box>;

  if (!orders.length) {
    return (
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', py: 1 }}>
        No machines of this type on order. Use the cart icon on the Resource Types list to buy one.
      </Typography>
    );
  }

  const total = orders.reduce((s, o) => s + (Number(o.value) || 0), 0);
  const ccy = orders.find((o) => o.currency)?.currency ?? null;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 1, fontSize: 12.5 }}>
        <span><b>{orders.length}</b> order(s)</span>
        <span><b>Committed</b> {money(total, ccy)}</span>
      </Box>
      {orders.map((o) => (
        <Box
          key={o.id}
          sx={{
            display: 'flex', gap: 2, alignItems: 'center', py: 0.75, fontSize: 12.5,
            borderBottom: '1px solid var(--c-border)',
          }}
        >
          <Mono>{o.orderNumber}</Mono>
          <span style={{ color: 'var(--c-text-2)', flex: 1 }}>{o.supplierName ?? '—'}</span>
          {o.createdAt && (
            <span style={{ color: 'var(--c-text-3)' }}>raised {String(o.createdAt).slice(0, 10)}</span>
          )}
          <span style={{ color: 'var(--c-text-3)' }}>{o.lineCount} line(s)</span>
          <span>{money(Number(o.value), o.currency)}</span>
          <Chip size="small" label={o.status} sx={{ height: 20, fontSize: 10.5 }} />
        </Box>
      ))}
    </Box>
  );
}
