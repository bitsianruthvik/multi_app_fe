import { useState, type ReactNode } from 'react';
import { Box, Button, Collapse, Tooltip } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import type { NestFilesResult } from '../../api/nesting';
import { compactNests } from '../../lib/nesting';
import type { Review, ReviewKind, ReviewLine, ReviewNames } from '../../lib/nestReview';

/**
 * THE TOP OF THE UPLOAD REVIEW (2026-10-14): Must fix (open), Check (open), For
 * information (shut) — the groups worked out in lib/nestReview.ts. A section
 * folds its lines away; it never leaves one out.
 */

/* ---- the pieces of the screen ------------------------------------------------------------- */

/** A section that opens and shuts. Its content stays in the page when shut (it is only folded away). */
function Section({ id, title, count, tone, open, onToggle, children }: {
  id: string; title: string; count: number; tone: 'danger' | 'warning' | 'neutral'; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const colour = tone === 'danger' ? 'var(--c-danger-800)' : tone === 'warning' ? 'var(--c-warning-800)' : 'var(--c-text-2)';
  return (
    <Box data-testid="review-section" data-section={id} data-open={open ? 'true' : 'false'} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', minWidth: 0, overflow: 'hidden' }}>
      <Box component="button" type="button" data-testid="review-section-toggle" aria-expanded={open} aria-controls={`review-${id}`} onClick={onToggle}
        sx={{
          display: 'flex', gap: 0.75, alignItems: 'center', width: '100%', minWidth: 0, px: 1.25, py: 0.75, textAlign: 'left', font: 'inherit', color: colour,
          background: tone === 'neutral' ? 'var(--c-surface-2)' : `var(--c-${tone}-50)`, border: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 600,
          '&:focus-visible': { outline: '2px solid var(--c-primary-600)', outlineOffset: -2 },
        }}>
        {open ? <ExpandMoreRounded aria-hidden sx={{ fontSize: 20 }} /> : <ChevronRightRounded aria-hidden sx={{ fontSize: 20 }} />}
        <span>{`${title} (${count})`}</span>
      </Box>
      <Collapse in={open}>
        <Box id={`review-${id}`} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, px: 1.25, py: 1, minWidth: 0 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

/** One line: what it says, its nests on hover, and every sentence behind it on request. */
function Line({ line, tone }: { line: ReviewLine; tone: 'danger' | 'warning' }) {
  const [open, setOpen] = useState(false);
  return (
    <Box component="li" data-testid="review-line" data-code={line.code} sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 }}>
        {line.nestsTitle
          ? <Tooltip title={line.nestsTitle}><Box component="span" data-testid="review-line-text" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>{line.text}</Box></Tooltip>
          : <Box component="span" data-testid="review-line-text" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>{line.text}</Box>}
        {line.detail.length > 0 && (
          <Button size="small" data-testid="review-line-more" aria-expanded={open} onClick={() => setOpen((o) => !o)} sx={{ minWidth: 0, py: 0, px: 0.5, fontSize: 12 }}>
            {open ? 'Hide' : line.detail.length === 1 ? 'The sentence' : `The ${line.detail.length} sentences`}
          </Button>
        )}
      </Box>
      {line.detail.length > 0 && (
        <Collapse in={open}>
          <Box component="ul" data-testid="review-line-detail" sx={{
            m: 0, mt: 0.25, pl: 2.5, display: 'grid', gap: 0.25, fontSize: 12.5, overflowWrap: 'anywhere',
            color: tone === 'danger' ? 'var(--c-danger-700, var(--c-danger-800))' : 'var(--c-warning-800)',
          }}>
            {line.detail.map((m) => <li key={m}>{m}</li>)}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

/** Nested more than the line needs: one row per cut piece. It never scrolls sideways — the cells wrap. */
function SurplusTable({ result, names }: { result: NestFilesResult; names: ReviewNames }) {
  const th = { py: 0.5, px: 0.75, textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', borderBottom: '1px solid var(--c-border)' } as const;
  const td = { py: 0.6, px: 0.75, verticalAlign: 'top', borderBottom: '1px solid var(--c-divider)', overflowWrap: 'anywhere', fontSize: 13 } as const;
  const num = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as const;
  return (
    <Box component="table" data-testid="surplus-table" aria-label="Cut pieces nested more often than the line needs" sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '22%' }} /><col style={{ width: '24%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '27%' }} />
      </colgroup>
      <thead>
        <Box component="tr">
          <Box component="th" scope="col" sx={th}>Cut piece</Box>
          <Box component="th" scope="col" sx={th}>Part</Box>
          <Box component="th" scope="col" sx={{ ...th, textAlign: 'right' }}>Needs</Box>
          <Box component="th" scope="col" sx={{ ...th, textAlign: 'right' }}>In files</Box>
          <Box component="th" scope="col" sx={{ ...th, textAlign: 'right' }}>Extra</Box>
          <Box component="th" scope="col" sx={th}>On nests</Box>
        </Box>
      </thead>
      <tbody>
        {result.surplus.map((s) => {
          const n = names.name(s.cutPlateCode);
          const on = s.on.map((o) => ({ ...names.placeOfName(o.name), qty: o.qty, name: o.name }));
          // The same nest on several plates is one entry, its pieces added.
          const per = new Map<string, number>();
          for (const o of on) { const k = o.nest != null ? `${o.group} nest ${o.nest}` : o.group; per.set(k, (per.get(k) ?? 0) + o.qty); }
          return (
            <Box component="tr" key={s.cutPlateId} data-testid="surplus-row" data-code={s.cutPlateCode}>
              <Box component="td" sx={td}><Tooltip title={n.title}><Box component="span" data-testid="cut-piece-name" data-code={s.cutPlateCode}>{n.short}</Box></Tooltip></Box>
              <Box component="td" sx={{ ...td, color: 'var(--c-text-2)' }}>{n.part ?? '—'}</Box>
              <Box component="td" sx={num}>{s.needed}</Box>
              <Box component="td" sx={num}>{s.nested}</Box>
              <Box component="td" sx={{ ...num, fontWeight: 600, color: 'var(--c-warning-800)' }}>{s.surplus}</Box>
              <Box component="td" sx={td}>
                <Tooltip title={[...per].map(([k, q]) => `${k}: ${q}`).join(' · ')}>
                  <Box component="span" data-testid="surplus-nests">{compactNests(on)}</Box>
                </Tooltip>
              </Box>
            </Box>
          );
        })}
      </tbody>
    </Box>
  );
}

function Kinds({ kinds, tone, result, names }: { kinds: ReviewKind[]; tone: 'danger' | 'warning'; result: NestFilesResult; names: ReviewNames }) {
  return (
    <>
      {kinds.map((k) => {
        const count = (k.surplus ? result.surplus.length : 0) + k.lines.length;
        return (
          <Box key={k.code} data-testid="review-kind" data-code={k.code} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5, minWidth: 0 }}>
            {k.title && (
              <Box sx={{ fontSize: 13, fontWeight: 600 }}>
                {k.title}
                <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)' }}>{` · ${count}`}</Box>
              </Box>
            )}
            {k.surplus && <SurplusTable result={result} names={names} />}
            {k.lines.length > 0 && (
              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5, fontSize: 13, minWidth: 0 }}>
                {k.lines.map((l) => <Line key={l.key} line={l} tone={tone} />)}
              </Box>
            )}
          </Box>
        );
      })}
    </>
  );
}

/** The three sections: Must fix (open), Check (open), For information (shut). A section with nothing in it is not shown. */
export function ReviewSections({ review, result, names }: { review: Review; result: NestFilesResult; names: ReviewNames }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ fix: true, check: true, info: false });
  const flip = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  // Counted in kinds, as the headline counts them ("2 things to check"); each kind says how many lines it has.
  return (
    <Box data-testid="review-sections" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1, minWidth: 0 }}>
      {review.fix.length > 0 && (
        <Section id="fix" title="Must fix" count={review.fix.length} tone="danger" open={open.fix} onToggle={() => flip('fix')}>
          <Kinds kinds={review.fix} tone="danger" result={result} names={names} />
        </Section>
      )}
      {review.check.length > 0 && (
        <Section id="check" title="Check" count={review.check.length} tone="warning" open={open.check} onToggle={() => flip('check')}>
          <Kinds kinds={review.check} tone="warning" result={result} names={names} />
        </Section>
      )}
      {review.info.length > 0 && (
        <Section id="info" title="For information" count={review.info.length} tone="neutral" open={open.info} onToggle={() => flip('info')}>
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.4, fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
            {review.info.map((n) => <li key={n.key} data-testid={n.testId ?? 'info-line'}>{n.text}</li>)}
          </Box>
        </Section>
      )}
    </Box>
  );
}
