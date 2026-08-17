/**
 * ExitWorkerDialog.tsx — somebody left the firm.
 *
 * Deliberately separate from LeaveDialog, because leaving is not a long absence.
 * Modelled as an away interval it would keep them on the roster forever, still
 * in crew pickers, with their machine assignment never closing — so the machine
 * would keep crew that had left.
 *
 * Backdatable: resignations are reported after the fact, and the exit instant is
 * what every open interval gets closed at.
 *
 * Reversible: if they rejoin, Reactivate puts them back. Their old intervals
 * stay closed — that is the history of the first stint, and reopening them would
 * claim they never left.
 */

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';

import { exitWorker, reactivateWorker, type Worker } from '../api/workers';
import { useToast } from './Toast';
import { backendMessage } from '../utils/backendMessage';
import { DialogCloseButton } from './FormDialog';

const nowLocalDatetime = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ExitWorkerDialog({ worker, open, onClose, onSaved }: {
  worker: Worker | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [at, setAt] = useState(nowLocalDatetime());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const rejoining = !!worker && (!worker.active || !!worker.exitedAt);

  useEffect(() => {
    if (open) { setAt(nowLocalDatetime()); setNote(''); setErr(''); }
  }, [open]);

  if (!worker) return null;

  async function submit() {
    setSaving(true); setErr('');
    try {
      if (rejoining) {
        await reactivateWorker(worker!.id);
        toast(`${worker!.name} is back on the roster.`, 'success');
      } else {
        const res = await exitWorker(worker!.id, {
          at: new Date(at).toISOString(), note: note.trim() || undefined,
        });
        const closed = (res.assignmentsClosed ?? 0) + (res.shiftsClosed ?? 0);
        toast(
          `${worker!.name} marked inactive${closed ? ` — ${closed} open record${closed === 1 ? '' : 's'} closed` : ''}.`,
          'success',
        );
      }
      onSaved(); onClose();
    } catch (e) {
      setErr(backendMessage(e, 'Failed to save.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} disabled={saving} />
      <DialogTitle>{rejoining ? `Reactivate ${worker.name}?` : `Mark ${worker.name} inactive`}</DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error" onClose={() => setErr('')}>{err}</Alert>}

        {rejoining ? (
          <>
            <Typography sx={{ fontSize: 13 }}>
              Puts {worker.name} back on the roster so they can be assigned again.
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              Their previous machine and shift records stay closed — that is the history of
              their first stint. Assign them to a machine and a shift to start the new one.
            </Typography>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 13 }}>
              For somebody who has left the firm. For a day off or a few hours, use
              <strong> Leave</strong> instead.
            </Typography>

            <TextField
              type="datetime-local" size="small" fullWidth label="Left on"
              InputLabelProps={{ shrink: true }}
              value={at} onChange={(e) => setAt(e.target.value)}
              helperText="Can be backdated — resignations are usually recorded late"
            />
            <TextField size="small" fullWidth label="Note (optional)"
              value={note} onChange={(e) => setNote(e.target.value)} />

            <Box sx={{ bgcolor: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)', p: 1.25 }}>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                Their open machine assignment and shift are closed at that time, so the machine
                stops counting them as crew from then on. Everything before it is kept — they
                still show as having been there.
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>
                Reversible: if they rejoin, reactivate them from this same button.
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          size="small" variant="contained" color={rejoining ? 'primary' : 'warning'}
          onClick={submit} disabled={saving}
        >
          {saving ? 'Saving…' : rejoining ? 'Reactivate' : 'Mark inactive'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
