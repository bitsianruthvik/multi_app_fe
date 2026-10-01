import { Box } from '@mui/material';
import type { PlannerFunction, PlannerUnit } from '../../lib/planner/types';
import { FN_COLORS } from './model';

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
