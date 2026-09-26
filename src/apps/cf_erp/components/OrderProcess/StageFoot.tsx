import { useState } from 'react';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import { cfApi, type CfApiError } from '../../api/client';
import type { OrderProcessView, OrderStage, SalesOrder } from '../../api/types';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { ORDER_STATUS_LABEL } from '../../lib/orders';
import { CONFIRM_STILL_ON_THE_PAGE, forwardHelp, forwardLabel, stageSatisfied } from '../../lib/process';
import { ErrorNotice } from '../ui';
import { useToast } from '../toastContext';
import { BlockerList, DetailLine, OptionalBadge, StageStateBadge } from './stageUi';

/** An order that has stopped moving: confirming is behind it, one way or the other. */
const SETTLED = ['confirmed', 'closed', 'lost', 'cancelled'];

/**
 * The foot of a stage tab: Back, where this stage stands for the line, and the
 * way on.
 *
 * The way on is never dead. A finished stage says "Next: Buying"; an unfinished
 * one says "Skip for now: Buying" rather than refusing — the tabs above already
 * let anyone go anywhere, so a foot that refused would only be lying. The one
 * hard gate is Confirm, at the confirm point, and when it is refused every
 * blocker is listed by its line.
 */
export function StageFoot({ view, stages, current, order, onGo, onOrderSaved, onReloadAll }: {
  view: OrderProcessView;
  /** The stages the tabs show, in sequence — the line's own, or the order's roll-up. */
  stages: OrderStage[];
  current: OrderStage;
  order: SalesOrder;
  onGo: (stageKey: string) => void;
  onOrderSaved: (o: SalesOrder) => void;
  /** Reloads the order, its production and the process together. */
  onReloadAll: () => void;
}) {
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CfApiError | null>(null);

  const idx = Math.max(0, stages.findIndex((s) => s.stageKey === current.stageKey));
  const prev = idx > 0 ? stages[idx - 1] : null;
  const next = idx < stages.length - 1 ? stages[idx + 1] : null;
  const satisfied = stageSatisfied(current);

  const blockers = view.blockers ?? [];
  const settled = SETTLED.includes(view.order.status);
  const canManage = isPermitted('cf_erp_orders_manage');
  const showConfirm = (next === null || current.stageKey === 'confirm') && !settled;

  const confirmOrder = async () => {
    setBusy(true); setActionError(null);
    try {
      const saved = await cfApi.post<SalesOrder>(`/orders/${order.id}/status`, { status: 'confirmed' });
      onOrderSaved(saved);
      invalidateNavCounts();
      toast.success(`${saved.code} is now confirmed.`);
      onReloadAll();
    } catch (e) { setActionError(e as CfApiError); } finally { setBusy(false); }
  };

  // The header has a Confirm button of its own that this gate does not touch.
  // When the two disagree, say which is which rather than looking broken.
  const pageAllowsConfirm = order.allowedTransitions.includes('confirmed');
  const confirmWhy = !canManage
    ? 'You can see this order, but your role cannot confirm it. Ask an administrator for the orders permission.'
    : !view.canConfirm
      ? [
        blockers.length
          ? `${blockers.length} ${blockers.length === 1 ? 'thing' : 'things'} still to settle — every one of them is listed here.`
          : `An order that is ${ORDER_STATUS_LABEL[view.order.status].toLowerCase()} cannot be confirmed.`,
        pageAllowsConfirm ? CONFIRM_STILL_ON_THE_PAGE : '',
      ].filter(Boolean).join(' ')
      : 'Commit this order. It becomes a job, and can only be closed or cancelled after that.';

  return (
    <Box component="nav" aria-label="Walk the stages" sx={{
      mt: 2, pt: 1.75, borderTop: '1px solid var(--c-divider)', minWidth: 0,
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25,
    }}>
      <ErrorNotice error={actionError} sx={{ mb: 0 }} />
      {/* Refused: every blocker on its own line, named by its line number. On
          the Confirm stage the same list is already in the screen above. */}
      {showConfirm && !view.canConfirm && current.stageKey !== 'confirm' && blockers.length > 0 && (
        <Box sx={{ maxHeight: 168, overflowY: 'auto', pr: 0.5 }}><BlockerList blockers={blockers} /></Box>
      )}
      <Box sx={{
        display: 'grid', alignItems: 'center', columnGap: 1.5, rowGap: 1, minWidth: 0,
        gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', sm: 'auto minmax(0, 1fr) auto' },
        gridTemplateAreas: { xs: '"state state" "back fwd"', sm: '"back state fwd"' },
      }}>
        <Box sx={{ gridArea: 'back' }}>
          <Tooltip title={prev ? `Back to ${prev.label}` : 'This is the first stage.'}>
            <span>
              <Button startIcon={<ArrowBackRounded />} disabled={!prev || busy} onClick={() => prev && onGo(prev.stageKey)}>Back</Button>
            </span>
          </Tooltip>
        </Box>
        <Box sx={{ gridArea: 'state', display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <StageStateBadge stage={current} />
          <OptionalBadge stage={current} />
          <DetailLine text={current.detail} sx={{ flex: '1 1 auto', fontSize: 13 }} />
        </Box>
        <Box sx={{ gridArea: 'fwd', justifySelf: 'end', minWidth: 0 }}>
          {showConfirm ? (
            <Tooltip title={confirmWhy}>
              <span>
                <Button variant="contained" startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
                  disabled={!view.canConfirm || !canManage || busy} onClick={confirmOrder}>
                  {busy ? 'Confirming…' : 'Confirm order'}
                </Button>
              </span>
            </Tooltip>
          ) : next ? (
            <Tooltip title={forwardHelp(next, satisfied)}>
              <span>
                <Button variant="contained" disabled={busy} endIcon={satisfied ? <ArrowForwardRounded /> : <SkipNextRounded />}
                  onClick={() => onGo(next.stageKey)} sx={{ maxWidth: '100%', '& .MuiButton-endIcon': { flexShrink: 0 } }}>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{forwardLabel(next, satisfied)}</Box>
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
