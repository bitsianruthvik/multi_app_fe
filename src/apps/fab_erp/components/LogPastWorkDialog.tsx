/**
 * LogPastWorkDialog — EU-11: backfill a task's start/pause/complete times
 * after the fact, for shop-floor work that wasn't tracked live via the
 * Start/Pause/Stop buttons. Posts through POST /tasks/:id/events/backfill
 * (EU-10; see api/client.ts `backfillTaskWork`).
 *
 * Two entry points from TaskQueue's TaskRow, same dialog either way:
 *   - "Log past work" on eligible/paused tasks — form starts mostly blank.
 *   - "Adjust times" on done tasks — prefilled from the task's existing
 *     startedAt/completedAt.
 *
 * Form shape follows how people actually remember work: a date, a start
 * time, then EITHER a duration chip (30m/1h/2h/4h/Custom) OR an explicit end
 * time — never both at once. Duration mode computes completed_at as
 * start + duration (handles rolling past midnight); end-time mode combines
 * the chosen time with the same date field. That single shared date field is
 * a deliberate simplification: a work session that starts one calendar day
 * and ends the next can only be captured via duration mode (elapsed minutes
 * survive the rollover); end-time mode assumes same-day. Shop-floor shifts
 * are effectively always same-day, so this covers the common case without a
 * second date picker the ticket didn't ask for.
 *
 * On success with `warnings.length === 0` this closes immediately (toast).
 * On success with warnings, it stays open and shows them as non-blocking
 * amber advisories with a single "Done" action — the write already
 * happened, warnings are just FYI. On a 400, the message is shown inline
 * and the dialog stays open so the user can fix the offending field.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import { backfillTaskWork, type BackfillPause } from '../api/client';
import { FacetChip } from './FilterBar';
import { useToast } from './Toast';

export interface LogPastWorkTask {
  id: number;
  operationName: string | null;
  operationId: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface LogPastWorkDialogProps {
  open: boolean;
  task: LogPastWorkTask | null;
  /** 'log' = "Log past work" (eligible/paused tasks); 'adjust' = "Adjust times" (done tasks). Only affects title/copy. */
  mode: 'log' | 'adjust';
  onClose: () => void;
  /** Called after a successful save (with or without warnings) so the caller can refetch. */
  onSaved: () => void;
}

type EndMode = 'duration' | 'endtime';

