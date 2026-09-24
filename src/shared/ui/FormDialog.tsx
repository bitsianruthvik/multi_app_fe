import { useEffect, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { ErrorNotice } from './ErrorNotice';
import { enterSubmits as enterRule } from './dialogKeys';

/**
 * The close affordance every dialog gets.
 *
 * Exported because a panel, a wizard or a sheet is not a form and so cannot
 * adopt the FormDialog wrapper — they should all render THIS rather than each
 * inventing a close button, or the icon, size and hit target drift apart.
 *
 * Why a dialog needs one even when it has a Cancel button: Cancel reads as
 * "abandon what I typed", which is not what someone means when they opened a
 * panel to look at something. Escape already closes, but it is invisible, and a
 * dialog with no visible way out is the most-reported kind of dead end.
 *
 * `disabled` is honoured so an in-flight save cannot be closed out from under
 * itself.
 */
export function DialogCloseButton({
  onClose,
  disabled = false,
  label = 'Close',
  absolute = false,
}: {
  onClose: () => void;
  disabled?: boolean;
  label?: string;
  /** Pin to the dialog's corner, for a dialog that lays out its own title. */
  absolute?: boolean;
}) {
  return (
    <Tooltip title={label}>
      {/* span keeps the tooltip alive while the button is disabled */}
      <span
        style={
          absolute
            ? { position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'inline-flex' }
            : { marginLeft: 'auto', display: 'inline-flex' }
        }
      >
        <IconButton
          onClick={onClose}
          disabled={disabled}
          size="small"
          aria-label={label}
          sx={{ color: 'var(--c-text-2)', '&:hover': { color: 'var(--c-text)' } }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}

/** A dialog title with its subtitle and the close button — for dialogs that are not simple forms. */
export function DialogHeader({
  title,
  subtitle,
  onClose,
  busy = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ minWidth: 0 }}>
        {title}
        {subtitle && (
          <Box sx={{ fontSize: 13, fontWeight: 400, color: 'var(--c-text-2)', mt: 0.5 }}>
            {subtitle}
          </Box>
        )}
      </Box>
      <DialogCloseButton onClose={onClose} disabled={busy} label="Close without saving" />
    </DialogTitle>
  );
}

/**
 * The one form dialog (DESIGN_SYSTEM.md §7.5).
 *
 * It replaces the hand-rolled `<Dialog>` that every screen otherwise re-invents
 * with its own width, its own busy state and — the part that actually hurts
 * people — its own error handling, which usually surfaces the generic axios
 * string ("Request failed with status code 400") instead of the backend's
 * message. That one detail is the difference between "something went wrong" and
 * "Item code ITM-0042 already exists".
 *
 * Contract:
 *  - `onSubmit` may throw. If it does, the error's message (and any itemised
 *    problems) are shown in-dialog; the dialog stays open with the user's input
 *    intact. It never closes on failure and never swallows an error silently.
 *  - `onSubmit` resolving closes the dialog. The caller does the toast + refetch.
 *  - Submitting is disabled while busy; the primary button swaps its label for
 *    an inline spinner (§5.7-6) rather than blocking the screen.
 */
export function FormDialog({
  open,
  title,
  subtitle,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  busyLabel = 'Saving…',
  submitDisabled = false,
  submitColor = 'primary',
  maxWidth = 'sm',
  extraActions,
  enterSubmits = true,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Throw to keep the dialog open and show the error. Resolve to close. */
  onSubmit: () => Promise<unknown> | void;
  submitLabel?: string;
  busyLabel?: string;
  submitDisabled?: boolean;
  submitColor?: 'primary' | 'error' | 'success';
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  /** Rendered left of Cancel, e.g. a secondary "Save and add another". */
  extraActions?: ReactNode;
  /** Off for a dialog whose main field is prose, where Enter means a new line. */
  enterSubmits?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Clear stale state when reopening — otherwise the previous attempt's error
  // greets the user on a fresh open.
  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e ?? new Error('Something went wrong.'));
    }
  };

  const onKeyDown = enterRule(
    () => {
      void submit();
    },
    !enterSubmits || busy || submitDisabled,
  );

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth
      onKeyDown={onKeyDown}
    >
      <DialogHeader title={title} subtitle={subtitle} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>{children}</Box>
      </DialogContent>
      <DialogActions>
        {extraActions}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={submitColor}
          onClick={submit}
          disabled={busy || submitDisabled}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? busyLabel : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
