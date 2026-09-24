import { Box } from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import type { ReactNode } from 'react';
import { Surface } from './Surface';
import { CapsLabel } from './Mono';
import type { BadgeTone } from './types';

/**
 * A short piece of teaching attached to a screen.
 *
 * **Not an Alert.** An alert reports that something went wrong; a callout
 * explains how to think about the screen you are on. A page that greets you
 * with a yellow banner on every visit teaches you to skip banners, so this is
 * quiet by default (`neutral`) and only takes a colour when the consequence of
 * the misunderstanding is real.
 *
 * Use it where a screen fails if the reader arrives with the wrong mental
 * model, and no amount of good table design fixes it. Two examples from
 * cf_hrms: a work context is **not** a manager, and a shift with no hours is
 * flexible rather than half-filled-in. In both cases the screen looks perfectly
 * usable while being used wrongly, which is exactly when a sentence earns its
 * space. Do not use it to narrate what the table already shows.
 *
 * The left edge carries the tone; the body stays on a themed neutral surface so
 * the text keeps full contrast in both themes.
 */
export function Callout({
  label,
  title,
  children,
  icon,
  tone = 'neutral',
  sx,
}: {
  /** Small caps kicker above the title. */
  label?: string;
  title: ReactNode;
  children?: ReactNode;
  /** Replaces the default info glyph. */
  icon?: ReactNode;
  /** `neutral` reads as guidance. Reach for another only when it is warranted. */
  tone?: BadgeTone | 'accent';
  sx?: object;
}) {
  const edge = tone === 'accent' ? 'var(--c-primary-500)' : `var(--c-${tone}-600)`;
  return (
    <Surface
      e={0}
      sx={{
        display: 'flex',
        gap: 1.5,
        p: 2,
        mb: 2,
        background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
        borderLeft: `3px solid ${edge}`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        ...sx,
      }}
    >
      <Box aria-hidden sx={{ color: edge, mt: '2px', '& svg': { fontSize: 20 } }}>
        {icon ?? <InfoOutlined />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        {label && (
          <CapsLabel sx={{ display: 'block', color: 'var(--c-text-2)', mb: 0.5 }}>{label}</CapsLabel>
        )}
        <Box sx={{ fontWeight: 600, color: 'var(--c-text)', mb: children ? 0.5 : 0 }}>{title}</Box>
        {children && (
          <Box sx={{ color: 'var(--c-text-2)', fontSize: 14, lineHeight: 1.55 }}>{children}</Box>
        )}
      </Box>
    </Surface>
  );
}
