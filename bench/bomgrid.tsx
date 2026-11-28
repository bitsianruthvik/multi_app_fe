/* eslint-disable react-refresh/only-export-components -- a bench page, not part of the app */
/*
 * A local bench for the order BOM grid (BomGrid over the shared SheetGrid), not part of the app build: a synthetic order
 * line of ~2200 rows (20 assemblies × 10 sub-assemblies × 10 parts), 15 value columns, every row open, and timings for
 * the first draw, folding an assembly near the top, opening it again, a click on a cell and scrolling to the middle.
 *   npx vite build --config bench/vite.bench.config.mjs && npx vite preview --config bench/vite.bench.config.mjs
 *   → http://127.0.0.1:5192/bench/bomgrid.html[?a=20&s=10&p=10]   (window.__bench holds the numbers; the title says done)
 */
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { BomGrid } from '../src/apps/cf_erp/components/Bom/BomGrid';
import { flattenBom, NO_PENDING } from '../src/apps/cf_erp/components/Bom/bomModel';
import type { SheetGridHandle } from '../src/shared/ui/SheetGrid';
import type { StructureNode } from '../src/apps/cf_erp/api/types';
import type { ValuesView, ValuesColumn, ValuesRow } from '../src/apps/cf_erp/components/Values/valuesModel';

const q = new URLSearchParams(location.search);
const A = Number(q.get('a') ?? 20), S = Number(q.get('s') ?? 10), P = Number(q.get('p') ?? 10);
type W = Window & { __bench?: Record<string, unknown>; __open?: (key: string) => void; __grid?: { current: SheetGridHandle | null }; __writes?: unknown[] };
const w = window as W;
const out: Record<string, unknown> = { a: A, s: S, p: P };
w.__bench = out;

let nextId = 1;
const node = (name: string, depth: number, children: StructureNode[] = []): StructureNode => {
  const id = nextId++;
  return { key: `k${id}`, id, code: `C-${id}`, name, kind: 'temporary', status: 'draft', uom: 'nos', depth, quantity: 1 + (id % 3), total: 1 + (id % 3),
    lineId: depth ? id * 10 : null, lineNo: id, position: 1, role: null, selection: null, resolved: true, flow: null, bom: null, children };
};
const root = node('Order line', 0, Array.from({ length: A }, (_, a) => node(`Assembly ${a + 1}`, 1,
  Array.from({ length: S }, (_, s) => node(`Sub ${a + 1}.${s + 1}`, 2, Array.from({ length: P }, (_, p) => node(`Part ${a + 1}.${s + 1}.${p + 1}`, 3)))))));
const all: StructureNode[] = [];
const walk = (n: StructureNode) => { all.push(n); n.children.forEach(walk); };
walk(root);

const CODES = ['THICKNESS', 'LENGTH', 'WIDTH', 'GRADE', 'IMPACT', 'HOLES', 'MARK', 'AREA', 'WEIGHT', 'PAINT', 'SPAN', 'NOTE', 'TEST', 'FINISH', 'CAMBER'];
const columns: ValuesColumn[] = CODES.map((code) => ({ code, name: code.charAt(0) + code.slice(1).toLowerCase(), dataType: code === 'GRADE' ? 'option' : code === 'NOTE' || code === 'MARK' ? 'text' : 'number',
  unit: ['THICKNESS', 'LENGTH', 'WIDTH'].includes(code) ? 'mm' : null, decimals: null, rule: 'entered', required: false, options: code === 'GRADE' ? 'grades' : null, editable: true }));
const rows: ValuesRow[] = all.map((n) => ({ id: n.id, code: n.code, name: n.name, kind: n.kind, status: n.status, depth: n.depth, parent: null, places: 1, lineNo: n.lineNo, position: 1, quantity: n.quantity, missing: 0,
  cells: Object.fromEntries(CODES.filter((_, i) => n.depth === 3 || i % 3 === 0).map((code, i) => [code,
    code === 'WEIGHT' ? { display: String((n.id * 7) % 500), rule: 'calculated' as const, from: 'calculated' as const }
      : code === 'GRADE' ? { input: String(1 + (n.id % 3)) }
        : { input: i % 4 === 1 ? '' : String((n.id * 37 + i * 11) % 900), defaultDisplay: i % 4 === 1 ? '12' : undefined }])) }));
