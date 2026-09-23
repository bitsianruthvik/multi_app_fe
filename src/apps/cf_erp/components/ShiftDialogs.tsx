import { useEffect, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { CalendarException, Machine, MachineShift, Weekday } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { WEEKDAYS, WEEKDAY_SHORT } from '../lib/inventory';
import { ErrorNotice } from './ui';
import { DialogHeader } from './FormDialog';
import { enterSubmits } from '../lib/dialog';

function Actions({ busy, onClose, onSave, label, disabled }: { busy: boolean; onClose: () => void; onSave: () => void; label: string; disabled?: boolean }) {
  return (
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="contained" onClick={onSave} disabled={busy || disabled} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : label}</Button>
    </DialogActions>
  );
}

function useRun(onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); setBusy(false); onDone(); onClose(); } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  return { busy, error, setError, run };
}

/** Adds or edits one of a machine's weekly shifts. End before start = it runs past midnight. */
export function ShiftDialog({ open, machineId, existing, onClose, onSaved }: { open: boolean; machineId: number; existing: MachineShift | null; onClose: () => void; onSaved: () => void }) {
  const blank = { name: 'Day', weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as Weekday[], startTime: '08:00', endTime: '16:00', breakMinutes: '30', effectiveFrom: '', effectiveTo: '', notes: '' };
  const [f, setF] = useState(blank);
  const r = useRun(onSaved, onClose);
  useEffect(() => {
    if (!open) return;
    r.setError(null);
    setF(existing ? {
      name: existing.name, weekdays: existing.weekdays, startTime: existing.startTime, endTime: existing.endTime, breakMinutes: String(existing.breakMinutes),
      effectiveFrom: existing.effectiveFrom ?? '', effectiveTo: existing.effectiveTo ?? '', notes: existing.notes ?? '',
    } : blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing]);
  const crosses = f.endTime && f.startTime && f.endTime <= f.startTime;
  const body = { ...f, breakMinutes: Number(f.breakMinutes) || 0, effectiveFrom: f.effectiveFrom || null, effectiveTo: f.effectiveTo || null, notes: f.notes || null };
  const save = () => r.run(() => (existing ? cfApi.put(`/machine-shifts/${existing.id}`, body) : cfApi.post(`/machines/${machineId}/shifts`, body)));
  return (
    <Dialog open={open} onClose={() => !r.busy && onClose()} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, r.busy)}>
      <DialogHeader title={existing ? `Edit the ${existing.name} shift` : 'Add a shift'} onClose={onClose} busy={r.busy}
        subtitle="A weekly pattern for this machine. End before start means it runs past midnight." />
      <DialogContent>
        <ErrorNotice error={r.error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <TextField label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} helperText="Day, Night, General…" />
          <Box>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 0.5 }}>Days it starts on</Typography>
            <ToggleButtonGroup size="small" value={f.weekdays} onChange={(_, v: Weekday[]) => setF({ ...f, weekdays: WEEKDAYS.filter((d) => v.includes(d)) })} aria-label="Days" sx={{ flexWrap: 'wrap' }}>
              {WEEKDAYS.map((d) => <ToggleButton key={d} value={d} sx={{ minWidth: 48 }}>{WEEKDAY_SHORT[d]}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            <TextField type="time" label="Start" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} InputLabelProps={{ shrink: true }} />
            <TextField type="time" label="End" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} InputLabelProps={{ shrink: true }}
              helperText={crosses ? 'Next day — it runs past midnight' : ' '} />
            <TextField type="number" label="Break (min)" value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: e.target.value })} inputProps={{ min: 0 }} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
            <TextField type="date" label="Valid from" value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Empty: always" />
            <TextField type="date" label="Valid to" value={f.effectiveTo} onChange={(e) => setF({ ...f, effectiveTo: e.target.value })} InputLabelProps={{ shrink: true }} helperText="Empty: open-ended" />
          </Box>
          <TextField label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} multiline />
        </Box>
      </DialogContent>
      <Actions busy={r.busy} onClose={onClose} label={existing ? 'Save shift' : 'Add shift'} onSave={save} />
    </Dialog>
  );
}

