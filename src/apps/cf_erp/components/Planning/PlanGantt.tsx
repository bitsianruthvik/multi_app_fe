import { useMemo, useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { InfoButton } from '@shared/ui';
import type { PlanOrder, PlanUnit } from '../../api/planning';
import { stageColour } from '../../lib/progress3d';
import { Mono } from '../ui';

/**
 * THE PLAN AS A GANTT (user, 2026-11-14: "once a plan is done we should see a gantt chart of what all activities on
 * different SO or PO are planned as per the plan. And also some charts … Make the plan more useful to see and read").
 * Drawn from the plan itself (month or week plan: its shipping units and each one's steps with their days):
 *   - Gantt: a row per sales order (its span; the committed date as a mark, red when the plan ends after it), opening
 *     to its shipping units — each unit its OWN steps one after another, coloured by machine type.
 *   - Machine load: machine type × day, hours planned (darker = more), to see where the plan is tight.
 *   - Finish vs committed: each order's planned finish against its committed date.
 * Machine types are coloured by where they come in the flow (red first, green last — the 3D view's scale), worked out
 * from the units' own step order, so nothing is hard-coded.
 */

const DAY = 86400000;
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00`);
const dayLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const hrs = (m: number) => (m >= 60 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m)} min`);

/** Machine types in flow order: the mean place each takes among a unit's steps. */
function fnOrder(units: PlanUnit[]): { fn: string; name: string }[] {
  const acc = new Map<string, { name: string; sum: number; n: number }>();
  for (const u of units) {
    const k = u.steps.length;
    u.steps.forEach((s, i) => {
      const e = acc.get(s.fn) ?? { name: s.fnName, sum: 0, n: 0 };
      e.sum += k > 1 ? i / (k - 1) : 0.5; e.n += 1; acc.set(s.fn, e);
    });
  }
  return [...acc.entries()].sort((a, b) => a[1].sum / a[1].n - b[1].sum / b[1].n).map(([fn, e]) => ({ fn, name: e.name }));
}

