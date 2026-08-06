/**
 * LeaveDialog.tsx — one person is away, for a day / half a day / a couple of hours.
 *
 * All three write the SAME thing: an `away` interval on fab_worker_assignments.
 * "Off today", "half day" and "left an hour early" are the same fact at three
 * scales, and collapsing them into three different mechanisms is what the old
 * `absent_on DATE` column did wrong — it could express the first and neither of
 * the others.
 *
 * HALF-DAY TIMES ARE DERIVED FROM THEIR SHIFT, THEN LEFT EDITABLE. Picking
 * "first half" only means something if the system knows where the halves are, so
 * the boundary is computed from the person's own shift for that date — but the
 * resulting times are shown in editable fields, because a real half day is
 * whenever they actually walked out, not the arithmetic midpoint.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';

import { setAway, type Worker } from '../api/workers';
import { useToast } from './Toast';
import { backendMessage } from '../utils/backendMessage';

const REASONS = [
  { value: 'leave', label: 'Leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'permission', label: 'Permission (personal)' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

type Mode = 'full' | 'half' | 'hours';
type Half = 'first' | 'second';

const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : '');
const toMin = (t: string) => {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
};
const fromMin = (m: number) => {
  const wrapped = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/**
 * Where the working day splits, from the shift itself. A shift crossing midnight
 * has its end rolled forward before halving, or the midpoint of 22:00→06:00
 * would land at 14:00 — the middle of the day they are not working.
 */
function shiftHalves(start?: string | null, end?: string | null) {
  const s = hhmm(start) || '08:00';
  const e = hhmm(end) || '17:00';
  const sMin = toMin(s);
  const eMin = toMin(e) <= sMin ? toMin(e) + 1440 : toMin(e);
  const mid = fromMin(Math.round((sMin + eMin) / 2));
  return { start: s, end: fromMin(eMin), mid };
}

export function LeaveDialog({ worker, open, onClose, onSaved }: {
  worker: Worker | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('full');
  const [half, setHalf] = useState<Half>('first');
  const [date, setDate] = useState(todayYMD());
  const [toDate, setToDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('leave');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const halves = useMemo(
    () => shiftHalves(worker?.currentShiftStart, worker?.currentShiftEnd),
    [worker?.currentShiftStart, worker?.currentShiftEnd],
  );

  useEffect(() => {
    if (!open) return;
    setMode('full'); setHalf('first'); setDate(todayYMD()); setToDate('');
    setReason('leave'); setNote(''); setErr('');
    setFrom(halves.mid); setTo(halves.end);
  }, [open, halves.mid, halves.end]);

  // Choosing a half rewrites the times; they stay editable afterwards.
  useEffect(() => {
    if (mode !== 'half') return;
    if (half === 'first') { setFrom(halves.start); setTo(halves.mid); }
    else { setFrom(halves.mid); setTo(halves.end); }
  }, [mode, half, halves.start, halves.mid, halves.end]);

  useEffect(() => {
    if (mode === 'hours' && !from) { setFrom(halves.mid); setTo(halves.end); }
  }, [mode, from, halves.mid, halves.end]);

  if (!worker) return null;

  const noShift = !worker.currentShiftName;

  async function save() {
    setSaving(true); setErr('');
    try {
      let fromIso: string;
      let toIso: string | null;

      if (mode === 'full') {
        // Whole days, midnight to midnight. A range ends at the START of the day
        // after the last day off, so "10th to 12th" covers all of the 12th.
        const last = toDate || date;
        fromIso = new Date(`${date}T00:00:00`).toISOString();
        const end = new Date(`${last}T00:00:00`);
        end.setDate(end.getDate() + 1);
        toIso = end.toISOString();
      } else {
        if (!from || !to) { setErr('Both times are required.'); setSaving(false); return; }
        // Times are local wall clock at the person; a half day that crosses
        // midnight (night shift, second half) ends on the following day.
        const f = new Date(`${date}T${from}:00`);
        const t = new Date(`${date}T${to}:00`);
        if (t <= f) t.setDate(t.getDate() + 1);
        fromIso = f.toISOString(); toIso = t.toISOString();
      }

      await setAway(worker!.id, { from: fromIso, to: toIso, reason, note: note.trim() || undefined });
      toast(`${worker!.name} marked away.`, 'success');
      onSaved(); onClose();
    } catch (e) {
      setErr(backendMessage(e, 'Failed to record the time away.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        {worker.name} — time away
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.25 }}>
          {worker.currentShiftName
            ? `${worker.currentShiftName} · ${halves.start}–${hhmm(worker.currentShiftEnd)}`
            : 'No shift set for this person'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error" onClose={() => setErr('')}>{err}</Alert>}

        <ToggleButtonGroup
          exclusive size="small" value={mode} fullWidth
          onChange={(_, v: Mode | null) => v && setMode(v)}
        >
          <ToggleButton value="full">Full day</ToggleButton>
          <ToggleButton value="half">Half day</ToggleButton>
          <ToggleButton value="hours">A few hours</ToggleButton>
        </ToggleButtonGroup>

        {mode === 'half' && (
          <ToggleButtonGroup
            exclusive size="small" value={half} fullWidth
            onChange={(_, v: Half | null) => v && setHalf(v)}
          >
            <ToggleButton value="first">First half away ({halves.start}–{halves.mid})</ToggleButton>
            <ToggleButton value="second">Second half away ({halves.mid}–{halves.end})</ToggleButton>
          </ToggleButtonGroup>
        )}

        {mode === 'half' && noShift && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            No shift is set for {worker.name}, so the halves are a guess from a standard
            08:00–17:00 day. Set their shift, or edit the times below.
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField
            type="date" size="small" fullWidth
            label={mode === 'full' ? 'From date' : 'Date'}
            InputLabelProps={{ shrink: true }}
            value={date} onChange={(e) => setDate(e.target.value)}
          />
          {mode === 'full' && (
            <TextField
              type="date" size="small" fullWidth label="To date (optional)"
              InputLabelProps={{ shrink: true }}
              value={toDate} onChange={(e) => setToDate(e.target.value)}
              helperText="Leave blank for a single day"
            />
          )}
        </Box>

        {mode !== 'full' && (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              type="time" size="small" fullWidth label="Away from"
              InputLabelProps={{ shrink: true }}
              value={from} onChange={(e) => setFrom(e.target.value)}
            />
            <TextField
              type="time" size="small" fullWidth label="Back at"
              InputLabelProps={{ shrink: true }}
              value={to} onChange={(e) => setTo(e.target.value)}
              helperText={to && from && to <= from ? 'Runs past midnight' : ' '}
            />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField select size="small" fullWidth label="Reason"
            value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </TextField>
          <TextField size="small" fullWidth label="Note (optional)"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </Box>

        {/*
          Says what this does downstream. Time away removes that person's hours
          from the machines they are on, which is the whole reason it is worth
          recording — and it is NOT a measure of the person.
        */}
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
          Recorded against the day, not against {worker.name}. It removes their hours from
          the machines they are on for that period; if a machine is left with nobody, its
          idle time is recorded as “no operator”.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Mark away'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
