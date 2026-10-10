import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, Collapse, FormControlLabel, IconButton, Menu, MenuItem, Stack, TextField,
  Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import {
  CapsLabel, ConfirmDialog, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, SectionCard, ToneBadge,
  errorProblems, useIsPermitted, useToast,
} from '@shared/ui';
import {
  codegenApi, EMPLOYEE_CODES, LETTER_REFERENCES,
  type CodeScheme, type CodegenEntity, type CodegenExplain, type Condition, type RuleSelection, type RuleVerdict,
  type SchemeInput, type Segment,
} from '../api/codegen';
import type { ApiProblem } from '../api/client';
import { orgApi, ORG_MANAGE } from '../api/organisation';
import { peopleApi } from '../api/people';
import { hiringApi } from '../api/hiring';
import {
  DATE_FORMATS, OPERATOR_LABEL, SEQUENCE_DIGITS, cap, codeWord, conditionSentence, dateExample, defaultSegments,
  digitsLabel, issuedWhen, manyOf, numberCanRestart, oneOf, partExample, patternSentence, shapeOf,
} from '../components/codeFormatWords';

/**
 * Code formats — how employee codes and letter reference numbers are built
 * (CF_HRMS_HIRING_SPEC.md §1.6). The same engine and the same building blocks
 * as cf_erp's "Coding rules" — fixed text, a value from the record, a date, a
 * running number — through cf_hrms's own API client.
 *
 * MOST COMPANIES HAVE ONE FORMAT PER THING, so that case is one form: an
 * example of the code at the top, the parts under it, Save. Nothing on it says
 * "rule", "priority" or "condition".
 *
 * A second format ("contract staff get C-0001") is where the engine shows: each
 * format then says who it is for, and "Check on an employee" asks the server
 * which format that person gets and why — decided by the same code that issues
 * the codes, never worked out here.
 *
 * NOBODY TYPES A CODE and nobody is shown a number that is not theirs yet. The
 * example prints the running number as 1; the real one is issued by the server
 * in the same write that creates the record.
 */

interface Draft {
  code: string;
  name: string;
  /** Not edited here, but carried: a save replaces the whole rule. */
  description: string | null;
  seqScope: 'prefix' | 'scheme';
  priority: number;
  status: 'active' | 'inactive';
  conditions: Condition[];
  segments: Segment[];
}

interface Sample { id: number; label: string }
interface Lookup { id: number; name: string }

const BASE_CODE: Record<string, string> = { [EMPLOYEE_CODES]: 'EMPLOYEE', [LETTER_REFERENCES]: 'LETTER' };

function freshDraft(entity: CodegenEntity, taken: string[], extra: boolean): Draft {
  const base = BASE_CODE[entity.entityType] ?? entity.entityType.toUpperCase();
  let code = base;
  for (let n = 2; taken.includes(code); n += 1) code = `${base}_${n}`;
  return {
    code,
    name: extra ? '' : entity.label,
    description: null,
    seqScope: 'prefix',
    priority: 0,
    status: 'active',
    conditions: extra && entity.conditionTokens[0]
      ? [{ tokenKey: entity.conditionTokens[0].key, operator: entity.conditionTokens[0].operators[0] ?? 'eq', value: '' }]
      : [],
    segments: extra ? [] : defaultSegments(entity.entityType),
  };
}

const draftOf = (s: CodeScheme): Draft => ({
  code: s.code,
  name: s.name,
  description: s.description ?? null,
  seqScope: s.seqScope,
  priority: s.priority,
  status: s.status,
  conditions: s.conditions.map((c) => ({ tokenKey: c.tokenKey, operator: c.operator, value: c.value })),
  segments: s.segments.map((x) => ({ ...x })),
});

const inputOf = (d: Draft, entityType: string, id?: number): SchemeInput => ({
  ...(id != null ? { id } : {}),
  code: d.code,
  name: d.name.trim() || d.code,
  entityType,
  targetField: 'code',
  seqScope: d.seqScope,
  priority: d.priority,
  description: d.description,
  status: d.status,
  conditions: d.conditions,
  segments: d.segments,
});

const PART_KIND: Record<Segment['segmentType'], string> = {
  literal: 'Fixed text',
  token: 'A value',
  date: 'A date',
  sequence: 'Running number',
};

// ── Which format a record gets, in words ────────────────────────────────────

const points = (n: number | null | undefined) => `${n ?? 0} point${n === 1 ? '' : 's'}`;
const who = (r: { name?: string; code: string; draft: boolean } | null, lower = false) =>
  !r ? 'another format' : r.draft ? (lower ? 'this format' : 'This format') : `“${r.name || r.code}”`;

