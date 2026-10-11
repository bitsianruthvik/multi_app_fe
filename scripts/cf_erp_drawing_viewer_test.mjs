// Run from multi_app_fe: node scripts/cf_erp_drawing_viewer_test.mjs
// CF_ERP drawing viewer: the pure DXF reader (lib/dxfView.ts), the pan/zoom rules (hooks/usePanZoom.ts, the HRMS org chart's),
// and the pop-up itself in jsdom — pan, wheel zoom about the cursor, Fit, full screen and Esc, layers, PDF, errors, the row icon.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readdir, readFile } from 'node:fs/promises';
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

// ── 1. the reader ────────────────────────────────────────────────────────────────────────────────────────────────────
const dx = await bundle('dxfview', "export * from './src/apps/cf_erp/lib/dxfView'; export * from './src/apps/cf_erp/hooks/usePanZoom';");

const pair = (code, value) => `${code}\n${value}\n`;
const ent = (type, layer, ...pairs) => pair(0, type) + pair(8, layer) + pairs.map(([c, v]) => pair(c, v)).join('');
const file = ({ entities = '', blocks = '', header = '' } = {}) =>
  `${pair(0, 'SECTION')}${pair(2, 'HEADER')}${header}${pair(0, 'ENDSEC')}${pair(0, 'SECTION')}${pair(2, 'BLOCKS')}${blocks}${pair(0, 'ENDSEC')}${pair(0, 'SECTION')}${pair(2, 'ENTITIES')}${entities}${pair(0, 'ENDSEC')}${pair(0, 'EOF')}`;
const block = (name, entities, base = [0, 0]) => pair(0, 'BLOCK') + pair(8, '0') + pair(2, name) + pair(70, 0) + pair(10, base[0]) + pair(20, base[1]) + pair(30, 0) + entities + pair(0, 'ENDBLK');
const line = (layer, x0, y0, x1, y1) => ent('LINE', layer, [10, x0], [20, y0], [11, x1], [21, y1]);
const layerOf = (v, name) => v.layers.find((l) => l.name === name);
const d1 = (text, name = 'L') => layerOf(dx.parseDxf(text), name).d;

check('LINE is one M/L pair on its layer, and bounds follow', () => {
  const v = dx.parseDxf(file({ entities: line('L', 0, 0, 10, 5) }));
  assert.equal(layerOf(v, 'L').d, 'M0 0L10 5');
  assert.deepEqual(v.bounds, { minX: 0, minY: 0, maxX: 10, maxY: 5 });
  assert.equal(v.entityCount, 1);
});

check('LWPOLYLINE: open stays open, closed ends in Z', () => {
  const pts = [[0, 0], [10, 0], [10, 5], [0, 5]].flatMap(([x, y]) => [[10, x], [20, y]]);
  assert.equal(d1(file({ entities: ent('LWPOLYLINE', 'L', [90, 4], [70, 0], ...pts) })), 'M0 0L10 0L10 5L0 5');
  assert.equal(d1(file({ entities: ent('LWPOLYLINE', 'L', [90, 4], [70, 1], ...pts) })), 'M0 0L10 0L10 5L0 5L0 0Z');
});

check('LWPOLYLINE bulge 1 is a counter-clockwise semicircle: one A command, bounds reach the bottom', () => {
  const v = dx.parseDxf(file({ entities: ent('LWPOLYLINE', 'L', [90, 2], [70, 0], [10, 0], [20, 0], [42, 1], [10, 10], [20, 0]) }));
  assert.equal(layerOf(v, 'L').d, 'M0 0A5 5 0 0 1 10 0');
  near(v.bounds.minY, -5, 1e-9, 'bottom of the semicircle');
});

check('a smaller bulge puts the centre on the right side: bulge 0.5 over a 10 chord is radius 6.25, small arc, passes y = -2.5', () => {
  const v = dx.parseDxf(file({ entities: ent('LWPOLYLINE', 'L', [90, 2], [70, 0], [10, 0], [20, 0], [42, 0.5], [10, 10], [20, 0]) }));
  assert.equal(layerOf(v, 'L').d, 'M0 0A6.25 6.25 0 0 1 10 0');
  near(v.bounds.minY, -2.5, 1e-2, 'sagitta');           // sampled, so a hair under
  const neg = dx.parseDxf(file({ entities: ent('LWPOLYLINE', 'L', [90, 2], [70, 0], [10, 0], [20, 0], [42, -0.5], [10, 10], [20, 0]) }));
  assert.equal(layerOf(neg, 'L').d, 'M0 0A6.25 6.25 0 0 0 10 0');
  assert.ok(neg.bounds.maxY > 2.4, 'a clockwise bulge goes up');
});

check('old-style POLYLINE with VERTEX records and a bulge', () => {
  const text = file({ entities: ent('POLYLINE', 'L', [70, 0]) + ent('VERTEX', 'L', [10, 0], [20, 0], [42, 1]) + ent('VERTEX', 'L', [10, 10], [20, 0]) + pair(0, 'SEQEND') });
  assert.equal(d1(text), 'M0 0A5 5 0 0 1 10 0');
});

check('ARC: counter-clockwise from start to end angle', () => {
  const v = dx.parseDxf(file({ entities: ent('ARC', 'L', [10, 0], [20, 0], [40, 10], [50, 0], [51, 90]) }));
  assert.equal(layerOf(v, 'L').d, 'M10 0A10 10 0 0 1 0 10');
  near(v.bounds.maxX, 10, 1e-9); near(v.bounds.maxY, 10, 1e-9); near(v.bounds.minX, 0, 1e-9);
});

check('an ARC over 180 degrees sets the large-arc flag', () => {
  assert.equal(d1(file({ entities: ent('ARC', 'L', [10, 0], [20, 0], [40, 10], [50, 0], [51, 270]) })), 'M10 0A10 10 0 1 1 0 -10');
});

check('CIRCLE is two arcs and closes; bounds are the circle', () => {
  const v = dx.parseDxf(file({ entities: ent('CIRCLE', 'L', [10, 5], [20, 5], [40, 2]) }));
  assert.equal(layerOf(v, 'L').d, 'M7 5A2 2 0 0 1 3 5A2 2 0 0 1 7 5Z');
  near(v.bounds.minX, 3, 1e-9); near(v.bounds.maxX, 7, 1e-9); near(v.bounds.minY, 3, 1e-9); near(v.bounds.maxY, 7, 1e-9);
});

check('ELLIPSE is flattened: closed, bounds are its two radii', () => {
  const v = dx.parseDxf(file({ entities: ent('ELLIPSE', 'L', [10, 0], [20, 0], [11, 10], [21, 0], [40, 0.5], [41, 0], [42, 6.283185307179586]) }));
  assert.ok(layerOf(v, 'L').d.endsWith('Z'));
  near(v.bounds.maxX, 10, 1e-6); near(v.bounds.minX, -10, 1e-6); near(v.bounds.maxY, 5, 1e-6); near(v.bounds.minY, -5, 1e-6);
});

