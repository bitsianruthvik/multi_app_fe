/**
 * WaitBreakdownBar — EU-5: horizontal stacked bar visualizing a task's wait
 * time broken down by reason (fed by GET /tasks/:id/wait-breakdown `totals`).
 *
 * `WAIT_REASON_META` is the single reason→{label,color} map for this feature —
 * Phase 4 analytics screens should import it from here rather than redefining
 * colors, so the mapping never drifts (DESIGN_SYSTEM.md §7.3 precedent).
 * Colors follow the board-accent pattern (DESIGN_SYSTEM.md §5.1/§7.5
 * PipelineBoard): plain hex, not CSS vars, since these are categorical
 * (not status) accents and no token exists for them yet.
 */
/* eslint-disable react-refresh/only-export-components */
import { Box, Tooltip, Typography } from '@mui/material';
import type { WaitReason } from '../api/client';

export const WAIT_REASON_META: Record<WaitReason, { label: string; color: string }> = {
  waiting_predecessors: { label: 'Waiting on predecessors', color: '#0284C7' }, // sky (info)
  waiting_materials: { label: 'Waiting on materials', color: '#38BDF8' }, // lighter sky
  no_shift: { label: 'No shift', color: '#8A8EA8' }, // neutral/slate
  machine_down: { label: 'Machine down', color: '#E11D48' }, // rose (danger)
  no_operator: { label: 'No operator', color: '#A21CAF' }, // purple, distinct from brand violet
  machine_busy: { label: 'Machine busy', color: '#D97706' }, // amber (warning)
  output_blocked: { label: 'Output blocked', color: '#0D9488' }, // teal (secondary) — Phase 2, currently always 0
  unexplained_idle: { label: 'Unexplained idle', color: '#DB5A2C' }, // saturated attention (board "in production" accent)
};

const REASON_ORDER = Object.keys(WAIT_REASON_META) as WaitReason[];

/** Format minutes as "<H>h <M>m", e.g. formatWaitMinutes(200) === "3h 20m". */
export function formatWaitMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

export interface WaitBreakdownLegendProps {
  totals: Partial<Record<WaitReason, number>>;
}

/** Compact legend — one dot + label + duration per reason present in `totals`. */
export function WaitBreakdownLegend({ totals }: WaitBreakdownLegendProps) {
  const present = REASON_ORDER.filter((r) => (totals[r] ?? 0) > 0);
  if (present.length === 0) return null;
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mt: 1 }}>
      {present.map((r) => {
        const meta = WAIT_REASON_META[r];
        return (
          <Box key={r} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>
              {meta.label} · {formatWaitMinutes(totals[r] ?? 0)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export interface WaitBreakdownBarProps {
  /** Per-reason total minutes, as returned by GET /tasks/:id/wait-breakdown. */
  totals: Partial<Record<WaitReason, number>>;
  /** Bar height in px. */
  height?: number;
  /** Render the compact legend below the bar. */
  showLegend?: boolean;
}

/**
 * Stacked bar — one segment per reason, width proportional to its share of
 * total minutes, with a Tooltip per segment. Renders a muted empty state
 * when there is no wait time to show.
 */
export function WaitBreakdownBar({ totals, height = 10, showLegend = false }: WaitBreakdownBarProps) {
  const total = REASON_ORDER.reduce((sum, r) => sum + (totals[r] ?? 0), 0);

  if (total <= 0) {
    return <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No wait recorded</Typography>;
  }

  const segments = REASON_ORDER
    .map((reason) => ({ reason, minutes: totals[reason] ?? 0 }))
    .filter((s) => s.minutes > 0);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          height,
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          border: '1px solid var(--c-border)',
        }}
      >
        {segments.map((s) => {
          const meta = WAIT_REASON_META[s.reason];
          const pct = (s.minutes / total) * 100;
          return (
            <Tooltip key={s.reason} title={`${meta.label}: ${formatWaitMinutes(s.minutes)}`} arrow>
              <Box sx={{ width: `${pct}%`, height: '100%', background: meta.color }} />
            </Tooltip>
          );
        })}
      </Box>
      {showLegend && <WaitBreakdownLegend totals={totals} />}
    </Box>
  );
}
