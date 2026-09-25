import { useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import type { CfApiError } from '../../api/client';
import type { OrderProcessLine, OrderProcessView, OrderProduction, OrderStage, Release, SalesOrder, SalesOrderLine } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { ORDER_STATUS_LABEL } from '../../lib/orders';
import {
  CONFIRM_STILL_ON_THE_PAGE, CONFIRM_WHAT_DOES_NOT, CONFIRM_WHAT_HAPPENS, DECIDED_BY_HELP, UNBUILT_STAGE,
  isUnbuilt, nextLineFor, notForThisLine,
} from '../../lib/process';
import { EmptyState, ErrorNotice, Mono, SectionCard, StatusBadge } from '../ui';
import { BomPanel } from '../Bom/BomPanel';
import { NestingPanel } from '../Nesting/NestingPanel';
import { ReleaseView } from '../ReleaseView';
import { ReleaseDialog } from '../TrackerDialogs';
import { OrderLinesPanel } from '../OrderLinesPanel';
import { useToast } from '../toastContext';
import { BlockerList, StageStateBadge } from './stageUi';

/**
 * What each stage shows in the pop-up's body.
 *
 * Three rules hold this together:
 *   1. The screens that already exist are REUSED, not re-drawn — the Lines
 *      panel, the BOM panel and the release view are the same components the
 *      order's tabs render, so the two can never offer different things.
 *   2. A stage the app cannot work yet says so in plain words and points at
 *      where that work is done today. It does not pretend to be a screen.
 *   3. A stage that does not apply to the chosen line still shows its body.
 *      The notice explains; it never removes anything the tabs would allow.
 */

/** A tinted note — the pop-up's way of explaining without taking anything away. */
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
function UnbuiltStagePanel({ view, stage, line, order, onGoStage }: {
  view: OrderProcessView; stage: OrderStage; line: OrderProcessLine | null; order: SalesOrder; onGoStage: (key: string) => void;
}) {
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const words = UNBUILT_STAGE[stage.stageKey];
  const to = (path: string) => appPath(company, path);
  const orderLine: SalesOrderLine | undefined = (order.lines ?? []).find((l) => l.id === line?.lineId);
  const hasStructure = view.stages.some((s) => s.stageKey === 'structure');

  const links: ReactNode[] = [];
  if (stage.stageKey === 'values' && orderLine?.item) {
    links.push(
      <Button key="item" size="small" variant="outlined" endIcon={<LaunchRounded />} component={Link}
        to={to(`${recordPath(orderLine.item.kind, orderLine.item.id)}?tab=specs`)}>
        Open {orderLine.item.code ?? orderLine.item.name} · Specifications
      </Button>,
    );
    if (hasStructure) links.push(<Button key="structure" size="small" startIcon={<AccountTreeRounded />} onClick={() => onGoStage('structure')}>Go to the structure</Button>);
  }
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
  const stopped = ['lost', 'cancelled'].includes(view.order.status);
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

/** The line's release, exactly as the order's Production tab shows it. */
function ProductionPanel({ stage, line, order, production, productionError, onReleaseChanged, onReloadAll }: {
  stage: OrderStage;
  line: OrderProcessLine | null;
  order: SalesOrder;
  production: OrderProduction | null;
  productionError: CfApiError | null;
  onReleaseChanged: (r: Release) => void;
  onReloadAll: () => void;
}) {
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const canTrack = isPermitted('cf_erp_production_view');
  const canProduce = isPermitted('cf_erp_production_manage');
  const canStock = isPermitted('cf_erp_inventory_manage');
  const orderLine = (order.lines ?? []).find((l) => l.id === line?.lineId) ?? null;
  const release = production?.releases.find((r) => r.line.id === line?.lineId) ?? null;

  if (!canTrack) {
    return (
      <SectionCard title="Production">
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
          You can see this order, but your role cannot see production. Ask an administrator for the production permission.
        </Typography>
      </SectionCard>
    );
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <ErrorNotice error={productionError} onRetry={onReloadAll} sx={{ mb: 0 }} />
      {release
        ? <ReleaseView release={release} canProduce={canProduce} canStock={canStock} onChange={onReleaseChanged} onTakenBack={onReloadAll} onShipped={onReloadAll} />
        : (
          <SectionCard title={line ? `Line ${line.lineNo} is not released yet` : 'Nothing to release yet'}
            subtitle={order.status === 'confirmed'
              ? 'A line is released whole: its structure becomes the tracker, and it is frozen from then on.'
              : `Lines are released once the order is confirmed — it is ${ORDER_STATUS_LABEL[order.status].toLowerCase()} now.`}
            actions={canProduce && order.status === 'confirmed' && orderLine && !orderLine.release
              ? <Button variant="contained" startIcon={<RocketLaunchRounded />} onClick={() => setReleasing(orderLine)}>Release this line</Button>
              : undefined}>
            {line
              ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{stage.detail}.</Typography>
              : <EmptyState icon={<PrecisionManufacturingRounded />} title="No lines yet" hint="Add a line before anything can be made." />}
          </SectionCard>
        )}
      <ReleaseDialog
        line={releasing ? { id: releasing.id, lineNo: releasing.lineNo, label: `${releasing.item?.code ?? releasing.item?.name ?? 'This line'} ×${releasing.quantity}` } : null}
        onClose={() => setReleasing(null)}
        onReleased={() => { invalidateNavCounts(); toast.success(`Line ${releasing?.lineNo} released to production.`); onReloadAll(); }} />
    </Box>
  );
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
  onReleaseChanged: (r: Release) => void;
  /** Reloads the order, its production and the process together. */
  onReloadAll: () => void;
  onGoStage: (stageKey: string) => void;
}) {
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const [releasing, setReleasing] = useState<SalesOrderLine | null>(null);
  const hasStructure = view.stages.some((s) => s.stageKey === 'structure');
  const canProduce = isPermitted('cf_erp_production_manage');

  const openStructure = (l: SalesOrderLine) => {
    onPickLine(l.id);
    if (hasStructure) onGoStage('structure');
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
  } else if (stage.stageKey === 'structure') {
    body = line
      ? <BomPanel key={line.lineId} source={{ kind: 'orderLine', lineId: line.lineId }} onChanged={onReloadAll} />
      : (
        <SectionCard title="Structure">
          <EmptyState icon={<AccountTreeRounded />} title="No lines yet" hint="A structure hangs under a line, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('lines')}>Go to the lines</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'nesting') {
    // The layout belongs to ONE line — a cut plate is a temporary item of that
    // line — so without a line there is nothing to nest, and the panel is given
    // the line it is looking at rather than working one out for itself.
    body = line
      ? <NestingPanel key={line.lineId} orderId={order.id} lineId={line.lineId} canManage={isPermitted('cf_erp_orders_manage')} onChanged={onReloadAll} />
      : (
        <SectionCard title="Nesting">
          <EmptyState icon={<GridViewRounded />} title="No lines yet" hint="Rectangles are cut for a line, so add one first."
            action={<Button variant="contained" onClick={() => onGoStage('lines')}>Go to the lines</Button>} />
        </SectionCard>
      );
  } else if (stage.stageKey === 'production') {
    body = <ProductionPanel stage={stage} line={line} order={order} production={production} productionError={productionError}
      onReleaseChanged={onReleaseChanged} onReloadAll={onReloadAll} />;
  } else if (stage.stageKey === 'confirm') {
    body = <ConfirmPanel view={view} order={order} />;
  } else if (isUnbuilt(stage.stageKey)) {
    body = <UnbuiltStagePanel view={view} stage={stage} line={line} order={order} onGoStage={onGoStage} />;
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
      {/* The notice explains; the body below it still does everything the tab would. */}
      {line && !stage.applies && <NotForThisLine view={view} stage={stage} line={line} onPickLine={onPickLine} />}
      {line?.item && line.item.status !== 'active' && stage.stageKey === 'lines' && (
        <Note tone="warning">
          <Box>Line {line.lineNo} sells <Mono>{line.item.code ?? line.item.name}</Mono>, which is <StatusBadge status={line.item.status} />.</Box>
        </Note>
      )}
      {body}
    </Box>
  );
}
