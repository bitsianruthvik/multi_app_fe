import { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, MenuItem, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Formula, TimingRule, Tree } from '../api/types';
import { allMachines } from '../api/machines';
import { useLoad } from '../hooks/useLoad';
import { ClassificationPicker } from './ClassificationPicker';
import { ErrorNotice, Mono } from './ui';
import { DialogHeader } from './FormDialog';
import { TimeBuilder } from './FormulaBuilder/TimeBuilder';
import { formulaInWords } from '../lib/formulaBuilder';
import { useIsPermitted } from '../hooks/useIsPermitted';

type TimeMode = 'minutes' | 'formula';
interface TimeForm { mode: TimeMode; minutes: string; formulaId: number | null }
const timeForm = (minutes: number | null | undefined, formulaId: number | null | undefined): TimeForm =>
  ({ mode: formulaId ? 'formula' : 'minutes', minutes: minutes != null ? String(minutes) : '', formulaId: formulaId ?? null });

function TimeInput({ label, help, value, onChange, formulas, onBuild }: {
  label: string; help: string; value: TimeForm; onChange: (v: TimeForm) => void; formulas: Formula[];
  /** Opens the time builder for this time (rate × quantity, templates, live preview). */
  onBuild?: () => void;
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{label}</Typography>
        <ToggleButtonGroup exclusive size="small" value={value.mode} onChange={(_, m) => m && onChange({ ...value, mode: m })} aria-label={`${label} as`}>
          <ToggleButton value="minutes">Minutes</ToggleButton>
          <ToggleButton value="formula">Formula</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {value.mode === 'minutes' ? (
        <TextField fullWidth type="number" value={value.minutes} onChange={(e) => onChange({ ...value, minutes: e.target.value })} helperText={help}
          InputProps={{ endAdornment: <Mono muted>min</Mono> }} inputProps={{ min: 0, step: 'any' }} />
      ) : (
        <TextField select fullWidth value={value.formulaId ?? ''} onChange={(e) => onChange({ ...value, formulaId: Number(e.target.value) || null })}
          helperText={(() => { const f = formulas.find((x) => x.id === value.formulaId); return f ? (formulaInWords(f.expression) ?? f.expression) : (formulas.length ? help : 'No timing formula yet — build one with the time builder.'); })()}>
          {formulas.map((f) => <MenuItem key={f.id} value={f.id}>{f.name} ({f.code})</MenuItem>)}
        </TextField>
      )}
      {onBuild && (
        <Button size="small" onClick={onBuild} sx={{ mt: 0.5 }} data-testid={`build-${label}`}>Open the time builder…</Button>
      )}
    </Box>
  );
}

/**
 * Adds or edits a timing rule of an operation: for a machine type (any level of
 * a machine family) or for one machine, whether it can do the operation, and
 * its setup (per run) and work (per piece) times. Who a rule is for is fixed.
 */