check('SPLINE (cubic, clamped) is flattened from its control points: it starts and ends on them and passes (5, 7.5)', () => {
  const cps = [[0, 0], [0, 10], [10, 10], [10, 0]].flatMap(([x, y]) => [[10, x], [20, y]]);
  const text = file({ entities: ent('SPLINE', 'L', [70, 8], [71, 3], [72, 8], [73, 4], ...[0, 0, 0, 0, 1, 1, 1, 1].map((k) => [40, k]), ...cps) });
  const d = d1(text);
  assert.ok(d.startsWith('M0 0L'), d.slice(0, 20));
  assert.ok(d.endsWith('L10 0'), d.slice(-20));
  assert.ok(d.includes('L5 7.5L'), 'the curve passes its midpoint');
});

check('SPLINE with only fit points falls back to them', () => {
  const fits = [[0, 0], [5, 5], [10, 0]].flatMap(([x, y]) => [[11, x], [21, y]]);
  assert.equal(d1(file({ entities: ent('SPLINE', 'L', [70, 8], [71, 3], ...fits) })), 'M0 0L5 5L10 0');
});

check('INSERT: rotated 90 and scaled 2 at (10, 10)', () => {
  const text = file({ blocks: block('B', line('0', 0, 0, 1, 0)), entities: ent('INSERT', 'L', [2, 'B'], [10, 10], [20, 10], [41, 2], [42, 2], [50, 90]) });
  assert.equal(d1(text), 'M10 10L10 12');
});

check('INSERT mirrored (scale x -1) flips the line and reverses an arc: sweep flag 0', () => {
  const text = file({ blocks: block('B', line('0', 0, 0, 1, 0) + ent('ARC', '0', [10, 0], [20, 0], [40, 1], [50, 0], [51, 90])), entities: ent('INSERT', 'L', [2, 'B'], [10, 0], [20, 0], [41, -1]) });
  assert.equal(d1(text), 'M0 0L-1 0M-1 0A1 1 0 0 0 0 1');
});

check('INSERT with a base point and layer 0 inheritance: the block lands on the INSERT layer, base at the insertion point', () => {
  const text = file({ blocks: block('B', line('0', 5, 5, 6, 5), [5, 5]), entities: ent('INSERT', 'HOLES', [2, 'B'], [10, 10], [20, 10]) });
  const v = dx.parseDxf(text);
  assert.equal(layerOf(v, 'HOLES').d, 'M10 10L11 10');
  assert.equal(v.layers.length, 1);
});

check('nested INSERTs compose; an array INSERT places rows x columns', () => {
  const text = file({
    blocks: block('IN', line('0', 0, 0, 1, 0)) + block('OUT', ent('INSERT', '0', [2, 'IN'], [10, 2], [20, 0])),
    entities: ent('INSERT', 'L', [2, 'OUT'], [10, 100], [20, 0]) + ent('INSERT', 'A', [2, 'IN'], [10, 0], [20, 0], [70, 3], [71, 2], [44, 10], [45, 20]),
  });
  const v = dx.parseDxf(text);
  assert.equal(layerOf(v, 'L').d, 'M102 0L103 0');
  assert.equal(layerOf(v, 'A').count, 6);
  assert.equal(layerOf(v, 'A').d.split('M').length - 1, 6);
});

check('a non-uniform INSERT scale flattens an arc to lines (no A command)', () => {
  const text = file({ blocks: block('B', ent('ARC', '0', [10, 0], [20, 0], [40, 1], [50, 0], [51, 90])), entities: ent('INSERT', 'L', [2, 'B'], [41, 2], [42, 1]) });
  const d = d1(text);
  assert.ok(!d.includes('A') && d.includes('L'), d.slice(0, 40));
  assert.ok(d.startsWith('M2 0L'));
});

check('TEXT and MTEXT become upright text items: %%c is a diameter sign, \\P a new line', () => {
  const text = file({ entities: ent('TEXT', 'T', [10, 5], [20, 6], [40, 3], [1, '%%c22 HOLE'], [50, 30]) + ent('MTEXT', 'T', [10, 0], [20, 0], [40, 2], [1, '{\\fArial|b0;Line one}\\PLine two'], [71, 5]) });
  const t = layerOf(dx.parseDxf(text), 'T').texts;
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].x, t[0].y, t[0].h, t[0].rot, t[0].lines], [5, 6, 3, 30, ['Ø22 HOLE']]);
  assert.deepEqual(t[1].lines, ['Line one', 'Line two']);
  assert.equal(t[1].anchor, 'middle');
  assert.equal(dx.parseDxf(text).layers[0].role, 'text');
});

check('DIMENSION is drawn from its block', () => {
  const text = file({ blocks: block('*D1', line('0', 0, 0, 3, 0)), entities: ent('DIMENSION', 'DIM', [2, '*D1']) });
  assert.equal(d1(text, 'DIM'), 'M0 0L3 0');
});

check('layer names say what a layer is; a file with no telling names is drawn as outline', () => {
  assert.equal(dx.layerRole('HOLES'), 'hole');
  assert.equal(dx.layerRole('DRILL'), 'hole');
  assert.equal(dx.layerRole('CUTOUT'), 'cutout');
  assert.equal(dx.layerRole('OUTLINE'), 'outline');
  assert.equal(dx.layerRole('CUT'), 'outline');
  assert.equal(dx.layerRole('Dimensions'), 'dim');
  assert.equal(dx.layerRole('CENTRE'), 'centre');
  assert.equal(dx.layerRole('HIDDEN'), 'hidden');
  assert.equal(dx.layerRole('Notes'), 'other');
  const v = dx.parseDxf(file({ entities: line('0', 0, 0, 1, 1) }));
  assert.equal(v.layers[0].role, 'outline');
  const w = dx.parseDxf(file({ entities: line('OUTLINE', 0, 0, 1, 1) + line('Notes', 0, 0, 2, 2) }));
  assert.equal(layerOf(w, 'Notes').role, 'other');
});

check('units come from $INSUNITS; what is not drawn is said', () => {
  const v = dx.parseDxf(file({ header: pair(9, '$INSUNITS') + pair(70, 1), entities: line('L', 0, 0, 1, 1) + ent('HATCH', 'L') + ent('HATCH', 'L') + ent('POINT', 'L') }));
  assert.equal(v.unitMm, 25.4);
  assert.equal(v.unitName, 'inch');
  assert.ok(v.warnings.some((w) => /2 hatch fills/.test(w) && /1 points/.test(w)), v.warnings.join('|'));
});

check('binary DXF, an empty file and a file without ENTITIES are refused in words', () => {
  assert.throws(() => dx.parseDxf('AutoCAD Binary DXF\r\n\x1a\x00'), /binary DXF/);
  assert.throws(() => dx.parseDxf(''), /empty/);
  assert.throws(() => dx.parseDxf('hello\nworld\n'), /empty|ENTITIES/);
  assert.throws(() => dx.parseDxf(pair(0, 'SECTION') + pair(2, 'HEADER') + pair(0, 'ENDSEC') + pair(0, 'EOF')), /ENTITIES/);
});

check('CRLF files and blank lines read the same', () => {
  const crlf = file({ entities: line('L', 0, 0, 10, 5) }).replace(/\n/g, '\r\n');
  assert.equal(d1(crlf), 'M0 0L10 5');
});

