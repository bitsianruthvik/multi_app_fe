import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, IconButton,
  Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import ChangeHistoryRounded from '@mui/icons-material/ChangeHistoryRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabMutate } from '../api/client';
import { useToast, backendMessage } from '../components';
import { fetchOrderReadiness, type OrderReadiness, type ReadinessStage, type StageState } from '../api/readiness';
import OrderItemsTree from './OrderItemsTree';
import OrderNesting from './OrderNesting';
import OrderParameters from './OrderParameters';
import OrderFlowAllocation from './OrderFlowAllocation';
import OrderTaskDag from './OrderTaskDag';
import OrderProcurement from './OrderProcurement';
import OrderProduction from './OrderProduction';
import OrderLinesPanel from './OrderLinesPanel';

/**
 * The sales order, as one wizard.
 *
 * Everything a new order needs happens here, in the order it actually happens:
 *
 *   line items → BOM → nesting → flow attribution → project tree → confirm
 *
 * IT IS CLOSABLE AT EVERY POINT, and that is the main design constraint rather
 * than a convenience. A real order is not entered in one sitting: the BOM comes
 * back from the draughtsman on Tuesday, the nesting on Thursday. So nothing is
 * held in this component that isn't already saved — each step writes straight
 * through to the server, and the step itself is persisted on the order
 * (fab_orders.wizard_step). Closing loses nothing; reopening from the Orders
 * page lands on the step that still needs work, on any machine.
 *
 * The order EXISTS as a draft from the moment the wizard opens. That is what
 * makes closing safe, and it is why a draft means precisely "in the wizard" —
 * task automation is forbidden from advancing one, so the project-tree step
 * cannot walk the order past the confirmation nobody has made yet.
 *
 * No step is gated on the one before it. Someone will want to nest a few plates
 * before the BOM is finished, and there is no good reason to stop them. Only
 * Confirm is a genuine gate, because confirming is a promise to a customer.
 */

const STATE_COLOR: Record<StageState, string> = {
  done: 'var(--c-success-600)',
  partial: 'var(--c-warning-600)',
  todo: 'var(--c-text-3)',
};

function StepIcon({ state }: { state: StageState }) {
  const sx = { fontSize: 16, color: STATE_COLOR[state] };
  if (state === 'done') return <CheckCircleRounded sx={sx} />;
  if (state === 'partial') return <ChangeHistoryRounded sx={sx} />;
  return <RadioButtonUncheckedRounded sx={sx} />;
}

export interface SalesOrderWizardProps {
  orderId: number;
  orderNumber?: string;
  open: boolean;
  /** Called on close — the caller refreshes its list, since the order may have moved. */
  onClose: () => void;
  canManage: boolean;
}

