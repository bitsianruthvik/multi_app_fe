/**
 * EU-13: "Google-Maps detour" blocking confirm-gate shown from TaskQueue's
 * Start flow when GET /cc/whatif reports that starting a task would push the
 * promised finish date on one or more projects (see api/cc.ts getCcWhatIf).
 *
 * Purely presentational — TaskQueue.tsx owns the open/whatIf state and the
 * actual POST /tasks/:id/start call. "Start anyway" and "Cancel" are the only
 * two ways out; there is no dismiss-on-backdrop-click while submitting.
 */
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import type { CcWhatIfResponse } from '../../api/cc';

/** Readable date for a fever-chart finish timestamp; null-safe. */
function formatFinish(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DetourWarningDialog({
  open,
  whatIf,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  whatIf: CcWhatIfResponse | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const impacts = whatIf?.impacts ?? [];

  return (
    <Dialog open={open} onClose={submitting ? undefined : onCancel} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningAmberRounded sx={{ color: 'var(--c-warning-600)' }} aria-hidden />
        This will delay other projects
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Starting this task pushes the promised finish date on {impacts.length} project{impacts.length === 1 ? '' : 's'}.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {impacts.map((imp) => (
            <Typography key={imp.orderId} sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
              {imp.orderNumber}: {formatFinish(imp.oldFinish)} → {formatFinish(imp.newFinish)} (+{Math.round(imp.deltaDays)}d), buffer {imp.oldZone} → {imp.newZone}
            </Typography>
          ))}
        </Box>

        {whatIf?.recommended && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Recommended instead: {whatIf.recommended.label}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button onClick={onConfirm} variant="contained" color="warning" disabled={submitting}>
          {submitting ? <CircularProgress size={18} /> : 'Start anyway'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
