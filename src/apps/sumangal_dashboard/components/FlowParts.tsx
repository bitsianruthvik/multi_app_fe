import { useState, type ReactNode } from 'react';
import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { BarChart } from '@mui/x-charts/BarChart';
import { useChartPalette } from '@shared/ui';

/** Shared pieces of the By flow dashboard: stacked bars and an expandable table. */

/** Bars split into parts (for example pieces by stage, or by aging bucket). */
export function StackedBars({ labels, series, format, height = 280, horizontal = false }: {
  labels: string[];
  series: { label: string; data: number[]; color?: string }[];
  format: (v: number) => string;
  height?: number;
  horizontal?: boolean;
}) {
  const palette = useChartPalette();
  if (!labels.length) return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Nothing to show for these filters.</Typography>;
  const colors = series.map((s, i) => s.color || palette[i % palette.length]);
  const axis = { scaleType: 'band' as const, data: labels, tickLabelStyle: { fontSize: 11 } };
  return (
    <Box>
      <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
        {series.map((s, i) => (
          <Stack key={s.label} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: 0.5, background: colors[i] }} />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{s.label}</Typography>
          </Stack>
        ))}
      </Stack>
      <BarChart
        height={height}
        hideLegend
        layout={horizontal ? 'horizontal' : 'vertical'}
        borderRadius={2}
        grid={{ [horizontal ? 'vertical' : 'horizontal']: true }}
        margin={{ left: 4, right: 12, top: 10, bottom: 4 }}
        xAxis={horizontal ? [{ valueFormatter: (v: number | null) => format(v ?? 0), tickLabelStyle: { fontSize: 11 } }] : [axis]}
        yAxis={horizontal ? [{ scaleType: 'band', data: labels, width: 150, tickLabelStyle: { fontSize: 11 } }] : [{ valueFormatter: (v: number | null) => format(v ?? 0), width: 62, tickLabelStyle: { fontSize: 11 } }]}
        series={series.map((s, i) => ({ label: s.label, data: s.data, color: colors[i], stack: 'total', valueFormatter: (v: number | null) => (v == null ? '—' : format(v)) }))}
      />
    </Box>
  );
}

export interface TreeNode {
  key: string;
  /** The first cell: the name, indented by level. */
  label: ReactNode;
  /** The remaining cells, in the same order as the table's header. */
  cells: ReactNode[];
  children?: TreeNode[];
}

/** A table whose rows open to show the next level. Each level is indented; the first level starts closed. */
export function TreeTable({ head, rows, empty = 'Nothing for these filters.', openFirst = false }: {
  head: ReactNode[];
  rows: TreeNode[];
  empty?: string;
  openFirst?: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(openFirst ? rows.map((r) => r.key) : []));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  if (!rows.length) return <Typography sx={{ p: 2, fontSize: 13, color: 'var(--c-text-3)' }}>{empty}</Typography>;
  const renderRow = (n: TreeNode, depth: number): ReactNode[] => {
    const has = !!n.children?.length; const isOpen = open.has(n.key);
    const out: ReactNode[] = [
      <TableRow key={n.key} hover onClick={has ? () => toggle(n.key) : undefined} sx={{ cursor: has ? 'pointer' : 'default', '& td': { fontSize: 13 } }}>
        <TableCell sx={{ pl: 1.5 + depth * 2.5, whiteSpace: 'nowrap' }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {has ? (isOpen ? <ExpandMoreRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} /> : <ChevronRightRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} />) : <Box sx={{ width: 18 }} />}
            <Box component="span" sx={{ fontWeight: depth === 0 ? 600 : 400 }}>{n.label}</Box>
          </Stack>
        </TableCell>
        {n.cells.map((c, i) => <TableCell key={i} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c}</TableCell>)}
      </TableRow>,
    ];
    if (has && isOpen) for (const c of n.children || []) out.push(...renderRow(c, depth + 1));
    return out;
  };
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {head.map((h, i) => <TableCell key={i} align={i === 0 ? 'left' : 'right'} sx={{ fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>{h}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>{rows.flatMap((r) => renderRow(r, 0))}</TableBody>
      </Table>
    </TableContainer>
  );
}
