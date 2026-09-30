/**
 * The dashboard's building blocks: a headline tile (a number, what it means,
 * and a line of context under it) and the little status dot. A tile is not the
 * StatStrip card — that one counts up a single integer; these carry %, hours
 * and tonnes, and the sentence under the number is half the point.
 */
import type { ReactNode } from 'react';
import { Box, Tooltip, Typography } from '@mui/material';
import { Surface } from '../ui';

export type TileTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
const TONE: Record<TileTone, string> = {
  default: 'var(--c-text)', success: 'var(--c-success-600)', warning: 'var(--c-warning-600)', danger: 'var(--c-danger-600)', info: 'var(--c-info-600)',
};

export function Tile({ label, value, tone = 'default', sub, hint, children, estimate = false, onClick, testId }: {
  label: string; value: ReactNode; tone?: TileTone; sub?: ReactNode; hint?: string; children?: ReactNode; estimate?: boolean; onClick?: () => void; testId?: string;
}) {
  const body = (
    <Surface e={1} onClick={onClick} data-testid={testId} sx={{
      p: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5, cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow var(--t-fast) var(--ease), transform var(--t-fast) var(--ease)',
      ...(onClick && { '&:hover': { boxShadow: 'var(--e-2)', transform: 'translateY(-1px)' } }),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{label}</Typography>
        {estimate && <EstimateTag />}
      </Box>
      <Typography sx={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: TONE[tone], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
      {sub && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.45 }}>{sub}</Box>}
      {children}
    </Surface>
  );
  return hint ? <Tooltip title={hint} placement="top-start">{body}</Tooltip> : body;
}

export function TileGrid({ children, min = 180 }: { children: ReactNode; min?: number }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(auto-fit, minmax(${min}px, 1fr))` }, gap: 1.5, mb: 2.5 }}>
      {children}
    </Box>
  );
}

/** "estimate" — on every number that is worked out rather than recorded. */
export function EstimateTag({ title = 'Worked out from the data, not recorded — read it as an estimate.' }: { title?: string }) {
  return (
    <Tooltip title={title}>
      <Box component="span" data-testid="estimate-tag" sx={{ fontSize: 10, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-3)', border: '1px dashed var(--c-border)', borderRadius: 'var(--r-sm)', px: 0.6, lineHeight: 1.6 }}>
        estimate
      </Box>
    </Tooltip>
  );
}

export function Dot({ color, pulse = false, label }: { color: string; pulse?: boolean; label: string }) {
  return (
    <Box component="span" role="img" aria-label={label} title={label} sx={{
      width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block',
      boxShadow: pulse ? `0 0 0 3px color-mix(in srgb, ${color} 25%, transparent)` : 'none',
    }} />
  );
}

/** A small caps heading inside a card. */
export function MiniHead({ children }: { children: ReactNode }) {
  return <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>{children}</Typography>;
}
