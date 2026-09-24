import type { ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { Surface, useCountUp } from '@shared/ui';

export type QueueTone = 'primary' | 'warning' | 'danger' | 'info' | 'success';

/**
 * A `-50` fill is paired with its `-800` text, never its `-600` — that pairing
 * is the one `tokens.css` re-tones for dark mode (violet's equivalent is
 * `-700`), so a card built on `-600` renders a glaring near-white tile at
 * night and misses 4.5:1 on the count in daylight. `-600` is the *solid* step,
 * for white text on a filled button.
 */
const TINT: Record<QueueTone, { bg: string; fg: string }> = {
  primary: { bg: 'var(--c-primary-50)', fg: 'var(--c-primary-700)' },
  warning: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
  danger: { bg: 'var(--c-danger-50)', fg: 'var(--c-danger-800)' },
  info: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)' },
  success: { bg: 'var(--c-success-50)', fg: 'var(--c-success-800)' },
};

/** A cleared queue is quiet, not another colour competing for the eye. */
const CLEAR = { bg: 'var(--c-surface-2)', fg: 'var(--c-text-2)' };

/**
 * A cockpit work-queue card (DESIGN_SYSTEM.md §4.1): accent icon tile, title, a
 * count that is the point of the card, one sentence of consequence, and exactly
 * ONE primary action. Not a chart, not a KPI tile — a thing to do.
 *
 * **This lives here only because `@shared/ui` has no `WorkQueueCard` yet.**
 * fab_erp and cf_erp each carry their own copy (both predate the kit), so this
 * is the third; it belongs in the kit, and the kit is where the next app should
 * find it. See the report accompanying this change.
 *
 * ZERO IS A STATE, NOT AN ABSENCE. A queue that has nothing in it still renders
 * — hiding it would make "no leave to approve" indistinguishable from "leave is
 * broken" — but it renders calm: neutral tile, a tick, and the words "Nothing
 * to do" instead of a coloured number. A red zero trains people to ignore red,
 * which is the same reasoning as `Stat`'s tone rule (§7.5).
 */
export function HomeQueueCard({
  icon,
  title,
  count,
  unit,
  description,
  actionLabel,
  onAction,
  tone = 'primary',
  clearNote,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  /** What the number counts — "unresolved", "to approve". Reads after the figure. */
  unit: string;
  /** One sentence: what goes wrong if this is left alone. */
  description: string;
  actionLabel: string;
  onAction: () => void;
  tone?: QueueTone;
  /** Replaces `description` while the count is zero, when "nothing to do" needs saying differently. */
  clearNote?: string;
}) {
  const shown = useCountUp(count);
  const clear = count === 0;
  const { bg: fill, fg } = clear ? CLEAR : TINT[tone];

  return (
    <Surface
      e={1}
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
        '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-sm)',
            display: 'grid',
            placeItems: 'center',
            background: fill,
            color: fg,
            flexShrink: 0,
            '& svg': { fontSize: 22 },
          }}
        >
          {clear ? <CheckRounded /> : icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: 'var(--c-text)' }}>{title}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            {clear ? (
              'Nothing to do'
            ) : (
              <>
                <Box
                  component="span"
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    color: fg,
                  }}
                >
                  {shown}
                </Box>{' '}
                {unit}
              </>
            )}
          </Typography>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
        {clear ? (clearNote ?? description) : description}
      </Typography>

      <Button
        onClick={onAction}
        endIcon={<ArrowForwardRounded />}
        size="small"
        sx={{
          alignSelf: 'flex-start',
          mt: 'auto',
          px: 1.25,
          color: clear ? 'var(--c-text-2)' : 'var(--c-primary-700)',
          fontWeight: 500,
          '&:hover': { background: clear ? 'var(--c-surface-2)' : 'var(--c-primary-50)' },
        }}
      >
        {actionLabel}
      </Button>
    </Surface>
  );
}
