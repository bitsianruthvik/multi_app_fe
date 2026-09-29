import { useState } from 'react';
import { Box, InputBase, Tooltip, Typography } from '@mui/material';
import type { Evaluation } from '../../lib/planner/types';
import { monthName, pctText, tonnes } from './model';

/**
 * One card per month: tonnes shipped against the goal, lines shipping, and the
 * busiest function. Click the goal to change it — saved as you leave the box.
 */
export function Scoreboard({ months, evaluation, targets, canEdit, onTarget }: {
  months: string[];
  evaluation: Evaluation;
  targets: Record<string, number>;
  canEdit: boolean;
  onTarget: (month: string, value: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.max(months.length, 1)}, 1fr)` }, gap: 1.5 }}>
      {months.map((m) => {
        const ev = evaluation.months[m];
        const t = ev?.tonnes ?? 0;
        const goal = targets[m] ?? ev?.target ?? 0;
        const pct = goal > 0 ? Math.min(100, (t / goal) * 100) : 0;
        const b = ev?.bottleneck;
        const raw = b && b.fn ? b.pct : 0;
        // The engine reports a percent (112 = 112 %).
        const frac = raw / 100;
        return (
          <Box key={m} sx={{ p: 1.5, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: '10px' }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{monthName(m)}</Typography>
              <Typography component="div" sx={{ fontSize: 13, color: 'var(--c-text-2)', display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <b style={{ color: 'var(--c-text)' }}>{tonnes(t)}</b> of
                {editing === m ? (
                  <InputBase autoFocus type="number" defaultValue={goal || ''}
                    inputProps={{ min: 0, 'aria-label': `Goal for ${monthName(m)} in tonnes`, style: { width: 64, padding: 0, textAlign: 'right', fontSize: 13 } }}
                    onBlur={(e) => { setEditing(null); const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== goal) onTarget(m, v); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }}
                    sx={{ borderBottom: '1px solid var(--c-primary-500)' }} />
                ) : (
                  <Tooltip title={canEdit ? 'Change the goal' : ''}>
                    <Box component="button" type="button" disabled={!canEdit} onClick={() => setEditing(m)}
                      sx={{ font: 'inherit', background: 'none', border: 0, borderBottom: '1px dashed var(--c-text-3)', p: 0, color: 'var(--c-text)', cursor: canEdit ? 'pointer' : 'default' }}>
                      {goal > 0 ? tonnes(goal) : 'set goal'}
                    </Box>
                  </Tooltip>
                )} t
              </Typography>
            </Box>
            <Box role="progressbar" aria-valuenow={Math.round(pct)} aria-label={`${monthName(m)} progress to goal`}
              sx={{ mt: 1, height: 6, borderRadius: 3, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${pct}%`, background: goal > 0 && t >= goal ? 'var(--c-success-600)' : 'var(--c-primary-500)' }} />
            </Box>
            <Typography sx={{ mt: 1, fontSize: 12.5, color: 'var(--c-text-2)' }}>
              {ev?.linesShipped ?? 0} {ev?.linesShipped === 1 ? 'line ships' : 'lines ship'}
              {b?.fn && frac > 0 && <> · <span style={{ color: frac > 1 ? 'var(--c-danger-600)' : undefined }}>{b.name} {pctText(frac)}</span></>}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
