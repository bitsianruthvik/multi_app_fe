import { useEffect, useMemo, useState } from 'react';
import { Box, MenuItem, TextField } from '@mui/material';
import ViewInArRounded from '@mui/icons-material/ViewInArRounded';
import { cfApi } from '../../api/client';
import { listProductionOrders } from '../../api/productionOrders';
import type { SalesOrder } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { useUrlParam } from '../../hooks/useUrlState';
import { EmptyState, ErrorNotice, InfoTip, SkeletonBlock, Surface } from '../ui';
import { Progress3D } from '../Production/Progress3D';

/**
 * THE 3D TRACKER (user, 2026-11-12: "You built the 3D tracker here [the order's Production step]. It should be there in the
 * main production tracker"). Pick a sales order with production orders — and, to narrow it, one of them: its lines in 3D,
 * each piece coloured by the step it is at.
 */
export function Tracker3D() {
  const [orderParam, setOrderParam] = useUrlParam('o3d', '');
  const [poParam, setPoParam] = useUrlParam('po3d', '');
  const list = useLoad(() => listProductionOrders({ state: 'all', limit: 200 }), []);
  const groups = useMemo(() => list.data?.rows ?? [], [list.data]);
  const orderId = Number(orderParam) || groups[0]?.order.id || null;
  const pos = groups.find((g) => g.order.id === orderId)?.productionOrders ?? [];
  const [order, setOrder] = useState<SalesOrder | null>(null);
  useEffect(() => {
    let live = true;
    setOrder(null);
    if (orderId) cfApi.get<SalesOrder>(`/orders/${orderId}`).then((o) => { if (live) setOrder(o); }).catch(() => {});
    return () => { live = false; };
  }, [orderId]);
  const custom = (order?.lines ?? []).filter((l) => l.lineType === 'custom').map((l) => l.id);
  const poId = Number(poParam) || null;

  if (list.error) return <ErrorNotice error={list.error} onRetry={list.reload} />;
  if (!list.data) return <SkeletonBlock h={420} r={8} />;
  if (!groups.length) return <EmptyState icon={<ViewInArRounded />} title="No production orders yet" hint="An order's production orders are made when its execution plan is saved." />;
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }} data-testid="tracker-3d">
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField select size="small" label="Sales order" value={orderId ?? ''} onChange={(e) => { setOrderParam(String(e.target.value)); setPoParam(''); }} sx={{ minWidth: 240 }}
          slotProps={{ htmlInput: { 'data-testid': 'tracker-3d-order' } }}>
          {groups.map((g) => <MenuItem key={g.order.id} value={g.order.id}>{g.order.code}{g.order.title ? ` · ${g.order.title}` : ''}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Production order" value={poId ?? ''} onChange={(e) => setPoParam(String(e.target.value))} sx={{ minWidth: 220 }}
          SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}>
          <MenuItem value="">All of the order</MenuItem>
          {pos.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} · {p.stateLabel}</MenuItem>)}
        </TextField>
        <InfoTip text="Each line of the order, once per unit, each piece coloured by the step it is at. A part gone into its assembly takes the assembly's colour; uncut parts are dashed. Pieces not released yet are grey." />
      </Box>
      <Surface e={1} sx={{ p: 1, minHeight: 420 }}>
        {!order ? <SkeletonBlock h={420} r={8} />
          : custom.length === 0 ? <EmptyState title="Nothing to show in 3D" hint="This order has no line built from a structure." />
            : <Progress3D key={`${orderId}:${poId ?? ''}`} orderId={order.id} lineIds={custom} productionOrderId={poId ?? undefined} />}
      </Surface>
    </Box>
  );
}
