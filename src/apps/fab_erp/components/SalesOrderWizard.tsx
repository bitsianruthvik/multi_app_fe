import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, IconButton,
  Tooltip, Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabQuery } from '../api/client';
import {
  useToast, backendMessage, ConfirmDialog, StatusBadge, DetailSkeleton, Mono,
} from '../components';
import {
  fetchOrderReadiness, setWizardStep, convertQuote,
  type OrderReadiness, type ReadinessStage,
} from '../api/readiness';
import { getOrderLines } from '../api/catalog';
import { getSavedBlankPlan } from '../api/blanks';
import {
  getProductionPlan, deployProductionOrder, type ProductionOrderRef,
} from '../api/productionPlan';
import BlankNesting from './BlankNesting';
import OrderParameters from './OrderParameters';
import OrderProductionPlan from './OrderProductionPlan';
import OrderLinesPanel from './OrderLinesPanel';
import StageIcon from './StageIcon';

/**
 * The sales order, as one wizard.
 *
 * Everything a new order needs happens here, in the order it actually happens:
 *
 *   line items (with their BOMs) → nesting → other params → production → confirm
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
 * THE RAIL IS NEVER GATED; NEXT IS. Someone will want to nest a few plates
 * before the BOM is finished, and there is no good reason to stop them — so
 * every step stays clickable in the rail above. But NEXT is a recommendation,
 * and it used to recommend moving on from an unfinished step: an order reached
 * nesting with no parameters entered, and every duration downstream was then
 * computed from a missing value defaulted to zero. That does not error, it
 * quietly produces fiction. So Next is disabled while the current step is
 * unfinished and says which one it is; the rail remains the deliberate way past.
 *
 * Only Confirm is a hard gate, because confirming is a promise to a customer.
 *
 * TWO OTHER ENDINGS share this same rail (EU-19):
 *
 *   quote      never confirms — Production stays a read-only estimate
 *              (orderReadinessService marks it `not_applicable`) and the last
 *              step is Convert to order instead.
 *   revision   a CONFIRMED order reopened through "Revise" on the detail page.
 *              `confirmOrder` refuses anything that is not `draft`, so the
 *              last step cannot call it again — it re-deploys whatever
 *              production order the revision touched, and closes.
 */

export interface SalesOrderWizardProps {
  orderId: number;
  orderNumber?: string;
  open: boolean;
  /** Called on close — the caller refreshes its list, since the order may have moved. */
  onClose: () => void;
  canManage: boolean;
  /** constants/orderTypes.ts. A quote's Production step is read-only and ends in Convert, not Confirm. */
  orderType?: string;
  /** Identity facts for the header — who it is for and when it is due. Optional; the number alone still reads. */
  customerName?: string | null;
  requiredDate?: string | null;
  /**
   * Set only when this wizard was opened via the detail page's "Revise"
   * action, on an order that is no longer `draft` (P2/decision 4). Every
   * structure apply this session makes must carry this same reason so the
   * server can record it against `fab_order_structure_revisions` — and the
   * last step becomes "Finish revision" (see the module doc above).
   */
  revisionReason?: string;
}

