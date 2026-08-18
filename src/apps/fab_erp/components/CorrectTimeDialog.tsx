/**
 * CorrectTimeDialog — fix a start or finish time that was logged wrong.
 *
 * The one thing MachineTimeline could do that nothing else could. Timeline was
 * removed on 2026-08-18 because Shift Log covers everything else it did and
 * covers it better — per shift rather than per calendar day, with unaccounted
 * time called out — but correcting an already-logged span had no other home,
 * and without it a wrong start time could only be fixed in the database.
 *
 * It lives here rather than on the task card because the Shift Log is where
 * somebody is already looking at that hour and noticing it is wrong.
 *
 * NOT AN IN-PLACE EDIT. The endpoint inserts a superseding event and marks the
 * old one superseded, so the record still shows what was originally logged and
 * when it was changed. Timeline's drag-an-edge gesture is gone with it: a
 * pixel-per-minute drag is a guess, and typing 09:00 is what somebody actually
 * means.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, TextField, Typography,
} from '@mui/material';

import { fabGet, correctTaskEvent } from '../api/client';
import { backendMessage, useToast } from '../components';
import { DialogCloseButton } from './FormDialog';

interface LoggedEvent { id: number; eventType: 'started' | 'completed'; at: string }

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in LOCAL time; the API speaks UTC. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function CorrectTimeDialog({ open, taskId, taskLabel, onClose, onCorrected }: {
  open: boolean;
  taskId: number | null;
  taskLabel?: string;
  onClose: () => void;
  onCorrected?: () => void;
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState<LoggedEvent[]>([]);
  const [eventId, setEventId] = useState<number | ''>('');
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true); setError('');
    try {
      const res = await fabGet<{ events: LoggedEvent[] }>(`tasks/${taskId}/logged-times`);
      const list = res.events ?? [];
      setEvents(list);
      if (list.length) {
        setEventId(list[0].id);
        setAt(toLocalInput(list[0].at));
      }
    } catch (e) {
      setError(backendMessage(e, 'Could not read this task’s logged times.'));
    } finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => {
    if (!open) return;
    setEvents([]); setEventId(''); setAt(''); setNote(''); setError('');
    void load();
  }, [open, load]);

  function pick(id: number) {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    if (ev) setAt(toLocalInput(ev.at));
  }

  async function save() {
    if (!eventId || !at) return;
    setBusy(true); setError('');
    try {
      await correctTaskEvent(Number(eventId), {
        at: new Date(at).toISOString(),
        note: note.trim() || undefined,
      });
      toast('Time corrected — the original is kept in the record', 'success');
      onCorrected?.();
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not correct that time.'));
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} />
      <DialogTitle sx={{ fontWeight: 600 }}>
        Correct a logged time
        {taskLabel && (
          <Typography sx={{ fontSize: 12.5, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.25 }}>
            {taskLabel}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
        ) : events.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            This task has no logged start or finish to correct.
          </Typography>
        ) : (
          <>
            <TextField
              select size="small" label="Which time" value={eventId}
              onChange={(e) => pick(Number(e.target.value))}
            >
              {events.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.eventType === 'started' ? 'Started' : 'Finished'} — {new Date(e.at).toLocaleString()}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small" type="datetime-local" label="Should have been"
              slotProps={{ inputLabel: { shrink: true } }}
              value={at} onChange={(e) => setAt(e.target.value)}
            />
            <TextField
              size="small" label="Why (optional)" value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText="Kept with the correction, so the change explains itself later"
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" onClick={save} disabled={busy || !eventId || !at}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Correcting…' : 'Correct'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