const DURATION_CHIPS: Array<{ label: string; minutes: number | 'custom' }> = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: 'Custom', minutes: 'custom' },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowTimeStr(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Split a backend datetime string into local {date, time} for the two native inputs. Returns null if unparseable/absent. */
function splitDatetime(value: string | null): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Combine a date input value and time input value into the naive datetime string the backend expects. */
function combine(date: string, time: string): string {
  return `${date}T${time}:00`;
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function errMsg(e: unknown, fallback: string): string {
  const ax = e as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.message ?? fallback;
}

export function LogPastWorkDialog({ open, task, mode, onClose, onSaved }: LogPastWorkDialogProps) {
  const { toast } = useToast();

  const [date, setDate] = useState(todayStr());
  const [startTime, setStartTime] = useState(nowTimeStr());
  const [endMode, setEndMode] = useState<EndMode>('duration');
  const [durationMinutes, setDurationMinutes] = useState<number | 'custom' | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [endTime, setEndTime] = useState('');
  const [addBreak, setAddBreak] = useState(false);
  const [pauseTime, setPauseTime] = useState('');
  const [resumeTime, setResumeTime] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedWarnings, setSavedWarnings] = useState<string[] | null>(null);

  // Reset/prefill whenever the dialog opens for a (possibly new) task.
  useEffect(() => {
    if (!open || !task) return;
    const startSplit = splitDatetime(task.startedAt);
    const endSplit = splitDatetime(task.completedAt);

    setDate(startSplit?.date ?? todayStr());
    setStartTime(startSplit?.time ?? nowTimeStr());

    if (endSplit) {
      setEndMode('endtime');
      setEndTime(endSplit.time);
    } else {
      setEndMode('duration');
      setEndTime('');
    }
    setDurationMinutes(null);
    setCustomMinutes('');
    setAddBreak(false);
    setPauseTime('');
    setResumeTime('');
    setNote('');
    setError('');
    setSavedWarnings(null);
  }, [open, task]);

  const title = mode === 'adjust' ? 'Adjust times' : 'Log past work';
  const taskLabel = task?.operationName ?? `Operation #${task?.operationId ?? '?'}`;

  /** completed_at, if the user gave us enough to compute one — undefined leaves the task in_progress (backend default). */
  function computeCompletedAt(): string | undefined {
    if (endMode === 'duration') {
      let mins: number | null = null;
      if (durationMinutes === 'custom') {
        const n = Number(customMinutes);
        if (customMinutes.trim() !== '' && Number.isFinite(n) && n > 0) mins = n;
      } else if (typeof durationMinutes === 'number') {
        mins = durationMinutes;
      }
      if (mins == null) return undefined;
      const start = new Date(combine(date, startTime));
      if (Number.isNaN(start.getTime())) return undefined;
      return formatLocal(new Date(start.getTime() + mins * 60000));
    }
    // endtime mode
    if (!endTime) return undefined;
    return combine(date, endTime);
  }

  const requiredFieldsMissing = !date || !startTime;

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleDone = () => {
    setSavedWarnings(null);
    onSaved();
    onClose();
  };

  const handleSubmit = async () => {
    if (!task || requiredFieldsMissing) return;
    setSubmitting(true);
    setError('');
    try {
      const pauses: BackfillPause[] = [];
      if (addBreak && pauseTime) {
        pauses.push({
          paused_at: combine(date, pauseTime),
          ...(resumeTime ? { resumed_at: combine(date, resumeTime) } : {}),
        });
      }
      const completedAt = computeCompletedAt();

      const res = await backfillTaskWork(task.id, {
        started_at: combine(date, startTime),
        ...(completedAt ? { completed_at: completedAt } : {}),
        ...(pauses.length ? { pauses } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });

      if (res.warnings.length > 0) {
        setSavedWarnings(res.warnings);
      } else {
        toast('Work logged.', 'success');
        onSaved();
        onClose();
      }
    } catch (e) {
      setError(errMsg(e, 'Failed to log work.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{taskLabel}</Typography>

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        {savedWarnings && (
          <Alert severity="warning">
            Saved with {savedWarnings.length} {savedWarnings.length === 1 ? 'advisory' : 'advisories'}:
            <Box component="ul" sx={{ m: 0, pl: 2.5, mt: 0.5 }}>
              {savedWarnings.map((w, i) => (
                <li key={i}><Typography sx={{ fontSize: 12.5 }}>{w}</Typography></li>
              ))}
            </Box>
          </Alert>
        )}

        {!savedWarnings && (
          <>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="Date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                size="small"
                required
                fullWidth
                disabled={submitting}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Start time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                size="small"
                required
                fullWidth
                disabled={submitting}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
              />
            </Box>

            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.75 }}>
                How long / when it ended
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                fullWidth
                value={endMode}
                disabled={submitting}
                onChange={(_e, v: EndMode | null) => { if (v) setEndMode(v); }}
                sx={{ mb: 1.25 }}
              >
                <ToggleButton value="duration" sx={{ fontSize: 12.5, textTransform: 'none' }}>Duration</ToggleButton>
                <ToggleButton value="endtime" sx={{ fontSize: 12.5, textTransform: 'none' }}>End time</ToggleButton>
              </ToggleButtonGroup>

              {endMode === 'duration' ? (
                <Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {DURATION_CHIPS.map((c) => (
                      <FacetChip
                        key={c.label}
                        label={c.label}
                        active={durationMinutes === c.minutes}
                        onClick={submitting ? undefined : () => setDurationMinutes(c.minutes)}
                      />
                    ))}
                  </Box>
                  {durationMinutes === 'custom' && (
                    <TextField
                      label="Custom minutes"
                      type="number"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      size="small"
                      fullWidth
                      disabled={submitting}
                      sx={{ mt: 1.25 }}
                      slotProps={{ htmlInput: { min: 1, step: 1 } }}
                    />
                  )}
                </Box>
              ) : (
                <TextField
                  label="End time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={submitting}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
                />
              )}
              {!computeCompletedAt() && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.75 }}>
                  No end given — the task will be left in progress.
                </Typography>
              )}
            </Box>

            <Box>
              <FormControlLabel
                control={<Checkbox size="small" checked={addBreak} disabled={submitting} onChange={(e) => setAddBreak(e.target.checked)} />}
                label={<Typography sx={{ fontSize: 13 }}>Add a break</Typography>}
              />
              {addBreak && (
                <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
                  <TextField
                    label="Paused at"
                    type="time"
                    value={pauseTime}
                    onChange={(e) => setPauseTime(e.target.value)}
                    size="small"
                    fullWidth
                    disabled={submitting}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
                  />
                  <TextField
                    label="Resumed at (optional)"
                    type="time"
                    value={resumeTime}
                    onChange={(e) => setResumeTime(e.target.value)}
                    size="small"
                    fullWidth
                    disabled={submitting}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 60 } }}
                  />
                </Box>
              )}
            </Box>

            <TextField
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
              disabled={submitting}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        {savedWarnings ? (
          <Button onClick={handleDone} variant="contained">Done</Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSubmit} variant="contained" disabled={submitting || requiredFieldsMissing}>
              {submitting ? <CircularProgress size={18} /> : 'Save'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
