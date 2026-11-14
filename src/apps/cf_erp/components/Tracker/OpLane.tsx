import type { MouseEvent } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { keyframes } from '@mui/system';
import type { LaneMode, LaneOp } from '../../lib/opLanes';
import { laneTitle } from '../../lib/opLanes';

/**
 * One row's operations, drawn as a ROUTE (one after another, sized by planned minutes) or on a TIMELINE (planned slot
 * outlined, what the floor did filled). Each row brings its own operations in its own order (lib/opLanes.ts).
 * Colour AND a mark carry the state, never colour alone: done is green with a tick, running glows, blocked is red
 * with "!", partly done fills the share that is done.
 */

const glow = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.55); }
  50% { box-shadow: 0 0 6px 2px rgba(37, 99, 235, 0.65); }
`;

const LANE_TONE = {
  done: { fill: 'var(--c-success-600)', ink: '#fff', border: 'var(--c-success-700, var(--c-success-600))', label: 'Done' },
  running: { fill: 'var(--c-info-600)', ink: '#fff', border: 'var(--c-info-700, var(--c-info-600))', label: 'Running now' },
  partial: { fill: 'var(--c-warning-500, #f59e0b)', ink: 'var(--c-warning-900, #78350f)', border: 'var(--c-warning-600)', label: 'Partly done' },
  blocked: { fill: 'var(--c-danger-600)', ink: '#fff', border: 'var(--c-danger-700, var(--c-danger-600))', label: 'Blocked' },
  todo: { fill: 'var(--c-neutral-100)', ink: 'var(--c-text-3)', border: 'var(--c-neutral-300, var(--c-neutral-200))', label: 'Not started' },
} as const;

const MARK: Record<string, string> = { done: '✓', blocked: '!', running: '▸' };

function Seg({ o, grow, onOpen }: { o: LaneOp; grow: number; onOpen?: (o: LaneOp) => void }) {
  const t = LANE_TONE[o.state];
  const share = o.total > 0 ? Math.max(0, Math.min(1, o.done / o.total)) : 0;
  const text = o.code ?? o.name;
  return (
    <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{laneTitle(o)}</Box>} arrow disableInteractive>
      <Box
        component="span" data-testid="lane-op" data-state={o.state}
        onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(o); } : undefined}
        sx={{
          position: 'relative', flex: `${grow} 1 0`, minWidth: 8, height: 20, borderRadius: '4px', overflow: 'hidden',
          display: 'flex', alignItems: 'center', px: 0.5, gap: 0.25, boxSizing: 'border-box',
          border: '1px solid', borderColor: o.state === 'todo' && o.ready ? 'var(--c-success-600)' : t.border, borderStyle: o.state === 'todo' && o.ready ? 'dashed' : 'solid',
          background: o.state === 'partial' ? 'var(--c-warning-50, #fffbeb)' : t.fill,
          color: o.state === 'partial' ? t.ink : t.ink,
          cursor: onOpen ? 'pointer' : 'default',
          ...(o.state === 'running' ? { animation: `${glow} 1.4s ease-in-out infinite` } : {}),
        }}
      >
        {o.state === 'partial' && <Box aria-hidden sx={{ position: 'absolute', inset: 0, width: `${share * 100}%`, background: 'var(--c-warning-200, #fde68a)' }} />}
        <Box component="span" sx={{ position: 'relative', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip', lineHeight: 1 }}>
          {MARK[o.state] ? `${MARK[o.state]} ` : ''}{text}{o.total > 1 && o.state !== 'done' && o.done > 0 ? ` ${Number(o.done.toFixed(2))}/${Number(o.total.toFixed(2))}` : ''}
        </Box>
      </Box>
    </Tooltip>
  );
}

/** The operations one after another, each as wide as its planned minutes (all equal when any has no time). */
export function RouteLane({ ops, onOpen }: { ops: LaneOp[]; onOpen?: (o: LaneOp) => void }) {
  if (!ops.length) return <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No operations of its own</Typography>;
  const timed = ops.every((o) => o.minutes != null && o.minutes > 0);
  const total = timed ? ops.reduce((s, o) => s + (o.minutes ?? 0), 0) : ops.length;
  return (
    <Box data-testid="route-lane" sx={{ display: 'flex', gap: '2px', alignItems: 'center', width: '100%', minWidth: 0 }}>
      {ops.map((o) => <Seg key={o.key} o={o} grow={timed ? Math.max((o.minutes ?? 0) / total, 0.02) : 1} onOpen={onOpen} />)}
    </Box>
  );
}

const pctOf = (t: number, r: { from: number; to: number }) => ((t - r.from) / (r.to - r.from)) * 100;

/** Each operation on the shared date axis: the planner's slot outlined above, what the floor did filled below. */
export function TimelineLane({ ops, range, now, onOpen }: { ops: LaneOp[]; range: { from: number; to: number } | null; now: number; onOpen?: (o: LaneOp) => void }) {
  const dated = range ? ops.filter((o) => o.start != null || o.plannedStart != null) : [];
  return (
    <Box data-testid="timeline-lane" sx={{ position: 'relative', width: '100%', height: 22 }}>
      {range && now >= range.from && now <= range.to && (
        <Box aria-hidden sx={{ position: 'absolute', top: -6, bottom: -6, left: `${pctOf(now, range)}%`, width: '1px', background: 'var(--c-danger-500, #ef4444)', opacity: 0.6 }} />
      )}
      {!dated.length && (
        <Typography component="span" sx={{ position: 'absolute', left: 0, top: 3, fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
          {!ops.length ? 'No operations of its own'
            : ops.every((o) => o.state === 'done') ? 'Done — no times recorded'
              : ops.some((o) => o.state !== 'todo') ? 'Under way — no times recorded' : 'Not started, not planned yet'}
        </Typography>
      )}
      {range && dated.map((o) => {
        const t = LANE_TONE[o.state];
        const title = <Box sx={{ whiteSpace: 'pre-line' }}>{laneTitle(o)}</Box>;
        const click = onOpen ? (e: MouseEvent) => { e.stopPropagation(); onOpen(o); } : undefined;
        return (
          <Box key={o.key} component="span" sx={{ display: 'contents' }}>
            {o.plannedStart != null && (
              <Tooltip title={title} arrow disableInteractive>
                <Box component="span" data-testid="lane-planned" onClick={click} sx={{
                  position: 'absolute', top: 1, height: 7, borderRadius: '3px', boxSizing: 'border-box',
                  left: `${pctOf(o.plannedStart, range)}%`, width: `max(4px, ${pctOf(o.plannedEnd ?? o.plannedStart, range) - pctOf(o.plannedStart, range)}%)`,
                  border: `1.5px solid ${t.border}`, background: 'transparent', cursor: click ? 'pointer' : 'default',
                }} />
              </Tooltip>
            )}
            {o.start != null && (
              <Tooltip title={title} arrow disableInteractive>
                <Box component="span" data-testid="lane-actual" data-state={o.state} onClick={click} sx={{
                  position: 'absolute', top: 10, height: 11, borderRadius: '3px',
                  left: `${pctOf(o.start, range)}%`, width: `max(4px, ${pctOf(o.end ?? (o.state === 'running' ? now : o.start), range) - pctOf(o.start, range)}%)`,
                  background: t.fill, border: `1px solid ${t.border}`, boxSizing: 'border-box', cursor: click ? 'pointer' : 'default',
                  ...(o.state === 'running' ? { animation: `${glow} 1.4s ease-in-out infinite` } : {}),
                }} />
              </Tooltip>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** The date ticks above the timeline column. */
export function TimelineAxis({ ticks, range }: { ticks: { at: number; label: string }[]; range: { from: number; to: number } }) {
  return (
    <Box sx={{ position: 'relative', height: 16, width: '100%' }}>
      {ticks.map((t) => (
        <Box key={t.at} component="span" sx={{ position: 'absolute', left: `${pctOf(t.at, range)}%`, transform: 'translateX(-50%)', fontSize: 10.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0 }}>
          {t.label}
        </Box>
      ))}
    </Box>
  );
}

/** What the lane colours and shapes mean. */
export function LaneLegend({ mode }: { mode: LaneMode }) {
  const sw = (state: keyof typeof LANE_TONE, label?: string) => (
    <Box key={state} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="span" sx={{
        width: 18, height: 10, borderRadius: '3px', background: LANE_TONE[state].fill, border: `1px solid ${LANE_TONE[state].border}`,
        ...(state === 'running' ? { animation: `${glow} 1.4s ease-in-out infinite` } : {}),
      }} />
      <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{label ?? LANE_TONE[state].label}</Typography>
    </Box>
  );
  return (
    <Box data-testid="lane-legend" sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
      {sw('done')}{sw('running', 'Running now (glows)')}{sw('partial')}{sw('blocked')}{sw('todo')}
      {mode === 'timeline' && (
        <>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span" sx={{ width: 18, height: 7, borderRadius: '3px', border: '1.5px solid var(--c-text-3)' }} />
            <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Planned slot</Typography>
          </Box>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="span" sx={{ width: '1px', height: 12, background: 'var(--c-danger-500, #ef4444)' }} />
            <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Now</Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
