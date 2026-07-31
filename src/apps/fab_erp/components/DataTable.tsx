import React, { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box, Checkbox, IconButton, Menu, MenuItem, ListItemText, Tooltip, Button,
} from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ViewColumnRounded from '@mui/icons-material/ViewColumnRounded';
import DensityMediumRounded from '@mui/icons-material/DensityMediumRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { Surface } from './Surface';
import { SkeletonBlock } from './Skeletons';

/**
 * The one table in fab_erp (DESIGN_SYSTEM.md §4.2 / §7).
 *
 * Before this existed, 15 screens hand-rolled `<TableContainer><Table>` with
 * their own header styling, their own sort (or none), no column control, no
 * density, no selection and no export. That inconsistency is the main reason
 * the app read as "a violet theme over a spreadsheet". Everything that wants a
 * multi-column grid uses this.
 *
 * Deliberately NOT virtualized. fab_erp queries cap at 500–1000 rows (see
 * useSortableData), and windowing a semantic <table> costs correct sticky
 * headers, correct column widths and keyboard row navigation. Client-side
 * pagination is both cheaper and what ERP users actually expect — they want to
 * know they're on page 3 of 7, not scroll a rope of unknown length.
 *
 * Row height, padding and font size come from --row-h / --row-px / --row-fs,
 * so the density control retunes every table at once via data-density on
 * <html> (tokens.css). Nothing here hardcodes a row height.
 */

export interface DataColumn<T> {
  /** Stable unique key — also the persistence key for visibility. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /**
   * Supplying this makes the column sortable. Return a primitive; nulls sort
   * last regardless of direction.
   */
  sortValue?: (row: T) => string | number | null | undefined;
  /**
   * Value used for CSV export. Falls back to sortValue. A column with neither
   * is skipped on export (we cannot read text out of an arbitrary ReactNode).
   */
  exportValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** Numeric columns right-align and get tabular figures automatically. */
  numeric?: boolean;
  width?: number | string;
  /** Start hidden; user can enable via the column menu. */
  defaultHidden?: boolean;
  /** Exclude from the column menu (e.g. an actions column). */
  alwaysVisible?: boolean;
}

type Density = 'compact' | 'cosy' | 'comfy';

const DENSITY_ORDER: Density[] = ['compact', 'cosy', 'comfy'];
const DENSITY_LABEL: Record<Density, string> = {
  compact: 'Compact',
  cosy: 'Cosy',
  comfy: 'Comfortable',
};

/**
 * Density is global — one attribute on <html>, one localStorage key, so every
 * table in the app agrees and the choice survives a reload. It is deliberately
 * NOT part of a table's per-screen `storageKey` prefs: a user who wants compact
 * rows wants them everywhere, not to re-set it on each screen.
 */
const DENSITY_STORAGE_KEY = 'fab_erp:density';

function readDensity(): Density {
  try {
    const raw = localStorage.getItem(DENSITY_STORAGE_KEY);
    return raw && DENSITY_ORDER.includes(raw as Density) ? (raw as Density) : 'cosy';
  } catch {
    return 'cosy';
  }
}

function applyDensity(d: Density) {
  const root = document.documentElement;
  if (d === 'cosy') root.removeAttribute('data-density');
  else root.setAttribute('data-density', d);
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, d);
  } catch {
    /* preferences are a nicety, never block the table */
  }
}

