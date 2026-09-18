/**
 * PickFilterFields — "the order chooses this item, from THESE catalog items".
 *
 * A pick line in a template (product owner, 2026-09-18): the line's child is a
 * template part — the ROLE, e.g. "Intermediate Stiffener" — and the filter says
 * which catalog items may fill it: a category, optionally narrowed to a group
 * and a sub-group ("Fabricated › Stiffeners › Plate Stiffeners"). The sales
 * order then picks exactly one. A default is optional; with none, each order
 * chooses (unless the filter holds exactly one item, which is then chosen).
 *
 * The count beside the fields comes from the same endpoint the server enforces
 * with, so "12 items match" is the list an order will actually be offered.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';

import { getPickCandidates, type PickCandidate, type PickFilterInput } from '../api/templates';
import { backendMessage } from '../components';
import { pickDraftOf, pickInputOf, type PickDraft, type PickTaxonomy } from './pickFilter';

export function PickFilterFields({ value, onChange, taxonomy }: {
  value: PickDraft;
  onChange: (next: PickDraft) => void;
  taxonomy: PickTaxonomy;
}) {
  const groups = useMemo(
    () => taxonomy.groups.filter((g) => value.categoryId !== '' && Number(g.categoryId) === Number(value.categoryId)),
    [taxonomy.groups, value.categoryId],
  );
  const subgroups = useMemo(
    () => taxonomy.subgroups.filter((s) => value.groupId !== '' && Number(s.groupId) === Number(value.groupId)),
    [taxonomy.subgroups, value.groupId],
  );

  const [matches, setMatches] = useState<PickCandidate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (value.categoryId === '') { setMatches(null); return; }
    let alive = true;
    setErr(null);
    getPickCandidates({
      categoryId: Number(value.categoryId),
      groupId: value.groupId === '' ? null : Number(value.groupId),
      subgroupId: value.subgroupId === '' ? null : Number(value.subgroupId),
    })
      .then((r) => { if (alive) setMatches(r.items ?? []); })
      .catch((e) => { if (alive) { setMatches([]); setErr(backendMessage(e, 'Could not count the matching items.')); } });
    return () => { alive = false; };
  }, [value.categoryId, value.groupId, value.subgroupId]);

  const defaultItem = matches?.find((m) => m.id === value.defaultItemId) ?? null;

  return (
    <Stack spacing={1.5}>
      <TextField select size="small" label="Pick from category" value={value.categoryId}
        onChange={(e) => onChange({ categoryId: e.target.value === '' ? '' : Number(e.target.value), groupId: '', subgroupId: '', defaultItemId: null })}>
        {taxonomy.categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
      </TextField>
      <Stack direction="row" spacing={1}>
        <TextField select size="small" label="Group (optional)" sx={{ flex: 1 }} disabled={value.categoryId === ''} value={value.groupId}
          onChange={(e) => onChange({ ...value, groupId: e.target.value === '' ? '' : Number(e.target.value), subgroupId: '', defaultItemId: null })}>
          <MenuItem value=""><em>Any group</em></MenuItem>
          {groups.map((g) => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Sub-group (optional)" sx={{ flex: 1 }} disabled={value.groupId === ''} value={value.subgroupId}
          onChange={(e) => onChange({ ...value, subgroupId: e.target.value === '' ? '' : Number(e.target.value), defaultItemId: null })}>
          <MenuItem value=""><em>Any sub-group</em></MenuItem>
          {subgroups.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
      </Stack>
      {value.categoryId !== '' && (
        <Typography sx={{ fontSize: 12.5, color: matches && matches.length === 0 ? 'var(--c-danger, #b42318)' : 'var(--c-text-2)' }}>
          {matches == null ? 'Counting…'
            : matches.length === 0 ? 'No catalog items match — an order would have nothing to choose from.'
              : `${matches.length}${matches.length >= 200 ? '+' : ''} catalog item${matches.length === 1 ? '' : 's'} match${matches.length === 1 ? 'es' : ''}.`}
        </Typography>
      )}
      {err && <Alert severity="warning">{err}</Alert>}
      <Autocomplete
        size="small"
        disabled={!matches?.length}
        options={matches ?? []}
        value={defaultItem}
        getOptionLabel={(o) => `${o.name} — ${o.code}`}
        isOptionEqualToValue={(o, v) => o.id === v.id}
        onChange={(_, v) => onChange({ ...value, defaultItemId: v ? v.id : null })}
        renderInput={(params) => (
          <TextField {...params} label="Default (optional)"
            helperText={matches?.length === 1 ? 'Only one item matches — it is chosen automatically.' : 'Blank = every order chooses.'} />
        )}
      />
    </Stack>
  );
}

/** Edit an existing line's pick, or make it an ordinary line again. */
export function PickFilterDialog({ open, title, initial, taxonomy, onClose, onSave }: {
  open: boolean;
  title: string;
  initial: PickFilterInput | null;
  taxonomy: PickTaxonomy;
  onClose: () => void;
  /** null = no longer a pick line. */
  onSave: (pick: PickFilterInput | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PickDraft>(pickDraftOf(initial));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setDraft(pickDraftOf(initial)); setErr(null); } }, [open, initial]);

  const save = async (pick: PickFilterInput | null) => {
    setSaving(true);
    setErr(null);
    try { await onSave(pick); } catch (e) { setErr(backendMessage(e, 'That could not be saved.')); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16 }}>{title}</DialogTitle>
      <DialogContent>
        {err && <Alert severity="warning" sx={{ mb: 2 }}>{err}</Alert>}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
          Each order chooses one catalog item from here for this row. The row keeps its own name, code and flow.
        </Typography>
        <PickFilterFields value={draft} onChange={setDraft} taxonomy={taxonomy} />
      </DialogContent>
      <DialogActions>
        {initial && (
          <Button color="inherit" disabled={saving} onClick={() => void save(null)} sx={{ mr: 'auto' }}>
            Make it an ordinary line
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Box>
          <Button variant="contained" disabled={saving || draft.categoryId === ''} onClick={() => void save(pickInputOf(draft))}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
