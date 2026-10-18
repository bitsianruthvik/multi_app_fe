import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import type { useUnsavedGuard } from '../hooks/useUnsavedGuard';

/** The question itself. Enter saves (the default button), Esc stays. */
export function UnsavedDialog({ guard, count, what = 'this BOM' }: {
  guard: ReturnType<typeof useUnsavedGuard>;
  /** How many changes wait. */
  count: number;
  what?: string;
}) {
  const words = `${count} ${count === 1 ? 'change' : 'changes'} to ${what} ${count === 1 ? 'is' : 'are'} not saved.`;
  return (
    <Dialog open={guard.held} onClose={guard.stay} maxWidth="xs" fullWidth data-testid="unsaved-dialog">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <WarningAmberRounded sx={{ color: 'var(--c-warning-600)' }} aria-hidden />
        <Box sx={{ minWidth: 0 }}>Save before you go?</Box>
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 14 }}>{words} Save them, discard them, or stay here.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={guard.stay} disabled={guard.saving} data-testid="unsaved-stay">Stay</Button>
        <Button color="error" onClick={guard.discard} disabled={guard.saving} data-testid="unsaved-discard">Discard</Button>
        <Button variant="contained" autoFocus onClick={() => void guard.save()} disabled={guard.saving} data-testid="unsaved-save"
          startIcon={guard.saving ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {guard.saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