function readStored<V>(key: string | undefined, suffix: string, fallback: V): V {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(`fab_erp:table:${key}:${suffix}`);
    return raw ? (JSON.parse(raw) as V) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string | undefined, suffix: string, value: unknown) {
  if (!key) return;
  try {
    localStorage.setItem(`fab_erp:table:${key}:${suffix}`, JSON.stringify(value));
  } catch {
    /* quota or private mode — preferences are a nicety, never block the table */
  }
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  onRowClick,
  rowActions,
  selectable = false,
  bulkActions,
  loading = false,
  empty,
  storageKey,
  exportName,
  pageSize: initialPageSize = 50,
  defaultSortKey,
  defaultSortDir = 'asc',
  maxHeight,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** Rendered in a trailing cell, revealed on row hover / focus-within. */
  rowActions?: (row: T) => ReactNode;
  selectable?: boolean;
  /** Rendered in the bulk bar when ≥1 row is selected. Receives the selection. */
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
  loading?: boolean;
  /** Shown when there are no rows. Pass an <EmptyState>. */
  empty?: ReactNode;
  /** Persists column visibility + page size under this key. Omit to not persist. */
  storageKey?: string;
  /** Enables CSV export; used as the download filename stem. */
  exportName?: string;
  pageSize?: number;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  maxHeight?: number | string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(() =>
    readStored(storageKey, 'pageSize', initialPageSize),
  );
  const [hidden, setHidden] = useState<string[]>(() =>
    readStored(storageKey, 'hidden', columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [density, setDensity] = useState<Density>(readDensity);
  const [colMenu, setColMenu] = useState<null | HTMLElement>(null);
  const [densityMenu, setDensityMenu] = useState<null | HTMLElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => { writeStored(storageKey, 'hidden', hidden); }, [storageKey, hidden]);
  useEffect(() => { writeStored(storageKey, 'pageSize', pageSize); }, [storageKey, pageSize]);
  useEffect(() => { applyDensity(density); }, [density]);

  // A filter change upstream shrinks `rows`; without this the user can be
  // stranded on a page that no longer exists and see an empty table.
  useEffect(() => { setPage(0); }, [rows.length, sortKey, sortDir, pageSize]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.alwaysVisible || !hidden.includes(c.key)),
    [columns, hidden],
  );

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows]
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const av = col.sortValue!(a.row);
        const bv = col.sortValue!(b.row);
        if (av == null && bv == null) return a.index - b.index;
        if (av == null) return 1;   // nulls last in both directions
        if (bv == null) return -1;
        let cmp: number;
        // MySQL hands back DECIMAL columns as strings ("7850.000000"), so a
        // numeric column can arrive typed as string and would otherwise sort
        // lexically — putting 100 before 20. Compare numerically whenever both
        // sides parse as finite numbers.
        const an = typeof av === 'number' ? av : Number(av);
        const bn = typeof bv === 'number' ? bv : Number(bv);
        if (Number.isFinite(an) && Number.isFinite(bn) && av !== '' && bv !== '') {
          cmp = an - bn;
        } else {
          cmp = String(av).localeCompare(String(bv));
        }
        return cmp !== 0 ? cmp * dir : a.index - b.index;
      })
      .map((e) => e.row);
  }, [rows, columns, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = useMemo(
    () => (pageSize >= sorted.length ? sorted : sorted.slice(page * pageSize, page * pageSize + pageSize)),
    [sorted, page, pageSize],
  );

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(getRowId(r))),
    [rows, selected, getRowId],
  );

  const toggleSort = (col: DataColumn<T>) => {
    if (!col.sortValue) return;
    if (sortKey === col.key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(col.key); setSortDir('asc'); }
  };

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(getRowId(r)));
  const someOnPageSelected = pageRows.some((r) => selected.has(getRowId(r)));

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((r) => next.delete(getRowId(r)));
      else pageRows.forEach((r) => next.add(getRowId(r)));
      return next;
    });
  };

  const exportCsv = () => {
    const cols = visibleColumns.filter((c) => c.exportValue || c.sortValue);
    const header = cols.map((c) => c.header);
    const body = sorted.map((row) =>
      cols.map((c) => {
        const v = (c.exportValue ?? c.sortValue)!(row);
        return v ?? '';
      }),
    );
    const blob = new Blob([toCsv([header, ...body])], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Roving keyboard navigation over rows: ↑/↓ move, Enter activates.
  const onBodyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const cells = bodyRef.current?.querySelectorAll<HTMLElement>('tr[data-row]');
    if (!cells?.length) return;
    const current = document.activeElement?.closest('tr[data-row]');
    const idx = current ? Array.from(cells).indexOf(current as HTMLElement) : -1;
    const nextIdx = e.key === 'ArrowDown' ? Math.min(idx + 1, cells.length - 1) : Math.max(idx - 1, 0);
    e.preventDefault();
    cells[nextIdx]?.focus();
  };

  const cellSx = {
    px: 'var(--row-px)',
    height: 'var(--row-h)',
    fontSize: 'var(--row-fs)',
    borderBottom: '1px solid var(--c-divider)',
    color: 'var(--c-text)',
    whiteSpace: 'nowrap' as const,
  };

  const hasToolbar = !!storageKey || !!exportName || columns.some((c) => !c.alwaysVisible);

  return (
    <Box>
      {/* ── Toolbar: column control · density · export ── */}
      {hasToolbar && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, justifyContent: 'flex-end' }}>
          <Box sx={{ mr: 'auto', fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>
            {loading ? '' : `${sorted.length} ${sorted.length === 1 ? 'row' : 'rows'}`}
          </Box>
          <Tooltip title="Columns">
            <IconButton size="small" onClick={(e) => setColMenu(e.currentTarget)} aria-label="Choose columns">
              <ViewColumnRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Row density">
            <IconButton size="small" onClick={(e) => setDensityMenu(e.currentTarget)} aria-label="Row density">
              <DensityMediumRounded fontSize="small" />
            </IconButton>
          </Tooltip>
          {exportName && (
            <Tooltip title="Export visible columns to CSV">
              <IconButton size="small" onClick={exportCsv} aria-label="Export CSV">
                <FileDownloadRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Menu anchorEl={colMenu} open={!!colMenu} onClose={() => setColMenu(null)}>
            {columns.filter((c) => !c.alwaysVisible).map((c) => {
              const on = !hidden.includes(c.key);
              return (
                <MenuItem
                  key={c.key}
                  onClick={() =>
                    setHidden((prev) => (on ? [...prev, c.key] : prev.filter((k) => k !== c.key)))
                  }
                  sx={{ gap: 1 }}
                >
                  <Box sx={{ width: 18, display: 'grid', placeItems: 'center', color: 'var(--c-primary-600)' }}>
                    {on && <CheckRounded sx={{ fontSize: 16 }} />}
                  </Box>
                  <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{c.header}</ListItemText>
                </MenuItem>
              );
            })}
          </Menu>
          <Menu anchorEl={densityMenu} open={!!densityMenu} onClose={() => setDensityMenu(null)}>
            {DENSITY_ORDER.map((d) => (
              <MenuItem key={d} onClick={() => { setDensity(d); setDensityMenu(null); }} sx={{ gap: 1 }}>
                <Box sx={{ width: 18, display: 'grid', placeItems: 'center', color: 'var(--c-primary-600)' }}>
                  {density === d && <CheckRounded sx={{ fontSize: 16 }} />}
                </Box>
                <ListItemText primaryTypographyProps={{ fontSize: 13 }}>{DENSITY_LABEL[d]}</ListItemText>
              </MenuItem>
            ))}
          </Menu>
        </Box>
      )}

      {/* ── Bulk action bar — replaces the toolbar row visually when active ── */}
      {selectable && selected.size > 0 && (
        <Surface
          e={2}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, mb: 1,
            background: 'var(--c-primary-50)', borderColor: 'var(--c-primary-200)',
          }}
        >
          <Box sx={{ fontSize: 13, fontWeight: 500, color: 'var(--c-primary-900)' }}>
            {selected.size} selected
          </Box>
          <Box sx={{ display: 'flex', gap: 1, ml: 'auto', alignItems: 'center' }}>
            {bulkActions?.(selectedRows, () => setSelected(new Set()))}
            <Button size="small" onClick={() => setSelected(new Set())}>Clear</Button>
          </Box>
        </Surface>
      )}

      <Surface e={1} sx={{ overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto', maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <Box
              component="thead"
              sx={{
                position: 'sticky', top: 0, zIndex: 1,
                background: 'var(--c-surface-2)',
              }}
            >
              <Box component="tr">
                {selectable && (
                  <Box component="th" scope="col" sx={{ ...cellSx, width: 44, px: 1 }}>
                    <Checkbox
                      size="small"
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected && !allOnPageSelected}
                      onChange={toggleAllOnPage}
                      inputProps={{ 'aria-label': 'Select all rows on this page' }}
                    />
                  </Box>
                )}
                {visibleColumns.map((c) => {
                  const active = sortKey === c.key;
                  const sortable = !!c.sortValue;
                  const align = c.align ?? (c.numeric ? 'right' : 'left');
                  return (
                    <Box
                      component="th"
                      scope="col"
                      key={c.key}
                      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                      sx={{
                        ...cellSx,
                        width: c.width,
                        textAlign: align,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: '.05em',
                        textTransform: 'uppercase',
                        color: active ? 'var(--c-primary-700)' : 'var(--c-text-2)',
                        userSelect: 'none',
                      }}
                    >
                      <Box
                        component={sortable ? 'button' : 'span'}
                        type={sortable ? 'button' : undefined}
                        onClick={sortable ? () => toggleSort(c) : undefined}
                        sx={{
                          all: sortable ? 'unset' : undefined,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          flexDirection: align === 'right' ? 'row-reverse' : 'row',
                          cursor: sortable ? 'pointer' : 'default',
                          font: 'inherit',
                          color: 'inherit',
                          letterSpacing: 'inherit',
                          textTransform: 'inherit',
                          '&:hover': sortable ? { color: 'var(--c-primary-700)' } : undefined,
                        }}
                      >
                        {c.header}
                        {sortable && active && (
                          sortDir === 'asc'
                            ? <ArrowUpwardRounded sx={{ fontSize: 14 }} />
                            : <ArrowDownwardRounded sx={{ fontSize: 14 }} />
                        )}
                      </Box>
                    </Box>
                  );
                })}
                {rowActions && <Box component="th" scope="col" sx={{ ...cellSx, width: 1 }} aria-label="Actions" />}
              </Box>
            </Box>

            <Box component="tbody" ref={bodyRef} onKeyDown={onBodyKeyDown}>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <Box component="tr" key={i}>
                      {selectable && <Box component="td" sx={cellSx} />}
                      {visibleColumns.map((c) => (
                        <Box component="td" key={c.key} sx={cellSx}>
                          <SkeletonBlock w={c.numeric ? 56 : '70%'} h={12} />
                        </Box>
                      ))}
                      {rowActions && <Box component="td" sx={cellSx} />}
                    </Box>
                  ))
                : pageRows.map((row) => {
                    const id = getRowId(row);
                    const isSel = selected.has(id);
                    return (
                      <Box
                        component="tr"
                        key={id}
                        data-row
                        tabIndex={onRowClick ? 0 : -1}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        onKeyDown={
                          onRowClick
                            ? (e: React.KeyboardEvent) => {
                                if (e.key === 'Enter') { e.preventDefault(); onRowClick(row); }
                              }
                            : undefined
                        }
                        sx={{
                          cursor: onRowClick ? 'pointer' : 'default',
                          background: isSel ? 'var(--c-primary-50)' : 'transparent',
                          transition: 'background var(--t-fast) var(--ease)',
                          '&:hover': { background: isSel ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
                          '&:hover .dt-actions, &:focus-within .dt-actions': { opacity: 1, pointerEvents: 'auto' },
                        }}
                      >
                        {selectable && (
                          <Box component="td" sx={{ ...cellSx, px: 1 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <Checkbox
                              size="small"
                              checked={isSel}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id); else next.add(id);
                                  return next;
                                })
                              }
                              inputProps={{ 'aria-label': `Select row ${id}` }}
                            />
                          </Box>
                        )}
                        {visibleColumns.map((c) => (
                          <Box
                            component="td"
                            key={c.key}
                            sx={{
                              ...cellSx,
                              textAlign: c.align ?? (c.numeric ? 'right' : 'left'),
                              ...(c.numeric && {
                                fontFamily: 'var(--font-mono)',
                                fontVariantNumeric: 'tabular-nums',
                              }),
                            }}
                          >
                            {c.render(row)}
                          </Box>
                        ))}
                        {rowActions && (
                          <Box
                            component="td"
                            sx={{ ...cellSx, px: 1 }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <Box
                              className="dt-actions"
                              sx={{
                                display: 'flex', gap: 0.25, justifyContent: 'flex-end',
                                opacity: 0, pointerEvents: 'none',
                                transition: 'opacity 140ms var(--ease)',
                              }}
                            >
                              {rowActions(row)}
                            </Box>
                          </Box>
                        )}
                      </Box>
                    );
                  })}
            </Box>
          </Box>
        </Box>

        {!loading && sorted.length === 0 && <Box sx={{ p: 0 }}>{empty}</Box>}

        {/* ── Pagination — only when it earns its space ── */}
        {!loading && pageCount > 1 && (
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1,
              borderTop: '1px solid var(--c-divider)', background: 'var(--c-surface-2)',
            }}
          >
            <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', fontFamily: 'var(--font-mono)' }}>
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
            </Box>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', fontFamily: 'var(--font-mono)', px: 1 }}>
                {page + 1} / {pageCount}
              </Box>
              <Button size="small" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              <Box
                component="select"
                value={pageSize}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
                sx={{
                  ml: 1, height: 28, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)',
                  background: 'var(--c-surface)', color: 'var(--c-text-2)',
                  fontFamily: 'var(--font-ui)', fontSize: 12, px: 0.5,
                }}
              >
                {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </Box>
            </Box>
          </Box>
        )}
      </Surface>
    </Box>
  );
}
