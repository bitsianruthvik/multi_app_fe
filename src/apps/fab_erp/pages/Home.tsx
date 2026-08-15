import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';

import { getPulse, type PulseResponse } from '../api/client';
import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import {
  PageHeader, StatStrip, WorkQueueCard, StatSkeleton, EmptyState,
  ExceptionFeed, type Stat, type ExceptionItem,
} from '../components';

/**
 * Factory Pulse — the cockpit (DESIGN_SYSTEM.md §4.1, elevation plan §6.1).
 *
 * Answers "what needs me today?" in three bands:
 *   1. Pulse row      — live KPIs, each one clickable through to its screen
 *   2. Exception feed — the specific records that are wrong, worst first
 *   3. Your queues    — role-filtered standing work
 *
 * It is a to-do surface, not a chart dashboard. Every number here is a door:
 * a count you cannot click is a dead end, which is the thing this redesign was
 * meant to remove.
 *
 * All cockpit data comes from a single GET /pulse. Every field is optional —
 * the endpoint omits aggregates whose query failed — so a missing KPI hides its
 * card rather than showing a misleading zero.
 */

export default function Home() {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const { user } = useAuth();
  const go = (path: string) => navigate(`/${company}/fab_erp/${path}`);

  const canOrders = usePermission('fab_erp_projects_view');
  const canGrn = usePermission('fab_erp_grn_view');
  const canItems = usePermission('fab_erp_items_meta_view');
  const canTasks = usePermission('fab_erp_taskqueue_view');
  const canCc = usePermission('fab_erp_cc_view');

  const [pulse, setPulse] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // One request for the entire cockpit. The queue counts used to come from a
  // 500-row fabQuery filtered client-side, and the item count from a
  // `pagination:{limit:1}` query whose `total` is the size of the page it just
  // returned — so it always read "1 part defined". Both are real COUNTs now.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPulse(await getPulse());
    } catch {
      // A cockpit that renders nothing is worse than one with no cards; keep
      // whatever was last shown and let the user retry via Refresh.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const k = pulse?.kpis ?? {};
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  // Each stat is a door. `undefined` means the aggregate failed — hide the card
  // rather than render a zero the user would read as fact.
  const stats: Stat[] = [
    k.openOrders !== undefined && canOrders && {
      label: 'Open orders', value: k.openOrders, icon: <ReceiptLongRounded />,
      onClick: () => go('orders'),
    },
    k.overdueOrders !== undefined && canOrders && {
      label: 'Overdue', value: k.overdueOrders,
      tone: k.overdueOrders > 0 ? 'danger' : 'default',
      icon: <WarningAmberRounded />, onClick: () => go('orders'),
    },
    k.tasksInProgress !== undefined && canTasks && {
      label: 'In progress', value: k.tasksInProgress, tone: 'info',
      icon: <PlaylistAddCheckRounded />, onClick: () => go('task-queue'),
    },
    k.tasksBlocked !== undefined && canTasks && {
      label: 'Blocked', value: k.tasksBlocked,
      tone: k.tasksBlocked > 0 ? 'warning' : 'default',
      icon: <BlockRounded />, onClick: () => go('task-queue'),
    },
    k.machinesRunning !== undefined && {
      label: 'Machines running', value: k.machinesRunning,
      // Running alone is meaningless — "2" of 3 reads very differently from 2 of 40.
      display: `${k.machinesRunning}/${k.machinesTotal ?? 0}`,
      tone: k.machinesRunning > 0 ? 'success' : 'default',
      icon: <PrecisionManufacturingRounded />, onClick: () => go('machine-board'),
    },
    k.redBuffers !== undefined && canCc && {
      label: 'Buffers in red', value: k.redBuffers,
      tone: k.redBuffers > 0 ? 'danger' : 'default',
      icon: <RouteRounded />, onClick: () => go('critical-chain'),
    },
  ].filter(Boolean) as Stat[];

  const exceptions: ExceptionItem[] = useMemo(() => {
    const e = pulse?.exceptions;
    if (!e) return [];
    const out: ExceptionItem[] = [];

    // Maintenance first: a machine that seizes takes every job on it with it,
    // and unlike a late order there is a window in which it is still cheap.
    for (const m of e.maintenanceDue ?? []) {
      const late = Number(m.daysLate) > 0;
      out.push({
        id: `maint-${m.planId}`,
        severity: late ? 'danger' : 'warning',
        label: m.resourceName,
        detail: `${m.planName} — ${late ? 'overdue' : 'due'}`,
        metric: late ? `${m.daysLate}d late` : `due ${m.nextDueAt}`,
        onClick: () => go('resource-types'),
      });
    }
    for (const o of e.overdueOrders ?? []) {
      out.push({
        id: `overdue-${o.id}`, severity: 'danger', label: o.orderNumber, code: true,
        detail: `Past its required date and still ${o.status.replace(/_/g, ' ')}`,
        metric: `${o.daysLate}d late`,
        onClick: () => go(`orders/${o.id}`),
      });
    }
    for (const b of e.redBuffers ?? []) {
      out.push({
        id: `buffer-${b.id}`, severity: 'danger',
        label: b.orderNumber ?? `Plan buffer #${b.id}`, code: !!b.orderNumber,
        detail: `${b.kind === 'feeding' ? 'Feeding' : 'Project'} buffer past its action threshold`,
        metric: `${b.consumedPct}% used`,
        onClick: () => go('critical-chain'),
      });
    }
    for (const w of e.blockedWork ?? []) {
      out.push({
        id: `blocked-${w.orderId}`, severity: 'warning', label: w.orderNumber, code: true,
        detail: w.blockedCount === 1 ? 'A task is blocked on its inputs' : 'Tasks are blocked on their inputs',
        metric: `${w.blockedCount} blocked`,
        onClick: () => go(`orders/${w.orderId}`),
      });
    }
    for (const f of e.flowsMissingFormula ?? []) {
      out.push({
        id: `flow-${f.id}`, severity: 'warning', label: f.name,
        // This one is quietly corrosive, so the detail spells out the consequence.
        detail: `Flow ${f.code} has a step whose operation has no time formula — it schedules as zero duration`,
        onClick: () => go('operation-flows'),
      });
    }
    return out;
  }, [pulse, company]); // eslint-disable-line react-hooks/exhaustive-deps

  const queues: ReactNode[] = [];
  if (canOrders) {
    queues.push(
      <WorkQueueCard
        key="confirm"
        icon={<CheckCircleRounded />}
        title="Draft sales orders"
        count={k.draftSalesOrders ?? 0}
        unit="to confirm"
        description="Sales orders captured but not yet confirmed for production."
        actionLabel="Review orders"
        onAction={() => go('orders')}
        tone="primary"
      />,
    );
  }
  if (canGrn) {
    queues.push(
      <WorkQueueCard
        key="grn"
        icon={<LocalShippingRounded />}
        title="Goods receipt"
        count={k.posInTransit ?? 0}
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
        count={k.items ?? 0}
        unit={k.items === 1 ? "part defined" : "parts defined"}
        description="Maintain items, BOMs and flows — the model scheduling burns."
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
        actions={
          <Button
            size="small"
            startIcon={<RefreshRounded />}
            onClick={load}
            disabled={loading}
            sx={{ color: 'var(--c-text-2)' }}
          >
            Refresh
          </Button>
        }
      />

      {loading ? (
        <StatSkeleton count={6} />
      ) : (
        <>
          {stats.length > 0 && <StatStrip stats={stats} />}

          <Box sx={{ mb: 3 }}>
            <ExceptionFeed
              items={exceptions}
              emptyMessage="No overdue orders, blocked work, or buffers in the red."
            />
          </Box>

          {queues.length === 0 ? (
            <EmptyState
              icon={<PlaylistAddCheckRounded />}
              title="Nothing assigned to your role yet"
              hint="Your queues will appear here as work flows through the system."
            />
          ) : (
            <>
              <Typography
                sx={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1.5,
                }}
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
