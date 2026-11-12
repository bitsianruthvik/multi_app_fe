import { useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, Tooltip } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import LaunchRounded from '@mui/icons-material/LaunchRounded';
import { CfApiError } from '../../api/client';
import {
  backToTimes, createProductionOrders, getOrderProductionOrders, sendToPlanning, setTimeOverride, type ProductionOrder,
} from '../../api/productionOrders';
import type { SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { PO_STATE, createLabel, productionOrderPath, readOverride } from '../../lib/productionOrders';
import { Badge, EmptyState, ErrorNotice, InfoTip, Mono, SectionCard, SkeletonRows } from '../ui';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { TimesPanel } from '../Production/TimesPanel';
import { linesToCheck } from '../../lib/releaseFlow';
import { ReleaseFlowGaps } from './ReleaseFlowGaps';
import { useToast } from '../toastContext';
import { TimingSheetButtons } from '../TimingSheetButtons';

const ROW_COLS = { xs: '1fr auto', md: '120px minmax(200px, 2fr) 130px auto' };
const titleWithTip = (title: string, tip: string) => (
  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>{title}<InfoTip text={tip} label={`About ${title}`} /></Box>
);

/**
 * The sales order's PRODUCTION SETUP step (user, 2026-11-12: "This is only to set the production related stuff like timing
 * and all … available as soon as the execution order is set. It has nothing to do with nesting … created in execution plan
 * and the values of time get set in the production tab … Once this is done production order should go into planning").
 *
 * The production orders the execution plan made (Setting times), every operation's setup and time per piece (prefilled by
 * the formulas), and "Send to planning". Releasing, tracking and dispatching live in Planning and Production; the 3D
 * progress view is on the Tracker. "Override all times to N seconds" (blank = off) is for testing. Full screen.
 */
export function ProductionStep({ order, onChanged }: { order: SalesOrder; onChanged?: () => void }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canProduce = isPermitted('cf_erp_production_manage');
  const fs = useFullScreen('production-step');
  const load = useLoad(() => getOrderProductionOrders(order.id), [order.id]);
  const d = load.data;
  const lines = order.lines ?? [];
  const [lineId, setLineId] = useState<number | null>(null);
  const shownLine = lines.find((l) => l.id === lineId) ?? lines[0] ?? null;
  const [overrideText, setOverrideText] = useState('');
  const [timesKey, setTimesKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { setOverrideText(d?.order.timeOverrideSeconds == null ? '' : String(d.order.timeOverrideSeconds)); }, [d?.order.timeOverrideSeconds]);

  const run = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key); setError(null);
    try {
      const msg = await fn();
      if (msg) toast.success(msg);
      load.reload(); invalidateNavCounts(); onChanged?.();
    } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); } finally { setBusy(null); }
  };
  const saveOverride = () => {
    const v = readOverride(overrideText);
    const now = d?.order.timeOverrideSeconds ?? null;
    if (v === undefined) { setError(new CfApiError(422, 'The override is a number of seconds above zero — leave it blank to use the formulas.')); return; }
    if (v === now) return;
    void run('override', async () => {
      const r = await setTimeOverride(order.id, v);
      setTimesKey((k) => k + 1);
      return v == null ? `Times are back to the formulas (${r.retimed} steps re-timed).` : `Every time on ${order.code} is now ${v} s (${r.retimed} steps re-timed).`;
    });
  };

  const list = useMemo(() => d?.productionOrders ?? [], [d]);
  const toPlan = list.filter((po) => po.status === 'yet_to_plan').map((po) => po.id);
  // The rows release would refuse for having no flow — said here, while the times are set (lib/releaseFlow).
  const flowLines = d ? linesToCheck({
    lineIds: lines.map((l) => l.id),
    pendingLineIds: list.filter((po) => po.status === 'yet_to_plan' || po.status === 'planning').flatMap((po) => po.lineIds),
    releasedLineIds: [...d.legacy.map((l) => l.lineId), ...list.filter((po) => po.status === 'planned' || po.status === 'closed').flatMap((po) => po.lineIds), ...lines.filter((l) => l.release).map((l) => l.id)],
    toCreate: d.toCreate.count > 0,
  }) : [];
  const send = (ids: number[]) => run(`p${ids.join(',')}`, async () => {
    const r = await sendToPlanning(ids);
    return `${r.sent.length === 1 ? r.sent[0] : `${r.sent.length} production orders`} sent to planning.`;
  });

  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }} data-testid="production-step">
        <SectionCard
          title={titleWithTip('Production orders', 'Made from the execution plan as soon as it is saved. Set their times below, then Send to planning. Planning releases them to the floor once the order is confirmed, the design frozen and the line nested.')}
          actions={canProduce && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {d && d.toCreate.count > 0 && (
                <Tooltip title={d.toCreate.why ?? d.toCreate.labels.slice(0, 6).join(' · ')}>
                  <span>
                    <Button variant="outlined" startIcon={<PlaylistAddRounded />} disabled={!!d.toCreate.why || busy != null} data-testid="po-create"
                      onClick={() => run('create', async () => { const r = await createProductionOrders(order.id); return `${r.created} production order${r.created === 1 ? '' : 's'} created.`; })}>
                      {createLabel(d.toCreate.count)}
                    </Button>
                  </span>
                </Tooltip>
              )}
              {toPlan.length > 0 && (
                <Button variant="contained" startIcon={<EventAvailableRounded />} disabled={busy != null} data-testid="po-send-all"
                  onClick={() => void send(toPlan)}>
                  {toPlan.length === 1 ? 'Send to planning' : `Send all to planning (${toPlan.length})`}
                </Button>
              )}
              <Button startIcon={<LaunchRounded />} component={Link} to={appPath(company, `production-orders?orderId=${order.id}`)}>Open in Planning</Button>
            </Box>
          )}>
          <ErrorNotice error={error ?? load.error} onRetry={error ? undefined : load.reload} />
          {flowLines.length > 0 && <ReleaseFlowGaps lineIds={flowLines} canGive={isPermitted('cf_erp_orders_manage')} onChanged={onChanged} />}
          {!d ? <SkeletonRows rows={3} height={40} /> : list.length === 0 ? (
            <EmptyState title="No production orders yet" hint={d.toCreate.why ?? (d.toCreate.count ? `${createLabel(d.toCreate.count)}: ${d.toCreate.labels.slice(0, 3).join(', ')}${d.toCreate.count > 3 ? '…' : ''}` : 'The execution plan asks for none.')} />
          ) : (
            <Box role="table" aria-label="Production orders" data-testid="po-rows">
              {list.map((po) => (
                <PoRow key={po.id} po={po} busy={busy} canProduce={canProduce}
                  onOpen={() => navigate(appPath(company, productionOrderPath(po.id)))}
                  onSend={() => void send([po.id])}
                  onBack={() => void run(`b${po.id}`, async () => { await backToTimes(po.id); return `${po.code} is back to setting its times.`; })} />
              ))}
            </Box>
          )}
          {d && d.legacy.length > 0 && (
            <Box sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1.5 }} data-testid="po-legacy">
              Released before production orders:{' '}
              {d.legacy.map((l, i) => (
                <Box component="span" key={l.releaseId}>{i ? ', ' : ''}<Box component={Link} to={appPath(company, `tracker?order=l${l.lineId}`)} sx={{ color: 'inherit' }}>line {l.lineNo}</Box></Box>
              ))}
            </Box>
          )}
        </SectionCard>

        <SectionCard
          title={titleWithTip('Times', 'Setup and operation time, both per piece — filled in by the formulas; type over a box to change it. The Excel buttons give and take this order\'s times per operation. "Override all times" is for testing.')}
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField size="small" label="Override all times to (s)" value={overrideText} placeholder="off"
                onChange={(e) => setOverrideText(e.target.value)} onBlur={saveOverride}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOverride(); } }}
                disabled={!canProduce || busy === 'override'} sx={{ width: 190 }} inputProps={{ inputMode: 'decimal', 'data-testid': 'time-override' }} />
              <TimingSheetButtons source={{ kind: 'order', orderId: order.id, orderCode: order.code }} canUpload={canProduce}
                onApplied={() => { setTimesKey((k) => k + 1); load.reload(); onChanged?.(); }} />
              {lines.length > 1 && (
                <TextField select size="small" label="Line" value={shownLine?.id ?? ''} onChange={(e) => setLineId(Number(e.target.value))} sx={{ minWidth: 200 }}>
                  {lines.map((l) => <MenuItem key={l.id} value={l.id}>{l.lineNo} · {l.item?.name ?? l.item?.code ?? 'Line'}</MenuItem>)}
                </TextField>
              )}
              <FullScreenToggle on={fs.on} onToggle={fs.toggle} />
            </Box>
          )}>
          {shownLine
            ? <TimesPanel key={`${shownLine.id}:${timesKey}`} orderId={order.id} lineId={shownLine.id} />
            : <EmptyState title="No lines yet" hint="Add a line before anything can be timed." />}
        </SectionCard>
      </Box>
    </FullScreenFrame>
  );
}

