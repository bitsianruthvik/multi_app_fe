import { useMemo, useRef, useState } from 'react';
import { Autocomplete, Box, Button, MenuItem, Popover, TextField, Tooltip, Typography } from '@mui/material';
import TableChartRounded from '@mui/icons-material/TableChartRounded';
import {
  fieldFor, guessAxisField, insertAt, lookupText, numberText, tokenize, unitText,
  type BuilderField, type FieldIndex, type FieldRole, type Tok,
} from '../../lib/formulaBuilder';

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
  func: 'var(--c-warning-800)',
  op: 'var(--c-text-2)',
  paren: 'var(--c-text-3)',
  comma: 'var(--c-text-3)',
  bad: 'var(--c-danger-700)',
};

/** The coloured copy of the text that sits under the transparent textarea. */
function Highlight({ value, idx }: { value: string; idx: FieldIndex | null }) {
  const toks = tokenize(value);
  return (
    <>
      {toks.map((t) => {
        const known = !idx || t.kind === 'func' || !['item', 'machine', 'name'].includes(t.kind)
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
 * they are read, operators and functions as buttons, and a LOOKUP helper that
 * lists the machine's charts and their key columns.
 */
export function FormulaEditor({ value, onChange, idx, itemFields, machineFields, plainFields = [], timingOnly = true, autoFocus = false, label = 'Formula' }: {
  value: string;
  onChange: (v: string) => void;
  idx: FieldIndex | null;
  itemFields: BuilderField[];
  machineFields: BuilderField[];
  /** Setup › Formulas: plain codes for value formulas, and children.X for roll-ups. */
  plainFields?: BuilderField[];
  /** An operation time reads only item.X and machine.X. */
  timingOnly?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const area = useRef<HTMLTextAreaElement | null>(null);
  const under = useRef<HTMLDivElement | null>(null);
  const caret = useRef<{ start: number; end: number }>({ start: value.length, end: value.length });
  const [lookupAnchor, setLookupAnchor] = useState<HTMLElement | null>(null);

  const options = useMemo<PickOption[]>(() => {
    const out: PickOption[] = [];
    for (const f of itemFields) if (f.dataType === 'number') out.push({ role: 'item', field: f, group: GROUP.item });
    for (const f of machineFields) if (f.dataType === 'number') out.push({ role: 'machine', field: f, group: GROUP.machine });
    if (!timingOnly) {
      for (const f of plainFields) if (f.dataType === 'number') out.push({ role: 'plain', field: f, group: GROUP.plain });
      for (const f of plainFields) if (f.dataType === 'number') out.push({ role: 'children', field: f, group: GROUP.children });
    }
    return out;
  }, [itemFields, machineFields, plainFields, timingOnly]);

  const remember = () => { const a = area.current; if (a) caret.current = { start: a.selectionStart ?? value.length, end: a.selectionEnd ?? value.length }; };
  const insert = (text: string, caretBack = 0) => {
    const { start, end } = caret.current;
    const s = Math.min(start, value.length);
    const e = Math.min(end, value.length);
    const next = insertAt(value, s, e, text);
    onChange(next.value);
    const pos = next.caret - caretBack;
    caret.current = { start: pos, end: pos };
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
        <Tooltip title="Read a rate from the machine's chart — e.g. cutting speed by thickness">
          <Button size="small" variant="outlined" startIcon={<TableChartRounded />} data-testid="lookup-button"
            onMouseDown={(e) => { e.preventDefault(); remember(); }} onClick={(e) => setLookupAnchor(e.currentTarget)} sx={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>LOOKUP</Button>
        </Tooltip>
      </Box>
      <Box sx={{ position: 'relative', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', '&:focus-within': { borderColor: 'var(--c-primary-500)', boxShadow: '0 0 0 1px var(--c-primary-500)' } }}>
        <Typography component="label" htmlFor="formula-text" sx={{ position: 'absolute', top: -9, left: 8, px: 0.5, fontSize: 12, color: 'var(--c-text-2)', background: 'var(--c-surface)', lineHeight: '16px' }}>{label}</Typography>
        <Box ref={under} aria-hidden sx={{ ...editorFont, minHeight: 72, maxHeight: 220, overflow: 'hidden', color: 'var(--c-text)', m: 0 }}>
          <Highlight value={value} idx={idx} />
        </Box>
        <Box component="textarea" id="formula-text" ref={area} value={value} spellCheck={false} autoFocus={autoFocus} data-testid="formula-text"
          aria-label={`${label} — type it, or insert fields and functions above`}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { onChange(e.target.value); caret.current = { start: e.target.selectionStart ?? 0, end: e.target.selectionEnd ?? 0 }; }}
          onSelect={remember} onKeyUp={remember} onClick={remember}
          onScroll={(e: React.UIEvent<HTMLTextAreaElement>) => { if (under.current) under.current.scrollTop = e.currentTarget.scrollTop; }}
          sx={{
            ...editorFont, position: 'absolute', inset: 0, width: '100%', height: '100%', resize: 'none', border: 0, outline: 'none', m: 0,
            background: 'transparent', color: 'transparent', caretColor: 'var(--c-text)', overflow: 'auto', boxSizing: 'border-box',
            '&::selection': { background: 'var(--c-primary-100)', color: 'transparent' },
          }} />
      </Box>
      <LookupHelper anchor={lookupAnchor} onClose={() => setLookupAnchor(null)} machineFields={machineFields} itemFields={itemFields}
        onInsert={(text) => { setLookupAnchor(null); insert(text); }} />
    </Box>
  );
}

/**
 * Lists the machine's charts and their key columns, with the piece field that
 * feeds each key picked for you (Thickness → item.THICKNESS) and changeable.
 */
export function LookupHelper({ anchor, onClose, machineFields, itemFields, onInsert }: {
  anchor: HTMLElement | null; onClose: () => void; machineFields: BuilderField[]; itemFields: BuilderField[]; onInsert: (text: string) => void;
}) {
  const charts = machineFields.filter((f) => f.dataType === 'table');
  const [chosen, setChosen] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const chart = charts.find((c) => c.code === chosen) ?? charts[0] ?? null;
  const axes = chart?.tableConfig?.axes?.length ? chart.tableConfig.axes : [{ label: 'Key', unit: null }];
  const keyOf = (i: number) => keys[`${chart?.code}:${i}`] ?? guessAxisField(axes[i], itemFields)?.code ?? '';
  const nums = itemFields.filter((f) => f.dataType === 'number');
  const ready = !!chart && axes.every((_, i) => keyOf(i));
  return (
    <Popover open={!!anchor} anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { p: 2, width: 420, maxWidth: '95vw' }, 'data-testid': 'lookup-helper' } as object }}>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>Read a rate from a machine chart</Typography>
      {!charts.length ? (
        <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13 }}>
          No machine this rule covers has a chart yet. Add a table specification (e.g. CUT_SPEED by thickness) to the machine type, fill it on the machine, and it shows here.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 1.5, mt: 1 }}>
          <Box role="listbox" aria-label="Machine charts" sx={{ display: 'grid', gap: 0.5 }}>
            {charts.map((c) => (
              <Box key={c.code} role="option" aria-selected={chart?.code === c.code} tabIndex={0} data-testid={`chart-${c.code}`}
                onClick={() => setChosen(c.code)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setChosen(c.code); }}
                sx={{ p: 1, borderRadius: 'var(--r-sm)', cursor: 'pointer', border: '1px solid', borderColor: chart?.code === c.code ? 'var(--c-primary-500)' : 'var(--c-border)', background: chart?.code === c.code ? 'var(--c-primary-50)' : 'transparent' }}>
                <Box sx={{ fontWeight: 500 }}>{c.name}{c.unit ? <Box component="span" sx={{ color: 'var(--c-text-2)', fontWeight: 400 }}> · {c.unit}</Box> : null}</Box>
                <Box sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  <Box component="span" sx={{ fontFamily: 'var(--font-mono)' }}>machine.{c.code}</Box> by {(c.tableConfig?.axes ?? []).map((a) => `${a.label}${a.unit ? ` (${a.unit})` : ''}`).join(' and ') || 'one key'}
                  {c.count != null && <> · on {c.count} machine{c.count === 1 ? '' : 's'}</>}
                </Box>
              </Box>
            ))}
          </Box>
          {chart && axes.map((a, i) => (
            <TextField key={`${chart.code}:${i}`} select size="small" label={`Look up by ${a.label ?? `key ${i + 1}`}${a.unit ? ` (${a.unit})` : ''} — from the piece`}
              value={keyOf(i)} onChange={(e) => setKeys((k) => ({ ...k, [`${chart.code}:${i}`]: e.target.value }))}
              SelectProps={{ native: false }} inputProps={{ 'data-testid': `lookup-key-${i}` }}>
              {nums.map((f) => <MenuItem key={f.code} value={f.code}>{f.name} <Box component="span" sx={{ ml: 1, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>item.{f.code}{f.unit ? ` · ${f.unit}` : ''}</Box></MenuItem>)}
            </TextField>
          ))}
          {chart && (
            <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 13, p: 1, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }} data-testid="lookup-preview">
              {lookupText(chart.code, axes.map((_, i) => keyOf(i) || '?'))}
            </Box>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" disabled={!ready} data-testid="lookup-insert" onClick={() => chart && onInsert(lookupText(chart.code, axes.map((_, i) => keyOf(i))))}>Insert</Button>
          </Box>
        </Box>
      )}
    </Popover>
  );
}
