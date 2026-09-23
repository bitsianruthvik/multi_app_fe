import { useState } from 'react';
import { Box, Button, IconButton, LinearProgress, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import PauseRounded from '@mui/icons-material/PauseRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import OutputRounded from '@mui/icons-material/OutputRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import { cfApi } from '../api/client';
import type { ProductionPiece, ProductionStep, Release, Requirement, Shipment } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { ORDER_STATUS_LABEL } from '../lib/orders';
import { progressText } from '../lib/tracker';
import { Badge, Fact, Mono, SectionCard } from './ui';
import { DataTable, type DataColumn } from './DataTable';
import { PieceStatusBadge, StepStatusBadge } from './trackerUi';
import { ProgressDialog, ShipDialog, StartStepDialog } from './TrackerDialogs';
import { PromptDialog } from './PromptDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** The buttons a step offers, by what it is now. */
export function StepActions({ step, onStart, onRecord, onHold, onResume }: {
  step: ProductionStep; onStart: () => void; onRecord: () => void; onHold: () => void; onResume: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      {step.status === 'ready' && <Button size="small" variant="contained" startIcon={<PlayArrowRounded />} onClick={onStart}>Start</Button>}
      {step.status === 'in_progress' && <Button size="small" variant="outlined" startIcon={<EditNoteRounded />} onClick={onRecord}>Record</Button>}
      {(step.status === 'in_progress' || step.status === 'ready' || step.status === 'not_ready') && (
        <Tooltip title="Put on hold"><IconButton size="small" aria-label={`Put ${step.label} on hold`} onClick={onHold}><PauseRounded fontSize="small" /></IconButton></Tooltip>
      )}
      {step.status === 'on_hold' && <Button size="small" startIcon={<ReplayRounded />} onClick={onResume}>Resume</Button>}
    </Box>
  );
}

/** One step as a row under its piece: sequence, operation, status, progress, what it waits for, and its actions. */
function StepRow({ step, canProduce, onAct }: { step: ProductionStep; canProduce: boolean; onAct: (kind: 'start' | 'record' | 'hold' | 'resume', step: ProductionStep) => void }) {
  const why = step.status === 'not_ready' ? step.blockers.map((b) => b.text).join(' ') : step.status === 'in_progress' && step.machine ? `On ${step.machine.code}` : '';
  return (
    <Box sx={{
      display: 'grid', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, py: 0.75, px: 1,
      gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', md: '36px minmax(140px, 1.1fr) 120px 72px minmax(0, 2fr) auto' },
      borderTop: '1px solid var(--c-divider)', '&:hover': { background: 'var(--c-surface-2)' },
    }}>
      <Mono muted sx={{ display: { xs: 'none', md: 'block' } }}>{step.sequence}</Mono>
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 13.5, fontWeight: 500 }}>{step.operation.name} <Mono muted>{step.operation.code}</Mono></Box>
        {step.stepName && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{step.stepName}</Typography>}
      </Box>
      <Box sx={{ justifySelf: { xs: 'end', md: 'start' } }}><StepStatusBadge status={step.status} /></Box>
      <Mono muted sx={{ display: { xs: 'none', md: 'block' } }}>{progressText(step.qtyGood, step.quantity)}</Mono>
      <Typography sx={{ fontSize: 12.5, color: step.status === 'not_ready' ? 'var(--c-text-2)' : 'var(--c-text-3)', gridColumn: { xs: '1 / -1', md: 'auto' }, minWidth: 0 }}>{why}</Typography>
      {canProduce ? (
        <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
          <StepActions step={step} onStart={() => onAct('start', step)} onRecord={() => onAct('record', step)} onHold={() => onAct('hold', step)} onResume={() => onAct('resume', step)} />
        </Box>
      ) : <Box />}
    </Box>
  );
}

