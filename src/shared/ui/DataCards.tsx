import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import type { DataColumn } from './DataTable';

/**
 * A DataTable's rows as cards, for phones (DESIGN_SYSTEM.md §3.6). Takes the
 * same column definitions as DataTable so a screen describes its columns once:
 * the first column is the card's title, every other visible column becomes a
 * label / value pair. Sortable columns can be sorted from a compact picker.
 * Rows come in steps ("Show more") rather than pages — thumbs scroll.
 */
const NAME_HEADER = /^(description|product|customer|vendor|item|name|report|machine)$/i;

export function DataCards<T>({
  rows, columns, getRowId, onRowClick, empty, defaultSortKey, defaultSortDir = 'asc', step = 25,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  getRowId: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  defaultSortKey?: string;
  defaultSortDir?: 'asc' | 'desc';
  step?: number;
}) {
  const visible = columns.filter((c) => !c.defaultHidden);
  const [title, ...rest] = visible;
  // A row that starts with a code reads better with its name right under it.
  const named = rest[0] && NAME_HEADER.test(rest[0].header) ? rest[0] : null;
  const fields = named ? rest.slice(1) : rest;
  const sortable = visible.filter((c) => c.sortValue);
  const [sortKey, setSortKey] = useState<string>(defaultSortKey ?? '');
  const [dir, setDir] = useState<'asc' | 'desc'>(defaultSortDir);
  const [shown, setShown] = useState(step);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const f = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = f(a); const y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return dir === 'asc' ? c : -c;
    });
  }, [rows, columns, sortKey, dir]);

  if (!rows.length) {
    return <Box sx={{ p: 3, textAlign: 'center', color: 'var(--c-text-3)', fontSize: 13 }}>{empty ?? 'Nothing to show.'}</Box>;
  }
  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{rows.length} rows</Typography>
        {sortable.length > 0 && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <TextField select size="small" value={sortKey} onChange={(e) => setSortKey(e.target.value)}
              SelectProps={{ displayEmpty: true }} sx={{ minWidth: 140, '& .MuiInputBase-input': { py: 0.6, fontSize: 13 } }}>
              <MenuItem value=""><em>Default order</em></MenuItem>
              {sortable.map((c) => <MenuItem key={c.key} value={c.key}>{c.header || c.key}</MenuItem>)}
            </TextField>
            <IconButton size="small" aria-label={dir === 'asc' ? 'Ascending' : 'Descending'} onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))} disabled={!sortKey}>
              {dir === 'asc' ? <ArrowUpwardRounded fontSize="small" /> : <ArrowDownwardRounded fontSize="small" />}
            </IconButton>
          </Stack>
        )}
      </Stack>
      {sorted.slice(0, shown).map((r) => (
        <Box key={getRowId(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
          role={onRowClick ? 'button' : undefined} tabIndex={onRowClick ? 0 : undefined}
          sx={{
            p: 1.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface)',
            cursor: onRowClick ? 'pointer' : 'default', '&:active': onRowClick ? { background: 'var(--c-surface-2)' } : undefined,
          }}>
          {title && <Box sx={{ fontSize: named ? 12 : 14, fontWeight: named ? 500 : 600, color: named ? 'var(--c-text-3)' : undefined, fontFamily: named ? 'var(--font-mono)' : undefined, mb: named ? 0.25 : fields.length ? 0.75 : 0, wordBreak: 'break-word' }}>{title.render(r)}</Box>}
          {named && <Box sx={{ fontSize: 14, fontWeight: 600, mb: fields.length ? 0.75 : 0, wordBreak: 'break-word' }}>{named.render(r)}</Box>}
          {fields.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 1.5, rowGap: 0.5 }}>
              {fields.map((c) => (
                <Box key={c.key} sx={{ minWidth: 0 }}>
                  {c.header && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', lineHeight: 1.3 }}>{c.header}</Typography>}
                  <Box sx={{
                    fontSize: 13, minWidth: 0, overflowWrap: 'anywhere',
                    ...(c.numeric && { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }),
                  }}>{c.render(r)}</Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
      {shown < sorted.length && (
        <Button variant="outlined" onClick={() => setShown((n) => n + step)} sx={{ textTransform: 'none' }}>
          Show more ({sorted.length - shown} left)
        </Button>
      )}
    </Box>
  );
}
