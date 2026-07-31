import { Box, Tooltip } from '@mui/material';

/**
 * A horizontal band of time segments — the "state of this machine over the last
 * 24 hours" bar used on the Factory Pulse cockpit and the Machine Board.
 *
 * State colours come from the --c-state-* tokens rather than the status
 * families, because running/idle/down/off is a fixed 4-value scale, not an
 * open-ended status. Before these tokens existed, ShopfloorAnalytics and
 * MachineTimeline each hardcoded their own greens and reds and disagreed.
 *
 * Segments are proportional to `minutes`, so a strip reads as real elapsed time
 * rather than an equal-width sequence of events.
 */

export type RunState = 'running' | 'idle' | 'down' | 'off' | 'wait';

const STATE_COLOR: Record<RunState, string> = {
  running: 'var(--c-state-running)',
  idle: 'var(--c-state-idle)',
  down: 'var(--c-state-down)',
  off: 'var(--c-state-off)',
  wait: 'var(--c-state-wait)',
};

const STATE_LABEL: Record<RunState, string> = {
  running: 'Running',
  idle: 'Idle',
  down: 'Down',
  off: 'Off shift',
  wait: 'Waiting',
};

export interface HeatSegment {
  state: RunState;
  minutes: number;
  /** Extra tooltip context, e.g. the job or downtime reason. */
  detail?: string;
}

export function Heatstrip({
  segments,
  height = 10,
  ariaLabel,
}: {
  segments: HeatSegment[];
  height?: number;
  ariaLabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.minutes), 0);
  if (total <= 0) {
    return (
      <Box
        sx={{
          height, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-3)',
          border: '1px solid var(--c-border)',
        }}
        role="img"
        aria-label="No activity recorded"
      />
    );
  }

  const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`);

  return (
    <Box
      sx={{ display: 'flex', height, borderRadius: 'var(--r-sm)', overflow: 'hidden', gap: '1px' }}
      role="img"
      aria-label={
        ariaLabel ??
        segments.map((s) => `${STATE_LABEL[s.state]} ${fmt(s.minutes)}`).join(', ')
      }
    >
      {segments.map((s, i) => (
        <Tooltip
          key={i}
          title={`${STATE_LABEL[s.state]} · ${fmt(s.minutes)}${s.detail ? ` · ${s.detail}` : ''}`}
        >
          <Box
            sx={{
              width: `${(Math.max(0, s.minutes) / total) * 100}%`,
              background: STATE_COLOR[s.state],
              transition: 'filter var(--t-fast) var(--ease)',
              '&:hover': { filter: 'brightness(1.15)' },
            }}
          />
        </Tooltip>
      ))}
    </Box>
  );
}

/** Shared legend so every strip on a page explains itself once. */
export function HeatstripLegend({ states = ['running', 'idle', 'wait', 'down', 'off'] as RunState[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
      {states.map((s) => (
        <Box key={s} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.625 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: 2, background: STATE_COLOR[s], flexShrink: 0 }} />
          <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{STATE_LABEL[s]}</Box>
        </Box>
      ))}
    </Box>
  );
}
