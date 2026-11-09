// Run from multi_app_fe: node scripts/cf_erp_viewer_select_test.mjs
// The drawing viewer's selection (user, 2026-11-01): 2D picking (lib/dxfPick.ts), the 3D selection facts, scope toggle
// and pick lookup (lib/model3d.ts) on the real RDSO / truss models, the pan-zoom click (hooks/usePanZoom.ts), and in
// jsdom: a click on a plate fills the side panel's "Selected" section, Esc clears it before it closes the viewer.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const bundle = async (name, code, extra = {}) => {
  const out = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', ...extra });
  const file = resolve(cache, `${name}-${process.pid}.mjs`);
  await writeFile(file, out.outputFiles[0].text);
  try { return await import(pathToFileURL(file)); } finally { await unlink(file); }
};

let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };
const checkAsync = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack ?? e.message}`); } };
const near = (a, b, tol = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} is not ${b}`);

const L = await bundle('viewer-select-lib', `
  export * from './src/apps/cf_erp/lib/dxfView';
  export * from './src/apps/cf_erp/lib/dxfPick';
  export * from './src/apps/cf_erp/lib/model3d';
  export { toWorld, zoomAbout } from './src/apps/cf_erp/hooks/usePanZoom';
  export * from './src/apps/cf_erp/lib/standardLevels';
  export { levelView } from './src/apps/cf_erp/lib/drawingLevels';
`);

// ── DXF helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────
const pair = (code, value) => `${code}\n${value}\n`;
const ent = (type, layer, ...pairs) => pair(0, type) + pair(8, layer) + pairs.map(([c, v]) => pair(c, v)).join('');
const file = (entities, header = '') => `${pair(0, 'SECTION')}${pair(2, 'HEADER')}${header}${pair(0, 'ENDSEC')}${pair(0, 'SECTION')}${pair(2, 'ENTITIES')}${entities}${pair(0, 'ENDSEC')}${pair(0, 'EOF')}`;
const line = (layer, x0, y0, x1, y1) => ent('LINE', layer, [10, x0], [20, y0], [11, x1], [21, y1]);
// A 400 × 200 plate drawn as four loose LINEs (in shuffled order, one reversed), two Ø22 holes, a 60 × 40 slot, its mark inside, a dimension.
const plateDxf = file(
  line('OUTLINE', 400, 0, 400, 200) + line('OUTLINE', 0, 0, 400, 0) + line('OUTLINE', 0, 200, 0, 0) + line('OUTLINE', 400, 200, 0, 200)
  + ent('CIRCLE', 'HOLES', [10, 100], [20, 100], [40, 11]) + ent('CIRCLE', 'HOLES', [10, 300], [20, 100], [40, 11])
  + ent('LWPOLYLINE', 'CUTOUT', [90, 4], [70, 1], [10, 170], [20, 80], [10, 230], [20, 80], [10, 230], [20, 120], [10, 170], [20, 120])
  + ent('TEXT', 'NOTES', [10, 150], [20, 30], [40, 12], [1, 'GP-7'])
  + line('DIM', 0, -30, 400, -30),
);

// ── 1. 2D picking ────────────────────────────────────────────────────────────────────────────────────────────────────
check('an SVG arc (y up, sweep 1 = counter-clockwise) flattens through the right side: the semicircle 0,0 → 10,0 dips to y = -5', () => {
  const { pts, cx, cy } = L.arcPoints([0, 0], 5, 0, 1, [10, 0]);
  near(cx, 5, 1e-9); near(cy, 0, 1e-9);
  near(Math.min(...pts.map((p) => p[1])), -5, 0.05, 'bottom');
  assert.deepEqual(pts.at(-1), [10, 0]);
  const cw = L.arcPoints([0, 0], 5, 0, 0, [10, 0]);
  assert.ok(Math.max(...cw.pts.map((p) => p[1])) > 4.9, 'clockwise goes over the top');
});

