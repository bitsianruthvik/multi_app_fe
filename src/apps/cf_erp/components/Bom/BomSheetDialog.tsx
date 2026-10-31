import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Radio, RadioGroup, Typography } from '@mui/material';
import type { BomSheetResult } from '../../api/bomSheet';

/** What the dialog reads of a preview — the BOM sheets' answer, and any other sheet upload of the same shape (the buying sheets). */
export type SheetPreview = Pick<BomSheetResult, 'problems' | 'changes' | 'links'> & { summary: { sentence: string } };
import type { LinkChoiceValue } from '../../api/links';

export function BomSheetDialog({
  open, fileName, result, busy, onClose, onApply, links = 'all', onLinks, unchangedText = 'Your BOM is unchanged until you press Apply changes.',
}: {
  open: boolean;
  fileName: string;
  result: SheetPreview | null;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
  /** Linked copies: the answer for the whole file, asked only when the preview says a change is not the same across copies. */
  links?: LinkChoiceValue;
  onLinks?: (v: LinkChoiceValue) => void;
  /** The line under a clean preview (another sheet names what stays unchanged). */
  unchangedText?: string;
}) {
  const problems = result?.problems ?? [];
  const asks = !!result?.links?.needsChoice && !problems.length && !!onLinks;
  const copies = result?.links?.touched ?? [];
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
                This is a preview. {unchangedText}
              </Typography>
            )}
            {problems.length > 0 && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2.5, color: 'var(--c-danger-800)' }}>
                {problems.map((problem) => <li key={problem}><Typography sx={{ fontSize: 13 }}>{problem}</Typography></li>)}
              </Box>
            )}
            {asks && (
              <Box data-testid="sheet-links" sx={{ mt: 2, p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Some changes are not the same across rows that are copies of each other</Typography>
                {copies.length > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>{copies.slice(0, 6).map((t) => t.label).join(', ')}{copies.length > 6 ? ` and ${copies.length - 6} more` : ''}.</Typography>}
                <RadioGroup value={links} onChange={(e) => onLinks?.(e.target.value as LinkChoiceValue)} aria-label="What the copies do">
                  <FormControlLabel value="all" control={<Radio size="small" slotProps={{ input: { 'data-testid': 'sheet-links-all' } as object }} />} label="Apply to all copies — they stay the same design" />
                  <FormControlLabel value="one" control={<Radio size="small" slotProps={{ input: { 'data-testid': 'sheet-links-one' } as object }} />} label="Only the rows in the file — they stop being copies" />
                </RadioGroup>
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
