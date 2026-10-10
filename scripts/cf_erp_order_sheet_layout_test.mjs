// Run from multi_app_fe: node scripts/cf_erp_order_sheet_layout_test.mjs
//
// The order-line Excel is "the BOM as seen on screen, two rows per line". What the
// screen draws is decided by the frontend's own pure rules; what the sheet writes
// is decided by the backend's mirror of them (multi_app_be/apps/cf_erp/lib/
// orderSheetLayout.js). This suite runs BOTH over one fixture — a structure and a
// values view, the two answers the Structure tab is drawn from — and holds them to
// the same rows, the same fields per row in the same order, and the same text in
// every cell. Change a rule on one side only and it fails.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { orderSheetLayout, placeholderKey } from '../../multi_app_be/apps/cf_erp/lib/orderSheetLayout.js';

const built = await build({
  stdin: {
    contents: `export * from './src/apps/cf_erp/lib/bomGridLayout'; export * from './src/apps/cf_erp/lib/stripLayout'; export * from './src/apps/cf_erp/lib/displayCode';
      export * from './src/apps/cf_erp/components/Bom/bomModel'; export * from './src/apps/cf_erp/components/Bom/flowShown'; export * from './src/apps/cf_erp/components/Values/valuesModel';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external',
});
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `order-sheet-layout-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };

/* ---------------------------------------------------------------------------
 * The fixture: GET /order-lines/:id/structure and GET /order-lines/:id/values
 * ------------------------------------------------------------------------ */
const node = (id, name, more = {}, children = []) => ({
  id, key: `l${id * 10}`, name, code: null, shortName: null, kind: 'temporary', status: 'draft', uom: 'nos', depth: 0,
  quantity: 1, total: 1, lineId: id * 10, lineNo: 10, position: 1, role: null, selection: null, resolved: true,
  flow: null, bom: null, children, ...more,
});
const flow = (id, code, from) => ({ id, code, name: `${code} flow`, from, usual: from === 'line' ? { id: 99, code: 'USUAL', name: 'Usual flow', from: 'template' } : null });

// A plate part with everything: dimensions, a pick-list, a default, a worked-out weight, a required empty mark,
// a PART_FUNCTION that only repeats its definition, an unanswered SHIP_UNIT — and its automatic cut pieces below it.
const rawPlate = node(7, 'Plate 25 × 2500 × 12000', { kind: 'catalog', code: 'PL-25', role: 'Raw plate', depth: 4, quantity: 0.2, total: 1.2 });
const cutPlate = node(6, 'Cut plate 25 × 500 × 11650', { role: 'Cut from', depth: 3, quantity: 1, total: 6 }, [rawPlate]);
const plate = node(3, 'Top flange', { depth: 2, quantity: 3, total: 6, flow: flow(31, 'PARTFAB', 'line') }, [cutPlate]);
// A part with one dimension only, a PART_FUNCTION still missing, and a SHIP_UNIT it answered.
const stiff = node(4, 'Stiffener', { depth: 2, quantity: 1, total: 2, role: 'stiffener', flow: flow(32, 'PLAIN', 'template') });
// A catalog bolt, placed TWICE under the same assembly: one record, two places.
const bolt1 = node(5, 'Bolt M20 × 70', { kind: 'catalog', code: 'BOLT-M20', depth: 2, quantity: 4, total: 8, key: 'l51', lineId: 51 });
const bolt2 = node(5, 'Bolt M20 × 70', { kind: 'catalog', code: 'BOLT-M20', depth: 2, quantity: 6, total: 12, key: 'l52', lineId: 52, role: 'Field bolts' });
// A row the values view says nothing about, and a selection still to choose.
const plain = node(8, 'Packing', { depth: 2, quantity: 2, total: 4 });
const choose = node(9, 'Raw material', { kind: 'selection', shortName: 'RM', code: 'SEL-RM', depth: 2, quantity: 1, total: 2, resolved: false, selection: { id: 9, code: 'SEL-RM', name: 'Raw material', shortName: 'RM' } });
const girder = node(2, 'Girder line', { depth: 1, quantity: 1, total: 2, role: 'Girder G1', flow: flow(33, 'LINE', 'item') }, [plate, stiff, bolt1, bolt2, plain, choose]);
const root = node(1, 'Bridge span', { key: 'r1', lineId: null, lineNo: null, position: null, quantity: 2, total: 2, flow: flow(34, 'SPAN', 'template') }, [girder]);

const col = (code, name, dataType, unit, rule, more = {}) => ({ code, name, dataType, unit, decimals: null, rule, required: false, editable: rule === 'entered' || rule === 'defaulted', ...more });
const view = {
  line: { id: 900, lineNo: 10, lineType: 'custom', quantity: 2 },
  order: { id: 80, code: 'SO-TEST', status: 'inquiry' },
  root: { id: 1, code: null, name: 'Bridge span' },
  editable: true, lock: null, truncated: false,
  counts: { rows: 5, own: 4, shared: 1, missingOwn: 2, missingShared: 0, rowsMissing: 2, unresolved: 1, noValues: 1 },
  optionLists: {
    o1: [{ id: 1, value: 'E250', label: null }, { id: 2, value: 'E350', label: 'E350 — high strength' }],
    o2: [{ id: 5, value: 'A', label: 'A — tested at 27 J' }, { id: 6, value: 'B0', label: null }],
    o3: [{ id: 1, value: 'E250', label: null }],
  },
  groups: [
    { // The order's own assemblies.
      key: 'own:10', own: true, classification: { id: 10, code: 'ASM', name: 'Assembly', path: 'Steel › Assembly' },
      columns: [
        col('WEIGHT', 'Weight', 'number', 'kg', 'rollup', { why: 'Added up from the BOM below.' }),
        col('SHIP_UNIT', 'Ships as one unit', 'boolean', null, 'entered'),
        col('SPAN_LENGTH', 'Span length', 'number', 'mm', 'entered', { required: true }),
        col('ERECTION_SEQUENCE_NOTE', 'Erection sequence note', 'text', null, 'entered'),
      ],
      rows: [
        { id: 1, code: null, name: 'Bridge span', kind: 'temporary', status: 'draft', depth: 0, parent: null, places: 0, lineNo: null, position: null, quantity: 2, missing: 0,
          cells: { WEIGHT: { display: '334644.130 kg' }, SHIP_UNIT: {}, SPAN_LENGTH: { input: '59300' }, ERECTION_SEQUENCE_NOTE: { input: 'Launch from A1' } } },
        { id: 2, code: null, name: 'Girder line', kind: 'temporary', status: 'draft', depth: 1, parent: { id: 1, code: null, name: 'Bridge span' }, places: 1, lineNo: 10, position: 1, quantity: 1, missing: 1,
          cells: { WEIGHT: { display: '76080.931 kg' }, SHIP_UNIT: { input: 'false' }, SPAN_LENGTH: { missing: true } } },
      ],
    },
    { // The order's own plate parts.
      key: 'own:11', own: true, classification: { id: 11, code: 'PART', name: 'Plate part', path: 'Steel › Plate part' },
      columns: [
        col('SECTION_AREA', 'Section area', 'number', 'mm2', 'calculated', { why: 'Worked out by formula AREA from this item’s other values.' }),
        col('LENGTH', 'Length', 'number', 'mm', 'entered', { required: true }),
        col('WIDTH', 'Width', 'number', 'mm', 'entered', { required: true }),
        col('THICKNESS', 'Thickness', 'number', 'mm', 'entered', { required: true }),
        col('WEIGHT', 'Weight', 'number', 'kg', 'calculated', { why: 'Worked out by formula PWT from this item’s other values.' }),
        col('GRADE', 'Grade', 'option', null, 'entered', { required: true, options: 'o1' }),
        col('IMPACT_CLASS', 'Impact class', 'option', null, 'defaulted', { options: 'o2' }),
        col('DRAWING_MARK', 'Drawing mark', 'text', null, 'entered', { required: true }),
        col('PART_FUNCTION', 'Part function', 'text', null, 'entered'),
        col('SHIP_UNIT', 'Ships as one unit', 'boolean', null, 'entered'),
        col('HOLED', 'Holed', 'boolean', null, 'entered'),
        col('DENSITY', 'Density', 'number', 'kg/m3', 'fixed', { why: 'Fixed at family level (Steel) — change it there.' }),
      ],
      rows: [
        { id: 3, code: null, name: 'Top flange', kind: 'temporary', status: 'draft', depth: 2, parent: { id: 2, code: null, name: 'Girder line' }, places: 1, lineNo: 10, position: 1, quantity: 3, missing: 1,
          cells: {
            SECTION_AREA: { display: '12500 mm2' }, LENGTH: { input: '11650' }, WIDTH: { input: '500' }, THICKNESS: { input: '25' },
            WEIGHT: { display: '1143.156 kg' }, GRADE: { input: '2' }, IMPACT_CLASS: { defaultDisplay: 'B0' }, DRAWING_MARK: { missing: true },
            PART_FUNCTION: { input: 'Flange' }, SHIP_UNIT: {}, HOLED: { input: 'true' }, DENSITY: { display: '7850 kg/m3' },
          } },
        { id: 4, code: null, name: 'Stiffener', kind: 'temporary', status: 'draft', depth: 2, parent: { id: 2, code: null, name: 'Girder line' }, places: 1, lineNo: 20, position: 1, quantity: 1, missing: 1,
          // No LENGTH or WIDTH at all; a narrower grade list of its own; PART_FUNCTION required here and still empty.
          cells: { THICKNESS: { input: '12.5' }, GRADE: { options: 'o3' }, PART_FUNCTION: { required: true, missing: true }, SHIP_UNIT: { input: 'true' }, HOLED: { input: 'false' }, WEIGHT: {} } },
        // A cut piece has values too — it is not on the screen, so neither they nor it may reach the sheet.
        { id: 6, code: null, name: 'Cut plate 25 × 500 × 11650', kind: 'temporary', status: 'draft', depth: 3, parent: { id: 3, code: null, name: 'Top flange' }, places: 1, lineNo: 10, position: 1, quantity: 1, missing: 1,
          cells: { LENGTH: { input: '11650' }, WIDTH: { input: '500' }, THICKNESS: { input: '25' }, DRAWING_MARK: { missing: true } } },
      ],
    },
    { // A shared catalog record: shown, never typed here.
      key: 'shared:12', own: false, classification: { id: 12, code: 'BOLT', name: 'Bolt', path: 'Bought › Bolt' },
      columns: [
        col('WEIGHT', 'Weight', 'number', 'kg', 'entered', { editable: false }),
        col('LENGTH', 'Length', 'number', 'mm', 'entered', { editable: false }),
        col('BOLT_CLASS', 'Bolt class', 'text', null, 'entered', { editable: false, required: true }),
      ],
      rows: [
        { id: 5, code: 'BOLT-M20', name: 'Bolt M20 × 70', kind: 'catalog', status: 'active', depth: 2, parent: { id: 2, code: null, name: 'Girder line' }, places: 2, lineNo: 30, position: 1, quantity: 4, missing: 1,
          readOnly: 'BOLT-M20 is a catalog item, shared by every order that uses it — change its values on the item itself.',
          cells: { WEIGHT: { input: '0.25' }, LENGTH: { input: '70' }, BOLT_CLASS: { missing: true } } },
      ],
    },
  ],
};
// GET /order-lines/:id/placeholders — the stiffener's code cannot be worked out yet, the root has none.
const placeholders = [
  { bomLineId: 20, itemId: 2, code: 'SO-TEST-SPAN-#-G1', pieces: 2, seqRange: null },
  { bomLineId: 30, itemId: 3, code: 'SO-TEST-SPAN-#-G1-TFL#', pieces: 6, seqRange: [1, 3] },
  { bomLineId: 40, itemId: 4, code: null, pieces: 2, seqRange: null },
];
const frozenFixture = JSON.stringify({ root, view, placeholders });

/* ---------------------------------------------------------------------------
 * The screen's side: the frontend's own functions, used the way BomPanel and
 * BomGrid use them (everything expanded, nothing typed and unsaved).
 * ------------------------------------------------------------------------ */
function screenLayout() {
  const open = new Set(m.openableKeys(root));
  const rows = m.withoutCutPieces(m.flattenBom(root, open));            // BomPanel.treeRows
  const gapScope = new Set(m.walkNodes(root).filter((f) => !m.isCutPiece(f.node)).map((f) => f.node.id));
  const gaps = m.computeGaps(view, undefined, gapScope);                 // BomPanel.liveGaps
  const cat = m.viewCatalog(view);                                       // BomGrid.catalog
  const cols = m.sortColumns(cat.cols);
  const used = cols.filter((c) => rows.some((r) => m.viewUses(cat.records, r.node.id, c.code)));  // "only the columns some row uses"
  const shown = m.shownColumns(cols, used);
  const byCode = new Map(shown.map((c) => [c.code, c]));
  const phRows = new Map(placeholders.map((p) => [`${p.bomLineId != null ? `l${p.bomLineId}` : `i${p.itemId}`}`, p]));
  return rows.map((row) => {
    const n = row.node;
    const canEdit = n.kind === 'temporary';                              // BomPanel.mine(), on an open line
    const cellOf = (code) => m.viewCell(view, cat.records.get(n.id), code, canEdit);
    const codes = m.rowColumnCodes(shown, { quantity: n.quantity, total: n.total, hasChildren: row.hasChildren },
      (code) => m.viewUses(cat.records, n.id, code), (code) => cellOf(code)?.input ?? '', (code) => !!gaps.get(n.id)?.includes(code));
    const fields = [];
    for (const code of codes) {
      if (code === '$quantity') { fields.push({ key: code, label: 'Qty', value: String(n.quantity) }); continue; }   // BomGrid: short 'Qty'
      if (code === '$total') { fields.push({ key: code, label: 'Total', value: String(n.total) }); continue; }       // BomGrid: short 'Total'
      const head = byCode.get(code);
      const label = `${m.sheetLabel(code, head.name)}${head.unit ? ` (${head.unit})` : ''}`;                         // the strip header's word (whole, not cut to a cell) + unit
      const c = cellOf(code);
      fields.push(c ? { key: code, label, value: c.text, editable: c.editable, missing: !!gaps.get(n.id)?.includes(code) } : { key: code, label, value: '', na: true });
    }
    // The flow chip sits in the row's header, after its code: the sheet writes it after Qty / Total.
    const at = fields.findIndex((f) => f.key !== '$quantity' && f.key !== '$total');
    fields.splice(at < 0 ? fields.length : at, 0, { key: '$flow', label: 'Flow', value: m.flowShown(n, {}, () => undefined).flow?.code ?? '' });
    const p = phRows.get(n.lineId != null ? `l${n.lineId}` : `i${n.id}`);
    return {
      key: n.key, depth: n.depth, label: m.rowLabel(n.name, n.role),
      code: p?.code ?? (n.kind === 'temporary' ? '' : m.displayCode(n) ?? ''),   // BomGrid's CodeText
      fields,
    };
  });
}

/* --- the sheet's side ------------------------------------------------------ */
const codes = new Map(placeholders.filter((p) => p.code).map((p) => [placeholderKey(p.bomLineId, p.itemId), p.code]));
const sheet = orderSheetLayout({ root, view, codes });
const screen = screenLayout();
const sheetRow = (key) => sheet.find((r) => r.key === key);
const fieldOf = (key, f) => sheetRow(key).fields.find((x) => x.key === f);
const keysOf = (key) => sheetRow(key).fields.filter((f) => f.kind !== 'na').map((f) => f.key);

/* --- the two, held together ------------------------------------------------ */
check('the same rows, in the same order', () => assert.deepEqual(sheet.map((r) => r.key), screen.map((r) => r.key)));
check('each row has the same name (· role), depth and code', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.label, r.depth, r.code]), screen.map((r) => [r.key, r.label, r.depth, r.code])));
check('each row has the same fields in the same order', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.fields.map((f) => f.key)]), screen.map((r) => [r.key, r.fields.map((f) => f.key)])));
check('each field has the same label', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.fields.map((f) => f.label)]), screen.map((r) => [r.key, r.fields.map((f) => f.label)])));
check('each cell shows the same text', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.fields.map((f) => f.value)]), screen.map((r) => [r.key, r.fields.map((f) => f.value)])));
check('a cell that does not apply on screen is the one the sheet leaves out', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.fields.filter((f) => f.kind === 'na').map((f) => f.key)]), screen.map((r) => [r.key, r.fields.filter((f) => f.na).map((f) => f.key)])));
check('a value is typeable in the sheet exactly where it is on screen', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.fields.filter((f) => f.kind === 'value').map((f) => [f.key, f.editable])]),
  screen.map((r) => [r.key, r.fields.filter((f) => 'editable' in f).map((f) => [f.key, f.editable])])));
