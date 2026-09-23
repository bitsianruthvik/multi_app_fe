import { useEffect, useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { CfApiError } from '../api/client';
import { ErrorNotice } from './ui';
import { enterSubmits as enterRule } from '../lib/dialog';

/**
 * The close affordance every dialog gets (fab_erp's DialogCloseButton): Escape
 * already closes, but it is invisible, and a dialog with no visible way out is
 * the most reported thing in either app. Disabled while a save is in flight.
 */
export function DialogCloseButton({ onClose, disabled = false, label = 'Close', absolute = false }: { onClose: () => void; disabled?: boolean; label?: string; absolute?: boolean }) {
  return (
    <Tooltip title={label}>
      <span style={absolute ? { position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'inline-flex' } : { marginLeft: 'auto', display: 'inline-flex' }}>
        <IconButton onClick={onClose} disabled={disabled} size="small" aria-label={label} sx={{ color: 'var(--c-text-2)', '&:hover': { color: 'var(--c-text)' } }}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** A dialog title with its subtitle and the close button — for dialogs that are not simple forms. */
export function DialogHeader({ title, subtitle, onClose, busy = false }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; busy?: boolean }) {
  return (
    <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        {title}
        {subtitle && <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>{subtitle}</Box>}
      </Box>
      <DialogCloseButton onClose={onClose} disabled={busy} label="Close without saving" />
    </DialogTitle>
  );
}

const asCfError = (e: unknown) => (e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e)));

/**
 * The form dialog (fab_erp's FormDialog, with cf_erp's problems list).
 * `onSubmit` throws to keep the dialog open with every problem the backend
 * listed and the user's input intact; resolving closes it. Enter submits from
 * any field but a textarea, and not while a picker is choosing an option.
 */
export function FormDialog({
  open, title, subtitle, children, onClose, onSubmit, submitLabel = 'Save', busyLabel = 'Saving…', submitDisabled = false,
  submitColor = 'primary', maxWidth = 'sm', extraActions, enterSubmits = true,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => Promise<unknown> | void;
  submitLabel?: string;
  busyLabel?: string;
  submitDisabled?: boolean;
  submitColor?: 'primary' | 'error' | 'success';
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  extraActions?: ReactNode;
  enterSubmits?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setError(null); setBusy(false); } }, [open]);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await onSubmit(); setBusy(false); onClose(); } catch (e) { setBusy(false); setError(asCfError(e)); }
  };
  const onKeyDown = enterRule(() => { void submit(); }, !enterSubmits || busy || submitDisabled);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth={maxWidth} fullWidth onKeyDown={onKeyDown}>
      <DialogHeader title={title} subtitle={subtitle} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>{children}</Box>
      </DialogContent>
      <DialogActions>
        {extraActions}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color={submitColor} onClick={submit} disabled={busy || submitDisabled}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
