import { useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, InputAdornment, Radio, TextField, Typography } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { LineCandidates } from '../api/types';
import { EmptyState, ErrorNotice, Mono, SkeletonRows } from './ui';
import { DialogHeader } from './FormDialog';

/** How long typing rests before the server is asked again. */
const SEARCH_DELAY_MS = 250;

/**
 * Chooses the catalog item for a selection line (decision Q12): only items the
 * selection picks from are offered (the union of its branches and items, then
 * its spec filters — init.sql §42), default first. The search asks the SERVER,
 * so an item beyond the first page is still found. The line keeps the selection
 * either way, so "this was a bolt selection" is never lost. Choosing (or
 * clearing) here is a person's choice: the row's "default · change" tag goes.
 * Double-click a candidate to use it at once.
 */
export function ChooseItemDialog({ lineId, open, onClose, onDone }: { lineId: number | null; open: boolean; onClose: () => void; onDone: (cleared: boolean) => void }) {
  const [data, setData] = useState<LineCandidates | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    if (!open || !lineId) return;
    setData(null); setError(null); setSearch('');
    const n = ++asked.current;
    cfApi.get<LineCandidates>(`/bom-lines/${lineId}/candidates`)
      .then((d) => { if (n === asked.current) { setData(d); setPick(d.chosenItemId); } })
      .catch((e) => { if (n === asked.current) setError(e as CfApiError); });
  }, [open, lineId]);

  // The server search, after typing rests. The first read (no search) is the effect above.
  useEffect(() => {
    if (!open || !lineId || !data) return;
    const term = search.trim();
    const t = setTimeout(() => {
      const n = ++asked.current;
      setSearching(true);
      cfApi.get<LineCandidates>(`/bom-lines/${lineId}/candidates${qs({ search: term || undefined })}`)
        .then((d) => { if (n === asked.current) setData(d); })
        .catch((e) => { if (n === asked.current) setError(e as CfApiError); })
        .finally(() => { if (n === asked.current) setSearching(false); });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
    // `data` only gates the first search; re-reading on every answer would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open, lineId]);

  const save = async (itemId: number | null) => {
    setBusy(true); setError(null);
    try { await cfApi.post(`/bom-lines/${lineId}/resolve`, { itemId }); setBusy(false); onDone(itemId == null); onClose(); } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  const searched = search.trim() !== '';

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>Choose the item{data ? ` for ${data.selection.code ?? data.selection.name}` : ''}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        {!data && !error && <SkeletonRows rows={3} />}
        {data && (
          <TextField size="small" fullWidth autoFocus placeholder="Search by code or name" value={search} onChange={(e) => setSearch(e.target.value)}
            inputProps={{ 'aria-label': 'Search the candidates', 'data-testid': 'choose-search' }} sx={{ mb: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start">{searching ? <CircularProgress size={14} /> : <SearchRounded fontSize="small" />}</InputAdornment> }} />
        )}
        {data && (data.candidates.length === 0 ? (
          searched
            ? <EmptyState title="Nothing matches" body={`No item this selection picks from matches “${search.trim()}”.`} />
            : <EmptyState title="No item qualifies" body={data.note ?? 'The selection picks no active catalog item yet — widen it under Definitions.'} />
        ) : (
          <Box role="radiogroup" aria-label="Candidate items" sx={{ display: 'grid', gap: 0.5 }}>
            {data.total != null && (
              <Typography data-testid="choose-total" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.5 }}>
                {data.truncated ? `Showing ${data.candidates.length} of ${data.total} items` : `${data.total} item${data.total === 1 ? '' : 's'}`}{searched ? ' matching' : ' qualify'}{data.truncated ? ' — search to narrow.' : '.'}
              </Typography>
            )}
            {data.candidates.map((c) => (
              <Box key={c.id} component="label" onDoubleClick={() => { if (!busy && c.id !== data.chosenItemId) void save(c.id); }}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: 'var(--r-sm)', cursor: 'pointer', flexWrap: 'wrap', background: pick === c.id ? 'var(--c-surface-2)' : 'transparent', '&:hover': { background: 'var(--c-surface-2)' } }}>
                <Radio checked={pick === c.id} onChange={() => setPick(c.id)} size="small" inputProps={{ 'aria-label': c.code ?? c.name }} />
                <Mono sx={{ minWidth: 140 }}>{c.code}</Mono>
                <Typography sx={{ flex: 1, fontSize: 14, minWidth: 140 }}>{c.name}</Typography>
                {c.classificationName && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{c.classificationName}</Typography>}
                {c.isDefault && <StarRounded fontSize="small" sx={{ color: 'var(--c-warning-600)' }} titleAccess="Default" />}
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        {data?.chosenItemId && <Button onClick={() => save(null)} disabled={busy} sx={{ mr: 'auto' }}>Clear the choice</Button>}
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        {/* The system's pick, kept by a person, becomes theirs: the "default · change" tag goes. */}
        <Button variant="contained" data-testid="choose-use" onClick={() => save(pick)} disabled={busy || !pick || (pick === data?.chosenItemId && !data?.autoChosen)}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : pick != null && pick === data?.chosenItemId && data?.autoChosen ? 'Keep this item' : 'Use this item'}</Button>
      </DialogActions>
    </Dialog>
  );
}
