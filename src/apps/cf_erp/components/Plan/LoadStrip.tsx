import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import type { Evaluation, Period, PlannerFunction } from '../../lib/planner/types';
import { heat, loadFraction, mins, pctText } from './model';

const TONES = {
  none: { bg: 'transparent', fg: 'var(--c-text-3)' },
  ok: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
  warn: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  over: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
} as const;

/**
 * How busy each function is in each period. Stays at the bottom of the board and
 * follows a card while it is dragged. Functions with nothing planned are left out
 * so the strip stays short.
 */
export function LoadStrip({ functions, periods, load, template, live, highlight }: {
  functions: PlannerFunction[];
  periods: Period[];
  load: Evaluation['load'];
  template: string;
  live: boolean;
  /** function keys the dragged card uses */
  highlight?: Set<string>;
}) {
  const [all, setAll] = useState(false);
  const active = useMemo(() => functions
    .filter((f) => periods.some((p) => (load[f.key]?.[p.key]?.minutes ?? 0) > 0))
    .map((f) => ({
      f,
      peak: Math.max(0, ...periods.map((p) => loadFraction(load[f.key]?.[p.key]))),
      total: periods.reduce((s, p) => s + (load[f.key]?.[p.key]?.minutes ?? 0), 0),
    })), [functions, periods, load]);
  const shownKeys = useMemo(() => {
    const top = [...active].sort((a, b) => b.peak - a.peak || b.total - a.total).slice(0, 4).map((r) => r.f.key);
    return new Set([...top, ...active.filter((r) => r.peak > 0.85).map((r) => r.f.key)]);
  }, [active]);
  const canFold = active.length > shownKeys.size;
  const rows = active.filter((r) => all || shownKeys.has(r.f.key) || highlight?.has(r.f.key)).map((r) => r.f);
  return (
    <Box sx={{ position: 'sticky', bottom: 0, zIndex: 3, background: 'var(--c-surface)', borderTop: '2px solid var(--c-border)' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: template }}>
        <Box sx={{ px: 1, py: 0.5, fontSize: 12, fontWeight: 600 }}>
          {live ? 'Load if dropped here' : 'Load by function'}
          {canFold && (
            <Box component="button" type="button" onClick={() => setAll((v) => !v)}
              sx={{ display: 'block', p: 0, border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 400, color: 'var(--c-text-3)', textDecoration: 'underline' }}>
              {all ? 'Show fewer' : `Show all ${active.length} functions`}
            </Box>
          )}
        </Box>
        {rows.length === 0 && <Box sx={{ gridColumn: '2 / -1', px: 1, py: 0.5, fontSize: 12, color: 'var(--c-text-3)' }}>Nothing planned yet.</Box>}
      </Box>
      <Box sx={{ maxHeight: '30vh', overflowY: 'auto' }}>
      {rows.map((f) => (
        <Box key={f.key} sx={{ display: 'grid', gridTemplateColumns: template, alignItems: 'stretch' }}>
          <Box sx={{ px: 1, py: 0.25, fontSize: 12, color: highlight?.has(f.key) ? 'var(--c-primary-600)' : 'var(--c-text-2)', fontWeight: highlight?.has(f.key) ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</Box>
          {periods.map((p) => {
            const c = load[f.key]?.[p.key];
            const frac = loadFraction(c);
            const tone = TONES[heat(frac, !!f.unlimited)];
            const has = (c?.minutes ?? 0) > 0;
            return (
              <Box key={p.key} title={has ? `${f.name}, ${p.label}: ${mins(c!.minutes)}${c!.capacity != null ? ` of ${mins(c!.capacity)}` : ''}` : undefined}
                sx={{ m: '1px', px: 0.75, py: 0.25, fontSize: 11.5, borderRadius: '4px', textAlign: 'center', background: tone.bg, color: tone.fg }}>
                {has ? (f.unlimited ? mins(c!.minutes).replace(' min', 'm') : pctText(frac)) : ''}
              </Box>
            );
          })}
        </Box>
      ))}
      </Box>
    </Box>
  );
}
