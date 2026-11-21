import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, TextField, Typography } from '@mui/material';
import { cfApi, qs } from '../../api/client';
import type { MasterRecord, RecordList, ScreenTree } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import { screenTreePath } from '../../lib/classificationScreens';
import { ClassificationLevelFilter } from '../ClassificationLevelFilter';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice, Mono, SkeletonRows } from '../ui';

export interface BrowsedItem { id: number; code: string | null; name: string; uom: string | null }
const PAGE = 150;

/**
 * BROWSE THE ITEM LIST (user, 2026-11-22): the second way to find an item — for someone who does not know its name.
 * Family › Sub-family › Variant narrow the catalog (a choice at any level narrows the others), a word narrows it
 * further, and any number of items are ticked and added in one go. It sits beside every item search of the Stores
 * desk (a new material request, a new purchase request, Give out); the search box stays the quick way.
 */
export function BrowseItemsDialog({ open, onClose, onAdd, excludeIds = [], addLabel = 'Add' }: {
  open: boolean; onClose: () => void; onAdd: (items: BrowsedItem[]) => void; excludeIds?: number[]; addLabel?: string;
}) {
  const [classificationId, setClassificationId] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Map<number, BrowsedItem>>(new Map());
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { const t = window.setTimeout(() => setSearch(typed.trim()), 300); return () => window.clearTimeout(t); }, [typed]);
  useEffect(() => { if (open) { setClassificationId(null); setTyped(''); setSearch(''); setPicked(new Map()); setLimit(PAGE); } }, [open]);
  useEffect(() => { setLimit(PAGE); }, [classificationId, search]);
  const tree = useLoad(() => (open ? cfApi.get<ScreenTree>(screenTreePath('items')) : Promise.resolve(null)), [open]);
  const list = useLoad(() => (open
    ? cfApi.get<RecordList>(`/records${qs({ kinds: 'catalog', usable: 1, status: 'active', classificationId: classificationId ?? undefined, search: search || undefined, limit })}`)
    : Promise.resolve(null)), [open, classificationId, search, limit]);
  const hidden = useMemo(() => new Set(excludeIds), [excludeIds]);
  const rows = (list.data?.rows ?? []).filter((r) => !hidden.has(r.id));
  const itemOf = (m: MasterRecord): BrowsedItem => ({ id: m.id, code: m.code ?? null, name: m.name, uom: m.item?.uom ?? null });
  const toggle = (m: MasterRecord) => setPicked((cur) => { const next = new Map(cur); if (next.has(m.id)) next.delete(m.id); else next.set(m.id, itemOf(m)); return next; });
  const allShown = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggleAll = () => setPicked((cur) => { const next = new Map(cur); if (allShown) rows.forEach((r) => next.delete(r.id)); else rows.forEach((r) => next.set(r.id, itemOf(r))); return next; });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogHeader title="Browse the item list" subtitle="Narrow by family, sub-family and variant, tick what you need, and add them together." onClose={onClose} />
      <DialogContent sx={{ display: 'grid', gap: 1.5, pt: 1 }} data-testid="browse-items">
        <ClassificationLevelFilter tree={tree.data} value={classificationId} onChange={setClassificationId} />
        <TextField size="small" label="A word from the name or the code (optional)" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <ErrorNotice error={list.error ?? tree.error} onRetry={list.reload} />
        {!list.data && !list.error && <SkeletonRows rows={6} />}
        {list.data && (
          <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-text-2)' }}>
              <Checkbox size="small" checked={allShown} indeterminate={!allShown && rows.some((r) => picked.has(r.id))} onChange={toggleAll} inputProps={{ 'aria-label': 'Tick every item shown' }} disabled={rows.length === 0} />
              <span>{rows.length} shown of {list.data.total}{list.data.total > rows.length ? ' — narrow it, or load more' : ''}</span>
              <Box sx={{ flex: 1 }} />
              <b>{picked.size} ticked</b>
            </Box>
            <Box sx={{ maxHeight: { xs: '46vh', md: 380 }, overflowY: 'auto' }}>
              {rows.length === 0 && <Typography sx={{ p: 2, fontSize: 13.5, color: 'var(--c-text-2)' }}>No item here. Choose another family or clear the word.</Typography>}
              {rows.map((r) => (
                <Box key={r.id} onClick={() => toggle(r)} data-testid="browse-row" sx={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, cursor: 'pointer', borderBottom: '1px solid var(--c-divider)', '&:hover': { background: 'var(--c-neutral-50)' } }}>
                  <Checkbox size="small" checked={picked.has(r.id)} tabIndex={-1} inputProps={{ 'aria-label': r.name }} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{r.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}><Mono muted>{r.code}</Mono></Typography>
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', pr: 1 }}>{r.item?.uom ?? ''}</Typography>
                </Box>
              ))}
              {list.data.rows.length >= limit && list.data.total > limit && (
                <Box sx={{ p: 1, textAlign: 'center' }}><Button size="small" onClick={() => setLimit((n) => n + PAGE)} disabled={list.loading}>{list.loading ? 'Loading…' : 'Load more'}</Button></Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={picked.size === 0} onClick={() => { onAdd([...picked.values()]); onClose(); }} data-testid="browse-add">{addLabel} {picked.size || ''} {picked.size === 1 ? 'item' : 'items'}</Button>
      </DialogActions>
    </Dialog>
  );
}
