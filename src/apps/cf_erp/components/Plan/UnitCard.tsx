import type { DragEvent } from 'react';
import { Box, Tooltip } from '@mui/material';
import LockRounded from '@mui/icons-material/LockRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { PlannerFunction, PlannerUnit, UnitEval } from '../../lib/planner/types';
import { FN_COLORS, shortDate, tonnes } from './model';


/** A thin bar of the unit's work by function; hover names the shares. */
export function WorkBar({ unit, fns, height = 4 }: { unit: PlannerUnit; fns: PlannerFunction[]; height?: number }) {
  const parts = fns.map((f, i) => ({ f, i, m: unit.work[f.key] ?? 0 })).filter((p) => p.m > 0);
  const total = parts.reduce((s, p) => s + p.m, 0);
  if (!total) return null;
  const title = parts.map((p) => `${p.f.name} ${Math.round((p.m / total) * 100)}%`).join(' · ');
  return (
    <Box title={title} sx={{ display: 'flex', height, borderRadius: 2, overflow: 'hidden', mt: 0.5, background: 'var(--c-surface-3)' }}>
      {parts.map((p) => <Box key={p.f.key} sx={{ width: `${(p.m / total) * 100}%`, background: FN_COLORS[p.i % FN_COLORS.length] }} />)}
    </Box>
  );
}

/**
 * One thing to ship. Cues appear only when they matter: a lock (kept where you put
 * it), an amber stripe (material arrives later), a red corner (after the promised
 * date), a tick (this one completes a line).
 */
export function UnitCard({ unit, shortCode, ev, fns, draggable, selected, onOpen, onDragStart, onDragEnd }: {
  unit: PlannerUnit;
  /** the code without the order prefix (the full code stays in the tooltip) */
  shortCode?: string;
  ev: UnitEval | undefined;
  fns: PlannerFunction[];
  draggable: boolean;
  selected: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const waits = !!ev?.materialDate && ev.materialSource !== 'stock';
  const blocked = !!ev?.blocked;
  const ticks = (ev?.completesLines?.length ?? 0) > 0;
  const many = (unit.quantity ?? 1) > 1;
  const title = many ? `${unit.quantity} × ${unit.name}` : (shortCode || unit.code);
  const tip = [
    many ? unit.code : `${unit.code}
${unit.name}`,
    blocked ? ev!.blocked : null,
    waits ? `Material from ${shortDate(ev!.materialDate!)} (${ev!.materialSource})` : null,
    ev?.late ? 'Ships after the promised date' : null,
    ticks ? 'Completes a line' : null,
  ].filter(Boolean).join('\n');
  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tip}</span>} enterDelay={500} placement="top">
      <Box role="button" tabIndex={0} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
        onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
        sx={{
          position: 'relative', p: '5px 8px', minWidth: 120, borderRadius: '6px', background: unit.done ? 'var(--c-surface-2)' : 'var(--c-surface)',
          border: `1px ${blocked ? 'dashed' : 'solid'} ${blocked ? 'var(--c-danger-600)' : selected ? 'var(--c-primary-500)' : 'var(--c-border)'}`,
          borderLeft: waits ? '3px solid var(--c-warning-600)' : undefined,
          cursor: draggable ? 'grab' : 'pointer', fontSize: 12, lineHeight: 1.3, opacity: unit.done ? 0.65 : 1,
          '&:hover': { borderColor: 'var(--c-primary-400)' }, '&:active': { cursor: draggable ? 'grabbing' : 'pointer' },
        }}>
        {ev?.late && <Box aria-hidden sx={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: '10px solid var(--c-danger-600)', borderLeft: '10px solid transparent', borderTopRightRadius: '6px' }} />}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box component="span" sx={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(many ? { fontFamily: 'inherit' } : {}) }}>{title}</Box>
          {ev?.pinned && <LockRounded sx={{ fontSize: 12, color: 'var(--c-text-3)' }} titleAccess="Kept where you put it" />}
          {ticks && <CheckRounded sx={{ fontSize: 13, color: 'var(--c-success-600)' }} titleAccess="Completes a line" />}
        </Box>
        <Box sx={{ color: 'var(--c-text-2)' }}>{tonnes(unit.tonnes)} t</Box>
        <WorkBar unit={unit} fns={fns} />
      </Box>
    </Tooltip>
  );
}
