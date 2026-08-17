import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Tooltip,
} from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { backendMessage } from '../utils/backendMessage';

/**
 * The close affordance every dialog in fab_erp gets (DESIGN_SYSTEM.md §7.5).
 *
 * Exported because ~30 hand-rolled `<Dialog>` blocks still exist outside
 * FormDialog/ConfirmDialog — panels, wizards and sheets that are not forms and
 * so cannot adopt the wrapper. They should all render THIS rather than each
 * inventing a close button, or the icon, size and hit target drift apart.
 *
 * Why a dialog needs one even when it has a Cancel button: Cancel reads as
 * "abandon what I typed", which is not what someone means when they opened a
 * panel to look at something. Escape already closes, but it is invisible, and a
 * dialog with no visible way out is the single most reported thing here.
 *
 * `disabled` is honoured so an in-flight save cannot be closed out from under
 * itself — the same rule as `onClose={busy ? undefined : onClose}`.
 */
export function DialogCloseButton({
  onClose, disabled = false, label = 'Close', absolute = false,
}: { onClose: () => void; disabled?: boolean; label?: string; absolute?: boolean }) {
  return (
    <Tooltip title={label}>
      {/* span keeps the tooltip alive while the button is disabled */}
      <span
        style={absolute
          // `absolute` is for the ~50 hand-rolled dialogs being retrofitted. It
          // pins to the dialog corner without restructuring each DialogTitle,
          // which is what makes the retrofit a safe mechanical edit instead of
          // 50 bespoke layout changes. New dialogs should use FormDialog, which
          // lays the button out inline and cannot collide with a long title.
          ? { position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'inline-flex' }
          : { marginLeft: 'auto', display: 'inline-flex' }}
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

/**
 * The one form dialog in fab_erp (DESIGN_SYSTEM.md §7.5).
 *
 * Replaces ~50 hand-rolled `<Dialog>` blocks that each re-declared their own
 * width, their own busy state, and — the part that actually hurt users — their
 * own error handling, which usually surfaced the generic axios string
 * ("Request failed with status code 400") instead of the backend's `message`.
 * That one detail is the difference between "something went wrong" and
 * "Item code ITM-0042 already exists".
 *
 * Contract:
 *  - `onSubmit` may throw. If it does, the thrown error's backend message is
 *    extracted and shown in-dialog; the dialog stays open with the user's input
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
  submitDisabled = false,
  submitColor = 'primary',
  maxWidth = 'sm',
  extraActions,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /** Throw to keep the dialog open and show the error. Resolve to close. */
  onSubmit: () => Promise<void> | void;
  submitLabel?: string;
  submitDisabled?: boolean;
  submitColor?: 'primary' | 'error' | 'success';
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg';
  /** Rendered left of the Cancel button, e.g. a secondary "Save and add another". */
  extraActions?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Clear stale state when reopening — otherwise the previous attempt's error
  // greets the user on a fresh open.
  useEffect(() => {
    if (open) { setError(''); setBusy(false); }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onSubmit();
      onClose();
    } catch (e) {
      setError(backendMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth={maxWidth}
      fullWidth
      // Enter submits from anywhere in the form, which is what users expect of
      // a small record dialog. Shift+Enter and textareas are unaffected.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !busy && !submitDisabled) {
          const t = e.target as HTMLElement;
          if (t.tagName !== 'TEXTAREA') { e.preventDefault(); void submit(); }
        }
      }}
    >
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
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>{children}</Box>
      </DialogContent>
      <DialogActions>
        {extraActions}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          color={submitColor}
          onClick={submit}
          disabled={busy || submitDisabled}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Destructive-action confirm. Echoes the entity's name back at the user — a
 * confirm that just says "Are you sure?" gives them nothing to check against,
 * which is how people delete the wrong record.
 */
export function ConfirmDialog({
  open,
  title,
  entityName,
  body,
  confirmLabel = 'Delete',
  onClose,
  onConfirm,
}: {
  open: boolean;
  title?: ReactNode;
  /** The thing being acted on, shown in mono so it's unmistakable. */
  entityName?: string;
  body?: ReactNode;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); setBusy(false); }
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(backendMessage(e, 'Could not complete that action.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <WarningAmberRounded sx={{ color: 'var(--c-danger-600)' }} aria-hidden />
        {title ?? `${confirmLabel}?`}
        <DialogCloseButton onClose={onClose} disabled={busy} />
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {entityName && (
          <Box
            sx={{
              fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--c-text)',
              background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
              borderRadius: 'var(--r-sm)', px: 1.5, py: 1, mb: 1.5, wordBreak: 'break-word',
            }}
          >
            {entityName}
          </Box>
        )}
        <Box sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
          {body ?? 'This cannot be undone.'}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={confirm}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
