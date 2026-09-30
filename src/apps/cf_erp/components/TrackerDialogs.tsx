import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { cfApi, LONG_WRITE_MS, type CfApiError } from '../api/client';
import type { OperationDetail, ProductionStep, Release, ReleaseCheck, Shipment, StockingArea } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { PURPOSE_LABEL, qtyText } from '../lib/inventory';
import { FormDialog } from './FormDialog';
import { ErrorNotice, Fact, Mono, SkeletonRows } from './ui';
import { Working } from './WorkingNote';
import { knownLineSize, releaseCheckText, rememberLineSize } from '../lib/working';

/** A typed quantity: empty counts as none, anything unreadable as NaN so the form can refuse it. */
const amount = (v: string) => (v.trim() === '' ? 0 : Number(v));

/**
 * Releases a whole sales line (decision E1). Opens on the release check — what
 * would be created and what stops it — so nothing is released blind.
 */
export function ReleaseDialog({ line, onClose, onReleased }: {
  line: { id: number; lineNo: number; label: string } | null;
  onClose: () => void;
  onReleased: (r: Release) => void;
}) {
  const check = useLoad(() => (line ? cfApi.get<ReleaseCheck>(`/order-lines/${line.id}/release-check`) : Promise.resolve(null)), [line?.id]);
  const c = check.data;
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const [areaId, setAreaId] = useState('');
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<CfApiError | null>(null);
  // The two fixes the dialog can make itself, so nobody has to open 25 item pages or go looking for a yard.
  const giveFlow = async () => {
    if (!line) return;
    setFixing(true); setFixError(null);
    try { await cfApi.post(`/order-lines/${line.id}/cut-plates/flow`, {}); check.reload(); } catch (e) { setFixError(e as CfApiError); } finally { setFixing(false); }
  };
  const createYard = async () => {
    setFixing(true); setFixError(null);
    try {
      // The code is DISPATCH-YARD when it is free; otherwise the next free number.
      let made: StockingArea | null = null;
      let last: unknown = null;
      for (let i = 1; i <= 5 && !made; i += 1) {
        try { made = await cfApi.post<StockingArea>('/stocking-areas', { code: i === 1 ? 'DISPATCH-YARD' : `DISPATCH-YARD-${i}`, name: i === 1 ? 'Dispatch yard' : `Dispatch yard ${i}`, purpose: 'dispatch' }); } catch (e) { last = e; }
      }
      if (!made) throw last;
      setAreaId(String(made.id));
      check.reload();
    } catch (e) { setFixError(e as CfApiError); } finally { setFixing(false); }
  };
  // A different line starts from its own check, so drop the old answer first.
  useEffect(() => { setAreaId(''); setFixError(null); }, [line?.id]);
  useEffect(() => { if (c?.finishedArea) setAreaId(String(c.finishedArea.id)); }, [c]);
  useEffect(() => { if (line && c) rememberLineSize(line.id, { pieces: c.summary.pieces }); }, [line, c]);
  const save = async () => { if (line) onReleased(await cfApi.post<Release>(`/order-lines/${line.id}/release`, { finishedAreaId: Number(areaId) || null }, { timeoutMs: LONG_WRITE_MS })); };
  return (
    <FormDialog open={!!line} title={`Release line ${line?.lineNo ?? ''} to production`} onClose={onClose} onSubmit={save}
      submitLabel="Release" busyLabel="Releasing…" submitDisabled={!c?.ok || !areaId} maxWidth="md"
      subtitle={<>The whole line is released at once: <Mono>{line?.label ?? ''}</Mono>. Its structure is frozen from then on.</>}>
      {/* Without this the dialog renders an empty body and a dead Release button
          when the check itself fails — nothing on screen says why. */}
      <ErrorNotice error={check.error} onRetry={check.reload} />
      <ErrorNotice error={fixError} />
      {check.loading && !c ? (
        <Box sx={{ display: 'grid', gap: 1.25 }}>
          <Working active>{releaseCheckText(line ? knownLineSize(line.id) : {})}</Working>
          <SkeletonRows rows={3} />
        </Box>
      ) : c && (
        <>
          <TextField select label="Finished work goes to" value={areaId} onChange={(e) => setAreaId(e.target.value)}
            helperText={c.needsFinishedArea && !areaId
              ? c.finishedAreaProblem ?? 'Say where finished work goes.'
              : 'Finished pieces are received there and earmarked for this line until they ship.'}>
            {c.areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.code} · {a.name} · {PURPOSE_LABEL[a.purpose]}</MenuItem>)}
          </TextField>
          {c.noFittingArea && c.finishedAreaPurpose === 'dispatch' && isPermitted('cf_erp_inventory_manage') && (
            <Box>
              <Button size="small" variant="outlined" onClick={createYard} disabled={fixing}>Create a dispatch yard</Button>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>There is no dispatch area yet. This makes one called &ldquo;Dispatch yard&rdquo; and picks it.</Typography>
            </Box>
          )}
          {c.ok ? (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 2 }}>
                <Fact label="Pieces"><Mono>{c.summary.pieces}</Mono></Fact>
                <Fact label="Grouped parts"><Mono>{c.summary.groups}</Mono></Fact>
                <Fact label="Steps"><Mono>{c.summary.steps}</Mono></Fact>
                <Fact label="Waits"><Mono>{c.summary.waits}</Mono></Fact>
                <Fact label="Material lines"><Mono>{c.summary.requirements}</Mono></Fact>
              </Box>
              {c.materials.length > 0 && (
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1 }}>Material it needs</Typography>
                  <Box sx={{ display: 'grid', gap: 0.75 }}>
                    {c.materials.map((m) => (
                      <Box key={m.item.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13.5 }}>
                        <Mono>{m.item.code}</Mono>
                        <Box sx={{ color: 'var(--c-text-2)', flex: '1 1 160px', minWidth: 0 }}>{m.item.name}</Box>
                        <Mono>{qtyText(m.required)} {m.item.uom}</Mono>
                        <Box component="span" sx={{ fontSize: 12.5, color: m.short > 0 ? 'var(--c-warning-800)' : 'var(--c-success-800)' }}>
                          {m.short > 0 ? `${qtyText(m.short)} short — ${qtyText(m.free)} free now` : 'enough free now'}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 1 }}>
                    Short material does not stop the release — the steps that use it wait until it is reserved.
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Box role="alert" sx={{ p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)' }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-warning-800)', mb: 0.75 }}>Not yet — fix these first:</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13.5, color: 'var(--c-text)' }}>
                {c.problems.map((p) => <li key={p}>{p}</li>)}
              </Box>
              {!!c.cutPlatesNoFlow?.missing && isPermitted('cf_erp_orders_manage') && (
                <Box sx={{ mt: 1.25 }}>
                  {c.cutPlatesNoFlow.flow
                    ? (
                      <Button size="small" variant="contained" onClick={giveFlow} disabled={fixing}>
                        Give all cut plates the cutting flow
                      </Button>
                    )
                    : (
                      <Button size="small" variant="outlined" component={Link} to={appPath(company, 'flows')}>
                        Set a cut-plate flow first
                      </Button>
                    )}
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
                    {c.cutPlatesNoFlow.flow
                      ? `Uses ${c.cutPlatesNoFlow.flow.code} — only the cut plates with no flow get it.`
                      : 'No cut-plate flow is set for the company. Set it under Production › Flows, then come back.'}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </>
      )}
    </FormDialog>
  );
}