// 20,000 entities
{
  const parts = [];
  for (let i = 0; i < 20000; i++) {
    const x = (i % 200) * 12, y = Math.floor(i / 200) * 12;
    const k = i % 4;
    parts.push(k === 0 ? line('GRID', x, y, x + 10, y + 5)
      : k === 1 ? ent('CIRCLE', 'HOLES', [10, x + 5], [20, y + 5], [40, 2])
        : k === 2 ? ent('ARC', 'ARCS', [10, x], [20, y], [40, 5], [50, 0], [51, 90])
          : ent('LWPOLYLINE', 'POLY', [90, 3], [70, 1], [10, x], [20, y], [10, x + 4], [20, y], [42, 0.3], [10, x + 4], [20, y + 4]));
  }
  const big = file({ entities: parts.join('') });
  let ms = Infinity, v;
  for (let r = 0; r < 3; r++) { const t = performance.now(); v = dx.parseDxf(big); ms = Math.min(ms, performance.now() - t); }
  console.log(`     20,000 entities: ${(big.length / 1e6).toFixed(2)} MB of DXF text parsed in ${ms.toFixed(0)} ms (best of 3), ${v.layers.length} layers, ${v.layers.reduce((n, l) => n + l.d.length, 0).toLocaleString('en-US')} path characters`);
  check('a 20,000-entity file parses under 500 ms into one path per layer', () => {
    assert.ok(ms < 500, `${ms} ms`);
    assert.equal(v.entityCount, 20000);
    assert.equal(v.layers.length, 4);
  });
}

// real part DXFs, when another agent has made them
try {
  const dir = resolve('..', 'TT_24M_DXF');
  const names = (await readdir(dir)).filter((n) => /\.dxf$/i.test(n)).slice(0, 400);
  if (names.length) {
    let drawn = 0, bad = [];
    const t = performance.now();
    for (const n of names) {
      try { const v = dx.parseDxf(await readFile(resolve(dir, n), 'latin1')); if (v.bounds && v.layers.length) drawn++; else bad.push(n); } catch (e) { bad.push(`${n}: ${e.message}`); }
    }
    console.log(`     TT_24M_DXF: ${drawn} of ${names.length} files drawn in ${(performance.now() - t).toFixed(0)} ms${bad.length ? `; not drawn: ${bad.slice(0, 5).join(', ')}` : ''}`);
    check(`the real part DXFs in TT_24M_DXF (${names.length}) all draw`, () => assert.equal(bad.length, 0, bad.slice(0, 3).join(' | ')));
  } else console.log('     TT_24M_DXF has no .dxf files: synthetic fixtures only');
} catch { console.log('     TT_24M_DXF is not there: synthetic fixtures only'); }

// ── 2. the pan / zoom rules ──────────────────────────────────────────────────────────────────────────────────────────
check('wheel rules are the org chart\'s: plain vertical zooms gently, Ctrl (pinch) zooms fast, sideways and Shift pan', () => {
  const w = (o) => dx.wheelAction({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false, ...o }, 600);
  near(w({ deltaY: -100 }).factor, Math.exp(0.15), 1e-9);                      // ~16% a notch
  near(w({ deltaY: 100 }).factor, Math.exp(-0.15), 1e-9);
  near(w({ deltaY: -10, ctrlKey: true }).factor, Math.exp(0.1), 1e-9);          // pinch: 1% per px
  assert.deepEqual(w({ deltaX: 40, deltaY: 5 }), { kind: 'pan', dx: 40, dy: 5 });
  assert.deepEqual(w({ deltaY: 30, shiftKey: true }), { kind: 'pan', dx: 30, dy: 0 });
  assert.deepEqual(w({ deltaX: 30, deltaY: 0, shiftKey: true }), { kind: 'pan', dx: 30, dy: 0 });
  near(w({ deltaY: -3, deltaMode: 1 }).factor, Math.exp(3 * 16 * 0.0015), 1e-9);   // Firefox lines
});

check('zoomAbout keeps the world point under the cursor; fitView centres the box with the 28 px margin', () => {
  const v = { s: 2, tx: 100, ty: 300 };
  const sx = 250, sy = 120;
  const wx = (sx - v.tx) / v.s, wy = -(sy - v.ty) / v.s;
  const z = dx.zoomAbout(v, 5, sx, sy);
  near(z.s * wx + z.tx, sx, 1e-9); near(-z.s * wy + z.ty, sy, 1e-9);
  const f = dx.fitView({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 800, 600);
  near(f.s, (800 - 56) / 1000, 1e-12);
  near(f.tx, (800 - f.s * 1000) / 2, 1e-9);
  near(-f.s * 500 + f.ty, (600 - f.s * 500) / 2, 1e-9);   // the top edge (y = 500) is where the centring puts it
});

// ── 3. the pop-up, in jsdom ──────────────────────────────────────────────────────────────────────────────────────────
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
const blobUrls = [];
const revoked = [];
URL.createObjectURL = () => { const u = `blob:test/${blobUrls.length}`; blobUrls.push(u); return u; };
URL.revokeObjectURL = (u) => { revoked.push(u); };

const React = await import('react');
const { createRoot } = await import('react-dom/client');

const calls = [];
globalThis.__apiFetch = async () => { throw new Error('no reply set'); };
const m = await bundle('viewer-dom', `
  export { DrawingViewer } from './src/apps/cf_erp/components/Drawings/DrawingViewer';
  export { DrawingsButton, DrawingsDialog } from './src/apps/cf_erp/components/Drawings/DrawingsDialog';
  export { RowDrawingCell } from './src/apps/cf_erp/components/Drawings/RowDrawingCell';
  export { rowDrawing } from './src/apps/cf_erp/lib/drawings';
`, {
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
const qa = (sel) => [...document.querySelectorAll(sel)];
const ev = (el, type, init = {}) => act(async () => {
  const E = type.startsWith('key') ? dom.window.KeyboardEvent : type === 'wheel' ? dom.window.WheelEvent : dom.window.MouseEvent;
  el.dispatchEvent(new E(type, { bubbles: true, cancelable: true, ...init }));
});
const matrix = () => (q('[data-testid="viewer-content"]').getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].split(' ').map(Number));
const press = (key, target = q('[role="dialog"]')) => ev(target, 'keydown', { key });

const dxfText = file({
  entities: ent('LWPOLYLINE', 'OUTLINE', [90, 4], [70, 1], [10, 0], [20, 0], [10, 400], [20, 0], [10, 400], [20, 200], [10, 0], [20, 200])
    + ent('CIRCLE', 'HOLES', [10, 100], [20, 100], [40, 11]) + ent('CIRCLE', 'HOLES', [10, 300], [20, 100], [40, 11])
    + ent('TEXT', 'NOTES', [10, 10], [20, 210], [40, 8], [1, 'PL-1 12 THK']),
});
const drawing = (over = {}) => ({
  id: 41, mark: 'PL-1', fileName: 'PL-1.dxf', fileKind: 'dxf', uploadedAt: '', levels: ['Plate part'], warnings: [],
  drawing: { id: 9, code: null, number: 'SO-1/PL-1', revision: 'B', status: 'issued', title: null, earlier: [] },
  geometry: { lengthMm: 400, widthMm: 200, areaMm2: 77000, rectAreaMm2: 80000, usePct: 96.3, cutLengthMm: 1900, piercings: 3, holes: 2, holeDiameters: [22, 22], innerCuts: 0, rings: [] },
  rows: [{ id: 8, code: 'PL-1', name: 'Gusset', level: 'Plate part', isPlatePart: true, pieces: 2, lengthMm: 400, widthMm: 200, thicknessMm: 12, sizeMatches: true }], ...over,
});
const reply = (fn) => { globalThis.__apiFetch = async (path, opts) => { calls.push({ path, opts }); return fn(path, opts); }; };
const dxfBlob = (text = dxfText) => new Blob([text], { type: 'application/dxf' });
const mount = async (props = {}) => {
  const p = { orderId: 1, lineId: 5, drawing: drawing(), onClose: () => {}, ...props };
  await act(() => root.render(React.createElement(m.DrawingViewer, p)));
  await flush();
};
const unmount = async () => { await act(() => root.render(null)); await flush(); };

reply(() => dxfBlob());

await checkAsync('the viewer fetches the file with the app client (blob) and draws it: paths per layer, bounds on the svg', async () => {
  await mount();
  assert.ok(calls.at(-1).path.endsWith('/cf_erp/orders/1/lines/5/drawings/41/file'), calls.at(-1).path);
  assert.equal(calls.at(-1).opts.responseType, 'blob');
  const svg = q('[data-testid="viewer-svg"]');
  assert.ok(svg, 'the drawing is there');
  const paths = qa('[data-testid="viewer-svg"] path');
  assert.equal(paths.length, 2, 'one path per drawn layer (OUTLINE, HOLES)');
  assert.ok(paths.every((p) => p.getAttribute('d').length > 5 && p.getAttribute('vector-effect') === 'non-scaling-stroke'));
  assert.equal(svg.getAttribute('data-bounds'), '0 0 400 210', 'the note text above the plate is part of what is drawn');
  assert.equal(qa('[data-testid="viewer-svg"] text')[0].textContent, 'PL-1 12 THK');
  assert.match(q('[data-testid="viewer-percent"]').textContent, /^\d+%$/);
});

await checkAsync('it opens fitted: the matrix scales the 400 x 210 drawing into the 800 x 600 fallback with the 28 px margin, y flipped', async () => {
  const [s, , , d, tx, ty] = matrix();
  near(d, -s, 1e-9);
  near(tx, (800 - s * 400) / 2, 1e-6);
  near(ty, (600 - s * 210) / 2 + s * 210, 1e-6);
  near(s, Math.min((800 - 56) / 400, (600 - 56) / 210), 1e-9);
});

await checkAsync('wheel zoom about the cursor: the point under the pointer stays put, plain wheel up zooms in', async () => {
  const before = matrix();
  const cx = 300, cy = 200;
  const wx = (cx - before[4]) / before[0], wy = -(cy - before[5]) / before[0];
  await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: -100, clientX: cx, clientY: cy });
  const after = matrix();
  assert.ok(after[0] > before[0] * 1.1, 'zoomed in');
  near(after[0] * wx + after[4], cx, 1e-6, 'x under the cursor'); near(-after[0] * wy + after[5], cy, 1e-6, 'y under the cursor');
  await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: 100, clientX: cx, clientY: cy });
  near(matrix()[0], before[0], 1e-9, 'the same notch back is the same scale');
});

