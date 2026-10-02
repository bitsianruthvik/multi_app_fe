import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StarBorderRounded from '@mui/icons-material/StarBorderRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { Candidates, MasterRecord, ScreenTree, Selection, Specification } from '../api/types';
import { screenTreePath } from '../lib/classificationScreens';
import { useLoad } from '../hooks/useLoad';
import { EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows } from './ui';
import { RecordPicker } from './RecordPicker';
import { ClassificationPicker } from './ClassificationPicker';
import { SpecValueInput } from './SpecValueInput';
import { useToast } from './toastContext';

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  number: [{ value: 'eq', label: '=' }, { value: 'neq', label: '≠' }, { value: 'gt', label: '>' }, { value: 'gte', label: '≥' }, { value: 'lt', label: '<' }, { value: 'lte', label: '≤' }, { value: 'between', label: 'between' }],
  date: [{ value: 'eq', label: '=' }, { value: 'neq', label: '≠' }, { value: 'gt', label: 'after' }, { value: 'gte', label: 'on or after' }, { value: 'lt', label: 'before' }, { value: 'lte', label: 'on or before' }],
  text: [{ value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }],
  option: [{ value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' }],
  boolean: [{ value: 'eq', label: 'is' }],
};
const OP_TEXT: Record<string, string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', between: 'between' };

/**
 * How a Selection Definition finds its catalog item: it "picks from" a list of
 * entries (a classification branch, everything filed under it at any level, or
 * a single catalog item) and optional spec filters narrow what the entries
 * offer. The live result sits below, so the effect of each change is visible
 * at once. Filters on the same specification are OR'ed; on different
 * specifications, AND'ed.
 */
export function SelectionPanel({ record, canManage, onChanged }: { record: MasterRecord; canManage: boolean; onChanged: () => void }) {
  const toast = useToast();
  const sel = useLoad(() => cfApi.get<Selection>(`/definitions/${record.id}/selection`), [record.id]);
  // Typing in the check box asks the server after a short pause, so a person can see whether one item is in.
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = window.setTimeout(() => setTerm(search.trim()), 250); return () => window.clearTimeout(t); }, [search]);
  const cand = useLoad(() => cfApi.get<Candidates>(`/definitions/${record.id}/candidates${qs({ search: term || undefined })}`), [record.id, sel.data, term]);
  // Branches are chosen from the Items screen's tree, at any level.
  const itemsTree = useLoad(() => (canManage ? cfApi.get<ScreenTree>(screenTreePath('items')) : Promise.resolve(null)), [canManage]);
  const specs = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const [pick, setPick] = useState<MasterRecord | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const [specId, setSpecId] = useState<number | null>(null);
  const [operator, setOperator] = useState('eq');
  const [value, setValue] = useState('');
  const [valueTo, setValueTo] = useState('');
  const [error, setError] = useState<CfApiError | null>(null);

  const spec = useMemo(() => specs.data?.find((s) => s.id === specId) ?? null, [specs.data, specId]);
  const entries = sel.data?.entries ?? [];
  const itemIds = entries.flatMap((e) => (e.kind === 'item' && e.itemId != null ? [e.itemId] : []));
  /** Runs a change; true when it worked, so inputs are only cleared after a real save. */
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try { await fn(); toast.success(done); sel.reload(); onChanged(); return true; } catch (e) { setError(e as CfApiError); return false; }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <ErrorNotice error={error} />
      {/* Without this the whole panel simply vanished when the selection failed to load. */}
      <ErrorNotice error={sel.error} onRetry={sel.reload} />
      {sel.loading && !sel.data ? <SkeletonRows rows={3} /> : sel.data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <SectionCard title="Picks from" subtitle="Branches (everything filed under them) and single catalog items. What they offer together is what this selection can choose.">
            {canManage && (
              <Box sx={{ display: 'grid', gap: 1, mb: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Box sx={{ flex: 1 }}><ClassificationPicker tree={itemsTree.data} value={branch} onChange={setBranch} leafOnly={false} label="Branch to add" screen="items" /></Box>
                  <Button startIcon={<AddRounded />} disabled={branch == null}
                    onClick={() => branch != null && act(() => cfApi.post(`/definitions/${record.id}/scope`, { nodeId: branch }), 'Branch added.').then((ok) => { if (ok) setBranch(null); })}>Add branch</Button>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Box sx={{ flex: 1 }}><RecordPicker kinds={['catalog']} value={pick} onChange={setPick} excludeIds={itemIds} label="Item to add" /></Box>
                  <Button startIcon={<AddRounded />} disabled={!pick}
                    onClick={() => pick && act(() => cfApi.post(`/definitions/${record.id}/scope`, { itemId: pick.id }), `${pick.code ?? pick.name} added.`).then((ok) => { if (ok) setPick(null); })}>Add item</Button>
                </Box>
              </Box>
            )}
            {entries.length === 0 ? (
              <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13 }}>
                Picks from nothing yet — add a branch (everything filed under it) or single catalog items. The first item added becomes the default.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {entries.map((e) => {
                  const label = e.code ?? e.name ?? 'entry';
                  return (
                    <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
                      {e.kind === 'node' ? (
                        <>
                          <AccountTreeRounded fontSize="small" sx={{ color: 'var(--c-text-2)', mx: 0.75 }} />
                          <Box sx={{ flex: 1 }}>
                            {e.name} {e.level && <Mono muted>{e.level}</Mono>}
                            {e.path && <Typography component="div" sx={{ color: 'var(--c-text-2)', fontSize: 12 }}>{e.path}</Typography>}
                          </Box>
                        </>
                      ) : (
                        <>
                          <Tooltip title={e.isDefault ? 'The default choice — click to remove the star' : canManage ? 'Make this the default' : 'Not the default'}>
                            <Box component="span" sx={{ display: 'inline-flex' }}>
                              <IconButton size="small" disabled={!canManage} aria-label={e.isDefault ? `Remove the default star from ${label}` : `Make ${label} the default`}
                                onClick={() => act(() => cfApi.post(`/selection-scope/${e.id}/default`, e.isDefault ? { isDefault: false } : {}), e.isDefault ? `${label} is no longer the default.` : `${label} is now the default.`)}>
                                {e.isDefault ? <StarRounded sx={{ color: 'var(--c-warning-600)' }} fontSize="small" /> : <StarBorderRounded fontSize="small" />}
                              </IconButton>
                            </Box>
                          </Tooltip>
                          <Mono sx={{ minWidth: 150 }}>{e.code}</Mono>
                          <Box sx={{ flex: 1 }}>{e.name}{e.path && <Mono muted> {e.path}</Mono>}</Box>
                        </>
                      )}
                      {canManage && <IconButton size="small" aria-label={`Remove ${e.name ?? label}`} onClick={() => act(() => cfApi.del(`/selection-scope/${e.id}`), `${e.name ?? label} removed.`)}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                    </Box>
                  );
                })}
              </Box>
            )}
          </SectionCard>

          <SectionCard title="Spec filters" subtitle="Optional. Narrow what the entries offer — filters on one specification are OR'ed; different specifications must all match.">
            {canManage && (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr 1fr', gap: 1, mb: 1 }}>
                  <Autocomplete size="small" options={(specs.data ?? []).filter((s) => s.status === 'active')} value={spec}
                    getOptionLabel={(s) => `${s.name} (${s.code})`} onChange={(_, s) => { setSpecId(s?.id ?? null); setOperator('eq'); setValue(''); setValueTo(''); }}
                    noOptionsText={specs.error ? 'Could not load specifications' : 'No specification'}
                    renderInput={(p) => <TextField {...p} label="Specification" error={!!specs.error} helperText={specs.error?.message} />} />
                  <TextField select size="small" label="Test" value={operator} onChange={(e) => setOperator(e.target.value)} disabled={!spec}>
                    {(OPERATORS[spec?.dataType ?? 'number'] ?? []).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                  </TextField>
                  {spec ? <SpecValueInput dataType={spec.dataType} unit={spec.defaultUom} options={spec.options} value={value} onChange={setValue} label="Value" /> : <TextField size="small" label="Value" disabled />}
                  {operator === 'between' && <Box sx={{ gridColumn: '3' }}><SpecValueInput dataType="number" unit={spec?.defaultUom} value={valueTo} onChange={setValueTo} label="and" /></Box>}
                </Box>
                {/* "between" needs both ends: without valueTo the criterion is half-written. */}
                <Button startIcon={<AddRounded />} disabled={!spec || value === '' || (operator === 'between' && valueTo === '')} sx={{ mb: 1.5 }}
                  onClick={() => act(() => cfApi.post(`/definitions/${record.id}/criteria`, { specificationId: specId, operator, value, valueTo: operator === 'between' ? valueTo : undefined }), 'Criterion added.').then((ok) => { if (ok) { setValue(''); setValueTo(''); } })}>
                  Add criterion
                </Button>
              </>
            )}
            {sel.data.criteria.length === 0 ? (
              <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13 }}>
                {canManage ? 'No filters — everything the entries offer qualifies. Add one, e.g. THICKNESS ≥ 10, to narrow it.' : 'No filters.'}
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {sel.data.criteria.map((c) => (
                  <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
                    <Box sx={{ flex: 1 }}>
                      {c.specName} <Mono muted>{c.specCode}</Mono> {OP_TEXT[c.operator]} <Mono>{String(c.value)}{c.operator === 'between' ? ` – ${c.valueTo}` : ''}{c.unit ? ` ${c.unit}` : ''}</Mono>
                    </Box>
                    {canManage && <IconButton size="small" aria-label="Remove criterion" onClick={() => act(() => cfApi.del(`/criteria/${c.id}`), 'Criterion removed.')}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        </Box>
      )}

      <SectionCard title="Resolves to now" subtitle="Active catalog items this selection would offer today, default first, with the values that matched.">
        <TextField size="small" label="Check an item" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name" sx={{ mb: 1.5, maxWidth: 320 }} />
        <ErrorNotice error={cand.error} onRetry={cand.reload} />
        {cand.loading && !cand.data ? <SkeletonRows rows={2} /> : cand.data && (cand.data.candidates.length === 0 ? (
          <EmptyState title={term ? 'Nothing here matches that' : 'No item qualifies yet'} body={cand.data.note ?? (term ? 'It is not offered by this selection, or the search text is off.' : 'Add a branch or items, or loosen the spec filters.')} />
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {cand.data.total != null && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {cand.data.total} {cand.data.total === 1 ? 'item qualifies' : 'items qualify'}{term ? ` for “${term}”` : ''}.
                {cand.data.truncated && ` Showing ${cand.data.candidates.length} of ${cand.data.total}.`}
              </Typography>
            )}
            {cand.data.candidates.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 'var(--r-sm)', background: c.isDefault ? 'var(--c-surface-2)' : 'transparent' }}>
                {c.isDefault ? <StarRounded sx={{ color: 'var(--c-warning-600)' }} fontSize="small" /> : <Box sx={{ width: 20 }} />}
                <Mono sx={{ minWidth: 150 }}>{c.code}</Mono>
                <Box sx={{ flex: 1 }}>{c.name}</Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  {c.matchedValues.map((v) => <Mono key={v.specCode} muted>{v.specCode} {String(v.value)}{v.unit ? ` ${v.unit}` : ''}</Mono>)}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </SectionCard>
    </Box>
  );
}
