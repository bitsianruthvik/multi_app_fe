// Charts: a table of rows (any number of inputs + one result). Headings carry units, previews show
// node names, the rows editor reads pasted text, the dialog checks itself, and the formula
// type-ahead offers charts, item.family / subfamily / variant and pick-list specs.
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

const th = { kind: 'spec', field: 'THICKNESS', label: 'Thickness', unit: 'mm', dataType: 'number' };
const grade = { kind: 'spec', field: 'GRADE', label: 'Grade', unit: null, dataType: 'option' };
const fam = { kind: 'level', level: 'FAMILY', label: 'Family', unit: null, dataType: 'level' };
const nodes = { 7: { code: 'PLATES', name: 'Plates' }, 8: { code: 'BARS', name: 'Bars' } };
const drill = {
  specId: 1, code: 'DRILL_TIME', name: 'Drill time', resultUnit: 's', mode: 'step_up', axes: [th, grade, fam], nodes,
  rows: [[10, 'E250', 7, 4], [10, 'E350', 8, null], [20, 'E250', 7, 6.5]], value: null, own: true, valueFrom: null, shortForm: 'DRILL_TIME',
};

check('headings carry units; level and option have none', () => {
  assert.equal(c.axisHeading(th), 'Thickness (mm)');
  assert.equal(c.axisHeading(grade), 'Grade');
  assert.equal(c.resultHeading(drill), 'Drill time (s)');
  assert.equal(c.chartHeadingLine(drill), 'Thickness (mm) · Grade · Family → Drill time (s)');
  assert.equal(c.byText(drill.axes), 'by Thickness (mm), Grade, Family');
});
check('no unit, no brackets', () => assert.equal(c.withUnit('Count', null), 'Count'));
check('between rows is said in words', () => {
  assert.equal(c.modeText('step_up'), 'Between rows: steps up to the next row');
  assert.equal(c.modeText('linear'), 'Between rows: worked out on a straight line along every number column');
});
check('short form else LOOKUP', () => {
  assert.equal(c.formulaNameText(drill), 'DRILL_TIME');
  assert.equal(c.formulaNameText({ ...drill, shortForm: null }), 'LOOKUP(machine.DRILL_TIME, …)');
});
check('preview: a heading per input, level cells by node name, cannot as a dash', () => {
  const t = c.previewTable(drill);
  assert.deepEqual(t.headings, ['Thickness (mm)', 'Grade', 'Family', 'Drill time (s)']);
  assert.deepEqual(t.rows[0], ['10', 'E250', 'Plates', '4']);
  assert.deepEqual(t.rows[1], ['10', 'E350', 'Bars', '—']);
  assert.deepEqual(t.numeric, [true, false, false, true]);
});
check('preview is cut to a limit and says how many more', () => {
  const big = { ...drill, rows: Array.from({ length: 12 }, (_, i) => [i + 1, 'E250', 7, 1]) };
  const t = c.previewTable(big, 8);
  assert.equal(t.rows.length, 8);
  assert.equal(t.more, 4);
});
check('no rows, no preview', () => assert.equal(c.previewTable({ ...drill, rows: null }), null));
check('older values become rows', () => {
  assert.deepEqual(c.chartRows({ rows: null, value: { x: [6, 10], v: [700, null] } }), [[6, 700], [10, null]]);
  assert.deepEqual(c.chartRows({ rows: null, value: { x: [10, 20], y: [14, 21], v: [[1, 2], [3, null]] } }), [[10, 14, 1], [10, 21, 3], [20, 14, 2], [20, 21, null]]);
  assert.deepEqual(c.chartRows({ rows: null, value: { rows: [[1, 2]] } }), [[1, 2]]);
});
check('value source in words', () => {
  assert.equal(c.valueSourceText({ ...drill, own: false, valueFrom: { type: 'classification', id: 3, name: 'Pug cutting' } }, 'machine'), 'From Pug cutting (machine type)');
  assert.equal(c.valueSourceText({ ...drill, own: true, valueFrom: null }, 'machine'), 'This machine’s own chart');
  assert.equal(c.valueSourceText({ ...drill, rows: null, own: false, valueFrom: null }, 'machine'), 'No values yet');
});
check('specifications tab summary', () => {
  assert.equal(c.chartSummary({ axes: [th, grade] }, { rows: [[1, 'A', 2], [2, 'A', 3]] }), '2 rows · by Thickness (mm), Grade');
  assert.equal(c.chartSummary({ axes: [th] }, null), 'No chart set yet');
  assert.equal(c.isRowsChart({ version: 2 }), true);
  assert.equal(c.isRowsChart({}), false);
});

