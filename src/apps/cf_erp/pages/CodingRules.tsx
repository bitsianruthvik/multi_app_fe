import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton,
  MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { Batch, CodeScheme, CodegenEntity, Condition, Generated, Movement, RecordList, SalesOrder, Segment, Specification, Tree, Machine } from '../api/types';
import { MOVEMENT_LABEL } from '../lib/inventory';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useLoad } from '../hooks/useLoad';
import { CapsLabel, EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, SkeletonRows, StatusBadge, Surface } from '../components/ui';
import { ClassificationPicker } from '../components/ClassificationPicker';
import { flattenTree } from '../lib/tree';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { DialogHeader } from '../components/FormDialog';

/** Entities whose names a rule can make; orders and machines only take codes. */
const NAMED = new Set(['item', 'definition']);

const SEGMENT_LABEL = { literal: 'Fixed text', token: 'Record value', sequence: 'Running number', date: 'Date' } as const;
const OPERATOR_LABEL: Record<string, string> = { eq: 'is', in: 'is one of', under: 'is under' };

function patternText(segments: Segment[]) {
  return segments.map((s) => {
    if (s.segmentType === 'literal') return s.literalText ?? '';
    if (s.segmentType === 'token') return `{${s.tokenKey ?? 'not chosen'}${s.format ? `:${s.format}` : ''}}`;
    if (s.segmentType === 'sequence') return `{${(s.format || '0').replace(/0/g, '#')}}`;
    return `{${s.format || 'YYYYMMDD'}}`;
  }).join('');
}

function conditionText(c: Condition, flat: ReturnType<typeof flattenTree>, defs: RecordList | null, entity?: CodegenEntity) {
  let v = c.value;
  if (c.tokenKey === 'classification') v = flat.find((n) => String(n.id) === c.value)?.path ?? c.value;
  if (c.tokenKey === 'definition') v = c.value.split(',').map((id) => defs?.rows.find((d) => String(d.id) === id.trim())?.code ?? id).join(', ');
  // The token's own words, not its key — the editor's dropdown shows the label too.
  const label = entity?.conditionTokens.find((t) => t.key === c.tokenKey)?.label ?? c.tokenKey;
  return `${label} ${OPERATOR_LABEL[c.operator] ?? c.operator} ${v}`;
}

interface Draft {
  code: string; name: string; entityType: string; targetField: 'code' | 'name'; seqScope: 'prefix' | 'scheme'; priority: string; status: 'active' | 'inactive';
  conditions: Condition[]; segments: Segment[];
}