export function TimingRuleDialog({ open, operationId, operation, existing, tree, onClose, onSaved }: {
  open: boolean;
  operationId: number;
  /** For the time builder's suggested formula codes; without it the builder is not offered. */
  operation?: { id: number; code: string; name: string };
  existing: TimingRule | null;
  tree: Tree | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const machines = useLoad(() => allMachines(), []);
  const formulas = useLoad(() => cfApi.get<Formula[]>('/formulas'), []);
  const timing = (formulas.data ?? []).filter((f) => f.status === 'active' && f.kind === 'timing');
  const canMakeFormula = useIsPermitted()('cf_erp_setup_manage');
  // Which time the builder was opened for, so its result lands in that field.
  const [buildFor, setBuildFor] = useState<'setup' | 'work' | null>(null);
  const [subjectType, setSubjectType] = useState<'classification' | 'machine'>('classification');
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [eligible, setEligible] = useState(true);
  const [setup, setSetup] = useState<TimeForm>(timeForm(null, null));
  const [work, setWork] = useState<TimeForm>(timeForm(null, null));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubjectType(existing?.subject.type ?? 'classification');
    setNodeId(existing?.subject.type === 'classification' ? existing.subject.id : null);
    setMachineId(existing?.subject.type === 'machine' ? existing.subject.id : null);
    setEligible(existing?.eligible ?? true);
    setSetup(timeForm(existing?.setup?.minutes, existing?.setup?.formula?.id));
    setWork(timeForm(existing?.work?.minutes, existing?.work?.formula?.id));
    setFrom(existing?.effectiveFrom ?? '');
    setTo(existing?.effectiveTo ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const toBody = (t: TimeForm, prefix: 'setup' | 'work') => (t.mode === 'minutes'
    ? { [`${prefix}Minutes`]: t.minutes === '' ? null : Number(t.minutes), [`${prefix}FormulaId`]: null }
    : { [`${prefix}Minutes`]: null, [`${prefix}FormulaId`]: t.formulaId });
  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      eligible, ...(eligible ? { ...toBody(setup, 'setup'), ...toBody(work, 'work') } : {}),
      effectiveFrom: from || null, effectiveTo: to || null, notes: notes || null,
    };
    try {
      if (existing) await cfApi.put(`/operation-rules/${existing.id}`, body);
      else await cfApi.post(`/operations/${operationId}/rules`, { ...body, subjectType, subjectId: subjectType === 'machine' ? machineId : nodeId });
      setBusy(false); onSaved(); onClose();
    } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  const machineOptions = machines.data ?? [];
  const chosenMachine = machineOptions.find((m) => m.id === machineId) ?? null;
  const ready = existing || (subjectType === 'machine' ? machineId : nodeId);

  return (
    <>
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>{existing ? 'Edit timing rule' : 'Add a timing rule'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13, mb: 2 }}>
          The most specific rule wins: a machine’s own rule beats its type, which beats the level above it.
        </Typography>
        {/* Why the pickers below are empty, when they are — a silent 403 on the
            formula or machine list used to read as "there are none yet". */}
        <ErrorNotice error={formulas.error ?? machines.error} />
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gap: 2 }}>
          <ToggleButtonGroup exclusive size="small" value={subjectType} disabled={!!existing} onChange={(_, v) => v && setSubjectType(v)} aria-label="Rule for">
            <ToggleButton value="classification">A machine type</ToggleButton>
            <ToggleButton value="machine">One machine</ToggleButton>
          </ToggleButtonGroup>
          {subjectType === 'classification' ? (
            <ClassificationPicker tree={tree} scope="machine" leafOnly={false} value={nodeId} onChange={setNodeId} disabled={!!existing}
              label="Machine type or group" helperText="A group (e.g. Cutting) covers every type under it" />
          ) : (
            <Autocomplete size="small" options={machineOptions} value={chosenMachine} disabled={!!existing} loading={machines.loading}
              getOptionLabel={(m) => `${m.code} · ${m.name}${m.status === 'inactive' ? ' · inactive' : ''}`} isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="No machines yet — add one under Production › Machines"
              onChange={(_, m) => setMachineId(m?.id ?? null)}
              renderInput={(p) => <TextField {...p} label="Machine"
                helperText={chosenMachine?.status === 'inactive' ? 'This machine is inactive, so the rule has no effect until it is active again' : ' '} />} />
          )}
          <FormControlLabel control={<Switch checked={eligible} onChange={(e) => setEligible(e.target.checked)} />}
            label={eligible ? 'Can do this operation' : 'Kept out of this operation — e.g. a light-duty set that must not weld girders'} />
          {eligible && (
            <>
              <TimeInput label="Setup, per run" help="Once per batch of pieces; leave empty for none" value={setup} onChange={setSetup} formulas={timing} onBuild={operation ? () => setBuildFor('setup') : undefined} />
              <TimeInput label="Work, per piece" help="Times the quantity" value={work} onChange={setWork} formulas={timing} onBuild={operation ? () => setBuildFor('work') : undefined} />
            </>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField type="date" label="Valid from" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} helperText="Empty: always" />
            <TextField type="date" label="Valid to" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} helperText="Empty: open-ended" />
          </Box>
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !ready} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save rule' : 'Add rule'}</Button>
      </DialogActions>
    </Dialog>
    {operation && buildFor && (
      <TimeBuilder open={!!buildFor} onClose={() => setBuildFor(null)} operation={operation} which={buildFor}
        subject={subjectType === 'machine' ? (machineId ? { type: 'machine', id: machineId, label: chosenMachine?.code ?? null } : null) : (nodeId ? { type: 'classification', id: nodeId } : null)}
        current={(() => { const t = buildFor === 'setup' ? setup : work; const f = formulas.data?.find((x) => x.id === t.formulaId); return t.mode === 'formula' ? (f ? { minutes: null, formula: { id: f.id, code: f.code, expression: f.expression } } : null) : t.minutes !== '' ? { minutes: Number(t.minutes), formula: null } : null; })()}
        ruleSetup={buildFor === 'work' && setup.mode === 'minutes' ? { minutes: setup.minutes === '' ? null : Number(setup.minutes), formula: null } : null}
        ruleUsesCurrent={!!existing}
        formulas={formulas.data ?? []} canMakeFormula={canMakeFormula} onFormulasChanged={formulas.reload}
        onAssign={(a) => {
          const set = buildFor === 'setup' ? setSetup : setWork;
          set(a.formulaId ? { mode: 'formula', minutes: '', formulaId: a.formulaId } : { mode: 'minutes', minutes: a.minutes == null ? '' : String(a.minutes), formulaId: null });
          if (buildFor === 'work' && a.setupMinutes !== undefined) setSetup({ mode: 'minutes', minutes: a.setupMinutes == null ? '' : String(a.setupMinutes), formulaId: null });
        }} />
    )}
    </>
  );
}
