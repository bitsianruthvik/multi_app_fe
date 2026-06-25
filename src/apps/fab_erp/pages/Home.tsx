import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import AutoGraphRounded from '@mui/icons-material/AutoGraphRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';

import { fabQuery } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { PageHeader, StatStrip, WorkQueueCard, StatSkeleton, EmptyState, type Stat } from '../components';

interface OrderRow {
  id: number;
  orderType: string;
  status: string;
  requiredDate?: string;
}

const SHIPPED_STATES = new Set(['shipped', 'received', 'completed', 'closed', 'cancelled', 'converted']);

export default function Home() {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const { user } = useAuth();
  const go = (path: string) => navigate(`/${company}/fab_erp/${path}`);

  const canOrders = usePermission('fab_erp_projects_view');
  const canPlan = usePermission('fab_erp_planning_view');
  const canSchedule = usePermission('fab_erp_scheduler_view');
  const canGrn = usePermission('fab_erp_grn_view');
  const canItems = usePermission('fab_erp_items_meta_view');

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, itemRes] = await Promise.allSettled([
        fabQuery<{ data: OrderRow[] }>('fabErpOrder', {
          fields: ['id', 'orderType', 'status', 'requiredDate'],
          pagination: { limit: 500 },
        }),
        canItems
          ? fabQuery<{ data: { id: number }[]; total?: number }>('fabErpItemCatalog', {
              fields: ['id'],
              pagination: { limit: 1 },
            })
          : Promise.resolve({ data: [], total: 0 } as { data: { id: number }[]; total?: number }),
      ]);
      if (ordRes.status === 'fulfilled') setOrders(ordRes.value.data ?? []);
      if (itemRes.status === 'fulfilled') {
        const v = itemRes.value as { data: { id: number }[]; total?: number };
        setItemCount(v.total ?? v.data?.length ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [canItems]);

  useEffect(() => {
    load();
  }, [load]);

  const m = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const open = orders.filter((o) => !SHIPPED_STATES.has(o.status));
    const overdue = open.filter((o) => o.requiredDate && new Date(o.requiredDate) < today);
    const draftSales = orders.filter((o) => o.orderType === 'sales' && o.status === 'draft');
    const plannedToFirm = orders.filter((o) => o.orderType === 'planned' && o.status === 'draft');
    const posSent = orders.filter((o) => o.orderType === 'purchase' && o.status === 'sent');
    const released = orders.filter(
      (o) => o.orderType === 'manufacturing' && (o.status === 'released' || o.status === 'in_progress'),
    );
    return { open, overdue, draftSales, plannedToFirm, posSent, released };
  }, [orders]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const stats: Stat[] = [
    { label: 'Open orders', value: m.open.length, icon: <ReceiptLongRounded />, onClick: () => go('orders') },
    { label: 'Overdue', value: m.overdue.length, tone: m.overdue.length ? 'danger' : 'default', icon: <WarningAmberRounded />, onClick: () => go('orders') },
    { label: 'Planned to firm', value: m.plannedToFirm.length, tone: m.plannedToFirm.length ? 'warning' : 'default', icon: <AccountTreeRounded />, onClick: () => go('workbench') },
    { label: 'In production', value: m.released.length, tone: 'info', icon: <AutoGraphRounded />, onClick: () => go('scheduler') },
  ];

  // Build role-filtered work queues.
  const queues: ReactNode[] = [];
  if (canOrders) {
    queues.push(
      <WorkQueueCard
        key="confirm"
        icon={<CheckCircleRounded />}
        title="Draft sales orders"
        count={m.draftSales.length}
        unit="to confirm"
        description="Sales orders captured but not yet confirmed for production."
        actionLabel="Review orders"
        onAction={() => go('orders')}
        tone="primary"
      />,
    );
    queues.push(
      <WorkQueueCard
        key="overdue"
        icon={<WarningAmberRounded />}
        title="Overdue orders"
        count={m.overdue.length}
        unit="past due"
        description="Open orders whose required date has already passed."
        actionLabel="Resolve"
        onAction={() => go('orders')}
        tone={m.overdue.length ? 'danger' : 'success'}
      />,
    );
  }
  if (canPlan || canSchedule) {
    queues.push(
      <WorkQueueCard
        key="firm"
        icon={<AccountTreeRounded />}
        title="Planned orders"
        count={m.plannedToFirm.length}
        unit="to firm"
        description="MRP suggestions awaiting your decision in the workbench."
        actionLabel="Open workbench"
        onAction={() => go('workbench')}
        tone="warning"
      />,
    );
    queues.push(
      <WorkQueueCard
        key="mrp"
        icon={<AutoGraphRounded />}
        title="Material planning"
        count={m.open.length}
        unit="open demands"
        description="Run MRP to explode BOMs against stock and generate plans."
        actionLabel="Run MRP"
        onAction={() => go('mrp')}
        tone="info"
      />,
    );
  }
  if (canGrn) {
    queues.push(
      <WorkQueueCard
        key="grn"
        icon={<LocalShippingRounded />}
        title="Goods receipt"
        count={m.posSent.length}
        unit="POs in transit"
        description="Purchase orders sent to suppliers, awaiting receipt into stock."
        actionLabel="Receive goods"
        onAction={() => go('grn')}
        tone="primary"
      />,
    );
  }
  if (canItems) {
    queues.push(
      <WorkQueueCard
        key="items"
        icon={<Inventory2Rounded />}
        title="Item catalog"
        count={itemCount ?? 0}
        unit="parts defined"
        description="Maintain items, BOMs and routings — the model MRP and scheduling burn."
        actionLabel="Open catalog"
        onAction={() => go('item-catalog')}
        tone="success"
      />,
    );
  }

  return (
    <Box>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what needs you today."
      />

      {loading ? (
        <>
          <StatSkeleton count={4} />
        </>
      ) : (
        <>
          <StatStrip stats={stats} />
          {queues.length === 0 ? (
            <EmptyState
              icon={<PlaylistAddCheckRounded />}
              title="Nothing assigned to your role yet"
              hint="Your queues will appear here as work flows through the system."
            />
          ) : (
            <>
              <Typography
                sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5 }}
              >
                Your queues
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 1.5,
                  alignItems: 'stretch',
                }}
              >
                {queues}
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
