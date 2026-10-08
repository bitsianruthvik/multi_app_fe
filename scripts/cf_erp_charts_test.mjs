// Charts: headings carry units, previews are shaped rows x columns, the dialog checks itself,
// and the formula type-ahead offers bound charts by their bare name.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}
const c = await load('src/apps/cf_erp/lib/charts.ts');
const { suggestAt } = await load('src/apps/cf_erp/lib/formulaSuggest.ts');
const fb = await load('src/apps/cf_erp/lib/formulaBuilder.ts');

let passed = 0;
let failed = 0;
function check(label, fn) {
  try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); }
}

const th = { label: 'Thickness', unit: 'mm', field: { code: 'THICKNESS', name: 'Thickness', unit: 'mm' } };
const hole = { label: 'Hole diameter', unit: 'mm', field: null };
const one = { specId: 1, code: 'GAS_CUT_SPEED', name: 'Gas cutting speed', resultUnit: 'mm/min', mode: 'step_up', axes: [th], value: { x: [6, 10, 20], v: [700, 500, null] }, shortForm: 'GAS_CUT_SPEED' };
const two = { ...one, code: 'PIERCE', name: 'Pierce time', resultUnit: 's', axes: [th, hole], shortForm: null, value: { x: [10, 20], y: [14, 21], v: [[1, 2], [3, null]] } };

check('headings carry units', () => {
  assert.equal(c.axisHeading(th), 'Thickness (mm)');
  assert.equal(c.resultHeading(one), 'Gas cutting speed (mm/min)');
  assert.equal(c.chartHeadingLine(one), 'Thickness (mm) → Gas cutting speed (mm/min)');
  assert.equal(c.chartHeadingLine(two), 'Thickness (mm) × Hole diameter (mm) → Pierce time (s)');
});
check('no unit, no brackets', () => assert.equal(c.withUnit('Count', null), 'Count'));
check('between rows is said in words', () => {
  assert.equal(c.modeText('step_up'), 'Between rows: steps up to the next row');
  assert.equal(c.modeText('linear'), 'Between rows: a straight line');
});
check('short form else LOOKUP', () => {
  assert.equal(c.formulaNameText(one), 'GAS_CUT_SPEED');
  assert.equal(c.formulaNameText(two), 'LOOKUP(machine.PIERCE, …)');
});
check('one-column preview: rows down, result heading with unit', () => {
  const g = c.previewGrid(one);
  assert.equal(g.rowHeading, 'Thickness (mm)');
  assert.equal(g.columns[0].heading, 'Gas cutting speed (mm/min)');
  assert.deepEqual(g.rows.map((r) => [r.x, r.cells[0]]), [[6, 700], [10, 500], [20, null]]);
});
check('two-column preview: v[col][row] read as rows x columns', () => {
  const g = c.previewGrid(two);
  assert.equal(g.twoD, true);
  assert.deepEqual(g.columns.map((x) => x.heading), ['14', '21']);
  assert.deepEqual(g.rows.map((r) => r.cells), [[1, 3], [2, null]]);
  assert.match(g.rowHeading, /Thickness \(mm\).*Hole diameter \(mm\)/);
  assert.equal(g.caption, 'Pierce time (s)');
});
check('preview is cut to a limit and says how many more', () => {
  const big = { ...one, value: { x: Array.from({ length: 12 }, (_, i) => i + 1), v: Array(12).fill(1) } };
  const g = c.previewGrid(big, 8);
  assert.equal(g.rows.length, 8);
  assert.equal(g.more, 4);
});
check('no values, no preview', () => assert.equal(c.previewGrid({ ...one, value: null }), null));
check('value source in words', () => {
  assert.equal(c.valueSourceText({ ...one, own: false, valueFrom: { type: 'classification', id: 3, name: 'Pug cutting' } }, 'machine'), 'From Pug cutting (machine type)');
  assert.equal(c.valueSourceText({ ...one, own: true, valueFrom: null }, 'machine'), 'This machine’s own chart');
  assert.equal(c.valueSourceText({ ...one, value: null, own: false, valueFrom: null }, 'machine'), 'No values yet');
});

