import { Box } from '@mui/material';
import { Link } from 'react-router-dom';
import type { WorkOrderStatus } from '../../api/types';
import { Badge, type Family } from '../ui';
import { WORK_ORDER_STATUS_LABEL } from './workOrderModel';

const FAMILY: Record<WorkOrderStatus, Family> = { draft: 'warning', issued: 'info', in_progress: 'info', done: 'success', cancelled: 'neutral' };

/** A work order's state, in the same badge language as everything else. */
export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge family={FAMILY[status] ?? 'neutral'} noIcon label={WORK_ORDER_STATUS_LABEL[status] ?? status} />;
}

const chipSx = {
  display: 'inline-flex', alignItems: 'center', px: 1, py: 0.25, fontSize: 12.5, color: 'inherit', textDecoration: 'none',
  border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)',
};

/** "Contractor · WO-12 · 3 operations" in that contractor's tint; it opens the work order. */
export function WorkOrderChip({ to, tint, contractor, code, count }: { to: string; tint?: string; contractor: string; code: string; count: number }) {
  return (
    <Box component={Link} to={to} sx={{ ...chipSx, background: tint, '&:hover': { borderColor: 'var(--c-primary-500)' } }}>
      {contractor} · {code} · {count} {count === 1 ? 'operation' : 'operations'}
    </Box>
  );
}

/** What stays here: the neutral chip beside the contractors'. */
export function InHouseChip({ count }: { count: number }) {
  return <Box component="span" sx={{ ...chipSx, color: 'var(--c-text-2)' }}>In-house · {count}</Box>;
}
