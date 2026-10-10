/**
 * A job, as its KRAs with the responsibilities and KPIs under each.
 *
 * ONE component for every place a job is shown — the org chart panel, a role, a
 * position, the Departments screen, My place — so the five cannot drift into
 * five layouts of the same thing. Each place brings its own data (see
 * `api/jobContent.ts`) and, where it may edit, its own actions through the
 * `lineActions` / `kraActions` / `sectionFooter` slots. Nothing in here writes.
 *
 *   KRA              an outcome area — a heading, set on the role
 *     Responsibility   a task under it
 *     KPI              a measure under it, with its target
 *   Not yet grouped  lines that sit under no KRA. Shown, never dropped.
 *
 * COMPACT BY DEFAULT. Karni's HR head has 73 responsibilities and the org
 * chart's panel is 500px wide, so a job opens as its headings with counts and
 * each heading is a button. A short job (a handful of lines) opens itself.
 *
 * A SEAT'S OWN CHANGES ARE MARKED ON THE LINE, in words — "Specific to this
 * seat", "Changed for this seat" (with what the role says underneath), "Switched
 * off for this seat" (struck through). The strike-through is never the only
 * signal: the badge says it in text, so it survives a screen reader, a
 * monochrome print and anyone who does not read a line through as "removed".
 *
 * NEVER AN EMPTY BOX. "No KRAs written for this role yet" and "nothing is
 * written for this job" are different sentences and each is said outright.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Checkbox, Stack, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { CapsLabel, ToneBadge } from '@shared/ui';
import type { JobContentData, JobKra, JobLine, JobMark } from '../api/jobContent';

const UNGROUPED = '__ungrouped';
/** Lines shown per list before "Show all", in the dense layout. */
const DENSE_PREVIEW = 8;
/** A job this short opens itself. */
const AUTO_OPEN_LINES = 8;