check('a layer path reads back into subpaths; a CIRCLE is known as a circle with its centre and radius', () => {
  const v = L.parseDxf(plateDxf);
  const shapes = L.shapesOf(v);
  const circles = shapes.filter((s) => s.circle);
  assert.equal(circles.length, 2);
  near(circles[0].circle.r, 11, 1e-6); near(circles[0].circle.cx, 100, 1e-6); near(circles[0].circle.cy, 100, 1e-6);
  near(circles[0].area, Math.PI * 121, 2, 'area of a flattened Ø22');
});

check('four loose LINEs that meet end to end (any order, either way round) chain into ONE closed outline; dimension layers are not picked', () => {
  const shapes = L.shapesOf(L.parseDxf(plateDxf));
  const outline = shapes.filter((s) => s.layer === 'OUTLINE');
  assert.equal(outline.length, 1);
  assert.equal(outline[0].closed, true);
  near(outline[0].area, 80000, 1e-6);
  assert.equal(shapes.filter((s) => s.layer === 'DIM').length, 0);
});

check('chainLoops leaves pieces that do not close as they were', () => {
  const r = L.chainLoops([[[0, 0], [10, 0]], [[10, 0], [10, 10]], [[50, 50], [60, 60]]], 0.01);
  assert.equal(r.loops.length, 0); assert.equal(r.rest.length, 3);
  const sq = L.chainLoops([[[0, 0], [10, 0]], [[10, 10], [10, 0]], [[0, 10], [10, 10]], [[0, 0], [0, 10]]], 0.01);
  assert.equal(sq.loops.length, 1); assert.equal(sq.loops[0].length, 4);
});

check('a click picks the smallest closed shape around it (a hole before its plate), a line within the tolerance before that, nothing outside', () => {
  const shapes = L.shapesOf(L.parseDxf(plateDxf));
  const at = (x, y, tol = 2) => { const i = L.pickShape(shapes, x, y, tol); return i < 0 ? null : shapes[i]; };
  assert.equal(at(100, 100).layer, 'HOLES');
  assert.equal(at(200, 100).layer, 'CUTOUT');
  assert.equal(at(50, 170).layer, 'OUTLINE');
  assert.equal(at(111.5, 100).layer, 'HOLES', 'on the hole edge');
  assert.equal(at(400.5, 100).layer, 'OUTLINE', 'just outside the plate edge, within the tolerance');
  assert.equal(at(500, 500), null);
  assert.equal(L.pickShape(shapes, 100, 100, 2, (s) => s.layer === 'HOLES') >= 0 && shapes[L.pickShape(shapes, 100, 100, 2, (s) => s.layer === 'HOLES')].layer, 'OUTLINE', 'a hidden layer is skipped');
});

check("a plate's facts: layer, size, area, the holes by diameter, the cut-out and the mark inside it", () => {
  const v = L.parseDxf(plateDxf);
  const shapes = L.shapesOf(v);
  const f = L.shapeFacts(v, shapes, L.pickShape(shapes, 50, 170, 1));
  assert.equal(f.layer, 'OUTLINE'); assert.equal(f.kind, 'outline');
  near(f.lengthMm, 400); near(f.widthMm, 200); near(f.areaMm2, 80000); near(f.pathMm, 1200);
  assert.deepEqual(f.holes, [{ d: 22, n: 2 }]); assert.equal(f.holeCount, 2);
  assert.equal(f.cutouts, 1);
  assert.equal(f.text, 'GP-7');
  const h = L.shapeFacts(v, shapes, L.pickShape(shapes, 100, 100, 1));
  assert.equal(h.kind, 'circle'); near(h.diameterMm, 22, 1e-6); assert.equal(h.holeCount, 0);
});

check('facts are in mm whatever the file unit ($INSUNITS 5 = cm)', () => {
  const v = L.parseDxf(file(ent('LWPOLYLINE', 'OUTLINE', [90, 4], [70, 1], [10, 0], [20, 0], [10, 40], [20, 0], [10, 40], [20, 20], [10, 0], [20, 20]), pair(9, '$INSUNITS') + pair(70, 5)));
  const shapes = L.shapesOf(v);
  const f = L.shapeFacts(v, shapes, 0);
  near(f.lengthMm, 400); near(f.widthMm, 200); near(f.areaMm2, 80000);
});

