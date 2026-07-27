/**
 * CriticalChainGantt.tsx — standalone critical-chain Gantt for one project.
 *
 * Renders horizontal bars on a shared time axis derived from every chain
 * task's plannedStart/plannedEnd (min start → max end, scaled to a 0-100%
 * track). Critical-chain tasks are drawn in the accent (violet) color,
 * feeding tasks as a muted outline. The project buffer is drawn after the
 * last critical task's planned end (length ∝ sizeMinutes); feeding buffers
 * are anchored at their `afterTaskId`'s planned end (i.e. where that feeding
 * leg merges into the chain). Every buffer overlays a red "consumed" portion
 * ∝ consumedMinutes/sizeMinutes.
 *
 * This is intentionally a simple, self-contained CSS-bar renderer — NOT a
 * reuse of fab_flow's PlanSchedule.tsx (different app, different data shape,
 * and that file has its own lane/scheduling logic this must not touch).
 */
import { Box, Typography } from '@mui/material';
import type { CcBuffer, CcChainTask } from '../../api/cc';
import { clampPct, fmtDate, parseMs } from './format';

interface Props {
  chainTasks: CcChainTask[];
  buffers: CcBuffer[];
}

interface TaskSeg {
  key: string;
  label: string;
  startMs: number | null;
  endMs: number | null;
  critical: boolean;
}

interface BufferSeg {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
  consumedPct: number;
}

function TrackRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.5 }}>
      <Typography
        title={label}
        sx={{
          width: 190, flexShrink: 0, fontSize: 12.5, color: 'var(--c-text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {label}
      </Typography>
      <Box sx={{ position: 'relative', flex: 1, height: 18, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }}>
        {children}
      </Box>
    </Box>
  );
}

export default function CriticalChainGantt({ chainTasks, buffers }: Props) {
  if (chainTasks.length === 0 && buffers.length === 0) {
    return (
      <Typography sx={{ color: 'var(--c-text-3)', textAlign: 'center', p: 2, fontSize: 13 }}>
        No chain tasks to display.
      </Typography>
    );
  }

  const taskById = new Map(chainTasks.map((t) => [t.taskId, t]));
  const sortedTasks = [...chainTasks].sort((a, b) => a.seq - b.seq);
  const lastCritical = [...chainTasks].filter((t) => t.chainRole === 'critical').sort((a, b) => a.seq - b.seq).at(-1) ?? null;

  const taskSegs: TaskSeg[] = sortedTasks.map((t) => ({
    key: `t-${t.taskId}`,
    label: t.operationName ?? `Task ${t.taskId}`,
    startMs: parseMs(t.plannedStart),
    endMs: parseMs(t.plannedEnd),
    critical: t.chainRole === 'critical',
  }));

  const bufferSegs: BufferSeg[] = [];
  buffers.forEach((b, i) => {
    const anchorTask = b.afterTaskId != null ? taskById.get(b.afterTaskId) : undefined;
    const anchor = anchorTask ?? (b.kind === 'project' ? lastCritical : undefined);
    const anchorEndMs = anchor ? parseMs(anchor.plannedEnd) : null;
    if (anchorEndMs == null) return; // can't place on the axis — omit rather than guess
    const startMs = anchorEndMs;
    const endMs = startMs + b.sizeMinutes * 60000;
    const consumedPct = b.sizeMinutes > 0 ? clampPct((b.consumedMinutes / b.sizeMinutes) * 100) : 0;
    const label = b.kind === 'project'
      ? 'Project buffer'
      : `Feeding buffer${anchorTask?.operationName ? ` · merges after ${anchorTask.operationName}` : ''}`;
    bufferSegs.push({ key: `b-${i}`, label, startMs, endMs, consumedPct });
  });

  const allMs: number[] = [];
  taskSegs.forEach((t) => { if (t.startMs != null) allMs.push(t.startMs); if (t.endMs != null) allMs.push(t.endMs); });
  bufferSegs.forEach((b) => { allMs.push(b.startMs, b.endMs); });

  if (allMs.length === 0) {
    return (
      <Typography sx={{ color: 'var(--c-text-3)', textAlign: 'center', p: 2, fontSize: 13 }}>
        No scheduled dates to plot yet.
      </Typography>
    );
  }

  const minMs = Math.min(...allMs);
  const maxMs = Math.max(...allMs);
  const span = Math.max(1, maxMs - minMs);
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - minMs) / span) * 100));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{fmtDate(new Date(minMs).toISOString())}</Typography>
        <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{fmtDate(new Date(maxMs).toISOString())}</Typography>
      </Box>

      {taskSegs.map((t) => {
        const hasRange = t.startMs != null && t.endMs != null;
        return (
          <TrackRow key={t.key} label={t.label}>
            {hasRange ? (
              <Box
                sx={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${pct(t.startMs as number)}%`,
                  width: `${Math.max(1, pct(t.endMs as number) - pct(t.startMs as number))}%`,
                  borderRadius: 'var(--r-sm)',
                  background: t.critical ? 'var(--c-primary-600)' : 'var(--c-surface)',
                  border: t.critical ? 'none' : '1.5px solid var(--c-text-3)',
                }}
              />
            ) : (
              <Typography sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', px: 1, fontSize: 10.5, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
                not scheduled
              </Typography>
            )}
          </TrackRow>
        );
      })}

      {bufferSegs.map((b) => {
        const left = pct(b.startMs);
        const width = Math.max(1, pct(b.endMs) - pct(b.startMs));
        return (
          <TrackRow key={b.key} label={b.label}>
            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${width}%`, borderRadius: 'var(--r-sm)', background: 'var(--c-text-3)', opacity: 0.3 }} />
            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${(width * b.consumedPct) / 100}%`, borderRadius: 'var(--r-sm)', background: 'var(--c-danger-600)' }} />
          </TrackRow>
        );
      })}

      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
        <LegendSwatch color="var(--c-primary-600)" label="Critical chain" />
        <LegendSwatch color="var(--c-surface)" border="1.5px solid var(--c-text-3)" label="Feeding" />
        <LegendSwatch color="var(--c-text-3)" opacity={0.3} label="Buffer" />
        <LegendSwatch color="var(--c-danger-600)" label="Buffer consumed" />
      </Box>
    </Box>
  );
}

function LegendSwatch({ color, label, border, opacity }: { color: string; label: string; border?: string; opacity?: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ width: 12, height: 10, borderRadius: '3px', background: color, border, opacity }} />
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{label}</Typography>
    </Box>
  );
}
