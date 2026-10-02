// Run from multi_app_fe: node scripts/cf_erp_po_order_link_test.mjs
// Purchase orders bought FOR a sales order: the helpers call the right paths, and the screens carry the pieces
// (For cell + dialog, header default, held section, Let go, Held for order column). Static source checks, like the other cf_erp scripts.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

globalThis.__calls = [];
globalThis.window = { location: { pathname: '/testco/cf_erp/purchase-orders/1' } };
const stubs = { '@core/api/client': 'export async function apiFetch(url, opts = {}) { globalThis.__calls.push({ url, method: opts.method ?? "GET", body: opts.body }); return { ok: true }; }' };
const built = await build({
  stdin: { contents: "export { setLineOrders, releaseHold } from './src/apps/cf_erp/api/procurement';", resolveDir: process.cwd(), loader: 'ts' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^@core\/api\/client$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'js' }));
  } }],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error',
  define: { 'import.meta.env': '{"VITE_API_HOST":"http://localhost:4000"}' },
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `po-order-link-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };
const src = (p) => readFileSync(resolve('src/apps/cf_erp', p), 'utf8');
const last = () => globalThis.__calls[globalThis.__calls.length - 1];

await check('setLineOrders PUTs the allocations to /purchase-lines/:id/orders', async () => {
  await m.setLineOrders(42, [{ orderId: 7, quantity: 12 }, { orderId: 9, quantity: 3 }]);
  assert.match(last().url, /\/purchase-lines\/42\/orders$/);
  assert.equal(last().method, 'PUT');
  assert.deepEqual(last().body, { orders: [{ orderId: 7, quantity: 12 }, { orderId: 9, quantity: 3 }] });
});
await check('releaseHold POSTs /stock/holds/:id/release', async () => {
  await m.releaseHold(5);
  assert.match(last().url, /\/stock\/holds\/5\/release$/);
  assert.equal(last().method, 'POST');
});
await check('PO detail has a For cell with order chips, unlinked text and an edit action', () => {
  const s = src('pages/PurchaseOrderDetail.tsx');
  assert.match(s, /key: 'for'/); assert.match(s, /unlinked \{qtyText/); assert.match(s, /LineOrdersDialog/); assert.match(s, /const editable = canManage && open/);
  assert.match(s, /\{editable && \(\s*<Tooltip title="Change which sales orders/);
});
await check('PO header shows and edits "For sales order"; the add-line dialog is prefilled from it', () => {
  const s = src('pages/PurchaseOrderDetail.tsx'); const d = src('components/PurchaseDialogs.tsx');
  assert.match(s, /Fact label="For sales order"/); assert.match(s, /forOrder=\{p\.forOrder\}/);
  assert.match(d, /forOrderId: forOrder\?\.id \?\? null/); assert.match(d, /For sales order \(optional\)/);
  assert.match(d, /setLineOrder\(asOrder\(forOrder\)\)/); assert.match(d, /orderId: lineOrder\?\.id \?\? null/);
});
await check('Line dialog edits rows (order + quantity), add/remove, and enforces sum / received / once-only', () => {
  const d = src('components/PurchaseDialogs.tsx');
  assert.match(d, /export function LineOrdersDialog/); assert.match(d, /Add an order/); assert.match(d, /Remove this row/);
  assert.match(d, /An order can appear only once/); assert.match(d, /already arrived against it/); assert.match(d, /more than the line/);
  assert.match(d, /setLineOrders\(line\.id/);
});
await check('Receiving reports what was held for which order', () => {
  const s = src('pages/PurchaseOrderDetail.tsx'); const d = src('components/PurchaseDialogs.tsx');
  assert.match(d, /held\?: HeldReceipt\[\]/); assert.match(s, /Held \$\{qtyText\(h\.quantity\)\} for \$\{h\.orderCode\}/); assert.match(s, /nobody else can use it/);
});
await check('OrderBuyingPanel renders the held section and the old "names no order" gap text is gone', () => {
  const o = src('components/Buying/OrderBuyingPanel.tsx'); const b = src('pages/Buying.tsx');
  assert.match(o, /Held for this order/); assert.match(o, /order-held-row/); assert.match(o, /Arrived on a purchase order bought for this order\. Release uses it first\./);
  assert.doesNotMatch(o, /names no order/); assert.doesNotMatch(b, /names no order/);
});
await check('Item stock renders held reservations with a Let go action behind canManage and a confirm', () => {
  const s = src('components/ItemStockPanel.tsx');
  assert.match(s, /Held — bought on/); assert.match(s, /Held for the order/); assert.match(s, /v\.kind === 'held' && canManage/);
  assert.match(s, /Let go of this hold\? The stock becomes free for any job\./); assert.match(s, /releaseHold\(letting\.id\)/);
});
await check('Buy list shows what the row\'s order already has held; types carry the new fields', () => {
  assert.match(src('pages/BuyList.tsx'), /header: 'Held for order'/);
  const t = src('api/types.ts');
  for (const k of ['held?: number', "kind?: 'material' | 'finished' | 'held'", 'orderCodes?: string[]', 'unlinked?: number']) assert.ok(t.includes(k), k);
  assert.match(src('api/buying.ts'), /held\?: \{ total: number; rows: HeldRow\[\] \}/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