await checkAsync('the zoom is limited: far in stops at the maximum, far out at a quarter of the fit view', async () => {
  const fitS = matrix()[0];
  for (let i = 0; i < 30; i++) await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: -400, clientX: 400, clientY: 300 });
  assert.ok(matrix()[0] <= Math.max(fitS * 100, 60) + 1e-6 && matrix()[0] > fitS * 50, `max ${matrix()[0]}`);
  for (let i = 0; i < 60; i++) await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: 400, clientX: 400, clientY: 300 });
  near(matrix()[0], fitS * 0.25, 1e-9, 'minimum');
});

await checkAsync('Fit puts the whole drawing back; the buttons zoom by 1.2 about the centre', async () => {
  const fitS = Math.min((800 - 56) / 400, (600 - 56) / 210);
  await act(async () => { q('button[aria-label="Fit the drawing to the window"]').click(); });
  near(matrix()[0], fitS, 1e-9);
  await act(async () => { q('button[aria-label="Zoom in"]').click(); });
  near(matrix()[0], fitS * 1.2, 1e-9);
  await act(async () => { q('button[aria-label="Zoom out"]').click(); });
  near(matrix()[0], fitS, 1e-9);
  const centre = [(400 - matrix()[4]) / matrix()[0], -(300 - matrix()[5]) / matrix()[0]];
  await act(async () => { q('button[aria-label="Zoom in"]').click(); });
  near(matrix()[0] * centre[0] + matrix()[4], 400, 1e-6); near(-matrix()[0] * centre[1] + matrix()[5], 300, 1e-6);
  await act(async () => { [...qa('button')].find((b) => b.textContent === '100%').click(); });
  near(matrix()[0], 96 / 25.4, 1e-9, 'true size is 96 dpi');
  await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  assert.equal(q('[data-testid="viewer-percent"]').textContent, '100%');
  await act(async () => { q('button[aria-label="Fit the drawing to the window"]').click(); });
});

await checkAsync('drag pans by the pointer distance (and a wheel with Shift pans sideways)', async () => {
  const before = matrix();
  const vp = q('[data-testid="viewer-viewport"]');
  await ev(vp, 'pointerdown', { button: 0, clientX: 100, clientY: 100 });
  await ev(vp, 'pointermove', { clientX: 160, clientY: 130 });
  await ev(vp, 'pointerup', { clientX: 160, clientY: 130 });
  const after = matrix();
  near(after[4], before[4] + 60, 1e-9); near(after[5], before[5] + 30, 1e-9); near(after[0], before[0], 1e-12);
  await ev(vp, 'pointermove', { clientX: 400, clientY: 400 });                    // no button held: nothing moves
  near(matrix()[4], after[4], 1e-9);
  await ev(vp, 'wheel', { deltaY: 50, shiftKey: true });
  near(matrix()[4], after[4] - 50, 1e-9, 'Shift + wheel pans left');
});

await checkAsync('keys: arrows pan, + and - zoom, 0 fits', async () => {
  const vp = q('[data-testid="viewer-viewport"]');
  await act(async () => { q('button[aria-label="Fit the drawing to the window"]').click(); });
  const fit = matrix();
  await press('ArrowLeft', vp);
  near(matrix()[4], fit[4] + 60, 1e-9);
  await press('+', vp);
  assert.ok(matrix()[0] > fit[0]);
  await press('0', vp);
  near(matrix()[0], fit[0], 1e-9); near(matrix()[4], fit[4], 1e-9);
});

await checkAsync('the side strip says what the app read, the register sheet and the file; layers list with counts', async () => {
  const strip = q('[data-testid="viewer-strip"]').textContent;
  assert.match(strip, /SO-1\/PL-1/); assert.match(strip, /rev B/); assert.match(strip, /issued/);
  assert.match(strip, /PL-1\.dxf/);
  const facts = q('[data-testid="viewer-facts"]').textContent;
  assert.match(facts, /400 × 200 mm/); assert.match(facts, /0\.08 m²/); assert.match(facts, /96\.3%/);
  assert.match(facts, /1\.9 m/); assert.match(facts, /Piercings3/); assert.match(facts, /2 × Ø22 mm/);
  assert.equal(qa('[data-testid="viewer-layers"] li').length, 3);
  await act(async () => { q('[data-testid="viewer-strip-toggle"]').click(); });
  assert.equal(q('[data-testid="viewer-strip"]'), null, 'collapsible');
  await act(async () => { q('[data-testid="viewer-strip-toggle"]').click(); });
  assert.ok(q('[data-testid="viewer-strip"]'));
});

