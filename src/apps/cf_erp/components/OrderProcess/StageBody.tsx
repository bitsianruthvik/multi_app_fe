import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import type { CfApiError } from '../../api/client';
import { lineLock } from '../../api/lock';
import type { OrderProcessLine, OrderProcessView, OrderProduction, OrderStage, ReleaseSummary, SalesOrder } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { CONFIRM_MOVE, LOCKED_STATUSES } from '../../lib/orders';
import {
  DECIDED_BY_HELP, UNBUILT_STAGE,
  isOrderWide, isUnbuilt, nextLineFor, notForThisLine, tabFor,
} from '../../lib/process';
import { cfApi } from '../../api/client';
import { EmptyState, Mono, SectionCard } from '../ui';
import { ProductionStep } from '../ProductionOrders/ProductionStep';
import { OrderStructureStep } from '../OrderStructure/OrderStructureStep';
import { useToast } from '../toastContext';
import { BlockerList, StageStateBadge } from './stageUi';
import { ConfirmDialog } from '../ConfirmDialog';
import { AcceptanceStep } from '../Acceptance/AcceptanceStep';
import { HelpButton } from '../../help/HelpButton';

// The per-line stage panels load when their stage is opened (speed, 2026-10-19): Nesting, Freeze design,
// Execution plan and Material request were in the order page's own chunk, downloaded before it could draw.
// (Structure & values, Production and Acceptance stay in it — the order page draws them on its plain tabs too.)
const NestingPanel = lazy(() => import('../Nesting/NestingPanel').then((m) => ({ default: m.NestingPanel })));
const CutPiecesButton = lazy(() => import('../Nesting/CutPiecesDialog').then((m) => ({ default: m.CutPiecesButton })));
const LockPanel = lazy(() => import('../Lock/LockPanel').then((m) => ({ default: m.LockPanel })));
const ExecutionPlanPanel = lazy(() => import('../OrderStructure/ExecutionPlanPanel').then((m) => ({ default: m.ExecutionPlanPanel })));
const OrderPurchasePanel = lazy(() => import('../Purchase/OrderPurchasePanel').then((m) => ({ default: m.OrderPurchasePanel })));

/** While a stage panel's code arrives. */
function PanelLoading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }} aria-busy="true" aria-label="Loading">
      <CircularProgress size={28} />
    </Box>
  );
}

/**
 * What each stage tab shows, above its Back / Next foot.
 *
 * Three rules hold this together:
 *   1. The screens that already exist are REUSED, not re-drawn — the
 *      Structure & values step and the release view are the same components an
 *      order without a process shows on its plain tabs, so the two can never
 *      offer different things.
 *   2. A stage the app cannot work yet says so in plain words and points at
 *      where that work is done today. It does not pretend to be a screen.
 *   3. A stage that does not apply to the chosen line still shows its body.
 *      The notice explains; it never takes anything away.
 *   4. An order-wide step (Structure & values, Execution plan, Material
 *      request — 2026-10-18) is handed the order's roll-up and works every line
 *      at once; only Freeze design, Nesting and Production are per line.
 */

/** A tinted note — a stage's way of explaining without taking anything away. */
function Note({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', gap: 1, alignItems: 'flex-start', p: 1.25, minWidth: 0, fontSize: 13,
      borderRadius: 'var(--r-md)', background: `var(--c-${tone}-50)`, border: `1px solid var(--c-${tone}-200)`, color: `var(--c-${tone}-800)`,
    }}>
      <InfoOutlined sx={{ fontSize: 17, mt: '1px', flexShrink: 0 }} aria-hidden />
      <Box sx={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>{children}</Box>
    </Box>
  );
}

/**
 * A stage that cannot go ahead because an earlier one is not done: one line
 * saying so, and a button that jumps there.
 */