check('the highlight path follows the shape', () => {
  assert.equal(L.shapePath({ pts: [[0, 0], [1, 0], [1, 1]], closed: true }), 'M0 0L1 0L1 1Z');
  assert.equal(L.shapePath({ pts: [[0, 0], [1, 0]], closed: false }), 'M0 0L1 0');
});

check('the pan-zoom click turns a screen point into the world point (y up), the inverse of the view matrix', () => {
  const v = { s: 2, tx: 100, ty: 500 };
  const [x, y] = L.toWorld(v, 300, 300);
  near(x, 100); near(y, 100);
  near(v.s * x + v.tx, 300); near(-v.s * y + v.ty, 300);
});

check("a plate part's 3D shape read from its own DXF: the outline from its corner, the holes and the slot inside as rings", () => {
  const p = L.partOfView(L.parseDxf(plateDxf), 'GP-7', 12);
  assert.equal(p.label, 'GP-7'); assert.equal(p.thicknessMm, 12);
  near(p.lengthMm, 400); near(p.widthMm, 200);
  assert.equal(p.rings.length, 4, 'outline + 2 holes + slot');
  assert.ok(p.rings[0].every(([x, y]) => x >= -1e-9 && y >= -1e-9 && x <= 400 + 1e-9 && y <= 200 + 1e-9));
  assert.equal(L.partOfView(L.parseDxf(file(line('L', 0, 0, 10, 0))), 'x', 10), null, 'no closed outline, no part');
});

// A standard: span (the sheet) › girder G1 (its DXF) › two plates (one with a DXF, one without), and a catalog bolt.
const std = {
  id: 7, number: 'RDSO-1', tree: [
    { key: 'r1', rowId: 11, parentKey: null, depth: 0, lineNo: null, role: null, name: 'Span', kind: 'row', definition: null, quantity: 1, total: 1, mark: null, values: [], fileId: null },
    { key: 'r2', rowId: 12, parentKey: 'r1', depth: 1, lineNo: 1, role: 'Girder', name: 'Girder', kind: 'row', definition: null, quantity: 2, total: 2, mark: 'G1', values: [], fileId: 502 },
    { key: 'r3', rowId: 13, parentKey: 'r2', depth: 2, lineNo: 1, role: 'Top flange', name: 'Plate', kind: 'row', definition: null, quantity: 1, total: 2, mark: 'TF1', values: [{ code: 'THICKNESS', text: '32' }, { code: 'LENGTH', text: '7925' }, { code: 'WIDTH', text: '480' }], fileId: 501 },
    { key: 'r4', rowId: 14, parentKey: 'r2', depth: 2, lineNo: 2, role: 'Stiffener', name: 'Plate', kind: 'row', definition: null, quantity: 4, total: 8, mark: 'IS1', values: [{ code: 'THICKNESS', text: '16' }], fileId: null },
    { key: 'c1', rowId: null, parentKey: 'r2', depth: 2, lineNo: 3, role: 'Bolt', name: 'M22 bolt', kind: 'catalog', definition: null, quantity: 40, total: 80, mark: null, values: [], fileId: null },
  ],
  files: [
    { id: 500, kind: 'source', mark: null, fileName: 'RDSO-1.pdf', fileKind: 'pdf', lengthMm: null, widthMm: null, areaMm2: null, holes: null, drawingId: 9 },
    { id: 501, kind: 'part', mark: 'TF1', fileName: 'TF1_32mm.dxf', fileKind: 'dxf', lengthMm: 7925, widthMm: 480, areaMm2: 3804000, holes: 48, drawingId: null },
    { id: 502, kind: 'part', mark: 'G1', fileName: 'G1.dxf', fileKind: 'dxf', lengthMm: null, widthMm: null, areaMm2: null, holes: null, drawingId: null },
  ],
};

