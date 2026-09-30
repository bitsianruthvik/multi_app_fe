/**
 * Small plain-SVG charts for the management dashboard. No chart library: these
 * are a handful of rectangles and one polyline, they must render in the jsdom
 * test, and they read the design tokens (chart / state / status colours) so
 * dark mode follows. Every chart carries a text alternative (aria-label / title).
 */
import type { ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import type { MachineDay, OrderStage } from '../../api/dashboard';
import { dateLabel, hoursText, pctText } from '../../lib/dashboard';

/** A trend line of values (null = a gap), with the last point marked. */
export function Sparkline({ values, width = 120, height = 28, color = 'var(--c-chart-1)', max, label }: {
  values: (number | null)[]; width?: number; height?: number; color?: string; max?: number; label: string;
}) {
  const known = values.filter((v): v is number => v != null);
  if (values.length < 2 || !known.length) {
    return <Box component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)' }} aria-label={label}>{known.length ? '' : 'no data'}</Box>;
  }
  const top = max ?? Math.max(...known, 1);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 2 - (Math.min(v, top) / top) * (height - 4);
  const segs: string[] = [];
  let cur: string[] = [];
  values.forEach((v, i) => {
    if (v == null) { if (cur.length) segs.push(cur.join(' ')); cur = []; return; }
    cur.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur.join(' '));
  const lastI = values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).at(-1) ?? 0;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} data-testid="sparkline">
      <title>{label}</title>
      <line x1={2} x2={width - 2} y1={height - 2} y2={height - 2} stroke="var(--c-chart-grid, var(--c-divider))" strokeWidth={1} />
      {segs.map((pts, i) => <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />)}
      <circle cx={x(lastI)} cy={y(values[lastI] ?? 0)} r={2.5} fill={color} />
    </svg>
  );
}

export interface Segment { key: string; value: number; color: string; label: string; hatch?: boolean }

/** A horizontal bar split into shares (values are %, adding to ≤ 100). */
export function ShareBar({ segments, height = 10, label }: { segments: Segment[]; height?: number; label: string }) {
  return (
    <Tooltip title={<Box>{segments.filter((s) => s.value > 0.05).map((s) => <Box key={s.key}>{s.label}: {pctText(s.value)}</Box>)}</Box>}>
      <Box role="img" aria-label={label} data-testid="share-bar" sx={{ display: 'flex', height, borderRadius: 99, overflow: 'hidden', background: 'var(--c-surface-3)', width: '100%' }}>
        {segments.map((s) => (s.value > 0 ? (
          <Box key={s.key} data-seg={s.key} sx={{
            width: `${s.value}%`, background: s.hatch ? `repeating-linear-gradient(135deg, ${s.color} 0 3px, transparent 3px 6px)` : s.color,
            transition: 'width var(--t-base, .2s) var(--ease, ease)',
          }} />
        ) : null))}
      </Box>
    </Tooltip>
  );
}

/** One progress bar: done of total, with an optional second (lighter) layer, e.g. dispatched inside made. */
export function ProgressBar({ pct, inner, color = 'var(--c-primary-500)', innerColor = 'var(--c-success-600)', height = 8, label }: {
  pct: number; inner?: number; color?: string; innerColor?: string; height?: number; label: string;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <Box role="progressbar" aria-label={label} aria-valuenow={Math.round(clamp(pct))} aria-valuemin={0} aria-valuemax={100}
      sx={{ position: 'relative', height, borderRadius: 99, background: 'var(--c-surface-3)', overflow: 'hidden', width: '100%' }}>
      <Box sx={{ position: 'absolute', inset: 0, width: `${clamp(pct)}%`, background: color, borderRadius: 99 }} />
      {inner != null && inner > 0 && <Box sx={{ position: 'absolute', inset: 0, width: `${clamp(inner)}%`, background: innerColor, borderRadius: 99 }} />}
    </Box>
  );
}

/**
 * The plant, day by day: a column per day of run inside the shift (solid),
 * overtime (on top, lighter) and stopped (below the axis), against the day's
 * shift time (a tick). Hover a day for its numbers.
 */
