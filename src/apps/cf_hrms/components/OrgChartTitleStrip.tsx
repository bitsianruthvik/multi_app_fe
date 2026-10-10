import { Box, Typography } from '@mui/material';
import type { SceneLegendItem } from './orgChartLayout';

/**
 * The chart's title block, as a FIXED strip above the canvas (2026-10-10).
 *
 * Until then the title, the "as at" line, the four counts and the legend were
 * drawn into the SVG scene — because the client prints the chart and the print
 * must carry them. On screen that made them part of the picture: they shrank
 * with the wheel and slid away with a pan, so the one line that says what you
 * are looking at was the first thing to leave the screen.
 *
 * So there are now two of them, from the same inputs:
 *   - this strip, on screen — HTML, outside the zooming canvas, and inside the
 *     chart region so it rides into full screen;
 *   - the scene's own header, for PNG / PDF only (`buildScene({ titleBlock })`).
 *
 * The counts are whatever the page computed with the one counting rule
 * (`countRows` / `countPositions`); nothing is counted here. The legend is the
 * scene's `legend` — the same entries, the same resolved colours — so the key
 * can never show a line the chart is not drawing.
 */

export interface TitleStripFact {
  label: string;
  value: number | string;
}

function LegendSample({ item }: { item: SceneLegendItem }) {
  if (!item.line) {
    return (
      <Box
        component="span"
        aria-hidden
        sx={{
          width: 14,
          height: 11,
          borderRadius: '3px',
          border: `1px solid ${item.swatch ?? 'var(--c-border)'}`,
          background: item.fill ?? 'transparent',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M0 4H28"
        stroke={item.stroke}
        strokeWidth={item.sw ?? 1.4}
        strokeDasharray={item.dash?.join(' ')}
        fill="none"
      />
      {item.ring && (
        <>
          <circle cx="3" cy="4" r="3" fill={item.ring.fill} stroke={item.ring.stroke} strokeWidth="1.4" />
          <circle cx="25" cy="4" r="3" fill={item.ring.fill} stroke={item.ring.stroke} strokeWidth="1.4" />
        </>
      )}
    </svg>
  );
}

export function OrgChartTitleStrip({
  title,
  meta,
  facts,
  legend,
}: {
  /** "Organisation chart", or the branch it starts from. Omit for no title. */
  title?: string;
  /** "As at 2026-10-10 · All shifts". */
  meta: string;
  /** The counts, already computed by the page. */
  facts: TitleStripFact[];
  legend: SceneLegendItem[];
}) {
  return (
    <Box
      data-orgtitle=""
      sx={{
        flexShrink: 0,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 2,
        rowGap: 0.5,
        px: 1.5,
        py: 0.75,
        mb: 1,
        background: 'var(--c-surface)',
        border: '1px solid var(--c-border)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 1.5, rowGap: 0.25, minWidth: 0, flex: '1 1 auto' }}>
        {title && (
          <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
        )}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{meta}</Typography>
        <Box component="dl" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25, m: 0 }}>
          {facts.map((f) => (
            <Box key={f.label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
              <Box component="dt" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {f.label}
              </Box>
              <Box component="dd" sx={{ m: 0, fontSize: 13, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
                {f.value}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      {legend.length > 0 && (
        <Box
          component="ul"
          aria-label="Key"
          // Not on a phone: there the key wraps to three lines and takes the chart's
          // height; the export still carries it.
          sx={{ display: { xs: 'none', sm: 'flex' }, flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25, m: 0, p: 0, listStyle: 'none' }}
        >
          {legend.map((g) => (
            <Box component="li" key={g.text} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, fontSize: 12, color: 'var(--c-text-2)' }}>
              <LegendSample item={g} />
              {g.text}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default OrgChartTitleStrip;