check("a standard's version tree becomes the viewer's levels: parents, marks, files; the top row gets the sheet", () => {
  const lv = L.standardLevels(std);
  const rows = lv.tree.rows;
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.map((r) => r.parentId), [null, 1, 2, 2, 2]);
  assert.equal(rows[0].drawingId, 500, 'the sheet on the top row'); assert.equal(rows[0].fileKind, 'pdf');
  assert.equal(rows[2].drawingId, 501); assert.equal(rows[2].isPlatePart, true); assert.equal(rows[2].mark, 'TF1');
  assert.equal(rows[3].hasDrawing, false); assert.equal(rows[4].hasDrawing, false);
  assert.equal(L.rowOfFile(lv, 501), 3); assert.equal(L.rowOfFile(lv, 500), 1); assert.equal(L.rowOfFile(lv, 999), null);
});

check('the levels walk like an order line\'s: a plate with no DXF shows its girder\'s drawing, the crumbs carry the marks the 3D view lights', () => {
  const lv = L.standardLevels(std);
  const v = L.levelView(lv.tree, 4);
  assert.equal(v.inherited, true); assert.equal(v.shown.mark, 'G1');
  assert.deepEqual(v.crumbs.map((c) => c.mark), [null, 'G1', 'IS1']);
  const g = L.levelView(lv.tree, 2);
  assert.deepEqual(g.parts.map((r) => r.mark ?? r.name), ['TF1', 'IS1', 'M22 bolt']);
});

check("a file's rows carry their size and thickness (a plate part's 3D thickness)", () => {
  const r = L.rowsOfFile(L.standardLevels(std), 501);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].code, r[0].thicknessMm, r[0].lengthMm, r[0].widthMm, r[0].pieces, r[0].isPlatePart], ['TF1', 32, 7925, 480, 2, true]);
});

// ── 2. 3D selection ──────────────────────────────────────────────────────────────────────────────────────────────────
check('ownerAt finds the element of a picked vertex by binary search, empty runs included', () => {
  const owner = [{ start: 0, count: 36 }, { start: 36, count: 0 }, { start: 36, count: 108 }, { start: 144, count: 12 }];
  assert.equal(L.ownerAt(owner, 0), 0); assert.equal(L.ownerAt(owner, 35), 0);
  assert.equal(L.ownerAt(owner, 36), 2); assert.equal(L.ownerAt(owner, 143), 2);
  assert.equal(L.ownerAt(owner, 150), 3); assert.equal(L.ownerAt(owner, 156), -1); assert.equal(L.ownerAt([], 3), -1);
});

check('the scope toggle: "Just this part" is the selection when there is one, else the plate part\'s DXF; a level and the whole structure when there is a model', () => {
  const vals = (o) => L.scopeChoices(o).map((c) => `${c.value}:${c.label}`);
  assert.deepEqual(vals({ hasModel: true, hasPart: true, lit: 'V2', selected: false }), ['part:Just this part', 'level:Just this level', 'whole:Whole structure']);
  assert.deepEqual(vals({ hasModel: true, hasPart: true, lit: 'V2', selected: true }), ['selection:Just this part', 'level:Just this level', 'whole:Whole structure']);
  assert.deepEqual(vals({ hasModel: true, hasPart: false, lit: null, selected: false }), ['whole:Whole structure']);
  assert.deepEqual(vals({ hasModel: false, hasPart: true, lit: null, selected: false }), ['part:Just this part']);
});

check('the scope falls back when its choice goes: no selection → whole structure; the part view becomes the selection', () => {
  const o = { hasModel: true, hasPart: true, lit: 'V2', selected: false };
  assert.equal(L.settleScope('selection', o), 'whole');
  assert.equal(L.settleScope('level', o), 'level');
  assert.equal(L.settleScope('part', { ...o, selected: true }), 'selection');
  assert.equal(L.settleScope('level', { ...o, lit: null }), 'whole');
  assert.equal(L.settleScope('whole', { hasModel: false, hasPart: true, lit: null, selected: false }), 'part');
});

check('what each scope shows (and so what a click can pick)', () => {
  const e = { id: 'a', mark: 'V2', in: ['MTA'] }; const sel = new Set([5]);
  assert.equal(L.shownIn('whole', e, 0, null, sel), true);
  assert.equal(L.shownIn('level', e, 0, 'MTA', sel), true);
  assert.equal(L.shownIn('level', e, 0, 'MTB', sel), false);
  assert.equal(L.shownIn('level', e, 5, 'MTB', sel), true, 'a selected piece stays shown in its level view');
  assert.equal(L.shownIn('selection', e, 0, 'MTA', sel), false);
  assert.equal(L.shownIn('selection', e, 5, null, sel), true);
});

