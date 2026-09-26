import { useMemo, useState } from 'react';
import { Box, Button, ButtonBase, Chip, Divider, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import type { CodegenEntity, CodegenValue, Segment, Specification } from '../../api/types';
import { CapsLabel, Mono } from '../ui';
import { DATE_PRESETS, SEQUENCE_DIGITS, SEQ_SCOPE_WORDS, dateExample, digitsLabel, paletteEntries, specPattern, type PaletteEntry } from './guide';

const QUICK_TEXT: { text: string; label: string }[] = [
  { text: '-', label: '-' }, { text: '/', label: '/' }, { text: '.', label: '.' }, { text: ' ', label: 'space' },
];

/** What a token holds on the chosen record — or, with no record chosen, its example. */
export function ValueOnRecord({ value, example, hasSample, pending }: { value?: CodegenValue; example?: string | null; hasSample: boolean; pending: boolean }) {
  const muted = { fontSize: 12, color: 'var(--c-text-3)' };
  if (!hasSample) return example ? <Typography sx={muted}>e.g. <Mono muted>{example}</Mono></Typography> : null;
  if (!value) return pending ? <Typography sx={muted}>…</Typography> : null;
  if (value.state === 'blank') return <Typography sx={muted}>prints nothing, on purpose</Typography>;
  if (value.state === 'missing') return <Typography sx={muted}>no value on this record</Typography>;
  return <Mono sx={{ fontSize: 12, color: 'var(--c-text)', wordBreak: 'break-all' }}>{value.text}</Mono>;
}

function PaletteRow({ entry, value, hasSample, pending, onAdd }: { entry: PaletteEntry; value?: CodegenValue; hasSample: boolean; pending: boolean; onAdd: () => void }) {
  return (
    <ButtonBase onClick={onAdd} disabled={entry.disabled} aria-label={`Add ${entry.phrase}`}
      sx={{
        width: '100%', textAlign: 'left', display: 'grid', alignItems: 'start', gap: 1, px: 1, py: 0.75, borderRadius: 'var(--r-sm)',
        gridTemplateColumns: { xs: '20px minmax(0, 1fr)', sm: '20px minmax(0, 1fr) minmax(0, 38%)' },
        '&:hover, &.Mui-focusVisible': { background: 'var(--c-surface-2)' }, '&.Mui-disabled': { opacity: 0.5 },
      }}>
      <AddRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-primary-600)', mt: '1px' }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)' }}>{entry.title}</Typography>
        {entry.help && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.45 }}>{entry.help}</Typography>}
        {entry.note && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.25 }}>{entry.note}</Typography>}
      </Box>
      <Box sx={{ minWidth: 0, gridColumn: { xs: '2', sm: 'auto' }, textAlign: { xs: 'left', sm: 'right' } }}>
        <ValueOnRecord value={value} example={entry.example} hasSample={hasSample} pending={pending} />
      </Box>
    </ButtonBase>
  );
}

/**
 * "Add a piece": every value the entity can print, each saying what it means
 * (the provider's own words) and what it holds on the chosen record; then fixed
 * text, a running number and a date. A click adds the piece at the end.
 */
