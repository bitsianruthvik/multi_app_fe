import { useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { DialogCloseButton } from './FormDialog';
import { ErrorNotice } from './ErrorNotice';

/**
 * Asks before an irreversible or wide-reaching action.
 *
 * It echoes the thing being acted on back at the reader, in mono. A confirm
 * that only says "Are you sure?" gives them nothing to check against, which is
 * exactly how people delete the wrong record. A refusal from the backend
 * ("still used by 2 rules") appears in place instead of the dialog closing.
 *
 * `danger` adds the warning mark and the red button — use it when the action
 * cannot be undone, not merely when it is important.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  entityName,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title?: ReactNode;
  body?: ReactNode;
  /** The thing being acted on, shown in mono so it is unmistakable. */
  entityName?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e ?? new Error('Could not complete that action.'));
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        {danger && <WarningAmberRounded sx={{ color: 'var(--c-danger-600)' }} aria-hidden />}
        <Box sx={{ minWidth: 0 }}>{title ?? `${confirmLabel}?`}</Box>
        <DialogCloseButton onClose={onClose} disabled={busy} />
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={error} fallback="Could not complete that action." />
        {entityName && (
          <Box
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--c-text)',
              background: 'var(--c-surface-2)',
              border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm)',
              px: 1.5,
              py: 1,
              mb: 1.5,
              wordBreak: 'break-word',
            }}
          >
            {entityName}
          </Box>
        )}
        <Box sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
          {body ?? (danger ? 'This cannot be undone.' : null)}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={danger ? 'error' : 'primary'}
          onClick={run}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
