import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogContent,
  FormControlLabel,
  FormGroup,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import QuestionAnswerRounded from '@mui/icons-material/QuestionAnswerRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { DialogHeader, EmptyState, ErrorNotice, ListSkeleton, Mono, Surface } from '@shared/ui';
import type { AskKind, AskMatch, AskPerson, AskPositionHit, AskResult, OrgChartDepartment } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import type { DepartmentLabel, OrgLocation } from '../api/organisation';
import { orgApi } from '../api/organisation';

/**
 * Ask — "Who owns X?" (spec §21). Replaces "Search job content".
 *
 * A question in plain words; the server takes the question words off ("who is
 * responsible for", "who has … as a KRA"), matches what is left by MEANING
 * (a model built into our own server — nothing leaves it) against every
 * position's and person's KRAs, responsibilities and KPIs, roles, departments
 * and locations, and answers with PEOPLE first, then the vacant positions that
 * match. "Read as: …" shows what it searched for, so a surprising answer can be
 * explained.
 *
 * A click on a result highlights its position(s) on the chart and dims the
 * rest until cleared; "Show all on the chart" highlights every answer.
 *
 * Kinds, "Exact words only" and the filters are kept for the browser session.
 */

const KIND_LABEL: Record<AskMatch['kind'], string> = {
  KRA: 'KRA',
  RESPONSIBILITY: 'Responsibility',
  KPI: 'KPI',
  ROLE: 'Role',
  POSITION: 'Position',
  DEPARTMENT: 'Department',
  LOCATION: 'Location',
};

const KIND_CHOICES: { kind: AskKind; label: string }[] = [
  { kind: 'KRA', label: 'KRAs' },
  { kind: 'RESPONSIBILITY', label: 'Responsibilities' },
  { kind: 'KPI', label: 'KPIs' },
  { kind: 'ROLE', label: 'Roles' },
  { kind: 'DEPARTMENT', label: 'Departments' },
];
const ALL_KINDS: AskKind[] = KIND_CHOICES.map((c) => c.kind);

const EXAMPLES = ['Who owns vendor onboarding?', 'Who has customer complaints as a KRA?', 'Who prepares the dispatch plan?'];

interface Prefs {
  kinds: AskKind[];
  exact: boolean;
  advanced: boolean;
  department: number | null;
  label: number | null;
  location: number | null;
}
const PREFS_KEY = 'cf_hrms.orgChartAsk.v1';
const DEFAULT_PREFS: Prefs = { kinds: ALL_KINDS, exact: false, advanced: false, department: null, label: null, location: null };

