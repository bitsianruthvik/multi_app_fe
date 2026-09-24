import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { DialogHeader, EmptyState, ErrorNotice, ListSkeleton, Mono, Surface } from '@shared/ui';
import type { SearchHit } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';

/**
 * Search across KRA, responsibility, KPI and qualification text (spec §5).
 *
 * Multi-word queries are **AND**, not OR: someone typing "safety audit" wants
 * the seats that carry both words, and an OR search over 282 responsibility
 * definitions returns most of the chart and answers nothing. The server matches
 * the same way; the words are re-highlighted here so a hit shows *why* it
 * matched rather than asking the reader to find it.
 */

const KIND_LABEL: Record<string, string> = {
  KRA: 'KRA',
  RESPONSIBILITY: 'Responsibility',
  KPI: 'KPI',
  QUALIFICATION: 'Qualification',
  SKILL: 'Skill',
  AUTHORITY: 'Authority',
};

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
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => q.trim().split(/\s+/).filter(Boolean), [q]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      orgChartApi
        .search(q.trim(), asOf)
        .then((r) => {
          if (live) {
            setHits(Array.isArray(r) ? r : []);
            setError(null);
          }
        })
        .catch((e) => {
          if (live) setError(e);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, asOf, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogHeader
        title={<Typography sx={{ fontSize: 20, fontWeight: 600 }}>Search responsibilities</Typography>}
        subtitle="Across KRA, responsibility, KPI and qualification text. Several words must all appear."
        onClose={onClose}
      />
      <DialogContent dividers>
        <TextField
          inputRef={inputRef}
          fullWidth
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. safety audit"
          label="Search text"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />
        {!!error && <ErrorNotice error={error} />}
        {loading && <ListSkeleton rows={4} />}
        {!loading && !error && q.trim().length >= 2 && hits.length === 0 && (
          <EmptyState
            title="Nothing carries all of those words"
            hint="Try fewer words — every word has to appear for a position to match."
          />
        )}
        {!loading && q.trim().length < 2 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            Type at least two characters.
          </Typography>
        )}
        <Stack spacing={1}>
          {hits.map((h) => (
            <Surface
              key={h.positionId}
              e={1}
              onClick={() => {
                onPick(h.positionId);
                onClose();
              }}
              sx={{ p: 1.5, cursor: 'pointer', '&:hover': { boxShadow: 'var(--e-2)' } }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{h.title}</Typography>
                {h.positionCode && <Mono sx={{ fontSize: 12 }}>{h.positionCode}</Mono>}
                <Chip size="small" label={`${h.matches?.length ?? 0} matches`} sx={{ height: 20, fontSize: 11 }} />
              </Stack>
              <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                {(h.matches ?? []).slice(0, 6).map((m, i) => (
                  <Typography key={i} sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.45 }}>
                    <Box
                      component="span"
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '.06em',
                        textTransform: 'uppercase',
                        color: 'var(--c-text-3)',
                        mr: 1,
                      }}
                    >
                      {KIND_LABEL[m.kind] ?? m.kind}
                    </Box>
                    <Highlighted text={m.text} terms={terms} />
                  </Typography>
                ))}
              </Stack>
            </Surface>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
