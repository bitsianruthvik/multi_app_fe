import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Radio, Typography } from '@mui/material';
import StarRounded from '@mui/icons-material/StarRounded';
import { cfApi, CfApiError } from '../api/client';
import type { LineCandidates } from '../api/types';
import { EmptyState, ErrorNotice, Mono, SkeletonRows } from './ui';
import { DialogHeader } from './FormDialog';

/**
 * Chooses the catalog item for a selection line (decision Q12): only items the
 * selection allows are offered, default first. The line keeps the selection
 * either way, so "this was a bolt selection" is never lost.
 */
export function ChooseItemDialog({ lineId, open, onClose, onDone }: { lineId: number | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<LineCandidates | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open || !lineId) return;
    setData(null); setError(null);
    cfApi.get<LineCandidates>(`/bom-lines/${lineId}/candidates`)
      .then((d) => { setData(d); setPick(d.chosenItemId); })
      .catch((e) => setError(e as CfApiError));
  }, [open, lineId]);

  const save = async (itemId: number | null) => {
    setBusy(true); setError(null);
    try { await cfApi.post(`/bom-lines/${lineId}/resolve`, { itemId }); setBusy(false); onDone(); onClose(); } catch (e) { setBusy(false); setError(e as CfApiError); }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>Choose the item{data ? ` for ${data.selection.code ?? data.selection.name}` : ''}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        {!data && !error && <SkeletonRows rows={3} />}
        {data && (data.candidates.length === 0 ? (
          <EmptyState title="No item qualifies" body={data.note ?? 'The selection allows no active catalog item yet — widen it under Definitions.'} />
        ) : (
          <Box role="radiogroup" aria-label="Candidate items" sx={{ display: 'grid', gap: 0.5 }}>
            {data.candidates.map((c) => (
              <Box key={c.id} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 'var(--r-sm)', cursor: 'pointer', flexWrap: 'wrap', background: pick === c.id ? 'var(--c-surface-2)' : 'transparent', '&:hover': { background: 'var(--c-surface-2)' } }}>
                <Radio checked={pick === c.id} onChange={() => setPick(c.id)} size="small" inputProps={{ 'aria-label': c.code }} />
                <Mono sx={{ minWidth: 140 }}>{c.code}</Mono>
                <Typography sx={{ flex: 1, fontSize: 14, minWidth: 140 }}>{c.name}</Typography>
                {c.isDefault && <StarRounded fontSize="small" sx={{ color: 'var(--c-warning-600)' }} titleAccess="Default" />}
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        {data?.chosenItemId && <Button onClick={() => save(null)} disabled={busy} sx={{ mr: 'auto' }}>Clear the choice</Button>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => save(pick)} disabled={busy || !pick || pick === data?.chosenItemId}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Use this item'}</Button>
      </DialogActions>
    </Dialog>
  );
}