function readPrefs(): Prefs {
  try {
    const raw = window.sessionStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const kinds = Array.isArray(p.kinds) ? p.kinds.filter((k): k is AskKind => ALL_KINDS.includes(k)) : [];
    const id = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);
    return {
      kinds: kinds.length ? kinds : ALL_KINDS,
      exact: p.exact === true,
      advanced: p.advanced === true,
      department: id(p.department),
      label: id(p.label),
      location: id(p.location),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(p: Prefs) {
  try {
    window.sessionStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked — the choices just are not remembered */
  }
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const parts = useMemo(() => {
    const escaped = terms
      .filter((t) => t.length > 2)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    if (!escaped.length) return [{ t: text, hit: false }];
    const re = new RegExp(`(${escaped.join('|')})`, 'ig');
    return text
      .split(re)
      .filter((s) => s !== '')
      .map((s) => ({ t: s, hit: terms.some((term) => s.toLowerCase() === term.toLowerCase()) }));
  }, [text, terms]);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <Box key={i} component="mark" sx={{ background: 'var(--c-primary-100)', color: 'var(--c-primary-900)', borderRadius: 2, px: 0.25 }}>
            {p.t}
          </Box>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

function MatchLines({ matches, terms, max = 4 }: { matches: AskMatch[]; terms: string[]; max?: number }) {
  return (
    <Stack spacing={0.5} sx={{ mt: 0.75 }}>
      {matches.slice(0, max).map((m) => (
        <Stack key={`${m.kind}:${m.id}:${m.positionId}`} direction="row" spacing={1} alignItems="flex-start">
          <Chip
            size="small"
            variant="outlined"
            label={KIND_LABEL[m.kind] ?? m.kind}
            sx={{ height: 18, fontSize: 10.5, flexShrink: 0, mt: '1px', color: 'var(--c-text-2)' }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-1)', lineHeight: 1.45 }}>
              <Highlighted text={m.text} terms={terms} />
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', lineHeight: 1.35 }}>{m.why}</Typography>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

const placeOf = (p: { departmentName: string | null; locationName: string | null }) =>
  [p.departmentName, p.locationName].filter(Boolean).join(' · ');

export interface AskPick {
  /** The positions to highlight on the chart. */
  positionIds: number[];
  /** What the highlight is, in words — shown beside "Clear". */
  label: string;
  /** The one to open in the panel, if any. */
  open?: number;
}

export function OrgChartAsk({
  open,
  asOf,
  initialQuestion = '',
  departments,
  labels,
  onClose,
  onPick,
}: {
  open: boolean;
  asOf: string;
  initialQuestion?: string;
  departments: OrgChartDepartment[];
  labels: DepartmentLabel[];
  onClose: () => void;
  onPick: (pick: AskPick) => void;
}) {
  const [q, setQ] = useState(initialQuestion);
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<'people' | 'positions'>('people');
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // A question handed in from ⌘K ("Ask: …") replaces whatever was typed.
  useEffect(() => {
    if (open && initialQuestion) setQ(initialQuestion);
  }, [open, initialQuestion]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    // Locations are an org-area list; a login without it simply gets no location filter.
    orgApi.locations
      .list()
      .then((rows) => { if (live) setLocations(rows); })
      .catch(() => { if (live) setLocations([]); });
    return () => { live = false; };
  }, [open]);

  const kindsKey = prefs.kinds.join(',');
  const terms = useMemo(() => (result?.reading.searchedFor ?? '').split(/\s+/).filter(Boolean), [result]);

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });
  };

  const toggleKind = (kind: AskKind) => {
    const has = prefs.kinds.includes(kind);
    if (has && prefs.kinds.length === 1) return;
    updatePrefs({ kinds: has ? prefs.kinds.filter((k) => k !== kind) : ALL_KINDS.filter((k) => k === kind || prefs.kinds.includes(k)) });
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  // All five ticked = "let the question decide" ("… as a KRA" narrows it on the server).
  const kindsParam = prefs.kinds.length === ALL_KINDS.length ? undefined : (kindsKey.split(',') as AskKind[]);
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResult(null);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      orgChartApi
        .ask(q.trim(), {
          on: asOf,
          kinds: kindsParam,
          mode: prefs.exact ? 'exact' : 'meaning',
          department: prefs.department,
          label: prefs.label ? [prefs.label] : undefined,
          location: prefs.location,
          limit: 50,
        })
        .then((r) => {
          if (live) {
            setResult(r && Array.isArray(r.people) ? r : null);
            setError(null);
          }
        })
        .catch((e) => { if (live) setError(e); })
        .finally(() => { if (live) setLoading(false); });
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // kindsParam is derived from kindsKey
  }, [q, asOf, open, kindsKey, prefs.exact, prefs.department, prefs.label, prefs.location]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedDepartments = useMemo(() => [...departments].sort((a, b) => a.name.localeCompare(b.name)), [departments]);
  const filterCount = [prefs.department, prefs.label, prefs.location].filter((v) => v != null).length;

  const pickPerson = (p: AskPerson) => {
    const ids = p.positions.map((x) => x.positionId);
    onPick({ positionIds: ids, label: p.name, open: p.matches[0]?.positionId ?? ids[0] });
    onClose();
  };
  const pickPosition = (p: AskPositionHit) => {
    onPick({ positionIds: [p.positionId], label: p.positionCode ?? p.title, open: p.positionId });
    onClose();
  };
  const pickAll = () => {
    if (!result) return;
    const ids = [...new Set([...result.people.flatMap((p) => p.positions.map((x) => x.positionId)), ...result.positions.map((p) => p.positionId)])];
    onPick({ positionIds: ids, label: `answers to "${result.reading.searchedFor}"` });
    onClose();
  };

  const byWords = prefs.exact || result?.mode === 'keyword';
  const readAs = result
    ? [
        `"${result.reading.searchedFor}"`,
        result.reading.kindsFromQuestion && result.kinds.length < ALL_KINDS.length
          ? `${KIND_CHOICES.filter((c) => result.kinds.includes(c.kind)).map((c) => c.label).join(', ')} only`
          : null,
        result.reading.place ? `in ${result.reading.place.name}` : null,
      ].filter(Boolean).join(' · ')
    : '';
  const nothing = !!result && result.people.length === 0 && result.positions.length === 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogHeader
        title={<Typography sx={{ fontSize: 20, fontWeight: 600 }}>Ask</Typography>}
        subtitle="Who owns a piece of work — from KRAs, responsibilities and KPIs of every role, position and person, matched by meaning."
        onClose={onClose}
      />
      <DialogContent dividers>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Who owns vendor onboarding?"
          label="Your question"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <QuestionAnswerRounded fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ mt: 0.5, mb: 1.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => updatePrefs({ advanced: !prefs.advanced })}
            aria-expanded={prefs.advanced}
            endIcon={<ExpandMoreRounded sx={{ transform: prefs.advanced ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
            sx={{ px: 0.5, minWidth: 0, color: 'var(--c-text-2)' }}
          >
            Filters{filterCount ? ` (${filterCount})` : ''}
          </Button>
          <Collapse in={prefs.advanced} unmountOnExit>
            <Stack spacing={1} sx={{ pl: 0.5, pt: 0.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 2 }} alignItems={{ xs: 'flex-start', sm: 'center' }} flexWrap="wrap" useFlexGap>
                <FormGroup row aria-label="Look in">
                  {KIND_CHOICES.map((c) => {
                    const checked = prefs.kinds.includes(c.kind);
                    return (
                      <FormControlLabel
                        key={c.kind}
                        control={<Checkbox size="small" checked={checked} disabled={checked && prefs.kinds.length === 1} onChange={() => toggleKind(c.kind)} />}
                        label={<Typography sx={{ fontSize: 13 }}>{c.label}</Typography>}
                      />
                    );
                  })}
                </FormGroup>
                <FormControlLabel
                  control={<Switch size="small" checked={prefs.exact} onChange={(e) => updatePrefs({ exact: e.target.checked })} />}
                  label={<Typography sx={{ fontSize: 13 }}>Exact words only</Typography>}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  select
                  size="small"
                  label="Department (and below)"
                  value={prefs.department ?? ''}
                  onChange={(e) => updatePrefs({ department: e.target.value === '' ? null : Number(e.target.value) })}
                  sx={{ minWidth: 200, flex: 1 }}
                >
                  <MenuItem value="">Any department</MenuItem>
                  {sortedDepartments.map((d) => (
                    <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Label"
                  value={prefs.label ?? ''}
                  onChange={(e) => updatePrefs({ label: e.target.value === '' ? null : Number(e.target.value) })}
                  sx={{ minWidth: 160, flex: 1 }}
                >
                  <MenuItem value="">Any label</MenuItem>
                  {labels.map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                  ))}
                </TextField>
                {locations.length > 0 && (
                  <TextField
                    select
                    size="small"
                    label="Location"
                    value={prefs.location ?? ''}
                    onChange={(e) => updatePrefs({ location: e.target.value === '' ? null : Number(e.target.value) })}
                    sx={{ minWidth: 140, flex: 1 }}
                  >
                    <MenuItem value="">Any location</MenuItem>
                    {locations.map((l) => (
                      <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              </Stack>
            </Stack>
          </Collapse>
        </Box>

        {!!error && <ErrorNotice error={error} />}
        {!loading && !error && result && (
          <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              Read as: <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text-1)' }}>{readAs}</Box>
              {byWords ? ' — every word must appear' : ''}
            </Typography>
            {result.scoped && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>· people from your department and below only</Typography>
            )}
          </Stack>
        )}
        {!loading && !error && result?.notice && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>{result.notice}</Typography>
        )}
        {loading && <ListSkeleton rows={4} />}
        {!loading && q.trim().length < 2 && (
          <Stack spacing={0.75}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Ask in plain words, for example:</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {EXAMPLES.map((ex) => (
                <Chip key={ex} size="small" label={ex} onClick={() => setQ(ex)} variant="outlined" />
              ))}
            </Stack>
          </Stack>
        )}
        {!loading && !error && q.trim().length >= 2 && nothing && (
          <EmptyState
            title={byWords ? 'Nothing carries all of those words' : 'No one close to that'}
            hint={byWords ? 'Try fewer words — every word has to appear.' : 'Try describing the work another way, or clear the filters.'}
          />
        )}
        {!loading && !error && result && !nothing && (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ borderBottom: '1px solid var(--c-border)', mb: 1.5 }}>
              <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
                <Tab value="people" label={`People (${result.totals.people})${result.totals.vacant ? ` · vacant ${result.totals.vacant}` : ''}`} />
                <Tab value="positions" label={`Positions (${result.totals.positions})`} />
              </Tabs>
              <Button size="small" onClick={pickAll}>Show all on the chart</Button>
            </Stack>

            {tab === 'people' && (
              <Stack spacing={1}>
                {result.people.length === 0 && (
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                    {result.scoped ? 'No one in your department and below.' : 'No one holds a matching position.'}
                  </Typography>
                )}
                {result.people.map((p) => (
                  <Surface
                    key={p.employeeId}
                    e={1}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickPerson(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter') pickPerson(p); }}
                    sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 'var(--e-2)' } }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{p.name}</Typography>
                      {p.employeeCode && <Mono sx={{ fontSize: 12 }}>{p.employeeCode}</Mono>}
                      <Chip size="small" label={`${p.matchCount} ${p.matchCount === 1 ? 'match' : 'matches'}`} sx={{ height: 20, fontSize: 11 }} />
                    </Stack>
                    {p.positions.map((x) => (
                      <Typography key={x.positionId} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                        {x.title}
                        {x.positionCode ? ` · ${x.positionCode}` : ''}
                        {placeOf(x) ? ` · ${placeOf(x)}` : ''}
                      </Typography>
                    ))}
                    <MatchLines matches={p.matches} terms={terms} />
                  </Surface>
                ))}
                {result.vacant.length > 0 && (
                  <>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', pt: 1, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      Vacant positions that match
                    </Typography>
                    {result.vacant.map((p) => (
                      <Surface
                        key={p.positionId}
                        e={1}
                        role="button"
                        tabIndex={0}
                        onClick={() => pickPosition(p)}
                        onKeyDown={(e) => { if (e.key === 'Enter') pickPosition(p); }}
                        sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 'var(--e-2)' } }}
                      >
                        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.sentence}</Typography>
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                          {p.title}{placeOf(p) ? ` · ${placeOf(p)}` : ''}
                        </Typography>
                        <MatchLines matches={p.matches} terms={terms} max={2} />
                      </Surface>
                    ))}
                  </>
                )}
              </Stack>
            )}

            {tab === 'positions' && (
              <Stack spacing={1}>
                {result.positions.map((p) => (
                  <Surface
                    key={p.positionId}
                    e={1}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickPosition(p)}
                    onKeyDown={(e) => { if (e.key === 'Enter') pickPosition(p); }}
                    sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 'var(--e-2)' } }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.title}</Typography>
                      {p.positionCode && <Mono sx={{ fontSize: 12 }}>{p.positionCode}</Mono>}
                      <Chip
                        size="small"
                        label={p.vacant ? 'Vacant' : p.occupants.length ? p.occupants.map((o) => o.name).join(', ') : 'Filled'}
                        color={p.vacant ? 'warning' : 'default'}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 11 }}
                      />
                    </Stack>
                    {placeOf(p) && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{placeOf(p)}</Typography>}
                    {p.matches.length > 0 ? (
                      <MatchLines matches={p.matches} terms={terms} max={3} />
                    ) : (
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>
                        Matches through the person in it — their own lines.
                      </Typography>
                    )}
                  </Surface>
                ))}
              </Stack>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
