import type { ReactNode } from 'react';
import {
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  type SxProps,
  type Theme,
} from '@mui/material';

export interface SortableColumn<T> {
  key: keyof T;
  label: string;
  align?: 'left' | 'right' | 'center';
  sx?: SxProps<Theme>;
}

/**
 * Generic sortable `<TableHead>` — pair with `useSortableData`.
 *
 * For a hand-laid-out MUI `<Table>` that cannot be a `DataTable` (a grid with
 * editable cells or expanding rows, say). One `TableCell` + `TableSortLabel`
 * per column, plus optional trailing unsorted cells (an Actions column) via
 * `extraCell` — pass complete `<TableCell>` nodes, rendered as-is after the
 * sortable columns.
 */
export function SortableTableHead<T>({
  columns,
  sortKey,
  sortDirection,
  onRequestSort,
  extraCell,
}: {
  columns: SortableColumn<T>[];
  sortKey: keyof T | null;
  sortDirection: 'asc' | 'desc';
  onRequestSort: (key: keyof T) => void;
  extraCell?: ReactNode;
}) {
  return (
    <TableHead>
      <TableRow>
        {columns.map((col) => (
          <TableCell
            key={String(col.key)}
            align={col.align}
            sx={col.sx}
            aria-sort={
              sortKey === col.key
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined
            }
          >
            <TableSortLabel
              active={sortKey === col.key}
              direction={sortDirection}
              onClick={() => onRequestSort(col.key)}
            >
              {col.label}
            </TableSortLabel>
          </TableCell>
        ))}
        {extraCell}
      </TableRow>
    </TableHead>
  );
}