/** Replaces this machine's shifts with another machine's — for a second machine that works the same hours. */
export function CopyShiftsDialog({ open, machine, current, onClose, onSaved }: { open: boolean; machine: Machine; current: number; onClose: () => void; onSaved: () => void }) {
  const machines = useLoad(() => cfApi.get<Machine[]>('/machines'), []);
  const [fromId, setFromId] = useState<number | null>(null);
  const r = useRun(onSaved, onClose);
  useEffect(() => { if (open) { setFromId(null); r.setError(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const options = (machines.data ?? []).filter((m) => m.id !== machine.id);
  const save = () => r.run(() => cfApi.post(`/machines/${machine.id}/shifts/copy`, { fromMachineId: fromId }));
  return (
    <Dialog open={open} onClose={() => !r.busy && onClose()} maxWidth="xs" fullWidth onKeyDown={enterSubmits(save, r.busy || !fromId)}>
      <DialogHeader title={`Copy shifts to ${machine.code}`} onClose={onClose} busy={r.busy} />
      <DialogContent>
        <ErrorNotice error={r.error} />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
          {current ? `Its ${current} shift${current === 1 ? '' : 's'} are replaced` : 'It has no shifts yet'} by copies of the other machine’s. Day exceptions are not copied.
        </Typography>
        <Autocomplete size="small" options={options} value={options.find((m) => m.id === fromId) ?? null} getOptionLabel={(m) => `${m.code} · ${m.name}`}
          isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, m) => setFromId(m?.id ?? null)} renderInput={(p) => <TextField {...p} label="Copy from" autoFocus />} />
      </DialogContent>
      <Actions busy={r.busy} onClose={onClose} label="Copy shifts" disabled={!fromId} onSave={save} />
    </Dialog>
  );
}

type ClosedScope = 'day' | 'shift' | 'part';

/** Changes one day: a day off, one shift off, a stoppage, or extra time. */
export function ExceptionDialog({ open, machineId, shifts, onClose, onSaved }: { open: boolean; machineId: number; shifts: MachineShift[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [date, setDate] = useState(iso);
  const [kind, setKind] = useState<CalendarException['kind']>('closed');
  const [scope, setScope] = useState<ClosedScope>('day');
  const [shiftId, setShiftId] = useState<number | ''>('');
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('14:00');
  const [reason, setReason] = useState('');
  const r = useRun(onSaved, onClose);
  useEffect(() => {
    if (!open) return;
    r.setError(null); setDate(iso); setKind('closed'); setScope('day'); setShiftId(shifts[0]?.id ?? ''); setStart('10:00'); setEnd('14:00'); setReason('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const body = kind === 'extra'
    ? { date, kind, startTime: start, endTime: end, reason: reason || null }
    : { date, kind, reason: reason || null, ...(scope === 'shift' ? { shiftId } : scope === 'part' ? { startTime: start, endTime: end } : {}) };
  const times = kind === 'extra' || scope === 'part';
  const save = () => r.run(() => cfApi.post(`/machines/${machineId}/exceptions`, body));
  return (
    <Dialog open={open} onClose={() => !r.busy && onClose()} maxWidth="sm" fullWidth onKeyDown={enterSubmits(save, r.busy || !date)}>
      <DialogHeader title="Change one day" onClose={onClose} busy={r.busy}
        subtitle="A day off, one shift off, a stoppage, or extra time outside the shifts." />
      <DialogContent>
        <ErrorNotice error={r.error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <TextField type="date" label="Date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }}
            helperText="A shift belongs to the day it starts — a night shift is changed on its first day" />
          <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v) => v && setKind(v)} aria-label="Kind">
            <ToggleButton value="closed">Not working</ToggleButton>
            <ToggleButton value="extra">Extra time</ToggleButton>
          </ToggleButtonGroup>
          {kind === 'closed' && (
            <TextField select label="What stops" value={scope} onChange={(e) => setScope(e.target.value as ClosedScope)}>
              <MenuItem value="day">The whole day (holiday, maintenance)</MenuItem>
              <MenuItem value="shift" disabled={!shifts.length}>One shift</MenuItem>
              <MenuItem value="part">Part of the day (a breakdown)</MenuItem>
            </TextField>
          )}
          {kind === 'closed' && scope === 'shift' && (
            <TextField select label="Shift" value={shiftId} onChange={(e) => setShiftId(Number(e.target.value))}>
              {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.name} · {s.startTime}–{s.endTime}</MenuItem>)}
            </TextField>
          )}
          {times && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
              <TextField type="time" label="From" value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField type="time" label="To" value={end} onChange={(e) => setEnd(e.target.value)} InputLabelProps={{ shrink: true }}
                helperText={end <= start ? 'Next day' : kind === 'extra' ? 'Outside the shifts' : ' '} />
            </Box>
          )}
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === 'extra' ? 'Rush order' : 'Holiday, breakdown, no operator…'} />
        </Box>
      </DialogContent>
      <Actions busy={r.busy} onClose={onClose} label="Save" disabled={!date} onSave={save} />
    </Dialog>
  );
}
