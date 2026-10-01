import { useState } from 'react';
import { Box, Tooltip } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { usageBand, type Band, type UsageCell, type UsageRow } from '../../lib/planner/areas';
import type { Period } from '../../lib/planner/types';
import { hoursText } from './model';
import type { Geometry } from './geometry';

const TONES: Record<Band, { bg: string; fg: string }> = {
  none: { bg: 'transparent', fg: 'var(--c-text-3)' },
  ok: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
  warn: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  over: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
};
const USAGE_ROW_H = 26;

const pctLabel = (c: UsageCell | undefined, unlimited: boolean) => {
  if (!c || c.minutes <= 1e-9) return '';
  if (unlimited) return hoursText(c.minutes);
  if (c.pct >= 999) return 'off';
  return `${Math.round(c.pct)}%`;
};

export interface CellRef { row: string; period: string | null }

/**
 * Machine areas × weeks: planned hours ÷ shift hours, green < 75 %, amber to 100 %, red beyond.
 * Sits at the bottom of the plan (sticky), in the plan's own columns, and follows a drag live.
 * An area opens into its machine types. Hover a cell for the hours, the machines and what loads
 * it; click it to light up those units on the plan.
 */
export function UsagePanel({ rows, level, periods, geometry, fnRows, targetPeriods, live, selected, onCellClick, drivers, collapsed, onCollapsed }: {
  rows: UsageRow[];
  /** the tree level the areas are taken at ('Subfamily') */
  level: string;
  periods: Period[];
  geometry: Geometry;
  fnRows: (areaKey: string) => UsageRow[];
  /** periods a drag would change (outlined) */
  targetPeriods: Set<string>;
  live: boolean;
  selected: CellRef | null;
  onCellClick: (row: UsageRow, period: string | null) => void;
  /** top units loading a cell, already worded ("G2 32 h") */
  drivers: (row: UsageRow, period: string) => string[];
  collapsed: boolean;
  onCollapsed: (v: boolean) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<string | null>(null);
  const g = geometry;
  const labelW = g.treeW + g.backW;
  const shown: { row: UsageRow; depth: number }[] = [];
  for (const r of rows) {
    shown.push({ row: r, depth: 0 });
    if (open.has(r.key) && r.fnKeys.length > 1) for (const f of fnRows(r.key)) shown.push({ row: f, depth: 1 });
  }

  const cell = (r: UsageRow, p: Period | null, c: UsageCell | undefined) => {
    const id = `${r.key}|${p?.key ?? 'total'}`;
    const band = usageBand(c, r.unlimited);
    const tone = TONES[band];
    const isSel = selected?.row === r.key && selected.period === (p?.key ?? null);
    const target = p && targetPeriods.has(p.key);
    const has = (c?.minutes ?? 0) > 1e-9;
    const tip = has ? (
      <Box sx={{ fontSize: 12, lineHeight: 1.5 }}>
        <b>{r.name}</b> · {p ? p.label : 'whole plan'}<br />
        {r.unlimited ? `${hoursText(c!.minutes)} planned (no limit)` : `${hoursText(c!.minutes)} planned of ${hoursText(c!.capacity ?? 0)} shift time${c!.pct >= 999 ? ' — no shifts' : ` (${Math.round(c!.pct)}%)`}`}<br />
        {r.machines > 0 && <>{r.machines} {r.machines === 1 ? 'machine' : 'machines'}<br /></>}
        {p && hover === id && (() => { const d = drivers(r, p.key); return d.length ? <>Most of it: {d.join(' · ')}<br /></> : null; })()}
        {p && <span style={{ opacity: 0.8 }}>Click to light up these units</span>}
      </Box>
    ) : '';
    return (
      <Tooltip key={id} title={tip} open={hover === id && has} placement="top" disableInteractive>
        <Box component={p ? 'button' : 'div'} type={p ? 'button' : undefined} data-testid={`usage-${r.key}-${p?.key ?? 'total'}`} data-band={band}
          aria-label={has ? `${r.name}, ${p ? p.label : 'whole plan'}: ${pctLabel(c, r.unlimited)}` : undefined}
          onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover((h) => (h === id ? null : h))} onFocus={() => setHover(id)} onBlur={() => setHover(null)}
          onClick={p ? () => onCellClick(r, p.key) : undefined}
          sx={{
            width: p ? g.colW : g.totalW, height: USAGE_ROW_H, flex: 'none', p: 0, m: 0, border: 0, font: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontVariantNumeric: 'tabular-nums',
            cursor: p && has ? 'pointer' : 'default', background: 'transparent', color: tone.fg,
            borderLeft: '1px solid var(--c-divider)',
            outline: isSel ? '2px solid var(--c-primary-600)' : target ? '1px dashed var(--c-primary-400)' : 'none', outlineOffset: -2,
          }}>
          <Box component="span" sx={{ px: 0.5, py: '1px', borderRadius: '4px', background: tone.bg, fontWeight: band === 'over' ? 600 : 400, minWidth: 30, textAlign: 'center' }}>
            {pctLabel(c, r.unlimited)}
          </Box>
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box data-testid="usage-panel" aria-label="Machine area usage"
      sx={{ position: 'sticky', bottom: 0, zIndex: 5, width: g.width, background: 'var(--c-surface)', borderTop: '2px solid var(--c-border)', boxShadow: 'var(--e-2, none)' }}>
      <Box sx={{ display: 'flex', height: 28, alignItems: 'center' }}>
        <Box sx={{ position: 'sticky', left: 0, zIndex: 2, width: labelW, flex: 'none', height: '100%', display: 'flex', alignItems: 'center', gap: 0.5, px: 1, background: 'var(--c-surface)' }}>
          <Box component="button" type="button" onClick={() => onCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={collapsed ? 'Show machine area usage' : 'Hide machine area usage'}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, border: 0, background: 'none', p: 0, cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
            {collapsed ? <ChevronRightRounded sx={{ fontSize: 18 }} /> : <ExpandMoreRounded sx={{ fontSize: 18 }} />}
            {live ? 'If dropped here' : 'Machine areas'}
          </Box>
          <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            planned ÷ shift hours{level !== 'Machine type' ? ` · by ${level.toLowerCase()}` : ''}
          </Box>
        </Box>
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pl: 1, fontSize: 11, color: 'var(--c-text-3)' }}>
            <Legend tone="ok" text="under 75%" /><Legend tone="warn" text="75–100%" /><Legend tone="over" text="over 100%" />
          </Box>
        )}
      </Box>
      {!collapsed && shown.map(({ row: r, depth }) => (
        <Box key={r.key} data-testid={`usage-row-${r.key}`} sx={{ display: 'flex', height: USAGE_ROW_H, borderTop: '1px solid var(--c-divider)' }}>
          <Box sx={{ position: 'sticky', left: 0, zIndex: 2, width: labelW, flex: 'none', display: 'flex', alignItems: 'center', gap: 0.5, pl: depth ? 3.5 : 1, pr: 1, background: 'var(--c-surface)', fontSize: 12, minWidth: 0 }}>
            {depth === 0 && r.fnKeys.length > 1 ? (
              <Box component="button" type="button" aria-label={open.has(r.key) ? `Hide the machine types in ${r.name}` : `Show the machine types in ${r.name}`} aria-expanded={open.has(r.key)}
                onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })}
                sx={{ display: 'flex', border: 0, background: 'none', p: 0, cursor: 'pointer', color: 'var(--c-text-3)' }}>
                {open.has(r.key) ? <ExpandMoreRounded sx={{ fontSize: 16 }} /> : <ChevronRightRounded sx={{ fontSize: 16 }} />}
              </Box>
            ) : <Box sx={{ width: 16, flex: 'none' }} />}
            <Box component="span" title={r.name} sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: depth ? 400 : 500, color: depth ? 'var(--c-text-2)' : 'var(--c-text)' }}>{r.name}</Box>
            {r.machines > 0 && <Box component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{r.machines} m/c</Box>}
          </Box>
          {periods.map((p) => cell(r, p, r.cells[p.key]))}
          {cell(r, null, r.total)}
        </Box>
      ))}
    </Box>
  );
}

function Legend({ tone, text }: { tone: Band; text: string }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', background: TONES[tone].bg, border: `1px solid ${TONES[tone].fg}` }} />{text}
    </Box>
  );
}
