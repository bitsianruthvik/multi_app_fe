// displayCode: a definition shows its short name (never its code); everything else its code.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '../src/apps/cf_erp/lib/displayCode.ts'), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { displayCode, displayLabel, codeOrName, definitionLabel, isDefinitionKind } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

eq('template shows short name', displayCode({ kind: 'template', code: 'GS-001', shortName: 'GS' }), 'GS');
eq('selection shows short name', displayCode({ kind: 'selection', code: 'SEL-1', shortName: 'SEL' }), 'SEL');
eq('recordKind definition shows short name', displayCode({ recordKind: 'definition', code: 'X-1', shortName: 'X' }), 'X');
eq('definition without short name shows nothing', displayCode({ kind: 'template', code: 'GS-001', shortName: null }), null);
eq('definition with empty short name shows nothing', displayCode({ kind: 'template', code: 'GS-001', shortName: '' }), null);
eq('definition with undefined short name shows nothing', displayCode({ kind: 'selection', code: 'S-1' }), null);
eq('catalog keeps code', displayCode({ kind: 'catalog', code: 'RM-1', shortName: 'RM' }), 'RM-1');
eq('temporary keeps code', displayCode({ kind: 'temporary', code: 'T-1-1', shortName: 'T' }), 'T-1-1');
eq('item without code is null', displayCode({ kind: 'catalog', code: null }), null);
eq('null record', displayCode(null), null);
eq('isDefinitionKind', [isDefinitionKind('template'), isDefinitionKind('catalog'), isDefinitionKind(undefined, 'definition')], [true, false, true]);
eq('displayLabel definition', displayLabel({ kind: 'template', code: 'GS-001', shortName: 'GS', name: 'Girder' }), 'GS · Girder');
eq('displayLabel definition no short', displayLabel({ kind: 'template', code: 'GS-001', name: 'Girder' }), 'Girder');
eq('displayLabel item', displayLabel({ kind: 'catalog', code: 'RM-1', name: 'Plate' }), 'RM-1 · Plate');
eq('codeOrName falls back', codeOrName({ kind: 'template', code: 'GS-001', name: 'Girder' }), 'Girder');
eq('definitionLabel', [definitionLabel({ shortName: 'GS', name: 'Girder' }), definitionLabel({ shortName: null, name: 'Girder' })], ['GS', 'Girder']);

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('all passed');