export function WaitingOn({ stage, label, order, onGo, onOrderSaved, onReloadAll }: {
  stage: OrderStage; label: string | null; order: SalesOrder;
  onGo: (stageKey: string) => void; onOrderSaved: (o: SalesOrder) => void; onReloadAll: () => void;
}) {
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const w = stage.waitingOn;
  if (!w || stage.state === 'done' || stage.state === 'not_applicable') return null;
  // A STOCK order is confirmed with its own button; a customer's order by its Customer acceptance (§73).
  const confirmIt = w.action === 'confirm' && !w.stageKey;
  const toAcceptance = w.action === 'acceptance' && !w.stageKey;
  return (
    <Note tone="warning">
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}><strong>{w.message}</strong></Box>
        {confirmIt ? (
          <>
            <Button size="small" variant="outlined" color="inherit" disabled={!isPermitted('cf_erp_orders_manage') || !order.allowedTransitions.includes('confirmed')}
              onClick={() => setAsking(true)}>Confirm the order</Button>
            <ConfirmDialog open={asking} title="Confirm order?" confirmLabel="Confirm" entityName={`${order.code}${order.title ? ` · ${order.title}` : ''}`}
              body={CONFIRM_MOVE.confirmed ?? ''} onClose={() => setAsking(false)}
              onConfirm={async () => {
                const saved = await cfApi.post<SalesOrder>(`/orders/${order.id}/status`, { status: 'confirmed' });
                onOrderSaved(saved); invalidateNavCounts(); toast.success(`${saved.code} is now confirmed.`); onReloadAll();
              }} />
          </>
        ) : toAcceptance ? (
          <Button size="small" variant="outlined" color="inherit" onClick={() => onGo('acceptance')}>Go to Customer acceptance</Button>
        ) : w.stageKey ? (
          <Button size="small" variant="outlined" color="inherit" onClick={() => onGo(w.stageKey as string)}>Go to {label ?? w.stageKey}</Button>
        ) : null}
      </Box>
    </Note>
  );
}

/** A stage this line does not need: said out loud, with the line that does need it offered. */
function NotForThisLine({ view, stage, line, onPickLine }: {
  view: OrderProcessView; stage: OrderStage; line: OrderProcessLine; onPickLine: (lineId: number) => void;
}) {
  const next = nextLineFor(view.lines, stage.stageKey, line.lineId);
  return (
    <Note>
      <Box>
        <strong>{notForThisLine(stage, line.lineNo)}</strong> {stage.detail}. {DECIDED_BY_HELP[stage.decidedBy]}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {next
          ? <Button size="small" variant="outlined" color="inherit" onClick={() => onPickLine(next.lineId)}>Work on line {next.lineNo} instead</Button>
          : <Box>No other line on this order needs it either.</Box>}
      </Box>
    </Note>
  );
}

/** A stage whose own screen has not been built. Honest about it, and about where the work happens meanwhile. */
function UnbuiltStagePanel({ stage }: { stage: OrderStage }) {
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const words = UNBUILT_STAGE[stage.stageKey];
  const to = (path: string) => appPath(company, path);

  const links: ReactNode[] = [];
  if (stage.stageKey === 'buying' && isPermitted('cf_erp_inventory_view')) {
    links.push(
      <Button key="buy" size="small" variant="outlined" endIcon={<LaunchRounded />} component={Link} to={to('material-requests')}>Open Purchase</Button>,
    );
  }
  return (
    <SectionCard title={stage.label} subtitle={words?.what}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <StageStateBadge stage={stage} />
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', flex: '1 1 240px', minWidth: 0 }}>{stage.detail}</Typography>
        </Box>
        <Note tone="warning">
          <Box><strong>This stage has no screen of its own yet.</strong> {words?.soon}</Box>
          <Box>{words?.today}</Box>
        </Note>
        {links.length > 0 && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{links}</Box>}
        <BlockerList blockers={stage.blockers} heading={<Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>What is outstanding</Typography>} />
      </Box>
    </SectionCard>
  );
}

