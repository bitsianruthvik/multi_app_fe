import type { ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import { statusLabel, statusTone } from './statusRegistry';
import type { StatusTone } from './types';

/**
 * Status is never colour-only (DESIGN_SYSTEM.md §6.2) — every badge pairs an
 * icon and a text label with its tone. That is the whole reason this component
 * exists rather than a styled Chip.
 *
 * The kit knows five tones and nothing about any app's statuses. Resolution
 * order: an explicit `tone` → a `map` passed here → the app's registry (see
 * `registerStatusTones`) → neutral.
 */
const TONE_ICON: Record<StatusTone, typeof CheckCircleRounded> = {
  success: CheckCircleRounded,
  warning: HourglassEmptyRounded,
  danger: ErrorOutlineRounded,
  info: SyncRounded,
  neutral: RemoveCircleOutlineRounded,
};

/** The tone pill on its own, when the text is not a status string. */
export function ToneBadge({
  tone = 'neutral',
  label,
  icon,
  title,
  noIcon = false,
}: {
  tone?: StatusTone;
  label: ReactNode;
  /** Replaces the tone's default glyph. */
  icon?: ReactNode;
  /** Hover explanation — what this state actually means. */
  title?: string;
  /** Drop the glyph. Only for a badge that is a label, not a state. */
  noIcon?: boolean;
}) {
  const Icon = TONE_ICON[tone];
  const badge = (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: `var(--c-${tone}-50)`,
        color: `var(--c-${tone}-800)`,
        borderRadius: 'var(--r-sm)',
        padding: '3px 9px',
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        lineHeight: 1.5,
        '& svg': { fontSize: 14 },
      }}
    >
      {noIcon ? null : (icon ?? <Icon aria-hidden />)}
      {label}
    </Box>
  );
  return title ? <Tooltip title={title}>{badge}</Tooltip> : badge;
}

export function StatusBadge({
  status,
  tone,
  label,
  map,
  labelMap,
  icon,
  title,
}: {
  status: string;
  /** Overrides the registry for this one badge. */
  tone?: StatusTone;
  /** Overrides the resolved label. */
  label?: string;
  /** A per-call status → tone map, for a screen with its own vocabulary. */
  map?: Record<string, StatusTone>;
  /** A per-call status → label map. */
  labelMap?: Record<string, string>;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <ToneBadge
      tone={tone ?? statusTone(status, map)}
      label={label ?? statusLabel(status, labelMap)}
      icon={icon}
      title={title}
    />
  );
}
