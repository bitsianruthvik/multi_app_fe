// Run from multi_app_fe: node scripts/cf_erp_working_note_test.mjs
// The wording of the slow-check notes (Lock, Release preview, piece codes) and the folder-rename offer.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'MouseEvent', 'KeyboardEvent', 'Event']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const entry = `export * from './src/apps/cf_erp/lib/working'; export * from './src/apps/cf_erp/lib/records'; export * from './src/apps/cf_erp/lib/tree'; export * from './src/apps/cf_erp/components/WorkingNote';`;
const built = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `working-note-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

await check('formatElapsed reads like a stopwatch', () => {
  assert.equal(m.formatElapsed(0), '0:00'); assert.equal(m.formatElapsed(23), '0:23'); assert.equal(m.formatElapsed(65), '1:05'); assert.equal(m.formatElapsed(-3), '0:00');
});
await check('Lock wording names the piece count when known, the rows when not, and warns a big line takes up to a minute', () => {
  assert.equal(m.lockCheckingText({ pieces: 6072 }), 'Checking values, cut pieces and working out 6,072 codes… (a big line takes up to a minute)');
  assert.match(m.lockCheckingText({ rows: 490 }, 2), /490 rows of structure × 2… \(a big line takes up to a minute\)/);
  assert.match(m.lockCheckingText({}, 1), /^Checking values, cut pieces and working out every piece's code… \(a big line/);
  assert.match(m.lockRecheckText(6072), /^Checking again — working out 6,072 codes…/);
});
await check('Piece tree and release wording', () => {
  assert.match(m.pieceTreeText(6072, 'pieces'), /^Working out 6,072 pieces and laying them out…/);
  assert.match(m.pieceTreeText(undefined, 'codes'), /^Working out every piece and its code…/);
  assert.match(m.releaseCheckText({ pieces: 6072 }), /release of 6,072 pieces, their steps and the material/);
  assert.match(m.releaseCheckText({}), /Working out what the release would create/);
});
await check('Line size is remembered per line across responses', () => {
  m.rememberLineSize(7, { rows: 490 }); m.rememberLineSize(7, { pieces: 6072 });
  assert.deepEqual(m.knownLineSize(7), { rows: 490, pieces: 6072 }); assert.deepEqual(m.knownLineSize(8), {});
});
await check('The timer shows only after 5 seconds', async () => {
  const root = createRoot(document.getElementById('app'));
  await React.act(() => root.render(React.createElement(m.WorkingNote, { elapsed: 4 }, 'Checking…')));
  assert.equal(document.querySelector('[data-testid="working-timer"]'), null);
  assert.equal(document.querySelector('[data-testid="working-note"]').textContent, 'Checking…');
  await React.act(() => root.render(React.createElement(m.WorkingNote, { elapsed: 23 }, 'Checking…')));
  assert.equal(document.querySelector('[data-testid="working-timer"]').textContent, '0:23');
  await React.act(() => root.render(React.createElement(m.Working, { active: false }, 'Checking…')));
  assert.equal(document.querySelector('[data-testid="working-note"]'), null);
  await React.act(() => root.unmount());
});
await check('Folder rename offer says what else the folder holds', () => {
  const others = m.folderSharers({ definitionCount: 4, itemCount: 0 }, 'definition');
  assert.deepEqual(others, { definitions: 3, items: 0 });
  assert.equal(m.folderSharingNote(others), 'It also holds 3 other definitions — they will show the new name too.');
  assert.equal(m.folderSharingNote({ definitions: 1, items: 0 }), 'It also holds 1 other definition — it will show the new name too.');
  assert.equal(m.folderSharingNote({ definitions: 2, items: 5 }), 'It also holds 2 other definitions and 5 items — they will show the new name too.');
  assert.equal(m.folderSharingNote(m.folderSharers({ definitionCount: 1, itemCount: 0 }, 'definition')), null);
  assert.equal(m.folderSharingNote(m.folderSharers(null, 'definition')), null);
});
await check('findNode finds a folder at any depth', () => {
  const tree = [{ id: 1, children: [{ id: 2, children: [{ id: 3, children: [] }] }] }];
  assert.equal(m.findNode(tree, 3).id, 3); assert.equal(m.findNode(tree, 9), null);
});
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