function verdictWords(sel: RuleSelection, entityType: string): { tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string } {
  const named = (x: { code: string; draft: boolean } | null) => {
    const full = x ? sel.rules.find((r) => (x.draft ? r.draft : r.id != null && r.code === x.code)) : null;
    return x ? { ...x, name: full?.name } : null;
  };
  const winner = named(sel.winner);
  const runnerUp = named(sel.runnerUp);
  const winnerRule = sel.rules.find((r) => r.verdict === 'wins');
  const one = oneOf(entityType);
  const word = codeWord(entityType);
  switch (sel.decidedBy) {
    case 'none':
      return {
        tone: 'danger',
        text: `No format applies to this ${one}, so no ${word} can be issued. Keep one format that applies to everyone.`,
      };
    case 'only':
      return { tone: winner?.draft ? 'success' : 'warning', text: `${who(winner)} makes the ${word}: it is the only format that applies to this ${one}.` };
    case 'weight':
      return {
        tone: winner?.draft ? 'success' : 'warning',
        text: `${who(winner)} makes the ${word}. It is the more specific one: ${points(winnerRule?.weight)}, against ${points(sel.runnerUp?.weight)} for ${who(runnerUp, true)}.`,
      };
    case 'priority':
      return {
        tone: winner?.draft ? 'success' : 'warning',
        text: `${who(winner)} makes the ${word}. It is as specific as ${who(runnerUp, true)}, and its priority ${winnerRule?.priority ?? 0} is higher than ${sel.runnerUp?.priority ?? 0}.`,
      };
    case 'tie': {
      const tied = sel.rules.filter((r) => r.verdict === 'tied').map((r) => who(r, true));
      return {
        tone: 'danger',
        text: `${cap(tied.join(' and '))} apply equally to this ${one}, so no ${word} can be issued. Make one of them more specific, or give one a higher priority.`,
      };
    }
    default:
      return { tone: 'neutral', text: '' };
  }
}

const VERDICT_LABEL: Record<RuleVerdict['verdict'], string> = {
  wins: 'Used',
  tied: 'Tied',
  beaten: 'Applies, not used',
  no: 'Does not apply',
  off: 'Switched off',
  unfinished: 'Not finished',
};

