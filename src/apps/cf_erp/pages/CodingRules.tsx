import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton,
  MenuItem, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { CodeScheme, CodegenEntity, CodegenExplain, Condition, Generated, MasterRecord, RecordList, RuleSelection, Segment, Specification, Tree } from '../api/types';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useLoad } from '../hooks/useLoad';
import { CapsLabel, EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, SkeletonRows, StatusBadge, Surface } from '../components/ui';
import { ClassificationPicker } from '../components/ClassificationPicker';
import { RecordPicker } from '../components/RecordPicker';
import { ServerMultiPicker } from '../components/ServerMultiPicker';
import { flattenTree } from '../lib/tree';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { DialogHeader } from '../components/FormDialog';
import { SamplePicker, type SampleRow } from '../components/CodingRules/SamplePicker';
import { TokenPalette } from '../components/CodingRules/TokenPalette';
import { PatternParts } from '../components/CodingRules/PatternParts';
import { WhichRuleWins } from '../components/CodingRules/WhichRuleWins';
import { OPERATOR_LABEL, cap, conditionSentence, entityWords, paletteEntries, patternSentence, patternText, tokenPhrase } from '../components/CodingRules/guide';
import { displayLabel } from '../lib/displayCode';

/** Templates matching what is typed, from the server — used by the condition pickers. */
const searchTemplates = async (term: string) => (await cfApi.get<RecordList>(`/records${qs({ kinds: 'template', search: term, limit: 30, usable: 1 })}`)).rows;

/** Entities whose names a rule can make; orders and machines only take codes. */
const NAMED = new Set(['item', 'definition']);

interface Draft {
  code: string; name: string; entityType: string; targetField: 'code' | 'name'; seqScope: 'prefix' | 'scheme'; priority: string; status: 'active' | 'inactive';
  conditions: Condition[]; segments: Segment[];
}

/** Under "This rule would make": whether the chosen record really gets this rule's code, in words. */
function takenNote(sel: RuleSelection | undefined, what: string): { ok: boolean; text: string } | null {
  const mine = sel?.rules.find((r) => r.draft);
  if (!sel || !mine) return null;
  const other = sel.winner && !sel.winner.draft ? sel.winner.code : null;
  const elsewhere = other ? `It takes its ${what} from ${other}.` : `No rule does, so its ${what} is typed in by hand.`;
  switch (mine.verdict) {
    case 'wins': return { ok: true, text: 'This record gets it — this rule wins here.' };
    case 'tied': return { ok: false, text: `But no ${what} can be made for this record: this rule ties with another. See which rule wins, below.` };
    case 'beaten': return { ok: false, text: `But this record takes its ${what} from ${other}, which wins. See which rule wins, below.` };
    case 'no': return { ok: false, text: `This rule does not apply to this record. ${elsewhere}` };
    case 'off': return { ok: false, text: `This rule is switched off. ${elsewhere}` };
    default: return { ok: false, text: 'Finish this rule’s conditions to see whether this record gets it.' };
  }
}