/** Starts a ready step, optionally on a machine its operation's rules allow. */
export function StartStepDialog({ step, onClose, onDone }: { step: ProductionStep | null; onClose: () => void; onDone: (r: Release) => void }) {
  const op = useLoad(() => (step ? cfApi.get<OperationDetail>(`/operations/${step.operation.id}`) : Promise.resolve(null)), [step?.operation.id]);
  const [machineId, setMachineId] = useState<number | null>(null);
  const options = useMemo(() => (op.data?.machines ?? []).filter((m) => m.eligible).map((m) => m.machine), [op.data]);
  // A different step starts blank — but where only one machine can do the work
  // the answer is already known, so fill it in rather than making someone at
  // the machine pick it every single time.
  useEffect(() => { setMachineId(options.length === 1 ? options[0].id : null); }, [step?.id, options]);
  const save = async () => { if (step) onDone(await cfApi.post<Release>(`/production-steps/${step.id}/start`, { machineId })); };
  return (
    <FormDialog open={!!step} title="Start this step" onClose={onClose} onSubmit={save} submitLabel="Start" busyLabel="Starting…" maxWidth="xs"
      subtitle={step?.label}>
      <Autocomplete options={options} value={options.find((m) => m.id === machineId) ?? null} loading={op.loading}
        getOptionLabel={(m) => `${m.code} · ${m.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, m) => setMachineId(m?.id ?? null)}
        noOptionsText="No machine is set up for this operation"
        renderInput={(p) => <TextField {...p} label="On machine (optional)"
          helperText={op.error ? op.error.message : options.length === 1 ? 'The only machine set up for this operation' : 'Only machines whose rules allow this operation'}
          error={!!op.error} autoFocus />} />
    </FormDialog>
  );
}

/** Records good and scrapped pieces on a started step; the step is done when the good ones reach its quantity. */
export function ProgressDialog({ step, onClose, onDone }: { step: ProductionStep | null; onClose: () => void; onDone: (r: Release) => void }) {
  const left = step ? Math.max(0, Number((step.quantity - step.qtyGood).toFixed(6))) : 0;
  const [good, setGood] = useState('');
  const [scrap, setScrap] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { if (step) { setGood(String(left)); setScrap(''); setNote(''); } }, [step?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The two rules the backend enforces, checked here so a refusal never costs a
  // round trip at the machine: record something, and no more good than are left.
  const g = amount(good);
  const s = amount(scrap);
  const tooMany = Number.isFinite(g) && g > left + 1e-6;
  const nothing = !Number.isFinite(g) || !Number.isFinite(s) || g < 0 || s < 0 || g + s <= 0;
  const save = async () => { if (step) onDone(await cfApi.post<Release>(`/production-steps/${step.id}/progress`, { good: good || 0, scrap: scrap || 0, note: note || null })); };
  return (
    <FormDialog open={!!step} title="Record work" onClose={onClose} onSubmit={save} maxWidth="xs" submitLabel="Record" busyLabel="Recording…" submitDisabled={nothing || tooMany}
      subtitle={step ? `${step.label} — ${qtyText(step.qtyGood)} of ${qtyText(step.quantity)} good so far. Scrapped pieces are made again.` : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
        <TextField label="Good" value={good} onChange={(e) => setGood(e.target.value)} autoFocus error={tooMany} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={tooMany ? `Only ${qtyText(left)} more needed here` : `${qtyText(left)} still needed`} />
        <TextField label="Scrapped" value={scrap} onChange={(e) => setScrap(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText="Leave empty if none" />
      </Box>
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </FormDialog>
  );
}

/**
 * Shipping a line is an ordinary stock issue against it: it takes from the
 * finished pieces already received into stock and earmarked for this line, so
 * only what is really in the yard can leave.
 */
export function ShipDialog({ release, onClose, onShipped }: {
  release: Release | null;
  onClose: () => void;
  onShipped: (s: Shipment) => void;
}) {
  const f = release?.finished;
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  // A tax invoice rides with every dispatch. Only someone who may write orders can make one.
  const canInvoice = useIsPermitted()('cf_erp_orders_manage');
  const [invoice, setInvoice] = useState(true);
  useEffect(() => {
    if (release) { setQuantity(String(release.finished.readyToShip)); setReference(''); setDate(''); setNote(''); setInvoice(true); }
  }, [release?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toMake = f ? Math.max(0, Number((f.quantity - f.made).toFixed(6))) : 0;
  const save = async () => {
    if (release) {
      onShipped(await cfApi.post<Shipment>(`/order-lines/${release.line.id}/ship`, {
        quantity: quantity || null, reference: reference || null, movementDate: date || null, notes: note || null,
        invoice: canInvoice && invoice,
      }));
    }
  };
  return (
    <FormDialog open={!!release} title="Ship this line" onClose={onClose} onSubmit={save} submitLabel="Ship" busyLabel="Shipping…" maxWidth="xs" submitDisabled={!quantity}
      subtitle={release && f
        ? `${release.item.code ?? release.item.name} — ${qtyText(f.readyToShip)} ready to ship of ${qtyText(f.quantity)}${toMake > 0 ? `, ${qtyText(toMake)} still to make` : ''}. ${qtyText(f.delivered)} delivered so far.`
        : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus
          inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} helperText={f ? `${qtyText(f.readyToShip)} ready` : ' '} />
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} helperText="Empty: today" />
      </Box>
      <TextField label="Delivery note" value={reference} onChange={(e) => setReference(e.target.value)} helperText="Your dispatch or delivery note number" />
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {canInvoice && (
        <FormControlLabel control={<Checkbox size="small" checked={invoice} onChange={(e) => setInvoice(e.target.checked)} inputProps={{ 'aria-label': 'Make the tax invoice' }} />}
          label={<Typography sx={{ fontSize: 13.5 }}>Make the tax invoice<Box component="span" sx={{ display: 'block', fontSize: 12, color: 'var(--c-text-3)' }}>A draft you review and issue — several lines on one truck share one.</Box></Typography>} />
      )}
    </FormDialog>
  );
}
