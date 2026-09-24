import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  TextField,
  Typography,
} from '@mui/material';
import { DialogHeader } from './FormDialog';
import { ErrorNotice } from './ErrorNotice';

/**
 * Asks for one line of text — a reason, a note, a reference — runs the action
 * with it, and shows a refusal in place rather than closing.
 *
 * This is the shape for "why?" prompts on actions that need a written reason
 * (a cancellation, an override, a regularisation). `required` defaults to on,
 * because an empty reason is the same as no reason.
 */
export function PromptDialog({
  open,
  title,
  body,
  label,
  initialValue = '',
  required = true,
  confirmLabel = 'Confirm',
  danger = false,
  multiline = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  body?: ReactNode;
  label: string;
  initialValue?: string;
  required?: boolean;
  confirmLabel?: string;
  danger?: boolean;
  multiline?: boolean;
  onConfirm: (value: string) => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(null);
      setBusy(false);
    }
  }, [open, initialValue]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value.trim());
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e ?? new Error('Could not complete that action.'));
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogHeader title={title} onClose={onClose} busy={busy} />
      <DialogContent>
        {body && (
          <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13.5, mb: 2 }}>{body}</Typography>
        )}
        <ErrorNotice error={error} fallback="Could not complete that action." />
        <TextField
          label={label}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          fullWidth
          autoFocus
          multiline={multiline}
          minRows={multiline ? 2 : undefined}
          sx={{ mt: 0.5 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={danger ? 'error' : 'primary'}
          onClick={run}
          disabled={busy || (required && !value.trim())}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