export function TokenPalette({ entity, specs, values, hasSample, pending, hasSequence, onAdd }: {
  entity: CodegenEntity | undefined; specs: Specification[]; values: Record<string, CodegenValue> | null; hasSample: boolean; pending: boolean; hasSequence: boolean;
  onAdd: (segment: Segment) => void;
}) {
  const [find, setFind] = useState('');
  const [text, setText] = useState('');
  const [digits, setDigits] = useState('000');
  const entries = useMemo(() => paletteEntries(entity, specs), [entity, specs]);
  const q = find.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.search.includes(q)) : entries;
  const own = shown.filter((e) => e.group === 'record');
  const fromSpecs = shown.filter((e) => e.group === 'spec');
  const pattern = specPattern(entity);
  const addToken = (key: string) => onAdd({ segmentType: 'token', tokenKey: key, transform: 'none', format: null, maxLength: null, isRequired: true });
  const addText = (t: string) => { if (t) onAdd({ segmentType: 'literal', literalText: t }); };

  return (
    <Box sx={{ display: 'grid', gap: 1.5, minWidth: 0 }}>
      <Box>
        <Typography sx={{ fontWeight: 500 }}>Add a piece</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          Click a piece to add it to the end of the pattern. {hasSample ? 'Each piece shows what it holds on the chosen record.' : 'Choose a record above to see its values.'}
        </Typography>
      </Box>

      <TextField size="small" placeholder="Find a value" value={find} onChange={(e) => setFind(e.target.value)}
        slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }, htmlInput: { 'aria-label': 'Find a value' } }} />

      <Box sx={{ maxHeight: 380, overflowY: 'auto', mx: -1, px: 0.5 }}>
        {own.length > 0 && <Box sx={{ px: 1, pt: 0.5 }}><CapsLabel>From the record</CapsLabel></Box>}
        {own.map((e) => <PaletteRow key={e.key} entry={e} value={values?.[e.key]} hasSample={hasSample} pending={pending} onAdd={() => addToken(e.key)} />)}
        {fromSpecs.length > 0 && (
          <Box sx={{ px: 1, pt: 1.5 }}>
            <CapsLabel>Specifications</CapsLabel>
            {pattern?.help && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.25 }}>{pattern.help}</Typography>}
          </Box>
        )}
        {fromSpecs.map((e) => <PaletteRow key={e.key} entry={e} value={values?.[e.key]} hasSample={hasSample} pending={pending} onAdd={() => addToken(e.key)} />)}
        {!shown.length && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', p: 1 }}>{entity ? `Nothing matches “${find}”.` : 'Choose what the rule codes first.'}</Typography>}
      </Box>

      <Divider />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Fixed text</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.75 }}>Printed exactly as typed — a dash between parts, or letters such as PL.</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {QUICK_TEXT.map((c) => (
            <Chip key={c.label} label={c.label} size="small" variant="outlined" icon={<AddRounded />} onClick={() => addText(c.text)}
              aria-label={`Add ${c.label === 'space' ? 'a space' : `“${c.text}”`}`} sx={{ fontFamily: c.label === 'space' ? undefined : 'var(--font-mono)' }} />
          ))}
          <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); addText(text); setText(''); }}
            sx={{ display: 'flex', gap: 1, alignItems: 'center', flex: '1 1 180px', minWidth: 0 }}>
            <TextField size="small" placeholder="e.g. PL-" value={text} onChange={(e) => setText(e.target.value)} sx={{ flex: 1, minWidth: 0 }}
              slotProps={{ htmlInput: { 'aria-label': 'Fixed text to add', style: { fontFamily: 'var(--font-mono)' } } }} />
            <Button type="submit" size="small" disabled={!text}>Add</Button>
          </Box>
        </Box>
      </Box>

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Running number</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.75 }}>
          Counts 1, 2, 3 and never hands a number out twice. {SEQ_SCOPE_WORDS.prefix} You can make it one count for the whole rule instead.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField select size="small" label="Digits" value={digits} onChange={(e) => setDigits(e.target.value)} sx={{ minWidth: 170 }}>
            {SEQUENCE_DIGITS.map((d) => <MenuItem key={d} value={d}>{digitsLabel(d)}</MenuItem>)}
          </TextField>
          <Button size="small" startIcon={<AddRounded />} disabled={hasSequence} onClick={() => onAdd({ segmentType: 'sequence', format: digits })}>Add running number</Button>
        </Box>
        {hasSequence && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>The pattern already has one — a pattern holds one running number at most.</Typography>}
      </Box>

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Date</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 0.75 }}>The date the code is made. YYYY is the year, YY its last two digits, MM the month, DD the day.</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {DATE_PRESETS.map((f) => (
            <Chip key={f} size="small" variant="outlined" icon={<AddRounded />} onClick={() => onAdd({ segmentType: 'date', format: f })}
              aria-label={`Add the date as ${f}`} label={<span><Mono>{f}</Mono> · {dateExample(f)}</span>} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