function PieceBlock({ piece, canProduce, onAct }: { piece: ProductionPiece; canProduce: boolean; onAct: (kind: 'start' | 'record' | 'hold' | 'resume', step: ProductionStep) => void }) {
  const company = useCompanySlug();
  return (
    <Box sx={{ ml: { xs: Math.min(piece.depth, 3) * 1.5, md: piece.depth * 3 }, mb: 1.25, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', px: 1.5, py: 1, background: piece.pieceNo ? 'var(--c-surface-2)' : 'transparent' }}>
        <Mono sx={{ fontSize: 13.5, color: 'var(--c-text)', fontWeight: 500 }}>
          <Box component={Link} to={appPath(company, `items/${piece.item.id}`)} sx={linkSx}>{piece.code ?? piece.item.code}</Box>
        </Mono>
        {!piece.pieceNo && <Mono muted>×{qtyText(piece.quantity)}</Mono>}
        <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 140px', minWidth: 0 }}>{piece.item.name}</Box>
        <Badge family="neutral" noIcon label={`Flow ${piece.flow.code}`} />
        <PieceStatusBadge status={piece.status} />
      </Box>
      {piece.steps.map((s) => <StepRow key={s.id} step={s} canProduce={canProduce} onAct={onAct} />)}
    </Box>
  );
}

/** Material rows with their reservations and the actions on them — shared by the order's Production tab and the Tracker. */
export function RequirementsTable({ rows, canStock, onChange, showOrder = false }: {
  rows: (Requirement & { order?: Release['order'] })[];
  canStock: boolean;
  onChange: (r: Release) => void;
  showOrder?: boolean;
}) {
  const company = useCompanySlug();
  const toast = useToast();
  const [issuing, setIssuing] = useState<Requirement | null>(null);
  const [letGo, setLetGo] = useState<{ req: Requirement; id: number; label: string } | null>(null);
  const reserve = async (q: Requirement) => {
    try { onChange(await cfApi.post<Release>(`/requirements/${q.id}/reserve`, {})); invalidateNavCounts(); toast.success(`${q.item.code} reserved.`); } catch (e) { toast.error((e as Error).message); }
  };
  const columns: DataColumn<Requirement & { order?: Release['order'] }>[] = [
    {
      key: 'item', header: 'Material', alwaysVisible: true,
      render: (q) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${q.item.id}`)} sx={linkSx}>{q.item.code}</Box></Mono>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{q.item.name}</Typography>
        </Box>
      ),
    },
    ...(showOrder ? [{ key: 'order', header: 'Order', alwaysVisible: true, render: (q: Requirement & { order?: Release['order'] }) => (q.order ? <Mono><Box component={Link} to={appPath(company, `orders/${q.order.id}?tab=production`)} sx={linkSx}>{q.order.code}</Box></Mono> : null) }] : []),
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
        onConfirm={async () => { onChange(await cfApi.post<Release>(`/requirements/${issuing?.id}/issue`)); invalidateNavCounts(); toast.success('Issued.'); }} />
      <ConfirmDialog open={!!letGo} title="Let this reservation go?" confirmLabel="Let it go" entityName={letGo?.label}
        body="The stock becomes free for anything else. The step that needs it waits again until it is reserved."
        onClose={() => setLetGo(null)}
        onConfirm={async () => { onChange(await cfApi.del<Release>(`/reservations/${letGo?.id}`)); invalidateNavCounts(); toast.success('Reservation let go.'); }} />
    </>
  );
}

/**
 * One released line: its progress, the tracker tree piece by piece with every
 * step's status and what it waits for, the material its steps consume, and what
 * has been finished into stock for the line and shipped from it.
 */
export function ReleaseView({ release, canProduce, canStock, onChange, onTakenBack, onShipped }: {
  release: Release;
  canProduce: boolean;
  /** May move stock — reserve, issue, ship (cf_erp_inventory_manage). */
  canStock: boolean;
  onChange: (r: Release) => void;
  onTakenBack: () => void;
  /** A shipment also writes a stock movement and can move the order on, so the whole screen reloads. */
  onShipped?: () => void;
}) {
  const toast = useToast();
  const [starting, setStarting] = useState<ProductionStep | null>(null);
  const [recording, setRecording] = useState<ProductionStep | null>(null);
  const [holding, setHolding] = useState<ProductionStep | null>(null);
  const [takingBack, setTakingBack] = useState(false);
  const [shipping, setShipping] = useState(false);
  const r = release;
  const p = r.progress;
  const f = r.finished;
  const changed = (next: Release, msg?: string) => { onChange(next); invalidateNavCounts(); if (msg) toast.success(msg); };
  const act = async (kind: 'start' | 'record' | 'hold' | 'resume', step: ProductionStep) => {
    if (kind === 'start') setStarting(step);
    else if (kind === 'record') setRecording(step);
    else if (kind === 'hold') setHolding(step);
    else {
      try { changed(await cfApi.post<Release>(`/production-steps/${step.id}/resume`, {}), 'Resumed.'); } catch (e) { toast.error((e as Error).message); }
    }
  };
  const reserveAll = async () => {
    try {
      const out = await cfApi.post<{ release: Release; reserved: number; short: { code: string; uom: string; short: number }[] }>(`/releases/${r.id}/reserve`);
      changed(out.release);
      if (out.short.length) toast.info(`Reserved what was free. Still short: ${out.short.map((s) => `${qtyText(s.short)} ${s.uom} ${s.code}`).join(', ')}.`);
      else toast.success('All material is reserved.');
    } catch (e) { toast.error((e as Error).message); }
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
    <SectionCard title={`Line ${r.line.lineNo} · ${r.item.code} ×${qtyText(r.quantity)}`}
      subtitle={`Released ${new Date(r.releasedAt).toLocaleDateString()}${r.releasedBy ? ` by ${r.releasedBy}` : ''} · ${p.steps ? `${p.done} of ${p.steps} steps done · ` : ''}${p.materialsCovered} of ${p.materials} material line${p.materials === 1 ? '' : 's'} covered`}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {canStock && p.materialsCovered < p.materials && <Button variant="outlined" startIcon={<LockRounded />} onClick={reserveAll}>Reserve material</Button>}
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
      <Box sx={{ display: p.steps ? 'flex' : 'none', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <LinearProgress variant="determinate" value={pct} aria-label={`${pct}% of steps done`} sx={{ flex: '1 1 200px', height: 8, borderRadius: 4, background: 'var(--c-surface-2)', '& .MuiLinearProgress-bar': { background: 'var(--c-primary-500)', borderRadius: 4 } }} />
        <Mono muted>{pct}%</Mono>
        {p.ready > 0 && <Badge family="success" label={`${p.ready} ready`} noIcon />}
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
      {r.items.length === 0 ? (
        <Typography sx={{ color: 'var(--c-text-2)', mb: 2 }}>Nothing is made for this line — it is bought in, so only its material is tracked below.</Typography>
      ) : r.items.map((piece) => <PieceBlock key={piece.id} piece={piece} canProduce={canProduce && r.order.status === 'confirmed'} onAct={act} />)}
      <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, mt: 2.5, mb: 1 }}>Material</Typography>
      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <RequirementsTable rows={r.requirements} canStock={canStock && r.order.status === 'confirmed'} onChange={(next) => changed(next)} />
      </Box>

      <ShipDialog release={shipping ? r : null} onClose={() => setShipping(false)}
        onShipped={(s: Shipment) => {
          const gone = Number((s.release.finished.delivered - f.delivered).toFixed(6));
          changed(s.release, `${qtyText(gone)} of ${r.item.code ?? r.item.name} shipped — ${s.movement.code}.`);
          onShipped?.();
        }} />
      <StartStepDialog step={starting} onClose={() => setStarting(null)} onDone={(next) => changed(next, 'Started.')} />
      <ProgressDialog step={recording} onClose={() => setRecording(null)} onDone={(next) => changed(next, 'Recorded.')} />
      <PromptDialog open={!!holding} title="Put this step on hold?" label="Why" confirmLabel="Hold" body={holding?.label}
        onClose={() => setHolding(null)}
        onConfirm={async (note) => changed(await cfApi.post<Release>(`/production-steps/${holding?.id}/hold`, { note }), 'On hold.')} />
      <ConfirmDialog open={takingBack} danger title="Take this release back?" confirmLabel="Take back" entityName={`${r.order.code} line ${r.line.lineNo} · ${r.item.code}`}
        body="Only while nothing has started and nothing was issued. Its reservations are let go, and the line's structure can change again."
        onClose={() => setTakingBack(false)}
        onConfirm={async () => { await cfApi.del(`/releases/${r.id}`); invalidateNavCounts(); toast.success('Release taken back.'); onTakenBack(); }} />
    </SectionCard>
  );
}