const modelOf = async (set) => {
  const p = resolve('..', 'drawing_bom', 'out', set, 'model3d.json');
  return existsSync(p) ? JSON.parse(await readFile(p, 'utf8')) : null;
};
const rdso = await modelOf('RDSO_11751R3');
const truss = await modelOf('TCPL_TRUSS_75M');

check('RDSO 11751R3: a picked flange plate says its label, mark, code, kind, size, levels and holes; "all of this mark" selects every TF1', () => {
  if (!rdso) { console.log('  (skipped: drawing_bom/out/RDSO_11751R3/model3d.json not here)'); return; }
  const i = rdso.elements.findIndex((e) => e.mark === 'TF1' && e.plate?.holes?.length);
  const f = L.selectionFacts(rdso, i, false, { TF1: '11751-TF1' });
  assert.equal(f.mark, 'TF1'); assert.equal(f.code, '11751-TF1'); assert.equal(f.kind, 'Shaped plate');
  assert.match(f.label, /TF1/); assert.match(f.size, /× 32 mm \(shaped\)$/);
  assert.deepEqual(f.levels, rdso.elements[i].in);
  assert.equal(f.holeCount, rdso.elements[i].plate.holes.length);
  assert.equal(f.holes.reduce((a, h) => a + h.n, 0), f.holeCount);
  assert.deepEqual(f.indices, [i]);
  const all = L.selectionFacts(rdso, i, true);
  const tf1 = rdso.elements.filter((e) => e.mark === 'TF1').length;
  assert.equal(all.indices.length, tf1); assert.equal(all.sameMark, tf1); assert.equal(all.code, null, 'no codes → no code');
  assert.ok(all.indices.every((k) => rdso.elements[k].mark === 'TF1'));
});

check('the truss model: every element is described (kind and size), members by their section', () => {
  if (!truss) { console.log('  (skipped: drawing_bom/out/TCPL_TRUSS_75M/model3d.json not here)'); return; }
  for (let i = 0; i < truss.elements.length; i++) {
    const f = L.selectionFacts(truss, i, false);
    assert.ok(f.kind && f.size, `element ${i}`);
  }
  const m = truss.elements.findIndex((e) => e.member);
  assert.match(L.selectionFacts(truss, m, false).kind, /^Member/);
  assert.equal(L.selectionFacts(truss, truss.elements.length + 5, false), null);
});

check('the codes are looked up by the normalised mark', () => {
  const model = { elements: [{ id: 'x', mark: 'v13 tf' }] };
  assert.equal(L.selectionFacts(model, 0, false, { 'V13-TF': 'G1-V13-TF' }).code, 'G1-V13-TF');
  assert.match(L.GESTURES_3D, /Ctrl \/ Shift \+ drag/); assert.match(L.GESTURES_3D, /double-click/);
});

