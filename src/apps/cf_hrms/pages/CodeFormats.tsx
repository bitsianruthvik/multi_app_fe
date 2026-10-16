import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton,
  MenuItem, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import {
  CapsLabel, ConfirmDialog, DialogHeader, EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, SkeletonRows,
  StatusBadge, Surface, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  codegenApi,
  type CodeScheme, type CodegenEntity, type CodegenExplain, type CodegenConditionToken, type Condition, type Generated,
  type RuleSelection, type SchemeInput, type Segment,
} from '../api/codegen';
import { orgApi } from '../api/organisation';
import { listRoles } from '../api/roles';
import { PatternParts } from '../components/CodingRules/PatternParts';
import { SamplePicker, type SampleRow } from '../components/CodingRules/SamplePicker';
import { TokenPalette } from '../components/CodingRules/TokenPalette';
import { WhichRuleWins } from '../components/CodingRules/WhichRuleWins';
import {
  OPERATOR_LABEL, cap, conditionSentence, emptyNames, entityWords, isLookupKind, paletteEntries, patternSentence, patternText, tokenPhrase,
  type LookupKind, type NameMaps,
} from '../components/CodingRules/guide';

/**
 * Code formats — how the codes of departments, roles, positions, locations,
 * employees and letters are built. The same screen as cf_erp's "Coding rules":
 * a rule applies when its conditions hold and builds text from its pattern;
 * running numbers never repeat. Codes here are never typed by hand — when no
 * rule applies, the built-in format is used.
 */

interface Draft {
  code: string;
  name: string;
  entityType: string;
  /** Not edited here, but carried: a save replaces the whole rule. */
  description: string | null;
  seqScope: 'prefix' | 'scheme';
  priority: string;
  status: 'active' | 'inactive';
  conditions: Condition[];
  segments: Segment[];
}

interface Lookup { id: number; name: string }
type Lookups = Record<LookupKind, Lookup[]>;

/** Under "This rule would make": whether the chosen record really gets this rule's code, in words. */
function takenNote(sel: RuleSelection | undefined): { ok: boolean; text: string } | null {
  const mine = sel?.rules.find((r) => r.draft);
  if (!sel || !mine) return null;
  const other = sel.winner && !sel.winner.draft ? sel.winner.code : null;
  const elsewhere = other ? `It takes its code from ${other}.` : 'No rule does, so the built-in format is used.';
  switch (mine.verdict) {
    case 'wins': return { ok: true, text: 'This record gets it — this rule wins here.' };
    case 'tied': return { ok: false, text: 'But no code can be made for this record: this rule ties with another. See which rule wins, below.' };
    case 'beaten': return { ok: false, text: `But this record takes its code from ${other}, which wins. See which rule wins, below.` };
    case 'no': return { ok: false, text: `This rule does not apply to this record. ${elsewhere}` };
    case 'off': return { ok: false, text: `This rule is switched off. ${elsewhere}` };
    default: return { ok: false, text: 'Finish this rule’s conditions to see whether this record gets it.' };
  }
}

const idsOf = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

