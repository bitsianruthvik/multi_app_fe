import { useEffect, useState } from 'react';
import { Autocomplete, Box, MenuItem, TextField, Typography } from '@mui/material';
import { cfApi } from '../api/client';
import type { OperationDetail, ProductionStep, Release, ReleaseCheck, Shipment } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { PURPOSE_LABEL, qtyText } from '../lib/inventory';
import { FormDialog } from './FormDialog';
import { Fact, Mono, SkeletonRows } from './ui';

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
  const [areaId, setAreaId] = useState('');
  // A different line starts from its own check, so drop the old answer first.
  useEffect(() => { setAreaId(''); }, [line?.id]);
  useEffect(() => { if (c?.finishedArea) setAreaId(String(c.finishedArea.id)); }, [c]);
  const save = async () => { if (line) onReleased(await cfApi.post<Release>(`/order-lines/${line.id}/release`, { finishedAreaId: Number(areaId) || null })); };
  return (
    <FormDialog open={!!line} title={`Release line ${line?.lineNo ?? ''} to production`} onClose={onClose} onSubmit={save}
      submitLabel="Release" busyLabel="Releasing…" submitDisabled={!c?.ok || !areaId} maxWidth="md"
      subtitle={<>The whole line is released at once: <Mono>{line?.label ?? ''}</Mono>. Its structure is frozen from then on.</>}>
      {check.loading && !c ? <SkeletonRows rows={3} /> : c && (
        <>
          <TextField select label="Finished work goes to" value={areaId} onChange={(e) => setAreaId(e.target.value)}
            helperText={c.needsFinishedArea && !areaId
              ? c.finishedAreaProblem ?? 'Say where finished work goes.'
              : 'Finished pieces are received there and earmarked for this line until they ship.'}>
            {c.areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.code} · {a.name} · {PURPOSE_LABEL[a.purpose]}</MenuItem>)}
          </TextField>
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
  useEffect(() => { setMachineId(null); }, [step?.id]);
  const options = (op.data?.machines ?? []).filter((m) => m.eligible).map((m) => m.machine);
  const save = async () => { if (step) onDone(await cfApi.post<Release>(`/production-steps/${step.id}/start`, { machineId })); };
  return (
    <FormDialog open={!!step} title="Start this step" onClose={onClose} onSubmit={save} submitLabel="Start" busyLabel="Starting…" maxWidth="xs"
      subtitle={step?.label}>
      <Autocomplete options={options} value={options.find((m) => m.id === machineId) ?? null} loading={op.loading}
        getOptionLabel={(m) => `${m.code} · ${m.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, m) => setMachineId(m?.id ?? null)}
        noOptionsText="No machine is set up for this operation"
        renderInput={(p) => <TextField {...p} label="On machine (optional)" helperText="Only machines whose rules allow this operation" autoFocus />} />
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
  const save = async () => { if (step) onDone(await cfApi.post<Release>(`/production-steps/${step.id}/progress`, { good: good || 0, scrap: scrap || 0, note: note || null })); };
  return (
    <FormDialog open={!!step} title="Record work" onClose={onClose} onSubmit={save} maxWidth="xs"
      subtitle={step ? `${step.label} — ${qtyText(step.qtyGood)} of ${qtyText(step.quantity)} good so far. Scrapped pieces are made again.` : undefined}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
        <TextField label="Good" value={good} onChange={(e) => setGood(e.target.value)} autoFocus inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
          helperText={`${qtyText(left)} still needed`} />
        <TextField label="Scrapped" value={scrap} onChange={(e) => setScrap(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
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
  useEffect(() => {
    if (release) { setQuantity(String(release.finished.readyToShip)); setReference(''); setDate(''); setNote(''); }
  }, [release?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toMake = f ? Math.max(0, Number((f.quantity - f.made).toFixed(6))) : 0;
  const save = async () => {
    if (release) {
      onShipped(await cfApi.post<Shipment>(`/order-lines/${release.line.id}/ship`, {
        quantity: quantity || null, reference: reference || null, movementDate: date || null, notes: note || null,
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
    </FormDialog>
  );
}