await checkAsync('hiding a layer hides it in the drawing and the layers come back with All', async () => {
  const holes = () => q('[data-layer="HOLES"]');
  assert.equal(holes().getAttribute('display'), null);
  await act(async () => { q('input[aria-label="Show layer HOLES"]').click(); });
  assert.equal(holes().getAttribute('display'), 'none');
  assert.equal(q('[data-layer="OUTLINE"]').getAttribute('display'), null);
  await act(async () => { [...qa('button')].find((b) => b.textContent === 'All').click(); });
  assert.equal(holes().getAttribute('display'), null);
  await act(async () => { [...qa('button')].find((b) => b.textContent === 'None').click(); });
  assert.equal(qa('[data-layer][display="none"]').length, 3);
  await act(async () => { [...qa('button')].find((b) => b.textContent === 'All').click(); });
});

let closed = 0;
await checkAsync('full screen: the button fills the window (no browser API here), F toggles, the first Esc leaves it and the dialog stays, the second closes', async () => {
  await mount({ onClose: () => { closed++; } });
  const full = () => q('.MuiDialog-paperFullScreen') != null;
  assert.equal(full(), false);
  await act(async () => { q('button[aria-label="Show the drawing full screen"]').click(); });
  assert.equal(full(), true);
  assert.match(q('[data-testid="viewer-fullscreen"]').textContent, /Exit full screen/);
  await press('Escape');
  assert.equal(full(), false, 'first Esc leaves full screen');
  assert.ok(q('[data-testid="drawing-viewer"]'), 'the pop-up is still open');
  assert.equal(closed, 0);
  await press('f');
  assert.equal(full(), true, 'F enters');
  await press('F');
  assert.equal(full(), false, 'F leaves');
  await press('Escape');
  assert.equal(closed, 1, 'the second Esc closes');
});

await checkAsync('with the browser\'s full screen: Esc is the browser\'s, fullscreenchange drops our state, the dialog stays', async () => {
  closed = 0;
  let fsEl = null;
  const de = document.documentElement;
  de.requestFullscreen = async () => { fsEl = de; Object.defineProperty(document, 'fullscreenElement', { value: de, configurable: true }); };
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  await mount({ onClose: () => { closed++; } });
  await act(async () => { q('button[aria-label="Show the drawing full screen"]').click(); });
  await flush();
  assert.equal(fsEl, de, 'the document asked for full screen');
  assert.ok(q('.MuiDialog-paperFullScreen'));
  Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });       // the browser handled Esc
  await act(async () => { document.dispatchEvent(new dom.window.Event('fullscreenchange')); });
  assert.equal(q('.MuiDialog-paperFullScreen'), null);
  assert.ok(q('[data-testid="drawing-viewer"]'), 'still open');
  assert.equal(closed, 0);
  await press('Escape');
  assert.equal(closed, 1);
  delete de.requestFullscreen;
});

await checkAsync('a PDF shows in the browser\'s viewer, with the same pop-up, and no zoom buttons of ours', async () => {
  reply(() => new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }));
  await mount({ drawing: drawing({ fileKind: 'pdf', fileName: 'G1-1.pdf', geometry: null }) });
  const obj = q('[data-testid="viewer-pdf"]');
  assert.ok(obj, 'embedded viewer'); assert.equal(obj.tagName, 'OBJECT');
  assert.equal(obj.getAttribute('type'), 'application/pdf');
  assert.match(obj.getAttribute('data'), /^blob:test\//);
  assert.match(q('[data-testid="viewer-pdf-note"]').textContent, /browser’s PDF viewer/);
  assert.equal(q('button[aria-label="Zoom in"]'), null);
  assert.match(obj.textContent, /Download file/, 'the fallback inside the object says how to get it');
  await act(async () => { q('button[aria-label="Show the drawing full screen"]').click(); });
  assert.ok(q('.MuiDialog-paperFullScreen'), 'full screen works for a PDF too');
  await press('Escape');
  const url = obj.getAttribute('data');
  await unmount();
  assert.ok(revoked.includes(url), 'the blob URL is released');
});

await checkAsync('a failed fetch shows the error, a way to retry and a way to download', async () => {
  reply(() => { throw new Error('API request failed: 500 Server Error - {"message":"The drawing store is down."}'); });
  await mount();
  const e = q('[data-testid="viewer-error"]');
  assert.ok(e); assert.match(e.textContent, /The drawing store is down\./);
  assert.match(e.textContent, /Try again/); assert.match(e.textContent, /Download file/);
  assert.equal(q('[data-testid="viewer-svg"]'), null);
  reply(() => dxfBlob());
  await act(async () => { [...qa('button')].find((b) => b.textContent === 'Try again').click(); });
  await flush();
  assert.ok(q('[data-testid="viewer-svg"]'), 'Try again loads it');
  await unmount();
});

await checkAsync('a DXF with nothing to draw, and a binary DXF, say so in words', async () => {
  reply(() => dxfBlob(file({ entities: '' })));
  await mount();
  assert.match(q('[data-testid="viewer-error"]').textContent, /nothing to draw/i);
  await unmount();
  reply(() => dxfBlob('AutoCAD Binary DXF\r\n\x1a\x00'));
  await mount();
  assert.match(q('[data-testid="viewer-error"]').textContent, /binary DXF/);
  await unmount();
  reply(() => dxfBlob());
});

await checkAsync('"Upload a new revision" only shows when offered, and calls back', async () => {
  await mount();
  assert.equal(q('[data-testid="viewer-upload"]'), null);
  await unmount();
  let up = 0;
  await mount({ onUploadRevision: () => { up++; } });
  await act(async () => { q('[data-testid="viewer-upload"]').click(); });
  assert.equal(up, 1);
  await unmount();
});

await checkAsync('a heavy drawing (over 2,000 lines and curves) is drawn without anti-aliasing while it moves, and properly again once it stops', async () => {
  const many = file({ entities: Array.from({ length: 2500 }, (_, i) => line('GRID', i, 0, i, 5)).join('') });
  reply(() => dxfBlob(many));
  await mount();
  const svg = q('[data-testid="viewer-svg"]');
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });   // the first fit is a move too
  assert.equal(svg.getAttribute('shape-rendering'), null);
  await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: -100, clientX: 300, clientY: 200 });
  assert.equal(svg.getAttribute('shape-rendering'), 'optimizeSpeed');
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
  assert.equal(svg.getAttribute('shape-rendering'), null);
  reply(() => dxfBlob());
  await unmount();
  await mount();                                                                  // a light drawing never switches
  await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: -100, clientX: 300, clientY: 200 });
  assert.equal(q('[data-testid="viewer-svg"]').getAttribute('shape-rendering'), null);
  await unmount();
});