/** The value box of one condition, by what kind of value the thing being tested holds. */
function ConditionValue({
  token, c, index, lookups, allowed, disabled, onChange,
}: {
  token: CodegenConditionToken | undefined; c: Condition; index: number; lookups: Lookups; allowed: Record<LookupKind, boolean>; disabled: boolean; onChange: (value: string) => void;
}) {
  const many = c.operator === 'in';
  const kind = token?.valueKind;
  if (isLookupKind(kind) && !allowed[kind]) {
    return <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>You cannot see these records.</Typography>;
  }
  if (isLookupKind(kind)) {
    const options = lookups[kind];
    return many ? (
      <Autocomplete
        multiple size="small" disabled={disabled} options={options} getOptionLabel={(o) => o.name} isOptionEqualToValue={(a, b) => a.id === b.id}
        value={options.filter((o) => idsOf(c.value).includes(String(o.id)))}
        onChange={(_, v) => onChange(v.map((o) => o.id).join(','))}
        renderInput={(p) => <TextField {...p} placeholder="Choose" />}
      />
    ) : (
      <Autocomplete
        size="small" disabled={disabled} options={options} getOptionLabel={(o) => o.name} isOptionEqualToValue={(a, b) => a.id === b.id}
        value={options.find((o) => String(o.id) === c.value) ?? null}
        onChange={(_, v) => onChange(v ? String(v.id) : '')}
        renderInput={(p) => <TextField {...p} placeholder="Choose" />}
      />
    );
  }
  if (token?.values?.length) {
    return many ? (
      <Autocomplete
        multiple size="small" disabled={disabled} options={token.values} value={c.value ? c.value.split(',') : []}
        onChange={(_, v) => onChange(v.join(','))} renderInput={(p) => <TextField {...p} placeholder="Choose" />}
      />
    ) : (
      <TextField select size="small" fullWidth disabled={disabled} value={c.value} onChange={(e) => onChange(e.target.value)}
        slotProps={{ htmlInput: { 'aria-label': `Condition ${index + 1}: value` } }}>
        {token.values.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
    );
  }
  return (
    <TextField size="small" fullWidth disabled={disabled} value={c.value} onChange={(e) => onChange(e.target.value)}
      slotProps={{ htmlInput: { 'aria-label': `Condition ${index + 1}: value` } }} />
  );
}

function SchemeEditor({
  open, onClose, onSaved, existing, entities, lookups, allowed, names, canManage,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; existing: CodeScheme | null; entities: CodegenEntity[]; lookups: Lookups; allowed: Record<LookupKind, boolean>; names: NameMaps; canManage: boolean;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const blank = (): Draft => ({
    code: '', name: '', entityType: entities[0]?.entityType ?? '', description: null, seqScope: 'prefix', priority: '0', status: 'active', conditions: [], segments: [],
  });
  const [d, setD] = useState<Draft>(blank);
  const [sample, setSample] = useState<SampleRow | null>(null);
  const [preview, setPreview] = useState<Generated | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [explain, setExplain] = useState<CodegenExplain | null>(null);
  const [explainError, setExplainError] = useState<unknown>(null);
  const [explaining, setExplaining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setPreview(null); setPreviewError(null); setExplain(null); setExplainError(null); setSample(null);
    setD(existing ? {
      code: existing.code, name: existing.name, entityType: existing.entityType, description: existing.description ?? null, seqScope: existing.seqScope,
      priority: String(existing.priority), status: existing.status,
      conditions: existing.conditions.map((c) => ({ tokenKey: c.tokenKey, operator: c.operator, value: c.value })),
      segments: existing.segments.map((s) => ({ ...s })),
    } : blank());
  }, [open, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const entity = entities.find((e) => e.entityType === d.entityType);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setCond = (i: number, patch: Partial<Condition>) => set({ conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const keys = useMemo(() => paletteEntries(entity).map((e) => e.key), [entity]);

  const scheme: SchemeInput = useMemo(() => ({
    ...(existing ? { id: existing.id } : {}),
    code: d.code, name: d.name, entityType: d.entityType, targetField: 'code', seqScope: d.seqScope,
    priority: Number(d.priority) || 0, description: d.description, status: d.status, conditions: d.conditions, segments: d.segments,
  }), [d, existing]);

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
      codegenApi.preview({ entityType: d.entityType, scheme, entityId: sample.id })
        .then((g) => { if (n === asked.current) { setPreview(g); setPreviewError(null); } })
        .catch((e) => { if (n === asked.current) { setPreview(null); setPreviewError(e); } });
      codegenApi.explain({ entityType: d.entityType, scheme, entityId: sample.id, keys })
        .then((x) => { if (n === asked.current) { setExplain(x); setExplainError(null); } })
        .catch((e) => { if (n === asked.current) { setExplain(null); setExplainError(e); } })
        .finally(() => { if (n === asked.current) setExplaining(false); });
    }, 350);
    return () => window.clearTimeout(t);
  }, [scheme, d.entityType, sample, open, keys]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) await codegenApi.update(existing.id, scheme);
      else await codegenApi.create(scheme);
      setBusy(false);
      onSaved();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e);
    }
  };

  const sentence = patternSentence(d.segments, entity, d.seqScope);
  const note = takenNote(explain?.selection);
  const ro = !canManage;
  const problemWords = (e: unknown) => {
    const x = e as { problems?: string[]; message?: string };
    return x.problems?.length ? x.problems.join(' · ') : (x.message ?? 'That could not be checked.');
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="lg" fullWidth fullScreen={phone}>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New code rule'}</>}
        subtitle="Build the pattern from pieces, see it on a real record, and check which rule that record gets." onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr 1fr 1fr' }, gap: 2, mt: 1 }}>
          <TextField label="Code" required disabled={ro} value={d.code} autoFocus={!ro} onChange={(e) => set({ code: e.target.value.toUpperCase() })}
            slotProps={{ htmlInput: { style: { fontFamily: 'var(--font-mono)' } } }} />
          <TextField label="Name" required disabled={ro} value={d.name} onChange={(e) => set({ name: e.target.value })} />
          <TextField select label="Codes" disabled={ro} value={d.entityType}
            onChange={(e) => { setSample(null); set({ entityType: e.target.value, conditions: [] }); }}>
            {entities.map((e) => <MenuItem key={e.entityType} value={e.entityType}>{e.label}</MenuItem>)}
          </TextField>
          <TextField select label="Status" disabled={ro} value={d.status} onChange={(e) => set({ status: e.target.value as Draft['status'] })}
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
                  : previewError ? <Typography sx={{ fontSize: 13, color: 'var(--c-danger-600)' }}>{problemWords(previewError)}</Typography>
                    : preview?.text ? <Mono sx={{ fontSize: 16, color: 'var(--c-text)', wordBreak: 'break-all' }}>{preview.text}</Mono>
                      : preview?.missing?.length ? <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)' }}>Nothing yet — that record has no value for {preview.missing.map((k) => tokenPhrase(k, entity)).join(', ')}</Typography>
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
            <PatternParts segments={d.segments} onChange={(segments) => set({ segments })} entity={entity} readOnly={ro}
              parts={explain?.parts ?? null} hasSample={!!sample} pending={explaining} seqScope={d.seqScope} onSeqScope={(seqScope) => set({ seqScope })} />
          </Surface>
          {!ro && (
            <Surface sx={{ p: 2, minWidth: 0 }}>
              <TokenPalette entity={entity} values={explain?.values ?? null} hasSample={!!sample} pending={explaining}
                hasSequence={d.segments.some((s) => s.segmentType === 'sequence')} onAdd={(seg) => set({ segments: [...d.segments, seg] })} />
            </Surface>
          )}
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
                    <TextField select size="small" disabled={ro} value={c.tokenKey} sx={{ gridArea: 'tok' }} slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: what to test` } }} onChange={(e) => {
                      const t = entity?.conditionTokens.find((x) => x.key === e.target.value);
                      setCond(i, { tokenKey: e.target.value, operator: t?.operators[0] ?? 'eq', value: '' });
                    }}>
                      {(entity?.conditionTokens ?? []).map((t) => <MenuItem key={t.key} value={t.key}>{t.label}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" disabled={ro} value={c.operator} sx={{ gridArea: 'op' }} slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: how` } }} onChange={(e) => setCond(i, { operator: e.target.value, value: '' })}>
                      {(token?.operators ?? ['eq']).map((o) => <MenuItem key={o} value={o}>{OPERATOR_LABEL[o] ?? o}</MenuItem>)}
                    </TextField>
                    <Box sx={{ gridArea: 'val', minWidth: 0 }}>
                      <ConditionValue token={token} c={c} index={i} lookups={lookups} allowed={allowed} disabled={ro} onChange={(value) => setCond(i, { value })} />
                    </Box>
                    {!ro && <IconButton aria-label={`Remove condition ${i + 1}`} sx={{ gridArea: 'del' }} onClick={() => set({ conditions: d.conditions.filter((_, j) => j !== i) })}><DeleteOutlineRounded /></IconButton>}
                  </Box>
                  {token?.help && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{token.help}</Typography>}
                </Box>
              );
            })}
          </Box>
          {!ro && (
            <Button size="small" startIcon={<AddRounded />} sx={{ mt: 1 }} disabled={!entity?.conditionTokens.length}
              onClick={() => set({ conditions: [...d.conditions, { tokenKey: entity?.conditionTokens[0]?.key ?? '', operator: entity?.conditionTokens[0]?.operators[0] ?? 'eq', value: '' }] })}>
              Add condition
            </Button>
          )}
        </Surface>

        <Surface sx={{ p: 2, mt: 2 }}>
          <WhichRuleWins selection={explain?.selection ?? null} loading={explaining} error={explainError} hasSample={!!sample} entity={entity}
            names={names} priority={d.priority} onPriority={(priority) => set({ priority })} readOnly={ro} />
        </Surface>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{canManage ? 'Cancel' : 'Close'}</Button>
        {canManage && (
          <Button variant="contained" onClick={() => void save()} disabled={busy || !d.code.trim() || !d.name.trim() || !d.segments.length}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save rule' : 'Create rule'}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Settings for the code generator: how the codes of departments, roles,
 * positions, locations, employees and letters are made. Rules are grouped by
 * what they code; each shows when it applies, its pattern read out as a
 * sentence, and where its counters stand.
 */
export default function CodeFormats() {
  const toast = useToast();
  const can = useCan();
  const canManage = can.setup.edit;
  const canRemove = can.setup.remove;
  // Departments, locations and roles belong to other areas: each list is read only with that area's view.
  const allowed = useMemo<Record<LookupKind, boolean>>(
    () => ({ department: can.org.view, location: can.org.view, role: can.roles.view, departmentLabel: can.org.view || can.positions.view }),
    [can.org.view, can.roles.view, can.positions.view],
  );

  const [schemes, setSchemes] = useState<CodeScheme[] | null>(null);
  const [entities, setEntities] = useState<CodegenEntity[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([codegenApi.entities(), codegenApi.schemes()])
      .then(([e, s]) => { setEntities(e ?? []); setSchemes((s ?? []).filter((x) => x.targetField === 'code')); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Names for the ids a condition holds. Each list is read only when some
  // thing has a condition on that kind of value.
  const kindsUsed = useMemo(() => {
    const out = new Set<LookupKind>();
    for (const e of entities ?? []) for (const t of e.conditionTokens) if (isLookupKind(t.valueKind)) out.add(t.valueKind);
    return out;
  }, [entities]);
  const [lookups, setLookups] = useState<Lookups>({ department: [], location: [], role: [], departmentLabel: [] });
  useEffect(() => {
    const put = (kind: LookupKind, rows: Lookup[]) => setLookups((cur) => ({ ...cur, [kind]: rows }));
    if (kindsUsed.has('department') && allowed.department) orgApi.departments.list().then((r) => put('department', r.map((x) => ({ id: x.id, name: x.path || x.name })))).catch(() => put('department', []));
    if (kindsUsed.has('location') && allowed.location) orgApi.locations.list().then((r) => put('location', r.map((x) => ({ id: x.id, name: x.path || x.name })))).catch(() => put('location', []));
    if (kindsUsed.has('role') && allowed.role) listRoles().then((r) => put('role', r.items.map((x) => ({ id: x.id, name: x.title })))).catch(() => put('role', []));
    if (kindsUsed.has('departmentLabel') && allowed.departmentLabel) {
      orgApi.departmentLabels.list()
        .then((ls) => put('departmentLabel', ls.map((l) => ({ id: l.id, name: l.name }))))
        .catch(() => put('departmentLabel', []));
    }
  }, [kindsUsed, allowed]);
  const names = useMemo(() => {
    const m = emptyNames();
    for (const k of ['department', 'location', 'role', 'departmentLabel'] as const) for (const x of lookups[k]) m[k].set(String(x.id), x.name);
    return m;
  }, [lookups]);

  const [editor, setEditor] = useState<{ open: boolean; scheme: CodeScheme | null }>({ open: false, scheme: null });
  const [toDelete, setToDelete] = useState<CodeScheme | null>(null);

  const groups = useMemo(
    () => (entities ?? []).map((e) => ({ key: e.entityType, title: `${e.label} — codes`, rows: (schemes ?? []).filter((s) => s.entityType === e.entityType), entity: e })),
    [schemes, entities],
  );

  return (
    <Box sx={{ maxWidth: 1200 }}>
      <PageHeader title="Code formats" subtitle="How the codes of departments, roles, positions, locations, employees and letters are made. A rule applies when its conditions hold and builds text from its pattern; running numbers never repeat."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} disabled={!entities?.length} onClick={() => setEditor({ open: true, scheme: null })}>New rule</Button>} />
      <ErrorNotice error={error} onRetry={load} />
      {loading && !entities ? <SkeletonRows rows={5} height={64} /> : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {groups.map((g) => (
            <SectionCard key={g.key} title={g.title}>
              {g.rows.length === 0 ? (
                <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>No rule yet — the built-in format is used until you add one.</Typography>
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
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>{patternSentence(s.segments, g.entity, s.seqScope)}</Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <CapsLabel>Applies when</CapsLabel>
                        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{s.conditions.length ? s.conditions.map((c) => cap(conditionSentence(c, g.entity, names))).join(' · ') : 'Always'}</Typography>
                      </Box>
                      <Tooltip title={s.counters.length ? s.counters.map((c) => `${c.prefix || '(whole rule)'} → next ${c.nextValue}`).join('\n') : 'No number handed out yet'}>
                        <Box><CapsLabel>Counters</CapsLabel><Mono>{s.counters.length}</Mono></Box>
                      </Tooltip>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={s.status} />
                        {canRemove && <IconButton size="small" aria-label={`Delete ${s.code}`} onClick={() => setToDelete(s)}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </SectionCard>
          ))}
          {!groups.length && !error && <Surface><EmptyState title="Nothing can be coded yet"
            body="Nothing in this company registers with the code generator, so there is nothing to write rules for. Reload the page; if it stays empty, tell an administrator." /></Surface>}
        </Box>
      )}
      <SchemeEditor open={editor.open} existing={editor.scheme} canManage={canManage} onClose={() => setEditor({ open: false, scheme: null })}
        onSaved={() => { toast.success('Code rule saved.'); load(); }}
        entities={entities ?? []} lookups={lookups} allowed={allowed} names={names} />
      <ConfirmDialog open={!!toDelete} title={`Delete ${toDelete?.code}?`} danger confirmLabel="Delete"
        body="Records keep the codes they already have. Its counters are kept, so no number is ever handed out twice."
        onClose={() => setToDelete(null)} onConfirm={async () => { if (!toDelete) return; await codegenApi.remove(toDelete.id); toast.success('Deleted.'); load(); }} />
    </Box>
  );
}