const view: ValuesView = {
  line: { id: 1, lineNo: 1, lineType: 'custom', quantity: 1 }, order: { id: 1, code: 'SO1', status: 'draft' } as ValuesView['order'], root: { id: root.id, code: root.code, name: root.name },
  editable: true, lock: null, truncated: false, counts: { rows: rows.length, own: rows.length, shared: 0, missingOwn: 0, missingShared: 0, rowsMissing: 0, unresolved: 0, noValues: 0 },
  optionLists: { grades: [{ id: 1, value: 'E250' }, { id: 2, value: 'E350' }, { id: 3, value: 'E410' }] as ValuesView['optionLists'][string] },
  groups: [{ key: 'g', own: true, classification: { id: null, code: null, name: 'All', path: '' }, columns, rows }],
};
const columnIds = all.map((n) => n.id);
const openAll = new Set(all.filter((n) => n.children.length).map((n) => n.key));

function Bench() {
  const [open, setOpen] = useState<Set<string>>(openAll);
  const [pending, setPending] = useState(NO_PENDING);
  const handle = useRef<SheetGridHandle>(null);
  w.__grid = handle;
  const bomRows = flattenBom(root, open);
  w.__open = (key) => flushSync(() => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; }));
  return <BomGrid handleRef={handle} rows={bomRows} columnIds={columnIds} recordIds={columnIds} view={view} pending={pending} busy={false} canEdit={() => true} canEditValues={() => true}
    onToggle={(key) => setOpen((o) => { const n = new Set(o); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
    onWrites={(ws) => (w.__writes ??= []).push(...ws.map((x) => ({ key: x.row.node.key, code: x.code, text: x.text }))) && setPending((p) => { const values = { ...p.values }; for (const x of ws) values[x.row.node.id] = { ...values[x.row.node.id], [x.code]: x.text }; return { ...p, values }; })}
    onMove={() => {}} dropRefusal={() => null} trailingCell={() => <button type="button">⋯</button>} flowCell={() => <span>Cut</span>} markOf={() => null}
    placeholderOf={(row) => ({ code: row.node.code ?? '', title: row.node.name })} />;
}

const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const timed = async (fn: () => void) => { const t = performance.now(); fn(); void document.body.offsetHeight; const sync = performance.now() - t; await frame(); return [Math.round(sync), Math.round(performance.now() - t)]; };

async function run() {
  const t0 = performance.now();
  const r = createRoot(document.getElementById('root')!);
  flushSync(() => r.render(<MemoryRouter><Bench /></MemoryRouter>));
  void document.body.offsetHeight;
  out.firstDraw = Math.round(performance.now() - t0);
  out.rowsDrawn = document.querySelectorAll('tbody tr[data-row]').length;
  out.nodes = document.getElementsByTagName('*').length;
  await new Promise((x) => setTimeout(x, 500));
  const asm = root.children[1].key; // the second assembly: 111 rows
  out.fold = await timed(() => w.__open!(asm));
  await new Promise((x) => setTimeout(x, 300));
  out.open = await timed(() => w.__open!(asm));
  await new Promise((x) => setTimeout(x, 300));
  const sub = root.children[0].children[0].key; // a sub-assembly near the top: 10 rows
  out.foldSmall = await timed(() => w.__open!(sub));
  await new Promise((x) => setTimeout(x, 300));
  out.openSmall = await timed(() => w.__open!(sub));
  await new Promise((x) => setTimeout(x, 300));
  const cell = document.querySelector('tbody td[data-col-key="LENGTH"]') as HTMLElement;
  out.click = await timed(() => cell.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await new Promise((x) => setTimeout(x, 300));
  const box = document.querySelector('[data-testid="sheet-grid-scroll"]') as HTMLElement;
  out.scroll = await timed(() => { box.scrollTop = box.scrollHeight / 2; box.dispatchEvent(new Event('scroll')); });
  await frame(); await frame();
  out.rowsDrawnMid = document.querySelectorAll('tbody tr[data-row]').length;
  out.scrollHeight = box.scrollHeight;
  out.done = true;
  document.title = `done ${JSON.stringify(out)}`;
}
void run();
