/**
 * FeverChart.tsx — CCPM fever chart for one project.
 *
 * x = % critical chain complete (0-100), y = % project buffer consumed
 * (0-100, inverted so 0 sits at the bottom). Three diagonal zones come from
 * CC_FEVER (api/cc.ts) — must stay pixel-for-pixel derived from the same
 * greenLine/redLine functions the backend uses to classify `feverZone`, so
 * the chart never disagrees with the badges/pills drawn elsewhere on the
 * page. Trail is a dashed polyline; the latest/current point is a filled dot
 * colored by its zone. Pure SVG, no external chart lib, theme-aware via CSS
 * vars (works in light + dark).
 */
import { Box, Typography } from '@mui/material';
import { CC_FEVER, type CcFeverPoint, type CcZone } from '../../api/cc';
import { ZONE_COLOR, ZONE_LABEL } from './zone';
import { clampPct } from './format';

interface Props {
  trail: CcFeverPoint[];
  current?: { chainCompletePct: number; bufferConsumedPct: number } | null;
}

const VB_W = 400;
const VB_H = 260;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 30;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

function toX(c: number): number {
  return PAD_L + (clampPct(c) / 100) * PLOT_W;
}
function toY(b: number): number {
  return PAD_T + PLOT_H - (clampPct(b) / 100) * PLOT_H;
}
function pts(points: Array<[number, number]>): string {
  return points.map(([c, b]) => `${toX(c)},${toY(b)}`).join(' ');
}

export default function FeverChart({ trail, current }: Props) {
  const g0 = clampPct(CC_FEVER.greenLine(0));
  const g100 = clampPct(CC_FEVER.greenLine(100));
  const r0 = clampPct(CC_FEVER.redLine(0));
  const r100 = clampPct(CC_FEVER.redLine(100));

  const greenPoly = pts([[0, 0], [100, 0], [100, g100], [0, g0]]);
  const amberPoly = pts([[0, g0], [100, g100], [100, r100], [0, r0]]);
  const redPoly = pts([[0, r0], [100, r100], [100, 100], [0, 100]]);

  const sortedTrail = [...trail].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const trailLine = sortedTrail.length > 1 ? pts(sortedTrail.map((p) => [p.chainCompletePct, p.bufferConsumedPct])) : '';

  const currentZone: CcZone | null = current ? CC_FEVER.zoneFor(current.chainCompletePct, current.bufferConsumedPct) : null;

  const gridTicks = [0, 25, 50, 75, 100];

  return (
    <Box sx={{ width: '100%' }}>
      <Box component="svg" viewBox={`0 0 ${VB_W} ${VB_H}`} sx={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* zone fills */}
        <polygon points={greenPoly} fill="var(--c-success-600)" fillOpacity={0.14} stroke="none" />
        <polygon points={amberPoly} fill="var(--c-warning-600)" fillOpacity={0.16} stroke="none" />
        <polygon points={redPoly} fill="var(--c-danger-600)" fillOpacity={0.14} stroke="none" />

        {/* gridlines */}
        {gridTicks.map((t) => (
          <line key={`gx-${t}`} x1={toX(t)} y1={toY(0)} x2={toX(t)} y2={toY(100)} stroke="var(--c-divider)" strokeWidth={1} />
        ))}
        {gridTicks.map((t) => (
          <line key={`gy-${t}`} x1={toX(0)} y1={toY(t)} x2={toX(100)} y2={toY(t)} stroke="var(--c-divider)" strokeWidth={1} />
        ))}

        {/* axes */}
        <line x1={toX(0)} y1={toY(0)} x2={toX(100)} y2={toY(0)} stroke="var(--c-border)" strokeWidth={1.5} />
        <line x1={toX(0)} y1={toY(0)} x2={toX(0)} y2={toY(100)} stroke="var(--c-border)" strokeWidth={1.5} />

        {/* tick labels */}
        {gridTicks.map((t) => (
          <text key={`tx-${t}`} x={toX(t)} y={toY(0) + 14} textAnchor="middle" fontSize={9} fill="var(--c-text-3)">{t}</text>
        ))}
        {gridTicks.map((t) => (
          <text key={`ty-${t}`} x={toX(0) - 6} y={toY(t) + 3} textAnchor="end" fontSize={9} fill="var(--c-text-3)">{t}</text>
        ))}

        {/* axis captions */}
        <text x={PAD_L + PLOT_W / 2} y={VB_H - 4} textAnchor="middle" fontSize={10} fill="var(--c-text-2)">% chain complete</text>
        <text
          x={-(PAD_T + PLOT_H / 2)}
          y={11}
          textAnchor="middle"
          fontSize={10}
          fill="var(--c-text-2)"
          transform="rotate(-90)"
        >
          % buffer consumed
        </text>

        {/* trail */}
        {trailLine && (
          <polyline points={trailLine} fill="none" stroke="var(--c-text-2)" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
        {sortedTrail.map((p, i) => (
          <circle key={i} cx={toX(p.chainCompletePct)} cy={toY(p.bufferConsumedPct)} r={2.5} fill="var(--c-surface)" stroke="var(--c-text-2)" strokeWidth={1} />
        ))}

        {/* current point */}
        {current && currentZone && (
          <circle
            cx={toX(current.chainCompletePct)}
            cy={toY(current.bufferConsumedPct)}
            r={6}
            fill={ZONE_COLOR[currentZone]}
            stroke="var(--c-surface)"
            strokeWidth={2}
          />
        )}
      </Box>

      {/* legend — color is never the only signal */}
      <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
        {(['green', 'yellow', 'red'] as CcZone[]).map((z) => (
          <Box key={z} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', background: ZONE_COLOR[z] }} />
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{ZONE_LABEL[z]}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
