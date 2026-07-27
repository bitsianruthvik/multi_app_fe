/**
 * DrumStrip.tsx — the "drum rope" strip: the sequenced timeline of projects
 * queued on the current constraint (GET /cc/drum → slots), in `seq` order.
 * Committed slots are visually distinct (solid violet outline + fill) from
 * still-tentative ones (dashed neutral outline).
 */
import { Box, Typography } from '@mui/material';
import { Surface } from '../Surface';
import type { CcDrumSlot } from '../../api/cc';
import { fmtDate } from './format';

interface Props {
  slots: CcDrumSlot[];
}

export default function DrumStrip({ slots }: Props) {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort((a, b) => a.seq - b.seq);

  return (
    <Surface e={1} sx={{ p: 1.5, mb: 2 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
        Drum sequence
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
        {sorted.map((s) => (
          <Box
            key={`${s.orderId}-${s.seq}`}
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
        ))}
      </Box>
    </Surface>
  );
}
