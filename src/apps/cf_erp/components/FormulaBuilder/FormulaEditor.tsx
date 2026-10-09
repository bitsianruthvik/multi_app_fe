import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Autocomplete, Box, Button, TextField, Tooltip, Typography } from '@mui/material';
import TableChartRounded from '@mui/icons-material/TableChartRounded';
import {
  LEVEL_FIELDS, fieldFor, guessAxisField, insertAt, isLevelCode, isReadable, isWord, numberText, tokenize, unitText,
  type BuilderField, type FieldIndex, type FieldRole, type Tok,
} from '../../lib/formulaBuilder';
import { suggestAt, type Suggestion } from '../../lib/formulaSuggest';
import { boundCharts } from '../../lib/charts';
import { chartCodeOf, lookupAt, type LookupCall } from '../../lib/lookupHint';

/** One field in the picker, with the namespace it is read through. */
interface PickOption { role: FieldRole; field: BuilderField; group: string }

const GROUP: Record<FieldRole, string> = {
  item: 'This piece (item.…)',
  machine: 'The machine (machine.…)',
  plain: 'This record',
  children: 'BOM children (children.…) — inside SUM / COUNT / AVG',
};
const refText = (role: FieldRole, code: string) => (role === 'plain' ? code : `${role}.${code}`);

const COLOUR: Partial<Record<Tok['kind'], string>> = {
  item: 'var(--c-primary-700)',
  machine: 'var(--c-info-800)',
  children: 'var(--c-success-800)',
  num: 'var(--c-success-800)',
  str: 'var(--c-success-800)',
  func: 'var(--c-warning-800)',
  op: 'var(--c-text-2)',
  paren: 'var(--c-text-3)',
  comma: 'var(--c-text-3)',
  bad: 'var(--c-danger-700)',
};

/** The coloured copy of the text that sits under the transparent textarea. */
function Highlight({ value, idx, shortNames }: { value: string; idx: FieldIndex | null; shortNames: Set<string> }) {
  const toks = tokenize(value);
  return (
    <>
      {toks.map((t) => {
        const known = !idx || t.kind === 'func' || (t.kind === 'name' && shortNames.has(t.code ?? t.text)) || (t.kind === 'machine' && shortNames.has(t.code ?? ''))
          || !['item', 'machine', 'name'].includes(t.kind)
          || (t.kind === 'item' && isLevelCode(t.code))
          || !!fieldFor(idx, t.kind === 'name' ? 'plain' : (t.kind as FieldRole), t.code ?? '');
        return (
          <Box key={t.start} component="span" data-tok={t.kind}
            sx={{ color: COLOUR[t.kind], fontWeight: t.kind === 'func' ? 600 : undefined, ...(known ? {} : { textDecoration: 'underline wavy var(--c-danger-600)' }) }}>
            {t.text}
          </Box>
        );
      })}
      {/* A trailing newline needs a character after it to take up a line. */}
      {'​'}
    </>
  );
}

