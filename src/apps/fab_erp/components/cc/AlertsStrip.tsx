/**
 * AlertsStrip.tsx — compact horizontal strip of CC alert chips (EU-14 FE part).
 *
 * Zone-transition alerts are colored by their `severity` zone; wakeup alerts
 * use the neutral/info family. Hidden entirely when there are no alerts.
 * Icon + color + label together (never color alone, DESIGN_SYSTEM.md §6.2).
 */
import { Box, Chip, Typography } from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import { Surface } from '../Surface';
import type { CcAlert } from '../../api/cc';
import { ZONE_COLOR, ZONE_BG } from './zone';

interface Props {
  alerts: CcAlert[];
}

export default function AlertsStrip({ alerts }: Props) {
  if (alerts.length === 0) return null;

  return (
    <Surface e={1} sx={{ p: 1.5, mb: 2 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1 }}>
        Alerts ({alerts.length})
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5 }}>
        {alerts.map((a, i) => {
          const isZone = a.type === 'zone';
          const color = a.severity === 'info' ? 'var(--c-info-600)' : ZONE_COLOR[a.severity];
          const bg = a.severity === 'info' ? 'var(--c-info-50)' : ZONE_BG[a.severity];
          return (
            <Chip
              key={`${a.type}-${a.orderId}-${i}`}
              size="small"
              icon={isZone ? <WarningAmberRounded sx={{ fontSize: 15, color: `${color} !important` }} /> : <AccessTimeRounded sx={{ fontSize: 15, color: `${color} !important` }} />}
              label={a.message}
              sx={{ flexShrink: 0, background: bg, color, fontWeight: 500, fontSize: 12 }}
            />
          );
        })}
      </Box>
    </Surface>
  );
}
