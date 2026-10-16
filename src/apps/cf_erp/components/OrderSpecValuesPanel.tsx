import { useEffect, useState } from 'react';
import { Alert, Box, MenuItem, TextField, Typography } from '@mui/material';
import { getOrderSpecDefaults, setOrderSpecDefaults, type OrderSpec, type OrderSpecLine } from '../api/orderSpecDefaults';
import { CfApiError } from '../api/client';
import { lineShows, lockedNote, readSpecInput, usageText } from '../lib/orderSpecDefaults';
import { useLoad } from '../hooks/useLoad';
import { ErrorNotice, Mono, SectionCard } from './ui';
import { useToast } from './toastContext';

/**
 * ORDER VALUES (init.sql §65, 2026-10-16). User: "The various coats, MS BO or BR, all of these are also set
 * at an order or a line level typically and can be overridden in the values screen if required."
 *
 * One block per specification flagged "Can be set for a whole order" (Setup › Specifications): the whole
 * order's value, then each line's (empty = as the order). Every row with that specification takes it unless
 * the row has its own value on the Values screen, where the cell says "from order" / "from line". A locked
 * line keeps what it locked with. Saving works every open line out again at once.
 */

const fieldSx = { minWidth: 0, width: '100%', '& .MuiInputBase-root': { fontSize: 13 }, '& .MuiSelect-select': { py: '6px' } };

/** One value: a list for an option or yes/no, a text field (saved on Enter or leaving it) otherwise. */
function SpecField({ spec, input, placeholder, label, disabled, onCommit, testId }: {
  spec: OrderSpec; input: string; placeholder: string; label: string; disabled: boolean; onCommit: (text: string) => void; testId: string;
}) {
  const [text, setText] = useState(input);
  useEffect(() => { setText(input); }, [input]);
  if (spec.dataType === 'option' || spec.dataType === 'boolean') {
    const options = spec.dataType === 'option'
      ? (spec.options ?? []).map((o) => ({ value: String(o.id), label: o.label || o.value }))
      : [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
    return (
      <TextField select size="small" label={label} value={input} disabled={disabled} sx={fieldSx}
        inputProps={{ 'data-testid': testId }}
        SelectProps={{ displayEmpty: true, renderValue: (v) => (v === '' ? <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{placeholder}</Box> : options.find((o) => o.value === v)?.label ?? String(v)) }}
        InputLabelProps={{ shrink: true }}
        onChange={(e) => onCommit(String(e.target.value))}>
        <MenuItem value=""><em>{placeholder}</em></MenuItem>
        {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </TextField>
    );
  }
  const commit = () => { if (text.trim() !== input.trim()) onCommit(text); };
  return (
    <TextField size="small" label={label} value={text} disabled={disabled} placeholder={placeholder} sx={fieldSx}
      InputLabelProps={{ shrink: true }}
      inputProps={{ 'data-testid': testId, inputMode: spec.dataType === 'number' ? 'decimal' : undefined }}
      InputProps={spec.unit ? { endAdornment: <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)', pl: 0.5 }}>{spec.unit}</Box> } : undefined}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setText(input); }} />
  );
}

export function OrderSpecValuesPanel({ orderId, canEdit = true, onChanged }: { orderId: number; canEdit?: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const view = useLoad(() => getOrderSpecDefaults(orderId), [orderId]);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const v = view.data;
  const editable = canEdit && !!v?.editable && !busy;
  const rowLines = (v?.lines ?? []).filter((l) => l.lineType === 'custom');

  const save = async (line: OrderSpecLine | null, spec: OrderSpec, text: string) => {
    const read = readSpecInput(spec, text);
    if ('error' in read) { setProblems([read.error]); return; }
    setBusy(true); setProblems([]);
    try {
      const out = await setOrderSpecDefaults(orderId, line?.id ?? null, [{ specCode: spec.code, value: read.value }]);
      view.setData(out.view);
      toast.success(out.summary.sentence);
      if (out.summary.changed) onChanged?.();
    } catch (e) {
      const err = e as CfApiError;
      setProblems(err.problems?.length ? err.problems : [err.message]);
    } finally { setBusy(false); }
  };

  const note = v ? lockedNote(rowLines) : null;
  return (
    <SectionCard title="Order values"
      subtitle="Set once for the whole order or a line — coats, grade, impact class, material. Every row takes it unless the row has its own value on the Values screen.">
      <Box data-testid="order-spec-values" sx={{ display: 'grid', gap: 1.5 }}>
        <ErrorNotice error={view.error} onRetry={view.reload} />
        {v?.lock && <Alert severity="info">{v.lock}</Alert>}
        {note && <Alert severity="info" data-testid="order-values-locked">{note}</Alert>}
        {problems.length > 0 && <Alert severity="error" onClose={() => setProblems([])}>{problems.map((p) => <div key={p}>{p}</div>)}</Alert>}
        {v && !v.available && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Order values are not set up on this server yet.</Typography>}
        {v?.available && v.specs.length === 0 && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
            No specification can be set for a whole order yet. Turn on “Can be set for a whole order” for one in Setup › Specifications.
          </Typography>
        )}
        {v?.specs.map((spec) => {
          const orderValue = v.values[spec.code] ?? null;
          return (
            <Box key={spec.code} data-testid="order-spec-row" data-code={spec.code}
              sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '200px minmax(0, 1fr)' }, gap: 1.5, py: 1, borderTop: '1px solid var(--c-border)' }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{spec.name}</Box>
                <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{spec.code}{spec.unit ? ` · ${spec.unit}` : ''}</Mono>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))', gap: 1.25, minWidth: 0 }}>
                <Box sx={{ minWidth: 0 }}>
                  <SpecField spec={spec} label="Whole order" input={orderValue?.input ?? ''} placeholder="Not set" disabled={!editable}
                    testId={`order-value-${spec.code}`} onCommit={(t) => save(null, spec, t)} />
                </Box>
                {rowLines.map((line) => {
                  const shown = lineShows(line, v.values, spec.code);
                  const usage = usageText(line.usage?.[spec.code]);
                  return (
                    <Box key={line.id} sx={{ minWidth: 0 }}>
                      <SpecField spec={spec} label={`Line ${line.lineNo}`} input={line.values[spec.code]?.input ?? ''}
                        placeholder={shown.from === 'order' && shown.value ? `As the order (${shown.value.display})` : 'As the order'}
                        disabled={!editable || !!line.frozen} testId={`line-value-${line.lineNo}-${spec.code}`} onCommit={(t) => save(line, spec, t)} />
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.25, overflowWrap: 'anywhere' }}>
                        {line.frozen ? `Locked${shown.value ? ` · ${shown.value.display}` : ''}` : usage ?? 'No row of this line has it'}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })}
        {v?.available && v.specs.length > 0 && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
            A row's own value always wins, then the line's, then the order's. On the Values screen a cell that takes it is marked; emptying a row's own value gives it the order's again.
          </Typography>
        )}
      </Box>
    </SectionCard>
  );
}