check('a value is amber in the sheet exactly where it is on screen', () => assert.deepEqual(
  sheet.map((r) => [r.key, r.fields.filter((f) => f.kind === 'value' && f.missing).map((f) => f.key)]),
  screen.map((r) => [r.key, r.fields.filter((f) => f.missing).map((f) => f.key)])));

/* --- and each case of the fixture, said out loud ---------------------------- */
check('rows: the structure depth first, both places of the bolt, no cut pieces', () => assert.deepEqual(
  sheet.map((r) => r.key), ['r1', 'l20', 'l30', 'l40', 'l51', 'l52', 'l80', 'l90']));
check('a cut piece and its raw plate never appear', () => assert.ok(!sheet.some((r) => r.nodeId === 6 || r.nodeId === 7)));
check('dimensions first (Thk · L · W), other values in column order, the roll-up last', () => assert.deepEqual(
  keysOf('l30'), ['$quantity', '$total', '$flow', 'THICKNESS', 'LENGTH', 'WIDTH', 'GRADE', 'IMPACT_CLASS', 'DRAWING_MARK', 'HOLED', 'SECTION_AREA', 'DENSITY', 'WEIGHT']));
check('labels are the grid’s word and the unit', () => assert.deepEqual(
  sheetRow('l30').fields.map((f) => f.label), ['Qty', 'Total', 'Flow', 'Thk (mm)', 'L (mm)', 'W (mm)', 'Grade', 'Impact', 'Dwg mark', 'Holed', 'Area (mm2)', 'Density (kg/m3)', 'Wt (kg)']));