const base = { name: 'Gas cutting speed', resultUnit: 'mm/min', mode: 'step_up', columns: [{ kind: 'spec', specCode: 'THICKNESS', specName: 'Thickness', specUnit: 'mm', label: '', unit: '' }] };
check('a complete form has no problems and is bound', () => {
  assert.deepEqual(c.formProblems(base), []);
  assert.equal(c.isBound(base), true);
  assert.equal(c.formHeadingLine(base), 'Thickness (mm) → Gas cutting speed (mm/min)');
  assert.equal(c.shortNameGuess(base.name), 'GAS_CUTTING_SPEED');
});
check('the result unit and the name are required', () => {
  assert.equal(c.formProblems({ ...base, name: ' ', resultUnit: '' }).length, 2);
});
check('a value with no unit asks for one', () => {
  const f = { ...base, columns: [{ ...base.columns[0], specUnit: '' }] };
  assert.match(c.formProblems(f)[0], /no unit/);
  assert.deepEqual(c.axesInput({ ...f, columns: [{ ...f.columns[0], unit: 'mm' }] }), [{ field: 'THICKNESS', unit: 'mm' }]);
});
check('"Other" needs a label and a unit; it is not bound', () => {
  const f = { ...base, columns: [{ kind: 'other', specCode: '', specName: '', specUnit: '', label: '', unit: '' }] };
  assert.equal(c.formProblems(f).length, 2);
  assert.equal(c.isBound(f), false);
  assert.deepEqual(c.axesInput({ ...f, columns: [{ ...f.columns[0], label: 'Gas pressure', unit: 'bar' }] }), [{ label: 'Gas pressure', unit: 'bar' }]);
});
check('the same value cannot be both columns', () => {
  const f = { ...base, columns: [base.columns[0], base.columns[0]] };
  assert.ok(c.formProblems(f).some((p) => /already/.test(p)));
});
check('axes carry the spec code when read by a piece value', () => assert.deepEqual(c.axesInput(base), [{ field: 'THICKNESS' }]));
check('grid config has labels and units', () => assert.deepEqual(c.formTableConfig(base).axes, [{ label: 'Thickness', unit: 'mm' }]));
check('value text round-trips; empty means none', () => {
  assert.equal(c.valueFromText(''), null);
  assert.deepEqual(c.valueFromText(c.valueToText(one.value)), one.value);
});
check('only charts bound on every column are short-form charts', () => {
  const fields = [
    { code: 'A', tableConfig: { axes: [{ field: { code: 'T' } }] } },
    { code: 'B', tableConfig: { axes: [{ field: { code: 'T' } }, { field: null }] } },
    { code: 'C', tableConfig: { axes: [{ label: 'x' }] } },
  ];
  assert.deepEqual(c.boundCharts(fields).map((f) => f.code), ['A']);
});

const chartField = { code: 'GAS_CUT_SPEED', name: 'Gas cutting speed', dataType: 'table', measurementType: null, unit: 'mm/min', tableConfig: { axes: [{ label: 'Thickness', unit: 'mm', field: { code: 'THICKNESS' } }] } };
const ctx = { fields: { item: [{ code: 'CUT_LENGTH', name: 'Cut length', dataType: 'number', measurementType: null, unit: 'mm' }] }, functions: [], shortCharts: [chartField] };
check('type-ahead offers a bound chart by its bare name', () => {
  const text = 'item.CUT_LENGTH / GAS';
  const r = suggestAt(text, text.length, ctx);
  assert.equal(r.items[0].insert, 'GAS_CUT_SPEED');
  assert.equal(r.items[0].detail, 'chart · mm/min, by Thickness (mm)');
});
check('LOOKUP suggestions stay as they were', () => {
  const lk = { fields: ctx.fields, functions: [], shortCharts: [chartField], lookup: { arg: 0, charts: [chartField], keyFirst: null } };
  const r = suggestAt('LOOKUP(gas', 10, lk);
  assert.equal(r.items[0].insert, 'machine.GAS_CUT_SPEED');
});
check('a time opens as its short form', () => {
  assert.equal(fb.timeStartText({ minutes: null, expression: 'x / LOOKUP(machine.A, item.T)', display: 'x / A', formula: null }), 'x / A');
  assert.equal(fb.timeStartText({ minutes: null, expression: '5', formula: null }), '5');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