// the entry points
const view = (drawings, over = {}) => ({
  line: { id: 5, lineNo: 1, orderId: 1, orderCode: 'SO-1', released: false }, drawings, waiting: [],
  rowsWithoutDrawing: [{ id: 7, code: 'GUS-1', name: 'Gusset plate', level: 'Plate part', mark: null, pieces: 4, isPlatePart: true }],
  summary: { rows: 2, rowsWithDrawing: drawings.length, parts: 2, partsWithShape: 1, pieces: 6, piecesWithShape: 2, rectAreaM2: 0.08, trueAreaM2: 0.077, usePct: 96, rectKg: 10, trueKg: 9, savingKg: 1, waiting: 0 }, ...over,
});
const withFile = view([drawing()]);
const provide = (data) => ({ data, error: null, loading: false, setData: () => {} });

await checkAsync('Drawings dialog: each saved drawing has a View action, and the file name opens the viewer too', async () => {
  await act(() => root.render(React.createElement(m.DrawingsDialog, { open: true, onClose: () => {}, orderId: 1, lineId: 5, canManage: false, view: withFile, error: null, loading: false, onView: () => {} })));
  await flush();
  assert.equal(q('[data-testid="drawing-viewer"]'), null);
  await act(async () => { q('[data-testid="drawing-view"]').click(); });
  await flush();
  assert.ok(q('[data-testid="viewer-svg"]'), 'View opens the pop-up with the drawing');
  assert.equal(q('[data-testid="viewer-upload"]'), null, 'no manage permission: no upload action, viewing still works');
  await act(async () => { q('button[aria-label="Close"]').click(); });
  await flush();
  assert.equal(q('[data-testid="drawing-viewer"]'), null);
  await act(async () => { q('[data-testid="drawing-open"]').click(); });
  await flush();
  assert.ok(q('[data-testid="viewer-svg"]'), 'the file name opens it');
  await unmount();
});

// What BomPanel does with the row cell: a row with a file opens the viewer, one without opens the upload dialog.
function Harness({ data, canManage = true, why = null }) {
  const [focus, setFocus] = React.useState(null);
  const [viewRow, setViewRow] = React.useState(null);
  const cell = (id, name) => React.createElement(m.RowDrawingCell, { key: id, name, state: m.rowDrawing(data, id), why, onClick: () => setFocus({ id, name }), onView: () => setViewRow({ id, name }) });
  return React.createElement(React.Fragment, null, cell(8, 'PL-1'), cell(7, 'GUS-1'),
    React.createElement(m.DrawingsButton, { orderId: 1, lineId: 5, canManage, drawings: provide(data), focusRow: focus, onFocusDone: () => setFocus(null),
      viewRow, onViewDone: () => setViewRow(null), onUploadRevision: setFocus }));
}
const cellOf = (name) => qa('[data-testid="row-drawing"]').find((b) => (b.getAttribute('aria-label') ?? '').includes(name));

await checkAsync('row icon: with a drawing it opens the viewer; "Upload a new revision" then leads to the upload dialog for that row', async () => {
  await act(() => root.render(React.createElement(Harness, { data: withFile })));
  await act(async () => { qa('[data-testid="row-drawing"]')[0].click(); });
  await flush();
  assert.ok(q('[data-testid="viewer-svg"]'), 'the viewer');
  assert.equal(q('[data-testid="drawings-focus"]'), null, 'not the upload dialog');
  await act(async () => { q('[data-testid="viewer-upload"]').click(); });
  await flush();
  assert.equal(q('[data-testid="drawing-viewer"]'), null);
  assert.ok(q('[data-testid="drawings-upload-here"]'), 'the existing dialog, for this row');
  await act(async () => { [...qa('button')].find((b) => b.textContent === 'Close').click(); });
  await flush();
});

await checkAsync('row icon: with no drawing it opens the upload dialog as before', async () => {
  await act(() => root.render(React.createElement(Harness, { data: withFile })));
  await act(async () => { qa('[data-testid="row-drawing"]')[1].click(); });
  await flush();
  assert.equal(q('[data-testid="drawing-viewer"]'), null);
  assert.ok(q('[data-testid="drawings-focus"]'));
  await act(async () => { [...qa('button')].find((b) => b.textContent === 'Close').click(); });
  await flush();
});

await checkAsync('row icon: a person who cannot manage can still look (the icon is not disabled for a row with a file) but is offered no upload', async () => {
  await act(() => root.render(React.createElement(Harness, { data: withFile, canManage: false, why: 'You need permission to manage orders.' })));
  const [withDrawing, without] = qa('[data-testid="row-drawing"]');
  assert.equal(withDrawing.disabled, false);
  assert.equal(without.disabled, true);
  await act(async () => { withDrawing.click(); });
  await flush();
  assert.ok(q('[data-testid="viewer-svg"]'));
  assert.equal(q('[data-testid="viewer-upload"]'), null);
  await unmount();
});


