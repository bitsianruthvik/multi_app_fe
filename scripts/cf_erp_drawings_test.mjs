// Run from multi_app_fe: node scripts/cf_erp_drawings_test.mjs
// CF_ERP drawings (DXF or PDF, any level): the pure helpers behind the Structure tab's "Drawings" dialog — number formats,
// the outline as one even-odd SVG path with y flipped, the size check, the summary sentence, what a save would keep.
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['./src/apps/cf_erp/lib/drawings.ts'], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external' });
const cache = resolve('node_modules/.cache');
await mkdir(cache, { recursive: true });
const artifact = resolve(cache, `drawings-test-${process.pid}.mjs`);
await writeFile(artifact, built.outputFiles[0].text);
const m = await import(pathToFileURL(artifact));
await unlink(artifact);

let passed = 0, failed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); } };

const geo = { lengthMm: 200, widthMm: 100, areaMm2: 15000, rectAreaMm2: 20000, usePct: 75, cutLengthMm: 1234.5, piercings: 2, holes: 3, holeDiameters: [22, 22, 18.5], innerCuts: 1,
  rings: [[[0, 0], [200, 0], [200, 100], [0, 100]], [[10, 10], [20, 10], [20, 20]]] };
const row = (over = {}) => ({ id: 1, code: 'P-1', name: 'Gusset', level: 'Plate part', isPlatePart: true, pieces: 4, lengthMm: 200, widthMm: 100, thicknessMm: 12, sizeMatches: true, ...over });
const summary = (over = {}) => ({ rows: 152, rowsWithDrawing: 34, parts: 40, partsWithShape: 12, pieces: 310, piecesWithShape: 96, rectAreaM2: 10, trueAreaM2: 7.1, usePct: 71, rectKg: 5000, trueKg: 3760, savingKg: 1240, ...over });

check('numbers use thousands separators and say a missing one with a dash', () => {
  assert.equal(m.fmtMm(12345.6), '12,346');
  assert.equal(m.fmtKg(1240), '1,240 kg');
  assert.equal(m.fmtM2(1234.567), '1,234.57 m²');
  assert.equal(m.fmtPct(71.04), '71.0%');
  assert.equal(m.fmtMm(null), '—');
  assert.equal(m.fmtKg(undefined), '—');
  assert.equal(m.fmtPct(NaN), '—');
});

check('cut length reads in metres, one decimal', () => {
  assert.equal(m.fmtCutM(1234.5), '1.2 m');
  assert.equal(m.fmtCutM(12500), '12.5 m');
  assert.equal(m.fmtCutM(null), '—');
});

check('sizeText groups both sides', () => {
  assert.equal(m.sizeText(12000, 1500), '12,000 × 1,500 mm');
  assert.equal(m.sizeText(null, 90), '— × 90 mm');
});

check('the outline is one path, every ring closed, y flipped', () => {
  const d = m.ringsPath(geo.rings, 100);
  assert.equal((d.match(/M/g) ?? []).length, 2);
  assert.equal((d.match(/Z/g) ?? []).length, 2);
  assert.ok(d.startsWith('M0 100L200 100L200 0L0 0Z'), d);
  assert.ok(d.includes('M10 90L20 90L20 80Z'), d);
});

check('rings with fewer than two good points are skipped', () => {
  assert.equal(m.ringsPath([[[1, 1]], [[0, 0], [5, NaN]], []], 10), '');
  assert.equal(m.ringsPath([], 10), '');
});

check('outlineShape gives the viewBox of the rectangle', () => {
  assert.equal(m.outlineShape(geo).viewBox, '0 0 200 100');
});

check('size check: match, differ, not compared, and no drawing', () => {
  assert.equal(m.sizeCheck(row(), geo).mark, '✓');
  const bad = m.sizeCheck(row({ sizeMatches: false, lengthMm: 210 }), geo);
  assert.equal(bad.mark, '⚠');
  assert.match(bad.text, /Row 210 × 100 mm but the drawing is 200 × 100 mm/);
  assert.equal(m.sizeCheck(row({ sizeMatches: null }), geo).mark, '·');
  assert.equal(m.sizeCheck(row(), null).mark, '·');
});

check('row codes fall back to the name', () => {
  assert.equal(m.rowCodes([row(), row({ id: 2, code: null, name: 'Web' })]), 'P-1, Web');
  assert.equal(m.rowCodes([]), '—');
});

check('hole diameters are counted and sorted', () => {
  assert.equal(m.holesTitle(geo), '1 × Ø18.5 mm, 2 × Ø22 mm');
  assert.equal(m.holesTitle({ ...geo, holes: 0, holeDiameters: [] }), 'No holes to drill.');
});

