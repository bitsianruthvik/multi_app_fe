import { useState, type ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { Swatch, TL } from './timelineStyle';

/** Hand-drawn timelines: ERP dates on a calendar, so the reader sees when things happened, not only averages. */
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const t = (s: string) => Date.parse(s);

export function Legend({ items }: { items: { label: string; swatch: ReactNode }[] }) {
  return (
    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
      {items.map((i) => <Stack key={i.label} direction="row" spacing={0.75} alignItems="center"><Box sx={{ display: 'flex', alignItems: 'center' }}>{i.swatch}</Box><Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{i.label}</Typography></Stack>)}
    </Stack>
  );
}

function MonthGrid({ from, to, x, y0, y1, every }: { from: string; to: string; x: (s: string) => number; y0: number; y1: number; every: number }) {
  const out: ReactNode[] = []; const d = new Date(from); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  while (d.getTime() <= t(to)) { const iso = d.toISOString().slice(0, 10); const m = d.getUTCMonth();
    if (m % every === 0) out.push(<g key={iso}><line x1={x(iso)} x2={x(iso)} y1={y0} y2={y1} style={{ stroke: TL.grid }} /><text x={x(iso) + 3} y={y0 - 4} fontSize={11} style={{ fill: TL.mute }}>{MN[m]}{m === 0 || out.length === 0 ? ` '${String(d.getUTCFullYear()).slice(2)}` : ''}</text></g>);
    d.setUTCMonth(m + 1); }
  return <>{out}</>;
}

function Hover({ text }: { text: string }) { return <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', minHeight: 18, mt: 0.5 }}>{text}</Typography>; }

export interface OrderRow { no: string; customer: string; od: string; due: string | null; tonnes: number; start: string | null; lastPour?: string | null; lastIns?: string | null; pourDone: string | null; insDone: string | null; shipped: string | null; ships: [string, number][]; open: boolean }
/** One row per sales order: waiting to start, making and pouring, after pouring until passed, due date, and each shipment. */
export function OrderGantt({ rows, from, to, asOf, label }: { rows: OrderRow[]; from: string; to: string; asOf: string; label?: (r: OrderRow) => string }) {
  const [hover, setHover] = useState('Hover a row for its dates.');
  const L = 190, R = 990, H = 20, top = 18; const x = (s: string) => L + Math.max(0, Math.min(1, (t(s) - t(from)) / (t(to) - t(from)))) * (R - L);
  const h = top + rows.length * H + 4;
  return (
    <Box>
      <svg viewBox={`0 0 1000 ${h}`} width="100%" role="img" aria-label="Sales order timelines">
        <MonthGrid from={from} to={to} x={x} y0={top} y1={h} every={1} />
        <line x1={x(asOf)} x2={x(asOf)} y1={top} y2={h} style={{ stroke: TL.mute, strokeDasharray: '3 3' }} />
        {rows.map((r, i) => {
          const y = top + i * H + H / 2; const end = (a: string | null | undefined) => a || asOf; const pour = r.pourDone || r.lastPour; const ins = r.insDone || r.lastIns;
          const txt = `${r.no} · ${r.customer} · ${r.tonnes} t · ordered ${r.od}, due ${r.due ?? '—'}, started ${r.start ?? '—'}, all poured ${pour ?? 'not yet'}, all passed ${ins ?? 'not yet'}, ${r.open ? 'still open' : `last shipped ${r.shipped}`}`;
          return (
            <g key={r.no} onMouseEnter={() => setHover(txt)}>
              <rect x={0} y={y - H / 2} width={1000} height={H} style={{ fill: 'transparent' }} />
              <text x={0} y={y + 4} fontSize={12} style={{ fill: TL.text }}>{(label ? label(r) : `${r.no} · ${r.tonnes} t`).slice(0, 30)}</text>
              {r.start && <line x1={x(r.od)} x2={x(r.start)} y1={y} y2={y} style={{ stroke: TL.wait, strokeWidth: 4 }} />}
              {r.start && <rect x={x(r.start)} y={y - 5} width={Math.max(1, x(end(pour)) - x(r.start))} height={10} rx={2} style={{ fill: TL.make, opacity: pour ? 1 : 0.45 }} />}
              {pour && <rect x={x(pour)} y={y - 5} width={Math.max(1, x(end(ins)) - x(pour))} height={10} rx={2} style={{ fill: TL.post, opacity: ins ? 1 : 0.45 }} />}
              {r.due && <line x1={x(r.due)} x2={x(r.due)} y1={y - 8} y2={y + 8} style={{ stroke: TL.due, strokeWidth: 2.5 }} />}
              {r.ships.map(([d]) => <rect key={d} x={x(d) - 4} y={y - 4} width={8} height={8} transform={`rotate(45 ${x(d)} ${y})`} style={{ fill: TL.ship }} />)}
            </g>
          );
        })}
      </svg>
      <Hover text={hover} />
    </Box>
  );
}

export interface RhythmRow { id: number; customer: string; kind: string; median: number; p25: number; p75: number; ships: [string, number][]; skips: { dt: string; ready: number; late: number; why: string }[] }
const skipStyle = (why: string) => (why === 'Castings were ready' ? { fill: TL.ready, stroke: '#b07a00', strokeWidth: 1 } : { fill: 'none', stroke: why === 'Orders late, nothing ready' ? TL.due : 'var(--c-text-3)', strokeWidth: 2 });
/** Every shipment of each customer on a calendar, with the slots where an expected shipment did not come. */
export function RhythmStrips({ rows, from, to, onPick }: { rows: RhythmRow[]; from: string; to: string; onPick?: (id: number) => void }) {
  const [hover, setHover] = useState('Hover a mark for details.');
  const L = 170, R = 990, H = 26, top = 18; const x = (s: string) => L + Math.max(0, Math.min(1, (t(s) - t(from)) / (t(to) - t(from)))) * (R - L); const h = top + rows.length * H + 4;
  return (
    <Box>
      <svg viewBox={`0 0 1000 ${h}`} width="100%" role="img" aria-label="Shipments per customer over time">
        <MonthGrid from={from} to={to} x={x} y0={top} y1={h} every={3} />
        {rows.map((r, i) => { const y = top + i * H + H / 2; return (
          <g key={r.id}>
            <text x={0} y={y + 4} fontSize={12} style={{ fill: TL.text, cursor: onPick ? 'pointer' : 'default' }} onClick={() => onPick?.(r.id)}>{r.customer.slice(0, 24)}</text>
            <line x1={L} x2={R} y1={y} y2={y} style={{ stroke: TL.grid }} />
            {r.ships.map(([d, tn]) => <circle key={d} cx={x(d)} cy={y} r={Math.max(2.5, Math.min(9, Math.sqrt(tn) * 2))} style={{ fill: TL.make, opacity: 0.75 }} onMouseEnter={() => setHover(`${r.customer}: shipped ${tn} t on ${d}`)} />)}
            {r.skips.map((s) => <circle key={s.dt} cx={x(s.dt)} cy={y} r={5.5} style={skipStyle(s.why)} onMouseEnter={() => setHover(`${r.customer}: a shipment was due around ${s.dt} and none came. ${s.why}: ${s.ready} t ready, ${s.late} t of orders late then.`)} />)}
          </g>); })}
      </svg>
      <Hover text={hover} />
    </Box>
  );
}

/** Usual days between shipments per customer: the middle half as a bar, the median as a tick. */
export function GapRanges({ rows }: { rows: RhythmRow[] }) {
  const L = 170, R = 820, H = 22, top = 18, MAX = 130; const x = (v: number) => L + (Math.min(v, MAX) / MAX) * (R - L); const h = top + rows.length * H + 4;
  return (
    <svg viewBox={`0 0 1000 ${h}`} width="100%" role="img" aria-label="Days between shipments per customer">
      {[0, 7, 14, 30, 60, 90, 120].map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={top - 2} y2={h} style={{ stroke: TL.grid }} /><text x={x(v)} y={top - 5} fontSize={11} textAnchor="middle" style={{ fill: TL.mute }}>{v}d</text></g>)}
      {rows.map((r, i) => { const y = top + i * H + H / 2; return (
        <g key={r.id}>
          <text x={0} y={y + 4} fontSize={12} style={{ fill: TL.text }}>{r.customer.slice(0, 24)}</text>
          <rect x={x(r.p25)} y={y - 5} width={Math.max(3, x(r.p75) - x(r.p25))} height={10} rx={2} style={{ fill: '#85b7eb' }} />
          <rect x={x(r.median) - 1.5} y={y - 8} width={3} height={16} style={{ fill: '#185fa5' }} />
          <text x={R + 12} y={y + 4} fontSize={12} style={{ fill: TL.text }}>{r.kind} · {r.median} days</text>
        </g>); })}
    </svg>
  );
}

/** Days spent at each stage, one bar, against the promised days. */
export function StepStrip({ legs, promised }: { legs: { key: string; label: string; days: number | null }[]; promised: number | null }) {
  const COLORS = ['#d3d1c7', '#85b7eb', 'var(--c-primary-500)', TL.post, '#5f5e5a'];
  const total = legs.reduce((s, l) => s + (l.days || 0), 0); const max = Math.max(total, promised || 0) * 1.08 || 1; const W = 1000; const x = (v: number) => (v / max) * W;
  let acc = 0;
  return (
    <Box>
      <svg viewBox={`0 0 ${W} 64`} width="100%" role="img" aria-label="Days per stage">
        {legs.map((l, i) => { const a = acc; acc += l.days || 0; const w = x(l.days || 0); return (
          <g key={l.key}><rect x={x(a)} y={14} width={Math.max(0, w - 2)} height={30} rx={3} style={{ fill: COLORS[i % COLORS.length] }} />{w > 34 && <text x={x(a) + w / 2} y={34} fontSize={13} textAnchor="middle" style={{ fill: i >= 2 ? '#fff' : '#1f1f1e' }}>{l.days}d</text>}</g>); })}
        {promised != null && <g><line x1={x(promised)} x2={x(promised)} y1={4} y2={54} style={{ stroke: 'var(--c-text)', strokeDasharray: '4 3', strokeWidth: 1.5 }} /><text x={x(promised) - 4} y={62} fontSize={12} textAnchor="end" style={{ fill: 'var(--c-text-2)' }}>Promised {promised} days</text></g>}
      </svg>
      <Legend items={legs.map((l, i) => ({ label: `${l.label}: ${l.days ?? '—'} days`, swatch: Swatch.bar(COLORS[i % COLORS.length], 10) }))} />
    </Box>
  );
}
