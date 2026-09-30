// Run from multi_app_fe: node scripts/sheet_grid_test.mjs
// DOM-level interaction tests for src/shared/ui/SheetGrid.tsx. They do not replace a visual browser review.
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
const built = await build({ stdin: { contents: `export * from './src/shared/ui/SheetGrid';`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `sheet-grid-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);
let passed = 0, failed = 0;
const check = async (label, fn) => { try { await fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

// Rows: a (parent), b, c (children of a), d. Columns: qty, note (text), flag (bool), kind (option), calc (computed).
const rows = [
  { key: 'a', label: 'Row A', header: 'Row A', depth: 0, collapsible: true, collapsed: false },
  { key: 'b', label: 'Row B', header: 'Row B', depth: 1 },
  { key: 'c', label: 'Row C', header: 'Row C', depth: 1 },
  { key: 'd', label: 'Row D', header: 'Row D', depth: 0 },
];
const columns = [
  { key: 'qty', label: 'Qty', header: 'Qty' }, { key: 'note', label: 'Note', header: 'Note' }, { key: 'flag', label: 'Flag', header: 'Flag' },
  { key: 'kind', label: 'Kind', header: 'Kind' }, { key: 'calc', label: 'Calc', header: 'Calc' }, { key: 'gap', label: 'Gap', header: 'Gap' },
];
const data = { a: { qty: '1' }, b: { qty: '2' }, c: { qty: '3' }, d: { qty: '4' } };
const cellAt = (r, c) => {
  if (c === 'qty') return { text: data[r].qty, editable: r !== 'c', why: r === 'c' ? 'Row C is locked.' : undefined, kind: 'number' };
  if (c === 'note') return { text: data[r].note ?? '', editable: true, tone: data[r].note ? 'strong' : 'normal' };
  if (c === 'flag') return { text: data[r].flag === 'true' ? 'Yes' : data[r].flag === 'false' ? 'No' : '', input: data[r].flag ?? '', editable: true, kind: 'bool' };
  if (c === 'kind') return { text: data[r].kind ?? '', input: data[r].kind ?? '', editable: true, kind: 'option', options: [{ value: 'K1', label: 'Kilo' }, 'Mega'] };
  if (c === 'calc') return { text: String(Number(data[r].qty) * 10), editable: false, tone: 'muted', why: 'Calculated.', mark: r === 'a' ? '•' : undefined };
  if (c === 'gap') return r === 'b' ? { text: '', tone: 'blank', editable: true } : { text: 'g', tone: 'warning', editable: true };
  return { text: '' };
};
let writes = [], sel = null, toggled = [];
const props = { rows, columns, cellAt, onWrites: (w) => { writes = w; }, onSelectionChange: (s) => { sel = s; }, onToggleRow: (k) => toggled.push(k),
  rowSelect: (k) => (k === 'a' ? ['a', 'b', 'c'] : [k]) };
const root = createRoot(document.getElementById('app'));
const render = (p = props) => React.act(() => root.render(React.createElement(m.SheetGrid, p)));
// data-cell="row:col" where col 0 is the row header and data columns start at 1.
const cell = (r, c) => document.querySelector(`[data-cell="${r}:${c}"]`);
const fire = async (el, type, init = {}) => React.act(() => el.dispatchEvent(type.startsWith('key') ? new KeyboardEvent(type, { bubbles: true, ...init }) : new MouseEvent(type, { bubbles: true, ...init })));
const clipboard = async (el, type, text = '') => {
  let copied;
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text, setData: (_, value) => { copied = value; } } });
  await React.act(() => el.dispatchEvent(event)); return copied;
};
const selectedCells = () => [...document.querySelectorAll('[aria-selected="true"]')].map((el) => el.getAttribute('data-cell'));
await render();

await check('Click selects one cell and opens no editor', async () => {
  await fire(cell(1, 1), 'click');
  assert.deepEqual(selectedCells(), ['1:1']); assert.equal(document.querySelectorAll('input').length, 0);
  assert.deepEqual(sel, { rows: ['b'], cols: ['qty'] });
});
await check('Shift-click selects a range and reports it in display order', async () => {
  await fire(cell(2, 2), 'click', { shiftKey: true });
  assert.deepEqual(selectedCells(), ['1:1', '1:2', '2:1', '2:2']);
  assert.deepEqual(sel, { rows: ['b', 'c'], cols: ['qty', 'note'] });
});
await check('Drag selects a range', async () => {
  await fire(cell(0, 1), 'pointerdown', { button: 0 });
  await fire(cell(1, 2), 'pointerover', { buttons: 1 });
  await fire(cell(1, 2), 'pointerup');
  assert.deepEqual(sel, { rows: ['a', 'b'], cols: ['qty', 'note'] });
});
await check('Column header selects the whole column', async () => {
  await fire(document.querySelector('th[data-col="0"]'), 'click');
  assert.deepEqual(sel, { rows: ['a', 'b', 'c', 'd'], cols: ['qty'] });
});
await check('Shift on a column header extends across columns', async () => {
  await fire(document.querySelector('th[data-col="1"]'), 'click', { shiftKey: true });
  assert.deepEqual(sel, { rows: ['a', 'b', 'c', 'd'], cols: ['qty', 'note'] });
});
await check('Row header selects the row', async () => {
  await fire(cell(3, 0), 'click');
  assert.deepEqual(sel, { rows: ['d'], cols: columns.map((c) => c.key) });
});
await check('Row header uses rowSelect (a whole subtree)', async () => {
  await fire(cell(0, 0), 'click');
  assert.deepEqual(sel.rows, ['a', 'b', 'c']); assert.equal(sel.cols.length, columns.length);
});
await check('Collapse control calls onToggleRow and does not select the row', async () => {
  await fire(cell(3, 0), 'click'); await fire(document.querySelector('[aria-label="Collapse Row A"]'), 'click');
  assert.deepEqual(toggled, ['a']); assert.deepEqual(sel.rows, ['d']);
});
await check('Ctrl+C copies the selection as TSV', async () => {
  await fire(cell(0, 1), 'click'); await fire(cell(1, 2), 'click', { shiftKey: true });
  assert.equal(await clipboard(cell(1, 2), 'copy'), '1\t\n2\t');
});
await check('Paste of a single value fills every selected cell', async () => {
  await fire(cell(0, 1), 'click'); await fire(cell(1, 1), 'click', { shiftKey: true });
  await clipboard(cell(1, 1), 'paste', '9');
  assert.deepEqual(writes, [{ rowKey: 'a', colKey: 'qty', text: '9' }, { rowKey: 'b', colKey: 'qty', text: '9' }]);
});
await check('TSV block paste starts at the selection top-left', async () => {
  writes = []; await fire(cell(0, 1), 'click');
  await clipboard(cell(0, 1), 'paste', '5\tnote one\n6\tnote two');
  assert.deepEqual(writes.map((w) => `${w.rowKey}.${w.colKey}=${w.text}`), ['a.qty=5', 'a.note=note one', 'b.qty=6', 'b.note=note two']);
});
await check('Paste onto any read-only cell is refused whole, with a message', async () => {
  writes = []; await fire(cell(1, 1), 'click');
  await clipboard(cell(1, 1), 'paste', '7\n8\n9');   // b, c (locked), d
  assert.equal(writes.length, 0); assert.match(document.body.textContent, /Nothing pasted: Row C · Qty is read-only/);
});
await check('Paste onto a blank or computed cell is refused', async () => {
  writes = []; await fire(cell(1, 6), 'click'); await clipboard(cell(1, 6), 'paste', 'x');
  assert.equal(writes.length, 0);
  await fire(cell(0, 5), 'click'); await clipboard(cell(0, 5), 'paste', 'x'); assert.equal(writes.length, 0);
});
await check('Paste past the edge is refused', async () => {
  writes = []; await fire(cell(3, 1), 'click'); await clipboard(cell(3, 1), 'paste', '1\n2');
  assert.equal(writes.length, 0); assert.match(document.body.textContent, /do not fit/);
});
await check('onProblem receives the message instead of the inline alert', async () => {
  let got = null; await render({ ...props, onProblem: (msg) => { got = msg; } });
  await fire(cell(2, 1), 'click'); await clipboard(cell(2, 1), 'paste', '1');
  assert.match(got, /Nothing pasted/); assert.ok(!/Nothing pasted/.test(document.body.textContent));
  await render();
});
await check('Option and bool pastes are normalised; bad values refuse the whole paste', async () => {
  writes = []; await fire(cell(0, 3), 'click'); await fire(cell(1, 3), 'click', { shiftKey: true });
  await clipboard(cell(0, 3), 'paste', 'yes\nNO');
  assert.deepEqual(writes.map((w) => w.text), ['true', 'false']);
  writes = []; await fire(cell(0, 3), 'click'); await clipboard(cell(0, 3), 'paste', 'maybe'); assert.equal(writes.length, 0);
  await fire(cell(0, 4), 'click'); await clipboard(cell(0, 4), 'paste', 'kilo'); assert.deepEqual(writes, [{ rowKey: 'a', colKey: 'kind', text: 'K1' }]);
  writes = []; await clipboard(cell(0, 4), 'paste', 'nope'); assert.equal(writes.length, 0);
});
await check('Double click opens the editor; Escape cancels without writing', async () => {
  writes = []; await fire(cell(0, 1), 'dblclick');
  assert.equal(document.querySelector('input[aria-label="Qty"]').value, '1');
  await fire(document.querySelector('input'), 'keydown', { key: 'Escape' });
  assert.equal(document.querySelectorAll('input').length, 0); assert.equal(writes.length, 0);
});
await check('Typing starts an edit; Enter commits and moves down', async () => {
  writes = []; await fire(cell(0, 1), 'click'); await fire(cell(0, 1), 'keydown', { key: '7' });
  assert.equal(document.querySelector('input').value, '7');
  await fire(document.querySelector('input'), 'keydown', { key: 'Enter' });
  assert.deepEqual(writes, [{ rowKey: 'a', colKey: 'qty', text: '7' }]); assert.equal(cell(1, 1).getAttribute('aria-selected'), 'true');
});
await check('F2 and Enter edit; Tab from the editor moves right', async () => {
  writes = []; await fire(cell(0, 2), 'click'); await fire(cell(0, 2), 'keydown', { key: 'F2' });
  assert.ok(document.querySelector('input')); await fire(document.querySelector('input'), 'keydown', { key: 'Escape' });
  await fire(cell(0, 2), 'keydown', { key: 'Enter' }); assert.ok(document.querySelector('input'));
  await fire(document.querySelector('input'), 'keydown', { key: 'Tab' });
  assert.equal(writes.length, 1); assert.equal(cell(0, 3).getAttribute('aria-selected'), 'true');
});
await check('Arrows and Tab move the selection', async () => {
  await fire(cell(1, 1), 'click'); await fire(cell(1, 1), 'keydown', { key: 'ArrowDown' }); assert.deepEqual(selectedCells(), ['2:1']);
  await fire(cell(2, 1), 'keydown', { key: 'ArrowRight' }); assert.deepEqual(selectedCells(), ['2:2']);
  await fire(cell(2, 2), 'keydown', { key: 'Tab', shiftKey: true }); assert.deepEqual(selectedCells(), ['2:1']);
});
await check('Read-only cell does not edit and shows its reason', async () => {
  await fire(cell(2, 1), 'dblclick'); assert.equal(document.querySelectorAll('input').length, 0);
  assert.match(document.body.textContent, /Row C is locked/); assert.equal(cell(2, 1).getAttribute('aria-readonly'), 'true');
});
await check('Delete clears only the editable cells in the selection', async () => {
  writes = []; await fire(cell(0, 1), 'click'); await fire(cell(2, 1), 'click', { shiftKey: true });
  await fire(cell(2, 1), 'keydown', { key: 'Delete' });
  assert.deepEqual(writes.map((w) => w.rowKey), ['a', 'b']); assert.ok(writes.every((w) => w.text === ''));
});
await check('Blank cells are never written by delete, edit or paste', async () => {
  writes = []; await fire(cell(1, 6), 'click'); await fire(cell(1, 6), 'keydown', { key: 'Delete' }); assert.equal(writes.length, 0);
  await fire(cell(1, 6), 'dblclick'); assert.equal(document.querySelectorAll('input').length, 0);
  await fire(cell(1, 6), 'keydown', { key: 'x' }); assert.equal(document.querySelectorAll('input').length, 0);
});
await check('Tones render: muted grey, strong semibold, warning, blank without a box, mark present', async () => {
  assert.equal(cell(0, 5).getAttribute('data-tone'), 'muted');
  assert.equal(cell(1, 6).getAttribute('data-tone'), 'blank'); assert.equal(cell(1, 6).textContent, '');
  assert.equal(cell(0, 6).getAttribute('data-tone'), 'warning');
  assert.ok(cell(0, 5).querySelector('[data-mark]')); assert.equal(cell(1, 5).querySelector('[data-mark]'), null);
  data.a.note = 'typed'; await render({ ...props });
  assert.equal(cell(0, 2).getAttribute('data-tone'), 'strong'); assert.equal(getComputedStyle(cell(0, 2)).fontWeight, '600'); delete data.a.note; await render({ ...props });
});
await check('Selection reports once per real change, not per render', async () => {
  let n = 0; await render({ ...props, rows: rows.map((r) => ({ ...r })), onSelectionChange: () => { n++; } });
  await fire(cell(0, 1), 'click'); const first = n;
  await render({ ...props, rows: rows.map((r) => ({ ...r })), onSelectionChange: () => { n++; } });
  assert.equal(n, first);
});
await check('Handle clearSelection empties the selection', async () => {
  const ref = React.createRef(); await render({ ...props, ref });
  await fire(cell(0, 1), 'click'); await React.act(() => ref.current.clearSelection());
  assert.deepEqual(selectedCells(), []);
});
// ── Undo / redo ──
const hist = { qty: { a: '1', b: '2', c: '3', d: '4' }, ov: {}, locked: new Set(), log: [], h: null, problem: null };
const hCell = (r, c) => {
  if (c === 'qty') return { text: hist.qty[r], editable: !hist.locked.has(r), kind: 'number' };
  if (c === 'note') return { text: hist.ov[r] ?? 'F(5)', restore: hist.ov[r] ?? '', editable: true };   // a formula cell
  return { text: '', editable: false };
};
const applyWrites = (w) => { hist.log.push(w); for (const x of w) { if (x.colKey === 'qty') hist.qty[x.rowKey] = x.text; else if (x.text === '') delete hist.ov[x.rowKey]; else hist.ov[x.rowKey] = x.text; } };
const hProps = (extra = {}) => ({ rows, columns, cellAt: hCell, onWrites: applyWrites, historyKey: 'L1', onHistoryChange: (h) => { hist.h = h; }, onProblem: (m) => { hist.problem = m; }, ...extra });
const ctrl = (el, key, init = {}) => fire(el, 'keydown', { key, ctrlKey: true, ...init });
let hn = 0;
const hReset = async (extra) => {
  Object.assign(hist.qty, { a: '1', b: '2', c: '3', d: '4' }); hist.ov = {}; hist.log = []; hist.problem = null; hist.locked.clear();
  await render(hProps({ historyKey: `k${++hn}`, ...extra })); hist.h = null;
};

await check('Undo restores a committed edit; redo re-applies it', async () => {
  await hReset(); await fire(cell(0, 1), 'click'); await fire(cell(0, 1), 'keydown', { key: '7' });
  await fire(document.querySelector('input'), 'keydown', { key: 'Enter' });
  assert.equal(hist.qty.a, '7'); assert.deepEqual(hist.h, { canUndo: true, canRedo: false });
  await ctrl(cell(0, 1), 'z'); assert.equal(hist.qty.a, '1'); assert.deepEqual(hist.h, { canUndo: false, canRedo: true });
  await ctrl(cell(0, 1), 'y'); assert.equal(hist.qty.a, '7'); assert.deepEqual(hist.h, { canUndo: true, canRedo: false });
  await ctrl(cell(0, 1), 'z'); await ctrl(cell(0, 1), 'Z', { shiftKey: true }); assert.equal(hist.qty.a, '7');   // Ctrl+Shift+Z
  await fire(cell(0, 1), 'keydown', { key: 'z', metaKey: true }); assert.equal(hist.qty.a, '1');   // Cmd+Z
});
await check('A multi-cell paste is one history entry', async () => {
  await hReset(); await fire(cell(0, 1), 'click');
  await clipboard(cell(0, 1), 'paste', '5\tx\n6\ty');
  assert.equal(hist.qty.a, '5'); assert.equal(hist.qty.b, '6'); assert.equal(hist.ov.a, 'x'); assert.equal(hist.ov.b, 'y');
  await ctrl(cell(0, 1), 'z');
  assert.deepEqual([hist.qty.a, hist.qty.b], ['1', '2']); assert.equal(hist.ov.a, undefined); assert.equal(hist.ov.b, undefined);
  assert.equal(hist.log.at(-1).length, 4); assert.equal(hist.h.canUndo, false);
});
await check('Undo of a Delete brings every cleared cell back', async () => {
  await hReset(); await fire(cell(0, 1), 'click'); await fire(cell(1, 1), 'click', { shiftKey: true });
  await fire(cell(1, 1), 'keydown', { key: 'Delete' }); assert.deepEqual([hist.qty.a, hist.qty.b], ['', '']);
  await ctrl(cell(1, 1), 'z'); assert.deepEqual([hist.qty.a, hist.qty.b], ['1', '2']);
});
await check('restore is respected: a formula cell undoes to blank, not to the formula text', async () => {
  await hReset(); await fire(cell(0, 2), 'click'); await fire(cell(0, 2), 'keydown', { key: 'q' });
  await fire(document.querySelector('input'), 'keydown', { key: 'Enter' }); assert.equal(hist.ov.a, 'q');
  await ctrl(cell(0, 2), 'z'); assert.equal(hist.log.at(-1)[0].text, ''); assert.equal(hist.ov.a, undefined);
  await ctrl(cell(0, 2), 'y'); assert.equal(hist.ov.a, 'q');
  await fire(cell(0, 2), 'click'); await fire(cell(0, 2), 'keydown', { key: 'r' }); await fire(document.querySelector('input'), 'keydown', { key: 'Enter' });
  await ctrl(cell(0, 2), 'z'); assert.equal(hist.ov.a, 'q');   // a second overwrite restores the first override
});
await check('A new write clears redo', async () => {
  await hReset(); await fire(cell(0, 1), 'click'); await clipboard(cell(0, 1), 'paste', '8');
  await ctrl(cell(0, 1), 'z'); assert.equal(hist.h.canRedo, true);
  await clipboard(cell(0, 1), 'paste', '9');
  assert.deepEqual(hist.h, { canUndo: true, canRedo: false }); await ctrl(cell(0, 1), 'y'); assert.equal(hist.qty.a, '9');
});
await check('historyKey change resets the history', async () => {
  await hReset(); await fire(cell(0, 1), 'click'); await clipboard(cell(0, 1), 'paste', '3');
  assert.equal(hist.h.canUndo, true);
  await render(hProps({ historyKey: 'other' })); assert.deepEqual(hist.h, { canUndo: false, canRedo: false });
  hist.log = []; await ctrl(cell(0, 1), 'z'); assert.equal(hist.log.length, 0); assert.equal(hist.qty.a, '3');
});
await check('No undo or redo fires while a cell editor is open', async () => {
  await hReset(); await fire(cell(0, 1), 'click'); await clipboard(cell(0, 1), 'paste', '3');
  await fire(cell(0, 1), 'dblclick'); hist.log = [];
  await ctrl(document.querySelector('input'), 'z'); await ctrl(cell(0, 1), 'z');
  assert.equal(hist.log.length, 0); assert.equal(hist.qty.a, '3');
  await fire(document.querySelector('input'), 'keydown', { key: 'Escape' });
  await ctrl(cell(0, 1), 'z'); assert.equal(hist.qty.a, '1');
});
await check('Undo skips cells that are read-only now and says so', async () => {
  await hReset(); await fire(cell(0, 1), 'click'); await fire(cell(1, 1), 'click', { shiftKey: true });
  await clipboard(cell(1, 1), 'paste', '9'); assert.deepEqual([hist.qty.a, hist.qty.b], ['9', '9']);
  hist.locked.add('b'); await render(hProps({ historyKey: `k${hn}` }));
  await ctrl(cell(0, 1), 'z'); assert.deepEqual([hist.qty.a, hist.qty.b], ['1', '9']);
  assert.match(hist.problem, /Row B · Qty was read-only/);
  await hReset(); await fire(cell(0, 1), 'click'); await clipboard(cell(0, 1), 'paste', '4');
  hist.locked.add('a'); await render(hProps({ historyKey: `k${hn}` })); hist.log = [];
  await ctrl(cell(0, 1), 'z');   // everything locked: nothing applied, the entry stays available
  assert.equal(hist.log.length, 0); assert.match(hist.problem, /Nothing undone/); assert.equal(hist.h.canUndo, true);
  hist.locked.clear(); await ctrl(cell(0, 1), 'z'); assert.equal(hist.qty.a, '1');
});
await check('History is capped at 50; the handle exposes undo / redo / canUndo / canRedo', async () => {
  const ref = React.createRef(); await hReset({ ref }); await fire(cell(0, 1), 'click');
  for (let i = 0; i < 55; i++) await clipboard(cell(0, 1), 'paste', String(100 + i));
  let undone = 0; while (ref.current.canUndo) { await React.act(() => { assert.equal(ref.current.undo(), true); }); undone++; }
  assert.equal(undone, 50); assert.equal(ref.current.canRedo, true); assert.equal(hist.qty.a, '104');
  await React.act(() => { ref.current.redo(); }); assert.equal(hist.qty.a, '105');
});
// ── Fill down / right, forgiving options ──
const gradeOpts = ['E350', { value: 'BO', label: 'BO — no impact test' }, { value: 'BR', label: 'BR — impact tested' }, { value: 'CT', label: 'Charpy test plate' }, { value: 'CS', label: 'Charpy sheet' }];
await check('matchOption: exact, prefix, unique whole word, ambiguous, none', async () => {
  const v = (t) => { const r = m.matchOption(gradeOpts, t); return r && ('option' in r ? r.option.value ?? r.option : r.ambiguous); };
  assert.equal(v('e350'), 'E350'); assert.equal(v('BO'), 'BO'); assert.equal(v('bo no'), null);
  assert.equal(v('BO — no impact test'), 'BO'); assert.equal(v('no'), 'BO');           // whole word, unique
  assert.deepEqual(v('impact'), ['BO — no impact test', 'BR — impact tested']);
  assert.deepEqual(v('charpy'), ['Charpy test plate', 'Charpy sheet']);                 // prefix, ambiguous
  assert.equal(v('xyz'), null); assert.equal(v('ba'), null);                            // "ba" is not a whole word
});
const fx = { qty: { a: '1', b: '2', c: '3', d: '4' }, note: { a: 'N', b: '', c: '', d: '' }, log: [], problem: null };
const fCell = (r, c) => {
  if (c === 'qty') return { text: fx.qty[r], editable: r !== 'c', kind: 'number' };
  if (c === 'note') return { text: fx.note[r], editable: true };
  if (c === 'flag') return { text: '', editable: true, tone: r === 'b' ? 'blank' : undefined };
  if (c === 'kind') return { text: '', input: '', editable: true, kind: 'option', options: gradeOpts };
  return { text: 'calc', editable: false };
};
const fWrite = (w) => { fx.log.push(w); for (const x of w) if (fx[x.colKey]) fx[x.colKey][x.rowKey] = x.text; };
const fProps = (k) => ({ rows, columns, cellAt: fCell, onWrites: fWrite, historyKey: k, onProblem: (mm) => { fx.problem = mm; } });
await check('Ctrl+D fills the top row down per column, skips read-only, one undo entry', async () => {
  fx.log = []; Object.assign(fx.qty, { a: '1', b: '2', c: '3', d: '4' }); Object.assign(fx.note, { a: 'N', b: '', c: '', d: '' });
  await render(fProps('f1'));
  await fire(cell(0, 1), 'click'); await fire(cell(3, 2), 'click', { shiftKey: true });   // a..d × qty,note
  await ctrl(cell(3, 2), 'd');
  assert.deepEqual([fx.qty.b, fx.qty.c, fx.qty.d], ['1', '3', '1']);      // c is locked: skipped
  assert.deepEqual([fx.note.b, fx.note.c, fx.note.d], ['N', 'N', 'N']);
  assert.equal(fx.log.length, 1); assert.equal(fx.log[0].length, 5); assert.match(fx.problem, /1 cell skipped/);
  await ctrl(cell(3, 2), 'z');
  assert.deepEqual([fx.qty.b, fx.qty.c, fx.qty.d], ['2', '3', '4']); assert.deepEqual([fx.note.b, fx.note.c, fx.note.d], ['', '', '']);
  await fire(cell(0, 1), 'keydown', { key: 'd', metaKey: true }); assert.equal(fx.qty.b, '1');   // Cmd+D
});
await check('Ctrl+D with one row copies from the row above; blank / computed cells are skipped', async () => {
  fx.log = []; Object.assign(fx.qty, { a: '1', b: '2', c: '3', d: '4' }); fx.problem = null;
  await render(fProps('f2'));
  await fire(cell(3, 1), 'click'); await ctrl(cell(3, 1), 'd'); assert.equal(fx.qty.d, '3');
  fx.log = []; await fire(cell(1, 3), 'click'); await fire(cell(2, 3), 'click', { shiftKey: true });   // flag col: b is blank tone
  await ctrl(cell(2, 3), 'd'); assert.equal(fx.log.length, 0);
  await fire(cell(0, 1), 'click'); await ctrl(cell(0, 1), 'd'); assert.match(fx.problem, /Nothing to fill/);
});
await check('Ctrl+R fills the left column right, per row', async () => {
  fx.log = []; Object.assign(fx.qty, { a: '1', b: '2', c: '3', d: '4' }); Object.assign(fx.note, { a: 'N', b: '', c: '', d: '' });
  await render(fProps('f3'));
  await fire(cell(0, 1), 'click'); await fire(cell(1, 2), 'click', { shiftKey: true });
  await ctrl(cell(1, 2), 'r');
  assert.equal(fx.note.a, '1'); assert.equal(fx.note.b, '2'); assert.equal(fx.log.length, 1);
  await ctrl(cell(1, 2), 'z'); assert.equal(fx.note.a, 'N');
});
await check('Fill down of an option cell copies its value', async () => {
  fx.log = []; const k = { a: 'BO', b: '', c: '', d: '' };
  const p = { ...fProps('f4'), cellAt: (r, c) => (c === 'kind' ? { text: k[r], input: k[r], editable: true, kind: 'option', options: gradeOpts } : fCell(r, c)), onWrites: (w) => { for (const x of w) k[x.rowKey] = x.text; } };
  await render(p); await fire(cell(0, 4), 'click'); await fire(cell(3, 4), 'click', { shiftKey: true }); await ctrl(cell(3, 4), 'd');
  assert.deepEqual(Object.values(k), ['BO', 'BO', 'BO', 'BO']);
});
await check('Option paste is forgiving: prefix and whole word pass, ambiguous names candidates', async () => {
  fx.log = []; fx.problem = null; await render({ ...fProps('f5') });
  await fire(cell(0, 4), 'click'); await clipboard(cell(0, 4), 'paste', 'BO');
  assert.deepEqual(fx.log.at(-1), [{ rowKey: 'a', colKey: 'kind', text: 'BO' }]);
  await clipboard(cell(0, 4), 'paste', 'no'); assert.equal(fx.log.at(-1)[0].text, 'BO');
  fx.log = []; await clipboard(cell(0, 4), 'paste', 'charpy');
  assert.equal(fx.log.length, 0); assert.match(fx.problem, /“Charpy test plate” or “Charpy sheet”/);
});
await check('Typing in an option editor matches forgivingly; Enter commits the value', async () => {
  fx.log = []; fx.problem = null; await render({ ...fProps('f6') });
  await fire(cell(0, 4), 'click'); await fire(cell(0, 4), 'keydown', { key: 'B' });
  await fire(document.querySelector('select'), 'keydown', { key: 'O' });
  assert.equal(document.querySelector('select').value, 'BO');
  await fire(document.querySelector('select'), 'keydown', { key: 'Enter' });
  assert.deepEqual(fx.log.at(-1), [{ rowKey: 'a', colKey: 'kind', text: 'BO' }]);
});
await React.act(() => root.unmount());
dom.window.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