check('the summary says the rows covered, then the shapes, use and saving', () => {
  assert.equal(m.summaryWords(summary()),
    '34 of 152 rows have a drawing. 12 of 40 plate parts have a shape (96 of 310 pieces). Their shapes use 71% of their rectangles — true-shape nesting could save up to 1,240 kg on them.');
});

check('with no plate-part shape the summary is the first sentence only', () => {
  assert.equal(m.summaryWords(summary({ partsWithShape: 0, piecesWithShape: 0, usePct: null, savingKg: 0 })), '34 of 152 rows have a drawing.');
  assert.equal(m.summaryWords(summary({ rows: 1, rowsWithDrawing: 0, partsWithShape: 0 })), '0 of 1 row has a drawing.');
});

check('a use between 99.5 and 100 shows one decimal, never 100%', () => {
  const s = m.summaryWords(summary({ usePct: 99.7, savingKg: 30 }));
  assert.match(s, /use 99.7% of/);
  assert.ok(!/100%/.test(s));
});

check('the summary with nothing to save says so, not "0 kg"', () => {
  const s = m.summaryWords(summary({ savingKg: 0, usePct: 100 }));
  assert.ok(!/0 kg/.test(s));
  assert.match(s, /little for true-shape nesting to save/);
});

check('the empty state, hint and intro use the agreed words', () => {
  assert.equal(m.NO_DRAWINGS, 'Upload a drawing for each row, named by its drawing mark.');
  assert.equal(m.NO_MARK_HINT, 'A row needs a drawing mark (Structure or Values) before a drawing can be matched to it.');
  assert.equal(m.INTRO.replace(/’/g, "'"), "A drawing for any row of this line — DXF or PDF, named by the row's drawing mark (e.g. G1-1.pdf, BF1.dxf). A plate part's DXF is also read as its shape: true area, cut length and piercings.");
});

check('the button shows n of m rows only once rows are known', () => {
  assert.equal(m.buttonLabel(null), 'Drawings');
  assert.equal(m.buttonLabel({ rows: 0, rowsWithDrawing: 0 }), 'Drawings');
  assert.equal(m.buttonLabel({ rows: 152, rowsWithDrawing: 34 }), 'Drawings (34 of 152 rows)');
});

check('only new and replacing files are saved', () => {
  const f = (status) => ({ name: `${status}.dxf`, mark: status, status, rows: [], geometry: null, problems: [], warnings: [] });
  const kept = m.savable(['new', 'replaces', 'unmatched', 'error'].map(f)).map((x) => x.status);
  assert.deepEqual(kept, ['new', 'replaces']);
});

check('DXF and PDF names are taken, in any case; nothing else', () => {
  assert.equal(m.drawingKind('BIC-01.dxf'), 'dxf');
  assert.equal(m.drawingKind('G1-1.PDF'), 'pdf');
  assert.equal(m.drawingKind('BIC-01.dwg'), null);
  assert.equal(m.drawingKind('pdf'), null);
  assert.ok(m.isDxf('A.DXF') && !m.isDxf('A.pdf'));
  assert.ok(m.isDrawingFile('a.pdf') && !m.isDrawingFile('a.png'));
});

check('picked files: wrong kind and over 4 MB are set aside', () => {
  const f = (name, size) => ({ name, size });
  const out = m.sortPicked([f('a.dxf', 10), f('b.pdf', 4 * 1024 * 1024), f('c.pdf', 4 * 1024 * 1024 + 1), f('d.png', 1)]);
  assert.deepEqual(out.ok.map((x) => x.name), ['a.dxf', 'b.pdf']);
  assert.deepEqual(out.tooBig, ['c.pdf']);
  assert.deepEqual(out.wrongKind, ['d.png']);
});

check('level helpers: comma-joined, deduped, grouped in first-met order', () => {
  assert.equal(m.levelText(['Girder segment', 'Plate part']), 'Girder segment, Plate part');
  assert.equal(m.levelText([]), '—');
  assert.equal(m.levelText(null), '—');
  assert.deepEqual(m.levelsOfRows([row(), row({ id: 2, level: 'Span' }), row({ id: 3 })]), ['Plate part', 'Span']);
  const g = m.groupByLevel([{ id: 1, level: 'Span' }, { id: 2, level: 'Part' }, { id: 3, level: 'Span' }]);
  assert.deepEqual(g.map((x) => [x.level, x.rows.map((r) => r.id)]), [['Span', [1, 3]], ['Part', [2]]]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
