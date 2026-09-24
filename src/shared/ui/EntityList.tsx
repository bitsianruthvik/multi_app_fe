import React from 'react';
import { Box, MenuItem, TextField, ToggleButton } from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import { Surface } from './Surface';
import { useSortableData, type SortDirection } from './hooks/useSortableData';

/**
 * One row in a collection list (DESIGN_SYSTEM.md §4.2/§7.5).
 *
 * Layout: [code] [primary name + meta] [trailing badges] [hover actions].
 * The rule for choosing this over `DataTable`: four meaningful attributes or
 * fewer — or rows that are primarily a name you click — is a row; five or more,
 * or a column the reader compares values down, is a table.
 *
 * Actions fade in on hover AND on keyboard focus-within, so they are reachable
 * without a mouse (§5.7-4). On a touch screen, which has no hover at all, they
 * are always shown — a button nobody can see is a button nobody has.
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
              // Only when the row itself has focus — otherwise Space on a
              // button inside the row would also open the record.
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: { xs: 'wrap', sm: 'nowrap' },
        columnGap: 1.5,
        rowGap: 0.75,
        px: 2,
        py: 1.25,
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease)',
        '&:hover': onClick
          ? { background: 'var(--c-surface-2)', boxShadow: 'var(--e-2)' }
          : undefined,
        '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1, pointerEvents: 'auto' },
        '@media (hover: none)': { '& .row-actions': { opacity: 1, pointerEvents: 'auto' } },
      }}
    >
      {code && <Box sx={{ flexShrink: 0 }}>{code}</Box>}
      <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
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
        {secondary && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{secondary}</Box>}
      </Box>
      {trailing && (
        <Box
          sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, flexShrink: 0 }}
        >
          {trailing}
        </Box>
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

export interface SortableField<T> {
  key: keyof T;
  label: string;
}

/**
 * Vertical stack of EntityRows.
 *
 * Children are rendered as-is unless `rows` + `renderRow` + `sortableFields`
 * are supplied, in which case a sort control (field picker + direction toggle)
 * appears above the list and the rows are sorted before rendering.
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
            {sortableFields.map((f) => (
              <MenuItem key={String(f.key)} value={String(f.key)}>
                {f.label}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButton
            size="small"
            value="direction"
            selected={sortDirection === 'desc'}
            onChange={() => sortKey && requestSort(sortKey)}
            disabled={!sortKey}
            aria-label={sortDirection === 'desc' ? 'Sort ascending' : 'Sort descending'}
          >
            {sortDirection === 'desc' ? (
              <ArrowDownwardRounded fontSize="small" />
            ) : (
              <ArrowUpwardRounded fontSize="small" />
            )}
          </ToggleButton>
        </Box>
      )}
      {showSortControl ? sortedRows.map((row) => renderRow(row)) : children}
    </Box>
  );
}

export type { SortDirection };