export default function SalesOrderWizard({
  orderId, orderNumber, open, onClose, canManage,
}: SalesOrderWizardProps) {
  const { toast } = useToast();
  const [readiness, setReadiness] = useState<OrderReadiness | null>(null);
  const [step, setStep] = useState<ReadinessStage['key']>('lines');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const base = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`,
    [],
  );

  /**
   * On open, jump to where the order actually is — the step the server
   * remembered, or failing that the first one that still needs work. Reopening
   * on step 1 every time would make "close and come back" a punishment.
   */
  const load = useCallback(async (jump: boolean) => {
    try {
      const r = await fetchOrderReadiness(orderId);
      setReadiness(r);
      if (jump) setStep((r.wizardStep as ReadinessStage['key']) ?? r.nextStage ?? 'lines');
    } catch (e) {
      setError(backendMessage(e, 'Could not read this order.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(''); setConfirmed(false);
    load(true);
  }, [open, load]);

  /** Every step calls this after it writes; the rail follows along. */
  const refresh = useCallback((next?: OrderReadiness | null) => {
    if (next) setReadiness(next); else load(false);
  }, [load]);

  const steps = readiness?.stages ?? [];
  const idx = steps.findIndex((s) => s.key === step);
  const current = steps[idx] ?? null;

  /**
   * Move to a step and remember it on the order.
   *
   * Without this, reopening lands on the first UNFINISHED step, which is right
   * most of the time and wrong in the case that matters: someone who went back
   * to step 2 to correct the BOM and closed for the day would be dropped at
   * step 4 the next morning, looking at the wrong thing. Fire-and-forget — the
   * step is a convenience, and failing to record it must not interrupt anyone.
   */
  const goTo = useCallback((next: ReadinessStage['key']) => {
    setStep(next);
    if (readiness?.status !== 'draft') return;
    fabMutate('fabErpOrder', 'update', { id: orderId, wizard_step: next }).catch(() => {});
  }, [orderId, readiness?.status]);

  async function confirm() {
    setConfirming(true); setError('');
    try {
      await api.post(`${base()}/orders/${orderId}/confirm`, {});
      setConfirmed(true);
      toast('Order confirmed', 'success');
      await load(false);
    } catch (e) {
      setError(backendMessage(e, 'Could not confirm this order.'));
    } finally { setConfirming(false); }
  }

  const isLast = idx === steps.length - 1;
  const canConfirm = readiness?.canConfirm === true;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      slotProps={{ paper: { sx: { height: 'calc(100vh - 64px)', bgcolor: 'var(--c-bg)' } } }}
    >
      {/* Header — the close button is deliberately prominent and unqualified.
          There is no "are you sure": nothing is lost by closing, and a
          confirmation dialog would imply otherwise. */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.75,
        borderBottom: '1px solid var(--c-border)', bgcolor: 'var(--c-surface)',
      }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
            {orderNumber ?? 'Sales order'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            {readiness?.status === 'draft'
              ? 'Draft — nothing here is lost if you close it'
              : `Status: ${(readiness?.status ?? '').replace(/_/g, ' ')}`}
          </Typography>
        </Box>
        <Tooltip title="Close — you can pick this up again from the Orders page">
          <IconButton onClick={onClose} aria-label="Close wizard"><CloseRounded /></IconButton>
        </Tooltip>
      </Box>

      {/* Step rail */}
      {steps.length > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'stretch', gap: 0.5, px: 2, py: 1,
          borderBottom: '1px solid var(--c-border)', bgcolor: 'var(--c-surface)',
          overflowX: 'auto',
        }}>
          {steps.map((s, i) => {
            const on = s.key === step;
            return (
              <Box
                key={s.key}
                role="button"
                tabIndex={0}
                onClick={() => goTo(s.key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goTo(s.key); }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                  borderRadius: 'var(--r-sm)', cursor: 'pointer', whiteSpace: 'nowrap',
                  bgcolor: on ? 'var(--c-primary-50)' : 'transparent',
                  border: '1px solid',
                  borderColor: on ? 'var(--c-primary-200)' : 'transparent',
                  '&:hover': { bgcolor: on ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
                }}
              >
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--c-text-3)' }}>
                  {i + 1}
                </Typography>
                <StepIcon state={s.state} />
                <Box>
                  <Typography sx={{
                    fontSize: 13, fontWeight: on ? 600 : 500,
                    color: on ? 'var(--c-primary-700)' : 'var(--c-text)',
                  }}>
                    {s.label}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: 'var(--c-text-2)' }}>{s.detail}</Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <DialogContent sx={{ p: 3, bgcolor: 'var(--c-bg)' }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>
        ) : (
          <>
            {step === 'lines' && (
              <OrderLinesPanel orderId={orderId} canManage={canManage} onChanged={() => refresh()} />
            )}
            {step === 'boq' && (
              <OrderItemsTree
                orderId={orderId} canManage={canManage}
                readiness={readiness} onStageChanged={refresh}
              />
            )}
            {/* Flows BEFORE parameters: which fields a part needs is derived from
                its flow's formulas, so the flow has to be known first. */}
            {step === 'flows' && (
              <OrderFlowAllocation orderId={orderId} canManage={canManage} onStageChanged={refresh} />
            )}
            {step === 'params' && (
              <OrderParameters orderId={orderId} canManage={canManage} onStageChanged={refresh} />
            )}
            {step === 'nesting' && (
              <OrderNesting orderId={orderId} canManage={canManage} onStageChanged={refresh} />
            )}
            {step === 'tasks' && (
              <OrderTaskDag orderId={orderId} canManage={canManage} />
            )}
            {step === 'procurement' && (
              <OrderProcurement orderId={orderId} canManage={canManage} onChanged={refresh} />
            )}
            {step === 'production' && (
              <OrderProduction orderId={orderId} canManage={canManage} onChanged={refresh} />
            )}
          </>
        )}
      </DialogContent>

      {/* Footer: move between steps, and confirm at the end. */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.75,
        borderTop: '1px solid var(--c-border)', bgcolor: 'var(--c-surface)',
      }}>
        <Button
          startIcon={<ArrowBackRounded />}
          disabled={idx <= 0}
          onClick={() => goTo(steps[idx - 1].key)}
        >
          Back
        </Button>

        <Box sx={{ flex: 1, textAlign: 'center' }}>
          {current && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{current.detail}</Typography>
          )}
        </Box>

        {isLast ? (
          <Tooltip title={
            confirmed ? 'Already confirmed'
              : canConfirm ? 'Confirm this order and start buying material'
                : `Still to finish: ${steps.filter((s) => s.state !== 'done').map((s) => s.label).join(', ')}`
          }>
            {/* span so the tooltip still shows on a disabled button — the reason
                it is disabled is the whole point of the tooltip. */}
            <span>
              <Button
                variant="contained"
                disabled={!canManage || !canConfirm || confirming || confirmed}
                onClick={confirm}
                startIcon={confirming ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
              >
                {confirmed ? 'Confirmed' : 'Confirm order'}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            variant="contained"
            endIcon={<ArrowForwardRounded />}
            onClick={() => goTo(steps[idx + 1].key)}
          >
            Next
          </Button>
        )}
      </Box>
    </Dialog>
  );
}