check('Total only where it differs from Qty', () => { assert.ok(!keysOf('r1').includes('$total')); assert.equal(fieldOf('l30', '$total').value, '6'); });
check('a row with no values still has Qty and Flow', () => { assert.deepEqual(keysOf('l80'), ['$quantity', '$total', '$flow']); assert.deepEqual(keysOf('l90'), ['$quantity', '$total', '$flow']); });
check('PART_FUNCTION is hidden when filled and shown when required and empty', () => { assert.ok(!keysOf('l30').includes('PART_FUNCTION')); assert.ok(keysOf('l40').includes('PART_FUNCTION')); assert.equal(fieldOf('l40', 'PART_FUNCTION').missing, true); });
check('SHIP_UNIT: on an assembly, on a leaf that answered it, not on a leaf that did not', () => {
  assert.ok(keysOf('r1').includes('SHIP_UNIT')); assert.ok(keysOf('l20').includes('SHIP_UNIT'));
  assert.ok(keysOf('l40').includes('SHIP_UNIT')); assert.ok(!keysOf('l30').includes('SHIP_UNIT'));
  assert.equal(fieldOf('l20', 'SHIP_UNIT').value, 'No'); assert.equal(fieldOf('l40', 'SHIP_UNIT').value, 'Yes'); assert.equal(fieldOf('r1', 'SHIP_UNIT').value, '');
});
check('a part whose only children are cut pieces is a leaf for SHIP_UNIT', () => assert.equal(sheetRow('l30').hasChildren, false));
check('a default is shown as the screen shows it, and is not the row’s own value', () => {
  const f = fieldOf('l30', 'IMPACT_CLASS');
  assert.deepEqual([f.value, f.state, f.input, f.editable], ['B0', 'default', '', true]);
});
check('a worked-out value shows its display and is not typeable', () => {
  assert.deepEqual([fieldOf('l30', 'WEIGHT').value, fieldOf('l30', 'WEIGHT').state, fieldOf('l30', 'WEIGHT').editable], ['1143.156 kg', 'worked', false]);
  assert.deepEqual([fieldOf('l20', 'WEIGHT').value, fieldOf('l20', 'WEIGHT').editable], ['76080.931 kg', false]);
  assert.equal(fieldOf('l30', 'DENSITY').editable, false);
});
check('a required empty cell is amber, typeable and empty', () => {
  assert.deepEqual([fieldOf('l30', 'DRAWING_MARK').value, fieldOf('l30', 'DRAWING_MARK').missing, fieldOf('l30', 'DRAWING_MARK').editable], ['', true, true]);
  assert.equal(fieldOf('l20', 'SPAN_LENGTH').missing, true);
});
check('a pick-list shows the option in words and offers that row’s own choices', () => {
  assert.equal(fieldOf('l30', 'GRADE').value, 'E350 — high strength');
  assert.deepEqual(fieldOf('l30', 'GRADE').options.map((o) => o.text), ['E250', 'E350 — high strength']);
  assert.deepEqual(fieldOf('l40', 'GRADE').options.map((o) => o.text), ['E250']);
});
check('a dimension a row does not have is left out of its pair', () => {
  assert.deepEqual(keysOf('l40'), ['$quantity', '$total', '$flow', 'THICKNESS', 'SHIP_UNIT', 'GRADE', 'PART_FUNCTION', 'HOLED', 'WEIGHT']);
  assert.deepEqual(sheetRow('l40').fields.filter((f) => f.kind === 'na').map((f) => f.key), ['LENGTH', 'WIDTH']);
});
check('a record placed twice appears once per place, each with its own quantity and id', () => {
  assert.deepEqual([sheetRow('l51').id, sheetRow('l52').id], ['51:5', '52:5']);
  assert.deepEqual([fieldOf('l51', '$quantity').value, fieldOf('l52', '$quantity').value], ['4', '6']);
  assert.deepEqual(sheetRow('l51').fields.filter((f) => f.kind === 'value').map((f) => [f.key, f.value]), sheetRow('l52').fields.filter((f) => f.kind === 'value').map((f) => [f.key, f.value]));
  assert.equal(sheetRow('l52').label, 'Bolt M20 × 70 · Field bolts');
});
check('a shared record is shown and never typeable; a missing value on it is not amber', () => {
  assert.ok(sheetRow('l51').fields.filter((f) => f.kind === 'value').every((f) => !f.editable));
  assert.equal(fieldOf('l51', 'BOLT_CLASS').missing, false);
  assert.equal(fieldOf('l51', 'LENGTH').value, '70');
});
check('the code under a name: placeholder, else nothing / short name / catalog code', () => assert.deepEqual(
  sheet.map((r) => r.code), ['', 'SO-TEST-SPAN-#-G1', 'SO-TEST-SPAN-#-G1-TFL#', '', 'BOLT-M20', 'BOLT-M20', '', 'RM']));
