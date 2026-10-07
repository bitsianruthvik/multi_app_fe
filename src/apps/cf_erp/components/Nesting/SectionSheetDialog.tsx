import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { SectionSheetResult } from '../../api/sectionNesting';
import { Badge, CapsLabel, Mono } from '../ui';

/**
 * WHAT THE UPLOADED BAR SHEET WOULD DO — read, never written, until Save. The
 * same flow as the plate sheet: cell problems block saving; coverage that does
 * not match what the line needs (or doubts the check raised) can still be saved
 * with "Save anyway". Saving replaces the line's bar lots, never its plates.
 */
export function SectionSheetDialog({ open, fileName, result, busy, onClose, onSave }: {
  open: boolean;
  fileName: string;
  result: SectionSheetResult | null;
  busy: boolean;
  onClose: () => void;
  /** `force` is true when the check had doubts and the person saves anyway. */
  onSave: (force: boolean) => void;
}) {
  const problems = result?.problems ?? [];
  const coverage = result?.coverage ?? [];
  const short = coverage.filter((c) => c.placed < c.needed);
  const over = coverage.filter((c) => c.placed > c.needed);
  const exact = coverage.length - short.length - over.length;
  const blocked = problems.length > 0;
  const force = !!result && (result.needsForce || short.length > 0 || over.length > 0);
  const bars = result?.bars.length ?? 0;
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="section-sheet-title">
      <DialogTitle id="section-sheet-title">Check the bar sheet</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, overflowWrap: 'anywhere' }}>{fileName}</Typography>
        {result && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.75, minWidth: 0 }}>
            {blocked ? (
              <Alert severity="error" data-testid="section-sheet-problems">
                <Box sx={{ fontWeight: 600, mb: 0.5 }}>Nothing is saved. Fix these cells and upload the sheet again.</Box>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </Box>
              </Alert>
            ) : (
              <Alert severity={force ? 'warning' : 'success'} data-testid="section-sheet-verdict">
                {force
                  ? `${short.length ? 'Some cut pieces are placed fewer times than the line needs. ' : ''}${over.length ? 'Some cut pieces are placed more times than the line needs. ' : ''}You can still save it.`
                  : `The sheet places every cut piece exactly as often as needed, on ${bars} ${bars === 1 ? 'bar' : 'bars'}.`}
                {' '}Saving replaces every bar on this line. Plates are not touched.
              </Alert>
            )}
            {coverage.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
                <CapsLabel>Needed against placed</CapsLabel>
                <Typography sx={{ fontSize: 13 }}>
                  {[`${exact} of ${coverage.length} cut pieces match`, short.length ? `${short.length} short` : null, over.length ? `${over.length} over` : null].filter(Boolean).join(' · ')}
                </Typography>
                {short.length + over.length > 0 && (
                  <Box component="table" sx={{
                    borderCollapse: 'collapse', fontSize: 12.5, width: '100%',
                    '& th, & td': { textAlign: 'left', py: 0.5, pr: 1.5, borderBottom: '1px solid var(--c-divider)' },
                    '& th': { color: 'var(--c-text-3)', fontWeight: 600 },
                    '& td.n, & th.n': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                  }}>
                    <thead><tr><th>Cut piece</th><th className="n">Needed</th><th className="n">Placed</th><th>Result</th></tr></thead>
                    <tbody>
                      {[...short, ...over].map((c) => (
                        <tr key={c.code}>
                          <td><Mono sx={{ overflowWrap: 'anywhere' }}>{c.code}</Mono></td>
                          <td className="n">{c.needed}</td>
                          <td className="n">{c.placed}</td>
                          <td>{c.placed < c.needed ? <Badge family="warning" label={`${c.needed - c.placed} short`} noIcon /> : <Badge family="danger" label={`${c.placed - c.needed} over`} noIcon />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{blocked ? 'Close' : 'Cancel'}</Button>
        {result && !blocked && (
          <Button variant="contained" color={force ? 'warning' : 'primary'} onClick={() => onSave(force)} disabled={busy}
            startIcon={busy ? <CircularProgress size={15} color="inherit" /> : undefined}>
            {busy ? 'Saving…' : force ? 'Save anyway' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