function SchemeEditor({ open, onClose, onSaved, existing, entities, specs, tree, templates, canManage }: {
  open: boolean; onClose: () => void; onSaved: () => void; existing: CodeScheme | null; entities: CodegenEntity[]; specs: Specification[]; tree: Tree | null; templates: RecordList | null; canManage: boolean;
}) {
  const blank: Draft = { code: '', name: '', entityType: 'item', targetField: 'code', seqScope: 'prefix', priority: '0', status: 'active', conditions: [], segments: [{ segmentType: 'literal', literalText: '' }] };
  const [d, setD] = useState<Draft>(blank);
  const [sampleId, setSampleId] = useState<number | null>(null);
  const [preview, setPreview] = useState<Generated | null>(null);
  const [previewError, setPreviewError] = useState<CfApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  // Something real to preview the rule on: an order for order rules, else an item or a definition.
  const samples = useLoad(async (): Promise<{ rows: { id: number; code: string | null; name: string }[] }> => {
    if (d.entityType === 'machine') {
      const machines = await cfApi.get<Machine[]>('/machines');
      return { rows: machines.map((m) => ({ id: m.id, code: m.code, name: m.name })) };
    }
    if (d.entityType === 'sales_order') {
      const orders = await cfApi.get<SalesOrder[]>(`/orders${qs({ limit: 200 })}`);
      return { rows: orders.map((o) => ({ id: o.id, code: o.code, name: o.title ?? (o.orderType === 'stock' ? 'Stock order' : 'Customer order') })) };
    }
    if (d.entityType === 'stock_batch') {
      const batches = await cfApi.get<Batch[]>('/batches');
      return { rows: batches.map((b) => ({ id: b.id, code: b.code, name: `${b.item.code ?? b.item.name}${b.supplierRef ? ` · lot ${b.supplierRef}` : ''}` })) };
    }
    if (d.entityType === 'stock_movement') {
      const moves = await cfApi.get<Movement[]>(`/movements${qs({ limit: 200 })}`);
      return { rows: moves.map((m) => ({ id: m.id, code: m.code, name: `${MOVEMENT_LABEL[m.movementType]} · ${m.movementDate}` })) };
    }
    return cfApi.get<RecordList>(`/records${qs({ recordKind: d.entityType === 'definition' ? 'definition' : 'item', limit: 200 })}`);
  }, [d.entityType]);

  useEffect(() => {
    if (!open) return;
    setError(null); setPreview(null); setPreviewError(null); setSampleId(null);
    setD(existing ? {
      code: existing.code, name: existing.name, entityType: existing.entityType, targetField: existing.targetField, seqScope: existing.seqScope,
      priority: String(existing.priority), status: existing.status, conditions: existing.conditions, segments: existing.segments,
    } : blank);
  }, [open, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const entity = entities.find((e) => e.entityType === d.entityType);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setSeg = (i: number, patch: Partial<Segment>) => set({ segments: d.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...d.segments];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set({ segments: next });
  };
  const setCond = (i: number, patch: Partial<Condition>) => set({ conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const tokenOptions = useMemo(() => [
    ...(entity?.tokens ?? []).map((t) => ({ key: t.key, label: t.label, disabled: !t.available, note: t.note })),
    ...specs.filter((s) => s.status === 'active').map((s) => ({ key: `spec:${s.code}`, label: `${s.name} (spec ${s.code})`, disabled: false, note: undefined as string | undefined })),
  ], [entity, specs]);

  // Live preview against a sample record, rendering the unsaved rule; never takes a number.
  useEffect(() => {
    if (!open || !sampleId) { setPreview(null); return undefined; }
    const t = window.setTimeout(() => {
      cfApi.post<Generated>('/codegen/preview', {
        entityType: d.entityType, targetField: d.targetField, entityId: sampleId,
        scheme: { ...d, priority: Number(d.priority) || 0, id: existing?.id },
      }).then((g) => { setPreview(g); setPreviewError(null); }).catch((e) => { setPreview(null); setPreviewError(e); });
    }, 350);
    return () => window.clearTimeout(t);
  }, [d, sampleId, open, existing]);

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { ...d, priority: Number(d.priority) || 0 };
    try {
      if (existing) await cfApi.put(`/codegen/schemes/${existing.id}`, body);
      else await cfApi.post('/codegen/schemes', body);
      setBusy(false);
      onSaved();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="lg" fullWidth>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New coding rule'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr 1fr' }, gap: 2, mt: 1 }}>
          <TextField label="Code" required value={d.code} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase() })} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
          <TextField label="Name" required value={d.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField select label="Codes" value={d.entityType} onChange={(e) => set({ entityType: e.target.value, conditions: [], ...(NAMED.has(e.target.value) ? {} : { targetField: 'code' as const }) })}>
            {entities.map((e) => <MenuItem key={e.entityType} value={e.entityType}>{e.label}</MenuItem>)}
          </TextField>
          <TextField select label="Makes" value={d.targetField} onChange={(e) => set({ targetField: e.target.value as Draft['targetField'] })}>
            <MenuItem value="code">Their code</MenuItem>
            {NAMED.has(d.entityType) && <MenuItem value="name">Their name</MenuItem>}
          </TextField>
        </Box>

        <Surface sx={{ p: 2, mt: 2 }}>
          <Typography sx={{ fontWeight: 500 }}>Applies when</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1.5 }}>All conditions must hold. No conditions = every {entity?.label.toLowerCase() ?? 'record'}. When several rules apply, the most specific wins — a deeper classification counts as more specific.</Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {d.conditions.map((c, i) => {
              const token = entity?.conditionTokens.find((t) => t.key === c.tokenKey);
              return (
                <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '180px 150px 1fr auto', gap: 1, alignItems: 'center' }}>
                  <TextField select size="small" value={c.tokenKey} onChange={(e) => {
                    const t = entity?.conditionTokens.find((x) => x.key === e.target.value);
                    setCond(i, { tokenKey: e.target.value, operator: t?.operators[0] ?? 'eq', value: '' });
                  }}>
                    {(entity?.conditionTokens ?? []).map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value, value: '' })}>
                    {(token?.operators ?? ['eq']).map((o) => <MenuItem key={o} value={o}>{OPERATOR_LABEL[o] ?? o}</MenuItem>)}
                  </TextField>
                  {token?.valueKind === 'enum' ? (
                    c.operator === 'in' ? (
                      <Autocomplete multiple size="small" options={token.values ?? []} value={c.value ? c.value.split(',') : []}
                        onChange={(_, v) => setCond(i, { value: v.join(',') })} renderInput={(p) => <TextField {...p} placeholder="Choose" />} />
                    ) : (
                      <TextField select size="small" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>
                        {(token.values ?? []).map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                      </TextField>
                    )
                  ) : token?.valueKind === 'classification' ? (
                    <ClassificationPicker tree={tree} value={c.value ? Number(c.value) : null} leafOnly={c.operator === 'eq'}
                      scope={d.entityType === 'machine' ? 'machine' : undefined}
                      label={d.entityType === 'machine' ? (c.operator === 'eq' ? 'Machine type' : 'Machine level') : c.operator === 'eq' ? 'Variant' : 'Node'}
                      onChange={(id) => setCond(i, { value: id ? String(id) : '' })} />
                  ) : c.operator === 'in' ? (
                    <Autocomplete size="small" multiple options={templates?.rows ?? []} getOptionLabel={(o) => `${o.code ?? '—'} · ${o.name}`}
                      value={(templates?.rows ?? []).filter((o) => c.value.split(',').includes(String(o.id)))}
                      onChange={(_, v) => setCond(i, { value: v.map((o) => o.id).join(',') })}
                      renderInput={(p) => <TextField {...p} placeholder="Template definitions" />} />
                  ) : (
                    <Autocomplete size="small" options={templates?.rows ?? []} getOptionLabel={(o) => `${o.code ?? '—'} · ${o.name}`}
                      value={(templates?.rows ?? []).find((o) => String(o.id) === c.value) ?? null}
                      onChange={(_, v) => setCond(i, { value: v ? String(v.id) : '' })}
                      renderInput={(p) => <TextField {...p} placeholder="Template definition" />} />
                  )}
                  <IconButton aria-label="Remove condition" onClick={() => set({ conditions: d.conditions.filter((_, j) => j !== i) })}><DeleteOutlineRounded /></IconButton>
                </Box>
              );
            })}
          </Box>
          <Button size="small" startIcon={<AddRounded />} sx={{ mt: 1 }} disabled={!entity}
            onClick={() => set({ conditions: [...d.conditions, { tokenKey: entity?.conditionTokens[0]?.key ?? 'kind', operator: entity?.conditionTokens[0]?.operators[0] ?? 'eq', value: '' }] })}>
            Add condition
          </Button>
        </Surface>

        <Surface sx={{ p: 2, mt: 2 }}>
          <Typography sx={{ fontWeight: 500 }}>Pattern</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1.5 }}>Parts are joined in order. A running number restarts whenever the text before it changes — per parent, per month, per grade — unless it runs for the whole rule.</Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {d.segments.map((s, i) => (
              <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '190px 1fr 130px 110px 110px auto', gap: 1, alignItems: 'center' }}>
                <TextField select size="small" value={s.segmentType} onChange={(e) => setSeg(i, { segmentType: e.target.value as Segment['segmentType'], literalText: null, tokenKey: null, format: e.target.value === 'sequence' ? '000' : e.target.value === 'date' ? 'YYMM' : null })}>
                  {Object.entries(SEGMENT_LABEL).map(([k, label]) => <MenuItem key={k} value={k}>{label}</MenuItem>)}
                </TextField>
                {s.segmentType === 'literal' && <TextField size="small" placeholder="e.g. PL-" value={s.literalText ?? ''} onChange={(e) => setSeg(i, { literalText: e.target.value })} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />}
                {s.segmentType === 'token' && (
                  <Autocomplete size="small" options={tokenOptions} getOptionLabel={(o) => o.label} getOptionDisabled={(o) => o.disabled}
                    value={tokenOptions.find((o) => o.key === s.tokenKey) ?? null} onChange={(_, o) => setSeg(i, { tokenKey: o?.key ?? null })}
                    renderOption={(props, o) => <li {...props} key={o.key}><Box><Box>{o.label}</Box>{o.note && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{o.note}</Typography>}</Box></li>}
                    renderInput={(p) => <TextField {...p} placeholder="Choose a value" />} />
                )}
                {s.segmentType === 'sequence' && <TextField size="small" label="Digits" value={s.format ?? ''} onChange={(e) => setSeg(i, { format: e.target.value.replace(/[^0]/g, '') })} helperText="Zeros: 000 → 007" inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />}
                {s.segmentType === 'date' && <TextField size="small" label="Format" value={s.format ?? ''} onChange={(e) => setSeg(i, { format: e.target.value.toUpperCase() })} helperText="YYYY YY MM DD" inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />}
                {s.segmentType === 'token' ? (
                  <TextField select size="small" label="Letters" value={s.transform ?? 'none'} onChange={(e) => setSeg(i, { transform: e.target.value as Segment['transform'] })}>
                    <MenuItem value="none">As they are</MenuItem><MenuItem value="upper">UPPER</MenuItem><MenuItem value="lower">lower</MenuItem>
                  </TextField>
                ) : <Box />}
                {s.segmentType === 'token' ? (
                  <TextField size="small" label="Max length" type="number" value={s.maxLength ?? ''} onChange={(e) => setSeg(i, { maxLength: e.target.value ? Number(e.target.value) : null })} />
                ) : <Box />}
                {s.segmentType === 'token' ? (
                  <Tooltip title="For numbers: 00 pads 1 to 01, 0.00 fixes two decimals. Empty = as it is.">
                    <TextField size="small" label="Number" value={s.format ?? ''} onChange={(e) => setSeg(i, { format: e.target.value.replace(/[^0.]/g, '') || null })} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
                  </Tooltip>
                ) : <Box />}
                <Box sx={{ display: 'flex' }}>
                  <IconButton size="small" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label="Move down" disabled={i === d.segments.length - 1} onClick={() => move(i, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton>
                  <IconButton size="small" aria-label="Remove part" onClick={() => set({ segments: d.segments.filter((_, j) => j !== i) })}><DeleteOutlineRounded fontSize="small" /></IconButton>
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {(['literal', 'token', 'sequence', 'date'] as const).map((t) => (
              <Button key={t} size="small" startIcon={<AddRounded />} onClick={() => set({ segments: [...d.segments, { segmentType: t, format: t === 'sequence' ? '000' : t === 'date' ? 'YYMM' : null }] })}>{SEGMENT_LABEL[t]}</Button>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, mt: 2 }}>
            <TextField select size="small" label="Running number restarts" value={d.seqScope} onChange={(e) => set({ seqScope: e.target.value as Draft['seqScope'] })}>
              <MenuItem value="prefix">When the text before it changes</MenuItem>
              <MenuItem value="scheme">Never — one sequence for the rule</MenuItem>
            </TextField>
            <TextField size="small" label="Priority" type="number" value={d.priority} onChange={(e) => set({ priority: e.target.value })} helperText="Only breaks a tie between equally specific rules" />
            <TextField select size="small" label="Status" value={d.status} onChange={(e) => set({ status: e.target.value as Draft['status'] })}>
              <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          </Box>
        </Surface>

        <Surface sx={{ p: 2, mt: 2, background: 'var(--c-surface-2)' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'center' }}>
            <Autocomplete size="small" options={samples.data?.rows ?? []} getOptionLabel={(o) => `${o.code ?? '—'} · ${o.name}`}
              value={(samples.data?.rows ?? []).find((o) => o.id === sampleId) ?? null} onChange={(_, o) => setSampleId(o?.id ?? null)}
              noOptionsText={samples.error ? 'Could not load records to preview against' : 'Nothing to preview against yet'}
              renderInput={(p) => <TextField {...p} label="Preview against a record"
                helperText={samples.error ? samples.error.message : undefined} error={!!samples.error} />} />
            <Box>
              <CapsLabel>Would produce</CapsLabel>
              <Box sx={{ mt: 0.5 }}>
                {!sampleId ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Choose a record — nothing is saved and no number is taken.</Typography>
                  : previewError ? <Typography sx={{ fontSize: 13, color: 'var(--c-danger-600)' }}>{previewError.problems.length ? previewError.problems.join(' · ') : previewError.message}</Typography>
                    : preview?.text ? <Mono sx={{ fontSize: 16, color: 'var(--c-text)' }}>{preview.text}</Mono>
                      : preview?.missing?.length ? <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>That record has no value for {preview.missing.join(', ')}</Typography>
                        : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>…</Typography>}
              </Box>
            </Box>
          </Box>
        </Surface>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{canManage ? 'Cancel' : 'Close'}</Button>
        {canManage && (
          <Button variant="contained" onClick={save} disabled={busy || !d.code.trim() || !d.name.trim() || !d.segments.length}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save rule' : 'Create rule'}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Settings (DESIGN_SYSTEM.md §4.10) for the code generator module: how items
 * and definitions get their codes and names. Rules are grouped by what they
 * code; each shows when it applies, its pattern, and where its counters stand.
 */
export default function CodingRules() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_codegen_manage');
  const schemes = useLoad(() => cfApi.get<CodeScheme[]>('/codegen/schemes'), []);
  const entities = useLoad(() => cfApi.get<CodegenEntity[]>('/codegen/entities'), []);
  const specs = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const templates = useLoad(() => cfApi.get<RecordList>(`/records${qs({ recordKind: 'definition', kind: 'template', limit: 500 })}`), []);
  const [editor, setEditor] = useState<{ open: boolean; scheme: CodeScheme | null }>({ open: false, scheme: null });
  const [toDelete, setToDelete] = useState<CodeScheme | null>(null);
  const flat = useMemo(() => flattenTree(tree.data), [tree.data]);

  const groups = useMemo(() => {
    const out: { key: string; title: string; rows: CodeScheme[]; entity: CodegenEntity }[] = [];
    for (const e of entities.data ?? []) {
      for (const target of (NAMED.has(e.entityType) ? ['code', 'name'] : ['code']) as ('code' | 'name')[]) {
        const rows = (schemes.data ?? []).filter((s) => s.entityType === e.entityType && s.targetField === target);
        out.push({ key: `${e.entityType}-${target}`, title: `${e.label} — ${target === 'code' ? 'codes' : 'names'}`, rows, entity: e });
      }
    }
    return out;
  }, [schemes.data, entities.data]);

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <PageHeader title="Coding rules" subtitle="How items, definitions, orders, machines, batches and stock documents get their codes (and items and definitions their names). A rule applies when its conditions hold and builds text from its pattern; running numbers never repeat."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditor({ open: true, scheme: null })}>New rule</Button>} />
      <ErrorNotice error={schemes.error} onRetry={schemes.reload} />
      {/* Without this, a failed /codegen/entities leaves no groups and the page
          claims nothing uses the code generator. */}
      <ErrorNotice error={entities.error} onRetry={entities.reload} />
      {(schemes.loading && !schemes.data) || (entities.loading && !entities.data) ? <SkeletonRows rows={5} height={64} /> : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {groups.map((g) => (
            <SectionCard key={g.key} title={g.title}>
              {g.rows.length === 0 ? (
                <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>No rule — these are typed in by hand.</Typography>
              ) : (
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {g.rows.map((s) => (
                    <Box key={s.id} role="button" tabIndex={0} aria-label={`${s.code} — ${s.name}`} onClick={() => setEditor({ open: true, scheme: s })}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditor({ open: true, scheme: s }); } }}
                      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px 1fr 1fr auto auto' }, gap: 2, alignItems: 'center', p: 1.25, borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid var(--c-divider)', '&:hover, &:focus-visible': { background: 'var(--c-surface-2)' } }}>
                      <Box>
                        <Mono>{s.code}</Mono>
                        <Typography sx={{ fontSize: 13 }}>{s.name}</Typography>
                      </Box>
                      <Box>
                        <CapsLabel>Pattern</CapsLabel>
                        <Mono sx={{ fontSize: 13, color: 'var(--c-text)' }}>{patternText(s.segments)}</Mono>
                      </Box>
                      <Box>
                        <CapsLabel>Applies when</CapsLabel>
                        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{s.conditions.length ? s.conditions.map((c) => conditionText(c, flat, templates.data, g.entity)).join(' · ') : 'Always'}</Typography>
                      </Box>
                      <Tooltip title={s.counters.length ? s.counters.map((c) => `${c.prefix || '(whole rule)'} → next ${c.nextValue}`).join('\n') : 'No number handed out yet'}>
                        <Box><CapsLabel>Counters</CapsLabel><Mono>{s.counters.length}</Mono></Box>
                      </Tooltip>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={s.status} />
                        {canManage && <IconButton size="small" aria-label={`Delete ${s.code}`} onClick={() => setToDelete(s)}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </SectionCard>
          ))}
          {!groups.length && <Surface><EmptyState title="Nothing can be coded yet"
            body="Nothing in this company registers with the code generator, so there is nothing to write rules for. Reload the page; if it stays empty, tell an administrator." /></Surface>}
        </Box>
      )}
      <SchemeEditor open={editor.open} existing={editor.scheme} canManage={canManage} onClose={() => setEditor({ open: false, scheme: null })}
        onSaved={() => { toast.success('Coding rule saved.'); schemes.reload(); }}
        entities={entities.data ?? []} specs={specs.data ?? []} tree={tree.data} templates={templates.data} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.code}?`} danger confirmLabel="Delete"
        body="Records keep the codes they already have. Its counters are kept, so no number is ever handed out twice."
        onClose={() => setToDelete(null)} onConfirm={async () => { await cfApi.del(`/codegen/schemes/${toDelete?.id}`); toast.success('Deleted.'); schemes.reload(); }} />
    </Box>
  );
}
