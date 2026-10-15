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
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { DialogHeader, EmptyState, ErrorNotice, ListSkeleton, Mono, Surface } from '@shared/ui';
import type { SearchHit, SearchKind, SearchMatch, SearchResult } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';

/**
 * Search the job content of every position — KRAs, responsibilities and KPIs.
 *
 * By default the server matches by MEANING (a model built into our own server;
 * nothing leaves it): "machine stops" finds "Record machine stoppages". The
 * "Exact words only" switch goes back to the old rule — every word must appear.
 * Typed words are still highlighted where they occur, so a hit shows why it
 * matched when it can. If the server could not use the model it answers by exact
 * words and says so in one quiet line.
 *
 * The Advanced choices (which kinds, exact or not) are kept for the browser
 * session.
 */

const KIND_LABEL: Record<string, string> = {
  KRA: 'KRA',
  RESPONSIBILITY: 'Responsibility',
  KPI: 'KPI',
  QUALIFICATION: 'Qualification',
};

const KIND_CHOICES: { kind: SearchKind; label: string }[] = [
  { kind: 'KRA', label: 'KRAs' },
  { kind: 'RESPONSIBILITY', label: 'Responsibilities' },
  { kind: 'KPI', label: 'KPIs' },
];
const ALL_KINDS: SearchKind[] = KIND_CHOICES.map((c) => c.kind);

interface Prefs {
  kinds: SearchKind[];
  exact: boolean;
  advanced: boolean;
}
const PREFS_KEY = 'cf_hrms.orgChartSearch.v1';
const DEFAULT_PREFS: Prefs = { kinds: ALL_KINDS, exact: false, advanced: false };

