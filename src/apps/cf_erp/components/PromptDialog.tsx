import { useEffect, useState, type ReactNode } from 'react';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, TextField, Typography } from '@mui/material';
import { CfApiError } from '../api/client';
import { ErrorNotice } from './ui';
import { DialogHeader } from './FormDialog';

/** Asks for one line of text (a reason, a note), runs the action, and shows a refusal in place. */
export function PromptDialog({ open, title, body, label, required = true, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }: {
  open: boolean;
  title: string;
  body?: ReactNode;
  label: string;
  required?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (value: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setValue(''); setError(null); setBusy(false); } }, [open]);
  const run = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(value.trim()); setBusy(false); onClose(); } catch (e) { setBusy(false); setError(e instanceof CfApiError ? e : new CfApiError(0, 'Could not complete that action.')); }
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogHeader title={title} onClose={onClose} busy={busy} />
      <DialogContent>
        {body && <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13.5, mb: 2 }}>{body}</Typography>}
        <ErrorNotice error={error} />
        <TextField label={label} value={value} onChange={(e) => setValue(e.target.value)} fullWidth autoFocus multiline minRows={2} sx={{ mt: 0.5 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} onClick={run} disabled={busy || (required && !value.trim())}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Working…' : confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
