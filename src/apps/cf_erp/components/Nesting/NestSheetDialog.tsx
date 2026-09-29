import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from '@mui/material';
import type { NestSheetResult } from '../../api/types';
import { NO_LAYOUT, verdictOf } from '../../lib/nesting';
import { Badge, CapsLabel, Mono } from '../ui';

/**
 * WHAT THE UPLOADED SHEET WOULD DO — read, never written, until Save.
 *
 * Each nest is one plate and the cut plates on it. Our rules check each one
 * and say Fits / Tight / Won't fit, but the user may save it anyway: their
 * nesting program knows things our packer does not. Cell problems are
 * different — a sheet we cannot read cannot be saved.
 */
export function NestSheetDialog({
  open, fileName, result, busy, onClose, onSave,
}: {
  open: boolean;
  fileName: string;
  result: NestSheetResult | null;
  busy: boolean;
  onClose: () => void;
  /** `force` is true when the check had doubts and the user saves anyway. */
  onSave: (force: boolean) => void;
}) {
  const problems = result?.problems ?? [];
  const nests = result?.nests ?? [];
  const coverage = result?.coverage ?? [];
  const short = coverage.filter((c) => c.diff < 0);
  const over = coverage.filter((c) => c.diff > 0);
  const exact = coverage.length - short.length - over.length;
  const doubts = nests.filter((n) => n.verdict !== 'fits').length;
  const blocked = problems.length > 0;
  const force = !!result && (result.needsForce || doubts > 0 || over.length > 0);

  const summary = coverage.length
    ? [
      `${exact} of ${coverage.length} cut plates match`,
      short.length ? `${short.length} short` : null,
      over.length ? `${over.length} over` : null,
    ].filter(Boolean).join(' · ')
    : null;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Check the nesting sheet</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, overflowWrap: 'anywhere' }}>{fileName}</Typography>
        {result && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.75, minWidth: 0 }}>
            {blocked ? (
              <Alert severity="error">
                <Box sx={{ fontWeight: 600, mb: 0.5 }}>Nothing is saved. Fix these cells and upload the sheet again.</Box>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, overflowWrap: 'anywhere' }}>
                  {problems.map((p) => <li key={p}>{p}</li>)}
                </Box>
              </Alert>
            ) : (
              <Alert severity={force ? 'warning' : 'success'}>
                {force
                  ? `${doubts ? `${doubts} of ${nests.length} ${nests.length === 1 ? 'nest' : 'nests'} may not work with our rules.` : ''}${over.length ? `${doubts ? ' ' : ''}Some cut plates are nested more times than the line needs.` : ''} You can still save it.`
                  : `All ${nests.length} ${nests.length === 1 ? 'nest fits' : 'nests fit'}.`}
                {' '}Saving replaces every plate on this line.
                {short.length > 0 && ' Nest the rest afterwards for what is short.'}
              </Alert>
            )}

            {nests.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0, minWidth: 0 }}>
                <CapsLabel>{`Nests (${nests.length})`}</CapsLabel>
                {nests.map((n) => {
                  const v = verdictOf(n.verdict);
                  return (
                    <Box key={String(n.nestNo)} sx={{ py: 1, borderBottom: '1px solid var(--c-divider)', display: 'grid', gap: 0.6, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
                        <Mono chip>{`Nest ${n.nestNo}`}</Mono>
                        <Box sx={{ fontSize: 13.5, fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {n.plateLabel ?? n.plateCode ?? 'Unknown plate'}
                        </Box>
                        {n.plateLabel && n.plateCode && n.plateLabel !== n.plateCode && <Mono muted>{n.plateCode}</Mono>}
                        {v && <Badge family={v.family} label={v.label} title={v.help} />}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                        {n.items.map((it) => (
                          <Box key={it.cutPlateCode} sx={{
                            display: 'inline-flex', gap: 0.6, alignItems: 'center', fontSize: 12, maxWidth: '100%',
                            background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.75, py: 0.2,
                          }}>
                            <Mono sx={{ overflowWrap: 'anywhere' }}>{it.cutPlateCode}</Mono>
                            <Box component="span" sx={{ color: 'var(--c-text-2)' }}>{`×${it.qty}`}</Box>
                          </Box>
                        ))}
                      </Box>
                      {n.verdict === 'tight' && (
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>{verdictOf('tight')?.help}</Typography>
                      )}
                      {n.reasons.length > 0 && (
                        <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                          {n.reasons.map((r) => <li key={r}>{r}</li>)}
                        </Box>
                      )}
                      {!n.hasLayout && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{NO_LAYOUT}</Typography>}
                    </Box>
                  );
                })}
              </Box>
            )}

            {summary && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
                <CapsLabel>Needed against nested</CapsLabel>
                <Typography sx={{ fontSize: 13 }}>{summary}</Typography>
                {short.length + over.length > 0 && (
                  <Box component="table" sx={{
                    borderCollapse: 'collapse', fontSize: 12.5, width: '100%',
                    '& th, & td': { textAlign: 'left', py: 0.5, pr: 1.5, borderBottom: '1px solid var(--c-divider)' },
                    '& th': { color: 'var(--c-text-3)', fontWeight: 600 },
                    '& td.n, & th.n': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                  }}>
                    <thead>
                      <tr><th>Cut plate</th><th className="n">Needed</th><th className="n">Nested</th><th>Result</th></tr>
                    </thead>
                    <tbody>
                      {[...short, ...over].map((c) => (
                        <tr key={c.cutPlateCode}>
                          <td><Mono sx={{ overflowWrap: 'anywhere' }}>{c.cutPlateCode}</Mono></td>
                          <td className="n">{c.needed}</td>
                          <td className="n">{c.nested}</td>
                          <td>
                            {c.diff < 0
                              ? <Badge family="warning" label={`${-c.diff} short`} noIcon />
                              : <Badge family="danger" label={`${c.diff} over`} noIcon />}
                          </td>
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
        {result && !blocked && nests.length > 0 && (
          <Button variant="contained" color={force ? 'warning' : 'primary'} onClick={() => onSave(force)} disabled={busy}
            startIcon={busy ? <CircularProgress size={15} color="inherit" /> : undefined}>
            {busy ? 'Saving…' : force ? 'Save anyway' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