const editorFont = { fontFamily: 'var(--font-mono)', fontSize: 15, lineHeight: '24px', letterSpacing: 0, padding: '10px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } as const;

/**
 * The advanced formula editor: the expression stays plain, editable text (with
 * syntax colouring and unknown names underlined), and everything can also be
 * put in with the mouse — fields from a searchable picker grouped by where
 * they are read, operators and functions as buttons, and — while the caret is in
 * a LOOKUP( … ) call — a hint bar that lists the machine's charts to click.
 */
export function FormulaEditor({ value, onChange, idx, itemFields, machineFields, plainFields = [], timingOnly = true, autoFocus = false, label = 'Formula', minHeight = 72 }: {
  value: string;
  onChange: (v: string) => void;
  idx: FieldIndex | null;
  itemFields: BuilderField[];
  machineFields: BuilderField[];
  /** Setup › Value formulas: plain codes for value formulas, and children.X for roll-ups. */
  plainFields?: BuilderField[];
  /** An operation time reads only item.X and machine.X. */
  timingOnly?: boolean;
  autoFocus?: boolean;
  label?: string;
  /** Height of the text area in pixels (about 24 per line). */
  minHeight?: number;
}) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const under = useRef<HTMLDivElement | null>(null);
  const caret = useRef<{ start: number; end: number }>({ start: value.length, end: value.length });
  // Type-ahead: the caret as state (the list follows it), whether the text has focus,
  // the highlighted offer, and the text Esc closed the list on (it reopens on the next key).
  const [caretAt, setCaretAt] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const mirrorMark = useRef<HTMLSpanElement | null>(null);
  const [listPos, setListPos] = useState<{ left: number; top: number }>({ left: 12, top: 34 });

  const options = useMemo<PickOption[]>(() => {
    const out: PickOption[] = [];
    for (const f of [...itemFields.filter(isReadable), ...LEVEL_FIELDS]) out.push({ role: 'item', field: f, group: GROUP.item });
    for (const f of machineFields) if (f.dataType === 'number') out.push({ role: 'machine', field: f, group: GROUP.machine });
    if (!timingOnly) {
      for (const f of plainFields) if (f.dataType === 'number') out.push({ role: 'plain', field: f, group: GROUP.plain });
      for (const f of plainFields) if (f.dataType === 'number') out.push({ role: 'children', field: f, group: GROUP.children });
    }
    return out;
  }, [itemFields, machineFields, plainFields, timingOnly]);

  const remember = () => {
    const a = area.current;
    if (!a) return;
    caret.current = { start: a.selectionStart ?? value.length, end: a.selectionEnd ?? value.length };
    if (a.selectionStart !== caretAt) setActive(0);
    setCaretAt(a.selectionStart ?? value.length);
  };

  const FN_HINTS: Record<string, [number, string]> = {
    MIN: [2, 'The smaller of two values'], MAX: [2, 'The larger of two values'], ROUND: [2, 'ROUND(x, decimals)'], IF: [3, 'IF(condition, then, otherwise)'],
    LOOKUP: [2, 'A rate from a machine chart — LOOKUP(machine.CHART, item.KEY)'], ABS: [1, 'Without its sign'], SQRT: [1, 'Square root'], CEIL: [1, 'Rounded up'], FLOOR: [1, 'Rounded down'],
    SUM: [1, 'Sum over the BOM children'], COUNT: [1, 'How many BOM children'], AVG: [1, 'Average over the BOM children'],
  };
  const charts = useMemo(() => machineFields.filter((f) => f.dataType === 'table'), [machineFields]);
  // The LOOKUP call the caret is in, if any — only machine formulas have charts to read.
  const call = useMemo(() => (timingOnly ? lookupAt(value, Math.min(caretAt, value.length)) : null), [timingOnly, value, caretAt]);
  const chartOf = useMemo(() => charts.find((c) => c.code === chartCodeOf(call?.args[0]?.text)) ?? null, [charts, call]);
  /** The piece field that feeds each key of a chart, guessed from the key column's name and unit. */
  const guessKeys = (chart: BuilderField) => axesOf(chart).map((a) => guessAxisField(a, itemFields));
  const shortCharts = useMemo(() => (timingOnly ? boundCharts(charts) : []), [timingOnly, charts]);
  // A chart is written machine.NAME (a bare NAME is read the same): both are known names.
  const shortNames = useMemo(() => new Set(shortCharts.flatMap((c) => [c.code, `machine.${c.code}`])), [shortCharts]);
  const suggestCtx = useMemo(() => {
    const num = (fs: BuilderField[]) => fs.filter((f) => f.dataType === 'number');
    const readable = [...itemFields.filter(isReadable), ...LEVEL_FIELDS];
    const lookup = call?.direct && call.open != null
      ? { arg: call.arg, charts, keyFirst: chartOf ? guessKeys(chartOf)[Math.max(0, call.arg - 1)]?.code ?? null : null }
      : null;
    return {
      lookup,
      shortCharts,
      fields: timingOnly ? { item: readable, machine: num(machineFields) } : { item: readable, machine: num(machineFields), plain: num(plainFields), children: num(plainFields) },
      functions: Object.entries(FN_HINTS).filter(([n]) => !timingOnly || !['SUM', 'COUNT', 'AVG'].includes(n)).map(([name, [args, hint]]) => ({ name, args, hint })),
    };
    // FN_HINTS is a constant table, and guessKeys only reads itemFields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemFields, machineFields, plainFields, timingOnly, call, charts, chartOf, shortCharts]);
  const suggest = useMemo(() => (focused && dismissedAt !== value ? suggestAt(value, Math.min(caretAt, value.length), suggestCtx) : null), [focused, dismissedAt, value, caretAt, suggestCtx]);
  const shown = suggest?.items ?? [];
  const activeIdx = Math.min(active, Math.max(0, shown.length - 1));

  // Put the list under the caret: a hidden copy of the text up to the caret ends in a marker.
  useLayoutEffect(() => {
    const mk = mirrorMark.current, a = area.current;
    if (!suggest || !mk || !a) return;
    const next = { left: Math.min(mk.offsetLeft, Math.max(12, a.clientWidth - 320)), top: mk.offsetTop - a.scrollTop + 26 };
    setListPos((cur) => (cur.left === next.left && cur.top === next.top ? cur : next));
  }, [suggest, value, caretAt]);

  const accept = (sg: Suggestion) => {
    if (!suggest) return;
    const next = value.slice(0, suggest.from) + sg.insert + value.slice(suggest.to);
    const pos = suggest.from + sg.insert.length - sg.caretBack;
    onChange(next);
    caret.current = { start: pos, end: pos };
    setCaretAt(pos);
    setActive(0);
    requestAnimationFrame(() => { const a = area.current; if (a) { a.focus(); a.setSelectionRange(pos, pos); } });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!shown.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((activeIdx + 1) % shown.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((activeIdx - 1 + shown.length) % shown.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(shown[activeIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissedAt(value); }
  };
  const insert = (text: string, caretBack = 0) => {
    const { start, end } = caret.current;
    const s = Math.min(start, value.length);
    const e = Math.min(end, value.length);
    const next = insertAt(value, s, e, text);
    onChange(next.value);
    const pos = next.caret - caretBack;
    caret.current = { start: pos, end: pos };
    setCaretAt(pos);
    requestAnimationFrame(() => { const a = area.current; if (a) { a.focus(); a.setSelectionRange(pos, pos); } });
  };
  /** A function wraps the selection, or leaves the caret between its brackets. */
  const insertFunction = (name: string, args = 1) => {
    const { start, end } = caret.current;
    const selected = value.slice(start, end);
    const commas = ', '.repeat(Math.max(0, args - 1));
    if (selected) insert(`${name}(${selected}${commas})`);
    else insert(`${name}(${commas})`, commas.length + 1);
  };

  /**
   * A chart clicked in the hint: the whole LOOKUP call is written (or completed) as
   * LOOKUP(machine.CHART, item.KEY), the key guessed from the chart's key column, and
   * the key is left selected so typing replaces it.
   */
  const pickChart = (chart: BuilderField) => {
    if (!call) return;
    const keys = guessKeys(chart).map((k) => (k ? `item.${k.code}` : ''));
    const head = `LOOKUP(machine.${chart.code}, `;
    const next = value.slice(0, call.start) + head + keys.join(', ') + ')' + value.slice(call.end);
    const from = call.start + head.length;
    const to = from + keys[0].length;
    onChange(next);
    caret.current = { start: from, end: to };
    setCaretAt(from);
    setActive(0);
    requestAnimationFrame(() => { const a = area.current; if (a) { a.focus(); a.setSelectionRange(from, to); } });
  };

  const OPS: [string, string, string][] = [['+', ' + ', 'Plus'], ['−', ' - ', 'Minus'], ['×', ' * ', 'Times'], ['÷', ' / ', 'Divided by'], ['(', '(', 'Open bracket'], [')', ')', 'Close bracket']];
  const FNS: [string, number, string][] = [['MIN', 2, 'The smaller of two values'], ['MAX', 2, 'The larger of two values'], ['ROUND', 2, 'ROUND(x, decimals)'], ['IF', 3, 'IF(condition, then, otherwise) — e.g. IF(item.THICKNESS > 20, 2, 1)']];

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Autocomplete<PickOption>
        size="small"
        options={options}
        groupBy={(o) => o.group}
        value={null}
        blurOnSelect
        clearOnBlur
        getOptionLabel={(o) => `${o.field.name} ${o.field.code}`}
        isOptionEqualToValue={(a, b) => a.role === b.role && a.field.code === b.field.code}
        filterOptions={(opts, s) => {
          const q = s.inputValue.trim().toLowerCase();
          return q ? opts.filter((o) => o.field.name.toLowerCase().includes(q) || o.field.code.toLowerCase().includes(q)) : opts;
        }}
        onOpen={remember}
        onChange={(_, o) => { if (o) insert(refText(o.role, o.field.code)); }}
        renderOption={({ key, ...props }, o) => (
          <Box component="li" key={key} {...props} sx={{ display: 'flex !important', gap: 1, alignItems: 'baseline' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontWeight: 500 }}>{o.field.name}</Box>
              <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-3)' }}>{refText(o.role, o.field.code)}</Box>
            </Box>
            {isWord(o.field) && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{o.field.hint ?? 'word'}</Box>}
            {o.field.unit && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{unitText(o.field.unit)}</Box>}
            {o.field.example != null && <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }} title={o.field.exampleFrom ? `on ${o.field.exampleFrom}` : undefined}>e.g. {numberText(o.field.example)}</Box>}
          </Box>
        )}
        noOptionsText="No field matches"
        renderInput={(p) => <TextField {...p} label="Insert a field" placeholder="Search by name or code — cut length, THICKNESS…" inputProps={{ ...p.inputProps, 'data-testid': 'field-picker' }} />}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }} role="toolbar" aria-label="Operators and functions">
        {OPS.map(([labelText, text, title]) => (
          <Tooltip key={labelText} title={title}><Button size="small" variant="outlined" aria-label={title} onMouseDown={(e) => { e.preventDefault(); remember(); }} onClick={() => insert(text.trim() === text ? text : text.trim())} sx={{ minWidth: 40, fontFamily: 'var(--font-mono)', fontSize: 16, px: 1 }}>{labelText}</Button></Tooltip>
        ))}
        <Box sx={{ width: 8 }} />
        {FNS.map(([fn, args, title]) => (
          <Tooltip key={fn} title={title}><Button size="small" variant="outlined" onMouseDown={(e) => { e.preventDefault(); remember(); }} onClick={() => insertFunction(fn, args)} sx={{ minWidth: 48, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fn}</Button></Tooltip>
        ))}
        <Tooltip title="Read a rate from the machine's chart — e.g. cutting speed by thickness. Shows the charts to pick from.">
          <Button size="small" variant="outlined" startIcon={<TableChartRounded />} data-testid="lookup-button"
            onMouseDown={(e) => { e.preventDefault(); remember(); }} onClick={() => insert('LOOKUP()', 1)} sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>LOOKUP</Button>
        </Tooltip>
      </Box>
      <Box sx={{ position: 'relative', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', '&:focus-within': { borderColor: 'var(--c-primary-500)', boxShadow: '0 0 0 1px var(--c-primary-500)' } }}>
        <Typography component="label" htmlFor="formula-text" sx={{ position: 'absolute', top: -9, left: 8, px: 0.5, fontSize: 12, color: 'var(--c-text-2)', background: 'var(--c-surface)', lineHeight: '16px' }}>{label}</Typography>
        <Box ref={under} aria-hidden sx={{ ...editorFont, minHeight, maxHeight: Math.max(220, minHeight), overflow: 'hidden', color: 'var(--c-text)', m: 0 }}>
          <Highlight value={value} idx={idx} shortNames={shortNames} />
        </Box>
        <Box component="textarea" id="formula-text" ref={area} value={value} spellCheck={false} autoFocus={autoFocus} data-testid="formula-text"
          aria-label={`${label} — type it, or insert fields and functions above`}
          role="combobox" aria-autocomplete="list" aria-expanded={shown.length > 0} aria-controls="formula-suggest"
          aria-activedescendant={shown.length ? `formula-suggest-${activeIdx}` : undefined}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { onChange(e.target.value); caret.current = { start: e.target.selectionStart ?? 0, end: e.target.selectionEnd ?? 0 }; setCaretAt(e.target.selectionStart ?? 0); setActive(0); }}
          onSelect={remember} onKeyUp={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (!['ArrowUp', 'ArrowDown'].includes(e.key) || !shown.length) remember(); }} onClick={remember}
          onKeyDown={onKeyDown} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onScroll={(e: React.UIEvent<HTMLTextAreaElement>) => { if (under.current) under.current.scrollTop = e.currentTarget.scrollTop; }}
          sx={{
            ...editorFont, position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 0, outline: 'none', m: 0,
            background: 'transparent', color: 'transparent', caretColor: 'var(--c-text)', overflow: 'auto', boxSizing: 'border-box',
            '&::selection': { background: 'var(--c-primary-100)', color: 'transparent' },
          }} />
        {/* The same text up to the caret, invisible, so the list can sit under the caret. */}
        <Box aria-hidden sx={{ ...editorFont, position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden' }}>
          {value.slice(0, Math.min(caretAt, value.length))}<span ref={mirrorMark}>{'​'}</span>
        </Box>
        {shown.length > 0 && (
          <Box id="formula-suggest" role="listbox" aria-label="Suggestions" data-testid="formula-suggest"
            sx={{ position: 'absolute', left: listPos.left, top: listPos.top, zIndex: 10, width: 320, maxWidth: 'calc(100% - 16px)', py: 0.5,
              background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--e-3, 0 6px 16px rgba(0,0,0,.18))' }}>
            {shown.map((sg, i) => (
              <Box key={`${sg.kind}:${sg.insert}`} id={`formula-suggest-${i}`} role="option" aria-selected={i === activeIdx}
                onMouseDown={(e) => { e.preventDefault(); accept(sg); }} onMouseEnter={() => setActive(i)}
                sx={{ display: 'flex', gap: 1, alignItems: 'baseline', px: 1.25, py: 0.5, cursor: 'pointer', background: i === activeIdx ? 'var(--c-primary-50)' : 'transparent' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: sg.kind === 'field' ? undefined : 'var(--font-mono)' }}>{sg.label}</Box>
                  <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)', fontFamily: sg.kind === 'field' ? 'var(--font-mono)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sg.detail}</Box>
                </Box>
                {sg.field?.unit && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{unitText(sg.field.unit)}</Box>}
                {sg.field?.example != null && <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>e.g. {numberText(sg.field.example)}</Box>}
              </Box>
            ))}
            <Box sx={{ px: 1.25, pt: 0.5, fontSize: 11, color: 'var(--c-text-3)', borderTop: '1px solid var(--c-border)', mt: 0.5 }}>↑↓ to move · Enter or Tab to insert · Esc to close</Box>
          </Box>
        )}
      </Box>
      {call && <LookupHint call={call} charts={charts} chart={chartOf} itemFields={itemFields} onPick={pickChart} />}
    </Box>
  );
}


const mono = { fontFamily: 'var(--font-mono)' } as const;
const axesOf = (chart: BuilderField) => (chart.tableConfig?.axes?.length ? chart.tableConfig.axes : [{ label: 'Key', unit: null as string | null }]);
const axisText = (a: { label?: string; unit?: string | null }) => `${a.label ?? 'Key'}${a.unit ? ` (${a.unit})` : ''}`;

/**
 * Shown under the editor while the caret is in a LOOKUP( … ) call: what LOOKUP does,
 * the machine's charts to click, and which piece field was guessed to look the chart up by.
 */
function LookupHint({ call, charts, chart, itemFields, onPick }: {
  call: LookupCall; charts: BuilderField[]; chart: BuilderField | null; itemFields: BuilderField[]; onPick: (c: BuilderField) => void;
}) {
  return (
    <Box data-testid="lookup-hint" role="note" sx={{ p: 1.5, display: 'grid', gap: 1, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-testid="lookup-explain">
        <Box component="span" sx={{ ...mono, fontWeight: 600, color: 'var(--c-text)' }}>LOOKUP(chart, value)</Box> — reads a rate from a machine's chart.{' '}
        <b>chart:</b> one of the machine's charts below; <b>value:</b> the piece's value to look it up by.
      </Typography>
      {!charts.length ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-warning-800)' }} data-testid="lookup-nocharts">
          This machine type has no charts yet — add a table specification such as CUT_SPEED by thickness to it.
        </Typography>
      ) : (
        <Box role="listbox" aria-label="Machine charts" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {charts.map((c) => (
            <Box key={c.code} component="button" type="button" role="option" aria-selected={chart?.code === c.code} data-testid={`chart-${c.code}`}
              onMouseDown={(e: React.MouseEvent) => e.preventDefault()} onClick={() => onPick(c)}
              sx={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', px: 1.25, py: 0.75, borderRadius: 'var(--r-sm)', border: '1px solid',
                borderColor: chart?.code === c.code ? 'var(--c-primary-500)' : 'var(--c-border)', background: chart?.code === c.code ? 'var(--c-primary-50)' : 'var(--c-surface)' }}>
              <Box sx={{ fontSize: 13, fontWeight: 500 }}>{c.name}{c.unit ? <Box component="span" sx={{ color: 'var(--c-text-2)', fontWeight: 400 }}> · {unitText(c.unit)}</Box> : null}</Box>
              <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                <Box component="span" sx={mono}>machine.{c.code}</Box> · by {axesOf(c).map(axisText).join(' and ')}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {charts.length > 0 && !chart && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Click a chart to fill in the call — the piece's value is picked for you, and you can change it.</Typography>}
      {chart && (
        <Box sx={{ display: 'grid', gap: 0.25 }} data-testid="lookup-guess">
          {axesOf(chart).map((a, i) => {
            const guess = guessAxisField(a, itemFields);
            const actual = call.args[i + 1]?.text ?? '';
            return (
              <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {chart.name} is read by <b>{axisText(a)}</b>:{' '}
                {actual && (!guess || actual !== `item.${guess.code}`) ? (
                  <><Box component="span" sx={mono}>{actual}</Box>{guess ? <> (we would have guessed <Box component="span" sx={mono}>item.{guess.code}</Box>)</> : null}</>
                ) : guess ? (
                  <>guessed the piece's {guess.name} (<Box component="span" sx={mono}>item.{guess.code}</Box>) — change it in the formula if another field fits.</>
                ) : (
                  <>no piece field matches that name — type or pick one.</>
                )}
              </Typography>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
