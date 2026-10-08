import { useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, MenuItem, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import { cfApi, CfApiError } from '../../api/client';
import { addChart, updateChart, type Chart, type ChartMode, type ChartSubject, type ChartValue } from '../../api/charts';
import type { Specification } from '../../api/types';
import { useLoad } from '../../hooks/useLoad';
import {
  axesInput, blankColumn, columnFromAxis, formHeadingLine, formProblems, formTableConfig, isBound, shortNameGuess,
  valueFromText, valueToText, withUnit, type ChartForm, type ColumnForm,
} from '../../lib/charts';
import { DialogHeader } from '../FormDialog';
import { ErrorNotice, Mono } from '../ui';
import { TableValueDialog } from '../TableValue/TableValueDialog';
import { summaryOf } from '../TableValue/tableValueModel';

const OTHER = '__other__';

/**
 * Add a chart to a machine type / machine, or change one: its name, what it
 * gives (with the unit), the one or two columns it is read by, and how a
 * value between two rows is read. Values are optional at creation: they are
 * typed or pasted in the same grid dialog every table value uses.
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
  const numberSpecs = useMemo(() => (specs.data ?? []).filter((s) => s.dataType === 'number' && s.status !== 'inactive'), [specs.data]);
  const [form, setForm] = useState<ChartForm>(() => (existing
    ? { name: existing.name, resultUnit: existing.resultUnit ?? '', mode: existing.mode, columns: existing.axes.map(columnFromAxis) }
    : { name: '', resultUnit: '', mode: 'step_up', columns: [blankColumn()] }));
  const [value, setValue] = useState<ChartValue>(null);
  const [gridOpen, setGridOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  const problems = formProblems(form);
  const setColumn = (i: number, patch: Partial<ColumnForm>) => setForm((f) => ({ ...f, columns: f.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setCount = (n: 1 | 2) => {
    setForm((f) => ({ ...f, columns: n === 1 ? f.columns.slice(0, 1) : [...f.columns, blankColumn()].slice(0, 2) }));
    // Values were shaped for the old number of columns.
    if (n !== form.columns.length) setValue(null);
  };
  const pickSpec = (i: number, s: Specification | null) => setColumn(i, s
    ? { kind: 'spec', specCode: s.code, specName: s.name, specUnit: s.defaultUom ?? '', unit: '' }
    : { kind: 'spec', specCode: '', specName: '', specUnit: '', unit: '' });

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (existing) {
        await updateChart(existing.specId, { name: form.name.trim(), resultUnit: form.resultUnit.trim(), axes: axesInput(form), mode: form.mode });
        onSaved(null);
      } else {
        const out = await addChart(subject, { name: form.name.trim(), resultUnit: form.resultUnit.trim(), axes: axesInput(form), mode: form.mode, ...(value ? { value } : {}) });
        onSaved(out.charts);
      }
      setBusy(false);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    }
  };

  const cfg = formTableConfig(form);
  const short = existing?.shortForm ?? (isBound(form) && form.name.trim() ? shortNameGuess(form.name) : null);

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={existing ? `Change chart — ${existing.name}` : 'Add a chart'} busy={busy} onClose={onClose}
        subtitle="A lookup table: for a value of the piece (or something else), one result per row." />
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
            <TextField label="Name" size="small" required autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              helperText="What the chart gives, e.g. Gas cutting speed" inputProps={{ maxLength: 120 }} />
            <TextField label="What it gives (unit)" size="small" required value={form.resultUnit} onChange={(e) => setForm((f) => ({ ...f, resultUnit: e.target.value }))}
              helperText="e.g. mm/min, min/m, s" inputProps={{ maxLength: 20 }} />
          </Box>

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Read by</Typography>
              <ToggleButtonGroup exclusive size="small" value={form.columns.length} onChange={(_, n) => { if (n) setCount(n); }} aria-label="Number of columns">
                <ToggleButton value={1} sx={{ textTransform: 'none', px: 1.5 }}>1 column</ToggleButton>
                <ToggleButton value={2} sx={{ textTransform: 'none', px: 1.5 }}>2 columns</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              {form.columns.map((c, i) => {
                const picked = numberSpecs.find((s) => s.code === c.specCode) ?? null;
                return (
                  <Box key={i} sx={{ display: 'grid', gap: 1, p: 1.5, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{form.columns.length === 2 ? (i === 0 ? 'Column 1 — down the rows' : 'Column 2 — across the top') : 'Column — down the rows'}</Typography>
                    <Autocomplete size="small" options={[...numberSpecs, { id: -1, code: OTHER, name: 'Other — a label of my own' } as Specification]}
                      value={c.kind === 'other' ? { id: -1, code: OTHER, name: 'Other — a label of my own' } as Specification : picked}
                      onChange={(_, s) => { if (s?.code === OTHER) setColumn(i, { kind: 'other', specCode: '', specName: '', specUnit: '' }); else pickSpec(i, s); }}
                      getOptionLabel={(s) => s.name} isOptionEqualToValue={(a, b) => a.code === b.code}
                      filterOptions={(opts, st) => {
                        const q = st.inputValue.trim().toLowerCase();
                        return q ? opts.filter((o) => o.code === OTHER || o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)) : opts;
                      }}
                      renderOption={({ key, ...props }, s) => (
                        <Box component="li" key={key} {...props} sx={{ display: 'flex !important', gap: 1, alignItems: 'baseline' }}>
                          <Box sx={{ flex: 1, minWidth: 0, fontWeight: s.code === OTHER ? 400 : 500 }}>{s.name}</Box>
                          {s.code !== OTHER && <Mono muted>{s.code}</Mono>}
                          {s.code !== OTHER && s.defaultUom && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{s.defaultUom}</Box>}
                        </Box>
                      )}
                      loading={specs.loading}
                      renderInput={(p) => <TextField {...p} label="The piece’s value it is read by" helperText={c.kind === 'spec' && picked ? (picked.defaultUom ? `Unit: ${picked.defaultUom}` : undefined) : undefined} />} />
                    {c.kind === 'spec' && c.specCode && !c.specUnit && (
                      <TextField size="small" required label={`Unit of ${c.specName}`} value={c.unit} onChange={(e) => setColumn(i, { unit: e.target.value })}
                        helperText="This value has no unit set. Say which one the rows are in." inputProps={{ maxLength: 20 }} />
                    )}
                    {c.kind === 'other' && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 1 }}>
                        <TextField size="small" required label="Label" value={c.label} onChange={(e) => setColumn(i, { label: e.target.value })} inputProps={{ maxLength: 60 }} />
                        <TextField size="small" required label="Unit" value={c.unit} onChange={(e) => setColumn(i, { unit: e.target.value })} inputProps={{ maxLength: 20 }} />
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>

          <TextField select size="small" label="Between rows" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as ChartMode }))}>
            <MenuItem value="step_up">Step up — a value between two rows takes the next row’s result</MenuItem>
            <MenuItem value="linear">Straight line — a value between two rows is worked out between them</MenuItem>
          </TextField>

          {!existing && (
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Values <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-3)' }}>(optional now)</Box></Typography>
              <Button variant="outlined" size="small" startIcon={<TableChartOutlined fontSize="small" />} onClick={() => setGridOpen(true)}
                sx={{ textTransform: 'none', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                {value ? summaryOf(cfg, value) : 'Type rows or paste from Excel'}
              </Button>
            </Box>
          )}

          <Box sx={{ p: 1.5, borderRadius: 'var(--r-sm)', border: '1px dashed var(--c-border)' }} data-testid="chart-preview">
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>The headings will read</Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 13.5 }}>{formHeadingLine(form)}</Typography>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
              In a time formula: {short
                ? <Mono>{short}</Mono>
                : <>a <Mono>LOOKUP(machine.CODE, …)</Mono>{isBound(form) ? '' : ' — name every column after a piece’s value to get a short name'}</>}
            </Typography>
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
        <TableValueDialog open onClose={() => setGridOpen(false)} specName={form.name.trim() || 'New chart'} tableConfig={cfg}
          resultLabel={withUnit(form.name.trim() || 'Result', form.resultUnit)} value={valueToText(value)}
          onSave={(s) => setValue(valueFromText(s))} />
      )}
    </Dialog>
  );
}