export default function SalesOrderWizard({
  orderId, orderNumber, open, onClose, canManage, orderType, revisionReason, customerName, requiredDate,
}: SalesOrderWizardProps) {
  const { toast } = useToast();
  const [readiness, setReadiness] = useState<OrderReadiness | null>(null);
  const [step, setStep] = useState<ReadinessStage['key']>('lines');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [notReadyStages, setNotReadyStages] = useState<ReadinessStage[] | null>(null);

  const isQuote = orderType === 'quote';
  const revisionMode = !!revisionReason;

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
      // A read that worked clears an error from one that did not (UAT 8: the
      // header kept saying "Something went wrong" after readiness recovered).
      setError((prev) => (prev === 'Could not read this order.' || /went wrong/i.test(prev) ? '' : prev));
      // A step saved before the steps were merged ('tasks', 'procurement'), or
      // any other name the server no longer recognises, lands on the server's
      // own idea of what's next — never a step name hardcoded here.
      const saved = r.wizardStep as ReadinessStage['key'] | null;
      // A remembered step that is no longer reachable (an earlier stage went
      // back to unfinished) lands on the first stage that needs work instead.
      const savedStage = saved ? r.stages.find((s) => s.key === saved && s.state !== 'pending') : undefined;
      // A remembered step that is FINISHED is not where the work is (UAT 20:
      // "Continue setup" opened on Nesting while the strip said "Next:
      // Production"); one still unfinished is exactly where it stopped.
      const known = savedStage ? (savedStage.satisfied ? (r.nextStage ?? saved) : saved) : null;
      if (jump) setStep(known ?? r.nextStage ?? 'lines');
    } catch (e) {
      setError(backendMessage(e, 'Could not read this order.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError(''); setConfirmed(false); setNotReadyStages(null);
    setLinesDirty(false); setStructureHint(null); setExpandLineId(null);
    load(true);
  }, [open, load]);

  /** Every step calls this after it writes; the rail follows along. */
  const refresh = useCallback((next?: OrderReadiness | null) => {
    if (next) setReadiness(next); else load(false);
  }, [load]);

  const steps = readiness?.stages ?? [];
  const idx = steps.findIndex((s) => s.key === step);
  const current = steps[idx] ?? null;

  useEffect(() => { if (step !== 'lines') setStructureHint(null); }, [step]);

  /**
   * Move to a step and remember it on the order.
   *
   * Without this, reopening lands on the first UNFINISHED step, which is right
   * most of the time and wrong in the case that matters: someone who went back
   * to step 2 to correct the BOM and closed for the day would be dropped at
   * step 4 the next morning, looking at the wrong thing. Fire-and-forget — the
   * step is a convenience, and failing to record it must not interrupt anyone.
   *
   * Uses `POST /orders/:id/wizard-step` (EU-7 A5) rather than a raw
   * `fabMutate('fabErpOrder','update',{wizard_step})` — EU-1 removed
   * `wizard_step` from that resource's `writeFields`, so the old write 400s.
   * The response's own readiness is threaded straight into `refresh`, so
   * clicking the rail never forces a second `GET .../readiness`.
   */
  const goTo = useCallback((next: ReadinessStage['key']) => {
    // THE STEPS HAPPEN IN ORDER. A stage the server reports as `pending` has
    // an unfinished stage before it and cannot be opened — not from the rail,
    // not from a link, not from a remembered step. The server refuses the
    // same move (409 STAGE_LOCKED), so this is the polite version of that.
    const target = readiness?.stages.find((s) => s.key === next);
    if (target?.state === 'pending') return;
    setStep(next);
    // A non-draft order records no step; re-read readiness anyway so a change
    // made outside the wizard (an upload from the order's tab) shows (UAT 19).
    if (readiness?.status !== 'draft') { refresh(); return; }
    setWizardStep(orderId, next).then((res) => refresh(res.readiness)).catch(() => {});
  }, [orderId, readiness, refresh]);

  /**
   * Coming back to the tab re-reads readiness (UAT 19): a plan uploaded from
   * the order's own Nesting tab, or a deploy from another window, left the
   * wizard insisting "1 part not on a sheet yet" until a full reload.
   */
  useEffect(() => {
    if (!open) return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') load(false); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, load]);

  // ── X4: don't lose unsaved structure edits by closing over them ──────────
  const [linesDirty, setLinesDirty] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const requestClose = useCallback(() => {
    if (linesDirty) { setConfirmCloseOpen(true); return; }
    onClose();
  }, [linesDirty, onClose]);

  // ── X1: BlankNesting's "where is this part" jump ──────────────────────────
  const [structureHint, setStructureHint] = useState<{ lineNo: number; label: string } | null>(null);
  /** The resolved line, handed to `OrderLinesPanel` so it opens (and scrolls to) that card. */
  const [expandLineId, setExpandLineId] = useState<number | null>(null);
  const goToStructureFor = useCallback(async (itemId: number) => {
    try {
      const [itemRes, lines] = await Promise.all([
        fabQuery<{ data: { id: number; orderLineId: number | null }[] }>('fabErpItem', { filters: { id: itemId } }),
        getOrderLines(orderId),
      ]);
      const orderLineId = itemRes.data?.[0]?.orderLineId ?? null;
      const line = orderLineId != null ? lines.find((l) => l.id === orderLineId) : undefined;
      setStructureHint(line ? { lineNo: line.lineNo, label: line.description || line.code || `line ${line.lineNo}` } : null);
      setExpandLineId(line ? line.id : null);
    } catch { setStructureHint(null); setExpandLineId(null); }
    goTo('lines');
  }, [orderId, goTo]);

  async function confirm() {
    setConfirming(true); setError(''); setNotReadyStages(null);
    try {
      await api.post(`${base()}/orders/${orderId}/confirm`, {});
      setConfirmed(true);
      toast('Order confirmed', 'success');
      await load(false);
    } catch (e) {
      const ax = e as { response?: { data?: { code?: string; readiness?: OrderReadiness } } };
      const data = ax.response?.data;
      if (data?.code === 'NOT_READY' && data.readiness) {
        setNotReadyStages(data.readiness.stages.filter((s) => !s.satisfied));
        setError('Not ready to confirm yet — see below.');
      } else {
        setError(backendMessage(e, 'Could not confirm this order.'));
      }
    } finally { setConfirming(false); }
  }

  // ── Confirm summary (X1 item 5) — says exactly what Confirm will do ───────
  const [confirmSummaryOpen, setConfirmSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState<{ draftMOs: number; unsentPOs: number; steelKg: number } | null>(null);

  async function openConfirmSummary() {
    setConfirmSummaryOpen(true);
    setSummaryLoading(true);
    try {
      const plan = await getProductionPlan(orderId);
      const draftMOs = [plan.cutting.productionOrder, plan.fabrication.productionOrder]
        .filter((mo): mo is ProductionOrderRef => !!mo && mo.status === 'draft').length;
      const unsentPOs = plan.buy.purchases.filter((p) => p.status === 'requested').length;
      /*
       * THE STEEL IS THE NESTED PLATE. Plate is bought by the SHEET ("12 nos of
       * 28 x 3100 x 12050"), so summing buy lines in kg found nothing and the
       * summary said "~0.0 t" on an order buying 184 t. The accepted nesting
       * plan already knows the tonnage; the kg lines are the fallback for an
       * order that buys steel by weight.
       */
      const kgLines = plan.buy.lines
        .filter((l) => l.procurementType !== 'free_issue' && (l.unit ?? '').toLowerCase() === 'kg')
        .reduce((n, l) => n + (Number(l.required) || 0), 0);
      const saved = await getSavedBlankPlan(orderId).catch(() => null);
      const steelKg = saved?.accepted && (saved.summary?.boughtKg ?? 0) > 0 ? saved.summary.boughtKg : kgLines;
      setSummary({ draftMOs, unsentPOs, steelKg });
    } catch { setSummary(null); } finally { setSummaryLoading(false); }
  }

  const todayDMY = new Intl.DateTimeFormat('en-GB').format(new Date());

  // ── quote → sales order ────────────────────────────────────────────────────
  const [converting, setConverting] = useState(false);
  async function doConvert() {
    setConverting(true); setError('');
    try {
      const res = await convertQuote(orderId);
      toast(`Converted to ${res.order.orderNumber}`, 'success');
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not convert this quote.'));
    } finally { setConverting(false); }
  }

  // ── revision → re-deploy and close (confirmOrder refuses a non-draft order) ─
  const [finishingRevision, setFinishingRevision] = useState(false);
  async function finishRevision() {
    setFinishingRevision(true); setError('');
    try {
      const plan = await getProductionPlan(orderId);
      const toRedeploy = [plan.cutting.productionOrder, plan.fabrication.productionOrder]
        .filter((mo): mo is ProductionOrderRef => !!mo && mo.status !== 'draft');
      // Sequential, deliberately: each deploy locks its own MO row and there
      // are at most two (cutting/fabrication) — nothing to gain by racing them.
      for (const mo of toRedeploy) {
        await deployProductionOrder(mo.id, { redeploy: true });
      }
      toast(toRedeploy.length ? `Re-deployed ${toRedeploy.length} production order(s)` : 'Revision saved', 'success');
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not finish the revision.'));
    } finally { setFinishingRevision(false); }
  }

  const isLast = idx === steps.length - 1;
  const canConfirm = readiness?.canConfirm === true;

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      fullWidth
      // Full width on the Production step: its table runs sideways.
      maxWidth={step === 'production' ? false : 'xl'}
      slotProps={{
        paper: {
          sx: {
            height: 'calc(100vh - 64px)', bgcolor: 'var(--c-bg)',
            // DESIGN_SYSTEM §5.5: modals are --r-lg; §5.2: e-3, not MUI's default.
            borderRadius: 'var(--r-lg)', boxShadow: 'var(--e-3)',
          },
        },
      }}
    >
      {/* Header — the close button is deliberately prominent and unqualified.
          There is no "are you sure" UNLESS a structure edit is unsaved (X4) —
          otherwise nothing is lost by closing. */}
      {/*
        `flexShrink: 0` on the header and the rail below it.

        The dialog paper is a flex COLUMN, so by default every child is allowed
        to shrink. A step panel with a few hundred rows in it therefore squeezed
        the two bars above it until their content spilled over — which reads as
        the steps being overlapped by the panel, because that is exactly what
        was happening. The panel gets `minHeight: 0` for the same reason: a flex
        item will not scroll below its content height without it, so it grows
        instead of scrolling and pushes into whatever is above.
      */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.75, flexShrink: 0,
        borderBottom: '1px solid var(--c-border)', bgcolor: 'var(--c-surface)',
      }}>
        {/*
          IDENTITY BLOCK (DESIGN_SYSTEM §4.3): the order's code in mono, its
          status as a real badge (icon + label + family, never a bare chip),
          and the two facts that matter while it is being prepared — who it is
          for and when it is due. One line each; nothing here wraps.
        */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
            <Mono sx={{ fontSize: 16, fontWeight: 600, color: 'var(--c-text)', whiteSpace: 'nowrap' }}>
              {orderNumber ?? 'Sales order'}
            </Mono>
            {readiness?.status && <StatusBadge status={readiness.status} />}
            {isQuote && <StatusBadge status="quote" family="info" />}
            {revisionMode && <StatusBadge status="revising" family="warning" />}
          </Box>
          <Typography noWrap sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
            {[
              customerName || null,
              requiredDate ? `required ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(requiredDate))}` : null,
              readiness?.status === 'draft' ? 'closing loses nothing' : null,
            ].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Tooltip title="Close — you can pick this up again from the Orders page">
          <IconButton onClick={requestClose} aria-label="Close wizard"><CloseRounded /></IconButton>
        </Tooltip>
      </Box>

      {/* Step rail */}
      {steps.length > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'stretch', gap: 0.5, px: 2, py: 1, flexShrink: 0,
          borderBottom: '1px solid var(--c-border)', bgcolor: 'var(--c-surface)',
          overflowX: 'auto',
        }}>
          {steps.map((s, i) => {
            const on = s.key === step;
            // Locked = not reached yet. Drawn muted, not clickable, and it says
            // which stage stands in the way (the server's `detail`).
            const locked = s.state === 'pending';
            const isNext = s.key === readiness?.nextStage;
            return (
              <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                {/* The same chevron-linked strip the order page draws (OrderStageStrip),
                    so the wizard and the page describe the sequence in one language. */}
                {i > 0 && <ChevronRightRounded sx={{ fontSize: 16, color: 'var(--c-text-3)', mx: 0.25 }} />}
              <Box
                role="button"
                tabIndex={locked ? -1 : 0}
                aria-disabled={locked || undefined}
                aria-current={on ? 'step' : undefined}
                title={locked ? `${s.label} opens after the earlier steps are finished — ${s.detail}` : undefined}
                onClick={() => { if (!locked) goTo(s.key); }}
                onKeyDown={(e) => { if (!locked && (e.key === 'Enter' || e.key === ' ')) goTo(s.key); }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.75,
                  borderRadius: 'var(--r-sm)', cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.55 : 1,
                  // The step you are ON is a solid inset (surface-2 + border); the
                  // step that needs work next carries the accent on its number
                  // only. Violet is spent on one thing at a time.
                  bgcolor: on ? 'var(--c-surface-2)' : 'transparent',
                  border: `1px solid ${on ? 'var(--c-border)' : 'transparent'}`,
                  transition: 'background var(--t-fast) var(--ease)',
                  '&:hover': { bgcolor: locked ? 'transparent' : 'var(--c-surface-2)' },
                  '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, flexShrink: 0,
                    color: isNext ? 'var(--c-primary-700)' : 'var(--c-text-3)',
                    bgcolor: isNext ? 'var(--c-primary-50)' : 'transparent',
                    border: `1px solid ${isNext ? 'var(--c-primary-200)' : 'var(--c-border)'}`,
                  }}
                >
                  {i + 1}
                </Box>
                <StageIcon state={s.state} size={16} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{
                    fontSize: 13, fontWeight: on ? 600 : 500, whiteSpace: 'nowrap',
                    color: on ? 'var(--c-primary-700)' : 'var(--c-text)',
                  }}>
                    {s.label}
                  </Typography>
                  {/* item 11: a long detail string ("72 pieces of 240 not on
                      any sheet across 7 parts") used to force the whole rail
                      wider than the dialog. Truncated with a tooltip instead —
                      the full text is one hover away, not gone. */}
                  <Tooltip title={s.detail}>
                    <Typography sx={{
                      fontSize: 11, color: 'var(--c-text-2)', maxWidth: 170,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {s.detail}
                    </Typography>
                  </Tooltip>
                </Box>
              </Box>
              </Box>
            );
          })}
        </Box>
      )}

      <DialogContent sx={{ p: 3, bgcolor: 'var(--c-bg)', flex: 1, minHeight: 0 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {/*
          AFTER CONFIRM, SAY WHAT HAPPENS NEXT. The button turning into a
          disabled "Confirmed" left people on a finished wizard wondering
          whether anything else was expected of them. It is: deploying the
          production orders and sending the purchase requests are separate,
          deliberate actions on the Production step.
        */}
        {confirmed && (
          <Alert
            severity="success" sx={{ mb: 2 }}
            action={(
              <Box sx={{ display: 'flex', gap: 1 }}>
                {step !== 'production' && (
                  <Button color="inherit" size="small" onClick={() => goTo('production')}>Production step</Button>
                )}
                <Button color="inherit" size="small" onClick={onClose}>Close</Button>
              </Box>
            )}
          >
            {/* UAT 25: say what is actually the case, not the generic story —
                both production orders were already deployed when this said
                "stay draft until you deploy them". */}
            <b>Order confirmed.</b>{' '}
            {(summary?.draftMOs ?? 0) > 0
              ? `${summary?.draftMOs} production order${summary?.draftMOs === 1 ? ' stays' : 's stay'} draft until you deploy ${summary?.draftMOs === 1 ? 'it' : 'them'}`
              : 'Its production orders are already deployed'}
            {(summary?.unsentPOs ?? 0) > 0
              ? `; ${summary?.unsentPOs} purchase request${summary?.unsentPOs === 1 ? ' waits' : 's wait'} until you send ${summary?.unsentPOs === 1 ? 'it' : 'them'}`
              : ''}
            {' '}— all from the Production step.
          </Alert>
        )}

        {/* Structured 422 (X2): each unfinished stage, a link back to it. */}
        {notReadyStages && notReadyStages.length > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Still to finish:</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {notReadyStages.map((s) => (
                <Chip
                  key={s.key} size="small" clickable
                  label={`${s.label} — ${s.detail}`}
                  onClick={() => { goTo(s.key); setNotReadyStages(null); }}
                />
              ))}
            </Box>
          </Alert>
        )}

        {revisionMode && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Revising a confirmed order — <b>{revisionReason}</b>. Structure changes made now are
            recorded against this order's revision history.
          </Alert>
        )}
        {isQuote && step === 'production' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This is a quote — the figures below are an estimate. Nothing is bought or deployed
            until it is converted to a sales order.
          </Alert>
        )}
        {structureHint && step === 'lines' && (
          <Alert severity="info" sx={{ mb: 2 }} onClose={() => setStructureHint(null)}>
            That part is on <b>line {structureHint.lineNo} — {structureHint.label}</b>. Open it
            below to see it in the structure.
          </Alert>
        )}

        {loading ? (
          // §5.7-5: a body shows the shape of what is coming, never a centred spinner.
          <DetailSkeleton />
        ) : (
          <>
            {step === 'lines' && (
              <OrderLinesPanel
                orderId={orderId} canManage={canManage}
                onChanged={refresh} onDirtyChange={setLinesDirty}
                revisionReason={revisionReason} expandLineId={expandLineId}
                deployedProductionOrders={readiness?.stages.find((s) => s.key === 'production')?.deployed ?? 0}
              />
            )}
            {/* Flows BEFORE parameters: which fields a part needs is derived from
                its flow's formulas, so the flow has to be known first. */}
            {/*
              THERE IS NO DIMENSIONS STEP. The sizes are on the structure tree,
              beside the row they belong to, so a step of its own was a second
              screen asking about the screen you had just left. The Structure
              step reports what is still unsized and is where it gets fixed.
            */}
            {step === 'nesting' && (
              <BlankNesting
                orderId={orderId} canManage={canManage} onStageChanged={refresh}
                onGoToStructure={(itemId) => void goToStructureFor(itemId)}
                onContinue={() => goTo('params')}
              />
            )}
            {step === 'params' && (
              <OrderParameters orderId={orderId} canManage={canManage} onStageChanged={refresh} only="rest" />
            )}
            {/* Buy, cut and make — one step. */}
            {step === 'production' && (
              <OrderProductionPlan
                orderId={orderId} canManage={canManage && !isQuote} onChanged={refresh}
                isEstimate={isQuote} orderStatus={readiness?.status}
                onGoToParams={() => goTo('params')}
              />
            )}
          </>
        )}
      </DialogContent>

      {/*
        Footer: move between steps, and confirm / convert / finish at the end.
        A sticky action bar (§7.5 StickyActionBar shape): lifted on e-2 so it
        reads as the place actions live, and the status line in the middle is
        ONE line — on a narrow window it truncates rather than pushing the
        primary button off the edge.
      */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 1.5, sm: 3 }, py: 1.5, flexShrink: 0,
        borderTop: '1px solid var(--c-border)', bgcolor: 'var(--c-surface)', boxShadow: 'var(--e-2)',
        position: 'relative', zIndex: 1,
      }}>
        <Button
          startIcon={<ArrowBackRounded />}
          disabled={idx <= 0}
          onClick={() => goTo(steps[idx - 1].key)}
          sx={{ flexShrink: 0 }}
        >
          Back
        </Button>

        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
          {current && (
            <>
              <StageIcon state={current.state} size={15} />
              <Tooltip title={current.detail}>
                <Typography noWrap sx={{ fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 0 }}>
                  {current.detail}
                </Typography>
              </Tooltip>
            </>
          )}
        </Box>

        {isLast ? isQuote ? (
          <Tooltip title="Turn this quote into a sales order — nothing on it is lost">
            <span>
              <Button
                variant="contained" disabled={!canManage || converting} onClick={() => void doConvert()}
                startIcon={converting ? <CircularProgress size={14} color="inherit" /> : <SwapHorizRounded />}
              >
                Convert to order
              </Button>
            </span>
          </Tooltip>
        ) : revisionMode ? (
          <Tooltip title={'confirmOrder refuses an order that is not draft — this re-deploys any '
            + 'production order the revision touched instead, and closes.'}>
            <span>
              <Button
                variant="contained" disabled={!canManage || finishingRevision} onClick={() => void finishRevision()}
                startIcon={finishingRevision ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
              >
                Finish revision
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Tooltip title={
            confirmed ? 'Already confirmed'
              : canConfirm ? 'See what confirming will (and will not) do'
                : `Still to finish: ${steps.filter((s) => !s.satisfied).map((s) => s.label).join(', ')}`
          }>
            {/* span so the tooltip still shows on a disabled button — the reason
                it is disabled is the whole point of the tooltip. */}
            <span>
              <Button
                variant="contained"
                disabled={!canManage || !canConfirm || confirming || confirmed}
                onClick={() => void openConfirmSummary()}
                startIcon={confirming ? <CircularProgress size={14} color="inherit" /> : <TaskAltRounded />}
              >
                {confirmed ? 'Confirmed' : 'Confirm order'}
              </Button>
            </span>
          </Tooltip>
        ) : (
          /**
           * NEXT IS A RECOMMENDATION, NEVER A DEAD END.
           *
           * While the current step is unfinished, Next is still there — drawn
           * as the secondary, warning-coloured "Skip for now" — because the
           * alternative was a trap: a disabled Next whose tooltip said "use the
           * steps above if you mean to skip it" while the steps above were
           * locked (`pending`). Someone with one part missing a length could
           * neither go forward nor be told what to do (prod UAT 2026-09-15).
           *
           * The recommendation still stands: the primary, violet Next appears
           * only once the step is satisfied, the skip variant names what is
           * unfinished, and Confirm keeps waiting for every step regardless —
           * skipping changes where you are looking, not what is required.
           * The one time Next is truly disabled is when the following step is
           * `pending`: nothing on it has been started, so there is nothing to
           * look at yet, and the server would refuse the move (409) anyway.
           *
           * `satisfied` (not a bare `state === 'done'` check) is the server's
           * own answer — it already treats `not_applicable` and an optional
           * stage as done, so this can never disagree with `canConfirm`.
           */
          (() => {
            const next = steps[idx + 1];
            const unfinished = !!current && !current.satisfied;
            const nextLocked = next.state === 'pending';
            const title = !unfinished
              ? `Go to ${next.label}`
              : nextLocked
                ? `${current!.label} is not finished — ${current!.detail}. ${next.label} has nothing on it yet, so finish this step first.`
                : `${current!.label} is not finished — ${current!.detail}. You can carry on; Confirm waits until it is done.`;
            return (
              <Tooltip title={title}>
                <span>
                  <Button
                    variant={unfinished ? 'outlined' : 'contained'}
                    color={unfinished ? 'warning' : 'primary'}
                    endIcon={<ArrowForwardRounded />}
                    disabled={unfinished && nextLocked}
                    onClick={() => goTo(next.key)}
                  >
                    {/* Named, so the button says where it goes — "Next" alone made
                        people check the rail before pressing it. */}
                    {unfinished ? 'Skip for now' : 'Next'}: {next.label}
                  </Button>
                </span>
              </Tooltip>
            );
          })()
        )}
      </Box>

      {/* X1 item 5: Confirm says exactly what it will (and will not) do. */}
      <ConfirmDialog
        open={confirmSummaryOpen}
        title="Confirm this order?"
        confirmLabel="Confirm order"
        onClose={() => setConfirmSummaryOpen(false)}
        onConfirm={async () => { setConfirmSummaryOpen(false); await confirm(); }}
        body={summaryLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={20} /></Box>
        ) : (
          <Box sx={{ fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography sx={{ fontSize: 13.5 }}>
              This marks the order as committed. It does not buy material or deploy anything on its own:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              <li>{summary?.draftMOs ?? 0} production order(s) will stay draft until you deploy them.</li>
              <li>{summary?.unsentPOs ?? 0} purchase request(s) are not yet sent to a supplier.</li>
              <li>~{((summary?.steelKg ?? 0) / 1000).toFixed(1)} t of steel is on this order's buy list.</li>
              <li>Confirmed date: {todayDMY} (the plant's own date, stamped by the server).</li>
            </Box>
          </Box>
        )}
      />

      {/* X4: closing over an unsaved structure edit asks first. */}
      <ConfirmDialog
        open={confirmCloseOpen}
        title="Close without saving?"
        confirmLabel="Discard and close"
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={() => { setConfirmCloseOpen(false); setLinesDirty(false); onClose(); }}
        body="A line's structure has unsaved edits. Closing now discards them."
      />
    </Dialog>
  );
}