// ── 3. the viewer in jsdom: click → Selected panel, Esc ──────────────────────────────────────────────────────────────
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'File', 'FileReader', 'Blob', 'HTMLInputElement', 'SVGElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
URL.createObjectURL = () => 'blob:test/0';
URL.revokeObjectURL = () => {};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
globalThis.__apiFetch = async (path) => {
  if (path.includes('/model3d')) throw new Error('no model');
  if (path.includes('/file')) return new Blob([plateDxf], { type: 'application/dxf' });
  throw new Error('not here');
};
const m = await bundle('viewer-select-dom', "export { DrawingViewer } from './src/apps/cf_erp/components/Drawings/DrawingViewer';", {
  alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
  plugins: [{ name: 'stub-core', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (x) => ({ path: x.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (x) => ({ loader: 'js', resolveDir: process.cwd(), contents: x.path.endsWith('client') ? 'export async function apiFetch(path, opts) { return globalThis.__apiFetch(path, opts); }' : 'export const useAuth = () => ({ user: null });' }));
  } }],
});
const act = (fn) => React.act(fn);
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const root = createRoot(document.getElementById('app'));
const q = (sel) => document.querySelector(sel);
const ev = (el, type, init = {}) => act(async () => {
  const E = type.startsWith('key') ? dom.window.KeyboardEvent : dom.window.MouseEvent;
  el.dispatchEvent(new E(type, { bubbles: true, cancelable: true, ...init }));
});
const matrix = () => q('[data-testid="viewer-content"]').getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].split(' ').map(Number);
const screenOf = (x, y) => { const [s, , , , tx, ty] = matrix(); return { clientX: s * x + tx, clientY: -s * y + ty }; };
const click = async (x, y) => { const vp = q('[data-testid="viewer-viewport"]'); const p = screenOf(x, y); await ev(vp, 'pointerdown', { button: 0, ...p }); await ev(vp, 'pointerup', { button: 0, ...p }); };
let closed = 0;
const drawing = { id: 77, mark: 'GP-7', fileName: 'GP-7.dxf', fileKind: 'dxf' };
await act(() => root.render(React.createElement(m.DrawingViewer, { orderId: 1, lineId: 5, drawing, onClose: () => { closed++; } })));
// The model read fails here and is retried, so the file of an assembly waits out MODEL_WAIT_MS.
await act(async () => { await new Promise((r) => setTimeout(r, 2100)); });
await flush();

await checkAsync('2D: a click inside the plate selects it — highlighted, and the side panel says what it is above the drawing facts', async () => {
  assert.ok(q('[data-testid="viewer-viewport"]'), 'the drawing is drawn');
  assert.equal(q('[data-testid="viewer-selected"]'), null);
  await click(50, 170);
  const sec = q('[data-testid="viewer-selected"]');
  assert.ok(sec, 'Selected section');
  const t = sec.textContent;
  assert.match(t, /Selected/); assert.match(t, /GP-7/); assert.match(t, /Closed outline/); assert.match(t, /OUTLINE/);
  assert.match(t, /400 × 200 mm/); assert.match(t, /2 · 2 × Ø22/); assert.match(t, /Cut-outs inside1/);
  const strip = q('[data-testid="viewer-strip"]');
  assert.equal(strip.firstElementChild, sec, 'Selected is at the top of the panel');
  assert.ok(strip.textContent.includes('Layers'), 'the layers stay');
  assert.ok(q('[data-testid="viewer-selected-shape"]'), 'the shape is highlighted');
});

await checkAsync('2D: a click in a hole selects the hole; a drag pans and selects nothing new', async () => {
  await click(300, 100);
  assert.match(q('[data-testid="viewer-selected"]').textContent, /Circle Ø22/);
  const before = matrix();
  const vp = q('[data-testid="viewer-viewport"]');
  await ev(vp, 'pointerdown', { button: 0, clientX: 100, clientY: 100, ctrlKey: true });
  await ev(vp, 'pointermove', { clientX: 150, clientY: 120, ctrlKey: true });
  await ev(vp, 'pointerup', { button: 0, clientX: 150, clientY: 120, ctrlKey: true });
  near(matrix()[4], before[4] + 50, 1e-9, 'Ctrl + drag pans');
  assert.match(q('[data-testid="viewer-selected"]').textContent, /Circle Ø22/, 'still the hole');
});

await checkAsync('2D: Esc clears the selection first and the viewer stays open; a click on empty space clears it too', async () => {
  await press('Escape');
  assert.equal(q('[data-testid="viewer-selected"]'), null);
  assert.equal(closed, 0, 'not closed');
  await click(50, 170);
  assert.ok(q('[data-testid="viewer-selected"]'));
  await click(900, 900);
  assert.equal(q('[data-testid="viewer-selected"]'), null);
  await press('Escape');
  assert.equal(closed, 1, 'a second Esc with nothing selected closes');
});