const base = {
  name: 'Drill time', resultUnit: 's', mode: 'step_up',
  inputs: [
    { kind: 'spec', code: 'THICKNESS', name: 'Thickness', dataType: 'number', specUnit: 'mm', unit: '' },
    { kind: 'spec', code: 'GRADE', name: 'Grade', dataType: 'option', specUnit: '', unit: '' },
    { kind: 'level', level: 'FAMILY' },
  ],
};
check('a complete form has no problems; heading and formula name preview', () => {
  assert.deepEqual(c.formProblems(base), []);
  assert.equal(c.formHeadingLine(base), 'Thickness (mm) · Grade · Family → Drill time (s)');
  assert.equal(c.shortNameGuess(base.name), 'DRILL_TIME');
});
check('name, result unit and an input are required', () => {
  assert.equal(c.formProblems({ ...base, name: ' ', resultUnit: '', inputs: [] }).length, 3);
});
check('a number with no unit (a count) is fine without one; a unit given is sent', () => {
  const f = { ...base, inputs: [{ ...base.inputs[0], specUnit: '' }] };
  assert.equal(c.formProblems(f).filter((x) => /unit/.test(x)).length, 0);
  assert.deepEqual(c.inputsPayload({ ...f, inputs: [{ ...f.inputs[0], unit: 'mm' }] }), [{ field: 'THICKNESS', unit: 'mm' }]);
});
check('the same input twice is refused', () => {
  assert.ok(c.formProblems({ ...base, inputs: [base.inputs[2], base.inputs[2]] }).some((p) => /already/.test(p)));
  assert.ok(c.formProblems({ ...base, inputs: [base.inputs[0], base.inputs[0]] }).some((p) => /already/.test(p)));
});
check('inputs are sent as field codes and levels', () => {
  assert.deepEqual(c.inputsPayload(base), [{ field: 'THICKNESS' }, { field: 'GRADE' }, { level: 'FAMILY' }]);
});
check('a changed chart sends where each input was, and the value the rows are for on a new one; a typed unit wins', () => {
  const ed = { ...base, inputs: [{ ...base.inputs[1], from: 1 }, { ...base.inputs[0], from: 0, unit: 'cm' }, { ...base.inputs[2], fill: ' Plates ' }] };
  assert.deepEqual(c.inputsPayload(ed), [{ field: 'GRADE', from: 1 }, { field: 'THICKNESS', unit: 'cm', from: 0 }, { level: 'FAMILY', fill: 'Plates' }]);
  assert.equal(c.inputHeading(ed.inputs[1]), 'Thickness (cm)');
  assert.ok(c.formProblems({ ...ed, inputs: [ed.inputs[0], { ...base.inputs[2] }] }, true).some((p) => /is new/.test(p)));
  assert.equal(c.formProblems(ed, true).length, 0);
  const fromAxis = c.inputFromAxis({ kind: 'spec', field: 'THICKNESS', label: 'Thickness', unit: 'mm', dataType: 'number' }, 0);
  assert.equal(fromAxis.from, 0); assert.equal(c.inputHeading(fromAxis), 'Thickness (mm)');
});
check('a straight line whenever any input is a number, wherever it sits; inputs reorder', () => {
  assert.equal(c.canLinear(base), true);
  assert.equal(c.effectiveMode({ ...base, mode: 'linear' }), 'linear');
  assert.equal(c.canLinear({ ...base, inputs: [base.inputs[1], base.inputs[2]] }), false);
  assert.equal(c.effectiveMode({ ...base, mode: 'linear', inputs: [base.inputs[1], base.inputs[2]] }), 'step_up');
  assert.equal(c.canLinear({ ...base, inputs: [base.inputs[2], base.inputs[0]] }), true);
  assert.equal(c.effectiveMode({ ...base, mode: 'linear', inputs: [base.inputs[2], base.inputs[0]] }), 'linear');
  assert.deepEqual(c.moved([1, 2, 3], 2, -1), [1, 3, 2]);
  assert.deepEqual(c.moved([1, 2, 3], 0, -1), [1, 2, 3]);
});
check('axes of a saved chart open as inputs and back', () => {
  assert.deepEqual(drill.axes.map(c.inputFromAxis).map((i) => c.inputHeading(i)), ['Thickness (mm)', 'Grade', 'Family']);
  assert.equal(c.inputAxis(base.inputs[0]).unit, 'mm');
});

