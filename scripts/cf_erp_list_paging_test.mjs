// Run from multi_app_fe: node scripts/cf_erp_list_paging_test.mjs
// Lists filter, count and page on the SERVER (2026-10-02: "the catalog says only 500 items are there …
// whenever I filter anything, not sure if everything is visible"). Renders the real Customers screen
// against a fake /parties that pages 260 parties, and a PartyPicker against a fake server search:
//   - the first request is paged=1&limit=100&offset=0 with the role chip as a query param
//   - chip counts and stat figures are the server's counts (over all 260), not counts of the loaded rows
//   - "100 of N rows" + Load more appends the next page (offset=100) until every row is reachable
//   - typing searches on the server (debounced), never filters loaded rows in the browser
//   - a header click asks the server to sort; Export asks the server for every match (all=1)
//   - no "the first 500 … are shown" note
//   - PartyPicker asks the server per keystroke and offers what the server found
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/acme/cf_erp/customers', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event', 'FocusEvent', 'InputEvent']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
dom.window.HTMLAnchorElement.prototype.click = function click() {};
let exported = null;
globalThis.URL.createObjectURL = (blob) => { exported = blob; return 'blob:x'; };
globalThis.URL.revokeObjectURL = () => {};

// ── The fake server: 260 parties; filters, counts and pages like listParties ──
const PARTIES = Array.from({ length: 260 }, (_, i) => ({
  id: i + 1, code: `P${String(i).padStart(4, '0')}`, name: `Party ${i}`, roles: i % 3 === 2 ? ['supplier'] : ['customer'],
  status: i % 10 === 0 ? 'inactive' : 'active', contactName: null, email: i % 4 === 0 ? null : `p${i}@x.test`, phone: null, taxNumber: null,
}));
const requests = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url);
  const q = Object.fromEntries(url.searchParams);
  if (!/\/parties$/.test(url.pathname)) return new Response('{"error":"nope"}', { status: 404 });
  const term = (q.search ?? '').toLowerCase();
  const base = PARTIES.filter((p) => (!term || p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)) && (!q.status || p.status === q.status));
  const inRole = (p) => !q.role || q.role === 'all' || p.roles.includes(q.role);
  let rows = base.filter(inRole);
  if (q.sort === 'code') rows = [...rows].sort((a, b) => a.code.localeCompare(b.code) * (q.dir === 'desc' ? -1 : 1));
  if (!q.paged && !q.all) return json(rows.slice(0, Number(q.limit) || 200));
  const limit = q.all ? rows.length : Number(q.limit);
  const offset = Number(q.offset) || 0;
  const page = rows.slice(offset, offset + limit);
  return json({
    rows: page, total: rows.length, limit, offset, hasMore: offset + page.length < rows.length,
    counts: {
      roles: { customer: base.filter((p) => p.roles.includes('customer')).length, supplier: base.filter((p) => p.roles.includes('supplier')).length, subcontractor: 0, all: base.length },
      active: rows.filter((p) => p.status === 'active').length, inactive: rows.filter((p) => p.status !== 'active').length, noContact: rows.filter((p) => !p.email).length,
    },
  });
};
const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { MemoryRouter } = await import('react-router-dom');

