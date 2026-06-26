import React from 'react';
import { Box, MenuItem, TextField, ToggleButton } from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import { Surface } from './Surface';
import { useSortableData, type SortDirection } from '../hooks/useSortableData';

/**
 * One row in a collection list (DESIGN_SYSTEM.md §4.2/§7.5).
 * Layout: [code] [primary name + meta] [trailing: badge/fields] [hover actions].
 * Actions fade in on hover AND keyboard focus-within (a11y §5.7-4).
 */
export function EntityRow({
  code,
  primary,
  secondary,
  trailing,
  actions,
  onClick,
}: {
  code?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Surface
      e={1}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.25,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease)',
        '&:hover': { background: 'var(--c-surface-2)', boxShadow: 'var(--e-2)' },
        '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1, pointerEvents: 'auto' },
      }}
    >
      {code && <Box sx={{ flexShrink: 0 }}>{code}</Box>}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--c-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {primary}
        </Box>
        {secondary && (
          <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{secondary}</Box>
        )}
      </Box>
      {trailing && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>{trailing}</Box>
      )}
      {actions && (
        <Box
          className="row-actions"
          onClick={(e) => e.stopPropagation()}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            flexShrink: 0,
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 140ms var(--ease)',
          }}
        >
          {actions}
        </Box>
      )}
    </Surface>
  );
}

export interface SortableField<T> { key: keyof T; label: string }

/**
 * Vertical stack of EntityRows. EntityRow children are rendered as-is unless
 * `rows` + `renderRow` + `sortableFields` are supplied, in which case a sort
 * control (field picker + asc/desc toggle) appears above the list and the
 * rows are sorted via useSortableData before rendering.
 */
export function EntityList<T>({
  children,
  rows,
  renderRow,
  sortableFields,
  defaultSortKey,
}: {
  children?: React.ReactNode;
  rows?: T[];
  renderRow?: (row: T) => React.ReactNode;
  sortableFields?: SortableField<T>[];
  defaultSortKey?: keyof T;
}) {
  const { sortedRows, sortKey, sortDirection, requestSort } = useSortableData<T>(
    rows ?? [],
    defaultSortKey,
  );

  const showSortControl = !!sortableFields && sortableFields.length > 0 && !!rows && !!renderRow;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {showSortControl && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <TextField
            select
            size="small"
            label="Sort by"
            value={String(sortKey ?? '')}
            onChange={(e) => requestSort(e.target.value as keyof T)}
            sx={{ minWidth: 180 }}
          >
            {sortableFields!.map((f) => (
              <MenuItem key={String(f.key)} value={String(f.key)}>{f.label}</MenuItem>
            ))}
          </TextField>
          <ToggleButton
            size="small"
            value="direction"
            selected={sortDirection === 'desc'}
            onChange={() => sortKey && requestSort(sortKey)}
            disabled={!sortKey}
          >
            {sortDirection === 'desc' ? <ArrowDownwardRounded fontSize="small" /> : <ArrowUpwardRounded fontSize="small" />}
          </ToggleButton>
        </Box>
      )}
      {showSortControl ? sortedRows.map((row) => renderRow!(row)) : children}
    </Box>
  );
}

export type { SortDirection };
