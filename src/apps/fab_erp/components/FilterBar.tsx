import React from 'react';
import { Box, InputBase } from '@mui/material';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { Surface } from './Surface';

/** A single facet chip used in FilterBar. */
export function FacetChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  count?: number;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 32,
        px: 1.5,
        borderRadius: 'var(--r-sm)',
        border: '1px solid',
        borderColor: active ? 'var(--c-primary-200)' : 'var(--c-border)',
        background: active ? 'var(--c-primary-50)' : 'transparent',
        color: active ? 'var(--c-primary-700)' : 'var(--c-text-2)',
        fontFamily: 'var(--font-ui)',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all var(--t-fast) var(--ease)',
        '&:hover': { borderColor: 'var(--c-primary-200)', color: 'var(--c-primary-700)' },
      }}
    >
      {label}
      {count !== undefined && (
        <Box
          component="span"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: active ? 'var(--c-primary-600)' : 'var(--c-text-3)',
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  );
}

/**
 * Sticky solid filter bar (DESIGN_SYSTEM.md §7.5): search input + facet chips.
 * Pass `search`/`onSearch` for the search box; put `<FacetChip>`s in children.
 */
export function FilterBar({
  search,
  onSearch,
  placeholder = 'Search…',
  children,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  placeholder?: string;
  children?: React.ReactNode;
}) {
  return (
    <Surface
      e={1}
      sx={{
        position: 'sticky',
        top: 12,
        zIndex: 5,
        p: 1,
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
      }}
    >
      {onSearch && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            height: 32,
            flex: '1 1 220px',
            minWidth: 180,
            borderRadius: 'var(--r-sm)',
            background: 'var(--c-surface-2)',
            border: '1px solid var(--c-border)',
          }}
        >
          <SearchRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} />
          <InputBase
            value={search ?? ''}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            sx={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--c-text)' }}
          />
        </Box>
      )}
      {children}
    </Surface>
  );
}
