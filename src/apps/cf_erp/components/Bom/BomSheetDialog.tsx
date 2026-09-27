import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Typography } from '@mui/material';
import type { BomSheetResult } from '../../api/bomSheet';

export function BomSheetDialog({
  open, fileName, result, busy, onClose, onApply,
}: {
  open: boolean;
  fileName: string;
  result: BomSheetResult | null;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  const problems = result?.problems ?? [];
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Review Excel changes</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, overflowWrap: 'anywhere' }}>
          {fileName}
        </Typography>
        {result && (
          <>
            <Alert severity={problems.length ? 'error' : 'success'} sx={{ mb: 1.5 }}>
              {problems.length ? 'Nothing has been changed. Fix these items and upload the file again.' : `Preview: ${result.summary.sentence}.`}
            </Alert>
            {!problems.length && (
              <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
                This is a preview. Your BOM is unchanged until you press Apply changes.
              </Typography>
            )}
            {problems.length > 0 && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5, color: 'var(--c-danger-800)' }}>
                {problems.map((problem) => <li key={problem}><Typography sx={{ fontSize: 13 }}>{problem}</Typography></li>)}
              </Box>
            )}
            {!problems.length && result.changes.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', mb: 0.5 }}>Changes</Typography>
                <Divider />
                {result.changes.slice(0, 12).map((change, index) => (
                  <Typography key={`${change.action}-${change.path ?? index}`} sx={{ fontSize: 12.5, py: 0.6, borderBottom: '1px solid var(--c-border)' }}>
                    {change.action === 'remove' ? 'Remove · ' : change.action === 'add' ? 'Add · ' : ''}{change.path ?? change.action}
                    {change.detail ? ` · ${change.detail}` : ''}
                    {change.field ? ` · ${change.field}` : ''}
                    {change.from !== undefined || change.to !== undefined ? ` · ${String(change.from ?? 'empty')} → ${String(change.to ?? 'empty')}` : ''}
                  </Typography>
                ))}
                {result.changes.length > 12 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>and {result.changes.length - 12} more…</Typography>}
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{problems.length ? 'Close' : 'Cancel'}</Button>
        {result && !problems.length && result.changes.length > 0 && (
          <Button variant="contained" onClick={onApply} disabled={busy}
            startIcon={busy ? <CircularProgress size={15} color="inherit" /> : undefined}>
            {busy ? 'Applying…' : 'Apply changes'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