function SchemeEditor({ open, onClose, onSaved, existing, entities, specs, tree, templates, onKnown, canManage }: {
  open: boolean; onClose: () => void; onSaved: () => void; existing: CodeScheme | null; entities: CodegenEntity[]; specs: Specification[]; tree: Tree | null; templates: RecordList | null; onKnown: (rows: MasterRecord[]) => void; canManage: boolean;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const blank: Draft = { code: '', name: '', entityType: 'item', targetField: 'code', seqScope: 'prefix', priority: '0', status: 'active', conditions: [], segments: [] };
  const [d, setD] = useState<Draft>(blank);
  const [sample, setSample] = useState<SampleRow | null>(null);
  const [preview, setPreview] = useState<Generated | null>(null);
  const [previewError, setPreviewError] = useState<CfApiError | null>(null);
  const [explain, setExplain] = useState<CodegenExplain | null>(null);
  const [explainError, setExplainError] = useState<CfApiError | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const flat = useMemo(() => flattenTree(tree), [tree]);
  const templateById = (id: string) => templates?.rows.find((o) => String(o.id) === id);

  useEffect(() => {
    if (!open) return;
    setError(null); setPreview(null); setPreviewError(null); setExplain(null); setExplainError(null); setSample(null);
    setD(existing ? {
      code: existing.code, name: existing.name, entityType: existing.entityType, targetField: existing.targetField, seqScope: existing.seqScope,
      priority: String(existing.priority), status: existing.status, conditions: existing.conditions, segments: existing.segments,
    } : blank);
  }, [open, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const entity = entities.find((e) => e.entityType === d.entityType);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setCond = (i: number, patch: Partial<Condition>) => set({ conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const keys = useMemo(() => paletteEntries(entity, specs).map((e) => e.key), [entity, specs]);
  const what = d.targetField === 'name' ? 'name' : 'code';

  // Against the chosen record, for the unsaved rule: what it would make (the
  // preview), and — from one explain call — which rule wins, what each part
  // prints and what each value holds. Neither takes a number or saves anything.
  // A reply that arrives after a newer request is dropped.
  const asked = useRef(0);
  useEffect(() => {
    if (!open || !sample) {
      setPreview(null); setPreviewError(null); setExplain(null); setExplainError(null); setExplaining(false);
      return undefined;
    }
    const n = ++asked.current;
    setExplaining(true);
    const t = window.setTimeout(() => {
      const scheme = { ...d, priority: Number(d.priority) || 0, id: existing?.id };
      const subject = { entityType: d.entityType, targetField: d.targetField, entityId: sample.id };
      cfApi.post<Generated>('/codegen/preview', { ...subject, scheme })
        .then((g) => { if (n === asked.current) { setPreview(g); setPreviewError(null); } })
        .catch((e) => { if (n === asked.current) { setPreview(null); setPreviewError(e); } });
      cfApi.post<CodegenExplain>('/codegen/explain', { ...subject, scheme, keys })
        .then((x) => { if (n === asked.current) { setExplain(x); setExplainError(null); } })
        .catch((e) => { if (n === asked.current) { setExplain(null); setExplainError(e); } })
        .finally(() => { if (n === asked.current) setExplaining(false); });
    }, 350);
    return () => window.clearTimeout(t);
  }, [d, sample, open, existing, keys]);

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

  const sentence = patternSentence(d.segments, entity, specs, d.seqScope);
  const note = takenNote(explain?.selection, what);

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="lg" fullWidth fullScreen={phone}>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New coding rule'}</>}
        subtitle="Build the pattern from pieces, see it on a real record, and check which rule that record gets." onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr 1fr 1fr' }, gap: 2, mt: 1 }}>
          <TextField label="Code" required value={d.code} autoFocus onChange={(e) => set({ code: e.target.value.toUpperCase() })} slotProps={{ htmlInput: { style: { fontFamily: 'var(--font-mono)' } } }} />
          <TextField label="Name" required value={d.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField select label="Codes" value={d.entityType} onChange={(e) => { setSample(null); set({ entityType: e.target.value, conditions: [], ...(NAMED.has(e.target.value) ? {} : { targetField: 'code' as const }) }); }}>
            {entities.map((e) => <MenuItem key={e.entityType} value={e.entityType}>{e.label}</MenuItem>)}
          </TextField>
          <TextField select label="Makes" value={d.targetField} onChange={(e) => set({ targetField: e.target.value as Draft['targetField'] })}>
            <MenuItem value="code">Their code</MenuItem>
            {NAMED.has(d.entityType) && <MenuItem value="name">Their name</MenuItem>}
          </TextField>
          <TextField select label="Status" value={d.status} onChange={(e) => set({ status: e.target.value as Draft['status'] })}
            helperText={d.status === 'inactive' ? 'Switched off: never chosen' : undefined}>
            <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
        </Box>

        {/* The record everything below is shown against. Stays in view while the pattern is built. */}
        <Box sx={{
          position: { md: 'sticky' }, top: { md: 0 }, zIndex: 3, mt: 2, mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, py: 1.5,
          background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-divider)', borderBottom: '1px solid var(--c-divider)',
        }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            <SamplePicker entityType={d.entityType} value={sample} onChange={setSample} />
            <Box aria-live="polite" sx={{ minWidth: 0 }}>
              <CapsLabel>This rule would make</CapsLabel>
              <Box sx={{ mt: 0.5 }}>
                {!sample ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Choose a record — every piece then shows what it prints for it.</Typography>
                  : previewError ? <Typography sx={{ fontSize: 13, color: 'var(--c-danger-600)' }}>{previewError.problems.length ? previewError.problems.join(' · ') : previewError.message}</Typography>
                    : preview?.text ? <Mono sx={{ fontSize: 16, color: 'var(--c-text)', wordBreak: 'break-all' }}>{preview.text}</Mono>
                      : preview?.missing?.length ? <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>Nothing yet — that record has no value for {preview.missing.map((k) => tokenPhrase(k, entity, specs)).join(', ')}</Typography>
                        : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>…</Typography>}
              </Box>
              {sample && note && (
                <Typography sx={{ fontSize: 12, mt: 0.5, color: note.ok ? 'var(--c-success-800)' : 'var(--c-warning-800)' }}>{note.text}</Typography>
              )}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2, mt: 2, alignItems: 'start' }}>
          <Surface sx={{ p: 2, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 500 }}>Pattern</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1.25 }}>The parts are joined in order, with nothing in between unless you add it.</Typography>
            {sentence && (
              <Box sx={{ mb: 1.5, px: 1.5, py: 1, background: 'var(--c-primary-50)', borderRadius: 'var(--r-sm)' }}>
                <CapsLabel>Reads as</CapsLabel>
                <Typography sx={{ fontSize: 14, color: 'var(--c-text)' }}>{sentence}</Typography>
              </Box>
            )}
            <PatternParts segments={d.segments} onChange={(segments) => set({ segments })} entity={entity} specs={specs}
              parts={explain?.parts ?? null} hasSample={!!sample} pending={explaining} seqScope={d.seqScope} onSeqScope={(seqScope) => set({ seqScope })} />
          </Surface>
          <Surface sx={{ p: 2, minWidth: 0 }}>
            <TokenPalette entity={entity} specs={specs} values={explain?.values ?? null} hasSample={!!sample} pending={explaining}
              hasSequence={d.segments.some((s) => s.segmentType === 'sequence')} onAdd={(seg) => set({ segments: [...d.segments, seg] })} />
          </Surface>
        </Box>

        <Surface sx={{ p: 2, mt: 2 }}>
          <Typography sx={{ fontWeight: 500 }}>Applies when</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1.5 }}>
            All conditions must hold. With none, the rule applies to all {entityWords(entity)}. When several rules apply, the one whose conditions score the most points wins — each condition says what it scores.
          </Typography>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {d.conditions.map((c, i) => {
              const token = entity?.conditionTokens.find((t) => t.key === c.tokenKey);
              return (
                <Box key={i} sx={{ display: 'grid', gap: 0.5 }}>
                  <Box sx={{
                    display: 'grid', gap: 1, alignItems: 'center',
                    gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr) auto', md: '220px 150px minmax(0, 1fr) auto' },
                    gridTemplateAreas: { xs: '"tok op del" "val val val"', md: '"tok op val del"' },
                  }}>
                    <TextField select size="small" value={c.tokenKey} sx={{ gridArea: 'tok' }} slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: what to test` } }} onChange={(e) => {
                      const t = entity?.conditionTokens.find((x) => x.key === e.target.value);
                      setCond(i, { tokenKey: e.target.value, operator: t?.operators[0] ?? 'eq', value: '' });
                    }}>
                      {(entity?.conditionTokens ?? []).map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" value={c.operator} sx={{ gridArea: 'op' }} slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: how` } }} onChange={(e) => setCond(i, { operator: e.target.value, value: '' })}>
                      {(token?.operators ?? ['eq']).map((o) => <MenuItem key={o} value={o}>{OPERATOR_LABEL[o] ?? o}</MenuItem>)}
                    </TextField>
                    <Box sx={{ gridArea: 'val', minWidth: 0 }}>
                      {token?.valueKind === 'enum' ? (
                        c.operator === 'in' ? (
                          <Autocomplete multiple size="small" options={token.values ?? []} value={c.value ? c.value.split(',') : []}
                            onChange={(_, v) => setCond(i, { value: v.join(',') })} renderInput={(p) => <TextField {...p} placeholder="Choose" />} />
                        ) : (
                          <TextField select size="small" fullWidth value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: value` } }}>
                            {(token.values ?? []).map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
                          </TextField>
                        )
                      ) : token?.valueKind === 'classification' ? (
                        <ClassificationPicker tree={tree} value={c.value ? Number(c.value) : null} leafOnly={c.operator === 'eq'}
                          scope={d.entityType === 'machine' ? 'machine' : undefined}
                          label={d.entityType === 'machine' ? (c.operator === 'eq' ? 'Machine type' : 'Machine level') : c.operator === 'eq' ? 'Variant' : 'Node'}
                          onChange={(id) => setCond(i, { value: id ? String(id) : '' })} />
                      ) : c.operator === 'in' ? (
                        <ServerMultiPicker<MasterRecord> noun="template" placeholder="Template definitions" search={searchTemplates}
                          getId={(o) => o.id} getLabel={(o) => displayLabel(o)}
                          value={c.value.split(',').map((x) => templateById(x.trim())).filter((o): o is MasterRecord => !!o)}
                          onChange={(v) => { onKnown(v); setCond(i, { value: v.map((o) => o.id).join(',') }); }} />
                      ) : (
                        <RecordPicker kinds={['template']} label="Template definition" value={templateById(c.value) ?? null}
                          onChange={(v) => { if (v) onKnown([v]); setCond(i, { value: v ? String(v.id) : '' }); }} />
                      )}
                    </Box>
                    <IconButton aria-label={`Remove condition ${i + 1}`} sx={{ gridArea: 'del' }} onClick={() => set({ conditions: d.conditions.filter((_, j) => j !== i) })}><DeleteOutlineRounded /></IconButton>
                  </Box>
                  {token?.help && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{token.help}</Typography>}
                </Box>
              );
            })}
          </Box>
          <Button size="small" startIcon={<AddRounded />} sx={{ mt: 1 }} disabled={!entity?.conditionTokens.length}
            onClick={() => set({ conditions: [...d.conditions, { tokenKey: entity?.conditionTokens[0]?.key ?? 'kind', operator: entity?.conditionTokens[0]?.operators[0] ?? 'eq', value: '' }] })}>
            Add condition
          </Button>
        </Surface>

        <Surface sx={{ p: 2, mt: 2 }}>
          <WhichRuleWins selection={explain?.selection ?? null} loading={explaining} error={explainError} hasSample={!!sample} entity={entity}
            targetField={d.targetField} flat={flat} templates={templates} priority={d.priority} onPriority={(priority) => set({ priority })} />
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
 * code; each shows when it applies, its pattern read out as a sentence, and
 * where its counters stand.
 */
export default function CodingRules() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_codegen_manage');
  const schemes = useLoad(() => cfApi.get<CodeScheme[]>('/codegen/schemes'), []);
  const entities = useLoad(() => cfApi.get<CodegenEntity[]>('/codegen/entities'), []);
  const specs = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const tree = useLoad(() => cfApi.get<Tree>('/classification'), []);
  // Templates are never loaded as a list: pickers search the server, and the templates a rule's conditions
  // name are fetched by id so the sentences can show their codes.
  const [known, setKnown] = useState<MasterRecord[]>([]);
  const templates = useMemo<RecordList>(() => ({ total: known.length, rows: known }), [known]);
  const onKnown = (rows: MasterRecord[]) => setKnown((cur) => {
    const add = rows.filter((r) => !cur.some((c) => c.id === r.id));
    return add.length ? [...cur, ...add] : cur;
  });
  useEffect(() => {
    const need = new Set<string>();
    for (const sc of schemes.data ?? []) for (const c of sc.conditions) if (c.tokenKey === 'definition') for (const x of c.value.split(',')) if (x.trim()) need.add(x.trim());
    const missing = [...need].filter((id) => !known.some((r) => String(r.id) === id));
    if (!missing.length) return;
    Promise.all(missing.map((id) => cfApi.get<MasterRecord>(`/records/${id}`).catch(() => null)))
      .then((rows) => onKnown(rows.filter((r): r is MasterRecord => !!r)));
  }, [schemes.data]); // eslint-disable-line react-hooks/exhaustive-deps
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
                      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px minmax(0, 1fr) minmax(0, 1fr) auto auto' }, gap: 2, alignItems: 'center', p: 1.25, borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid var(--c-divider)', '&:hover, &:focus-visible': { background: 'var(--c-surface-2)' } }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Mono>{s.code}</Mono>
                        <Typography sx={{ fontSize: 13 }}>{s.name}</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <CapsLabel>Pattern</CapsLabel>
                        <Mono sx={{ fontSize: 13, color: 'var(--c-text)', wordBreak: 'break-all' }}>{patternText(s.segments)}</Mono>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>{patternSentence(s.segments, g.entity, specs.data ?? [], s.seqScope)}</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <CapsLabel>Applies when</CapsLabel>
                        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{s.conditions.length ? s.conditions.map((c) => cap(conditionSentence(c, g.entity, flat, templates))).join(' · ') : 'Always'}</Typography>
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
        entities={entities.data ?? []} specs={specs.data ?? []} tree={tree.data} templates={templates} onKnown={onKnown} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.code}?`} danger confirmLabel="Delete"
        body="Records keep the codes they already have. Its counters are kept, so no number is ever handed out twice."
        onClose={() => setToDelete(null)} onConfirm={async () => { await cfApi.del(`/codegen/schemes/${toDelete?.id}`); toast.success('Deleted.'); schemes.reload(); }} />
    </Box>
  );
}
