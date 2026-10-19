import { useEffect, useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import PlaylistAddRounded from '@mui/icons-material/PlaylistAddRounded';
import RocketLaunchRounded from '@mui/icons-material/RocketLaunchRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import { CfApiError } from '../../api/client';
import {
  createProductionOrders, dispatchProductionOrder, getOrderProductionOrders, releaseProductionOrders, setTimeOverride, takeBackProductionOrder,
  type ProductionOrder,
} from '../../api/productionOrders';
import type { SalesOrder } from '../../api/types';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { useFullScreen } from '../../hooks/useFullScreen';
import { invalidateNavCounts } from '../../hooks/useNavCounts';
import { appPath } from '../../navMeta';
import { PO_STATE, createLabel, productionOrderPath, progressText, readOverride, releasableIds, releaseToast } from '../../lib/productionOrders';
import { Badge, EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows } from '../ui';
import { FlashOnChange, celebrate } from '../../motion';
import { FullScreenFrame, FullScreenToggle } from '../FullScreen';
import { TimesPanel } from '../Production/TimesPanel';
import { useToast } from '../toastContext';

const ROW_COLS = { xs: '1fr auto', md: '120px minmax(200px, 2fr) 120px 150px auto' };

/**
 * The sales order's PRODUCTION step (§76, user 2026-10-18): TIMES only — every operation's setup and operation time
 * per piece, pre-filled by the formulas, one chart with a toggle — then "Create production orders" at the level the
 * execution plan saved, and the production orders themselves (Yet to plan → Planned → In production → Dispatch →
 * Closed), each released, taken back or dispatched here. The tracker of a production order is its own page.
 * "Override all times to N seconds" (blank = off) is for testing: the formulas are untouched. Full screen.
 */
export function ProductionStep({ order, onChanged }: { order: SalesOrder; onChanged?: () => void }) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canProduce = isPermitted('cf_erp_production_manage');
  const canShip = isPermitted('cf_erp_inventory_manage');
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
  const toRelease = releasableIds(list);

  return (
    <FullScreenFrame on={fs.on} onExit={() => fs.set(false)}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }} data-testid="production-step">
        <SectionCard title="Times" subtitle="Setup and operation time, both per piece — filled in by the formulas; type over a box to change it."
          actions={(
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Tooltip title="For testing: every operation's setup and time per piece on this order become this many seconds. Blank = the formulas.">
                <TextField size="small" label="Override all times to (s)" value={overrideText} placeholder="off"
                  onChange={(e) => setOverrideText(e.target.value)} onBlur={saveOverride}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveOverride(); } }}
                  disabled={!canProduce || busy === 'override'} sx={{ width: 190 }} inputProps={{ inputMode: 'decimal', 'data-testid': 'time-override' }} />
              </Tooltip>
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

        <SectionCard title="Production orders" subtitle="Split by AI from the saved execution plan. Release one to put it on the floor; a finished one is dispatched from here."
          actions={canProduce && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {d && d.toCreate.count > 0 && (
                <Tooltip title={d.toCreate.why ?? d.toCreate.labels.slice(0, 6).join(' · ')}>
                  <span>
                    <Button variant="contained" startIcon={<PlaylistAddRounded />} disabled={!!d.toCreate.why || busy != null} data-testid="po-create"
                      onClick={() => run('create', async () => { const r = await createProductionOrders(order.id); return `${r.created} production order${r.created === 1 ? '' : 's'} created.`; })}>
                      {createLabel(d.toCreate.count)}
                    </Button>
                  </span>
                </Tooltip>
              )}
              {toRelease.length > 1 && (
                <Button variant="outlined" startIcon={<RocketLaunchRounded />} disabled={busy != null} data-testid="po-release-all"
                  onClick={() => run('release-all', async () => { const r = await releaseProductionOrders(toRelease); return releaseToast(r.released, r.fromMr); })}>
                  Release all ({toRelease.length})
                </Button>
              )}
            </Box>
          )}>
          <ErrorNotice error={error ?? load.error} onRetry={error ? undefined : load.reload} />
          {d?.toCreate.why && d.toCreate.count > 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>{d.toCreate.why}</Typography>}
          {!d ? <SkeletonRows rows={3} height={40} /> : list.length === 0 ? (
            <EmptyState title="No production orders yet" hint={d.toCreate.count ? `${createLabel(d.toCreate.count)}: ${d.toCreate.labels.slice(0, 3).join(', ')}${d.toCreate.count > 3 ? '…' : ''}` : 'The execution plan asks for none.'} />
          ) : (
            <Box role="table" aria-label="Production orders" data-testid="po-rows">
              {list.map((po) => (
                <PoRow key={po.id} po={po} busy={busy} canProduce={canProduce} canShip={canShip}
                  onOpen={() => navigate(appPath(company, productionOrderPath(po.id)))}
                  onRelease={() => run(`r${po.id}`, async () => { const r = await releaseProductionOrders([po.id]); return releaseToast(r.released, r.fromMr); })}
                  onTakeBack={() => run(`t${po.id}`, async () => { await takeBackProductionOrder(po.id); return `${po.code} taken back.`; })}
                  onDispatch={(el) => run(`d${po.id}`, async () => { const r = await dispatchProductionOrder(po.id); if (r.closed) celebrate(el); return r.closed ? `${po.code} dispatched and closed.` : `${po.code}: finished units dispatched.`; })} />
              ))}
            </Box>
          )}
          {d && d.legacy.length > 0 && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1.5 }} data-testid="po-legacy">
              Released before production orders:{' '}
              {d.legacy.map((l, i) => (
                <Box component="span" key={l.releaseId}>{i ? ', ' : ''}<Box component={Link} to={appPath(company, `tracker?order=l${l.lineId}`)} sx={{ color: 'inherit' }}>line {l.lineNo}</Box></Box>
              ))}
              {' '}— create the production orders to join them.
            </Typography>
          )}
        </SectionCard>
      </Box>
    </FullScreenFrame>
  );
}

function PoRow({ po, busy, canProduce, canShip, onOpen, onRelease, onTakeBack, onDispatch }: {
  po: ProductionOrder; busy: string | null; canProduce: boolean; canShip: boolean;
  onOpen: () => void; onRelease: () => void; onTakeBack: () => void; onDispatch: (button?: HTMLElement) => void;
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
      <Box sx={{ display: { xs: 'none', md: 'block' }, color: 'var(--c-text-2)' }}><FlashOnChange value={progressText(po.progress)}>{progressText(po.progress)}</FlashOnChange></Box>
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {canProduce && po.actions.release && <Button size="small" variant="contained" startIcon={<RocketLaunchRounded />} disabled={busy != null} onClick={stop(onRelease)} data-testid="po-release">Release</Button>}
        {canProduce && po.actions.takeBack && <Button size="small" color="inherit" startIcon={<UndoRounded />} disabled={busy != null} onClick={stop(onTakeBack)}>Take back</Button>}
        {canShip && po.actions.dispatch && <Button size="small" variant="contained" color="success" startIcon={<LocalShippingRounded />} disabled={busy != null} onClick={(e) => { e.stopPropagation(); onDispatch(e.currentTarget); }} data-testid="po-dispatch">Dispatch</Button>}
      </Box>
    </Box>
  );
}
