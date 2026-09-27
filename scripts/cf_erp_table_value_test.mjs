// Chart editor contract: display rows are x, columns are y; storage is v[y][x].
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const m = await load('src/apps/cf_erp/components/TableValue/tableValueModel.ts');
const { toInputString } = await load('src/apps/cf_erp/lib/tree.ts');
const config = { axes: [{ label: 'Thickness' }, { label: 'Diameter' }], mode: 'step_up' };
const chart = { x: [10, 20, 30], y: [21, 25], v: [[50, 80, 110], [null, null, null]] };
let passed = 0;
let failed = 0;
function check(label, fn) {
  try { fn(); passed++; console.log(`PASS ${label}`); }
  catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); }
}
check('stored chart survives conversion to form input', () => assert.deepEqual(m.parseTableValue(toInputString(chart)), chart));
check('paste keeps x rows and y columns in v[y][x]', () => assert.deepEqual(
  m.parsePastedBlock('\t21\t25\n10\t50\t\n20\t80\t\n30\t110\t', 2), { table: chart }));
check('editing one cell leaves all other rates in place', () => assert.deepEqual(m.setCell(chart, 2, 0, 95).v, [[50, 80, 95], [null, null, null]]));
check('add x row extends each y series', () => assert.deepEqual(m.addRow(chart).v, [[50, 80, 110, null], [null, null, null, null]]));
check('remove x row removes the corresponding rate in every y series', () => assert.deepEqual(m.removeRow(chart, 1), { x: [10, 30], y: chart.y, v: [[50, 110], [null, null]] }));
check('add y column creates one series across x', () => assert.deepEqual(m.addColumn(chart).v, [...chart.v, [null, null, null]]));
check('remove y column removes only that series', () => assert.deepEqual(m.removeColumn(chart, 0), { x: chart.x, y: [25], v: [[null, null, null]] }));
check('valid non-square chart passes validation', () => assert.deepEqual(m.validateTable(chart, config), []));
check('wrong chart orientation is refused', () => assert.ok(m.validateTable({ ...chart, v: [[1, 2], [3, 4], [5, 6]] }, config).length));
check('non-finite axes are refused before JSON turns them into null', () => assert.ok(m.validateTable({ x: [NaN], v: [1] }, { axes: [{ label: 'x' }] }).length));
check('non-finite rates are refused', () => assert.ok(m.validateTable({ x: [1], v: [Infinity] }, { axes: [{ label: 'x' }] }).length));
check('paste does not silently discard extra columns', () => assert.ok('error' in m.parsePastedBlock('\t21\t25\n10\t1\t2\t3', 2)));
check('one-axis paste does not silently discard extra rates', () => assert.ok('error' in m.parsePastedBlock('10\t1\t2', 1)));
check('one-axis paste preserves zero and missing rates', () => assert.deepEqual(m.parsePastedBlock('10\t0\n20\t', 1), { table: { x: [10, 20], v: [0, null] } }));
check('row editing does not mutate the source chart', () => assert.deepEqual(chart.v, [[50, 80, 110], [null, null, null]]));
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
