import { useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import type { CfApiError } from '../../api/client';
import { lineLock } from '../../api/lock';
import type { OrderProcessLine, OrderProcessView, OrderProduction, OrderStage, ReleaseSummary, SalesOrder, SalesOrderLine } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { LOCKED_STATUSES, ORDER_STATUS_LABEL, REVISED_NOT_RELEASED } from '../../lib/orders';
import {
  CONFIRM_STILL_ON_THE_PAGE, CONFIRM_WHAT_DOES_NOT, CONFIRM_WHAT_HAPPENS, DECIDED_BY_HELP, UNBUILT_STAGE,
  isUnbuilt, nextLineFor, notForThisLine, tabFor,
} from '../../lib/process';
import { EmptyState, ErrorNotice, Mono, SectionCard, StatusBadge } from '../ui';
import { BomPanel } from '../Bom/BomPanel';
import { NestingPanel } from '../Nesting/NestingPanel';
import { BlanksPanel } from '../Nesting/BlanksPanel';
import { ReleaseView } from '../ReleaseView';
import { ReleaseDialog } from '../TrackerDialogs';
import { PieceCodesCard } from '../Production/PieceCodesCard';
import { ProductionTabs } from '../Production/ProductionTabs';
import { LockPanel } from '../Lock/LockPanel';
import { OrderLinesPanel } from '../OrderLinesPanel';
import { useToast } from '../toastContext';
import { BlockerList, StageStateBadge } from './stageUi';
import { ConfirmOrderDialog } from './ConfirmOrderDialog';

/**
 * What each stage tab shows, above its Back / Next foot.
 *
 * Three rules hold this together:
 *   1. The screens that already exist are REUSED, not re-drawn — the Lines
 *      panel, the BOM panel and the release view are the same components an
 *      order without a process shows on its plain tabs, so the two can never
 *      offer different things.
 *   2. A stage the app cannot work yet says so in plain words and points at
 *      where that work is done today. It does not pretend to be a screen.
 *   3. A stage that does not apply to the chosen line still shows its body.
 *      The notice explains; it never takes anything away.
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
  const confirmIt = w.action === 'confirm' && !w.stageKey;
  return (
    <Note tone="warning">
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}><strong>{w.message}</strong></Box>
        {confirmIt ? (
          <>
            <Button size="small" variant="outlined" color="inherit" disabled={!isPermitted('cf_erp_orders_manage') || !order.allowedTransitions.includes('confirmed')}
              onClick={() => setAsking(true)}>Confirm the order</Button>
            <ConfirmOrderDialog open={asking} order={order} onClose={() => setAsking(false)}
              onConfirmed={(saved) => { onOrderSaved(saved); invalidateNavCounts(); toast.success(`${saved.code} is now confirmed.`); onReloadAll(); }} />
          </>
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
      <Button key="buy" size="small" variant="outlined" endIcon={<LaunchRounded />} component={Link} to={to('buy-list')}>Open the buy list</Button>,
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

/** The commitment, laid out before the button: what it does, what it does not, and what is holding it up. */
function ConfirmPanel({ view, order }: { view: OrderProcessView; order: SalesOrder }) {
  const blockers = view.blockers ?? [];
  const settled = ['confirmed', 'closed'].includes(view.order.status);
  const stopped = ['lost', 'cancelled', 'revised'].includes(view.order.status);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <SectionCard title="Confirming this order" subtitle={`${view.order.code} is ${ORDER_STATUS_LABEL[view.order.status].toLowerCase()}.`}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>What happens</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13.5, color: 'var(--c-text)' }}>
              {CONFIRM_WHAT_HAPPENS.map((t) => <li key={t}>{t}</li>)}
            </Box>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>What does not</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13.5, color: 'var(--c-text-2)' }}>
              {CONFIRM_WHAT_DOES_NOT.map((t) => <li key={t}>{t}</li>)}
            </Box>
          </Box>
        </Box>
      </SectionCard>

      <SectionCard title="Every stage of this order" subtitle="Rolled up across all its lines. A stage is done only when every line it applies to is done.">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>
          {view.stages.map((s) => (
            <Box key={s.stageKey} sx={{
              display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(120px, 1fr) auto' }, alignItems: 'center',
              columnGap: 1.5, rowGap: 0.25, py: 0.75, borderBottom: '1px solid var(--c-divider)', minWidth: 0,
            }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontSize: 13.5, fontWeight: 500, overflowWrap: 'anywhere' }}>{s.label}</Box>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{s.detail}</Typography>
              </Box>
              <Box sx={{ justifySelf: { xs: 'start', sm: 'end' } }}><StageStateBadge stage={s} /></Box>
            </Box>
          ))}
        </Box>
      </SectionCard>

      <SectionCard title={blockers.length ? 'What is holding it up' : 'Nothing is holding it up'}
        subtitle={blockers.length ? 'Each one names the line it belongs to. None of them stops you working anywhere else.' : undefined}>
        {blockers.length
          ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25 }}>
              <BlockerList blockers={blockers} />
              {order.allowedTransitions.includes('confirmed') && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{CONFIRM_STILL_ON_THE_PAGE}</Typography>
              )}
            </Box>
          )
          : (
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              {settled ? `${view.order.code} is already ${ORDER_STATUS_LABEL[view.order.status].toLowerCase()}.`
                : stopped ? `${view.order.code} is ${ORDER_STATUS_LABEL[view.order.status].toLowerCase()} — there is nothing left to confirm.`
                  : view.canConfirm ? 'Every stage before confirmation is settled.'
                    : 'Nothing is outstanding, but this order cannot be confirmed from the stage it is in.'}
            </Typography>
          )}
      </SectionCard>
    </Box>
  );
}