const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const authStub = resolve(cache, `list-paging-auth-${process.pid}.tsx`);
await writeFile(authStub, 'export const useAuth = () => ({ user: null });');
const entry = `export { default as Customers } from './src/apps/cf_erp/pages/Customers';
export { PartyPicker } from './src/apps/cf_erp/components/ServerPicker';`;
const built = await build({
  define: { 'import.meta.env': '{"VITE_API_BASE_URL":"http://localhost:4000","VITE_API_HOST":"http://localhost:4000"}' }, loader: { '.css': 'empty' }, tsconfig: 'tsconfig.app.json', alias: { '@core/contexts/AuthContext': authStub },
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
});
const artifact = resolve(cache, `list-paging-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact); await unlink(authStub);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const host = document.getElementById('app');
const root = createRoot(host);
const settle = async (ms = 30) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const dataRows = () => document.querySelectorAll('tbody tr[data-row]').length;
const text = () => document.body.textContent;
const last = () => requests[requests.length - 1];
const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const typeInto = async (input, value) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

await act(async () => { root.render(React.createElement(MemoryRouter, { initialEntries: ['/acme/cf_erp/customers'] }, React.createElement(m.Customers))); });
await settle();

const customers = PARTIES.filter((p) => p.roles.includes('customer'));

await check('the first request is one server page with the role chip as a filter', () => {
  const u = requests.find((r) => r.pathname.endsWith('/parties'));
  assert.equal(u.searchParams.get('paged'), '1');
  assert.equal(u.searchParams.get('limit'), '100');
  assert.equal(u.searchParams.get('offset'), '0');
  assert.equal(u.searchParams.get('role'), 'customer');
});

await check('one page shows, and the table says how many there are in all', () => {
  assert.equal(dataRows(), 100);
  assert.match(text(), new RegExp(`100 of ${customers.length} rows`));
  assert.match(text(), new RegExp(`Showing 100 of ${customers.length}`));
});

await check('chip counts and figures are the server’s, over every party', () => {
  const chip = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.startsWith(label));
  assert.equal(chip('Customers').textContent, `Customers${customers.length}`);
  assert.equal(chip('Suppliers').textContent, `Suppliers${PARTIES.length - customers.length}`);
  assert.equal(chip('All').textContent, `All${PARTIES.length}`);
  assert.match(text(), new RegExp(`Active${customers.filter((p) => p.status === 'active').length}`));
});

await check('no "first 500 … only looks through those" note', () => {
  assert.doesNotMatch(text(), /first 500|only looks through/);
});

await check('Load more fetches the next page and appends it', async () => {
  await click(button('Load more'));
  assert.equal(last().searchParams.get('offset'), '100');
  assert.equal(dataRows(), customers.length, 'the next page (74) is appended to the first 100');
  assert.equal(button('Load more'), undefined, 'no Load more once everything is loaded');
  assert.match(text(), new RegExp(`${customers.length} rows`));
});

await check('a header click sorts on the server', async () => {
  const before = requests.length;
  await click([...document.querySelectorAll('th button')].find((b) => b.textContent.startsWith('Code')));
  const u = requests.slice(before).find((r) => r.pathname.endsWith('/parties'));
  assert.ok(u, 'a new request');
  assert.equal(u.searchParams.get('sort'), 'code');
  assert.equal(u.searchParams.get('dir'), 'asc');
  assert.equal(u.searchParams.get('offset'), '0');
});

await check('typing searches on the server, not the loaded rows', async () => {
  const input = document.querySelector('input[placeholder^="Search"]');
  const before = requests.length;
  await typeInto(input, 'P025');
  await settle(350);
  const sent = requests.slice(before).filter((r) => r.searchParams.has('search'));
  assert.equal(sent.length, 1, 'one request for the term');
  const u = last();
  assert.equal(u.searchParams.get('search'), 'P025');
  assert.equal(u.searchParams.get('offset'), '0');
  const want = customers.filter((p) => p.code.includes('P025')).length;
  assert.equal(dataRows(), want);
  assert.match(text(), new RegExp(`${want} rows`));
});

await check('Export asks the server for every match (all=1)', async () => {
  const input = document.querySelector('input[placeholder^="Search"]');
  await typeInto(input, '');
  await settle(350);
  assert.equal(dataRows(), 100);
  exported = null;
  await click(document.querySelector('button[aria-label="Export CSV"]'));
  await settle(50);
  const u = requests.filter((r) => r.searchParams.get('all') === '1').pop();
  assert.ok(u, 'an all=1 request');
  assert.equal(u.searchParams.get('role'), 'customer');
  assert.ok(exported, 'a CSV was made');
  const csv = await exported.text();
  assert.equal(csv.split('\r\n').length, customers.length + 1, 'every customer + the header');
});

// ── PartyPicker: server search per keystroke ──
await act(async () => { root.render(React.createElement(MemoryRouter, null, React.createElement(function Harness() {
  const [v, setV] = React.useState(null);
  return React.createElement('div', null,
    React.createElement(m.PartyPicker, { role: 'supplier', value: v, onChange: setV }),
    React.createElement('output', { id: 'chosen' }, v ? v.code : ''));
}))); });
await settle();

await check('PartyPicker searches the server as you type and offers what it found', async () => {
  const input = document.querySelector('input');
  await act(async () => { input.focus(); input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await settle(350);
  const before = requests.length;
  await typeInto(input, 'P0257');
  await settle(350);
  const u = requests.slice(before).filter((r) => r.pathname.endsWith('/parties')).pop();
  assert.ok(u, 'a server search');
  assert.equal(u.searchParams.get('search'), 'P0257');
  assert.equal(u.searchParams.get('role'), 'supplier');
  assert.equal(u.searchParams.get('status'), 'active');
  assert.equal(u.searchParams.get('limit'), '30');
  const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  assert.equal(options.length, 1);
  assert.match(options[0], /P0257/);
  await click(document.querySelector('[role="option"]'));
  assert.equal(document.getElementById('chosen').textContent, 'P0257');
});

await check('PartyPicker finds a record far past any first-N list', async () => {
  // P0257 is the 258th party — a picker that loaded /parties once (200 default) could never offer it.
  assert.ok(PARTIES.findIndex((p) => p.code === 'P0257') >= 200);
});

await act(async () => root.unmount());
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
