import type { ComponentProps } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import { DataCards, DataTable } from '@shared/ui';

/**
 * A report's table: the full DataTable on tablets and computers, the same
 * columns as cards on phones (DataCards).
 */
export function ReportTable<T>(props: ComponentProps<typeof DataTable<T>>) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  if (phone) {
    const { rows, columns, getRowId, onRowClick, empty, defaultSortKey, defaultSortDir } = props;
    return <DataCards rows={rows} columns={columns} getRowId={getRowId} onRowClick={onRowClick} empty={empty}
      defaultSortKey={defaultSortKey} defaultSortDir={defaultSortDir} />;
  }
  return <DataTable {...props} />;
}
