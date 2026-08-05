/**
 * DrumStrip.tsx — the "drum rope" strip: the sequenced timeline of projects
 * queued on the current constraint (GET /cc/drum → slots), in `seq` order.
 * Committed slots are visually distinct (solid violet outline + fill) from
 * still-tentative ones (dashed neutral outline).
 *
 * Between two slots sits that project's capacity buffer — the third CCPM
 * buffer type, and the one nobody has heard of. It is drawn as hatched empty
 * space rather than a block because it is protective idle time on the drum,
 * not work: the point is that the planner reads it as a deliberate gap. Hatch
 * uses the muted --c-text-3 that CriticalChainGantt already gives buffers, so
 * "buffer" looks the same wherever it appears in this feature.
 */
import { Fragment } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Surface } from '../Surface';
import type { CcDrumSlot } from '../../api/cc';
import { fmtDate } from './format';

interface Props {
  slots: CcDrumSlot[];
}

/** Shop-floor working day. Minutes are the API's unit; days are the planner's. */
const WORKING_DAY_MINUTES = 480;

/**
 * Minutes → the unit people actually plan in. Below a tenth of a day "0.1 d"
 * rounds away more than it communicates, so short gaps stay in minutes.
 */
function fmtProtection(mins: number): string {
  const days = mins / WORKING_DAY_MINUTES;
  return days >= 0.1 ? `${days.toFixed(1)} d` : `${Math.round(mins)} min`;
}

function CapacityGap({ minutes, nextOrderNumber }: { minutes: number; nextOrderNumber: string }) {
  return (
    <Tooltip
      title={`Capacity buffer — ${Math.round(minutes)} min (${fmtProtection(minutes)}) of protective idle time on the constraint before ${nextOrderNumber} starts, so an overrun here is absorbed instead of pushing it.`}
    >
      <Box
        sx={{
          position: 'relative', flexShrink: 0, width: 64, borderRadius: 'var(--r-sm)',
          border: '1px dashed var(--c-divider)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Hatch lives on its own layer so the fill can be faint without
            dragging the label's contrast down with it. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: 0, borderRadius: 'var(--r-sm)', opacity: 0.22,
            background: 'repeating-linear-gradient(45deg, var(--c-text-3) 0 3px, transparent 3px 8px)',
          }}
        />
        <Typography
          sx={{
            position: 'relative', fontSize: 10, fontWeight: 600, lineHeight: 1.3,
            textAlign: 'center', color: 'var(--c-text-2)',
          }}
        >
          {fmtProtection(minutes)}
          <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'var(--c-text-3)' }}>
            protection
          </Box>
        </Typography>
      </Box>
    </Tooltip>
  );
}

export default function DrumStrip({ slots }: Props) {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort((a, b) => a.seq - b.seq);

  // A gap only means anything when there is a project behind it to protect, so
  // the trailing slot's buffer is ignored here even if the API sends one.
  const gapFor = (i: number): number =>
    i < sorted.length - 1 ? sorted[i].capacityBufferMinutes ?? 0 : 0;
  const totalProtection = sorted.reduce((sum, _s, i) => sum + gapFor(i), 0);

  return (
    <Surface e={1} sx={{ p: 1.5, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
          Drum sequence
        </Typography>
        {totalProtection > 0 && (
          <Tooltip title={`${Math.round(totalProtection)} min of capacity buffer in total, spread across the gaps between projects on the constraint.`}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--c-text-2)' }}>
              {fmtProtection(totalProtection)} total protection on the constraint
            </Typography>
          </Tooltip>
        )}
      </Box>

      {/* Most planners have never met the term, and the hatching alone will not
          teach it — one sentence, only when there is something to explain. */}
      {totalProtection > 0 && (
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 1 }}>
          Hatched gaps are capacity buffers — idle time deliberately left on the constraint so one project running long does not push everything queued behind it.
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
        {sorted.map((s, i) => {
          const gap = gapFor(i);
          return (
            <Fragment key={`${s.orderId}-${s.seq}`}>
              <Box
                sx={{
                  flexShrink: 0, minWidth: 130, p: 1, borderRadius: 'var(--r-sm)',
                  border: s.isCommitted ? '1px solid var(--c-primary-500)' : '1px dashed var(--c-border)',
                  background: s.isCommitted ? 'var(--c-primary-50)' : 'var(--c-surface-2)',
                }}
              >
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)' }}>
                  {s.seq}. {s.orderNumber}
                </Typography>
                <Typography sx={{ fontSize: 11, color: 'var(--c-text-2)' }}>{fmtDate(s.plannedStart)}</Typography>
                <Typography sx={{ fontSize: 10, fontWeight: 600, mt: 0.25, color: s.isCommitted ? 'var(--c-primary-700)' : 'var(--c-text-3)' }}>
                  {s.isCommitted ? 'Committed' : 'Tentative'}
                </Typography>
              </Box>
              {gap > 0 && <CapacityGap minutes={gap} nextOrderNumber={sorted[i + 1].orderNumber} />}
            </Fragment>
          );
        })}
      </Box>
    </Surface>
  );
}
