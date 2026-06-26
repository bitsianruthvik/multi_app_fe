import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

/**
 * Generic client-side stable sort for already-loaded row arrays (fab_erp
 * tables are capped at 500-1000 rows, so no server-side sort is needed).
 * Handles string/number/null/undefined; falls back to locale string compare.
 */
export function useSortableData<T>(
  rows: T[],
  defaultSortKey?: keyof T,
  defaultDirection: SortDirection = 'asc',
): {
  sortedRows: T[];
  sortKey: keyof T | null;
  sortDirection: SortDirection;
  requestSort: (key: keyof T) => void;
} {
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSortKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const requestSort = (key: keyof T) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...rows]
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const av = a.row[sortKey];
        const bv = b.row[sortKey];
        if (av == null && bv == null) return a.index - b.index;
        if (av == null) return 1;
        if (bv == null) return -1;
        let cmp: number;
        if (typeof av === 'number' && typeof bv === 'number') {
          cmp = av - bv;
        } else if (typeof av === 'string' && typeof bv === 'string') {
          cmp = av.localeCompare(bv);
        } else {
          cmp = String(av).localeCompare(String(bv));
        }
        return cmp !== 0 ? cmp * dir : a.index - b.index;
      })
      .map((entry) => entry.row);
  }, [rows, sortKey, sortDirection]);

  return { sortedRows, sortKey, sortDirection, requestSort };
}
