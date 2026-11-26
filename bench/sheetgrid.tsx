/* eslint-disable react-refresh/only-export-components -- a bench page, not part of the app */
/*
 * A local bench for the shared SheetGrid (not part of the app build): a BOM-like strip grid — 278 rows of a tree, about
 * 17 cells each, row headers with a chip, a tooltip and buttons as the order page's Structure grid has — and three
 * timings: the first draw, a click on a cell (selection), and one value changing (a streamed part arriving).
 *   npx vite build --config bench/vite.bench.config.mjs && npx vite preview --config bench/vite.bench.config.mjs
 *   → http://127.0.0.1:5192/bench/sheetgrid.html?rows=278[&v=old]   (window.__bench holds the numbers)
 * v=old: the grid as it was, copied to bench/OldSheetGrid.tsx (not committed) to compare.
 */
import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import { SheetGrid as NewGrid } from '../src/shared/ui/SheetGrid';
import { createRoot } from 'react-dom/client';
import { Chip, IconButton, Tooltip } from '@mui/material';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import type { SheetCell, SheetRow } from '../src/shared/ui/SheetGrid';

const q = new URLSearchParams(location.search);
const which = q.get('v') ?? 'new';
const N = Number(q.get('rows') ?? 278);
const plainHead = q.get('h') === 'plain';
const olds = import.meta.glob('./OldSheetGrid.tsx', { eager: true }) as Record<string, { SheetGrid: typeof NewGrid }>;
const Grid = which === 'old' && olds['./OldSheetGrid.tsx'] ? olds['./OldSheetGrid.tsx'].SheetGrid : NewGrid;

type W = Window & { __bench?: Record<string, unknown> };
const w = window as W;
const out: Record<string, unknown> = { v: which, rows: N };
w.__bench = out;
const blocks: [number, number][] = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) blocks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch { /* no longtask API */ }

const COLS = ['QTY', 'CUT_FROM', 'MARK', 'GRADE', 'IMPACT', 'HOLED', 'THK', 'WIDTH', 'LENGTH', 'SHIP', 'AREA', 'WT', 'FLOW', 'SPAN', 'NOTE', 'PAINT', 'TEST'];
const columns = COLS.map((k) => ({ key: k, header: k, label: k, short: k.toLowerCase(), stripWidth: 96 }));
// a tree: 6 assemblies of 45 parts, every part its own row (strip cells: parts all 17, assemblies 4)
const shape = Array.from({ length: N }, (_, i) => ({ key: `r${i}`, depth: i % 46 === 0 ? 1 : 2, asm: i % 46 === 0 }));

function Bench() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const rows: SheetRow[] = shape.map((s, i) => ({
    key: s.key, depth: s.depth, label: `Row ${i}`, collapsible: s.asm, collapsed: false,
    lead: plainHead ? null : <IconButton size="small" aria-label="Move"><DragIndicatorRounded fontSize="small" /></IconButton>,
    header: plainHead ? `Part P${i}` : <span><b>{s.asm ? `Assembly ${i}` : `Part P${i}`}</b> <Tooltip title={`The row's code RDSO-B-17186-${i}`}><Chip size="small" label={`TRS1-${i}`} /></Tooltip></span>,
    trail: plainHead ? null : <><Chip size="small" color="warning" label="No flow" /><IconButton size="small" aria-label="More"><MoreVertRounded fontSize="small" /></IconButton></>,
  }));
  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const v = vals[`${rowKey}:${colKey}`];
    const i = Number(rowKey.slice(1));
    if (colKey === 'SPAN' && i % 2 === 0) return { text: '', applies: false, why: 'Not a value of this row' };
    if (colKey === 'TEST' && i % 3 === 0) return { text: '', tone: 'blank' };
    if (colKey === 'PAINT') return { text: 'C5', editable: i % 2 === 1, tone: 'warning' };
    if (colKey === 'NOTE' && i % 4 === 1) return { text: 'tinted', editable: true, tint: '#dfd' };
    if (colKey === 'AREA' && i % 5 === 2) return { text: 'ink', ink: '#a00' };
    if (colKey === 'FLOW') return { text: 'Cut', editable: false };
    return { text: v ?? (colKey === 'GRADE' ? 'E250' : colKey === 'QTY' ? String(1 + (i % 4)) : colKey === 'NOTE' ? '' : `${(i * 37 + colKey.length * 11) % 900}`), editable: colKey !== 'WT', tone: colKey === 'WT' ? 'muted' : v ? 'strong' : 'normal', kind: colKey === 'GRADE' ? 'option' : 'text', options: colKey === 'GRADE' ? ['E250', 'E350', 'E410'] : undefined };
  };
  const rowColumns = useCallback((key: string) => (shape[Number(key.slice(1))].asm ? COLS.slice(0, 4) : COLS), []);
  w.__set = (k: string, v: string) => flushSync(() => setVals((x) => ({ ...x, [k]: v })));
  return (
      <Grid rows={rows} columns={columns} cellAt={cellAt} rowColumns={q.get('wide') ? undefined : rowColumns} onWrites={(ws) => setVals((x) => { const y = { ...x }; for (const s of ws) y[`${s.rowKey}:${s.colKey}`] = s.text; return y; })} ariaLabel="Bench grid" fillViewport />
  );
}
declare global { interface Window { __set?: (k: string, v: string) => void } }

async function run() {
  const t0 = performance.now();
  const root = createRoot(document.getElementById('root')!);
  flushSync(() => root.render(<Bench />));
  out.firstDraw = Math.round(performance.now() - t0);
  while (!document.querySelector('[data-cell="0:1"]')) await new Promise((r) => setTimeout(r, 5));

  out.nodes = document.getElementsByTagName('*').length;
  await new Promise((r) => setTimeout(r, 300));
  // a click on a cell in the middle (selection only)
  let t = performance.now();
  (document.querySelector(`[data-cell="${Math.floor(N / 2)}:3"]`) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0)); out.click = Math.round(performance.now() - t);
  await new Promise((r) => setTimeout(r, 300));
  // one value changes (as a streamed part arriving)
  t = performance.now();
  w.__set!('r5:THK', '12');
  out.update = Math.round(performance.now() - t);
  await new Promise((r) => setTimeout(r, 300));
  // a block selected: the anchor and a shift-click 3 rows down, 3 cells across
  (document.querySelector('[data-cell="2:2"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  (document.querySelector('[data-cell="5:5"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  await new Promise((r) => setTimeout(r, 300));
  out.blocks = blocks.map(([, d]) => Math.round(d)); out.done = true;
  document.title = `done ${JSON.stringify(out)}`;
}
void run();
