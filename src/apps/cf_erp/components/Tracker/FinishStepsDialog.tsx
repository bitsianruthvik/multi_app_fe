import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, TextField, Typography } from '@mui/material';
import { cfApi, LONG_WRITE_MS, type CfApiError } from '../../api/client';
import type { TrackerStepRow } from '../../api/types';
import { ErrorNotice, Mono } from '../ui';
import { FINISH_BATCH, finishInParts, finishSentence, type FinishAnswer, type FinishOutcome } from '../../lib/finishSteps';

/**
 * FINISH SELECTED (2026-10-31) — for a production manager catching up, or entering a job at go-live: every chosen
 * step is started (if it is not) and finished with what is left of it good, through the tracker's own rules, one
 * step at a time on the server, in the order their waits allow. One refusal does not undo the others; the answer
 * lists them with the reason. The floor's own Machine log is not this.
 */
export function FinishStepsDialog({ steps, onClose, onDone }: {
  /** The steps chosen, in the order the list shows them (null = shut). */
  steps: TrackerStepRow[] | null;
  onClose: () => void;
  /** Something was finished: the list reads again. */
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<FinishOutcome | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (steps) { setNote(''); setOutcome(null); setError(null); setProgress(null); } }, [steps]);
  const open = !!steps;
  const list = steps ?? [];
  const todo = list.filter((s) => s.status !== 'done');
  const waiting = todo.filter((s) => s.status === 'not_ready' || s.status === 'on_hold').length;
  const parts = Math.ceil(todo.length / FINISH_BATCH);

  const run = async () => {
    setBusy(true); setError(null); setProgress({ done: 0, total: todo.length });
    try {
      const out = await finishInParts(todo.map((s) => s.id),
        (ids) => cfApi.post<FinishAnswer>('/production-steps/finish', { stepIds: ids, ...(note.trim() ? { note: note.trim() } : {}) }, { timeoutMs: LONG_WRITE_MS }),
        (done, total) => setProgress({ done, total }));
      setOutcome(out);
      if (out.done.length) onDone();
    } catch (e) { setError(e as CfApiError); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{outcome ? 'Finished' : `Finish ${todo.length} step${todo.length === 1 ? '' : 's'}`}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
        <ErrorNotice error={error} />
        {!outcome ? (
          <>
            <Typography sx={{ fontSize: 13.5 }}>
              Each step is started (if it is not) and finished with what is left of it good — as if it were recorded by hand,
              with every rule of the tracker. Steps that wait for others of this selection go after them. A step that cannot be
              finished is said, with why, and the others still are.
            </Typography>
            {waiting > 0 && <Alert severity="info">{`${waiting} of them wait now — for earlier steps (done first if they are in the selection), material or a hold.`}</Alert>}
            {list.length > todo.length && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{`${list.length - todo.length} already done — left out.`}</Typography>}
            {parts > 1 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{`Sent in ${parts} parts of up to ${FINISH_BATCH}. This is for catching up; it can take a few minutes.`}</Typography>}
            <TextField label="Note on every step (optional)" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} size="small" />
            {busy && progress && (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                <LinearProgress variant={progress.done ? 'determinate' : 'indeterminate'} value={(100 * progress.done) / Math.max(1, progress.total)} />
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{`${progress.done} of ${progress.total} finished so far…`}</Typography>
              </Box>
            )}
          </>
        ) : (
          <>
            <Alert severity={outcome.refused.length ? (outcome.done.length ? 'warning' : 'error') : 'success'} data-testid="finish-outcome">{finishSentence(outcome)}</Alert>
            {outcome.refused.length > 0 && (
              <Box component="ul" data-testid="finish-refused" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, maxHeight: 320, overflow: 'auto', fontSize: 13, overflowWrap: 'anywhere' }}>
                {outcome.refused.map((r) => (
                  <li key={r.stepId}><Mono>{r.label ?? `step ${r.stepId}`}</Mono> — {r.reason}</li>
                ))}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {outcome ? <Button variant="contained" onClick={onClose}>Close</Button> : (
          <>
            <Button onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="contained" onClick={() => { void run(); }} disabled={busy || !todo.length} data-testid="finish-run">
              {busy ? 'Finishing…' : `Finish ${todo.length}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