/**
 * A line built from a template is FROZEN before it is released: lock writes
 * every piece's code, and release takes them from there. Until then the panel
 * says so and points at the Freeze design stage, rather than offering a Release button
 * that can only come back with a refusal.
 */
function LockFirst({ lineNo, hasLockStage, onGoLock }: { lineNo: number; hasLockStage: boolean; onGoLock: () => void }) {
  return (
    <Note tone="warning">
      <Box><strong>Freeze the design first.</strong> Line {lineNo} is not frozen yet. Freezing comes after the values and the cut pieces: it gives every piece its code, and release takes the codes from there.</Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {hasLockStage
          ? <Button size="small" variant="outlined" color="inherit" startIcon={<LockRounded />} onClick={onGoLock}>Go to Freeze design</Button>
          : <Box>This order&rsquo;s process has no Freeze design stage yet — add it under Setup › Processes.</Box>}
      </Box>
    </Note>
  );
}

/** The line's release, exactly as the order-wide Production view shows it. */
function ProductionPanel({ stage, line, order, production, productionError, hasLockStage, onReleaseChanged, onReloadAll, onGoStage }: {
  stage: OrderStage;
  line: OrderProcessLine | null;
  order: SalesOrder;
  production: OrderProduction | null;
  productionError: CfApiError | null;
  hasLockStage: boolean;
  onReleaseChanged: (r: ReleaseSummary) => void;
  onReloadAll: () => void;
  onGoStage: (stageKey: string) => void;
}) {
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const canTrack = isPermitted('cf_erp_production_view');
  const canProduce = isPermitted('cf_erp_production_manage');
  const canStock = isPermitted('cf_erp_inventory_manage');
  const orderLine = (order.lines ?? []).find((l) => l.id === line?.lineId) ?? null;
  const release = production?.releases.find((r) => r.line.id === line?.lineId) ?? null;
  // A line sold as it is (a catalog item) has nothing to lock; one built from a template does.
  // An order that has stopped changing (closed, revised…) locks nothing more, so it is not asked to.
  const mustLock = orderLine?.lineType === 'custom' && !lineLock(orderLine) && !release && !LOCKED_STATUSES.includes(order.status);

  if (!canTrack) {
    return (
      <SectionCard title="Production">
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
          You can see this order, but your role cannot see production. Ask an administrator for the production permission.
        </Typography>
      </SectionCard>
    );
  }

  const tracker = (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <ErrorNotice error={productionError} onRetry={onReloadAll} sx={{ mb: 0 }} />
      {release
        ? <ReleaseView release={release} canProduce={canProduce} canStock={canStock} onChange={onReleaseChanged} onTakenBack={onReloadAll} onShipped={onReloadAll} />
        : (
          <SectionCard title={line ? `Line ${line.lineNo} is not released yet` : 'Nothing to release yet'}
            subtitle={order.status === 'confirmed'
              ? 'A line is released whole: its frozen pieces become the tracker, with the codes freezing gave them.'
              : order.status === 'revised' ? REVISED_NOT_RELEASED
                : `Lines are released once the order is confirmed — it is ${ORDER_STATUS_LABEL[order.status].toLowerCase()} now.`}
            actions={canProduce && order.status === 'confirmed' && orderLine && !orderLine.release && !mustLock
              ? <Button variant="contained" startIcon={<RocketLaunchRounded />} onClick={() => setReleasing(orderLine)}>Release this line</Button>
              : undefined}>
            {line
              ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.25 }}>
                  {mustLock && <LockFirst lineNo={line.lineNo} hasLockStage={hasLockStage} onGoLock={() => onGoStage('lock')} />}
                  <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{stage.detail}.</Typography>
                </Box>
              )
              : <EmptyState icon={<PrecisionManufacturingRounded />} title="No lines yet" hint="Add a line before anything can be made." />}
          </SectionCard>
        )}
      {/* Until the line is released, the codes release will give its pieces — read-only, loaded on request. */}
      {!release && line?.item && <PieceCodesCard key={line.lineId} lineId={line.lineId} lineNo={line.lineNo} />}
      <ReleaseDialog
        line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? releasing.item?.name ?? 'This line'} ×${releasing.quantity}` } : null}
        onClose={() => setReleasing(null)}
        onReleased={() => { invalidateNavCounts(); toast.success(`Line ${releasing?.lineNo} released to production.`); onReloadAll(); }} />
    </Box>
  );
  // Times and Contractors sit beside the tracker; the tracker itself is untouched.
  if (!line) return tracker;
  return <ProductionTabs orderId={order.id} lineId={line.lineId} lines={[{ id: line.lineId, lineNo: line.lineNo, label: '' }]} released={!!release} tracker={tracker} />;
}

export function StageBody({
  view, stage, line, order, production, productionError,
  onPickLine, onOrderSaved, onReleaseChanged, onReloadAll, onGoStage,
}: {
  view: OrderProcessView;
  /** The stage being worked, as it stands for the chosen line. */
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
  const toast = useToast();
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const canProduce = isPermitted('cf_erp_production_manage');

  // The order page always has a Structure tab while it has a line — the stage
  // when the process has one, otherwise beside Stock and Details — so the way
  // into a line's structure never goes dead.
  const openStructure = (l: SalesOrderLine) => {
    onPickLine(l.id);
    onGoStage('structure');
  };

  let body: ReactNode;
  if (stage.stageKey === 'lines') {
    body = (
      <>
        <OrderLinesPanel order={order} onSaved={onOrderSaved} onOpenStructure={openStructure}
          onRowClick={(l) => onPickLine(l.id)}
          onRelease={canProduce ? setReleasing : undefined}
          subtitle="Each line sells an item. Click a line to work the rest of the process on it." />
        <ReleaseDialog
          line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? releasing.item?.name ?? 'This line'} ×${releasing.quantity}` } : null}
          onClose={() => setReleasing(null)}
          onReleased={() => { invalidateNavCounts(); toast.success(`Line ${releasing?.lineNo} released to production.`); onReloadAll(); }} />
      </>
    );
  } else if (stage.stageKey === 'structure' || stage.stageKey === 'values') {
    // ONE tab for the structure and its values (user, 2026-10-02): every row shows its own values beside it,
    // required ones still empty in amber. Values is a check on this tab, not a tab — it reaches here only
    // for a process that has a Values stage but no Structure stage to fold it into.
    body = line
      ? <BomPanel key={line.lineId} source={{ kind: 'orderLine', lineId: line.lineId }} onChanged={onReloadAll} onGoCutPieces={() => onGoStage('cut_pieces')} />
      : (
        <SectionCard title="Structure">
          <EmptyState icon={<AccountTreeRounded />} title="No lines yet" hint="A structure hangs under a line, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('lines')}>Go to the lines</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'cut_pieces') {
    // Cut pieces belong to ONE line, like the layout that follows them.
    body = line
      ? <BlanksPanel key={line.lineId} lineId={line.lineId} canManage={isPermitted('cf_erp_orders_manage')} onChanged={onReloadAll} onGoValues={() => onGoStage('values')} />
      : (
        <SectionCard title="Cut pieces">
          <EmptyState icon={<GridViewRounded />} title="No lines yet" hint="Parts are pooled into cut pieces for a line, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('lines')}>Go to the lines</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'lock') {
    // Lock belongs to ONE line: it rolls that line's structure out into pieces.
    body = line
      ? <LockPanel key={line.lineId} lineId={line.lineId} lineNo={line.lineNo} quantity={line.quantity} canManage={isPermitted('cf_erp_orders_manage')}
          stages={view.stages} onGoStage={onGoStage} onChanged={onReloadAll} />
      : (
        <SectionCard title="Freeze design">
          <EmptyState icon={<LockRounded />} title="No lines yet" hint="A line is frozen once its structure, values and cut pieces are settled, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('lines')}>Go to the lines</Button>} />
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
            hint={`Nesting lays out the frozen pieces, and line ${line.lineNo} is not frozen yet.`}
            action={view.stages.some((x) => x.stageKey === 'lock') ? <Button variant="contained" onClick={() => onGoStage('lock')}>Go to Freeze design</Button> : undefined} />
        </SectionCard>
      )
      : line
      ? <NestingPanel key={line.lineId} orderId={order.id} lineId={line.lineId} canManage={isPermitted('cf_erp_orders_manage')} onChanged={onReloadAll} />
      : (
        <SectionCard title="Nesting">
          <EmptyState icon={<GridViewRounded />} title="No lines yet" hint="Rectangles are cut for a line, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('lines')}>Go to the lines</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'production') {
    body = <ProductionPanel stage={stage} line={line} order={order} production={production} productionError={productionError}
      hasLockStage={view.stages.some((s) => s.stageKey === 'lock')} onReleaseChanged={onReleaseChanged} onReloadAll={onReloadAll} onGoStage={onGoStage} />;
  } else if (stage.stageKey === 'confirm') {
    body = <ConfirmPanel view={view} order={order} />;
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
      {/* The notice explains; the body below it still does everything it would for a line that needs it. */}
      {line && !stage.applies && <NotForThisLine view={view} stage={stage} line={line} onPickLine={onPickLine} />}
      {line?.item && line.item.status !== 'active' && stage.stageKey === 'lines' && (
        <Note tone="warning">
          <Box>Line {line.lineNo} sells <Mono>{line.item.code ?? line.item.name}</Mono>, which is <StatusBadge status={line.item.status} />.</Box>
        </Note>
      )}
      {line && <WaitingOn stage={stage} label={view.stages.find((x) => x.stageKey === tabFor(stage.waitingOn?.stageKey ?? '', view.stages))?.label ?? null} order={order}
        onGo={onGoStage} onOrderSaved={onOrderSaved} onReloadAll={onReloadAll} />}
      {body}
    </Box>
  );
}
