// Run from multi_app_fe: node scripts/cf_erp_value_reasons_test.mjs
// "Why is this asked?" — the pure wording (src/apps/cf_erp/lib/valueReasons.ts). No DOM, no requests.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export * from './src/apps/cf_erp/lib/valueReasons';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `value-reasons-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.stack}`); } };

const drill = { id: 1, code: 'CNCDRILL', name: 'CNC Drilling' };
const blast = { id: 2, code: 'BLAST', name: 'Blasting' };
const paint = { id: 3, code: 'PAINT', name: 'Painting' };
const flow = { id: 5, code: 'SPLICE-OUTER', name: 'Splice plate, outer' };
const variant = { level: 'Variant', code: 'PLATE_PART', name: 'Plate part' };
const asked = (code, name, reason, more = {}) => ({ code, name, required: false, valueRule: 'entered', ...more, reason });
const open = { flow, frozen: null };

const holes = asked('HOLES', 'Holes', { kind: 'flow', flow, operations: [drill] }, { required: true });
const coats = asked('COATS', 'Coats', { kind: 'flow', flow, operations: [blast, paint] }, { required: true });
const colour = asked('COLOUR', 'Colour', { kind: 'manual', at: variant, readBy: [] });
const grade = asked('GRADE', 'Grade', { kind: 'manual', at: variant, readBy: [drill] }, { required: true });
const note = asked('NOTE', 'Note', { kind: 'manual', at: { level: 'This item', code: null, name: 'Row' }, readBy: [] });
const weight = asked('WEIGHT', 'Weight', { kind: 'derived', how: 'calculated', at: variant, readBy: [] }, { valueRule: 'calculated' });
const total = asked('TOTAL_WEIGHT', 'Total weight', { kind: 'derived', how: 'rollup', at: variant, readBy: [] }, { valueRule: 'rollup' });
const cutFrom = asked('CUT_FROM', 'Cut from', { kind: 'derived', how: 'defaulted', at: { level: 'Family', code: 'FAB', name: 'Fabricated' }, readBy: [] }, { valueRule: 'defaulted' });
const thickness = asked('THICKNESS', 'Thickness', { kind: 'derived', how: 'inherited', at: variant, readBy: [drill] }, { valueRule: 'inherited' });
const material = asked('MATERIAL', 'Material', { kind: 'derived', how: 'fixed', at: { level: 'Template definition', code: 'SPO', name: 'Splice plate' } }, { valueRule: 'fixed' });
const cuts = asked('CUTS', 'Cuts', { kind: 'derived', how: 'calculated', at: variant, readBy: [], note: 'Worked out by cutting and nesting — from the section, the cut piece and the nest.' }, { valueRule: 'calculated' });

const text = (v, ctx = open) => m.reasonText(v, ctx).text;
const warn = (v, ctx = open) => m.reasonText(v, ctx).warn;