function readPrefs(): Prefs {
  try {
    const raw = window.sessionStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    const kinds = Array.isArray(p.kinds) ? p.kinds.filter((k): k is SearchKind => ALL_KINDS.includes(k)) : [];
    return {
      kinds: kinds.length ? kinds : ALL_KINDS,
      exact: p.exact === true,
      advanced: p.advanced === true,
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
    if (!terms.length) return [{ t: text, hit: false }];
    const escaped = terms
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .filter(Boolean)
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
          <Box
            key={i}
            component="mark"
            sx={{
              background: 'var(--c-primary-100)',
              color: 'var(--c-primary-900)',
              borderRadius: 2,
              px: 0.25,
            }}
          >
            {p.t}
          </Box>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

/**
 * One result per card. The chairs of one card (same role, department and
 * manager) carry the same role lines, so the server's hits — one per position —
 * are folded here: the card shows once with its position codes, ranked where its
 * best chair ranked. A line one chair changed for itself says which chair.
 */
interface CardLine extends SearchMatch {
  /** Codes (or titles) of the card's positions that hold this line as their own change. */
  changedFor: string[];
}
interface CardResult {
  cardId: number;
  title: string;
  positionIds: number[];
  codes: string[];
  matchCount: number;
  lines: CardLine[];
}

function groupByCard(hits: SearchHit[]): CardResult[] {
  const byCard = new Map<number, CardResult>();
  const order: CardResult[] = [];
  for (const h of hits) {
    const key = h.cardId ?? h.positionId;
    let card = byCard.get(key);
    if (!card) {
      card = { cardId: key, title: h.title, positionIds: [], codes: [], matchCount: 0, lines: [] };
      byCard.set(key, card);
      order.push(card);
    }
    card.positionIds.push(h.positionId);
    if (h.positionCode) card.codes.push(h.positionCode);
    const label = h.positionCode ?? h.title;
    for (const m of h.matches ?? []) {
      let line = card.lines.find((l) => l.kind === m.kind && l.definitionId === m.definitionId);
      if (!line) {
        line = { ...m, changedFor: [] };
        card.lines.push(line);
      } else if (m.score > line.score) {
        line.score = m.score;
      }
      if (m.origin === 'POSITION' && !line.changedFor.includes(label)) line.changedFor.push(label);
    }
  }
  for (const card of order) {
    card.lines.sort((a, b) => b.score - a.score);
    card.matchCount = card.lines.length;
  }
  return order;
}

export function OrgChartSearch({
  open,
  asOf,
  onClose,
  onPick,
}: {
  open: boolean;
  asOf: string;
  onClose: () => void;
  onPick: (positionId: number) => void;
}) {
  const [q, setQ] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => q.trim().split(/\s+/).filter(Boolean), [q]);
  const kindsKey = prefs.kinds.join(',');
  const cards = useMemo(() => groupByCard(result?.items ?? []), [result]);

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      writePrefs(next);
      return next;
    });
  };

  const toggleKind = (kind: SearchKind) => {
    const has = prefs.kinds.includes(kind);
    if (has && prefs.kinds.length === 1) return; // at least one stays ticked
    const kinds = has ? prefs.kinds.filter((k) => k !== kind) : ALL_KINDS.filter((k) => k === kind || prefs.kinds.includes(k));
    updatePrefs({ kinds });
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

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
        .search(q.trim(), {
          on: asOf,
          kinds: kindsKey.split(',') as SearchKind[],
          mode: prefs.exact ? 'exact' : 'meaning',
        })
        .then((r) => {
          if (live) {
            setResult(r && Array.isArray(r.items) ? r : null);
            setError(null);
          }
        })
        .catch((e) => {
          if (live) setError(e);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, asOf, open, kindsKey, prefs.exact]);

  const byWords = prefs.exact || result?.mode === 'keyword';
  const kindsText = KIND_CHOICES.filter((c) => prefs.kinds.includes(c.kind))
    .map((c) => c.label)
    .join(', ');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogHeader
        title={<Typography sx={{ fontSize: 20, fontWeight: 600 }}>Search job content</Typography>}
        subtitle={`${kindsText} of every position — ${prefs.exact ? 'every word must appear' : 'matched by meaning, not only exact words'}.`}
        onClose={onClose}
      />
      <DialogContent dividers>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={prefs.exact ? 'e.g. safety audit' : 'Describe the work — e.g. machine stops, training new staff'}
          label="What work are you looking for?"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
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
            endIcon={
              <ExpandMoreRounded
                sx={{ transform: prefs.advanced ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
              />
            }
            sx={{ px: 0.5, minWidth: 0, color: 'var(--c-text-2)' }}
          >
            Advanced
          </Button>
          <Collapse in={prefs.advanced} unmountOnExit>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={{ xs: 0.5, sm: 2 }}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              sx={{ pl: 0.5, pt: 0.5 }}
            >
              <FormGroup row aria-label="Search in">
                {KIND_CHOICES.map((c) => {
                  const checked = prefs.kinds.includes(c.kind);
                  return (
                    <FormControlLabel
                      key={c.kind}
                      control={
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={checked && prefs.kinds.length === 1}
                          onChange={() => toggleKind(c.kind)}
                        />
                      }
                      label={<Typography sx={{ fontSize: 13 }}>{c.label}</Typography>}
                    />
                  );
                })}
              </FormGroup>
              <FormControlLabel
                control={
                  <Switch size="small" checked={prefs.exact} onChange={(e) => updatePrefs({ exact: e.target.checked })} />
                }
                label={<Typography sx={{ fontSize: 13 }}>Exact words only</Typography>}
              />
            </Stack>
          </Collapse>
        </Box>
        {!!error && <ErrorNotice error={error} />}
        {!loading && !error && result?.notice && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1 }}>{result.notice}</Typography>
        )}
        {loading && <ListSkeleton rows={4} />}
        {!loading && !error && q.trim().length >= 2 && result && cards.length === 0 && (
          <EmptyState
            title={byWords ? 'Nothing carries all of those words' : 'Nothing close to that'}
            hint={
              byWords
                ? 'Try fewer words — every word has to appear for a position to match.'
                : 'Try describing the work another way, or tick more kinds under Advanced.'
            }
          />
        )}
        {!loading && q.trim().length < 2 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Type at least two characters.</Typography>
        )}
        {!loading && (
          <Stack spacing={1}>
            {cards.map((g) => (
              <Surface
                key={g.cardId}
                e={1}
                onClick={() => {
                  onPick(g.positionIds[0]);
                  onClose();
                }}
                sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 'var(--e-2)' } }}
              >
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                    {g.title}
                    {g.codes.length > 1 && (
                      <Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}>
                        {' '}· {g.codes.length} positions
                      </Box>
                    )}
                  </Typography>
                  {g.codes.length > 0 && <Mono sx={{ fontSize: 12 }}>{g.codes.join(', ')}</Mono>}
                  <Chip
                    size="small"
                    label={`${g.matchCount} ${g.matchCount === 1 ? 'match' : 'matches'}`}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 0.75 }}>
                  {g.lines.slice(0, 6).map((m) => (
                    <Stack
                      key={`${m.kind}:${m.definitionId}`}
                      direction="row"
                      spacing={1}
                      alignItems="flex-start"
                    >
                      <Chip
                        size="small"
                        variant="outlined"
                        label={KIND_LABEL[m.kind] ?? m.kind}
                        sx={{ height: 18, fontSize: 10.5, flexShrink: 0, mt: '1px', color: 'var(--c-text-2)' }}
                      />
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.45, minWidth: 0 }}>
                        <Highlighted text={m.text} terms={terms} />
                        {m.changedFor.length > 0 && (
                          <Box component="span" sx={{ ml: 1, fontSize: 11.5, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
                            {m.changedFor.length === g.positionIds.length
                              ? g.positionIds.length === 1
                                ? 'changed for this position'
                                : 'changed for these positions'
                              : `changed for ${m.changedFor.join(', ')}`}
                          </Box>
                        )}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Surface>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
