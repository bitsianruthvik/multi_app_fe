import { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Flow, FlowDetail, FlowStep, MasterRecord, Operation, WaitRelation } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { RELATION_HELP, RELATION_LABEL } from '../lib/production';
import { RecordPicker } from './RecordPicker';
import { ErrorNotice } from './ui';
import { DialogHeader } from './FormDialog';
import { enterSubmits } from '../lib/dialog';

function useSave<T>(onDone: (r: T) => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const run = async (fn: () => Promise<T>) => {
    setBusy(true); setError(null);
    try { const r = await fn(); setBusy(false); onDone(r); onClose(); } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  return { busy, error, setError, run };
}

function Actions({ busy, onClose, onSave, label, disabled }: { busy: boolean; onClose: () => void; onSave: () => void; label: string; disabled?: boolean }) {
  return (
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="contained" onClick={onSave} disabled={busy || disabled} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : label}</Button>
    </DialogActions>
  );
}

/** Creates a flow or edits its header. The code is fixed once the flow is active. */
export function FlowDialog({ open, existing, onClose, onSaved }: { open: boolean; existing: Flow | null; onClose: () => void; onSaved: (f: FlowDetail) => void }) {
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const s = useSave<FlowDetail>(onSaved, onClose);
  useEffect(() => {
    if (!open) return;
    s.setError(null);
    setForm(existing ? { code: existing.code, name: existing.name, description: existing.description ?? '' } : { code: '', name: '', description: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);
  const body = { ...form, description: form.description || null };
  const blocked = !form.code.trim() || !form.name.trim();
  const save = () => s.run(() => (existing ? cfApi.put<FlowDetail>(`/flows/${existing.id}`, body) : cfApi.post<FlowDetail>('/flows', body)));
  return (
    <Dialog open={open} onClose={() => !s.busy && onClose()} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, s.busy || blocked)}>
      <DialogHeader title={existing ? `Edit ${existing.code}` : 'New flow'} onClose={onClose} busy={s.busy}
        subtitle={existing ? undefined : 'Operations in order. It starts as a draft; activate it once its steps are right.'} />
      <DialogContent>
        <ErrorNotice error={s.error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '180px minmax(0, 1fr)' }, gap: 2, pt: 0.5 }}>
          <TextField label="Code" value={form.code} disabled={!!existing && existing.status !== 'draft'} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            autoFocus={!existing} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText={existing && existing.status !== 'draft' ? 'Fixed once active' : 'e.g. PLATE-PART'} />
          <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextField label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <Actions busy={s.busy} onClose={onClose} label={existing ? 'Save' : 'Create'} disabled={blocked} onSave={save} />
    </Dialog>
  );
}

