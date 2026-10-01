import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import LockRounded from '@mui/icons-material/LockRounded';
import OutputRounded from '@mui/icons-material/OutputRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { cfApi, CfApiError } from '../api/client';
import type { OrderProduction, Release, ReleaseRequirements, ReleaseSummary, Requirement, Shipment } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { ORDER_STATUS_LABEL } from '../lib/orders';
import { Badge, ErrorNotice, Fact, Mono, SectionCard, SkeletonRows } from './ui';
import { DataTable, type DataColumn } from './DataTable';
import { ShipDialog } from './TrackerDialogs';
import { ConfirmDialog } from './ConfirmDialog';
import { ProductionGrid } from './Production/ProductionGrid';
import { useToast } from './toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

// The buttons a step offers live with the drawer that shows them; re-exported for the Tracker page.
export { StepActions } from './Tracker/StepActions';

/** A requirement row; the Tracker's rows also say whose order and line they are for. */
type RequirementRow = Requirement & { order?: Release['order']; line?: Release['line'] };

/**
 * Material rows with their reservations and the actions on them — shared by the order's Production screens and the Tracker.
 * view 'summary': each write answers with the release's figures only (the order page), not the whole release.
 */
export function RequirementsTable({ rows, canStock, onChange, showOrder = false, view }: {
  rows: RequirementRow[];
  canStock: boolean;
  onChange: (r: Release | ReleaseSummary) => void;
  showOrder?: boolean;
  view?: 'summary';
}) {
  const company = useCompanySlug();
  const toast = useToast();
  const [issuing, setIssuing] = useState<Requirement | null>(null);
  const [letGo, setLetGo] = useState<{ req: Requirement; id: number; label: string } | null>(null);
  const v = view ? `?view=${view}` : '';
  const reserve = async (q: Requirement) => {
    try { onChange(await cfApi.post<Release | ReleaseSummary>(`/requirements/${q.id}/reserve${v}`, {})); invalidateNavCounts(); toast.success(`${q.lot ? `${q.lot.lotNo} · ` : ''}${q.item.code ?? q.item.name} reserved.`); } catch (e) { toast.error((e as Error).message); }
  };
  const columns: DataColumn<RequirementRow>[] = [
    {
      key: 'item', header: 'Material', alwaysVisible: true,
      render: (q) => (
        <Box sx={{ py: 0.5 }}>
          <Mono>{q.lot ? <Box component="span" title="Plate lot on the saved nest — one whole plate" sx={{ color: 'var(--c-text-2)' }}>{q.lot.lotNo} · </Box> : null}<Box component={Link} to={appPath(company, `items/${q.item.id}`)} sx={linkSx}>{q.item.code ?? q.item.name}</Box></Mono>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{q.item.name}</Typography>
        </Box>
      ),
    },
    // Production is a per-line stage on the order, so the link names the line when the row knows it.
    ...(showOrder ? [{ key: 'order', header: 'Order', alwaysVisible: true, render: (q: RequirementRow) => (q.order ? <Mono><Box component={Link} to={appPath(company, `orders/${q.order.id}?tab=production${q.line ? `&line=${q.line.id}` : ''}`)} sx={linkSx}>{q.order.code}</Box></Mono> : null) }] : []),
    { key: 'for', header: 'For', alwaysVisible: true, render: (q) => <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal', minWidth: 140 }}>{q.step?.label ?? 'Delivery — bought in'}</Box> },
    { key: 'need', header: 'Needed', numeric: true, alwaysVisible: true, render: (q) => <>{qtyText(q.quantity)} <Mono muted>{q.item.uom}</Mono></> },
    { key: 'issued', header: 'Issued', numeric: true, alwaysVisible: true, render: (q) => <Mono muted={!q.issued}>{qtyText(q.issued)}</Mono> },
    {
      key: 'reserved', header: 'Reserved', alwaysVisible: true,
      render: (q) => (q.reservations.length ? (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {q.reservations.map((v) => (
            <Box key={v.id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, px: 0.75, py: 0.125, borderRadius: 999, background: v.batch && v.batch.status !== 'available' ? 'var(--c-warning-50)' : 'var(--c-surface-2)', border: '1px solid var(--c-border)', fontSize: 12 }}>
              <LockRounded sx={{ fontSize: 12, color: 'var(--c-text-3)' }} aria-hidden />
              <Mono>{qtyText(v.quantity)}</Mono>{v.batch && <Mono muted>· {v.batch.code}</Mono>}
              {canStock && (
                <IconButton size="small" aria-label={`Let go of ${qtyText(v.quantity)} reserved`} onClick={() => setLetGo({ req: q, id: v.id, label: `${qtyText(v.quantity)} ${q.item.uom} of ${q.item.code}${v.batch ? ` batch ${v.batch.code}` : ''}` })} sx={{ p: 0.125, ml: 0.25 }}>
                  <UndoRounded sx={{ fontSize: 13 }} />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      ) : <Mono muted>—</Mono>),
    },
    {
      key: 'state', header: 'Cover', alwaysVisible: true,
      render: (q) => (q.covered ? <Badge family="success" label="Covered" /> : <Badge family="warning" label={`${qtyText(q.short)} short`} title={`${qtyText(q.free)} ${q.item.uom} free now`} />),
    },
  ];
  return (
    <>
      <DataTable bare rows={rows} columns={columns} getRowId={(q) => q.id}
        empty={<Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>No material — nothing here is bought in.</Typography>}
        rowActions={canStock ? (q) => (
          <>
            {!q.covered && q.free > 0 && <Button size="small" variant="outlined" onClick={() => reserve(q)}>Reserve</Button>}
            {q.reserved > 0 && <Tooltip title="Issue the reserved stock to the order"><Button size="small" startIcon={<OutputRounded />} onClick={() => setIssuing(q)}>Issue</Button></Tooltip>}
          </>
        ) : undefined} />
      <ConfirmDialog open={!!issuing} title="Issue the reserved material?" confirmLabel="Issue"
        entityName={issuing ? `${qtyText(issuing.reserved)} ${issuing.item.uom} of ${issuing.item.code}` : undefined}
        body="Posts a stock issue to the order from wherever the reserved stock sits — WIP areas first. The reservation falls by what is issued."
        onClose={() => setIssuing(null)}
        onConfirm={async () => { onChange(await cfApi.post<Release | ReleaseSummary>(`/requirements/${issuing?.id}/issue${v}`)); invalidateNavCounts(); toast.success('Issued.'); }} />
      <ConfirmDialog open={!!letGo} title="Let this reservation go?" confirmLabel="Let it go" entityName={letGo?.label}
        body="The stock becomes free for anything else. The step that needs it waits again until it is reserved."
        onClose={() => setLetGo(null)}
        onConfirm={async () => { onChange(await cfApi.del<Release | ReleaseSummary>(`/reservations/${letGo?.id}${v}`)); invalidateNavCounts(); toast.success('Reservation let go.'); }} />
    </>
  );
}


/**
 * A release's material, read only when somebody opens it: on a big line it is
 * the whole tracker worked out again on the server, so the order page does not
 * pay for it until it is wanted (2026-10-01).
 */
function MaterialSection({ release, canStock, onChange, refreshKey }: {
  release: ReleaseSummary; canStock: boolean; onChange: (r: ReleaseSummary) => void; refreshKey: number;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Requirement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [seenKey, setSeenKey] = useState(refreshKey);
  const [stale, setStale] = useState(false);
  const p = release.progress;
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows((await cfApi.get<ReleaseRequirements>(`/releases/${release.id}/requirements`, { timeoutMs: 120_000 })).requirements); }
    catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); }
    finally { setLoading(false); }
  }, [release.id]);
  // Something else changed the material (reserve all, work recorded): an open table reads again; a closed one forgets.
  if (seenKey !== refreshKey) { setSeenKey(refreshKey); setStale(true); }
  useEffect(() => {
    if (!stale) return;
    setStale(false);
    if (open) void load(); else setRows(null);
  }, [stale, open, load]);
  const toggle = () => { const next = !open; setOpen(next); if (next && !rows) void load(); };
  return (
    <Box sx={{ mt: 2.5 }}>
      <Button size="small" onClick={toggle} startIcon={open ? <ExpandMoreRounded /> : <ChevronRightRounded />} aria-expanded={open}
        sx={{ color: 'var(--c-text)', fontWeight: 600, px: 0.5 }} data-testid="material-toggle">
        Material · {p.materialsCovered} of {p.materials} covered
      </Button>
      {open && (
        <Box sx={{ mt: 1 }}>
          <ErrorNotice error={error} onRetry={() => { void load(); }} />
          {loading && !rows ? <SkeletonRows rows={3} height={40} /> : rows && (
            <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden', opacity: loading ? 0.6 : 1 }}>
              <RequirementsTable rows={rows} canStock={canStock} view="summary" onChange={(next) => { onChange(next as ReleaseSummary); void load(); }} />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * One released line: its figures and what can be done to it (reserve material,
 * ship, take back), then its production as a GRID — the frozen piece codes down
 * the left, its operations across, a cell per piece per operation (user,
 * 2026-10-01; ProductionGrid) — and its material, read when opened.
 *
 * It is handed the release's FIGURES (GET /orders/:id/production —
 * releaseSummaries), never the whole tracker: on the KEPL line that was 11 MB
 * and 17,000 rows drawn on every visit to the order.
 */
export function ReleaseView({ release, canProduce, canStock, onChange, onTakenBack, onShipped }: {
  release: ReleaseSummary;
  canProduce: boolean;
  /** May move stock — reserve, issue, ship (cf_erp_inventory_manage). */
  canStock: boolean;
  onChange: (r: ReleaseSummary) => void;
  onTakenBack: () => void;
  /** A shipment also writes a stock movement and can move the order on, so the whole screen reloads. */
  onShipped?: () => void;
}) {
  const toast = useToast();
  const [takingBack, setTakingBack] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const [materialKey, setMaterialKey] = useState(0);
  // The tax-invoice draft the last shipment went onto, offered as a link.
  const [madeInvoice, setMadeInvoice] = useState<NonNullable<Shipment['invoice']> | null>(null);
  const company = useCompanySlug();
  const r = release;
  const p = r.progress;
  const f = r.finished;
  const confirmed = r.order.status === 'confirmed';
  const changed = (next: ReleaseSummary, msg?: string) => { onChange(next); invalidateNavCounts(); if (msg) toast.success(msg); };
  // Work recorded in the grid moves the figures above it: read them again (four small reads).
  const figuresStale = async () => {
    invalidateNavCounts();
    try {
      const prod = await cfApi.get<OrderProduction>(`/orders/${r.order.id}/production`);
      const mine = prod.releases.find((x) => x.id === r.id);
      if (mine) onChange(mine);
    } catch { /* the next visit catches up */ }
  };
  const reserveAll = async () => {
    setReserving(true);
    try {
      const out = await cfApi.post<{ release: ReleaseSummary; reserved: number; short: { code: string; uom: string; short: number }[] }>(`/releases/${r.id}/reserve?view=summary`, undefined, { timeoutMs: 120_000 });
      changed(out.release);
      setGridKey((k) => k + 1);
      setMaterialKey((k) => k + 1);
      if (out.short.length) toast.info(`Reserved what was free. Still short: ${out.short.map((s) => `${qtyText(s.short)} ${s.uom} ${s.code}`).join(', ')}.`);
      else toast.success('All material is reserved.');
    } catch (e) { toast.error((e as Error).message); } finally { setReserving(false); }
  };
  const pct = p.steps ? Math.round((p.done / p.steps) * 100) : 0;
  // Taking a release back is the only way to unfreeze the line's structure, so
  // when it is not on offer the screen has to say why (releaseService.unrelease).
  const orderOpen = !['closed', 'lost', 'cancelled'].includes(r.order.status);
  const takeBackWhy = !orderOpen
    ? `Order ${r.order.code} is ${ORDER_STATUS_LABEL[r.order.status].toLowerCase()}, so its releases stay as they are.`
    : !r.canUnrelease
      ? 'Work has started or material was issued, so this release can no longer be taken back.'
      : 'Undo the release: its reservations are let go and the line’s structure can change again.';
  return (
    <SectionCard title={`Line ${r.line.lineNo} · ${r.item.code ?? r.item.name} ×${qtyText(r.quantity)}`}
      subtitle={`Released ${new Date(r.releasedAt).toLocaleDateString()}${r.releasedBy ? ` by ${r.releasedBy}` : ''} · ${p.steps ? `${p.done} of ${p.steps} steps done · ` : ''}${p.pieces ? `${p.complete} of ${p.pieces} pieces complete · ` : ''}${p.materialsCovered} of ${p.materials} material line${p.materials === 1 ? '' : 's'} covered`}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {canStock && p.materialsCovered < p.materials && (
            <Button variant="outlined" startIcon={reserving ? <CircularProgress size={14} color="inherit" /> : <LockRounded />} disabled={reserving} onClick={reserveAll}>
              {reserving ? 'Reserving…' : 'Reserve material'}
            </Button>
          )}
          {canStock && (
            // A disabled button with no reason is the commonest "is it broken?" —
            // the tooltip needs a wrapper because MUI cannot hear a disabled button.
            <Tooltip title={f.readyToShip > 0
              ? `Ship the ${qtyText(f.readyToShip)} finished and waiting for this line`
              : r.finishedArea
                ? 'Nothing is ready to ship yet — finished pieces appear here as their last step is recorded.'
                : 'No area is set for finished work on this line, so nothing can be received for it yet.'}>
              <span>
                <Button variant="contained" startIcon={<LocalShippingRounded />} disabled={f.readyToShip <= 0} onClick={() => setShipping(true)}>Ship</Button>
              </span>
            </Tooltip>
          )}
          {canProduce && (
            <Tooltip title={takeBackWhy}>
              <span>
                <Button startIcon={<UndoRounded />} disabled={!orderOpen || !r.canUnrelease} onClick={() => setTakingBack(true)} sx={{ color: 'var(--c-text-2)' }}>Take back</Button>
              </span>
            </Tooltip>
          )}
        </Box>
      )}>
      {madeInvoice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMadeInvoice(null)} data-testid="invoice-made">
          Invoice draft{madeInvoice.invoiceNo ? ` ${madeInvoice.invoiceNo}` : ''} for {r.order.code} —{' '}
          <Box component={Link} to={appPath(company, `invoices/${madeInvoice.id}`)} sx={{ color: 'inherit', fontWeight: 600 }}>review and issue</Box>.
        </Alert>
      )}
      <Box sx={{ display: p.steps ? 'flex' : 'none', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <LinearProgress variant="determinate" value={pct} aria-label={`${pct}% of steps done`} sx={{ flex: '1 1 200px', height: 8, borderRadius: 4, background: 'var(--c-surface-2)', '& .MuiLinearProgress-bar': { background: 'var(--c-primary-500)', borderRadius: 4 } }} />
        <Mono muted>{pct}%</Mono>
        {p.inProgress > 0 && <Badge family="info" label={`${p.inProgress} in progress`} noIcon />}
        {p.onHold > 0 && <Badge family="warning" label={`${p.onHold} on hold`} noIcon />}
      </Box>
      {/* Finished pieces are received into stock for this line; shipping issues them back out of it. */}
      <Box sx={{
        display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2,
        p: 1.5, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)',
      }}>
        <Fact label="Ordered"><Mono>{qtyText(f.quantity)}</Mono></Fact>
        <Fact label="Made"><Mono muted={!f.made}>{qtyText(f.made)}</Mono></Fact>
        <Fact label="Ready to ship"><Mono muted={!f.readyToShip}>{qtyText(f.readyToShip)}</Mono></Fact>
        <Fact label="Delivered"><Mono muted={!f.delivered}>{qtyText(f.delivered)}</Mono></Fact>
        <Typography sx={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--c-text-3)' }}>
          {r.finishedArea
            ? `Finished work is received into ${r.finishedArea.code} · ${r.finishedArea.name} and earmarked for this line until it ships.`
            : 'No area is set for finished work on this line, so nothing can be received for it yet.'}
        </Typography>
      </Box>
      {p.pieces === 0
        ? <Typography sx={{ color: 'var(--c-text-2)', mb: 2 }}>Nothing is made for this line — it is bought in, so only its material is tracked below.</Typography>
        : <ProductionGrid key={`${r.line.id}:${gridKey}`} lineId={r.line.id} canAct={canProduce && confirmed} onChanged={() => { void figuresStale(); setMaterialKey((k) => k + 1); }} />}
      <MaterialSection release={r} canStock={canStock && confirmed} refreshKey={materialKey}
        onChange={(next) => { changed(next); setGridKey((k) => k + 1); }} />

      <ShipDialog release={shipping ? r : null} onClose={() => setShipping(false)}
        onShipped={(s: Shipment) => {
          const gone = Number((s.release.finished.delivered - f.delivered).toFixed(6));
          const msg = `${qtyText(gone)} of ${r.item.code ?? r.item.name} shipped — ${s.movement.code}.`;
          if ('summary' in s.release) changed(s.release, msg); else toast.success(msg);
          setMadeInvoice(s.invoice ?? null);
          onShipped?.();
        }} />
      <ConfirmDialog open={takingBack} danger title="Take this release back?" confirmLabel="Take back" entityName={`${r.order.code} line ${r.line.lineNo} · ${r.item.code ?? r.item.name}`}
        body="Only while nothing has started and nothing was issued. Its reservations are let go, and the line's structure can change again."
        onClose={() => setTakingBack(false)}
        onConfirm={async () => { await cfApi.del(`/releases/${r.id}`); invalidateNavCounts(); toast.success('Release taken back.'); onTakenBack(); }} />
    </SectionCard>
  );
}