export function PlanGantt({ units, orders, from, to, today, title = 'Plan as a Gantt' }: {
  units: PlanUnit[]; orders: PlanOrder[]; from: string; to?: string | null; today?: string | null; title?: string;
}) {
  const [view, setView] = useState<'gantt' | 'load' | 'finish'>('gantt');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const fns = useMemo(() => fnOrder(units), [units]);
  const colour = useMemo(() => new Map(fns.map((f, i) => [f.fn, stageColour(i, fns.length)])), [fns]);
  // The axis: the plan's first day to its last finish (or `to`), at least a week, at most 70 days.
  const range = useMemo(() => {
    const lo = ms(from);
    let hi = to ? ms(to) : lo + 7 * DAY;
    for (const u of units) for (const s of u.steps) if (s.to) hi = Math.max(hi, ms(s.to));
    hi = Math.min(Math.max(hi, lo + 6 * DAY), lo + 69 * DAY);
    return { lo, hi: hi + DAY, days: Math.round((hi + DAY - lo) / DAY) };
  }, [from, to, units]);
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - range.lo) / (range.hi - range.lo)) * 100));
  const byOrder = useMemo(() => {
    const m = new Map<number, PlanUnit[]>();
    for (const u of units) { const l = m.get(u.orderId) ?? []; l.push(u); m.set(u.orderId, l); }
    return orders.filter((o) => m.has(o.id)).map((o) => {
      const us = (m.get(o.id) ?? []).slice().sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
      const starts = us.map((u) => u.start).filter(Boolean) as string[];
      const ends = us.map((u) => u.finish).filter(Boolean) as string[];
      return { o, units: us, start: starts.sort()[0] ?? null, end: ends.sort().slice(-1)[0] ?? null, tonnes: us.reduce((t, u) => t + u.tonnes, 0) };
    });
  }, [units, orders]);
  const ticks = useMemo(() => {
    const step = range.days > 35 ? 7 : range.days > 14 ? 2 : 1;
    const out: number[] = [];
    for (let t = range.lo; t < range.hi; t += step * DAY) out.push(t);
    return out;
  }, [range]);
  const todayMs = today ? ms(today) : null;

  const axis = (
    <Box sx={{ position: 'relative', height: 18 }}>
      {ticks.map((t) => <Box key={t} component="span" sx={{ position: 'absolute', left: `${pct(t)}%`, fontSize: 10.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', transform: 'translateX(2px)' }}>{dayLabel(t)}</Box>)}
    </Box>
  );
  const gridLines = (
    <>
      {ticks.map((t) => <Box key={t} aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(t)}%`, width: '1px', background: 'var(--c-divider)' }} />)}
      {todayMs != null && todayMs >= range.lo && todayMs < range.hi && (
        <Box aria-hidden sx={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(todayMs + DAY / 2)}%`, width: '2px', background: 'var(--c-danger-500, #ef4444)', opacity: 0.7, zIndex: 1 }} />
      )}
    </>
  );
  const rowSx = { display: 'grid', gridTemplateColumns: 'minmax(150px, 22%) minmax(0, 1fr) 70px', columnGap: 1, alignItems: 'center', px: 1.25, borderBottom: '1px solid var(--c-divider)' };

  return (
    <Box data-testid="plan-gantt">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', px: 1.25, py: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14, mr: 'auto' }}>{title}</Typography>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)} sx={{ height: 30 }}>
          <ToggleButton value="gantt" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>Gantt</ToggleButton>
          <ToggleButton value="load" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>Machine load</ToggleButton>
          <ToggleButton value="finish" sx={{ textTransform: 'none', fontSize: 12.5, px: 1.25 }}>Finish vs committed</ToggleButton>
        </ToggleButtonGroup>
        <InfoButton text="Gantt: each sales order's span; open it for its shipping units, each with its own steps one after another, coloured by machine type (red the first in the flow, green the last). The diamond is the committed date — red when the plan ends after it. The red line is today. Machine load: hours planned per machine type per day; darker is busier. Finish vs committed: each order's planned finish against its committed date." />
      </Box>
      {!units.length ? <Typography sx={{ px: 1.5, pb: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>Nothing in this plan yet.</Typography> : view === 'gantt' ? (
        <Box>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', px: 1.25, pb: 1 }}>
            {fns.map((f) => (
              <Box key={f.fn} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 12, height: 12, borderRadius: '3px', background: colour.get(f.fn) }} />
                <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{f.name}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ ...rowSx, py: 0.5, borderTop: '1px solid var(--c-divider)' }}>
            <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>Order / shipping unit</Typography>{axis}<Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textAlign: 'right' }}>Tonnes</Typography>
          </Box>
          <Box sx={{ maxHeight: 560, overflowY: 'auto' }}>
            {byOrder.map(({ o, units: us, start, end, tonnes }) => {
              const isOpen = open.has(o.id);
              const late = o.late;
              return (
                <Box key={o.id}>
                  <Box role="button" tabIndex={0} onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(o.id)) x.delete(o.id); else x.add(o.id); return x; })}
                    sx={{ ...rowSx, height: 34, cursor: 'pointer', background: 'var(--c-surface-2)', '&:hover': { background: 'var(--c-surface-3, var(--c-surface-2))' } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                      {isOpen ? <ExpandMoreRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} /> : <ChevronRightRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
                      <Mono sx={{ fontWeight: 700, fontSize: 12.5 }}>{o.code}</Mono>
                      <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.customer ?? ''} · {us.length}</Typography>
                    </Box>
                    <Box sx={{ position: 'relative', height: '100%' }}>
                      {gridLines}
                      {start && end && (
                        <Tooltip title={`${o.code}: ${dayLabel(ms(start))} → ${dayLabel(ms(end))}${o.committedDate ? ` · committed ${dayLabel(ms(o.committedDate))}${late ? ' — LATE' : ''}` : ''}`} arrow disableInteractive>
                          <Box sx={{ position: 'absolute', top: 10, height: 14, borderRadius: '4px', left: `${pct(ms(start))}%`, width: `max(4px, ${pct(ms(end) + DAY) - pct(ms(start))}%)`, background: late ? 'var(--c-danger-500, #ef4444)' : 'var(--c-primary-500)', opacity: 0.85 }} />
                        </Tooltip>
                      )}
                      {o.committedDate && ms(o.committedDate) >= range.lo && ms(o.committedDate) < range.hi && (
                        <Tooltip title={`Committed ${dayLabel(ms(o.committedDate))}`} arrow disableInteractive>
                          <Box sx={{ position: 'absolute', top: 11, width: 11, height: 11, left: `calc(${pct(ms(o.committedDate) + DAY)}% - 6px)`, transform: 'rotate(45deg)', background: late ? 'var(--c-danger-700)' : 'var(--c-text)', border: '2px solid var(--c-surface)', zIndex: 2 }} />
                        </Tooltip>
                      )}
                    </Box>
                    <Mono sx={{ fontSize: 12, textAlign: 'right' }}>{tonnes.toFixed(1)}</Mono>
                  </Box>
                  {isOpen && us.map((u) => (
                    <Box key={u.key} sx={{ ...rowSx, height: 26 }}>
                      <Typography sx={{ fontSize: 11.5, pl: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${u.code}${u.name ? ` · ${u.name}` : ''}`}>
                        <Mono sx={{ fontSize: 11.5 }}>{u.code}</Mono>{u.name ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}> {u.name}</Box> : null}
                      </Typography>
                      <Box sx={{ position: 'relative', height: '100%' }}>
                        {gridLines}
                        {u.materialDate && ms(u.materialDate) > range.lo && (
                          <Tooltip title={`Material ${u.materialAssumed ? 'assumed' : 'due'} ${dayLabel(ms(u.materialDate))}`} arrow disableInteractive>
                            <Box sx={{ position: 'absolute', top: 4, bottom: 4, left: `${pct(ms(u.materialDate))}%`, width: '2px', background: u.materialAssumed ? 'var(--c-warning-500)' : 'var(--c-text-2)', zIndex: 1 }} />
                          </Tooltip>
                        )}
                        {u.steps.map((s, i) => (
                          <Tooltip key={`${s.fn}-${i}`} title={`${u.code} · ${s.fnName}: ${dayLabel(ms(s.from))} → ${dayLabel(ms(s.to))} · ${hrs(s.minutes)}`} arrow disableInteractive>
                            <Box sx={{
                              position: 'absolute', top: 6, height: 14, borderRadius: '3px', boxSizing: 'border-box',
                              left: `${pct(ms(s.from))}%`, width: `max(3px, ${pct(ms(s.to) + DAY) - pct(ms(s.from))}%)`,
                              background: colour.get(s.fn), border: '1px solid rgba(255,255,255,0.7)',
                            }} />
                          </Tooltip>
                        ))}
                      </Box>
                      <Mono sx={{ fontSize: 11.5, textAlign: 'right', color: 'var(--c-text-2)' }}>{u.tonnes.toFixed(1)}</Mono>
                    </Box>
                  ))}
                </Box>
              );
            })}
          </Box>
        </Box>
      ) : view === 'load' ? <LoadHeat units={units} fns={fns} range={range} todayMs={todayMs} />
        : <FinishChart orders={byOrder} />}
    </Box>
  );
}

/** Machine type × day: the hours the plan puts there. */
function LoadHeat({ units, fns, range, todayMs }: { units: PlanUnit[]; fns: { fn: string; name: string }[]; range: { lo: number; hi: number; days: number }; todayMs: number | null }) {
  const grid = useMemo(() => {
    const m = new Map<string, Float64Array>();
    for (const f of fns) m.set(f.fn, new Float64Array(range.days));
    for (const u of units) for (const s of u.steps) for (const [d, min] of Object.entries(s.byDay)) {
      const i = Math.round((ms(d) - range.lo) / DAY);
      if (i >= 0 && i < range.days) (m.get(s.fn) as Float64Array)[i] += min;
    }
    return m;
  }, [units, fns, range]);
  let peak = 1;
  for (const a of grid.values()) for (const v of a) peak = Math.max(peak, v);
  const days = Array.from({ length: range.days }, (_, i) => range.lo + i * DAY);
  return (
    <Box sx={{ overflowX: 'auto', px: 1.25, pb: 1.25 }}>
      <Box component="table" sx={{ borderCollapse: 'separate', borderSpacing: '2px', fontSize: 11 }}>
        <thead><tr>
          <Box component="th" sx={{ textAlign: 'left', fontWeight: 500, color: 'var(--c-text-3)', pr: 1 }}>Machine type</Box>
          {days.map((d) => <Box component="th" key={d} sx={{ fontWeight: 500, color: d === todayMs ? 'var(--c-danger-700)' : 'var(--c-text-3)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 44, px: 0 }}>{dayLabel(d)}</Box>)}
          <Box component="th" sx={{ fontWeight: 500, color: 'var(--c-text-3)', pl: 1, textAlign: 'right' }}>Total</Box>
        </tr></thead>
        <tbody>
          {fns.map((f) => {
            const a = grid.get(f.fn) as Float64Array;
            const total = a.reduce((t, v) => t + v, 0);
            return (
              <tr key={f.fn}>
                <Box component="td" sx={{ pr: 1, whiteSpace: 'nowrap', color: 'var(--c-text-2)' }}>{f.name}</Box>
                {days.map((d, i) => (
                  <Tooltip key={d} title={`${f.name} · ${dayLabel(d)}: ${hrs(a[i])}`} arrow disableInteractive>
                    <Box component="td" sx={{ width: 16, minWidth: 16, height: 18, borderRadius: '3px', background: a[i] ? `color-mix(in srgb, var(--c-primary-600) ${Math.round(15 + (a[i] / peak) * 85)}%, transparent)` : 'var(--c-neutral-100)', outline: d === todayMs ? '1.5px solid var(--c-danger-500)' : 'none' }} />
                  </Tooltip>
                ))}
                <Box component="td" sx={{ pl: 1, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{Math.round(total / 60)} h</Box>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

/** Each order's planned finish against its committed date: a line between the two, red when the plan ends after it. */
function FinishChart({ orders }: { orders: { o: PlanOrder; end: string | null }[] }) {
  const rows = orders.filter((x) => x.end || x.o.committedDate);
  if (!rows.length) return <Typography sx={{ px: 1.5, pb: 1.5, fontSize: 13, color: 'var(--c-text-3)' }}>No finish or committed dates.</Typography>;
  const all = rows.flatMap((x) => [x.end, x.o.committedDate].filter(Boolean).map((d) => ms(d as string)));
  const lo = Math.min(...all) - 2 * DAY; const hi = Math.max(...all) + 2 * DAY;
  const p = (t: number) => ((t - lo) / (hi - lo)) * 100;
  return (
    <Box sx={{ px: 1.25, pb: 1.25 }}>
      {rows.sort((a, b) => (a.end ?? '').localeCompare(b.end ?? '')).map(({ o, end }) => {
        const c = o.committedDate ? ms(o.committedDate) : null; const e = end ? ms(end) : null;
        const late = c != null && e != null && e > c;
        const slip = c != null && e != null ? Math.round((e - c) / DAY) : null;
        return (
          <Box key={o.id} sx={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr) 90px', gap: 1, alignItems: 'center', height: 26 }}>
            <Mono sx={{ fontSize: 12, fontWeight: 600 }}>{o.code}</Mono>
            <Box sx={{ position: 'relative', height: 12 }}>
              <Box sx={{ position: 'absolute', top: 5, left: 0, right: 0, height: '2px', background: 'var(--c-divider)' }} />
              {c != null && e != null && <Box sx={{ position: 'absolute', top: 4, height: 4, left: `${Math.min(p(c), p(e))}%`, width: `${Math.abs(p(e) - p(c))}%`, background: late ? 'var(--c-danger-400, #f87171)' : 'var(--c-success-400, #4ade80)' }} />}
              {c != null && <Tooltip title={`Committed ${dayLabel(c)}`} arrow><Box sx={{ position: 'absolute', top: 0, left: `calc(${p(c)}% - 6px)`, width: 10, height: 10, transform: 'rotate(45deg)', background: 'var(--c-text)' }} /></Tooltip>}
              {e != null && <Tooltip title={`Plan finishes ${dayLabel(e)}`} arrow><Box sx={{ position: 'absolute', top: 0, left: `calc(${p(e)}% - 6px)`, width: 12, height: 12, borderRadius: '50%', background: late ? 'var(--c-danger-600)' : 'var(--c-success-600)' }} /></Tooltip>}
            </Box>
            <Typography sx={{ fontSize: 12, textAlign: 'right', color: late ? 'var(--c-danger-700)' : 'var(--c-text-2)', fontFamily: 'var(--font-mono)' }}>
              {slip == null ? '—' : slip > 0 ? `${slip} d late` : slip < 0 ? `${-slip} d early` : 'on the day'}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