/** Adds a step (an operation at a sequence number) or edits one. Same number = runs alongside. */
export function StepDialog({ open, flow, existing, onClose, onSaved }: { open: boolean; flow: FlowDetail; existing: FlowStep | null; onClose: () => void; onSaved: (f: FlowDetail) => void }) {
  const ops = useLoad(() => cfApi.get<Operation[]>('/operations?status=active'), []);
  const [operationId, setOperationId] = useState<number | null>(null);
  const [sequence, setSequence] = useState('');
  const [stepName, setStepName] = useState('');
  const [notes, setNotes] = useState('');
  const s = useSave<FlowDetail>(onSaved, onClose);
  useEffect(() => {
    if (!open) return;
    s.setError(null);
    setOperationId(existing?.operation.id ?? null);
    setSequence(existing ? String(existing.sequence) : '');
    setStepName(existing?.stepName ?? '');
    setNotes(existing?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);
  // Every operation stays on offer: a girder is welded, crane-turned and welded
  // again, which is two passes of ONE operation. What may not repeat is an
  // operation at the same SEQUENCE, because steps sharing a number run
  // alongside each other and "the first pass" would stop meaning anything —
  // that is uq_cofs_operation_seq, and the server says so if you try.
  const passes = (id: number | null) => (id == null ? 0 : flow.steps.filter((st) => st.operation.id === id).length);
  const options = ops.data ?? [];
  const next = (flow.steps.reduce((m, st) => Math.max(m, st.sequence), 0) || 0) + 10;
  const body = { sequence: sequence === '' ? null : Number(sequence), stepName: stepName || null, notes: notes || null };
  const blocked = !existing && !operationId;
  const save = () => s.run(() => (existing ? cfApi.put<FlowDetail>(`/flow-steps/${existing.id}`, body) : cfApi.post<FlowDetail>(`/flows/${flow.id}/steps`, { ...body, operationId })));
  return (
    <Dialog open={open} onClose={() => !s.busy && onClose()} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, s.busy || blocked)}>
      <DialogHeader title={existing ? `Step ${existing.sequence}: ${existing.operation.name}` : 'Add a step'} onClose={onClose} busy={s.busy}
        subtitle="Steps run in sequence order; two steps with the same number run alongside each other." />
      <DialogContent>
        <ErrorNotice error={s.error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 140px' }, gap: 2, pt: 0.5 }}>
          <Autocomplete size="small" options={options} value={options.find((o) => o.id === operationId) ?? null} disabled={!!existing}
            getOptionLabel={(o) => `${o.code} · ${o.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, o) => setOperationId(o?.id ?? null)}
            renderInput={(p) => <TextField {...p} label="Operation" autoFocus={!existing} helperText={existing ? 'A step keeps its operation'
                : passes(operationId) > 0
                  ? `Already in this flow ${passes(operationId)}x — this adds another pass`
                  : 'An operation may appear more than once — give each pass its own sequence'} />} />
          <TextField label="Sequence" type="number" value={sequence} onChange={(e) => setSequence(e.target.value)} placeholder={String(next)}
            helperText={existing ? 'Same number as another step = alongside it' : `Empty: ${next}`} />
          <TextField label="Step name (optional)" value={stepName} onChange={(e) => setStepName(e.target.value)} sx={{ gridColumn: '1 / -1' }} helperText="e.g. Drill splice holes" />
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <Actions busy={s.busy} onClose={onClose} label={existing ? 'Save step' : 'Add step'} disabled={blocked} onSave={save} />
    </Dialog>
  );
}

const WHO: Record<Exclude<WaitRelation, 'ancestor'>, string> = { parent: 'its parent', children: 'its children', siblings: 'its siblings' };

/** The rule in one sentence, as the backend words it. */
function sentence(relation: WaitRelation, def: MasterRecord | null, op: Operation | null, status: 'started' | 'done') {
  const madeFrom = def?.code ?? def?.name;
  const who = relation === 'ancestor' ? `the nearest ${madeFrom ?? '…'} above it` : `${WHO[relation]}${madeFrom && relation !== 'parent' ? ` made from ${madeFrom}` : ''}`;
  const plural = relation === 'children' || relation === 'siblings';
  if (op) return `Waits until ${who} ${plural ? 'have' : 'has'} ${status === 'started' ? 'started' : 'finished'} ${op.name} (${op.code}).`;
  return `Waits until ${who} ${plural ? 'are' : 'is'} ${status === 'started' ? 'started' : 'complete'}.`;
}

/**
 * Adds a Wait-For rule to a step. The rule names a relative target — parent,
 * children, siblings or the nearest ancestor of a template — so it holds for
 * every order; the production tracker tree resolves who that is.
 */
export function WaitDialog({ open, step, onClose, onSaved }: { open: boolean; step: FlowStep | null; onClose: () => void; onSaved: (f: FlowDetail) => void }) {
  const ops = useLoad(() => cfApi.get<Operation[]>('/operations?status=active'), []);
  const [relation, setRelation] = useState<WaitRelation>('children');
  const [def, setDef] = useState<MasterRecord | null>(null);
  const [opId, setOpId] = useState<number | null>(null);
  const [status, setStatus] = useState<'started' | 'done'>('done');
  const [notes, setNotes] = useState('');
  const s = useSave<FlowDetail>(onSaved, onClose);
  useEffect(() => {
    if (!open) return;
    s.setError(null); setRelation('children'); setDef(null); setOpId(null); setStatus('done'); setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const op = (ops.data ?? []).find((o) => o.id === opId) ?? null;
  const needsDef = relation === 'ancestor';
  const blocked = !step || (needsDef && !def);
  const save = () => s.run(() => cfApi.post<FlowDetail>(`/flow-steps/${step?.id}/waits`, {
    relation, targetDefinitionId: def?.id ?? null, targetOperationId: opId, requiredStatus: status, notes: notes || null,
  }));
  return (
    <Dialog open={open} onClose={() => !s.busy && onClose()} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, s.busy || blocked)}>
      <DialogHeader title={step ? `Step ${step.sequence} (${step.operation.code}) waits for…` : 'Wait for'} onClose={onClose} busy={s.busy}
        subtitle="A relative rule, so it holds for every order; the production tracker tree works out who that is." />
      <DialogContent>
        <ErrorNotice error={s.error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <Box>
            <ToggleButtonGroup exclusive size="small" value={relation} onChange={(_, v) => { if (v) { setRelation(v); if (v === 'parent') setDef(null); } }} aria-label="Who to wait for" sx={{ flexWrap: 'wrap' }}>
              {(Object.keys(RELATION_LABEL) as WaitRelation[]).map((r) => <ToggleButton key={r} value={r}>{RELATION_LABEL[r]}</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75 }}>{RELATION_HELP[relation]}</Typography>
          </Box>
          {relation !== 'parent' && (
            <RecordPicker kinds={['template']} value={def} onChange={setDef} label={needsDef ? 'Which ancestor — made from template' : 'Only those made from (optional)'}
              helperText={needsDef ? 'The nearest one of these above the piece' : 'Empty: all of them'} />
          )}
          <Autocomplete size="small" options={ops.data ?? []} value={op} getOptionLabel={(o) => `${o.code} · ${o.name}`} isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, o) => setOpId(o?.id ?? null)} renderInput={(p) => <TextField {...p} label="At which of their steps (optional)" helperText="Empty: the piece as a whole" />} />
          <TextField select label="Until it has" value={status} onChange={(e) => setStatus(e.target.value as 'started' | 'done')}>
            <MenuItem value="done">Finished</MenuItem>
            <MenuItem value="started">Started</MenuItem>
          </TextField>
          <TextField label="Why (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Holes are match-drilled after fit-up" />
          <Box sx={{ p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-primary-50)', border: '1px solid var(--c-primary-200)', color: 'var(--c-primary-900)' }}>
            {sentence(relation, def, op, status)}
          </Box>
        </Box>
      </DialogContent>
      <Actions busy={s.busy} onClose={onClose} label="Add wait" disabled={blocked} onSave={save} />
    </Dialog>
  );
}
