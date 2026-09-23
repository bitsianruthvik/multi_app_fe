import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { CfApiError } from '../api/client';
import { ErrorNotice } from './ui';
import { DialogCloseButton } from './FormDialog';

/**
 * Asks before an irreversible or wide-reaching action (fab_erp's ConfirmDialog):
 * a destructive one shows the warning mark and names the thing in mono, so
 * there is something to check against; a refusal ("still used by 2 rules")
 * appears in place instead of closing.
 */
export function ConfirmDialog({ open, title, body, entityName, confirmLabel = 'Confirm', danger = false, onConfirm, onClose }: {
  open: boolean;
  title: string;
  body: ReactNode;
  entityName?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setError(null); setBusy(false); } }, [open]);
  const run = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(); setBusy(false); onClose(); } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, 'Could not complete that action.'));
    }
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        {danger && <WarningAmberRounded sx={{ color: 'var(--c-danger-600)' }} aria-hidden />}
        <Box sx={{ minWidth: 0 }}>{title}</Box>
        <DialogCloseButton onClose={onClose} disabled={busy} />
      </DialogTitle>
      <DialogContent>
        <ErrorNotice error={error} />
        {entityName && (
          <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--c-text)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 1.5, py: 1, mb: 1.5, wordBreak: 'break-word' }}>
            {entityName}
          </Box>
        )}
        <Box sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>{body}</Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} onClick={run} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
