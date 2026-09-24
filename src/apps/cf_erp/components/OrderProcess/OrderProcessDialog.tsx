import { useEffect, useState, type ReactNode } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Link } from 'react-router-dom';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { cfApi, type CfApiError } from '../../api/client';
import type { OrderProcessView, OrderProduction, Release, SalesOrder } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { ORDER_STATUS_LABEL } from '../../lib/orders';
import { CLOSE_HINT, CONFIRM_STILL_ON_THE_PAGE, forwardHelp, forwardLabel, lineLabel, stageSatisfied } from '../../lib/process';
import { ErrorNotice, Mono, OrderStatusBadge, SkeletonBlock } from '../ui';
import { useToast } from '../toastContext';
import { ProcessRail } from './ProcessRail';
import { StageBody } from './StageBody';
import { BlockerList, DetailLine } from './stageUi';

/** Where the chosen line is remembered for the session, per order. */
const lineKey = (orderId: number) => `cf_erp.process.line.${orderId}`;
const readLine = (orderId: number): number | null => {
  try { const v = sessionStorage.getItem(lineKey(orderId)); return v ? Number(v) || null : null; } catch { return null; }
};
const writeLine = (orderId: number, lineId: number) => {
  try { sessionStorage.setItem(lineKey(orderId), String(lineId)); } catch { /* private window, or storage off */ }
};

/** An order that has stopped moving: confirming is behind it, one way or the other. */
const SETTLED = ['confirmed', 'closed', 'lost', 'cancelled'];

/**
 * The order process pop-up: somebody walking one order through the stages its
 * customer's process asks for.
 *
 * THE RULE THIS SCREEN EXISTS TO KEEP. It sits over the order's tabs, and the
 * two must never contradict each other. So:
 *   · every state, detail and blocker on screen comes from GET /orders/:id/process,
 *     the same object the strip behind renders — nothing is guessed here;
 *   · the rail is never locked: any stage, any time;
 *   · nothing the tabs allow is refused here. Confirm is the only hard gate;
 *   · an unfinished stage offers to be skipped by name rather than going dead.
 *
 * The sibling app shipped a wizard that broke all four at once — it refused a
 * step the tabs had already done and told the user to use a rail it had locked.
 */
