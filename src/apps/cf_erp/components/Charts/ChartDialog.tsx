import { useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { cfApi, CfApiError } from '../../api/client';
import { addChart, updateChart, type Chart, type ChartLevel, type ChartRow, type ChartSubject } from '../../api/charts';
import type { Specification } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import {
  LEVEL_LABEL, canLinear, chartRows, effectiveMode, formHeadingLine, formProblems, inputAxis, inputFromAxis, inputHeading, inputsPayload,
  moved, shortNameGuess, withUnit, type ChartForm, type InputForm,
} from '../../lib/charts';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice, Mono } from '../ui';
import { ChartRowsDialog } from './ChartRowsDialog';

/** What the "Add input" search offers: a tree level or a specification. */
type Offer = { id: string; group: string; label: string; hint: string; input: InputForm };

const LEVELS: ChartLevel[] = ['FAMILY', 'SUBFAMILY', 'VARIANT'];
const TYPE_WORD: Record<string, string> = { number: 'number', option: 'pick-list', text: 'text' };

/**
 * Add a chart to a machine type / machine, or change one. A chart is a table of
 * rows: any number of inputs (a specification of the piece, or Family / Subfamily /
 * Variant of the tree) and one result. Here: the result's name and unit, the
 * inputs in order, and how a number between two rows is read. Rows are optional at
 * creation: they are typed or pasted in the rows editor.
 */