await checkAsync("a standard's part opens in the same tool: on 3D first when its line has the model (no file read), 2D on a click — levels, its file from the standard's route, its rows and facts", async () => {
  const seen = [];
  globalThis.__apiFetch = async (path) => {
    seen.push(path);
    if (path.includes('/model3d')) return { fileId: 1, fileName: 'm.json', model: { schema: 'cf-erp-model3d/1', units: 'mm', elements: [{ id: 'e1', mark: 'TF1', in: ['G1'], box: { c: [0, 0, 0], size: [10, 10, 10] } }] }, codes: {} };
    if (path.includes('/standard-drawings/files/')) return new Blob([plateDxf], { type: 'application/dxf' });
    throw new Error(`not here ${path}`);
  };
  const S = await bundle('std-viewer-dom', "export { StandardDrawingViewer } from './src/apps/cf_erp/components/Drawings/StandardDrawingViewer';", {
    alias: { '@shared/ui': resolve('src/shared/ui/SheetGrid.tsx') },
    plugins: [{ name: 'stub-core', setup(b) {
      b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (x) => ({ path: x.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (x) => ({ loader: 'js', resolveDir: process.cwd(), contents: x.path.endsWith('client') ? 'export async function apiFetch(path, opts) { return globalThis.__apiFetch(path, opts); }' : 'export const useAuth = () => ({ user: null });' }));
      // No WebGL in jsdom: the 3D view is a marker here.
      b.onResolve({ filter: /\/Model3DView$/ }, (x) => ({ path: x.path, namespace: 'stub3d' }));
      b.onLoad({ filter: /.*/, namespace: 'stub3d' }, () => ({ loader: 'js', resolveDir: process.cwd(), contents: 'import { createElement } from "react"; export default function Model3DView() { return createElement("div", { "data-testid": "model3d-stub" }); }' }));
    } }],
  });
  const detail = { ...std, drawing: { id: 9, code: null, number: 'RDSO-1', revision: 'C', title: null, url: null, status: 'issued' }, lines: [{ id: 33, lineNo: 1, orderId: 4, orderCode: 'SO1', orderStatus: 'open', versionNo: 1 }], versions: [], version: null };
  await act(() => root.render(React.createElement(S.StandardDrawingViewer, { standard: detail, file: std.files[1], onClose: () => {} })));
  await flush();
  assert.ok(seen.some((x) => x.endsWith('/orders/4/lines/33/model3d')), 'the model through the line made from it');
  // The one JSON is there: 3D first, and the part's file is not read until 2D is asked for (user, 2026-11-09).
  assert.equal(q('[data-testid="viewer-3d-toggle"]').getAttribute('aria-pressed'), 'true', 'opens on 3D');
  await flush();
  assert.ok(q('[data-testid="model3d-stub"]'), 'the 3D view is shown');
  assert.ok(!seen.some((x) => x.endsWith('/standard-drawings/files/501')), 'no file read in 3D');
  await act(async () => { q('[data-testid="viewer-3d-toggle"]').click(); });
  await flush();
  assert.equal(q('[data-testid="viewer-3d-toggle"]').getAttribute('aria-pressed'), 'false', '2D on the click');
  assert.ok(seen.some((x) => x.endsWith('/standard-drawings/files/501')), 'the file from the standard, read now');
  const crumbs = [...document.querySelectorAll('[data-testid="viewer-crumb"]')].map((b) => b.textContent);
  assert.deepEqual(crumbs, ['Span', 'Girder G1', 'Plate TF1']);
  assert.ok(q('[data-testid="viewer-3d-toggle"]'), 'the 3D switch');
  assert.match(q('[data-testid="viewer-strip"]').textContent, /RowsTF1/);
  assert.match(q('[data-testid="viewer-facts"]').textContent, /7,925 × 480 mm/);
  // Step up to the girder: its own file is fetched, and its parts are listed.
  await act(async () => { [...document.querySelectorAll('[data-testid="viewer-crumb"]')][1].click(); });
  await flush();
  assert.ok(seen.some((x) => x.endsWith('/standard-drawings/files/502')));
  assert.deepEqual([...document.querySelectorAll('[data-testid="viewer-part"]')].map((b) => b.disabled), [false, true, true], 'TF1 has a drawing; IS1 and the bolt do not');
  await act(() => root.render(null));
});

async function press(key) { await ev(q('[role="dialog"]'), 'keydown', { key }); }

await act(() => root.render(null));
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
