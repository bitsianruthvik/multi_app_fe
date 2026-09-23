import { useMemo, useState } from 'react';
import { Autocomplete, Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StarBorderRounded from '@mui/icons-material/StarBorderRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { Candidates, MasterRecord, RecordList, Selection, Specification } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows } from './ui';
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
 * How a Selection Definition finds its catalog item: an allowed list,
 * matching criteria, or both — with the live result, so the effect of each
 * change is visible immediately. Criteria on the same specification are OR'ed;
 * on different specifications, AND'ed.
 */
export function SelectionPanel({ record, onChanged }: { record: MasterRecord; onChanged: () => void }) {
  const toast = useToast();
  const mode = record.definition?.selectionMode ?? 'allowed_list';
  const sel = useLoad(() => cfApi.get<Selection>(`/definitions/${record.id}/selection`), [record.id]);
  const cand = useLoad(() => cfApi.get<Candidates>(`/definitions/${record.id}/candidates`), [record.id, sel.data]);
  const catalog = useLoad(() => cfApi.get<RecordList>(`/records${qs({ recordKind: 'item', kind: 'catalog', limit: 500 })}`), []);
  const specs = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const [pick, setPick] = useState<MasterRecord | null>(null);
  const [specId, setSpecId] = useState<number | null>(null);
  const [operator, setOperator] = useState('eq');
  const [value, setValue] = useState('');
  const [valueTo, setValueTo] = useState('');
  const [error, setError] = useState<CfApiError | null>(null);

  const spec = useMemo(() => specs.data?.find((s) => s.id === specId) ?? null, [specs.data, specId]);
  const onList = new Set((sel.data?.allowedItems ?? []).map((a) => a.itemId));
  /** Runs a change; true when it worked, so inputs are only cleared after a real save. */
  const act = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try { await fn(); toast.success(done); sel.reload(); onChanged(); return true; } catch (e) { setError(e as CfApiError); return false; }
  };

  const usesList = mode === 'allowed_list' || mode === 'both';
  const usesCriteria = mode === 'spec_match' || mode === 'both';

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <ErrorNotice error={error} />
      {sel.loading && !sel.data ? <SkeletonRows rows={3} /> : sel.data && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <SectionCard title="Allowed list" subtitle={usesList ? 'Only these catalog items may be chosen.' : 'Not used in this mode — switch the mode under Details to use it.'}>
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
              <Autocomplete sx={{ flex: 1 }} size="small" value={pick} onChange={(_, v) => setPick(v)}
                options={(catalog.data?.rows ?? []).filter((r) => !onList.has(r.id) && r.status !== 'obsolete')}
                getOptionLabel={(r) => `${r.code ?? '—'} · ${r.name}`} renderInput={(p) => <TextField {...p} label="Add a catalog item" />} />
              <Button startIcon={<AddRounded />} disabled={!pick}
                onClick={() => pick && act(() => cfApi.post(`/definitions/${record.id}/allowed-items`, { itemId: pick.id, isDefault: onList.size === 0 }), `${pick.code} added.`).then((ok) => { if (ok) setPick(null); })}>Add</Button>
            </Box>
            {sel.data.allowedItems.length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>No items yet.</Typography> : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {sel.data.allowedItems.map((a) => (
                  <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
                    <Tooltip title={a.isDefault ? 'The default choice' : 'Make this the default'}>
                      <IconButton size="small" aria-label={a.isDefault ? 'Default' : `Make ${a.code} the default`} onClick={() => !a.isDefault && act(() => cfApi.post(`/allowed-items/${a.id}/default`), `${a.code} is now the default.`)}>
                        {a.isDefault ? <StarRounded sx={{ color: 'var(--c-warning-600)' }} fontSize="small" /> : <StarBorderRounded fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Mono sx={{ minWidth: 150 }}>{a.code}</Mono>
                    <Box sx={{ flex: 1 }}>{a.name}</Box>
                    <IconButton size="small" aria-label={`Remove ${a.code}`} onClick={() => act(() => cfApi.del(`/allowed-items/${a.id}`), `${a.code} removed.`)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>

          <SectionCard title="Matching criteria" subtitle={usesCriteria ? 'Criteria on one specification are OR’ed; different specifications must all match.' : 'Not used in this mode — switch the mode under Details to use it.'}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr 1fr', gap: 1, mb: 1 }}>
              <Autocomplete size="small" options={(specs.data ?? []).filter((s) => s.status === 'active')} value={spec}
                getOptionLabel={(s) => `${s.name} (${s.code})`} onChange={(_, s) => { setSpecId(s?.id ?? null); setOperator('eq'); setValue(''); setValueTo(''); }}
                renderInput={(p) => <TextField {...p} label="Specification" />} />
              <TextField select size="small" label="Test" value={operator} onChange={(e) => setOperator(e.target.value)} disabled={!spec}>
                {(OPERATORS[spec?.dataType ?? 'number'] ?? []).map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              {spec ? <SpecValueInput dataType={spec.dataType} unit={spec.defaultUom} options={spec.options} value={value} onChange={setValue} label="Value" /> : <TextField size="small" label="Value" disabled />}
              {operator === 'between' && <Box sx={{ gridColumn: '3' }}><SpecValueInput dataType="number" unit={spec?.defaultUom} value={valueTo} onChange={setValueTo} label="and" /></Box>}
            </Box>
            <Button startIcon={<AddRounded />} disabled={!spec || value === ''} sx={{ mb: 1.5 }}
              onClick={() => act(() => cfApi.post(`/definitions/${record.id}/criteria`, { specificationId: specId, operator, value, valueTo: operator === 'between' ? valueTo : undefined }), 'Criterion added.').then((ok) => { if (ok) { setValue(''); setValueTo(''); } })}>
              Add criterion
            </Button>
            {sel.data.criteria.length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>No criteria yet.</Typography> : (
              <Box sx={{ display: 'grid', gap: 0.5 }}>
                {sel.data.criteria.map((c) => (
                  <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
                    <Box sx={{ flex: 1 }}>
                      {c.specName} <Mono muted>{c.specCode}</Mono> {OP_TEXT[c.operator]} <Mono>{String(c.value)}{c.operator === 'between' ? ` – ${c.valueTo}` : ''}{c.unit ? ` ${c.unit}` : ''}</Mono>
                    </Box>
                    <IconButton size="small" aria-label="Remove criterion" onClick={() => act(() => cfApi.del(`/criteria/${c.id}`), 'Criterion removed.')}><DeleteOutlineRounded fontSize="small" /></IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        </Box>
      )}

      <SectionCard title="Resolves to now" subtitle="Active catalog items this selection would offer today, default first, with the values that matched.">
        <ErrorNotice error={cand.error} onRetry={cand.reload} />
        {cand.loading && !cand.data ? <SkeletonRows rows={2} /> : cand.data && (cand.data.candidates.length === 0 ? (
          <EmptyState title="No item qualifies yet" body={cand.data.note ?? 'Add items to the list or loosen the criteria.'} />
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
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