export function ChartDialog({ open, onClose, subject, existing, onSaved }: {
  open: boolean;
  onClose: () => void;
  subject: ChartSubject;
  /** Given: the dialog changes this chart instead of adding one. */
  existing?: Chart | null;
  onSaved: (charts: Chart[] | null) => void;
}) {
  const specs = useLoad(() => (open ? cfApi.get<Specification[]>('/specifications') : Promise.resolve(null)), [open]);
  const offers = useMemo<Offer[]>(() => {
    const lv = LEVELS.map<Offer>((l) => ({ id: `level:${l}`, group: 'Tree level', label: LEVEL_LABEL[l], hint: 'classification', input: { kind: 'level', level: l } }));
    const sp = (specs.data ?? [])
      .filter((s) => (s.dataType === 'number' || s.dataType === 'option' || s.dataType === 'text') && s.status !== 'inactive')
      .map<Offer>((s) => ({
        id: `spec:${s.code}`, group: 'Specification of the piece', label: s.name,
        hint: [TYPE_WORD[s.dataType], s.defaultUom].filter(Boolean).join(' · '),
        input: { kind: 'spec', code: s.code, name: s.name, dataType: s.dataType as 'number' | 'option' | 'text', specUnit: s.defaultUom ?? '', unit: '' },
      }));
    return [...lv, ...sp];
  }, [specs.data]);

  const [form, setForm] = useState<ChartForm>(() => (existing
    ? { name: existing.name, resultUnit: existing.resultUnit ?? '', mode: existing.mode, inputs: existing.axes.map(inputFromAxis) }
    : { name: '', resultUnit: '', mode: 'step_up', inputs: [] }));
  const [rows, setRows] = useState<ChartRow[] | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  /** The columns cannot change once there are rows. */
  const locked = !!existing && !!chartRows(existing)?.length;
  const problems = formProblems(form);
  const setInputs = (f: (list: InputForm[]) => InputForm[]) => {
    setForm((cur) => ({ ...cur, inputs: f(cur.inputs) }));
    setRows(null); // the typed rows were shaped for the old columns
  };
  const setInput = (i: number, patch: Partial<Extract<InputForm, { kind: 'spec' }>>) =>
    setForm((cur) => ({ ...cur, inputs: cur.inputs.map((c, j) => (j === i && c.kind === 'spec' ? { ...c, ...patch } : c)) }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const mode = effectiveMode(form);
      if (existing) {
        await updateChart(existing.specId, {
          name: form.name.trim(), resultUnit: form.resultUnit.trim(), mode,
          ...(locked ? {} : { inputs: inputsPayload(form) }),
        });
        onSaved(null);
      } else {
        const out = await addChart(subject, { name: form.name.trim(), resultUnit: form.resultUnit.trim(), inputs: inputsPayload(form), mode, ...(rows ? { rows } : {}) });
        onSaved(out.charts);
      }
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    }
  };

  const axes = form.inputs.map(inputAxis);
  const resultLabel = withUnit(form.name.trim() || 'Result', form.resultUnit);
  const formulaName = existing?.shortForm ?? (form.name.trim() ? shortNameGuess(form.name) : null);
  const usable = form.inputs.length > 0 && problems.length === 0;

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={existing ? `Change chart — ${existing.name}` : 'Add a chart'} busy={busy} onClose={onClose}
        subtitle="A table of rows: some inputs (values of the piece, or its family) and one result." />
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, pt: 0.5 }}>
          <ErrorNotice error={error} />
          <ErrorNotice error={specs.error} onRetry={specs.reload} />
          {existing && existing.definedAt && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              Set up on {existing.definedAt.name}. A change here changes the chart everywhere it is used.
            </Typography>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 2fr) minmax(0, 1fr)' }, gap: 2 }}>
            <TextField label="Result name" size="small" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              helperText="What the chart gives, e.g. Drill time" inputProps={{ maxLength: 120 }} />
            <TextField label="Result unit" size="small" required value={form.resultUnit} onChange={(e) => setForm((f) => ({ ...f, resultUnit: e.target.value }))}
              helperText="e.g. s, min/m, mm/min" inputProps={{ maxLength: 20 }} />
          </Box>

          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1 }}>Inputs <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-3)' }}>— read in this order</Box></Typography>
            {locked && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1 }}>
                This chart has rows, so its inputs can no longer change. Clear the rows first, or add a new chart.
              </Typography>
            )}
            <Box sx={{ display: 'grid', gap: 1 }}>
              {form.inputs.map((c, i) => (
                <Box key={i} data-testid={`chart-input-${i}`} sx={{ display: 'grid', gap: 1, p: 1, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', width: 16 }}>{i + 1}</Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ fontWeight: 500, fontSize: 13.5 }}>{c.kind === 'level' ? LEVEL_LABEL[c.level] : c.name}</Box>
                      <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                        {c.kind === 'level' ? 'A level of the tree' : <>{TYPE_WORD[c.dataType]}{c.dataType === 'number' && c.specUnit ? ` · ${c.specUnit}` : ''} · <Mono muted>{c.code}</Mono></>}
                      </Box>
                    </Box>
                    <Tooltip title="Move up"><span><IconButton size="small" aria-label="Move up" disabled={locked || i === 0} onClick={() => setInputs((l) => moved(l, i, -1))}><ArrowUpwardRounded fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Move down"><span><IconButton size="small" aria-label="Move down" disabled={locked || i === form.inputs.length - 1} onClick={() => setInputs((l) => moved(l, i, 1))}><ArrowDownwardRounded fontSize="small" /></IconButton></span></Tooltip>
                    <Tooltip title="Remove input"><span><IconButton size="small" aria-label="Remove input" disabled={locked} onClick={() => setInputs((l) => l.filter((_, j) => j !== i))}><CloseRounded fontSize="small" /></IconButton></span></Tooltip>
                  </Box>
                  {c.kind === 'spec' && c.dataType === 'number' && !c.specUnit && (
                    <TextField size="small" label={`Unit of ${c.name} (optional)`} value={c.unit} disabled={locked} onChange={(e) => setInput(i, { unit: e.target.value })}
                      helperText="This value has no unit. Leave it empty for a count (coats, holes, studs); otherwise say which unit the rows are in." inputProps={{ maxLength: 20 }} />
                  )}
                </Box>
              ))}
              {!form.inputs.length && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>No inputs yet.</Typography>}
            </Box>
            {!locked && (
              <Autocomplete<Offer> size="small" sx={{ mt: 1 }} options={offers} groupBy={(o) => o.group} value={null} blurOnSelect clearOnBlur
                loading={specs.loading} getOptionLabel={(o) => o.label}
                getOptionDisabled={(o) => form.inputs.some((c) => (c.kind === 'level' ? `level:${c.level}` : `spec:${c.code}`) === o.id)}
                filterOptions={(opts, st) => {
                  const q = st.inputValue.trim().toLowerCase();
                  return q ? opts.filter((o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)) : opts;
                }}
                onChange={(_, o) => { if (o) setInputs((l) => [...l, o.input]); }}
                renderOption={({ key, ...props }, o) => (
                  <Box component="li" key={key} {...props} sx={{ display: 'flex !important', gap: 1, alignItems: 'baseline' }}>
                    <Box sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{o.label}</Box>
                    {o.hint && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{o.hint}</Box>}
                  </Box>
                )}
                renderInput={(p) => (
                  <TextField {...p} label="Add input" placeholder="Search a specification, or Family / Subfamily / Variant"
                    InputProps={{ ...p.InputProps, startAdornment: <AddRounded fontSize="small" sx={{ ml: 0.5, color: 'var(--c-text-3)' }} /> }} />
                )} />
            )}
          </Box>

          <TextField select size="small" label="Between rows" value={effectiveMode(form)} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as ChartForm['mode'] }))}
            helperText={canLinear(form) ? 'Straight line: every number input is read between its rows at once; words and tree levels pick the group.' : 'A straight line needs at least one number input.'}>
            <MenuItem value="step_up">Step up — a value between two rows takes the next row’s result</MenuItem>
            <MenuItem value="linear" disabled={!canLinear(form)}>Straight line — a value between two rows is worked out between them</MenuItem>
          </TextField>

          {!existing && (
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Rows <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-3)' }}>(optional now)</Box></Typography>
              <Button variant="outlined" size="small" startIcon={<TableChartOutlined fontSize="small" />} onClick={() => setGridOpen(true)} disabled={!usable}
                sx={{ textTransform: 'none', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                {rows ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : 'Type rows or paste from Excel'}
              </Button>
            </Box>
          )}

          <Box sx={{ p: 1.5, borderRadius: 'var(--r-sm)', border: '1px dashed var(--c-border)' }} data-testid="chart-preview">
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>The headings will read</Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 13.5 }}>{formHeadingLine(form)}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
              In a time formula: {formulaName ? <Mono>{formulaName}</Mono> : 'its name, once it has one'}
            </Typography>
            {form.inputs.length > 1 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>
                {form.inputs.map((c, i) => <Chip key={i} size="small" label={inputHeading(c)} />)}
              </Box>
            )}
          </Box>

          {problems.length > 0 && (
            <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', display: 'grid', gap: 0.25 }}>
              {problems.map((p) => <span key={p}>{p}</span>)}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || problems.length > 0} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? 'Saving…' : existing ? 'Save chart' : 'Add chart'}
        </Button>
      </DialogActions>
      {gridOpen && (
        <ChartRowsDialog open onClose={() => setGridOpen(false)} title={form.name.trim() || 'New chart'} axes={axes} resultLabel={resultLabel}
          rows={rows} canClear={false} onSave={(r) => setRows(r && r.length ? r : null)} />
      )}
    </Dialog>
  );
}