check('A flow-made value names the operation and the flow', () => {
  assert.equal(text(holes), 'Read by CNC Drilling (CNCDRILL) — in flow SPLICE-OUTER');
  assert.equal(text(coats), 'Read by Blasting (BLAST) and Painting (PAINT) — in flow SPLICE-OUTER');
  assert.equal(warn(holes), false);
});
check('Operations read as a list: one, two, three', () => {
  assert.equal(m.operationsText([drill]), 'CNC Drilling (CNCDRILL)');
  assert.equal(m.operationsText([drill, blast]), 'CNC Drilling (CNCDRILL) and Blasting (BLAST)');
  assert.equal(m.operationsText([drill, blast, paint]), 'CNC Drilling (CNCDRILL), Blasting (BLAST) and Painting (PAINT)');
  assert.equal(m.operationText({ id: 9, code: 'QC', name: 'QC' }), 'QC');
});
check('A hand-made value nothing reads says so, and is the one case in the warning colour', () => {
  assert.equal(text(colour), 'Set by hand on Variant: Plate part — nothing in its flow reads it');
  assert.equal(warn(colour), true);
  assert.equal(text(note), 'Set by hand on this item — nothing in its flow reads it');
});
check('A hand-made value an operation also reads names it, without a warning', () => {
  assert.equal(text(grade), 'Set by hand on Variant: Plate part — also read by CNC Drilling (CNCDRILL)');
  assert.equal(warn(grade), false);
});
check('With no flow at all nothing is singled out: every hand-made value would be unread', () => {
  assert.equal(text(colour, { flow: null, frozen: null }), 'Set by hand on Variant: Plate part — it has no flow, so no operation reads it');
  assert.equal(warn(colour, { flow: null, frozen: null }), false);
});
check('Values that come by themselves say how', () => {
  assert.equal(text(weight), 'Worked out (calculated)');
  assert.equal(text(total), 'Worked out (rolled up from its BOM)');
  assert.equal(text(cutFrom), 'Worked out (defaulted on Family: Fabricated)');
  assert.equal(text(thickness), 'Worked out (inherited from the row above it) — read by CNC Drilling (CNCDRILL)');
  assert.equal(text(material), 'Worked out (fixed on its template definition: Splice plate)');
  assert.equal(text(cuts), 'Worked out (by cutting and nesting)');
});
check('Where a rule was made, in words', () => {
  assert.equal(m.levelText({ level: 'Subfamily', name: 'Plates' }), 'Subfamily: Plates');
  assert.equal(m.levelText({ level: 'This definition', name: 'Splice plate' }), 'this definition');
  assert.equal(m.levelText({ level: 'Template definition', name: null }), 'its template definition');
  assert.equal(m.levelText({ level: 'Variant', name: null, code: 'VP' }), 'Variant: VP');
});
check('A frozen row keeps its list: a flow value its flow no longer reads says it was kept', () => {
  const frozen = { reason: 'locked', orderCode: 'SO-1', lineNo: 10 };
  const kept = asked('HOLES', 'Holes', { kind: 'flow', flow, operations: [] });
  assert.equal(text(kept, { flow, frozen }), 'Kept from the flow it had when the design was frozen — nothing in SPLICE-OUTER reads it today');
  assert.equal(text(kept), 'Added by its flow SPLICE-OUTER — nothing in it reads it now');
});

const data = {
  record: { id: 1, code: null, name: 'Outer splice plate', kind: 'temporary' },
  flow,
  frozen: null,
  values: [weight, grade, holes, colour, coats, cutFrom, note],
  notAsked: [{ code: 'HOLE_DIA', name: 'Hole diameter', display: '22 mm' }],
};
check('Four groups in order, the unread hand-made values first in theirs', () => {
  const groups = m.reasonGroups(data);
  assert.deepEqual(groups.map((g) => [g.key, g.title, g.rows.map((r) => r.code)]), [
    ['flow', 'From its flow', ['HOLES', 'COATS']],
    ['manual', 'Set by hand', ['COLOUR', 'NOTE', 'GRADE']],
    ['derived', 'Worked out', ['WEIGHT', 'CUT_FROM']],
    ['notAsked', 'No longer asked for', ['HOLE_DIA']],
  ]);
  assert.deepEqual(groups[1].rows.map((r) => r.warn), [true, true, false]);
  assert.equal(groups[3].rows[0].text, 'Holds 22 mm');
  assert.ok(groups.every((g) => g.hint.length > 0));
});
check('An empty group is left out', () => {
  assert.deepEqual(m.reasonGroups({ ...data, values: [holes], notAsked: [] }).map((g) => g.key), ['flow']);
  assert.deepEqual(m.reasonGroups({ ...data, values: [], notAsked: [] }), []);
});
check('The summary counts each kind, and what nothing reads', () => {
  assert.equal(m.reasonSummary(data), '7 values asked: 2 from its flow, 3 set by hand (2 nothing reads), 2 worked out.');
  assert.equal(m.reasonSummary({ ...data, values: [holes] }), '1 value asked: 1 from its flow.');
  assert.equal(m.reasonSummary({ ...data, values: [grade] }), '1 value asked: 1 set by hand.');
  assert.equal(m.reasonSummary({ ...data, values: [] }), 'It asks for no values.');
});
check('The line about the flow, and about a frozen list', () => {
  assert.equal(m.flowLine(data), 'Made by flow SPLICE-OUTER · Splice plate, outer.');
  assert.equal(m.flowLine({ ...data, flow: null }), 'It has no flow, so no operation reads any of its values.');
  assert.equal(m.flowLine({ ...data, frozen: { reason: 'locked', orderCode: 'SO-1', lineNo: 10 } }),
    'Made by flow SPLICE-OUTER · Splice plate, outer. Line 10 of SO-1 is frozen: this list was fixed when the design was frozen, and no longer follows the flow.');
  assert.match(m.flowLine({ ...data, frozen: { reason: 'released', orderCode: 'SO-1', lineNo: 10 } }), /Line 10 of SO-1 was released to production: this list was fixed/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