// ── 4. levels: the tree, the breadcrumb, the ancestor's drawing, and every screen's entry point ───────────────────────
const { MemoryRouter } = await import('react-router-dom');
const m2 = await bundle('viewer-levels', `
  export { RowDrawingViewer, ViewDrawingButton, CutPlateDrawingButton } from './src/apps/cf_erp/components/Drawings/RowDrawingViewer';
  export { LineDrawingContext } from './src/apps/cf_erp/hooks/lineDrawingContext';
  export { levelView, findRow, inheritedLabel } from './src/apps/cf_erp/lib/drawingLevels';
  export { NowTab } from './src/apps/cf_erp/components/Floor/NowTab';
  export { drawingTarget } from './src/apps/cf_erp/components/Floor/floorModel';
  export { PieceDrawer } from './src/apps/cf_erp/components/Tracker/PieceDrawer';
  export { UnitSheet } from './src/apps/cf_erp/components/Plan/UnitSheet';
`, {
  alias: { '@shared/ui': resolve('src/shared/ui/SideSheet.tsx') },
  plugins: [{ name: 'stub-core', setup(b) {
    b.onResolve({ filter: /^@core\/(api\/client|contexts\/AuthContext)$/ }, (x) => ({ path: x.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (x) => ({ loader: 'js', resolveDir: process.cwd(), contents: x.path.endsWith('client') ? 'export async function apiFetch(path, opts) { return globalThis.__apiFetch(path, opts); }' : 'export const useAuth = () => ({ user: null });' }));
  } }],
});

const R = (rowId, parentId, name, level, o = {}) => ({ rowId, parentId, code: null, name, level, depth: 0, seq: rowId, mark: null, hasDrawing: false, drawingId: null, fileKind: null, fileName: null, number: null, revision: null, status: null, isPlatePart: false, cutPlateIds: [], ...o });
const withDwg = (id, name, kind = 'dxf') => ({ hasDrawing: true, drawingId: id, fileKind: kind, fileName: name, number: `SO-1/${name}`, revision: 'A', status: 'issued' });
const tree = {
  line: { id: 5, lineNo: 1, orderId: 1, orderCode: 'SO-1', released: true },
  rows: [
    R(1, null, 'Span 1', 'Span', withDwg(11, 'SPAN-GA.dxf')),
    R(2, 1, 'Girder G2', 'Girder', withDwg(12, 'G2.dxf')),
    R(3, 2, 'Segment S1', 'Segment'),
    R(4, 3, 'Bottom flange', 'Plate part', { isPlatePart: true, cutPlateIds: [900] }),
    R(5, 3, 'Web', 'Plate part', { ...withDwg(15, 'WEB.dxf'), isPlatePart: true, cutPlateIds: [901] }),
    R(6, 2, 'Segment S2', 'Segment', withDwg(16, 'S2.pdf', 'pdf')),
  ],
};
const apiLog = [];
const route = (path) => {
  apiLog.push(path);
  if (/\/drawings\/tree$/.test(path)) return tree;
  if (/\/drawings\/\d+\/file$/.test(path)) return dxfBlob();
  throw new Error('API request failed: 404 Not Found - {"message":"no route in the test"}');
};
reply((path) => route(path));
const fileCalls = () => apiLog.filter((x) => /\/file$/.test(x)).map((x) => Number(/drawings\/(\d+)\/file/.exec(x)[1]));

check('levelView: crumbs top first, the nearest ancestor with a drawing is shown and labelled, children in order', () => {
  const v = m2.levelView(tree, 4);
  assert.deepEqual(v.crumbs.map((c) => [c.name, c.hasDrawing, c.current]), [['Span 1', true, false], ['Girder G2', true, false], ['Segment S1', false, false], ['Bottom flange', false, true]]);
  assert.equal(v.shown.rowId, 2); assert.equal(v.inherited, true);
  assert.equal(m2.inheritedLabel(v), 'Drawing of Girder G2');
  assert.deepEqual(m2.levelView(tree, 2).parts.map((r) => r.rowId), [3, 6]);
  assert.equal(m2.levelView(tree, 5).inherited, false);
  assert.equal(m2.inheritedLabel(m2.levelView(tree, 5)), null);
  assert.equal(m2.levelView(tree, 999), null);
  assert.equal(m2.levelView({ ...tree, rows: tree.rows.map((r) => ({ ...r, hasDrawing: false })) }, 4).shown, null);
  assert.equal(m2.findRow(tree, { cutPlateId: 901 }).rowId, 5);
  assert.equal(m2.findRow(tree, { rowId: 3 }).name, 'Segment S1');
  assert.equal(m2.findRow(tree, { cutPlateId: 5 }), null);
});

const openRow = async (target, large = false) => {
  apiLog.length = 0;
  await act(() => root.render(React.createElement(MemoryRouter, null, React.createElement(m2.RowDrawingViewer, { target: { orderId: 1, lineId: 5, ...target }, onClose: () => {}, large }))));
  await flush();
};

await checkAsync('a row with no drawing of its own shows its ancestor\'s, labelled "Drawing of …", with the breadcrumb of levels', async () => {
  await openRow({ rowId: 4 });
  assert.ok(apiLog.some((x) => /\/orders\/1\/lines\/5\/drawings\/tree$/.test(x)), 'one tree read');
  assert.deepEqual(fileCalls(), [12], 'the Girder\'s file');
  assert.equal(q('[data-testid="viewer-inherited"]').textContent, 'Drawing of Girder G2');
  const crumbs = qa('[data-testid="viewer-crumb"]');
  assert.deepEqual(crumbs.map((c) => c.textContent), ['Span 1', 'Girder G2', 'Segment S1', 'Bottom flange']);
  assert.deepEqual(crumbs.map((c) => c.disabled), [false, false, true, false], 'a level with no drawing is not a step (the current one stays enabled)');
  assert.equal(crumbs[3].getAttribute('aria-current'), 'step');
});

await checkAsync('stepping UP by a crumb shows that level\'s drawing without another tree read; the label goes when it is the row\'s own', async () => {
  const trees0 = apiLog.filter((x) => /tree$/.test(x)).length;
  await act(async () => { qa('[data-testid="viewer-crumb"]')[0].click(); });
  await flush();
  assert.deepEqual(fileCalls(), [12, 11], 'the Span\'s file is fetched next');
  assert.equal(apiLog.filter((x) => /tree$/.test(x)).length, trees0, 'no second tree read');
  assert.equal(q('[data-testid="viewer-inherited"]'), null, 'the Span\'s own drawing carries no "Drawing of" note');
  assert.match(q('#drawing-viewer-title').textContent, /SO-1\/SPAN-GA\.dxf · rev A/);
});

await checkAsync('"Parts in this assembly" lists the children, enabled only with a drawing, and a click steps DOWN', async () => {
  const items = qa('[data-testid="viewer-part"]');
  assert.deepEqual(items.map((b) => b.textContent.trim().split(/\s+/)[0] + (b.disabled ? '(off)' : '')), ['Girder']);
  await act(async () => { items[0].click(); });
  await flush();
  assert.equal(fileCalls().at(-1), 12);
  const parts = qa('[data-testid="viewer-part"]');
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.map((b) => b.disabled), [true, false], 'Segment S1 has no drawing, S2 has');
  await act(async () => { parts[1].click(); });
  await flush();
  assert.equal(fileCalls().at(-1), 16);
  assert.ok(q('[data-testid="viewer-pdf"]'), 'a PDF level shows in the browser\'s viewer, same pop-up');
});

await checkAsync('a cut plate finds its part\'s drawing; a row nobody has, and a line with no drawing at all, say so', async () => {
  await openRow({ cutPlateId: 901 });
  assert.deepEqual(fileCalls(), [15]);
  assert.equal(q('[data-testid="viewer-inherited"]'), null);
  await openRow({ rowId: 999 });
  assert.ok(q('[data-testid="row-viewer-unknown"]'));
  reply((path) => (/tree$/.test(path) ? { ...tree, rows: tree.rows.map((r) => ({ ...r, hasDrawing: false, drawingId: null })) } : route(path)));
  await openRow({ rowId: 4 });
  assert.match(q('[data-testid="row-viewer-none"]').textContent, /No drawing for Bottom flange/);
  reply((path) => route(path));
  await unmount();
});

await checkAsync('viewing needs the view permission only: the viewer reads the tree and the file, never a write', async () => {
  await openRow({ rowId: 5 });
  assert.ok(apiLog.every((x) => !/\b(start|upload)\b/.test(x)));
  assert.equal(q('[data-testid="viewer-upload"]'), null);
  await unmount();
});

await checkAsync('Tracker: the piece drawer has "View drawing" for the piece\'s row on its order and line', async () => {
  reply((path) => {
    if (/\/tracker\/tree\/node/.test(path)) return { node: { id: 'p9', parentId: null, kind: 'piece', level: 2, code: 'SPAN1-G2-3-TF1', name: 'Bottom flange', qty: 1, ops: [], completion: null, weight: null, blocked: false, blockedCount: 0, blockedReason: null, blockedAt: null, running: 0, childCount: 0, childrenIncluded: true, itemId: 4, lineId: 5, orderId: 1 }, operations: {}, path: [], order: { id: 1, code: 'SO-1' }, line: { id: 5, lineNo: 1 }, steps: [] };
    return route(path);
  });
  await act(() => root.render(React.createElement(MemoryRouter, null, React.createElement(m2.PieceDrawer, { nodeId: 'p9', basisNote: null, onClose: () => {}, onChanged: () => {} }))));
  await flush();
  const b = q('[data-testid="view-drawing"]');
  assert.ok(b, 'the button');
  apiLog.length = 0;
  await act(async () => { b.click(); });
  await flush();
  assert.deepEqual(fileCalls(), [12], 'row 4 (the flange) has no drawing: its Girder\'s opens');
  assert.equal(q('[data-testid="viewer-inherited"]').textContent, 'Drawing of Girder G2');
  await unmount();
});

const floorStep = (id, itemId) => ({ id, pieceCode: 'G2-3-TF1', pieceName: 'Bottom flange', operation: 'Cut', qtyLeft: 2, qtyTotal: 2, orderCode: 'SO-1', state: null, ready: true, why: null, pausedSessionId: null, orderId: 1, lineId: 5, itemId });
await checkAsync('Floor: a big "View drawing" on the running job and beside each queued job; the touch viewer fills the screen; a tap does not pick the job', async () => {
  reply((path) => route(path));
  assert.deepEqual(m2.drawingTarget(floorStep(1, 4)), { orderId: 1, lineId: 5, rowId: 4, label: 'G2-3-TF1' });
  assert.equal(m2.drawingTarget({ ...floorStep(1, 4), itemId: null }), null);
  const queue = { running: [{ ...floorStep(7, 4), sessionId: 70, stepId: 7, startedAt: new Date().toISOString() }], next: [floorStep(8, 5)], stop: null, total: 1 };
  const props = { machine: { id: 1, code: 'M1', name: 'Plasma', type: null, running: 1, stopped: false, stopReason: null, lastActivityAt: null }, operator: { id: 1, code: null, name: 'Op' }, reasons: [], queue, day: null, refresh: async () => {}, say: () => {}, saved: () => {}, search: '', setSearch: () => {} };
  await act(() => root.render(React.createElement(m2.NowTab, props)));
  await flush();
  const buttons = qa('[data-testid="view-drawing"]');
  assert.equal(buttons.length, 2, 'running card + queued job');
  assert.ok(buttons[0].textContent.includes('View drawing'), 'the running one is a labelled big button');
  apiLog.length = 0;
  await act(async () => { buttons[1].click(); });
  await flush();
  assert.deepEqual(fileCalls(), [15], 'the queued piece\'s row (the Web) has its own drawing');
  assert.ok(q('.MuiDialog-paperFullScreen'), 'the tablet viewer fills the screen');
  assert.equal(qa('[role="checkbox"]')[0].getAttribute('aria-checked'), 'false', 'the job was not picked');
  const big = q('button[aria-label="Fit the drawing to the window"]');
  assert.ok(big && /Large/.test(big.className), 'big Fit button');
  assert.ok(q('button[aria-label="Fit the drawing to the width"]'), 'and Fit to width');
  await unmount();
});

await checkAsync('Plan: the unit sheet has "View drawing" for the card\'s row', async () => {
  reply((path) => route(path));
  const unit = { key: 'p9', orderId: 1, lineId: 5, level: '2', pieceId: 9, code: 'G2-3', name: 'Segment S1', depth: 2, parentKey: null, groupKey: 'l5', isMark: true, marks: 1, tonnes: 1, work: {}, noRate: 0, materials: [], material: null, progress: 0, itemId: 3 };
  const snapshot = { functions: [], orders: [{ id: 1, code: 'SO-1' }], units: [unit] };
  const evaluation = { units: { p9: { period: null, pinned: false } } };
  await act(() => root.render(React.createElement(MemoryRouter, null, React.createElement(m2.UnitSheet, { unit, snapshot, evaluation, plan: {}, periodLabel: (k) => k, canEdit: false, busy: false, buyListPath: '/x', onClose: () => {}, onUnplan: () => {}, onPin: () => {}, onStretch: () => {}, onEarliest: () => {}, onSplit: () => {} }))));
  await flush();
  apiLog.length = 0;
  await act(async () => { q('[data-testid="view-drawing"]').click(); });
  await flush();
  assert.deepEqual(fileCalls(), [12], 'row 3 (Segment S1) has none: its Girder\'s drawing, labelled');
  assert.equal(q('[data-testid="viewer-inherited"]').textContent, 'Drawing of Girder G2');
  await unmount();
});

await checkAsync('Nesting: a cut plate\'s button opens the drawing of the part it is cut for', async () => {
  reply((path) => route(path));
  await act(() => root.render(React.createElement(m2.LineDrawingContext.Provider, { value: { orderId: 1, lineId: 5 } }, React.createElement(m2.CutPlateDrawingButton, { cutPlateId: 901, label: 'CP-901' }))));
  apiLog.length = 0;
  await act(async () => { q('[data-testid="view-drawing"]').click(); });
  await flush();
  assert.deepEqual(fileCalls(), [15]);
  await act(() => root.render(React.createElement(m2.CutPlateDrawingButton, { cutPlateId: 901 })));
  assert.equal(q('[data-testid="view-drawing"]'), null, 'no line, no button');
  await unmount();
});

await checkAsync('the zoom is remembered per drawing for the session: zoom, step away, come back; Fit to width fills the width', async () => {
  reply((path) => route(path));
  await openRow({ rowId: 1 });
  await ev(q('[data-testid="viewer-viewport"]'), 'wheel', { deltaY: -300, clientX: 300, clientY: 200 });
  const zoomed = matrix();
  await act(async () => { qa('[data-testid="viewer-part"]')[0].click(); });
  await flush();
  await act(async () => { qa('[data-testid="viewer-crumb"]')[0].click(); });
  await flush();
  const back = matrix();
  near(back[0], zoomed[0], 1e-9); near(back[4], zoomed[4], 1e-6); near(back[5], zoomed[5], 1e-6);
  await act(async () => { q('button[aria-label="Fit the drawing to the width"]').click(); });
  const fw = matrix();
  near(fw[0], (800 - 56) / 400, 1e-9, 'Fit to width fills the width');
  await unmount();
});

await checkAsync('layer toggles list a girder file\'s OUTLINE, HOLES, CENTRE, DIM, TEXT and HIDDEN layers; centre and hidden are dashed; text stays vector', async () => {
  const girder = file({ entities: ent('LWPOLYLINE', 'OUTLINE', [90, 2], [70, 0], [10, 0], [20, 0], [10, 24500], [20, 0]) + ent('CIRCLE', 'HOLES', [10, 100], [20, 0], [40, 11])
    + ent('LINE', 'CENTRE', [10, 0], [20, 0], [11, 24500], [21, 0]) + ent('LINE', 'DIM', [10, 0], [20, -300], [11, 24500], [21, -300]) + ent('TEXT', 'TEXT', [10, 100], [20, 100], [40, 60], [1, 'SEGMENT S1'])
    + ent('LINE', 'HIDDEN', [10, 0], [20, 50], [11, 100], [21, 50]) });
  reply((path) => (/\/file$/.test(path) ? dxfBlob(girder) : route(path)));
  await openRow({ rowId: 1 });
  assert.deepEqual(qa('[data-testid="viewer-layers"] input').map((i) => i.getAttribute('aria-label').replace('Show layer ', '')), ['CENTRE', 'DIM', 'HIDDEN', 'HOLES', 'OUTLINE', 'TEXT']);
  assert.equal(qa('[data-testid="viewer-svg"] path').filter((p) => p.getAttribute('stroke-dasharray')).length, 2, 'centre and hidden lines are dashed');
  assert.equal(qa('[data-testid="viewer-svg"] text')[0].getAttribute('font-size'), '60', 'text is sized in drawing units, so it grows with the zoom');
  assert.match(q('[data-testid="viewer-strip"]').textContent, /dimensions/);
  await unmount();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