function PoRow({ po, busy, canProduce, onOpen, onSend, onBack }: {
  po: ProductionOrder; busy: string | null; canProduce: boolean; onOpen: () => void; onSend: () => void; onBack: () => void;
}) {
  const s = PO_STATE[po.state];
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <Box role="row" tabIndex={0} data-testid="po-row" data-state={po.state} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(); } }}
      sx={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: 1, alignItems: 'center', px: 1, py: 0.75, borderTop: '1px solid var(--c-divider)', fontSize: 13, cursor: 'pointer', '&:hover': { background: 'var(--c-surface-2)' } }}>
      <Mono sx={{ fontWeight: 600 }}>{po.code}</Mono>
      <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', gridColumn: { xs: '1 / -1', md: 'auto' }, order: { xs: 2, md: 0 } }} title={po.label}>{po.label}</Box>
      <Box><Badge family={s.family} label={s.label} noIcon /></Box>
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {canProduce && po.actions.toPlanning && <Button size="small" variant="contained" startIcon={<EventAvailableRounded />} disabled={busy != null} onClick={stop(onSend)} data-testid="po-to-planning">Send to planning</Button>}
        {canProduce && po.actions.backToTimes && <Button size="small" color="inherit" startIcon={<UndoRounded />} disabled={busy != null} onClick={stop(onBack)} data-testid="po-back-to-times">Back to times</Button>}
      </Box>
    </Box>
  );
}
