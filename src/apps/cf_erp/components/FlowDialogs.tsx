import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, MenuItem, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Flow, FlowDetail, MasterRecord, Operation, WaitRelation } from '../api/types';
import { RELATION_HELP, RELATION_LABEL } from '../lib/production';
import { mergeChoices, meetingSteps, type FlowDraft, type Gap, type Merge, type MergeChoice, type NewWait as PendingWait } from '../lib/flowEdit';
import { RecordPicker } from './RecordPicker';
import { ErrorNotice } from './ui';
import { DialogHeader } from './FormDialog';
import { enterSubmits } from '../lib/dialog';
import { codeOrName } from '../lib/displayCode';

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

/**
 * Picks ONE operation for the flow page's edit mode — a new step at a gap, a step alongside, or the
 * operation that replaces a step's. It calls nothing: the pick goes into the page's pending edits,
 * and Save sends them all at once.
 *
 * Every operation stays on offer: a girder is welded, crane-turned and welded again, which is two
 * passes of ONE operation. What may not repeat is an operation at the same NUMBER, because steps
 * sharing a number run alongside each other — `exclude` leaves those out.
 */
export function OperationPickDialog({ open, title, subtitle, note, confirmLabel, options, loading = false, exclude = [], passes, onClose, onPick }: {
  open: boolean; title: string; subtitle?: string; note?: string; confirmLabel: string; options: Operation[]; loading?: boolean;
  /** Operation ids not offered. */
  exclude?: number[];
  /** How many steps of the flow already do this operation. */
  passes?: (operationId: number) => number;
  onClose: () => void; onPick: (operation: Operation) => void;
}) {
  const [picked, setPicked] = useState<Operation | null>(null);
  useEffect(() => { if (open) setPicked(null); }, [open]);
  const offered = options.filter((o) => !exclude.includes(o.id));
  const already = picked && passes ? passes(picked.id) : 0;
  const pick = () => { if (picked) { onPick(picked); onClose(); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth onKeyDown={enterSubmits(pick, !picked)}>
      <DialogHeader title={title} onClose={onClose} subtitle={subtitle} />
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <Autocomplete size="small" options={offered} value={picked} loading={loading}
            getOptionLabel={(o) => `${o.code} · ${o.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, o) => setPicked(o)}
            renderInput={(p) => <TextField {...p} label="Operation" autoFocus inputProps={{ ...p.inputProps, 'data-testid': 'pick-operation' }}
              helperText={already > 0 ? `Already in this flow ${already}x — this is another pass` : undefined} />} />
          {note && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{note}</Typography>}
        </Box>
      </DialogContent>
      <Actions busy={false} onClose={onClose} label={confirmLabel} disabled={!picked} onSave={pick} />
    </Dialog>
  );
}

const WHO: Record<Exclude<WaitRelation, 'ancestor'>, string> = { parent: 'its parent', children: 'its children', siblings: 'its siblings', descendants: 'every piece below it' };

/**
 * The rule in one sentence, as the backend words it — and that "as" is a
 * standing liability: this is a hand copy of waitText() in flowService.js, and
 * it has already drifted once. When repeated operations landed, the backend
 * gained the pass clause and this did not, so a rule read one way while you
 * were composing it and another once it was saved.
 *
 * It exists because the preview is shown BEFORE the rule is saved, so there is
 * no server-rendered text to show yet. The real fix is a preview endpoint —
 * the app already has that convention (/records/preview, /codegen/preview,
 * /operations/:id/timing) — after which this function should be deleted rather
 * than maintained.
 */
function sentence(relation: WaitRelation, def: MasterRecord | null, op: Operation | null, status: 'started' | 'done') {
  const madeFrom = def ? codeOrName(def) : undefined;
  const who = relation === 'ancestor' ? `the nearest ${madeFrom ?? '…'} above it` : `${WHO[relation]}${madeFrom && relation !== 'parent' ? ` made from ${madeFrom}` : ''}`;
  const plural = relation === 'children' || relation === 'siblings' || relation === 'descendants';
  if (op) {
    // Kept word for word in step with waitText() in flowService.js.
    const pass = status === 'started'
      ? ' Where a flow does it more than once, that means the first pass.'
      : ' Where a flow does it more than once, that means the last pass.';
    return `Waits until ${who} ${plural ? 'have' : 'has'} ${status === 'started' ? 'started' : 'finished'} ${op.name} (${op.code}).${pass}`;
  }
  return `Waits until ${who} ${plural ? 'are' : 'is'} ${status === 'started' ? 'started' : 'complete'}.`;
}

/**
 * Adds a Wait-For rule to a step. The rule names a relative target — parent,
 * children, siblings or the nearest ancestor of a template — so it holds for
 * every order; the production tracker tree resolves who that is.
 *
 * It calls nothing: the rule goes to `onAdd`, into the flow page's pending edits (Save sends them
 * all at once), with the sentence composed here so the card can show it before it is saved.
 * `clash` says the step already waits for exactly that.
 */
export function WaitDialog({ open, step, options, clash, onClose, onAdd }: {
  open: boolean; step: { sequence: number | null; operation: { code: string } } | null; options: Operation[];
  clash?: (wait: PendingWait) => boolean; onClose: () => void; onAdd: (wait: PendingWait) => void;
}) {
  const [relation, setRelation] = useState<WaitRelation>('children');
  const [def, setDef] = useState<MasterRecord | null>(null);
  const [opId, setOpId] = useState<number | null>(null);
  const [status, setStatus] = useState<'started' | 'done'>('done');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setRelation('children'); setDef(null); setOpId(null); setStatus('done'); setNotes('');
  }, [open]);
  const op = options.find((o) => o.id === opId) ?? null;
  const needsDef = relation === 'ancestor';
  const wait: PendingWait = {
    relation, targetDefinitionId: relation === 'parent' ? null : def?.id ?? null, targetOperationId: opId, requiredStatus: status, notes: notes.trim() || null,
    text: sentence(relation, def, op, status),
  };
  const twice = !!clash?.(wait);
  const blocked = !step || (needsDef && !def) || twice;
  const save = () => { if (!blocked) { onAdd(wait); onClose(); } };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, blocked)}>
      <DialogHeader title={step ? `Step ${step.sequence ?? ''} (${step.operation.code}) waits for…` : 'Wait for'} onClose={onClose}
        subtitle="A relative rule, so it holds for every order; the production tracker tree works out who that is." />
      <DialogContent>
        {twice && <Alert severity="warning" sx={{ mb: 2 }}>This step already waits for that.</Alert>}
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
          <Autocomplete size="small" options={options} value={op} getOptionLabel={(o) => `${o.code} · ${o.name}`} isOptionEqualToValue={(a, b) => a.id === b.id}
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
      <Actions busy={false} onClose={onClose} label="Add wait" disabled={blocked} onSave={save} />
    </Dialog>
  );
}

/**
 * MERGE at a gap: which lanes meet here, which lane the flow continues in, and the step they meet at
 * — an existing step of that lane, or a new one at its end. The lanes that are not continued in END
 * here; the meeting step then waits for the step above it and for the last step of each of them.
 * It calls nothing: the merge goes into the page's pending edits (`onMerge` answers a refusal in words).
 */
export function MergeDialog({ open, draft, gap, options, loading = false, onClose, onMerge }: {
  open: boolean; draft: FlowDraft | null; gap: Gap | null; options: Operation[]; loading?: boolean; onClose: () => void; onMerge: (merge: Merge) => string | null;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [target, setTarget] = useState<string>('');
  const [at, setAt] = useState<string>('new');
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(() => (open && draft && gap ? mergeChoices(draft, gap) : null), [open, draft, gap]);
  const lanes = useMemo(() => choices?.lanes ?? [], [choices]);
  const byKey = (k: string) => lanes.find((l) => l.key === k);
  // The lanes a set could continue in: every other lane of the set must be able to end here.
  const targetsOf = (set: string[]) => set.filter((t) => set.every((k) => k === t || byKey(k)?.closable));
  const meeting = (set: string[], t: string) => (draft && t ? meetingSteps(draft, set.filter((k) => k !== t), t, gap) : { steps: [], suggested: null });
  const settle = (set: string[], wanted?: string) => {
    const targets = targetsOf(set);
    const t = wanted && targets.includes(wanted) ? wanted : targets[0] ?? '';
    setChosen(set); setTarget(t); setAt(meeting(set, t).suggested ?? 'new'); setError(null);
  };
  useEffect(() => {
    if (!open || !choices) return;
    const mine = choices.lanes.find((l) => l.isGapLane);
    const others = choices.lanes.filter((l) => !l.isGapLane);
    const closers = others.filter((l) => l.closable);
    // The obvious one: the only other lane that can end here; or, when this lane itself ends, the lane on its left.
    const also = closers.length === 1 ? [closers[0].key]
      : closers.length === 0 && mine?.closable ? others.filter((l) => l.number < mine.number).slice(-1).map((l) => l.key) : [];
    setOperation(null);
    settle([...(mine ? [mine.key] : []), ...also]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, choices]);
  const set = lanes.filter((l) => chosen.includes(l.key)).map((l) => l.key);          // left to right
  const targets = targetsOf(set);
  const closing = set.filter((k) => k !== target);
  const meet = meeting(set, target);
  const blocked = set.length < 2 || !target || (at === 'new' && !operation);
  const name = (l: MergeChoice) => `Lane ${l.number}${l.ends ? ` — ends at ${l.ends}` : ''}`;
  const save = () => {
    if (blocked || !draft) return;
    const refused = onMerge({ closing, target, at: at === 'new' ? { operation: { id: (operation as Operation).id, code: (operation as Operation).code, name: (operation as Operation).name, status: (operation as Operation).status } } : at });
    if (refused) setError(refused); else onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, blocked)}>
      <DialogHeader title="Lanes meet here" onClose={onClose}
        subtitle="The lanes that are not continued in end here. The step they meet at waits for the last step of each of them." />
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <Box role="group" aria-label="Which lanes meet here?">
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.25 }}>Which lanes meet here?</Typography>
            {lanes.map((l) => (
              <FormControlLabel key={l.key} sx={{ display: 'flex', ml: 0 }}
                control={<Checkbox size="small" checked={chosen.includes(l.key)} disabled={l.isGapLane} inputProps={{ 'aria-label': name(l) }}
                  onChange={(e) => settle(e.target.checked ? [...chosen, l.key] : chosen.filter((k) => k !== l.key), target)} />}
                label={<Box sx={{ fontSize: 14 }}>{name(l)}{l.isGapLane && <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · this lane</Box>}{!l.closable && !l.isGapLane && <Box component="span" sx={{ color: 'var(--c-text-3)' }}> · goes on below</Box>}</Box>} />
            ))}
          </Box>
          <TextField select size="small" label="Continue in lane" value={targets.includes(target) ? target : ''} onChange={(e) => settle(set, e.target.value)}
            helperText={set.length < 2 ? 'Choose at least two lanes' : targets.length === 0 ? 'Two of these lanes go on below — only one of the chosen lanes can do that' : 'The other chosen lanes end here'}
            inputProps={{ 'data-testid': 'merge-target' }}>
            {targets.map((k) => <MenuItem key={k} value={k}>{`Lane ${byKey(k)?.number}`}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="They meet at" value={at} onChange={(e) => { setAt(e.target.value); setError(null); }} disabled={!target} inputProps={{ 'data-testid': 'merge-at' }}>
            {meet.steps.map((k) => <MenuItem key={k} value={k}>{`${draft?.steps[k]?.operation.code} · ${draft?.steps[k]?.operation.name}`}</MenuItem>)}
            <MenuItem value="new">{`A new step at the end of lane ${byKey(target)?.number ?? ''}`}</MenuItem>
          </TextField>
          {at === 'new' && (
            <Autocomplete size="small" options={options} value={operation} loading={loading}
              getOptionLabel={(o) => `${o.code} · ${o.name}`} isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, o) => setOperation(o)}
              renderInput={(p) => <TextField {...p} label="Operation of the new step" inputProps={{ ...p.inputProps, 'data-testid': 'merge-operation' }} />} />
          )}
        </Box>
      </DialogContent>
      <Actions busy={false} onClose={onClose} label="Merge" disabled={blocked} onSave={save} />
    </Dialog>
  );
}