function WhyThisFormat({
  entity,
  alone,
  scheme,
  samples,
  names,
}: {
  entity: CodegenEntity;
  /** The only format for this thing, with no conditions: there is nothing to decide. */
  alone: boolean;
  scheme: SchemeInput;
  samples: Sample[] | null;
  names: Map<string, string>;
}) {
  const [sample, setSample] = useState<Sample | null>(null);
  const [explain, setExplain] = useState<CodegenExplain | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const asked = useRef(0);
  const key = JSON.stringify(scheme);
  const one = oneOf(entity.entityType);

  useEffect(() => {
    if (alone || !sample) {
      setExplain(null);
      setError(null);
      return undefined;
    }
    const n = ++asked.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      codegenApi
        .explain({ entityType: entity.entityType, scheme: JSON.parse(key) as SchemeInput, entityId: sample.id })
        .then((x) => {
          if (n === asked.current) {
            setExplain(x);
            setError(null);
          }
        })
        .catch((e) => {
          if (n === asked.current) {
            setExplain(null);
            setError(e);
          }
        })
        .finally(() => {
          if (n === asked.current) setLoading(false);
        });
    }, 350);
    return () => window.clearTimeout(t);
  }, [alone, sample, key, entity.entityType]);

  if (alone) {
    return (
      <Typography data-why="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.55 }}>
        Why this format: it is the only one for {manyOf(entity.entityType)}, so every {one} gets it.
      </Typography>
    );
  }

  const words = explain ? verdictWords(explain.selection, entity.entityType) : null;
  return (
    <Box data-why="" sx={{ display: 'grid', gap: 1 }}>
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Which format does one {one} get?</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
          When more than one format applies, the more specific one is used. Pick {one === 'employee' ? 'an' : 'a'} {one}{' '}
          to see which one they get, with this format as it stands on the screen. Nothing is saved and no number is taken.
        </Typography>
      </Box>
      <Autocomplete
        size="small"
        options={samples ?? []}
        value={sample}
        onChange={(_, v) => setSample(v)}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        loading={samples == null}
        noOptionsText={samples == null ? 'Loading…' : `No ${one} to check on yet`}
        sx={{ maxWidth: 420 }}
        renderInput={(p) => <TextField {...p} label={`Check on ${one === 'employee' ? 'an' : 'a'} ${one}`} />}
      />
      {!!error && <ErrorNotice error={error} fallback="That could not be checked." />}
      {sample && !explain && !error && loading && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Checking…</Typography>}
      {explain && words && (
        <>
          <Box
            role="status"
            sx={{
              borderLeft: `3px solid var(--c-${words.tone}-600)`,
              background: `var(--c-${words.tone}-50)`,
              px: 1.5,
              py: 1,
            }}
          >
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text)', lineHeight: 1.5 }}>{words.text}</Typography>
          </Box>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
            {explain.selection.rules.map((r) => (
              <Box
                component="li"
                key={r.draft ? 'draft' : String(r.id)}
                sx={{
                  border: '1px solid',
                  borderColor: r.draft ? 'var(--c-primary-200)' : 'var(--c-divider)',
                  borderRadius: 'var(--r-sm)',
                  p: 1.25,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                  <ToneBadge
                    tone={r.verdict === 'wins' ? 'success' : r.verdict === 'tied' ? 'danger' : r.verdict === 'unfinished' ? 'warning' : 'neutral'}
                    noIcon
                    label={VERDICT_LABEL[r.verdict]}
                  />
                  <Typography sx={{ fontSize: 13.5, fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {r.draft ? 'This format' : r.name || r.code}
                  </Typography>
                </Box>
                {r.problems?.length ? (
                  <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: 12.5, color: 'var(--c-warning-800)' }}>
                    {r.problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </Box>
                ) : r.conditions.length === 0 ? (
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
                    For everyone — the least specific format there can be.
                  </Typography>
                ) : (
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0, display: 'grid', gap: 0.25 }}>
                    {r.conditions.map((k, i) => (
                      <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, fontSize: 13 }}>
                        {k.ok ? (
                          <CheckRounded aria-hidden sx={{ fontSize: 17, color: 'var(--c-success-600)' }} />
                        ) : (
                          <CloseRounded aria-hidden sx={{ fontSize: 17, color: 'var(--c-danger-600)' }} />
                        )}
                        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere', color: k.ok ? 'var(--c-text)' : 'var(--c-text-2)' }}>
                          {cap(conditionSentence(k, entity, names))} — {k.ok ? 'true for them' : 'not true for them'}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

// ── One format ──────────────────────────────────────────────────────────────

function FormatEditor({
  entity,
  scheme,
  takenCodes,
  several,
  canManage,
  departments,
  locations,
  names,
  samples,
  onSaved,
  onDiscardNew,
  onDeleted,
  onDraft,
}: {
  entity: CodegenEntity;
  /** The saved format; null for one that does not exist yet. */
  scheme: CodeScheme | null;
  takenCodes: string[];
  /** This thing has more than one format, so each says who it is for. */
  several: boolean;
  canManage: boolean;
  departments: Lookup[];
  locations: Lookup[];
  names: Map<string, string>;
  samples: Sample[] | null;
  onSaved: () => void;
  /** Present on an added format that has not been saved: takes it away again. */
  onDiscardNew?: () => void;
  onDeleted?: () => void;
  /** Tells the list what this format looks like right now, for its folded line. */
  onDraft?: (shape: string) => void;
}) {
  const toast = useToast();
  const start = useMemo(
    () => (scheme ? draftOf(scheme) : freshDraft(entity, takenCodes, several)),
    // A new draft is made once per format; `takenCodes` changing must not wipe what was typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, entity.entityType],
  );
  const [d, setD] = useState<Draft>(start);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [nextReal, setNextReal] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<string[]>([]);
  const [valueMenu, setValueMenu] = useState<HTMLElement | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setD(start);
    setError(null);
  }, [start]);

  const dirty = JSON.stringify(d) !== JSON.stringify(start);
  const input = useMemo(() => inputOf(d, entity.entityType, scheme?.id), [d, entity.entityType, scheme?.id]);
  const inputKey = JSON.stringify(input);
  const hasSequence = d.segments.some((s) => s.segmentType === 'sequence');
  // For a saved format with nothing changed, the example is the SERVER's: the
  // generator itself says what it would issue next, so this screen and the
  // generator cannot disagree. While a format is unsaved, changed, or refused,
  // an example built here stands in, with the running number as 1.
  const example = shapeOf(d.segments, entity);
  const real = scheme && !dirty ? nextReal : null;
  const shape = real ?? example;
  const sentence = patternSentence(d.segments, entity, d.seqScope);
  const showWho = several || d.conditions.length > 0;
  const word = codeWord(entity.entityType);

  useEffect(() => {
    onDraft?.(shapeOf(d.segments, entity));
  }, [d.segments, entity, onDraft]);

  // The server reads the unsaved format and says what is wrong with it, in its
  // own words. It takes no number and saves nothing. A reply that arrives after
  // a newer request is dropped.
  const asked = useRef(0);
  useEffect(() => {
    const n = ++asked.current;
    setNextReal(null);
    if (!d.segments.length) {
      setUnfinished([]);
      return undefined;
    }
    const t = window.setTimeout(() => {
      codegenApi
        .preview({ entityType: entity.entityType, scheme: JSON.parse(inputKey) as SchemeInput })
        .then((g) => {
          if (n !== asked.current) return;
          setUnfinished(g.problems ?? []);
          setNextReal(g.text && !g.missing?.length && !g.problems?.length ? g.text : null);
        })
        .catch((e: ApiProblem) => {
          if (n !== asked.current) return;
          // A refusal of the format itself is worth saying; anything else is not this form's news.
          setUnfinished(e?.status === 422 ? (errorProblems(e).length ? errorProblems(e) : [e.message]) : []);
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [inputKey, d.segments.length, entity.entityType]);

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setSeg = (i: number, patch: Partial<Segment>) => set({ segments: d.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addSeg = (seg: Segment) => set({ segments: [...d.segments, seg] });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...d.segments];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    set({ segments: next });
  };
  const setCond = (i: number, patch: Partial<Condition>) => set({ conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (scheme) await codegenApi.update(scheme.id, input);
      else await codegenApi.create(input);
      toast.success(`${cap(word)} format saved. It is used from the next ${oneOf(entity.entityType)} on.`);
      onSaved();
    } catch (e) {
      // What was built stays on the screen; only the refusal is added.
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const lookupFor = (tokenKey: string): Lookup[] | null =>
    tokenKey === 'department' ? departments : tokenKey === 'location' ? locations : null;

  const disabled = !canManage;

  return (
    <Box data-format={scheme?.id ?? 'new'} sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      {/* ── The example first ─────────────────────────────────────────────── */}
      <Box aria-live="polite" sx={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', px: 1.75, py: 1.5 }}>
        <CapsLabel>
          {real
            ? `The next ${word} will look like`
            : entity.entityType === LETTER_REFERENCES ? 'A reference number looks like' : `${cap(oneOf(entity.entityType))} codes look like`}
        </CapsLabel>
        {d.segments.length ? (
          <Mono data-shape="" sx={{ display: 'block', fontSize: 22, fontWeight: 600, color: 'var(--c-text)', wordBreak: 'break-all', mt: 0.25 }}>
            {shape}
          </Mono>
        ) : (
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', mt: 0.5 }}>Nothing yet — add the first part below.</Typography>
        )}
        {sentence && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5, overflowWrap: 'anywhere' }}>{sentence}</Typography>}
        {hasSequence && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>
            {real
              ? `As things stand today. It is issued ${issuedWhen(entity.entityType)}, and a number is never used twice.`
              : `The number shown is only an example. The real one is issued ${issuedWhen(entity.entityType)}, and is never used twice.`}
          </Typography>
        )}
        {unfinished.length > 0 && (
          <Box component="ul" data-unfinished="" sx={{ m: 0, mt: 0.75, pl: 2.5, fontSize: 13, color: 'var(--c-warning-800)' }}>
            {unfinished.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </Box>
        )}
      </Box>

      {several && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, gap: 1.5, alignItems: 'center' }}>
          <TextField
            size="small"
            label="Name of this format"
            placeholder="For example: Contract staff"
            value={d.name}
            disabled={disabled}
            onChange={(e) => set({ name: e.target.value })}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={d.status === 'inactive'} disabled={disabled} onChange={(e) => set({ status: e.target.checked ? 'inactive' : 'active' })} />}
            label={<Typography sx={{ fontSize: 13.5 }}>Switched off</Typography>}
          />
        </Box>
      )}

      {/* ── The parts ─────────────────────────────────────────────────────── */}
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>The parts, in order</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>
          They are joined exactly as listed, with nothing in between unless you add it as fixed text.
        </Typography>
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.75 }}>
          {d.segments.map((s, i) => {
            const token = s.segmentType === 'token' ? entity.tokens.find((t) => t.key === s.tokenKey) : undefined;
            const dateOptions = s.segmentType === 'date' && s.format && !DATE_FORMATS.includes(s.format) ? [...DATE_FORMATS, s.format] : DATE_FORMATS;
            const digitOptions = s.segmentType === 'sequence' && s.format && !SEQUENCE_DIGITS.includes(s.format) ? [...SEQUENCE_DIGITS, s.format] : SEQUENCE_DIGITS;
            return (
              <Box
                component="li"
                key={i}
                aria-label={`Part ${i + 1}: ${PART_KIND[s.segmentType]}`}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '24px minmax(0, 1fr) auto', md: '24px 130px minmax(0, 1fr) minmax(0, 150px) auto' },
                  gridTemplateAreas: { xs: '"n kind act" "ctl ctl ctl" "ex ex ex"', md: '"n kind ctl ex act"' },
                  alignItems: 'center',
                  columnGap: 1,
                  rowGap: 0.75,
                  border: '1px solid var(--c-divider)',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--c-surface)',
                  p: 1,
                }}
              >
                <Box aria-hidden sx={{ gridArea: 'n', width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
                  {i + 1}
                </Box>
                <Typography sx={{ gridArea: 'kind', fontSize: 13, color: 'var(--c-text-2)' }}>{PART_KIND[s.segmentType]}</Typography>
                <Box sx={{ gridArea: 'ctl', minWidth: 0 }}>
                  {s.segmentType === 'literal' && (
                    <TextField
                      size="small"
                      fullWidth
                      value={s.literalText ?? ''}
                      disabled={disabled}
                      placeholder="KP, HR/, - …"
                      onChange={(e) => setSeg(i, { literalText: e.target.value })}
                      slotProps={{ htmlInput: { 'aria-label': `Part ${i + 1}: the fixed text`, style: { fontFamily: 'var(--font-mono)' } } }}
                    />
                  )}
                  {s.segmentType === 'token' && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 96px', gap: 1, alignItems: 'start' }}>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={s.tokenKey ?? ''}
                        disabled={disabled}
                        onChange={(e) => setSeg(i, { tokenKey: e.target.value })}
                        helperText={token?.help ?? token?.note}
                        slotProps={{ htmlInput: { 'aria-label': `Part ${i + 1}: which value` } }}
                      >
                        {/* A value no longer offered still shows, by its key. */}
                        {s.tokenKey && !token && <MenuItem value={s.tokenKey}>{s.tokenKey}</MenuItem>}
                        {entity.tokens.map((t) => (
                          <MenuItem key={t.key} value={t.key} disabled={!t.available}>
                            {cap(t.label)}
                          </MenuItem>
                        ))}
                      </TextField>
                      {/* A name is long for a code: "at most 3" prints its first three characters. */}
                      <TextField
                        size="small"
                        label="At most"
                        placeholder="all"
                        value={s.maxLength ?? ''}
                        disabled={disabled}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ''));
                          setSeg(i, { maxLength: n > 0 ? n : null });
                        }}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { inputMode: 'numeric', 'aria-label': `Part ${i + 1}: at most how many characters` } }}
                      />
                    </Box>
                  )}
                  {s.segmentType === 'date' && (
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={s.format || 'YYYYMMDD'}
                      disabled={disabled}
                      onChange={(e) => setSeg(i, { format: e.target.value })}
                      helperText={`The date ${issuedWhen(entity.entityType).replace(/^when /, '')}.`}
                      slotProps={{ htmlInput: { 'aria-label': `Part ${i + 1}: how the date prints` } }}
                    >
                      {dateOptions.map((f) => (
                        <MenuItem key={f} value={f}>
                          {f} — {dateExample(f)}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                  {s.segmentType === 'sequence' && (
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={s.format || '0'}
                      disabled={disabled}
                      onChange={(e) => setSeg(i, { format: e.target.value })}
                      slotProps={{ htmlInput: { 'aria-label': `Part ${i + 1}: how many digits` } }}
                    >
                      {digitOptions.map((f) => (
                        <MenuItem key={f} value={f}>
                          {digitsLabel(f)}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </Box>
                <Box sx={{ gridArea: 'ex', minWidth: 0, fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  prints <Mono sx={{ fontSize: 12.5, color: 'var(--c-text-2)', wordBreak: 'break-all' }}>{partExample(s, entity) || '—'}</Mono>
                </Box>
                {canManage && (
                  <Box sx={{ gridArea: 'act', display: 'flex', justifySelf: 'end' }}>
                    <IconButton size="small" aria-label={`Move part ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpwardRounded fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Move part ${i + 1} down`} disabled={i === d.segments.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownwardRounded fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label={`Remove part ${i + 1}`} onClick={() => set({ segments: d.segments.filter((_, j) => j !== i) })}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
        {canManage && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }} aria-label="Add a part">
            <Button size="small" startIcon={<AddRounded />} onClick={() => addSeg({ segmentType: 'literal', literalText: '' })}>
              Fixed text
            </Button>
            <Button size="small" startIcon={<AddRounded />} aria-haspopup="menu" disabled={!entity.tokens.length} onClick={(e) => setValueMenu(e.currentTarget)}>
              A value from the {oneOf(entity.entityType)}
            </Button>
            <Button size="small" startIcon={<AddRounded />} onClick={() => addSeg({ segmentType: 'date', format: 'YYYY' })}>
              A date
            </Button>
            <Tooltip title={hasSequence ? 'A format has one running number.' : ''}>
              <Box component="span">
                <Button size="small" startIcon={<AddRounded />} disabled={hasSequence} onClick={() => addSeg({ segmentType: 'sequence', format: '0000' })}>
                  Running number
                </Button>
              </Box>
            </Tooltip>
            <Menu anchorEl={valueMenu} open={!!valueMenu} onClose={() => setValueMenu(null)}>
              {entity.tokens.map((t) => (
                <MenuItem
                  key={t.key}
                  disabled={!t.available}
                  onClick={() => {
                    addSeg({ segmentType: 'token', tokenKey: t.key });
                    setValueMenu(null);
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontSize: 13.5 }}>{cap(t.label)}</Box>
                    {t.example && (
                      <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                        e.g. <Mono sx={{ fontSize: 12 }}>{t.example}</Mono>
                      </Box>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Menu>
          </Stack>
        )}
        {!hasSequence && d.segments.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', mt: 1 }}>
            Without a running number two {manyOf(entity.entityType)} can end up with the same {word}. Add one.
          </Typography>
        )}
        {numberCanRestart(d.segments) && (
          <FormControlLabel
            sx={{ mt: 1, alignItems: 'flex-start' }}
            control={
              <Checkbox
                size="small"
                sx={{ mt: -0.5 }}
                checked={d.seqScope === 'prefix'}
                disabled={disabled}
                onChange={(e) => set({ seqScope: e.target.checked ? 'prefix' : 'scheme' })}
              />
            }
            label={
              <Typography sx={{ fontSize: 13.5, lineHeight: 1.5 }}>
                Start the number again from 1 whenever the text before it changes
                <Typography component="span" sx={{ display: 'block', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  For example a new financial year, or another department. Unticked, there is one count for everything.
                </Typography>
              </Typography>
            }
          />
        )}
      </Box>

      {/* ── Who it is for — only once there is something to choose between ── */}
      {showWho && (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Who gets this format</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>
            {d.conditions.length
              ? `Only ${manyOf(entity.entityType)} for whom all of these are true.`
              : `Everyone — every ${oneOf(entity.entityType)} no other format is more specific for.`}
          </Typography>
          <Box sx={{ display: 'grid', gap: 1 }}>
            {d.conditions.map((c, i) => {
              const token = entity.conditionTokens.find((t) => t.key === c.tokenKey);
              const lookup = lookupFor(c.tokenKey);
              const many = c.operator === 'in';
              return (
                <Box
                  key={i}
                  sx={{
                    display: 'grid',
                    gap: 1,
                    alignItems: 'center',
                    gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr) auto', md: '190px 140px minmax(0, 1fr) auto' },
                    gridTemplateAreas: { xs: '"tok op del" "val val val"', md: '"tok op val del"' },
                  }}
                >
                  <TextField
                    select
                    size="small"
                    value={c.tokenKey}
                    disabled={disabled}
                    sx={{ gridArea: 'tok' }}
                    slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: what to look at` } }}
                    onChange={(e) => {
                      const t = entity.conditionTokens.find((x) => x.key === e.target.value);
                      setCond(i, { tokenKey: e.target.value, operator: t?.operators[0] ?? 'eq', value: '' });
                    }}
                  >
                    {entity.conditionTokens.map((t) => (
                      <MenuItem key={t.key} value={t.key}>{cap(t.label)}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    value={c.operator}
                    disabled={disabled}
                    sx={{ gridArea: 'op' }}
                    slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: how` } }}
                    onChange={(e) => setCond(i, { operator: e.target.value, value: '' })}
                  >
                    {(token?.operators ?? ['eq']).map((o) => (
                      <MenuItem key={o} value={o}>{OPERATOR_LABEL[o] ?? o}</MenuItem>
                    ))}
                  </TextField>
                  <Box sx={{ gridArea: 'val', minWidth: 0 }}>
                    {lookup ? (
                      many ? (
                        <Autocomplete
                          multiple
                          size="small"
                          disabled={disabled}
                          options={lookup}
                          getOptionLabel={(o) => o.name}
                          isOptionEqualToValue={(a, b) => a.id === b.id}
                          value={lookup.filter((o) => c.value.split(',').map((x) => x.trim()).includes(String(o.id)))}
                          onChange={(_, v) => setCond(i, { value: v.map((o) => o.id).join(',') })}
                          renderInput={(p) => <TextField {...p} placeholder="Choose" />}
                        />
                      ) : (
                        <Autocomplete
                          size="small"
                          disabled={disabled}
                          options={lookup}
                          getOptionLabel={(o) => o.name}
                          isOptionEqualToValue={(a, b) => a.id === b.id}
                          value={lookup.find((o) => String(o.id) === c.value) ?? null}
                          onChange={(_, v) => setCond(i, { value: v ? String(v.id) : '' })}
                          renderInput={(p) => <TextField {...p} placeholder="Choose" />}
                        />
                      )
                    ) : token?.values?.length ? (
                      many ? (
                        <Autocomplete
                          multiple
                          size="small"
                          disabled={disabled}
                          options={token.values}
                          value={c.value ? c.value.split(',') : []}
                          onChange={(_, v) => setCond(i, { value: v.join(',') })}
                          renderInput={(p) => <TextField {...p} placeholder="Choose" />}
                        />
                      ) : (
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={c.value}
                          disabled={disabled}
                          onChange={(e) => setCond(i, { value: e.target.value })}
                          slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: value` } }}
                        >
                          {token.values.map((v) => (
                            <MenuItem key={v} value={v}>{v}</MenuItem>
                          ))}
                        </TextField>
                      )
                    ) : (
                      <TextField
                        size="small"
                        fullWidth
                        value={c.value}
                        disabled={disabled}
                        onChange={(e) => setCond(i, { value: e.target.value })}
                        slotProps={{ htmlInput: { 'aria-label': `Condition ${i + 1}: value` } }}
                      />
                    )}
                  </Box>
                  {canManage && (
                    <IconButton
                      size="small"
                      aria-label={`Remove condition ${i + 1}`}
                      sx={{ gridArea: 'del' }}
                      onClick={() => set({ conditions: d.conditions.filter((_, j) => j !== i) })}
                    >
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  )}
                  {token?.help && <Typography sx={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--c-text-2)' }}>{token.help}</Typography>}
                </Box>
              );
            })}
          </Box>
          {canManage && entity.conditionTokens.length > 0 && (
            <Button
              size="small"
              startIcon={<AddRounded />}
              sx={{ mt: 1 }}
              onClick={() =>
                set({
                  conditions: [
                    ...d.conditions,
                    { tokenKey: entity.conditionTokens[0].key, operator: entity.conditionTokens[0].operators[0] ?? 'eq', value: '' },
                  ],
                })
              }
            >
              Add a condition
            </Button>
          )}
          {several && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '130px minmax(0, 1fr)' }, gap: 1.5, alignItems: 'center', mt: 1.5 }}>
              <TextField
                size="small"
                label="Priority"
                type="number"
                value={d.priority}
                disabled={disabled}
                onChange={(e) => set({ priority: Number(e.target.value) || 0 })}
              />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                Only settles a draw between two formats that are equally specific: the higher number is used.
              </Typography>
            </Box>
          )}
        </Box>
      )}

      <WhyThisFormat entity={entity} alone={!several && d.conditions.length === 0} scheme={input} samples={samples} names={names} />

      {!!error && <ErrorNotice error={error} fallback="That could not be saved. What you built is still here." />}

      {canManage && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          <Button variant="contained" disabled={saving || !d.segments.length || (!!scheme && !dirty)} onClick={() => void save()}>
            {saving ? 'Saving…' : scheme ? 'Save' : 'Save this format'}
          </Button>
          {scheme && dirty && (
            <Button disabled={saving} onClick={() => setD(start)}>
              Undo changes
            </Button>
          )}
          {onDiscardNew && (
            <Button disabled={saving} onClick={onDiscardNew}>
              Remove
            </Button>
          )}
          {scheme && several && onDeleted && (
            <Button color="inherit" startIcon={<DeleteOutlineRounded />} disabled={saving} onClick={() => setDeleting(true)} sx={{ ml: { sm: 'auto' } }}>
              Delete this format
            </Button>
          )}
          {!scheme && !several && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 240px' }}>
              Nothing is saved yet. Until it is, {manyOf(entity.entityType)} get the format shown above.
            </Typography>
          )}
          {scheme && dirty && (
            <Typography role="status" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
              Not saved yet.
            </Typography>
          )}
        </Box>
      )}

      <ConfirmDialog
        open={deleting}
        title={`Delete “${scheme?.name || scheme?.code || 'this format'}”?`}
        danger
        confirmLabel="Delete"
        body={`${cap(manyOf(entity.entityType))} keep the ${word}s they already have. Numbers already issued are never used again.`}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          if (!scheme) return;
          await codegenApi.remove(scheme.id);
          toast.success('Format deleted.');
          onDeleted?.();
        }}
      />
    </Box>
  );
}

// ── One thing that is coded: its format, or its formats ─────────────────────

function EntityFormats({
  entity,
  schemes,
  allCodes,
  canManage,
  departments,
  locations,
  names,
  samples,
  onNeedSamples,
  onChanged,
}: {
  entity: CodegenEntity;
  schemes: CodeScheme[];
  allCodes: string[];
  canManage: boolean;
  departments: Lookup[];
  locations: Lookup[];
  names: Map<string, string>;
  samples: Sample[] | null;
  onNeedSamples: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [shapes, setShapes] = useState<Record<string, string>>({});
  const several = schemes.length + (adding ? 1 : 0) > 1;
  const needsSamples = several || schemes.some((s) => s.conditions.length > 0);

  useEffect(() => {
    if (needsSamples) onNeedSamples();
  }, [needsSamples, onNeedSamples]);

  const noteShape = useCallback((key: string, shape: string) => {
    setShapes((cur) => (cur[key] === shape ? cur : { ...cur, [key]: shape }));
  }, []);

  const intro =
    entity.entityType === EMPLOYEE_CODES
      ? 'Issued when an employee is created — by hand, or at the end of a hiring. It is never typed and never changes afterwards.'
      : entity.entityType === LETTER_REFERENCES
        ? 'Issued when the first offer letter of a hiring is generated. The offer letter and the appointment letter share it.'
        : undefined;

  const shared = { entity, canManage, departments, locations, names, samples };

  return (
    <SectionCard title={entity.label} subtitle={intro}>
      {!several ? (
        <FormatEditor
          key={schemes[0]?.id ?? 'first'}
          {...shared}
          scheme={schemes[0] ?? null}
          takenCodes={allCodes}
          several={false}
          onSaved={onChanged}
        />
      ) : (
        <Stack spacing={1}>
          {[...schemes.map((s) => ({ key: String(s.id), scheme: s as CodeScheme | null })), ...(adding ? [{ key: 'new', scheme: null }] : [])].map(
            ({ key, scheme }) => {
              const isOpen = open === key;
              const forWhom = scheme
                ? scheme.conditions.length
                  ? scheme.conditions.map((c) => cap(conditionSentence(c, entity, names))).join(' · ')
                  : 'Everyone else'
                : 'Not saved yet';
              return (
                <Box key={key} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                  <Box
                    component="button"
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : key)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      columnGap: 1.5,
                      rowGap: 0.25,
                      width: '100%',
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'inherit',
                      background: 'var(--c-surface-2)',
                      border: 0,
                      cursor: 'pointer',
                      px: 1.5,
                      py: 1,
                      '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
                    }}
                  >
                    {isOpen ? <ExpandMoreRounded aria-hidden sx={{ color: 'var(--c-text-3)' }} /> : <ChevronRightRounded aria-hidden sx={{ color: 'var(--c-text-3)' }} />}
                    <Mono sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)', wordBreak: 'break-all' }}>
                      {shapes[key] ?? (scheme ? shapeOf(scheme.segments, entity) : '…')}
                    </Mono>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{scheme ? scheme.name || scheme.code : 'New format'}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 200px', overflowWrap: 'anywhere' }}>{forWhom}</Typography>
                    {scheme?.status === 'inactive' && <ToneBadge tone="neutral" noIcon label="Switched off" />}
                  </Box>
                  {/* Kept mounted while folded, so folding a format never throws away what was changed in it. */}
                  <Collapse in={isOpen}>
                    <Box sx={{ p: 1.5, borderTop: '1px solid var(--c-divider)' }}>
                      <FormatEditor
                        {...shared}
                        scheme={scheme}
                        takenCodes={allCodes}
                        several
                        onDraft={(shape) => noteShape(key, shape)}
                        onSaved={() => {
                          if (!scheme) setAdding(false);
                          onChanged();
                        }}
                        onDiscardNew={!scheme ? () => { setAdding(false); setOpen(null); } : undefined}
                        onDeleted={scheme ? onChanged : undefined}
                      />
                    </Box>
                  </Collapse>
                </Box>
              );
            },
          )}
        </Stack>
      )}
      {/* The exception, kept quiet and last: most companies never need it. Offered
          once the format for everyone is saved, because a second one is an exception to it. */}
      {canManage && entity.conditionTokens.length > 0 && schemes.length > 0 && !adding && (
        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid var(--c-divider)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: '1 1 240px' }}>
            Do some {manyOf(entity.entityType)} need a different {codeWord(entity.entityType)} — contract staff, another unit?
          </Typography>
          <Button
            size="small"
            startIcon={<AddRounded />}
            onClick={() => {
              setAdding(true);
              setOpen('new');
            }}
          >
            Add a format for them
          </Button>
        </Box>
      )}
    </SectionCard>
  );
}

export default function CodeFormats() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const canSeePeople = can('cf_hrms_people_view');

  const [entities, setEntities] = useState<CodegenEntity[] | null>(null);
  const [schemes, setSchemes] = useState<CodeScheme[] | null>(null);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [locations, setLocations] = useState<Lookup[]>([]);
  const [samples, setSamples] = useState<Record<string, Sample[] | null>>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([codegenApi.entities(), codegenApi.schemes()])
      .then(([e, s]) => {
        setEntities(e ?? []);
        setSchemes((s ?? []).filter((x) => x.targetField === 'code'));
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Departments and locations are only needed to name a condition's value; a
  // company with one format per thing never reads them on this screen.
  const usesLookups = useMemo(
    () => (entities ?? []).some((e) => e.conditionTokens.some((t) => t.key === 'department' || t.key === 'location')),
    [entities],
  );
  useEffect(() => {
    if (!usesLookups) return;
    orgApi.departments.list().then((rows) => setDepartments(rows.map((r) => ({ id: r.id, name: r.path || r.name })))).catch(() => setDepartments([]));
    orgApi.locations.list().then((rows) => setLocations(rows.map((r) => ({ id: r.id, name: r.path || r.name })))).catch(() => setLocations([]));
  }, [usesLookups]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(String(d.id), d.name);
    for (const l of locations) if (!m.has(String(l.id))) m.set(String(l.id), l.name);
    return m;
  }, [departments, locations]);

  // The records "Check on an employee" offers. Asked for once per thing, and
  // only when that thing has more than one format to choose between.
  const asked = useRef(new Set<string>());
  const loadSamples = useCallback(
    (entityType: string) => {
      if (asked.current.has(entityType)) return;
      asked.current.add(entityType);
      const rows: Promise<Sample[]> = !canSeePeople
        ? Promise.resolve([])
        : entityType === EMPLOYEE_CODES
          ? peopleApi.list().then((r) => r.items.map((p) => ({ id: p.id, label: `${p.fullName} (${p.employeeCode})` })))
          : entityType === LETTER_REFERENCES
            ? hiringApi.list({ status: 'all' }).then((r) =>
                r.hirings.map((h) => ({
                  id: h.id,
                  label: `${h.candidateName ?? 'No candidate yet'} — ${h.roleTitle}${h.refNo ? ` (${h.refNo})` : ''}`,
                })),
              )
            : Promise.resolve([]);
      rows
        .then((list) => setSamples((c) => ({ ...c, [entityType]: list })))
        .catch(() => setSamples((c) => ({ ...c, [entityType]: [] })));
    },
    [canSeePeople],
  );

  const allCodes = useMemo(() => (schemes ?? []).map((s) => s.code), [schemes]);

  return (
    <Box sx={{ maxWidth: 980 }}>
      <PageHeader
        title="Code formats"
        subtitle="how employee codes and letter reference numbers are built — issued by the system when the record is saved, never typed"
      />

      {!!error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !entities ? (
        <ListSkeleton rows={4} />
      ) : (entities ?? []).length === 0 && !error ? (
        <EmptyState
          title="Nothing to format yet"
          hint="This company has nothing that takes a generated code. Reload the page; if it stays empty, tell an administrator."
        />
      ) : (
        <Stack spacing={2}>
          {(entities ?? []).map((e) => (
            <EntityFormats
              key={e.entityType}
              entity={e}
              schemes={(schemes ?? []).filter((s) => s.entityType === e.entityType)}
              allCodes={allCodes}
              canManage={canManage}
              departments={departments}
              locations={locations}
              names={names}
              samples={samples[e.entityType] ?? null}
              onNeedSamples={() => loadSamples(e.entityType)}
              onChanged={load}
            />
          ))}
          {!canManage && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
              Read-only: changing a format needs the permission to manage the organisation.
            </Typography>
          )}
        </Stack>
      )}
    </Box>
  );
}