check('a role is shown only when it says something the name does not', () => { assert.equal(sheetRow('l20').label, 'Girder line · Girder G1'); assert.equal(sheetRow('l40').label, 'Stiffener'); });
check('the flow is the one that applies', () => assert.deepEqual(['r1', 'l20', 'l30', 'l80'].map((k) => fieldOf(k, '$flow').value), ['SPAN', 'LINE', 'PARTFAB', '']));
check('quantity: typeable on the order’s own rows, not on the top row', () => assert.deepEqual(
  ['r1', 'l20', 'l30', 'l51'].map((k) => fieldOf(k, '$quantity').editable), [false, true, true, true]));
check('a well-known value keeps the grid’s short word; any other is named in full, never cut', () => {
  for (const code of ['THICKNESS', 'LENGTH', 'WIDTH', 'WEIGHT', 'GRADE', 'DRAWING_MARK', 'SHIP_UNIT']) assert.equal(m.sheetLabel(code, 'Some long name of it'), m.shortLabel(code, 'Some long name of it'));
  assert.equal(m.shortLabel('ERECTION_SEQUENCE_NOTE', 'Erection sequence note'), 'Erection sequ…');
  assert.equal(fieldOf('r1', 'ERECTION_SEQUENCE_NOTE').label, 'Erection sequence note');
});
check('a frozen line: the same rows and text, nothing typeable', () => {
  const frozen = orderSheetLayout({ root, view: { ...view, editable: false, lock: { reason: 'locked', message: 'Line 10 is locked.' } }, codes });
  assert.deepEqual(frozen.map((r) => r.fields.map((f) => f.value)), sheet.map((r) => r.fields.map((f) => f.value)));
  assert.ok(frozen.every((r) => r.fields.every((f) => !f.editable)));
});
check('two fields of one row never share a label', () => {
  const twin = JSON.parse(JSON.stringify(view));
  twin.groups[0].columns.push(col('SPAN_LENGTH_2', 'Span length', 'number', 'mm', 'entered'));
  twin.groups[0].rows[0].cells.SPAN_LENGTH_2 = { input: '1' };
  const labels = orderSheetLayout({ root, view: twin, codes })[0].fields.map((f) => f.label);
  assert.equal(new Set(labels).size, labels.length);
});
check('neither side changed the fixture', () => assert.equal(JSON.stringify({ root, view, placeholders }), frozenFixture));

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