export function OrderProcessDialog({
  open, onClose, startAt, view, loading, error, order, production, productionError,
  onOrderSaved, onReleaseChanged, onReloadAll,
}: {
  open: boolean;
  onClose: () => void;
  /** The stage the strip asked for; without one it opens where the work is. */
  startAt?: string | null;
  view: OrderProcessView | null;
  loading: boolean;
  error: CfApiError | null;
  order: SalesOrder;
  production: OrderProduction | null;
  productionError: CfApiError | null;
  onOrderSaved: (o: SalesOrder) => void;
  onReleaseChanged: (r: Release) => void;
  /** Reloads the order, its production and the process together. */
  onReloadAll: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [stageKey, setStageKey] = useState<string | null>(null);
  const [pickedLine, setPickedLine] = useState<number | null>(() => readLine(order.id));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<CfApiError | null>(null);

  const lines = view?.lines ?? [];
  const stages = view?.stages ?? [];

  /*
   * It opens on the stage that needs work, not on wherever somebody stopped
   * last time — the whole point of a process the API computes. Set once per
   * opening, then the person steers.
   */
  useEffect(() => {
    if (!open) { setStageKey(null); setActionError(null); return; }
    if (stageKey != null || !view?.process) return;
    const keys = view.stages.map((s) => s.stageKey);
    if (!keys.length) return;
    setStageKey(startAt && keys.includes(startAt) ? startAt
      : view.nextStage && keys.includes(view.nextStage) ? view.nextStage
        : keys[0]);
  }, [open, startAt, view, stageKey]);

  // The remembered line, falling back the moment it stops existing — so the
  // switcher never sits on a value that is not in its own list.
  const fallback = lines.find((l) => {
    const s = l.stages.find((x) => x.stageKey === view?.nextStage);
    return s ? !stageSatisfied(s) : false;
  }) ?? lines[0] ?? null;
  const line = lines.find((l) => l.lineId === pickedLine) ?? fallback;

  const pickLine = (lineId: number) => { setPickedLine(lineId); writeLine(order.id, lineId); };

  // Every state on screen is this line's own; with no lines, the order's roll-up
  // is all there is to show.
  const shown = line ? line.stages : stages;
  // The mark follows what the rail is showing: this line's own first unfinished
  // stage, or — with no line — the order's. A "next" pointing at a stage the
  // rail has just badged as done would read as a contradiction.
  const railNext = line ? (shown.find((s) => !stageSatisfied(s))?.stageKey ?? null) : (view?.nextStage ?? null);
  const idx = Math.max(0, shown.findIndex((s) => s.stageKey === stageKey));
  const current = shown[idx] ?? null;
  const prev = idx > 0 ? shown[idx - 1] : null;
  const next = idx < shown.length - 1 ? shown[idx + 1] : null;

  const blockers = view?.blockers ?? [];
  const settled = !!view && SETTLED.includes(view.order.status);
  const canManage = isPermitted('cf_erp_orders_manage');
  const confirmPoint = !!current && (next === null || current.stageKey === 'confirm');
  const showConfirm = confirmPoint && !settled;

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

  // The page behind has a Confirm button of its own that this gate does not
  // touch. When the two disagree, say which is which rather than looking broken.
  const pageAllowsConfirm = order.allowedTransitions.includes('confirmed');
  const confirmWhy = !canManage
    ? 'You can see this order, but your role cannot confirm it. Ask an administrator for the orders permission.'
    : !view?.canConfirm
      ? [
        blockers.length
          ? `${blockers.length} ${blockers.length === 1 ? 'thing' : 'things'} still to settle — every one of them is listed here.`
          : `An order that is ${ORDER_STATUS_LABEL[view?.order.status ?? 'draft'].toLowerCase()} cannot be confirmed.`,
        pageAllowsConfirm ? CONFIRM_STILL_ON_THE_PAGE : '',
      ].filter(Boolean).join(' ')
      : 'Commit this order. It becomes a job, and can only be closed or cancelled after that.';

  const header = (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', minWidth: 0, width: '100%' }}>
      <Box sx={{ minWidth: 0, flex: '1 1 220px' }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.25 }}>
          <Mono sx={{ fontSize: 16, fontWeight: 500, color: 'var(--c-text)' }}>{order.code}</Mono>
          {view && <OrderStatusBadge status={view.order.status} />}
        </Box>
        <Typography component="h2" sx={{ fontSize: 14.5, fontWeight: 500, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>
          {order.title ?? 'Untitled'}
        </Typography>
        <Typography sx={{ fontSize: 12.5, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.25 }}>
          {view?.process
            ? <>Process <Box component="span" sx={{ color: 'var(--c-text)' }}>{view.process.name}</Box> <Mono muted>{view.process.code}</Mono></>
            : 'Process'}
        </Typography>
      </Box>
      {view?.process && (lines.length > 0 ? (
        <TextField select size="small" label="Working on" value={line?.lineId ?? ''}
          onChange={(e) => pickLine(Number(e.target.value))}
          helperText="The stages show this line's own state."
          sx={{ flex: '1 1 240px', minWidth: 0, maxWidth: { sm: 320 } }}>
          {lines.map((l) => <MenuItem key={l.lineId} value={l.lineId}>{lineLabel(l)}</MenuItem>)}
        </TextField>
      ) : (
        <Typography sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', flex: '1 1 200px', minWidth: 0 }}>
          No lines yet, so the stages below are the order's own.
        </Typography>
      ))}
      <Tooltip title={CLOSE_HINT}>
        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ flexShrink: 0, color: 'var(--c-text-2)', '&:hover': { color: 'var(--c-text)' } }}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );

  let body: ReactNode;
  if (error) {
    body = <Box sx={{ p: 2.5 }}><ErrorNotice error={error} onRetry={onReloadAll} /></Box>;
  } else if (!view) {
    body = (
      <Box sx={{ p: 2.5, display: 'grid', gap: 1.5 }} aria-busy={loading} aria-label="Loading the process">
        {[0, 1, 2, 3, 4].map((i) => <SkeletonBlock key={i} h={44} r={10} />)}
      </Box>
    );
  } else if (!view.process) {
    // No process resolved. Say why, in the API's own words, and stop — an
    // invented set of stages is worse than none.
    body = (
      <Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, maxWidth: 720 }}>
        <Box sx={{
          display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.5, fontSize: 13.5,
          borderRadius: 'var(--r-md)', background: 'var(--c-info-50)', border: '1px solid var(--c-info-200)', color: 'var(--c-info-800)',
        }}>
          <InfoOutlined sx={{ fontSize: 18, mt: '1px', flexShrink: 0 }} aria-hidden />
          <Box sx={{ minWidth: 0 }}>{view.reason ?? 'This order follows no process, so there is nothing to walk through.'}</Box>
        </Box>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
          Nothing is lost: the order's tabs behind this do everything they always did. A process only adds the running order to work them in.
        </Typography>
        <Box>
          <Button variant="outlined" component={Link} to={appPath(company, 'processes')}>Set up processes</Button>
        </Box>
      </Box>
    );
  } else {
    body = (
      <Box sx={{
        display: 'grid', minWidth: 0, flex: 1, minHeight: 0,
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '264px minmax(0, 1fr)' },
        gridTemplateRows: { xs: 'auto minmax(0, 1fr)', md: 'minmax(0, 1fr)' },
      }}>
        <Box sx={{
          minWidth: 0, p: 1.5, overflowY: { xs: 'visible', md: 'auto' },
          borderBottom: { xs: '1px solid var(--c-divider)', md: 'none' },
          borderRight: { md: '1px solid var(--c-divider)' },
          background: 'var(--c-surface-2)',
        }}>
          <ProcessRail stages={shown} current={current?.stageKey ?? ''} nextStage={railNext} onPick={setStageKey}
            nextMarkTitle={line ? `The next stage that needs work on line ${line.lineNo}` : 'The next stage that needs work on this order'} />
        </Box>
        <Box sx={{ minWidth: 0, p: { xs: 1.5, sm: 2.5 }, overflowY: 'auto' }}>
          {current && (
            <StageBody key={`${current.stageKey}:${line?.lineId ?? 'order'}`}
              view={view} stage={current} line={line} order={order} production={production} productionError={productionError}
              onPickLine={pickLine} onOrderSaved={onOrderSaved} onReleaseChanged={onReleaseChanged}
              onReloadAll={onReloadAll} onGoStage={setStageKey} />
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="lg" fullScreen={fullScreen}
      aria-labelledby="cf-process-title"
      slotProps={{ paper: { sx: { height: { xs: '100%', sm: 'calc(100% - 64px)' }, maxHeight: 'none', borderRadius: { xs: 0, sm: 'var(--r-lg)' } } } }}>
      {/* component="div": the heading inside is the real <h2>, and an h2 inside an h2 is not a heading. */}
      <DialogTitle component="div" id="cf-process-title" sx={{ py: 1.75 }}>{header}</DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{body}</DialogContent>

      {view?.process && current && (
        <DialogActions sx={{
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, px: 2, py: 1.5,
          // DialogActions assumes a flex row and indents its later children.
          '& > :not(style) ~ :not(style)': { ml: 0 },
        }}>
          <ErrorNotice error={actionError} sx={{ mb: 0 }} />
          {/* Refused: every blocker gets its own line, named by its line number.
              On the Confirm stage the same list is already in the body above. */}
          {showConfirm && !view.canConfirm && current.stageKey !== 'confirm' && blockers.length > 0 && (
            <Box sx={{ maxHeight: 168, overflowY: 'auto', pr: 0.5 }}><BlockerList blockers={blockers} /></Box>
          )}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <Tooltip title={prev ? `Back to ${prev.label}` : 'This is the first stage.'}>
              <span>
                <Button startIcon={<ArrowBackRounded />} disabled={!prev || busy} onClick={() => prev && setStageKey(prev.stageKey)}>Back</Button>
              </span>
            </Tooltip>
            <DetailLine text={current.detail} sx={{ flex: '1 1 160px', fontSize: 13 }} />
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
              <Tooltip title={forwardHelp(next, stageSatisfied(current))}>
                <span>
                  <Button variant="contained" disabled={busy}
                    endIcon={stageSatisfied(current) ? <ArrowForwardRounded /> : <SkipNextRounded />}
                    onClick={() => setStageKey(next.stageKey)}>
                    {forwardLabel(next, stageSatisfied(current))}
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button variant="contained" onClick={onClose}>Close</Button>
            )}
          </Box>
        </DialogActions>
      )}
    </Dialog>
  );
}