const MARK_LABEL: Record<Exclude<JobMark, null>, string> = {
  ADDED: 'Specific to this seat',
  CHANGED: 'Changed for this seat',
  OFF: 'Switched off for this seat',
};
/** Said to the person in the seat, the same three facts read as theirs. */
const MARK_LABEL_SELF: Record<Exclude<JobMark, null>, string> = {
  ADDED: 'Specific to your job',
  CHANGED: 'Different for your job',
  OFF: 'Not part of your job',
};
const MARK_TONE: Record<Exclude<JobMark, null>, 'info' | 'warning' | 'neutral'> = {
  ADDED: 'info',
  CHANGED: 'warning',
  OFF: 'neutral',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KPI_WORDS = ['KPI', 'KPIs'] as const;
const RESP_WORDS = ['responsibility', 'responsibilities'] as const;

function countsText(responsibilities: JobLine[], kpis: JobLine[]): string {
  const r = responsibilities.filter((l) => l.mark !== 'OFF').length;
  const k = kpis.filter((l) => l.mark !== 'OFF').length;
  const off = [...responsibilities, ...kpis].filter((l) => l.mark === 'OFF').length;
  const bits = [plural(r, ...RESP_WORDS), plural(k, ...KPI_WORDS)];
  if (off) bits.push(`${off} switched off`);
  return bits.join(' · ');
}

export interface JobContentSelection {
  selected: ReadonlySet<string>;
  toggle: (line: JobLine) => void;
}

export interface JobContentProps {
  content: JobContentData;
  /** `self`: the reader is the person in the seat, so the sentences say "your". */
  voice?: 'hr' | 'self';
  /** For the 500px panel and the side sheet: tighter type, and long lists fold. */
  dense?: boolean;
  /** `auto` opens everything when the whole job is a handful of lines. */
  initiallyOpen?: 'auto' | 'all' | 'none';
  /** Per-line controls (edit, move, switch off…). Omit for a read-only view. */
  lineActions?: (line: JobLine, kra: JobKra | null) => ReactNode;
  /** Per-KRA controls (rename, delete…). */
  kraActions?: (kra: JobKra) => ReactNode;
  /** Under each section's lists — "Add a responsibility here". `null` is the ungrouped section. */
  sectionFooter?: (kra: JobKra | null) => ReactNode;
  /** Tick boxes on lines, for moving several at once. */
  selection?: JobContentSelection;
  /** Shown beside the "no KRAs yet" sentence — usually a link to the role. */
  noKrasAction?: ReactNode;
  /** Off where the page already prints the counts above (the role editor's band). */
  summary?: boolean;
}

export function JobContent({
  content,
  voice = 'hr',
  dense = false,
  initiallyOpen = 'auto',
  lineActions,
  kraActions,
  sectionFooter,
  selection,
  noKrasAction,
  summary = true,
}: JobContentProps) {
  const { kras, ungrouped, counts, subject } = content;
  const ungroupedCount = ungrouped.responsibilities.length + ungrouped.kpis.length;
  const totalLines =
    kras.reduce((t, k) => t + k.responsibilities.length + k.kpis.length, 0) + ungroupedCount;
  const sectionKeys = useMemo(
    () => [...kras.map((k) => k.key), ...(ungroupedCount ? [UNGROUPED] : [])],
    [kras, ungroupedCount],
  );

  // What the reader opened or closed by hand; everything else follows the default.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const openByDefault =
    initiallyOpen === 'all' || (initiallyOpen === 'auto' && totalLines <= AUTO_OPEN_LINES);
  const isOpen = (key: string) => toggled[key] ?? openByDefault;
  const anyClosed = sectionKeys.some((k) => !isOpen(k));
  const setAll = (open: boolean) => setToggled(Object.fromEntries(sectionKeys.map((k) => [k, open])));

  const fontSize = dense ? 13 : 13.5;
  const markLabel = voice === 'self' ? MARK_LABEL_SELF : MARK_LABEL;
  const whose = voice === 'self' ? 'your' : subject === 'SEAT' ? "this seat's" : "this role's";

  /* ── nothing at all ─────────────────────────────────────────────────────── */
  if (kras.length === 0 && totalLines === 0) {
    return (
      <Box data-jobcontent="" data-empty="">
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.55 }}>
          {voice === 'self'
            ? 'Your responsibilities have not been written into the system yet. That is about the records, not about your job.'
            : subject === 'SEAT'
              ? 'This seat has no responsibilities — no KRAs, responsibilities or KPIs are written for its role yet.'
              : 'No KRAs, responsibilities or KPIs are written for this role yet.'}
          {noKrasAction ? <> {noKrasAction}</> : null}
        </Typography>
        {sectionFooter?.(null)}
      </Box>
    );
  }

  const line = (l: JobLine, kra: JobKra | null) => {
    const off = l.mark === 'OFF';
    const ticked = selection?.selected.has(l.key) ?? false;
    return (
      <Box
        component="li"
        key={l.key}
        data-jobline={l.kind}
        data-mark={l.mark ?? undefined}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 0.75,
          py: dense ? 0.6 : 0.75,
          borderBottom: '1px solid var(--c-divider)',
          '&:last-of-type': { borderBottom: 0 },
        }}
      >
        {selection && l.roleRowId != null && (
          <Checkbox
            size="small"
            checked={ticked}
            onChange={() => selection.toggle(l)}
            inputProps={{ 'aria-label': `Select: ${l.name}` }}
            sx={{ p: 0.25, mt: '-1px' }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="div"
            sx={{
              fontSize,
              lineHeight: 1.5,
              color: off ? 'var(--c-text-2)' : 'var(--c-text)',
              textDecoration: off ? 'line-through' : 'none',
              overflowWrap: 'anywhere',
            }}
          >
            {l.name}
          </Typography>
          {l.description && !off && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              {l.description}
            </Typography>
          )}
          {l.detail && !off && (
            <Typography
              sx={{
                fontSize: 12.5,
                lineHeight: 1.5,
                color: l.kind === 'KPI' ? 'var(--c-text)' : 'var(--c-text-2)',
                fontWeight: l.kind === 'KPI' ? 500 : 400,
                overflowWrap: 'anywhere',
              }}
            >
              {l.kind === 'KPI' && l.targetText ? 'Target: ' : ''}
              {l.detail}
            </Typography>
          )}
          {(l.mark || l.note) && (
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.4 }}>
              {l.mark && <ToneBadge tone={MARK_TONE[l.mark]} label={markLabel[l.mark]} noIcon />}
              {l.was && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l.was}</Typography>
              )}
              {l.reason && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
                  Why: {l.reason}
                </Typography>
              )}
              {l.note && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l.note}</Typography>
              )}
            </Stack>
          )}
        </Box>
        {lineActions && <Box sx={{ flexShrink: 0 }}>{lineActions(l, kra)}</Box>}
      </Box>
    );
  };

  const list = (key: string, label: string, lines: JobLine[], kra: JobKra | null) => {
    if (lines.length === 0) return null;
    const folded = dense && lines.length > DENSE_PREVIEW && !showAll[key];
    const shown = folded ? lines.slice(0, DENSE_PREVIEW) : lines;
    return (
      <Box sx={{ mt: 1 }}>
        <CapsLabel>{label}</CapsLabel>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, mt: 0.25 }}>
          {shown.map((l) => line(l, kra))}
        </Box>
        {dense && lines.length > DENSE_PREVIEW && (
          <Button
            size="small"
            onClick={() => setShowAll((s) => ({ ...s, [key]: !s[key] }))}
            sx={{ mt: 0.5, textTransform: 'none', fontSize: 12.5 }}
          >
            {folded ? `Show all ${lines.length}` : 'Show fewer'}
          </Button>
        )}
      </Box>
    );
  };

  const section = (
    key: string,
    kra: JobKra | null,
    title: ReactNode,
    description: string | null,
    responsibilities: JobLine[],
    kpis: JobLine[],
  ) => {
    const open = isOpen(key);
    const bodyId = `jobcontent-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
    const empty = responsibilities.length + kpis.length === 0;
    return (
      <Box
        key={key}
        data-jobsection={kra ? 'kra' : 'ungrouped'}
        sx={{
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-sm)',
          background: 'var(--c-surface)',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, background: 'var(--c-surface-2)' }}>
          <Box
            component="button"
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setToggled((t) => ({ ...t, [key]: !open }))}
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 0.5,
              textAlign: 'left',
              border: 0,
              background: 'none',
              font: 'inherit',
              color: 'inherit',
              cursor: 'pointer',
              px: 1,
              py: dense ? 0.9 : 1.1,
              '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: -2 },
            }}
          >
            {open ? (
              <ExpandMoreRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)', flexShrink: 0 }} />
            ) : (
              <ChevronRightRounded aria-hidden sx={{ fontSize: 20, color: 'var(--c-text-2)', flexShrink: 0 }} />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: dense ? 13.5 : 14.5, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                {title}
              </Box>
              <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.15 }}>
                {empty ? 'Nothing filed here yet' : countsText(responsibilities, kpis)}
              </Box>
            </Box>
          </Box>
          {kra && kraActions && <Box sx={{ flexShrink: 0, pt: 0.6, pr: 0.5 }}>{kraActions(kra)}</Box>}
        </Box>
        {open && (
          <Box id={bodyId} sx={{ px: 1.5, pb: 1.25, pt: 0.25 }}>
            {description && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.55, mt: 0.75, overflowWrap: 'anywhere' }}>
                {description}
              </Typography>
            )}
            {empty && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75 }}>
                No responsibilities or KPIs are filed under this KRA yet.
              </Typography>
            )}
            {list(`${key}:r`, 'Responsibilities', responsibilities, kra)}
            {list(`${key}:k`, 'KPIs', kpis, kra)}
            {sectionFooter?.(kra)}
          </Box>
        )}
      </Box>
    );
  };

  const differs = counts.added + counts.changed + counts.off;

  return (
    <Box data-jobcontent="">
      <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={1} sx={{ mb: 1 }}>
        {summary ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', flex: 1, minWidth: 180 }}>
            {plural(counts.kras, 'KRA')} · {plural(counts.responsibilities, ...RESP_WORDS)} · {plural(counts.kpis, ...KPI_WORDS)}
            {subject === 'SEAT' && voice === 'hr' && (
              <>
                {' · '}
                {differs === 0
                  ? 'exactly as the role says'
                  : [
                      counts.added ? `${counts.added} specific to this seat` : null,
                      counts.changed ? `${counts.changed} changed` : null,
                      counts.off ? `${counts.off} switched off` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
              </>
            )}
          </Typography>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        {sectionKeys.length > 1 && (
          <Button size="small" onClick={() => setAll(anyClosed)} sx={{ textTransform: 'none', fontSize: 12.5 }}>
            {anyClosed ? 'Open all' : 'Close all'}
          </Button>
        )}
      </Stack>

      {kras.length === 0 && (
        <Typography data-nokras="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.55, mb: 1 }}>
          No KRAs written for {voice === 'self' ? 'your' : 'this'} role yet, so {whose} work is listed below without
          outcome areas.{noKrasAction ? <> {noKrasAction}</> : null}
        </Typography>
      )}

      <Stack spacing={1}>
        {kras.map((k) =>
          section(
            k.key,
            k,
            <>
              {k.name}
              {k.weightPercent != null && (
                <Box component="span" sx={{ ml: 0.75, fontSize: 12, fontWeight: 500, color: 'var(--c-text-2)' }}>
                  {k.weightPercent}%
                </Box>
              )}
              {k.mark && (
                <Box component="span" sx={{ ml: 0.75, display: 'inline-flex', verticalAlign: 'middle' }}>
                  <ToneBadge tone={MARK_TONE[k.mark]} label={markLabel[k.mark]} noIcon />
                </Box>
              )}
            </>,
            k.description,
            k.responsibilities,
            k.kpis,
          ),
        )}
        {ungroupedCount > 0 &&
          section(
            UNGROUPED,
            null,
            'Not yet grouped under a KRA',
            kras.length > 0
              ? 'These still count as part of the job. They have not been filed under an outcome area.'
              : null,
            ungrouped.responsibilities,
            ungrouped.kpis,
          )}
        {ungroupedCount === 0 && sectionFooter && (
          // With nothing ungrouped there is no ungrouped section to hold its footer.
          <Box>{sectionFooter(null)}</Box>
        )}
      </Stack>
    </Box>
  );
}

export default JobContent;
