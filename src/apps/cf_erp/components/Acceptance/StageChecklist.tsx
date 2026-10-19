import { useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, TextField, Typography } from '@mui/material';
import { CfApiError } from '../../api/client';
import { markStageDone, undoStageDone, type PostStage } from '../../api/acceptance';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice } from '../ui';
import { useToast } from '../toastContext';
import { nudgeIfRefused } from '../salesMotion';
import { celebrate } from '../../motion';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * An order's POST-PRODUCTION stages as a checklist (§73) — on the Orders board's card and in the Customer acceptance
 * step. Ticking one asks the date (today) and a note, and is recorded (who, when; an event billing reads). The last
 * one done on an order that is fully shipped closes the order. A tick made by mistake can be undone (recorded too).
 */
export function StageChecklist({ stages, canTick, compact = false, onChanged }: {
  stages: PostStage[];
  canTick: boolean;
  compact?: boolean;
  onChanged?: (r: { orderClosed?: boolean }) => void;
}) {
  const toast = useToast();
  const [ticking, setTicking] = useState<PostStage | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  if (!stages.length) return <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>No post-production stages.</Typography>;
  const open = (s: PostStage) => { setTicking(s); setDate(today()); setNote(''); setError(null); };
  const undo = async (s: PostStage) => {
    setBusy(true);
    try { await undoStageDone(s.id); toast.success(`"${s.name}" is open again.`); onChanged?.({}); } catch (e) { toast.error((e as CfApiError).message); } finally { setBusy(false); }
  };
  const done = async (anchor?: HTMLElement) => {
    if (!ticking) return;
    setBusy(true); setError(null);
    try {
      const r = await markStageDone(ticking.id, { date, note: note.trim() || undefined });
      toast.success(r.orderClosed ? `"${ticking.name}" done — every stage is done, the order is closed.` : `"${ticking.name}" done.`);
      // The last stage closing the order is a milestone: one small burst.
      if (r.orderClosed) celebrate(anchor);
      setTicking(null);
      onChanged?.({ orderClosed: r.orderClosed });
    } catch (e) { setError(e as CfApiError); nudgeIfRefused(e, anchor); } finally { setBusy(false); }
  };
  return (
    <Box data-testid="stage-checklist" sx={{ display: 'grid', gap: compact ? 0.25 : 0.5 }}>
      {stages.map((s) => (
        <Box key={s.id} data-testid="stage-row" data-done={s.done ? '1' : '0'} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, minWidth: 0 }}>
          <Checkbox size="small" checked={s.done} disabled={!canTick || busy} sx={{ p: 0.25 }}
            inputProps={{ 'aria-label': s.done ? `Undo "${s.name}"` : `Mark "${s.name}" done` }}
            onChange={() => (s.done ? void undo(s) : open(s))} />
          <Box sx={{ minWidth: 0, pt: 0.25 }}>
            <Typography sx={{ fontSize: compact ? 12.5 : 13.5, textDecoration: s.done ? 'line-through' : undefined, color: s.done ? 'var(--c-text-2)' : 'var(--c-text)', overflowWrap: 'anywhere' }}>{s.name}</Typography>
            {s.done && (
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', overflowWrap: 'anywhere' }}>
                Done {s.doneOn}{s.doneBy?.name ? ` · ${s.doneBy.name}` : ''}{s.doneNote ? ` · ${s.doneNote}` : ''}
              </Typography>
            )}
          </Box>
        </Box>
      ))}
      <Dialog open={!!ticking} onClose={() => !busy && setTicking(null)} maxWidth="xs" fullWidth>
        <DialogHeader title={`"${ticking?.name ?? ''}" done`} onClose={() => setTicking(null)} busy={busy} />
        <DialogContent>
          <ErrorNotice error={error} />
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="Done on" type="date" size="small" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ max: today(), 'data-testid': 'stage-date' }} />
            <TextField label="Note" size="small" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. RITES IC no." multiline minRows={2} inputProps={{ 'data-testid': 'stage-note' }} />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>This is recorded. Billing uses it.</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTicking(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={(e) => void done(e.currentTarget)} disabled={busy || !date} data-testid="stage-done">Mark done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
