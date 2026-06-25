import { Box } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import { statusFamily, type StatusFamily } from '../statusMap';

/**
 * Status is never color-only (DESIGN_SYSTEM.md §6 accessibility contract) —
 * every badge pairs an icon + text label with its color family.
 */
const FAMILY: Record<StatusFamily, [bg: string, fg: string, Icon: typeof CheckCircleRounded]> = {
  success: ['var(--c-success-50)', 'var(--c-success-800)', CheckCircleRounded],
  warning: ['var(--c-warning-50)', 'var(--c-warning-800)', HourglassEmptyRounded],
  danger: ['var(--c-danger-50)', 'var(--c-danger-800)', ErrorOutlineRounded],
  info: ['var(--c-info-50)', 'var(--c-info-800)', SyncRounded],
  neutral: ['var(--c-neutral-50)', 'var(--c-neutral-800)', RemoveCircleOutlineRounded],
};

export function StatusBadge({ status, family }: { status: string; family?: StatusFamily }) {
  const [bg, fg, Icon] = FAMILY[family ?? statusFamily(status)];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: bg,
        color: fg,
        borderRadius: 'var(--r-sm)',
        padding: '3px 9px',
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <Icon sx={{ fontSize: 14 }} aria-hidden />
      {status.replace(/_/g, ' ')}
    </Box>
  );
}
