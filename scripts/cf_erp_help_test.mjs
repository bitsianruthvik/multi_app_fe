// Run from multi_app_fe: node scripts/cf_erp_help_test.mjs [--strict]
// IN-APP HELP (TM/CF_ERP_HELP_SPEC.md, 2026-10-19): src/apps/cf_erp/help/.
//   front matter parsing; route / tab matching (topicsForLocation: tab topics first, then the screen's); search;
//   by role / by area (a role's manual: its Getting started guide first); the Markdown subset rendered as React
//   elements (each construct; raw HTML stays text); link handling (help: opens a topic, /route stays in the company,
//   javascript: is no link); the panel in jsdom — the "i" button, `?`, tabs when several topics match, a help: link
//   with Back, search, and the no-match fallback (never an empty drawer); the Help page (?role= manual, print copy).
//   Last: every real topic under help/content is read — problems are listed (they fail the run only with --strict,
//   since the content is written by other hands in parallel).
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink, readdir, readFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const STRICT = process.argv.includes('--strict');
const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/placebo/cf_erp/orders/9001?tab=nesting', pretendToBeVisual: true });
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  try { Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true }); } catch { /* skip */ }
}
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.matchMedia = (q) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
globalThis.matchMedia = dom.window.matchMedia;
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

// load.ts uses Vite's import.meta.glob; the test hands the index in instead.
globalThis.__helpIndex = null;
const loadStub = 'export const helpIndex = () => globalThis.__helpIndex;';
const built = await build({
  stdin: {
    contents: `import * as React from 'react'; import { createRoot } from 'react-dom/client';
      import { act } from 'react'; import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
      export { React, createRoot, act, MemoryRouter, Routes, Route, useLocation };
      export * from './src/apps/cf_erp/help/frontmatter';
      export * from './src/apps/cf_erp/help/markdown';
      export * from './src/apps/cf_erp/help/registry';
      export { MarkdownView } from './src/apps/cf_erp/help/MarkdownView';
      export { HelpProvider } from './src/apps/cf_erp/help/HelpProvider';
      export { HelpButton } from './src/apps/cf_erp/help/HelpButton';
      export { default as HelpPage } from './src/apps/cf_erp/pages/Help';`,
    resolveDir: process.cwd(), loader: 'tsx',
  },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /\/load$/ }, (a) => (a.importer.includes(`${'help'}`) || a.path.includes('help/load') ? { path: 'load', namespace: 'stub' } : undefined));
    b.onLoad({ filter: /^load$/, namespace: 'stub' }, () => ({ contents: loadStub, loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error', jsx: 'automatic',
  tsconfig: 'tsconfig.app.json',
  define: { 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}', 'process.env.NODE_ENV': '"development"' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const file = resolve(cache, `cf_erp_help_${process.pid}.mjs`);
await writeFile(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href);
await unlink(file);

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { if (cond) pass += 1; else { fail += 1; console.error('FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); } };
const eq = (label, a, b) => { try { assert.deepStrictEqual(a, b); pass += 1; } catch { fail += 1; console.error('FAIL', label, JSON.stringify(a), '!==', JSON.stringify(b)); } };

// ── 1. front matter ──
{
  const raw = `---
id: order-nesting            # unique, kebab-case
title: "Nesting: plates # and pieces"
area: order
roles: [production, design]   # who
routes: ["/:company/cf_erp/orders/:id", '/:company/cf_erp/x']
tab: nesting
order: 30
---
Body line.

## What you see
`;
  const f = M.parseFrontmatter(raw);
  eq('fm: no errors', f.errors, []);
  eq('fm: id, comment dropped', f.data.id, 'order-nesting');
  eq('fm: quoted title keeps # and :', f.data.title, 'Nesting: plates # and pieces');
  eq('fm: inline list', f.data.roles, ['production', 'design']);
  eq('fm: quoted list items (both quotes)', f.data.routes, ['/:company/cf_erp/orders/:id', '/:company/cf_erp/x']);
  eq('fm: number', f.data.order, 30);
  eq('fm: body starts after the closing ---', f.body.split('\n')[0], 'Body line.');
  const block = M.parseFrontmatter('---\nid: a\nroles:\n  - sales\n  - stores\ntab:\n---\nx');
  eq('fm: block list', block.data.roles, ['sales', 'stores']);
  eq('fm: empty key = null', block.data.tab, null);
  ok('fm: CRLF and BOM read', M.parseFrontmatter('﻿---\r\nid: b\r\n---\r\nhi').data.id === 'b');
  ok('fm: no header → error, body kept', M.parseFrontmatter('# Just text').errors.length === 1 && M.parseFrontmatter('# Just text').body === '# Just text');
  ok('fm: unclosed header → error', /not closed/.test(M.parseFrontmatter('---\nid: x\n').errors[0]));
  ok('fm: a line it cannot read is named', /cannot read/.test(M.parseFrontmatter('---\nid: x\n!!bad\n---\n').errors[0]));
  ok('fm: a key twice is named', /twice/.test(M.parseFrontmatter('---\nid: x\nid: y\n---\n').errors[0]));
  eq('fm: empty inline list stays a list', M.parseFrontmatter('---\nroles: []\n---\n').data.roles, []);
}

// ── fixture topics ──
const T = (p, fm, body = 'Text.') => [p, `---\n${fm}\n---\n${body}`];
const files = Object.fromEntries([
  T('./content/order/order-page.md', 'id: order-page\ntitle: The order page\narea: order\nroles: [sales, design]\nroutes: ["/:company/cf_erp/orders/:id"]\norder: 10', 'The order page. See [Nesting](help:order-nesting).'),
  T('./content/order/order-nesting.md', 'id: order-nesting\ntitle: Nesting\narea: order\nroles: [design, production]\nroutes: ["/:company/cf_erp/orders/:id"]\ntab: nesting\norder: 30', '## What you see\nPlates and **pieces**. Back to [the page](help:order-page). Go to [Stock](/stock).'),
  T('./content/order/order-lock.md', 'id: order-lock\ntitle: Freeze design\narea: order\nroles: [design]\nroutes: ["/:company/cf_erp/orders/:id"]\ntab: lock\norder: 20'),
  T('./content/order/order-structure.md', 'id: order-structure\ntitle: Structure and values\narea: order\nroles: [design]\nroutes: ["/:company/cf_erp/orders/:id"]\ntab: [structure, values]\norder: 15'),
  T('./content/sales/sales-orders.md', 'id: sales-orders\ntitle: Orders\narea: sales\nroles: [sales, management]\nroutes: ["/:company/cf_erp/orders"]\norder: 10', 'Every order. Search words: girder bridge.'),
  T('./content/stores/stores-stock.md', 'id: stores-stock\ntitle: Stock\narea: stores\nroles: [stores]\nroutes: ["/:company/cf_erp/stock"]\norder: 10', 'On hand. Plates too.'),
  T('./content/production/production-dashboard.md', 'id: production-dashboard\ntitle: Dashboard machines\narea: production\nroles: [production]\nroutes: ["/:company/cf_erp/management"]\ntab: machines\norder: 10'),
  T('./content/roles/roles-stores.md', 'id: roles-stores\ntitle: Getting started as Stores\narea: roles\nroles: [stores]\nroutes: []\norder: 1', 'Your day. First [Stock](help:stores-stock).'),
  T('./content/roles/roles-sales.md', 'id: roles-sales\ntitle: Getting started as Sales\narea: roles\nroles: [sales]\norder: 1'),
  T('./content/stores/bad-one.md', 'id: not-the-file\ntitle: Bad\narea: stores\nroles: [storekeeper]\nroutes: [stock]'),
  T('./content/stores/dupe.md', 'id: stores-stock\ntitle: Dupe\narea: stores'),
]);
const index = M.buildIndex(files);

// ── 2. the index ──
ok('index: duplicate id left out and reported', index.byId.get('stores-stock').title === 'Stock' && index.problems.some((p) => /dupe\.md.*used by/.test(p)), index.problems);
ok('index: header problems reported (id ≠ file, unknown role, route without /)', index.problems.some((p) => /bad-one.*is not the file name.*unknown role "storekeeper".*does not start with \//.test(p)), index.problems);
ok('index: a topic with problems still shows', index.byId.has('not-the-file'));
eq('index: tab list', index.byId.get('order-structure').tabs, ['structure', 'values']);
eq('index: no routes = []', index.byId.get('roles-sales').routes, []);
eq('index: sorted area by area (roles first, then order, then stores)', index.topics.map((t) => t.area).filter((a, i, xs) => xs.indexOf(a) === i), ['roles', 'sales', 'order', 'stores', 'production']);

// ── 3. route / tab matching ──
ok('route: :param segments', M.matchRoute('/:company/cf_erp/orders/:id', '/placebo/cf_erp/orders/12'));
ok('route: literal must be equal', !M.matchRoute('/:company/cf_erp/orders/:id', '/placebo/cf_erp/invoices/12'));
ok('route: length must be equal', !M.matchRoute('/:company/cf_erp/orders', '/placebo/cf_erp/orders/12'));
ok('route: trailing slash and query ignored', M.matchRoute('/:company/cf_erp/orders', '/placebo/cf_erp/orders/?x=1'));
const ids = (xs) => xs.map((t) => t.id);
eq('location: tab topic first, then the screen\'s, other tabs left out', ids(M.topicsForLocation(index, '/p/cf_erp/orders/5', '?tab=nesting')), ['order-nesting', 'order-page']);
eq('location: a list of tabs matches each', ids(M.topicsForLocation(index, '/p/cf_erp/orders/5', '?tab=values&line=2')), ['order-structure', 'order-page']);
eq('location: explicit tab beats the URL (the stage button)', ids(M.topicsForLocation(index, '/p/cf_erp/orders/5', '?tab=nesting', 'lock')), ['order-lock', 'order-page']);
eq('location: no tab known → the screen\'s first, then every tab topic', ids(M.topicsForLocation(index, '/p/cf_erp/orders/5', '')), ['order-page', 'order-structure', 'order-lock', 'order-nesting']);
eq('location: a tab nobody wrote → the screen\'s topic', ids(M.topicsForLocation(index, '/p/cf_erp/orders/5', '?tab=details')), ['order-page']);
eq('location: ?view= counts as the tab (Tracker, Planner)', M.tabOfSearch('?view=flat'), 'flat');
eq('location: ?tab= wins over ?view=', M.tabOfSearch('tab=a&view=b'), 'a');
eq('location: list screen', ids(M.topicsForLocation(index, '/p/cf_erp/orders', '')), ['sales-orders']);
eq('location: page default tab passed by the page button', ids(M.topicsForLocation(index, '/p/cf_erp/management', '', 'machines')), ['production-dashboard']);
eq('location: nothing for this screen → []', ids(M.topicsForLocation(index, '/p/cf_erp/planner', '')), []);

// ── 4. search, by role, by area ──
eq('search: every word must appear', ids(M.searchTopics(index, 'girder bridge')), ['sales-orders']);
eq('search: title hits first', ids(M.searchTopics(index, 'stock')).slice(0, 1), ['stores-stock']);
eq('search: empty query → nothing', M.searchTopics(index, '   '), []);
eq('search: case-insensitive, bold text found', ids(M.searchTopics(index, 'PIECES')), ['order-nesting']);
eq('role manual: getting-started guide first, then area by area', ids(M.manualForRole(index, 'stores')), ['roles-stores', 'stores-stock']);
eq('role manual: design', ids(M.manualForRole(index, 'design')), ['order-page', 'order-structure', 'order-lock', 'order-nesting']);
eq('by area: in order', ids(M.topicsForArea(index, 'order')), ['order-page', 'order-structure', 'order-lock', 'order-nesting']);
eq('areas in use: manual order', M.areasInUse(index), ['roles', 'sales', 'order', 'stores', 'production']);

// ── 5. links ──
eq('link: help:<id>', M.classifyLink('help:purchase-requests'), { kind: 'help', id: 'purchase-requests' });
eq('link: /route', M.classifyLink('/orders?status=open'), { kind: 'route', path: '/orders?status=open' });
eq('link: https', M.classifyLink('https://gst.gov.in'), { kind: 'external', href: 'https://gst.gov.in' });
eq('link: javascript: is no link', M.classifyLink('javascript:alert(1)'), { kind: 'none' });
eq('link: protocol-relative //evil is no link', M.classifyLink('//evil.com/x'), { kind: 'none' });
eq('link: data: is no link', M.classifyLink('data:text/html,hi'), { kind: 'none' });
eq('routeHref: screen path', M.routeHref('/orders', 'placebo'), '/placebo/cf_erp/orders');
eq('routeHref: app path', M.routeHref('/cf_erp/stock?kind=plate', 'placebo'), '/placebo/cf_erp/stock?kind=plate');
eq('routeHref: full pattern', M.routeHref('/:company/cf_erp/billing', 'placebo'), '/placebo/cf_erp/billing');

// ── 6. Markdown → blocks ──
{
  const b = M.parseMarkdown('# Top\n## What you see\n### Small\nA para\ncontinues here.\n\n- one\n- two **bold**\n  - nested\n- three\n\n1. first\n2. second\n\n> Note: careful\n> still the note\n\n> Just a quote');
  eq('md: block kinds', b.map((x) => x.t), ['h', 'h', 'h', 'p', 'ul', 'ol', 'quote', 'quote']);
  eq('md: # reads as ##, ### stays', b.slice(0, 3).map((x) => x.level), [2, 2, 3]);
  eq('md: paragraph lines joined', M.inlineText(b[3].c), 'A para continues here.');
  eq('md: list items', b[4].items.map((i) => M.inlineText(i.c)), ['one', 'two bold', 'three']);
  eq('md: nested list under its item', b[4].items[1].sub && b[4].items[1].sub.items.map((i) => M.inlineText(i.c)), ['nested']);
  eq('md: ordered list', [b[5].t, b[5].items.length, b[5].start], ['ol', 2, 1]);
  ok('md: "> Note:" is a note; a plain quote is not', b[6].note === true && b[7].note === false);
  eq('md: quote lines joined', M.inlineText(b[6].blocks[0].c), 'Note: careful still the note');
  const lists = M.parseMarkdown('1. a\n\n2. b\n\n- c');
  eq('md: loose ordered list stays one list; a bullet list after it is another', lists.map((x) => [x.t, x.items.length]), [['ol', 2], ['ul', 1]]);
  eq('md: ordered list may start at 3', M.parseMarkdown('3. c\n4. d')[0].start, 3);
}
{
  const inl = M.parseInline('a **b** *c* _d_ `e*f` [g **h**](help:x) \\*no\\* snake_case 2 * 3 [bad](javascript:x)');
  eq('inline: node kinds', inl.map((n) => n.t), ['text', 'b', 'text', 'i', 'text', 'i', 'text', 'code', 'text', 'link', 'text', 'link']);
  eq('inline: code keeps * as text', inl[7].v, 'e*f');
  eq('inline: link text may be bold', inl[9].c.map((n) => n.t), ['text', 'b']);
  eq('inline: escapes, snake_case and a lone * stay text', inl[10].v, ' *no* snake_case 2 * 3 ');
  eq('inline: bad scheme becomes kind none', inl[11].link.kind, 'none');
  eq('inline: unclosed marks are text', M.inlineText(M.parseInline('**open and `tick and [link')), '**open and `tick and [link');
}

// ── 7. rendered as React elements ──
// Rendered into a detached element (react-dom/server needs node's util, which the ESM bundle cannot require).
const render = async (md, links = {}) => {
  const el = document.createElement('div');
  const r = M.createRoot(el);
  await M.act(async () => { r.render(M.React.createElement(M.MemoryRouter, null,
    M.React.createElement(M.MarkdownView, { source: md, links: { company: 'placebo', onOpenTopic() {}, ...links } }))); });
  const html = el.innerHTML.replace(/ class="[^"]*"/g, '');
  await M.act(async () => r.unmount());
  return html;
};
{
  const html = await render('## Head\n### Sub\nPara **b** *i* `c`.\n\n- x\n- y\n\n1. p\n2. q\n\n> Note: n\n\n[T](help:order-page) [S](/stock) [E](https://example.com) [J](javascript:void)');
  ok('render: h2', /<h2[^>]*>Head<\/h2>/.test(html), html);
  ok('render: h3', /<h3[^>]*>Sub<\/h3>/.test(html));
  ok('render: p with strong / em / code', /<p[^>]*>Para <strong>b<\/strong> <em>i<\/em> <code[^>]*>c<\/code>\.<\/p>/.test(html), html);
  ok('render: ul with li', /<ul[^>]*><li>x<\/li><li>y<\/li><\/ul>/.test(html), html);
  ok('render: ol with li', /<ol[^>]*><li>p<\/li><li>q<\/li><\/ol>/.test(html), html);
  ok('render: note blockquote', /<blockquote[^>]*data-note="true"[^>]*><p[^>]*>Note: n<\/p><\/blockquote>/.test(html), html);
  ok('render: help link', /<a[^>]*href="\?topic=order-page"[^>]*data-help-topic="order-page"[^>]*>T<\/a>/.test(html), html);
  ok('render: route link inside the company', /<a[^>]*href="\/placebo\/cf_erp\/stock"[^>]*>S<\/a>/.test(html), html);
  ok('render: external link opens apart', /<a[^>]*href="https:\/\/example.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>E<\/a>/.test(html), html);
  ok('render: javascript: link is plain text', !/javascript/.test(html) && / J<\/p>/.test(html), html);
  const raw = await render('<script>alert(1)</script> <b>x</b> <img src=x onerror=alert(1)>');
  ok('render: raw HTML stays text (escaped)', !/<script|<b>|<img/.test(raw) && /&lt;script&gt;/.test(raw), raw);
  const unknown = await render('[Later](help:not-written)', { known: (id) => id === 'order-page' });
  ok('render: a help link to a topic not written yet is text, not a link', !/<a/.test(unknown) && /Later/.test(unknown), unknown);
}

// ── 8. the panel, in jsdom ──
globalThis.__helpIndex = index;
// A fresh root per mount: MemoryRouter reads initialEntries only once.
let root = null;
const origError = console.error;
console.error = (...a) => { if (/not wrapped in act/.test(String(a[0]))) return; origError(...a); };
let where = null;
function Where() { where = M.useLocation(); return null; }
const mount = async (url, el) => {
  if (root) await M.act(async () => root.unmount());
  root = M.createRoot(document.getElementById('app'));
  await M.act(async () => {
    root.render(M.React.createElement(M.MemoryRouter, { initialEntries: [url] },
      M.React.createElement(M.HelpProvider, { onShortcuts: () => { globalThis.__shortcuts = true; } },
        M.React.createElement(Where), el)));
  });
};
const tick = () => M.act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const click = async (el) => { if (process.env.DEBUG_CLICK) console.log('click', el?.outerHTML?.slice(0, 120)); await M.act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); }); await tick(); };
const drawer = () => document.querySelector('.MuiDrawer-paper');
const text = () => drawer()?.textContent ?? '';
const setInput = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await M.act(async () => { setter.call(input, value); input.dispatchEvent(new window.Event('input', { bubbles: true })); });
  await tick();
};
{
  const Btn = (props) => M.React.createElement(M.HelpButton, props);
  await mount('/placebo/cf_erp/orders/5?tab=nesting', M.React.createElement('div', null, Btn({}), Btn({ tab: 'lock', label: 'Help for Freeze design' })));
  const buttons = document.querySelectorAll('[data-help-button]');
  ok('panel: buttons drawn with the tooltip label', buttons.length === 2 && buttons[0].getAttribute('aria-label') === 'Help for this page' && buttons[1].getAttribute('aria-label') === 'Help for Freeze design');
  ok('panel: closed until asked', !drawer());
  await click(buttons[0]);
  await tick();
  ok('panel: opens on the "i" button', !!drawer(), document.body.innerHTML.slice(0, 300));
  const tabs = [...drawer().querySelectorAll('[role="tab"]')].map((t) => t.textContent);
  eq('panel: several topics → tabs, the stage\'s first', tabs, ['Nesting', 'The order page']);
  ok('panel: shows the best match', drawer().querySelector('article')?.getAttribute('data-help-topic-id') === 'order-nesting');
  // a help: link inside the topic opens that topic, with Back
  await click(drawer().querySelector('a[data-help-topic="order-page"]'));
  ok('panel: help: link opens the topic', drawer().querySelector('article')?.getAttribute('data-help-topic-id') === 'order-page' && /Back/.test(text()));
  await click([...drawer().querySelectorAll('button')].find((b) => b.textContent === 'Back'));
  ok('panel: Back returns', drawer().querySelector('article')?.getAttribute('data-help-topic-id') === 'order-nesting');
  // search
  const input = drawer().querySelector('input[aria-label="Search all help"]');
  await setInput(input, 'girder');
  ok('panel: search lists matches over all topics', /Orders/.test(text()) && !drawer().querySelector('article'), text());
  await setInput(input, 'zzzz');
  ok('panel: search with no result says so', /Nothing found/.test(text()));
  // the stage button
  await click(document.querySelector('[data-help-button="lock"]'));
  ok('panel: the stage button opens the stage topic first (search cleared)', drawer().querySelector('article')?.getAttribute('data-help-topic-id') === 'order-lock' && input.value === '', drawer().querySelector('article')?.getAttribute('data-help-topic-id'));
  // a route link closes the panel and navigates inside the company
  await click(document.querySelector('[role="tab"]:nth-child(2)'));
  await click(drawer().querySelector('a[data-help-topic="order-nesting"]'));
  await click([...drawer().querySelectorAll('a')].find((a) => a.textContent === 'Stock'));
  ok('panel: /route link navigates within the company', where?.pathname === '/placebo/cf_erp/stock', where?.pathname);
  // Esc closes
  await M.act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await M.act(async () => { drawer()?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await tick(); await new Promise((r) => setTimeout(r, 400)); await tick();
  ok('panel: Esc closes', !drawer() || drawer().closest('.MuiModal-hidden') || getComputedStyle(drawer().closest('.MuiDrawer-root')).visibility === 'hidden' || drawer().closest('[aria-hidden="true"]'));
}
{
  // `?` opens it; not while typing; no-match fallback
  await mount('/placebo/cf_erp/planner', M.React.createElement('input', { id: 'f' }));
  await tick(); await new Promise((r) => setTimeout(r, 400)); await tick();
  const typingIn = document.getElementById('f');
  await M.act(async () => { typingIn.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true })); });
  await tick();
  const openNow = () => !!drawer() && !drawer().closest('[aria-hidden="true"]') && !drawer().closest('.MuiModal-hidden');
  ok('?: ignored while typing in a field', !openNow());
  await M.act(async () => { document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true })); });
  await tick();
  ok('?: opens the panel', openNow());
  ok('no match: says so, offers the role manuals and search', /No help is written for this screen yet/.test(text()) && /Stores/.test(text()) && !!drawer().querySelector('input[aria-label="Search all help"]') && !!drawer().querySelector('[data-help-nomatch]'), text());
  ok('no match: never empty — the full manual button is there', /Open the full manual/.test(text()));
  await click([...drawer().querySelectorAll('.MuiChip-root')].find((c) => c.textContent === 'Stores'));
  ok('no match: a role chip opens that role\'s manual', where?.pathname === '/placebo/cf_erp/help' && where?.search === '?role=stores', where);
  await click(document.querySelector('[data-help-button]') ?? document.body);
}
{
  // keyboard shortcuts button inside the panel
  await mount('/placebo/cf_erp/stock', M.React.createElement(M.HelpButton, {}));
  await click(document.querySelector('[data-help-button]'));
  ok('panel: Stock topic', drawer().querySelector('article')?.getAttribute('data-help-topic-id') === 'stores-stock' && !drawer().querySelector('[role="tab"]'));
  globalThis.__shortcuts = false;
  await click(drawer().querySelector('button[aria-label="Keyboard shortcuts"]'));
  ok('panel: the keyboard button opens the shortcuts sheet', globalThis.__shortcuts === true);
}

// ── 9. the Help page ──
{
  await mount('/placebo/cf_erp/help?role=stores', M.React.createElement(M.Routes, null, M.React.createElement(M.Route, { path: '/:company/cf_erp/help', element: M.React.createElement(M.HelpPage) })));
  await tick();
  const arts = [...document.querySelectorAll('#app article')].map((a) => a.getAttribute('data-help-topic-id'));
  eq('page ?role=stores: the manual, guide first', arts, ['roles-stores', 'stores-stock']);
  ok('page: Print button', [...document.querySelectorAll('#app button')].some((b) => b.textContent === 'Print'));
  const printRoot = document.querySelector('body > .cf-help-print-root');
  ok('page: a print copy sits directly in <body> (outside the app chrome)', !!printRoot && printRoot.querySelectorAll('article').length === 2);
  ok('page: left list by role and by area', /By role/.test(document.getElementById('app').textContent) && /By area/.test(document.getElementById('app').textContent) && /Maintenance/.test(document.getElementById('app').textContent));
  await mount('/placebo/cf_erp/help?topic=order-nesting', M.React.createElement(M.Routes, null, M.React.createElement(M.Route, { path: '/:company/cf_erp/help', element: M.React.createElement(M.HelpPage) })));
  eq('page ?topic=: one topic', [...document.querySelectorAll('#app article')].map((a) => a.getAttribute('data-help-topic-id')), ['order-nesting']);
  ok('page ?topic=: no print copy outside a role manual', !document.querySelector('body > .cf-help-print-root'));
  await click(document.querySelector('#app a[data-help-topic="order-page"]'));
  eq('page: a help: link opens the topic on the page', where?.search, '?topic=order-page');
  await mount('/placebo/cf_erp/help?topic=nope', M.React.createElement(M.Routes, null, M.React.createElement(M.Route, { path: '/:company/cf_erp/help', element: M.React.createElement(M.HelpPage) })));
  ok('page: an unknown topic says so', /There is no help topic “nope”/.test(document.getElementById('app').textContent));
}
await M.act(async () => root.unmount());

// ── 10. the real topics ──
{
  const dir = resolve('src/apps/cf_erp/help/content');
  const real = {};
  const walk = async (d) => {
    let entries = [];
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.md')) real[`./content/${relative(dir, p).replace(/\\/g, '/')}`] = await readFile(p, 'utf8');
    }
  };
  await walk(dir);
  const ri = M.buildIndex(real);
  // Every help: link must name a topic; every route a pattern in routes.tsx.
  const routesSrc = await readFile(resolve('src/apps/cf_erp/routes.tsx'), 'utf8');
  const patterns = new Set([...routesSrc.matchAll(/path: '([^']+)'/g)].map((m) => m[1]));
  const issues = [...ri.problems];
  for (const t of ri.topics) {
    for (const r of t.routes) if (!patterns.has(r)) issues.push(`${t.file}: route "${r}" is not in routes.tsx`);
    for (const m of t.body.matchAll(/\]\(help:([^)]+)\)/g)) if (!ri.byId.has(m[1])) issues.push(`${t.file}: help:${m[1]} — no such topic (yet)`);
  }
  console.log(`real topics: ${ri.topics.length} read, ${issues.length} note(s)${issues.length ? ':' : ''}`);
  for (const i of issues.slice(0, 40)) console.log('  -', i);
  if (issues.length > 40) console.log(`  … and ${issues.length - 40} more`);
  if (STRICT) ok('real topics: no problems (--strict)', issues.length === 0);
  else ok('real topics: every file reads as a topic', Object.keys(real).length === ri.topics.length + ri.problems.filter((p) => /used by|no id/.test(p)).length);
}

console.log(`cf_erp_help_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
