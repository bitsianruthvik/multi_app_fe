// Run from multi_app_fe: node scripts/cf_erp_wip_screens_test.mjs
// Stock › Work in progress and Inventory › Offcuts (the production ledger screens):
//   - getWip / listOffcuts ask the right paths with the right query
//   - OffcutShape draws an SVG path for an outline (normalised to the bbox, rect dashed), and copes with none
//   - the WIP page shows tiles, the By-level strip and per-order lots; a container row expands to what is inside
//   - the Offcuts page pages on the server, shows the thumbnail and details, opens a dialog with the batch link
//   - nav entries and routes exist
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/acme/cf_erp/wip', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'FocusEvent', 'InputEvent', 'SVGElement']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
dom.window.HTMLAnchorElement.prototype.click = function click() {};
globalThis.URL.createObjectURL = () => 'blob:x';
globalThis.URL.revokeObjectURL = () => {};

// ── fixtures ─────────────────────────────────────────────────────────────
const OUTLINE = [[[2827, 3], [11997, 3], [11997, 1997], [3, 1997], [3, 1209], [1018, 1209], [1018, 1109], [2827, 1109]]];
const BBOX = { x: 3, y: 3, length: 11994, width: 1994 };
const item = (id, code, name) => ({ id, code, name });
const WIP = {
  area: { id: 7, code: 'PROD-WIP', name: 'Production (work in progress)' },
  totals: { lots: 3, pieces: 14, value: 125000, unpricedLots: 0 },
  byLevel: [
    { depth: 2, level: 'Part', lots: 1, pieces: 8, value: 40000 },
    { depth: 0, level: 'Line', lots: 1, pieces: 1, value: 60000 },
    { depth: 3, level: 'Cut piece', lots: 1, pieces: 5, value: 25000 },
  ],
  orders: [{
    orderId: 100, orderCode: 'SO-20260930-0001', lineId: 5, lineNo: 1, releaseId: 9,
    lots: [
      { batchId: 11, code: 'WIP-0001', item: item(1, 'GDR-01', 'Girder 1'), productionItemId: 1, depth: 0, level: 'Line', quantity: 1, value: 60000, unitCost: 60000,
        contains: [{ code: 'TF-1', item: item(2, 'TF', 'Top flange'), quantity: 2, value: 20000 }, { code: null, item: item(3, 'RM-W', 'Web plate 12 mm E350'), quantity: 1, value: 5000 }] },
      { batchId: 12, code: 'WIP-0002', item: item(4, 'DIA', 'Diaphragm'), productionItemId: 4, depth: 2, level: 'Part', quantity: 8, value: 40000, unitCost: 5000, contains: [] },
    ],
  }],
  offcuts: { count: 3, kg: 412.5, value: 30000 },
};
const OFFCUTS = [
  { id: 1, offcutNo: 'OFC-10-E350-0001', status: 'available', thickness: 10, grade: 'E350', material: 'Plate 10 mm E350', areaMm2: 20000000, weightKg: 1570.5, value: 98000,
    rect: { length: 8000, width: 1100 }, bbox: BBOX, outline: OUTLINE, origin: { orderId: 100, orderCode: 'SO-20260930-0001', lineNo: 1, lotNo: 'LOT-3', plate: { id: 4, code: 'PL-10' } },
    batch: { id: 55, code: 'B-OFC-1' }, item: item(9, 'OFC-10-E350', 'Offcut 10 mm E350'), createdAt: '2026-10-01T10:00:00' },
  { id: 2, offcutNo: 'OFC-12-E250-0002', status: 'planned', thickness: 12, grade: 'E250', material: null, areaMm2: 500000, weightKg: null, value: null,
    rect: null, bbox: null, outline: [], origin: { orderId: 101, orderCode: 'SO-20260930-0002', lineNo: 2, lotNo: 'LOT-4', plate: { id: 5, code: null } },
    batch: null, item: null, createdAt: '2026-10-01T11:00:00' },
];
const requests = [];
const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url);
  if (url.pathname.endsWith('/stock/wip')) return json(WIP);
  if (url.pathname.endsWith('/offcuts')) {
    return json({ rows: OFFCUTS, total: 2, limit: 100, offset: 0, hasMore: false, counts: { status: { available: 1, planned: 1, used: 0, scrapped: 0, returned: 0, all: 2 } } });
  }
  if (/\/orders\/\d+$/.test(url.pathname)) return json({ id: 100, code: 'SO-20260930-0001', title: 'ROB', customer: null });
  if (url.pathname.endsWith('/orders')) return json([]);
  return new Response('{"message":"nope"}', { status: 404 });
};

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { renderToStaticMarkup } = await import('react-dom/server');
const { act } = React;
const { MemoryRouter } = await import('react-router-dom');

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const authStub = resolve(cache, `wip-screens-auth-${process.pid}.tsx`);
await writeFile(authStub, 'export const useAuth = () => ({ user: null });');
const entry = `export { default as WorkInProgress } from './src/apps/cf_erp/pages/WorkInProgress';
export { default as Offcuts } from './src/apps/cf_erp/pages/Offcuts';
export { OffcutShape } from './src/apps/cf_erp/components/OffcutShape';
export { outlinePath } from './src/apps/cf_erp/lib/offcutShape';
export { getWip, listOffcuts } from './src/apps/cf_erp/api/wip';
export { SECTIONS } from './src/apps/cf_erp/navMeta';`;
const built = await build({
  define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://localhost:4000","VITE_API_HOST":"http://localhost:4000"}' }, loader: { '.css': 'empty' }, tsconfig: 'tsconfig.app.json', alias: { '@core/contexts/AuthContext': authStub },
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const artifact = resolve(cache, `wip-screens-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact); await unlink(authStub);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const settle = async (ms = 40) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const text = () => document.body.textContent;
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const mount = async (path, Component) => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = createRoot(document.getElementById('app'));
  await act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component))); });
  await settle();
  return root;
};

await check('getWip asks /stock/wip with the order and search', async () => {
  requests.length = 0;
  const a = await m.getWip({ orderId: 100, search: 'tf' });
  assert.equal(a.totals.lots, 3);
  assert.match(requests[0].pathname, /\/api\/acme\/cf_erp\/stock\/wip$/);
  assert.equal(requests[0].searchParams.get('orderId'), '100');
  assert.equal(requests[0].searchParams.get('search'), 'tf');
  requests.length = 0;
  await m.getWip();
  assert.equal(requests[0].search, '');
});

await check('listOffcuts asks /offcuts paged with its filters', async () => {
  requests.length = 0;
  const a = await m.listOffcuts({ status: 'available', thickness: 10, grade: 'E350', limit: 50, offset: 0 });
  assert.equal(a.rows.length, 2);
  const q = requests[0].searchParams;
  assert.match(requests[0].pathname, /\/offcuts$/);
  assert.equal(q.get('paged'), '1'); assert.equal(q.get('status'), 'available'); assert.equal(q.get('thickness'), '10'); assert.equal(q.get('grade'), 'E350'); assert.equal(q.get('limit'), '50');
});

await check('OffcutShape renders an SVG path for the outline, normalised to the bbox, with the rect dashed', () => {
  const html = renderToStaticMarkup(React.createElement(m.OffcutShape, { offcut: { outline: OUTLINE, bbox: BBOX, rect: { length: 8000, width: 1100 } }, width: 120, height: 60 }));
  assert.match(html, /<svg[^>]*viewBox="0 0 11994 1994"/);
  const d = /<path[^>]* d="([^"]+)"/.exec(html)?.[1];
  assert.ok(d, 'a path is drawn');
  assert.ok(d.startsWith('M2824 0 L11994 0'), `normalised to the bbox corner: ${d}`);
  assert.equal((d.match(/L/g) ?? []).length, 7);
  assert.match(d, /Z$/);
  assert.match(html, /stroke-dasharray/);
  assert.match(html, /width="8000"/);
});

await check('OffcutShape copes with no outline, and derives a box when there is no bbox', () => {
  const none = renderToStaticMarkup(React.createElement(m.OffcutShape, { offcut: { outline: [], bbox: null, rect: null } }));
  assert.ok(!/<svg/.test(none)); assert.match(none, /no outline/);
  const derived = renderToStaticMarkup(React.createElement(m.OffcutShape, { offcut: { outline: [[[10, 20], [110, 20], [110, 70]]], bbox: null, rect: null } }));
  assert.match(derived, /viewBox="0 0 100 50"/);
  assert.equal(m.outlinePath(undefined, null), '');
});

await check('the WIP page shows the tiles, the By-level strip (shallow to deep) and the explanation', async () => {
  requests.length = 0;
  const root = await mount('/acme/cf_erp/wip', m.WorkInProgress);
  assert.match(text(), /Every piece being made is stock here, at the level it has reached\. It moves up when the next step starts and comes back down when it is taken apart\./);
  assert.match(text(), /₹1,25,000/);
  const levels = [...document.querySelectorAll('[data-testid="wip-level"]')].map((e) => e.textContent);
  assert.equal(levels.length, 3);
  assert.match(levels[0], /^Line/); assert.match(levels[1], /^Part/); assert.match(levels[2], /^Cut piece/);
  assert.match(text(), /412\.5 kg/);
  await act(async () => root.unmount());
});

await check('the WIP page lists lots per order line, and a container expands to what is inside', async () => {
  const root = await mount('/acme/cf_erp/wip', m.WorkInProgress);
  assert.equal(document.querySelectorAll('[data-testid="wip-lot"]').length, 2);
  assert.match(text(), /SO-20260930-0001/);
  assert.equal(document.querySelectorAll('[data-testid="wip-contained"]').length, 0, 'closed first');
  assert.equal(document.querySelectorAll('[data-testid="wip-expand"]').length, 1, 'only the container expands');
  await click(document.querySelector('[data-testid="wip-expand"]'));
  const inside = [...document.querySelectorAll('[data-testid="wip-contained"]')].map((e) => e.textContent);
  assert.equal(inside.length, 2);
  assert.match(inside[0], /TF-1/); assert.match(inside[1], /Web plate 12 mm E350/);
  await click(document.querySelector('[data-testid="wip-expand"]'));
  assert.equal(document.querySelectorAll('[data-testid="wip-contained"]').length, 0, 'collapses again');
  await act(async () => root.unmount());
});

await check('the WIP page sends the order and search from the URL', async () => {
  requests.length = 0;
  const root = await mount('/acme/cf_erp/wip?orderId=100', m.WorkInProgress);
  const wipReq = requests.find((r) => r.pathname.endsWith('/stock/wip'));
  assert.equal(wipReq.searchParams.get('orderId'), '100');
  await act(async () => root.unmount());
});

await check('the Offcuts page pages on the server, shows status counts, thumbnails and details', async () => {
  requests.length = 0;
  const root = await mount('/acme/cf_erp/offcuts', m.Offcuts);
  const u = requests.find((r) => r.pathname.endsWith('/offcuts'));
  assert.equal(u.searchParams.get('paged'), '1'); assert.equal(u.searchParams.get('status'), 'available'); assert.equal(u.searchParams.get('limit'), '100');
  assert.equal(document.querySelectorAll('tbody tr[data-row]').length, 2);
  assert.equal(document.querySelectorAll('tbody [data-testid="offcut-shape"]').length, 1, 'a thumbnail where there is an outline');
  assert.equal(document.querySelectorAll('tbody [data-testid="offcut-shape-empty"]').length, 1, 'a quiet placeholder where there is none');
  const t = text();
  assert.match(t, /OFC-10-E350-0001/); assert.match(t, /10 mm E350/); assert.match(t, /1,570\.5 kg/); assert.match(t, /₹98,000/); assert.match(t, /8000 × 1100/); assert.match(t, /SO-20260930-0001/); assert.match(t, /LOT-3/);
  assert.match(t, /Available/); assert.match(t, /Planned/);
  await act(async () => root.unmount());
});

await check('a row opens a dialog with the large shape and a link to the batch', async () => {
  const root = await mount('/acme/cf_erp/offcuts', m.Offcuts);
  await click(document.querySelector('tbody tr[data-row]'));
  const dlg = document.querySelector('[data-testid="offcut-dialog"]');
  assert.ok(dlg, 'dialog open');
  const big = dlg.querySelector('[data-testid="offcut-shape"]');
  assert.equal(big.getAttribute('width'), '640');
  const link = [...dlg.querySelectorAll('a')].find((a) => /B-OFC-1/.test(a.textContent));
  assert.equal(link.getAttribute('href'), '/acme/cf_erp/batches/55');
  assert.ok([...dlg.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/acme/cf_erp/orders/100'));
  await act(async () => root.unmount());
});

await check('Inventory nav lists Work in progress and Offcuts after Stock', () => {
  const inv = m.SECTIONS.find((s) => s.key === 'inventory').screens.map((s) => s.path);
  assert.ok(inv.includes('wip') && inv.includes('offcuts'));
  assert.ok(inv.indexOf('wip') > inv.indexOf('stock'));
});

await check('routes and pages are wired in the source', async () => {
  const routes = await readFile('src/apps/cf_erp/routes.tsx', 'utf8');
  assert.match(routes, /path: '\/:company\/cf_erp\/wip', element: wrap\(<WorkInProgress \/>\)/);
  assert.match(routes, /path: '\/:company\/cf_erp\/offcuts', element: wrap\(<Offcuts \/>\)/);
  const page = await readFile('src/apps/cf_erp/pages/WorkInProgress.tsx', 'utf8');
  assert.match(page, /contains\.length > 0/); assert.match(page, /data-testid="wip-expand"/);
  assert.match(page, /useUrlParam\('orderId'/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(process.exitCode), 50);