export function DailyBars({ days, height = 120 }: { days: MachineDay[]; height?: number }) {
  if (!days.length) return null;
  const top = Math.max(1, ...days.map((d) => Math.max(d.shift, d.runIn + d.overtime)));
  const stopTop = Math.max(1, ...days.map((d) => d.stop));
  const upH = height * 0.72;
  const downH = height * 0.22;
  const w = 100 / days.length;
  const year = days.at(-1)!.date.slice(0, 4);
  return (
    <Box role="img" aria-label={`Run, overtime and stopped time per day, ${days.length} days`} data-testid="daily-bars" sx={{ position: 'relative', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', height, gap: days.length > 40 ? '1px' : '3px' }}>
        {days.map((d) => (
          <Tooltip key={d.date} title={<Box>
            <Box sx={{ fontWeight: 600 }}>{dateLabel(d.date, year)}</Box>
            <Box>Shift {hoursText(d.shift)} · run in shift {hoursText(d.runIn)}{d.shift ? ` (${pctText((d.runIn / d.shift) * 100)})` : ''}</Box>
            <Box>Overtime {hoursText(d.overtime)} · stopped {hoursText(d.stop)}</Box>
          </Box>}>
            <Box sx={{ flex: `0 0 calc(${w}% - 3px)`, minWidth: 2, display: 'flex', flexDirection: 'column', cursor: 'default' }}>
              <Box sx={{ height: upH, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
                {d.shift > 0 && <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: `${(d.shift / top) * 100}%`, borderTop: '2px solid var(--c-text-3)', opacity: 0.55 }} />}
                <Box sx={{ height: `${(d.overtime / top) * 100}%`, background: 'var(--c-chart-3)', opacity: 0.75, borderRadius: '3px 3px 0 0' }} />
                <Box sx={{ height: `${(d.runIn / top) * 100}%`, background: 'var(--c-state-running)', borderRadius: d.overtime ? 0 : '3px 3px 0 0' }} />
              </Box>
              <Box sx={{ height: '1px', flexShrink: 0, background: 'var(--c-border)' }} />
              <Box sx={{ height: downH, flexShrink: 0 }}>
                <Box sx={{ height: `${(d.stop / stopTop) * 100}%`, background: 'var(--c-state-down)', opacity: 0.8, borderRadius: '0 0 3px 3px' }} />
              </Box>
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text-3)', mt: 0.5 }}>
        <span>{dateLabel(days[0].date, year)}</span>
        {days.length > 1 && <span>{dateLabel(days.at(-1)!.date, year)}</span>}
      </Box>
    </Box>
  );
}

export function Legend({ items }: { items: { color: string; label: ReactNode; hatch?: boolean; line?: boolean }[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, fontSize: 12, color: 'var(--c-text-2)' }}>
      {items.map((it, i) => (
        <Box key={i} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={it.line
            ? { width: 12, height: 0, borderTop: `2px solid ${it.color}` }
            : { width: 10, height: 10, borderRadius: '3px', background: it.hatch ? `repeating-linear-gradient(135deg, ${it.color} 0 2px, transparent 2px 4px)` : it.color, border: it.hatch ? `1px solid ${it.color}` : 'none' }} />
          {it.label}
        </Box>
      ))}
    </Box>
  );
}

/**
 * Where an order is in its flow: one small column per operation, filled to the
 * share of its steps done — Cutting 100, Drilling 80, Fit-up 20 … — so "how far
 * down the line is it" reads at a glance. The bottleneck gets a ring.
 */
export function StageStrip({ stages, bottleneckId }: { stages: OrderStage[]; bottleneckId?: number | null }) {
  if (!stages.length) return <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Not released to production yet.</Box>;
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }} data-testid="stage-strip">
      {stages.map((s) => {
        const neck = s.operationId === bottleneckId;
        const color = s.pctDone >= 99.95 ? 'var(--c-success-600)' : s.onHold ? 'var(--c-danger-600)' : s.inProgress ? 'var(--c-info-600)' : 'var(--c-primary-400)';
        return (
          <Tooltip key={s.operationId} title={<Box>
            <Box sx={{ fontWeight: 600 }}>{s.name}</Box>
            <Box>{s.done} of {s.steps} steps done ({pctText(s.pctDone)})</Box>
            {s.inProgress > 0 && <Box>{s.inProgress} in progress</Box>}
            {s.onHold > 0 && <Box>{s.onHold} on hold</Box>}
            {s.contracted > 0 && <Box>{s.contracted} with a contractor</Box>}
            {s.workMinLeft != null && <Box>{hoursText(s.workMinLeft)} of estimated work left</Box>}
            {neck && <Box sx={{ fontWeight: 600, mt: 0.5 }}>Most work left</Box>}
          </Box>}>
            <Box sx={{ width: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.4, cursor: 'default' }} data-stage={s.code}>
              <Box sx={{
                width: 28, height: 30, borderRadius: '5px', background: 'var(--c-surface-3)', position: 'relative', overflow: 'hidden',
                outline: neck ? '2px solid var(--c-warning-600)' : 'none', outlineOffset: 1,
              }}>
                <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${s.pctDone}%`, background: color }} />
              </Box>
              <Box sx={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: neck ? 'var(--c-warning-800)' : 'var(--c-text-2)', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.code}</Box>
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

/** A ranked list with bars — stop reasons, operations — the longest first. */
export function Pareto({ rows, unit = 'min', color = 'var(--c-state-down)', max = 5 }: {
  rows: { key: string | number; label: string; value: number; note?: string }[]; unit?: 'min' | 'count'; color?: string; max?: number;
}) {
  const shown = rows.slice(0, max);
  const top = Math.max(1, ...shown.map((r) => r.value));
  if (!shown.length) return <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>None recorded.</Box>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {shown.map((r) => (
        <Box key={r.key} sx={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 1.2fr) 2fr auto', alignItems: 'center', gap: 1, fontSize: 12 }}>
          <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--c-text)' }} title={r.label}>{r.label}</Box>
          <Box sx={{ height: 8, borderRadius: 99, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
            <Box sx={{ width: `${(r.value / top) * 100}%`, height: '100%', background: color, borderRadius: 99 }} />
          </Box>
          <Box sx={{ fontFamily: 'var(--font-mono)', color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{unit === 'min' ? hoursText(r.value) : r.value}{r.note ? ` · ${r.note}` : ''}</Box>
        </Box>
      ))}
    </Box>
  );
}