export function StageBody({
  view, stage, line, order,
  onPickLine, onOrderSaved, onReloadAll, onGoStage,
}: {
  view: OrderProcessView;
  /** The stage being worked, as it stands for the chosen line. production / productionError / onReleaseChanged: kept for
   *  the callers; the Production step reads its production orders itself since §76. */
  stage: OrderStage;
  /** The line being worked on — null only while the order has no lines. */
  line: OrderProcessLine | null;
  order: SalesOrder;
  production: OrderProduction | null;
  productionError: CfApiError | null;
  onPickLine: (lineId: number) => void;
  onOrderSaved: (o: SalesOrder) => void;
  onReleaseChanged: (r: ReleaseSummary) => void;
  /** Reloads the order, its production and the process together. */
  onReloadAll: () => void;
  onGoStage: (stageKey: string) => void;
}) {
  const isPermitted = useIsPermitted();
  const wide = isOrderWide(stage);

  let body: ReactNode;
  if (stage.stageKey === 'structure' || stage.stageKey === 'values') {
    // ONE step for the whole order (user, 2026-10-18): every line is a group of one view, with its parts and its
    // values beside them. Values is a check on this tab, not a tab — it reaches here only for a process that has a
    // Values stage but no Structure stage to fold it into.
    body = <OrderStructureStep order={order} view={view} onOrderSaved={onOrderSaved} onChanged={onReloadAll} onGoCutPieces={() => onGoStage('cut_pieces')} onGoStage={onGoStage} />;
  } else if (stage.stageKey === 'execution_plan') {
    // How the order is made and shipped, before the freeze (§72) — for the whole order, a line may differ.
    body = <ExecutionPlanPanel orderId={order.id} onChanged={onReloadAll} />;
  } else if (stage.stageKey === 'lock') {
    // Lock belongs to ONE line: it rolls that line's structure out into pieces.
    body = line
      ? <LockPanel key={line.lineId} lineId={line.lineId} lineNo={line.lineNo} quantity={line.quantity} canManage={isPermitted('cf_erp_orders_manage')}
          stages={view.stages} onGoStage={onGoStage} onChanged={onReloadAll} />
      : (
        <SectionCard title="Freeze design">
          <EmptyState icon={<LockRounded />} title="No lines yet" hint="A line is frozen once its structure and values are settled, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('structure')}>Add a line</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'nesting') {
    // The layout belongs to ONE line — a cut plate is a temporary item of that
    // line — so without a line there is nothing to nest, and the panel is given
    // the line it is looking at rather than working one out for itself.
    const orderLine = order.lines?.find((l) => l.id === line?.lineId) ?? null;
    const notFrozen = !!orderLine && orderLine.lineType === 'custom' && !lineLock(orderLine) && !LOCKED_STATUSES.includes(order.status);
    body = line && notFrozen
      ? (
        <SectionCard title="Nesting">
          <EmptyState icon={<LockRounded />} title="Freeze the design first"
            hint={`Nesting lays out the frozen pieces, and line ${line.lineNo} is not frozen yet. The cut pieces are made automatically — look at them any time.`}
            action={(
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
                {view.stages.some((x) => x.stageKey === 'lock') && <Button variant="contained" onClick={() => onGoStage('lock')}>Go to Freeze design</Button>}
                <CutPiecesButton lineId={line.lineId} lineNo={line.lineNo} canManage={isPermitted('cf_erp_orders_manage')} onChanged={onReloadAll}
                  onGoValues={() => onGoStage('structure')} />
              </Box>
            )} />
        </SectionCard>
      )
      : line
      ? <NestingPanel key={line.lineId} orderId={order.id} lineId={line.lineId} canManage={isPermitted('cf_erp_orders_manage')} canEditCatalog={isPermitted('cf_erp_catalog_manage')} onChanged={onReloadAll} />
      : (
        <SectionCard title="Nesting">
          <EmptyState icon={<GridViewRounded />} title="No lines yet" hint="Rectangles are cut for a line, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('structure')}>Add a line</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'production') {
    // §76 (user, 2026-10-18): TIMES, then the production orders made from the execution plan — released, tracked and
    // dispatched per production order. The old per-line Release / tracker left the order page; older releases stay readable.
    body = isPermitted('cf_erp_production_view')
      ? <ProductionStep order={order} onChanged={onReloadAll} />
      : (
        <SectionCard title="Production">
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>You can see this order, but your role cannot see production. Ask an administrator for the production permission.</Typography>
        </SectionCard>
      );
  } else if (stage.stageKey === 'buying') {
    // §71: Raise MR, and a read-only status of each MR (everything after it is in Purchase).
    body = <OrderPurchasePanel order={order} stage={stage} onChanged={onReloadAll} />;
  } else if (stage.stageKey === 'acceptance') {
    // The customer's yes (§73): charges, milestones, post-production stages — sent to Management.
    body = <AcceptanceStep order={order} onChanged={onReloadAll} />;
  } else if (isUnbuilt(stage.stageKey)) {
    body = <UnbuiltStagePanel stage={stage} />;
  } else {
    // A stage key this build has never heard of. The API already says so in
    // words; repeating its sentence beats inventing a screen for it.
    body = (
      <SectionCard title={stage.label}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <StageStateBadge stage={stage} />
            <Mono muted>{stage.stageKey}</Mono>
          </Box>
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{stage.detail}</Typography>
          <BlockerList blockers={stage.blockers} />
        </Box>
      </SectionCard>
    );
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      {/* In-app help for THIS stage (its topic has tab: <stageKey>), just above the stage's own card. */}
      <HelpButton tab={stage.stageKey} label={`Help for ${stage.label}`} text={`How ${stage.label} works`}
        sx={{ justifySelf: 'end', mb: -1.5 }} />
      {/* The notice explains; the body below it still does everything it would for a line that needs it. */}
      {line && !wide && !stage.applies && <NotForThisLine view={view} stage={stage} line={line} onPickLine={onPickLine} />}
      {(line || wide) && <WaitingOn stage={stage} label={view.stages.find((x) => x.stageKey === tabFor(stage.waitingOn?.stageKey ?? '', view.stages))?.label ?? null} order={order}
        onGo={onGoStage} onOrderSaved={onOrderSaved} onReloadAll={onReloadAll} />}
      <Suspense fallback={<PanelLoading />}>{body}</Suspense>
    </Box>
  );
}
