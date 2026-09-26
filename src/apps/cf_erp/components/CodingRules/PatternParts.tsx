import { useMemo, useState } from 'react';
import { Autocomplete, Box, Button, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import type { CodegenEntity, CodegenPart, Segment, Specification } from '../../api/types';
import { Mono } from '../ui';
import {
  LETTERS, NUMBER_FORMATS, SEQUENCE_DIGITS, SEQ_SCOPE_WORDS, dateExample, digitsLabel, numberFormatOption, paletteEntries, tokenPhrase,
  type PaletteEntry,
} from './guide';

const PART_WORDS: Record<CodegenPart['state'], string> = {
  value: '',
  blank: 'prints nothing here, on purpose',
  empty: 'empty here, so it is left out',
  missing: 'no value on this record — no code until it has one',
  unfinished: 'choose what to print',
  waiting: 'waits for the parts before it',
};

/** What one part prints: the chosen record's, from the engine; without a record, an example. */
function PartValue({ seg, part, hasSample, pending, example }: { seg: Segment; part?: CodegenPart; hasSample: boolean; pending: boolean; example: string | null }) {
  const muted = { fontSize: 12, color: 'var(--c-text-3)' };
  if (hasSample && part) {
    if (part.state === 'value') {
      return part.text ? <Mono sx={{ fontSize: 13, color: 'var(--c-text)', wordBreak: 'break-all' }}>{part.text}</Mono> : <Typography sx={muted}>(empty)</Typography>;
    }
    return <Typography sx={{ ...muted, color: part.state === 'missing' ? 'var(--c-warning-800)' : 'var(--c-text-3)' }}>{PART_WORDS[part.state]}</Typography>;
  }
  // Still being worked out — or the answer failed, which the rule check below says in words.
  if (hasSample) return pending ? <Typography sx={muted}>…</Typography> : null;
  if (seg.segmentType === 'literal') return seg.literalText ? <Mono sx={{ fontSize: 13 }}>{seg.literalText}</Mono> : null;
  if (seg.segmentType === 'date') return <Typography sx={muted}>e.g. <Mono muted>{dateExample(seg.format)}</Mono></Typography>;
  if (seg.segmentType === 'sequence') return <Typography sx={muted}>e.g. <Mono muted>{'1'.padStart(Math.max((seg.format ?? '').length, 1), '0')}</Mono></Typography>;
  return example ? <Typography sx={muted}>e.g. <Mono muted>{example}</Mono></Typography> : null;
}

function TokenOptions({ seg, onChange }: { seg: Segment; onChange: (patch: Partial<Segment>) => void }) {
  const [open, setOpen] = useState(false);
  const fmt = numberFormatOption(seg.format);
  const summary = [seg.format ? fmt.label.split(' — ')[0] : null, seg.transform && seg.transform !== 'none' ? LETTERS[seg.transform]?.label : null, seg.maxLength ? `max ${seg.maxLength} characters` : null]
    .filter(Boolean).join(' · ');
  const formats = NUMBER_FORMATS.some((o) => o.value === fmt.value) ? NUMBER_FORMATS : [...NUMBER_FORMATS, fmt];
  return (
    <Box>
      <Button size="small" startIcon={<TuneRounded />} onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ px: 0.5, minWidth: 0 }}>
        {open ? 'Hide options' : summary ? `Options: ${summary}` : 'Options'}
      </Button>
      {open && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr 0.8fr' }, gap: 1, mt: 1 }}>
          <TextField select size="small" label="Numbers print" value={fmt.value} onChange={(e) => onChange({ format: e.target.value || null })}
            helperText="Only numbers change; text prints as it is.">
            {formats.map((o) => <MenuItem key={o.value || 'none'} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Letters" value={seg.transform ?? 'none'} onChange={(e) => onChange({ transform: e.target.value as Segment['transform'] })}>
            {Object.entries(LETTERS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Max length" type="number" value={seg.maxLength ?? ''} helperText="Cuts longer text"
            onChange={(e) => onChange({ maxLength: e.target.value ? Number(e.target.value) : null })} />
        </Box>
      )}
    </Box>
  );
}

/**
 * The pattern, part by part: what each part is, what it prints on the chosen
 * record (worked out by the engine, one part at a time), and its options.
 */
export function PatternParts({ segments, onChange, entity, specs, parts, hasSample, pending, seqScope, onSeqScope }: {
  segments: Segment[]; onChange: (segments: Segment[]) => void; entity: CodegenEntity | undefined; specs: Specification[];
  parts: CodegenPart[] | null; hasSample: boolean; pending: boolean; seqScope: 'prefix' | 'scheme'; onSeqScope: (scope: 'prefix' | 'scheme') => void;
}) {
  const entries = useMemo(() => paletteEntries(entity, specs), [entity, specs]);
  const setSeg = (i: number, patch: Partial<Segment>) => onChange(segments.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...segments];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(segments.filter((_, j) => j !== i));

  if (!segments.length) {
    return <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', py: 2 }}>No parts yet. Add pieces from the list — a value from the record, fixed text, a running number or a date.</Typography>;
  }

  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}>
      {segments.map((s, i) => {
        const entry: PaletteEntry | undefined = s.segmentType === 'token' ? entries.find((e) => e.key === s.tokenKey) : undefined;
        // A token no longer offered (say, a specification switched off) still shows, by its key.
        const options = s.segmentType === 'token' && s.tokenKey && !entry
          ? [...entries, { key: s.tokenKey, title: tokenPhrase(s.tokenKey, entity, specs), phrase: s.tokenKey, help: null, example: null, note: null, disabled: false, group: 'record' as const, search: s.tokenKey }]
          : entries;
        return (
          <Box component="li" key={i} aria-label={`Part ${i + 1}`}
            sx={{ border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', p: 1.25, display: 'grid', gap: 0.75, background: 'var(--c-surface)' }}>
            {/* On a phone the control takes the whole first row; the value and the buttons share the second. */}
            <Box sx={{
              display: 'grid', gap: 1, alignItems: 'center',
              gridTemplateColumns: { xs: '24px minmax(0, 1fr) auto', md: '24px minmax(0, 1fr) minmax(0, 36%) auto' },
              '& > .part-control': { gridColumn: { xs: '2 / 4', md: 'auto' } },
            }}>
              <Box aria-hidden sx={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>{i + 1}</Box>

              {s.segmentType === 'token' && (
                <Autocomplete className="part-control" size="small" options={options} getOptionLabel={(o) => o.title} getOptionDisabled={(o) => o.disabled}
                  value={options.find((o) => o.key === s.tokenKey) ?? null} onChange={(_, o) => setSeg(i, { tokenKey: o?.key ?? null })}
                  isOptionEqualToValue={(a, b) => a.key === b.key}
                  renderOption={(props, o) => (
                    <li {...props} key={o.key}>
                      <Box sx={{ minWidth: 0 }}>
                        <Box sx={{ fontSize: 13 }}>{o.title}</Box>
                        {o.help && <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>{o.help}</Typography>}
                      </Box>
                    </li>
                  )}
                  renderInput={(p) => <TextField {...p} label="Value from the record" placeholder="Choose a value" />} />
              )}
              {s.segmentType === 'literal' && (
                <TextField className="part-control" size="small" label="Fixed text" placeholder="e.g. PL-" value={s.literalText ?? ''} onChange={(e) => setSeg(i, { literalText: e.target.value })}
                  slotProps={{ htmlInput: { style: { fontFamily: 'var(--font-mono)' } } }} />
              )}
              {s.segmentType === 'sequence' && (
                <TextField className="part-control" select size="small" label="Running number" value={s.format || '0'} onChange={(e) => setSeg(i, { format: e.target.value })}>
                  {(SEQUENCE_DIGITS.includes(s.format || '0') ? SEQUENCE_DIGITS : [...SEQUENCE_DIGITS, s.format || '0']).map((d) => <MenuItem key={d} value={d}>{digitsLabel(d)}</MenuItem>)}
                </TextField>
              )}
              {s.segmentType === 'date' && (
                <TextField className="part-control" size="small" label="Date" value={s.format ?? ''} onChange={(e) => setSeg(i, { format: e.target.value.toUpperCase() })}
                  helperText={`YYYY YY MM DD — today prints ${dateExample(s.format)}`} slotProps={{ htmlInput: { style: { fontFamily: 'var(--font-mono)' } } }} />
              )}

              <Box sx={{ minWidth: 0, gridColumn: { xs: '2', md: 'auto' }, gridRow: { xs: '2', md: 'auto' } }}>
                <PartValue seg={s} part={parts?.[i]} hasSample={hasSample} pending={pending} example={entry?.example ?? null} />
              </Box>

              <Box sx={{ display: 'flex', gridColumn: { xs: '3', md: 'auto' }, gridRow: { xs: '2', md: 'auto' } }}>
                <IconButton size="small" aria-label={`Move part ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`Move part ${i + 1} down`} disabled={i === segments.length - 1} onClick={() => move(i, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton>
                <IconButton size="small" aria-label={`Remove part ${i + 1}`} onClick={() => remove(i)}><DeleteOutlineRounded fontSize="small" /></IconButton>
              </Box>
            </Box>

            <Box sx={{ pl: { xs: 0, sm: 4 }, display: 'grid', gap: 0.5 }}>
              {s.segmentType === 'token' && entry?.help && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{entry.help}</Typography>}
              {s.segmentType === 'token' && <TokenOptions seg={s} onChange={(patch) => setSeg(i, patch)} />}
              {s.segmentType === 'sequence' && (
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  <TextField select size="small" label="It counts again" value={seqScope} onChange={(e) => onSeqScope(e.target.value as 'prefix' | 'scheme')} sx={{ maxWidth: 420 }}>
                    <MenuItem value="prefix">Whenever the text before it changes</MenuItem>
                    <MenuItem value="scheme">Never — one count for the whole rule</MenuItem>
                  </TextField>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{SEQ_SCOPE_WORDS[seqScope]} A number once handed out is never handed out again.</Typography>
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
