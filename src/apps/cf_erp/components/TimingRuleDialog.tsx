import { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, Switch,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { TimingRule, Tree } from '../api/types';
import { allMachines } from '../api/machines';
import { useLoad } from '../hooks/useLoad';
import { ClassificationPicker } from './ClassificationPicker';
import { ErrorNotice, Mono } from './ui';
import { DialogHeader } from './FormDialog';
import { TimeBuilder } from './FormulaBuilder/TimeBuilder';
import { timeShort, timeStartText } from '../lib/formulaBuilder';

/** One time of the rule: what it says now, in words, and a button that opens the time dialog. */
function TimeInput({ label, help, value, onBuild }: { label: string; help: string; value: string; onBuild: () => void }) {
  const text = value.trim();
  const words = text ? timeShort({ minutes: null, formula: { expression: text } }) : null;
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{label}</Typography>
        <Button size="small" onClick={onBuild} data-testid={`build-${label}`}>{text ? 'Change…' : 'Set…'}</Button>
      </Box>
      <Box sx={{ mt: 0.5, p: 1.25, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface-2)', minHeight: 40 }} data-testid={`time-${label}`}>
        {words ? (
          <>
            <Box sx={{ fontSize: 14 }}>{words}</Box>
            {words !== text && <Mono muted>{text}</Mono>}
          </>
        ) : <Box sx={{ fontSize: 14, color: 'var(--c-text-3)' }}>Not set</Box>}
      </Box>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>{help}</Typography>
    </Box>
  );
}

/**
 * Adds or edits a timing rule of an operation: for a machine type (any level of
 * a machine family) or for one machine, whether it can do the operation, and
 * its setup (per run) and work (per piece) times — each set in the time dialog, as a
 * formula (a number is a fixed time), stored on the rule itself. Who a rule is for is fixed.
 */
export function TimingRuleDialog({ open, operationId, operation, existing, tree, onClose, onSaved }: {
  open: boolean;
  operationId: number;
  /** The operation the rule belongs to — the time dialog reads its fields and sample pieces. */
  operation: { id: number; code: string; name: string };
  existing: TimingRule | null;
  tree: Tree | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const machines = useLoad(() => allMachines(), []);
  // Which time the builder was opened for, so its result lands in that field.
  const [buildFor, setBuildFor] = useState<'setup' | 'work' | null>(null);
  const [subjectType, setSubjectType] = useState<'classification' | 'machine'>('classification');
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [eligible, setEligible] = useState(true);
  const [setup, setSetup] = useState('');
  const [work, setWork] = useState('');
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
    setSetup(timeStartText(existing?.setup));
    setWork(timeStartText(existing?.work));
    setFrom(existing?.effectiveFrom ?? '');
    setTo(existing?.effectiveTo ?? '');
    setNotes(existing?.notes ?? '');
  }, [open, existing]);

  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      eligible, ...(eligible ? { setupExpression: setup.trim(), workExpression: work.trim() } : {}),
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
        {/* Why the picker below is empty, when it is — a silent 403 on the machine list used to read as "there are none yet". */}
        <ErrorNotice error={machines.error} />
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
              <TimeInput label="Setup, per run" help="Once per batch of pieces; leave empty for none" value={setup} onBuild={() => setBuildFor('setup')} />
              <TimeInput label="Work, per piece" help="Times the quantity" value={work} onBuild={() => setBuildFor('work')} />
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
    {buildFor && (
      <TimeBuilder open onClose={() => setBuildFor(null)} operation={operation} which={buildFor}
        subject={subjectType === 'machine' ? (machineId ? { type: 'machine', id: machineId, label: chosenMachine?.code ?? null } : null) : (nodeId ? { type: 'classification', id: nodeId } : null)}
        current={(() => { const t = (buildFor === 'setup' ? setup : work).trim(); return t ? { minutes: null, expression: t, formula: null } : null; })()}
        onSave={(expression) => { (buildFor === 'setup' ? setSetup : setWork)(expression); }} />
    )}
    </>
  );
}
