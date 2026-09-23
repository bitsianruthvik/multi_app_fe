import type { KeyboardEvent, ReactNode } from 'react';
import { Box } from '@mui/material';
import { Surface } from './ui';

/**
 * One row in a short collection (DESIGN_SYSTEM.md §4.2/§7.5) — fab_erp's
 * EntityRow. The rule: four attributes or fewer is a row, five or more is a
 * DataTable. Layout: [code] [name + meta] [trailing badges] [hover actions].
 * Actions fade in on hover and keyboard focus; on a touch screen, which has no
 * hover, they are always shown.
 */
export function EntityRow({ code, primary, secondary, trailing, actions, onClick }: {
  code?: ReactNode; primary: ReactNode; secondary?: ReactNode; trailing?: ReactNode; actions?: ReactNode; onClick?: () => void;
}) {
  return (
    <Surface e={1} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } } : undefined}
      sx={{
        display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, columnGap: 1.5, rowGap: 0.75, px: 2, py: 1.25, minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease)',
        '&:hover': onClick ? { background: 'var(--c-surface-2)', boxShadow: 'var(--e-2)' } : undefined,
        '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1, pointerEvents: 'auto' },
        '@media (hover: none)': { '& .row-actions': { opacity: 1, pointerEvents: 'auto' } },
      }}>
      {code && <Box sx={{ flexShrink: 0 }}>{code}</Box>}
      <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
        <Box sx={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primary}</Box>
        {secondary && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{secondary}</Box>}
      </Box>
      {trailing && <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, flexShrink: 0 }}>{trailing}</Box>}
      {actions && (
        <Box className="row-actions" onClick={(e) => e.stopPropagation()} sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, opacity: 0, pointerEvents: 'none', transition: 'opacity 140ms var(--ease)',
        }}>
          {actions}
        </Box>
      )}
    </Surface>
  );
}

/** A vertical stack of EntityRows. */
export function EntityList({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>;
}
