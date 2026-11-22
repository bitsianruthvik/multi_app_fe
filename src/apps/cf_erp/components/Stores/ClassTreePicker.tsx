import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Checkbox, Chip, IconButton, InputAdornment, Popover, TextField, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import type { LedgerGroup } from '../../api/storesDesk';
import { EMPTY_PICK, leavesOf, pickOf, pickWords, treeOf, type TreePick } from './classTree';

/**
 * FAMILY › SUB-FAMILY › VARIANT as ONE tree (user, 2026-11-23: "family->sub-family->variant combinations, I think those are
 * not captured the way you did it now. So rethink of the UI on this"). Three separate lists lost which sub-family was
 * meant under which family; here every tick is a place in the tree:
 *   tick a family      → all of it (its sub-families and variants tick with it)
 *   tick a sub-family  → all of that sub-family only
 *   tick a variant     → that variant only
 * A level with some of its children ticked shows a dash. The value is the smallest description of what is ticked — a
 * whole family as the family, a whole sub-family as the sub-family, else the variants — so the backend's lists
 * (familyIds / subfamilyIds / variantIds, read as "any of these") give exactly the ticked items. Chips say each pick as
 * its path, e.g. "Consumables › Painting".
 */
export function ClassTreePicker({ groups, value, onChange }: { groups: LedgerGroup[]; value: TreePick; onChange: (v: TreePick) => void }) {
  const tree = useMemo(() => treeOf(groups), [groups]);
  const leaves = useMemo(() => leavesOf(tree, value), [tree, value]);
  const words = useMemo(() => pickWords(groups, value), [groups, value]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const term = find.trim().toLowerCase();

  // two ticks before the page has re-rendered must both count: each builds on the last pick made here
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);
  const setLeaves = (ids: number[], on: boolean) => {
    const next = leavesOf(tree, latest.current);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    const p = pickOf(tree, next);
    latest.current = p;
    onChange(p);
  };
  const state = (ids: number[]) => {
    const n = ids.filter((id) => leaves.has(id)).length;
    return { checked: ids.length > 0 && n === ids.length, indeterminate: n > 0 && n < ids.length };
  };
  const toggleOpen = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const matches = (...names: string[]) => !term || names.some((x) => x.toLowerCase().includes(term));
  const remove = (kind: keyof TreePick, id: number) => { const p = { ...latest.current, [kind]: latest.current[kind].filter((x) => x !== id) }; latest.current = p; onChange(p); };

  const row = (depth: number) => ({ display: 'flex', alignItems: 'center', gap: 0.25, pl: depth * 2.5, pr: 1, minHeight: 34, '&:hover': { background: 'var(--c-neutral-50)' } });
  const count = (n: number) => <Typography component="span" sx={{ ml: 'auto', pl: 1, fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{n} item{n === 1 ? '' : 's'}</Typography>;

  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', minWidth: 0, flex: '1 1 320px' }} data-testid="class-tree">
      <Button variant="outlined" size="small" startIcon={<AccountTreeRounded />} endIcon={<ExpandMoreRounded />} onClick={(e) => setAnchor(e.currentTarget)} data-testid="class-tree-open">
        {words.length ? `Family › sub-family › variant (${words.length})` : 'Every family, sub-family and variant'}
      </Button>
      {words.map((w) => <Chip key={w.key} size="small" label={w.label} onDelete={() => remove(w.kind, w.id)} data-testid="class-pick" sx={{ maxWidth: '100%' }} />)}
      {words.length > 1 && <Button size="small" onClick={() => { latest.current = EMPTY_PICK; onChange(EMPTY_PICK); }} sx={{ color: 'var(--c-text-2)' }}>Clear</Button>}
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 'min(460px, calc(100vw - 32px))', maxHeight: 'min(560px, 70vh)', display: 'flex', flexDirection: 'column' } } }}>
        <Box sx={{ p: 1.25, borderBottom: '1px solid var(--c-divider)', display: 'grid', gap: 0.75 }}>
          <TextField size="small" autoFocus placeholder="Find a family, sub-family or variant" value={find} onChange={(e) => setFind(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Tick a family for all of it, a sub-family for all of that, or single variants.</Typography>
        </Box>
        <Box sx={{ overflowY: 'auto', py: 0.5 }} data-testid="class-tree-list">
          {tree.map((f) => {
            const fLeaves = f.subs.flatMap((s) => s.vars.map((v) => v.id));
            const fHit = matches(f.name) || f.subs.some((s) => matches(s.name) || s.vars.some((v) => matches(v.name)));
            if (!fHit) return null;
            const fOpen = open.has(`f${f.id}`) || !!term;
            return (
              <Box key={f.id}>
                <Box sx={row(0)}>
                  <IconButton size="small" onClick={() => toggleOpen(`f${f.id}`)} aria-label={fOpen ? 'Close' : 'Open'}>{fOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton>
                  <Checkbox size="small" {...state(fLeaves)} onChange={(e) => setLeaves(fLeaves, e.target.checked)} inputProps={{ 'aria-label': f.name }} />
                  <Box sx={{ fontWeight: 600, fontSize: 14, overflowWrap: 'anywhere' }}>{f.name}</Box>{count(f.items)}
                </Box>
                {fOpen && f.subs.map((s) => {
                  const sLeaves = s.vars.map((v) => v.id);
                  if (term && !matches(f.name, s.name) && !s.vars.some((v) => matches(v.name))) return null;
                  const sOpen = open.has(`s${s.id}`) || (!!term && !matches(s.name) && s.vars.some((v) => matches(v.name)));
                  return (
                    <Box key={s.id}>
                      <Box sx={row(1)}>
                        <IconButton size="small" onClick={() => toggleOpen(`s${s.id}`)} aria-label={sOpen ? 'Close' : 'Open'}>{sOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton>
                        <Checkbox size="small" {...state(sLeaves)} onChange={(e) => setLeaves(sLeaves, e.target.checked)} inputProps={{ 'aria-label': `${f.name} › ${s.name}` }} />
                        <Box sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{s.name}</Box>{count(s.items)}
                      </Box>
                      {sOpen && s.vars.filter((v) => !term || matches(f.name, s.name, v.name)).map((v) => (
                        <Box key={v.id} sx={row(2.4)}>
                          <Checkbox size="small" checked={leaves.has(v.id)} onChange={(e) => setLeaves([v.id], e.target.checked)} inputProps={{ 'aria-label': `${f.name} › ${s.name} › ${v.name}` }} />
                          <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{v.name}</Box>{count(v.items)}
                        </Box>
                      ))}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Box>
        <Box sx={{ p: 1, borderTop: '1px solid var(--c-divider)', display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Button size="small" onClick={() => { latest.current = EMPTY_PICK; onChange(EMPTY_PICK); }} disabled={!words.length}>Clear all</Button>
          <Button size="small" variant="contained" onClick={() => setAnchor(null)}>Done</Button>
        </Box>
      </Popover>
    </Box>
  );
}
