import React from 'react';
import { Box } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Surface } from './Surface';

/**
 * One row in a hierarchy/tree (DESIGN_SYSTEM.md §4.7/§7.5): indentation by depth
 * + a hairline guide, expand chevron rotates, body is an EntityRow-like surface.
 */
export function TreeRow({
  depth = 0,
  expandable = false,
  expanded = false,
  onToggle,
  children,
  trailing,
  onClick,
}: {
  depth?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Surface
      e={1}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pr: 2,
        py: 1,
        pl: `${depth * 20 + 8}px`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--t-fast) var(--ease)',
        '&:hover': { background: 'var(--c-surface-2)' },
      }}
    >
      {expandable ? (
        <Box
          component="button"
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--c-text-2)',
            flexShrink: 0,
          }}
        >
          <ChevronRightRounded
            sx={{
              fontSize: 18,
              transition: 'transform var(--t-mid) var(--ease)',
              transform: expanded ? 'rotate(90deg)' : 'none',
            }}
          />
        </Box>
      ) : (
        <Box sx={{ width: 22, flexShrink: 0 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
      {trailing && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>{trailing}</Box>}
    </Surface>
  );
}