const lookups = {
  levels: { FAMILY: [{ id: 7, code: 'PLATES', name: 'Plates' }, { id: 8, code: 'BARS', name: 'Bars' }], SUBFAMILY: [], VARIANT: [] },
  options: { GRADE: [{ value: 'E250', label: 'IS 2062 E250' }, { value: 'E350', label: null }] },
};
check('paste: N+1 columns, one row per line; a heading line is skipped', () => {
  const out = c.parsePastedRows('Thickness\tGrade\tFamily\tDrill time\n10\tE250\tPlates\t4\n20\tE350\tBars\t', 4);
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[1], ['20', 'E350', 'Bars', '']);
});
check('paste: a short line is named', () => {
  const out = c.parsePastedRows('10\tE250\t4', 4);
  assert.match(out.error, /Line 1 has 3 columns; this chart has 4/);
});
check('rows from the editor: names placed to ids and values; blank result = cannot; blank rows dropped', () => {
  const r = c.draftToRows(drill.axes, [['10', 'IS 2062 E250', 'plates', '4'], ['', '', '', ''], ['20', 'E350', '8', '']], lookups);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows, [[10, 'E250', 7, 4], [20, 'E350', 8, null]]);
});
check('rows from the editor: problems in words; unknown names go as typed', () => {
  const r = c.draftToRows(drill.axes, [['x', 'E999', 'Nowhere', 'a']], lookups);
  assert.equal(r.problems.length, 2);
  assert.deepEqual(r.rows[0].slice(1, 3), ['E999', 'Nowhere']);
});
check('draft round trip and sort by inputs', () => {
  const d = c.rowsToDraft([[20, 'E250', 7, 1], [10, 'E350', 8, null], [10, 'E250', 8, 2]]);
  assert.deepEqual(d[1], ['10', 'E350', '8', '']);
  const sorted = c.sortDraft(drill.axes, d, (a, t) => (a.kind === 'level' ? nodes[t]?.name ?? t : t));
  assert.deepEqual(sorted.map((r) => r.slice(0, 2).join('/')), ['10/E250', '10/E350', '20/E250']);
});
check('charts of the new kind are short-form charts', () => {
  const fields = [
    { code: 'A', tableConfig: { axes: [{ field: { code: 'T' } }] } },
    { code: 'B', tableConfig: { axes: [{ field: { code: 'T' } }, { field: null }] } },
    { code: 'C', tableConfig: { version: 2, axes: [{ kind: 'level' }, { kind: 'spec' }] } },
  ];
  assert.deepEqual(c.boundCharts(fields).map((f) => f.code), ['A', 'C']);
});

const chartField = {
  code: 'DRILL_TIME', name: 'Drill time', dataType: 'table', measurementType: null, unit: 's',
  tableConfig: { version: 2, axes: [{ label: 'Thickness', unit: 'mm' }, { label: 'Grade', unit: null }, { label: 'Family', unit: null }] },
};
const ctx = {
  fields: {
    item: [
      { code: 'CUT_LENGTH', name: 'Cut length', dataType: 'number', measurementType: null, unit: 'mm' },
      { code: 'GRADE', name: 'Grade', dataType: 'option', measurementType: null, unit: null },
      ...fb.LEVEL_FIELDS,
    ],
  },
  functions: [],
  shortCharts: [chartField],
};
check('type-ahead offers a chart as machine.NAME, with what it is read by', () => {
  const text = 'item.CUT_LENGTH / DRI';
  const r = suggestAt(text, text.length, ctx);
  assert.equal(r.items[0].insert, 'machine.DRILL_TIME');
  assert.equal(r.items[0].detail, 'machine.DRILL_TIME · chart · s, by Thickness (mm), Grade, Family');
});
check('typing machine. lists its charts beside its numbers', () => {
  const text = 'item.HOLES * machine.';
  const r = suggestAt(text, text.length, ctx);
  assert.ok(r.items.some((i) => i.insert === 'machine.DRILL_TIME'), JSON.stringify(r.items.map((i) => i.insert)));
});
check('item.family / subfamily / variant and pick-list specs are offered', () => {
  const r = suggestAt('item.fam', 8, ctx);
  assert.equal(r.items[0].insert, 'item.family');
  assert.equal(r.items[0].detail, 'item.family · the piece’s family');
  const g = suggestAt('item.gr', 7, ctx);
  assert.equal(g.items[0].insert, 'item.GRADE');
  assert.equal(g.items[0].detail, 'item.GRADE · word');
  assert.deepEqual(suggestAt('item.', 5, ctx).items.map((i) => i.insert).slice(-3), ['item.family', 'item.subfamily', 'item.variant']);
});
check('quoted words parse and read back; family is a known level', () => {
  assert.ok(fb.tryParse('IF(item.GRADE = "E350", 2, 1)'));
  assert.ok(fb.tryParse("IF(item.subfamily = 'Parts', 5, 10)"));
  assert.equal(fb.tokenize('item.GRADE = "E 350"').filter((t) => t.kind === 'str')[0].text, '"E 350"');
  assert.equal(fb.isLevelCode('SUBFAMILY'), true);
  assert.equal(fb.isLevelCode('THICKNESS'), false);
});
check('LOOKUP suggestions stay as they were', () => {
  const lk = { fields: ctx.fields, functions: [], shortCharts: [chartField], lookup: { arg: 0, charts: [chartField], keyFirst: null } };
  const r = suggestAt('LOOKUP(dri', 10, lk);
  assert.equal(r.items[0].insert, 'machine.DRILL_TIME');
});
check('a time opens as its short form', () => {
  assert.equal(fb.timeStartText({ minutes: null, expression: 'x / LOOKUP(machine.A, item.T)', display: 'x / A', formula: null }), 'x / A');
  assert.equal(fb.timeStartText({ minutes: null, expression: '5', formula: null }), '5');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
