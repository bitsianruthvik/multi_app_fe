import { useEffect, useState } from 'react';
import {
  Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton,
  MenuItem, TextField, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi, CfApiError } from '../api/client';
import type { DataType, Meta, Specification, TableMode } from '../api/types';
import { ErrorNotice } from './ui';
import { TYPE_LABEL } from '../lib/specTypes';
import { DialogHeader } from './FormDialog';
import { listColumns, listConfigOf, listConfigProblem } from '../lib/listValue';

interface OptionDraft { id?: number; value: string; label: string; status?: 'active' | 'inactive' }
interface AxisDraft { label: string; unit: string }
/** A list column as the form edits it (lib/listValue listConfigOf turns it into the config). */
interface ColDraft { code: string; name: string; kind: 'number' | 'word'; unit: string; optionsText: string; required: boolean; integer: boolean; blank: string }
const NEW_COL: ColDraft = { code: '', name: '', kind: 'number', unit: '', optionsText: '', required: false, integer: false, blank: '' };


/**
 * The specification form: a new one, or an existing one's details. `onSaved` gets the saved
 * specification, so a screen that opened it to make one (the rule dialog) can pick it at once.
 */
export function SpecDialog({ open, onClose, onSaved, existing, meta, canManage }: {
  open: boolean; onClose: () => void; onSaved: (saved: Specification | null) => void; existing: Specification | null; meta: Meta | null; canManage: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<DataType>('number');
  const [measurementType, setMeasurementType] = useState('');
  const [defaultUom, setDefaultUom] = useState('');
  const [decimals, setDecimals] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  // Can be set for a whole order (init.sql §65): an order and its lines may carry a value every row takes.
  const [orderLevel, setOrderLevel] = useState(false);
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [newOption, setNewOption] = useState('');
  const [tableAxes, setTableAxes] = useState<AxisDraft[]>([{ label: '', unit: '' }]);
  const [tableMode, setTableMode] = useState<TableMode>('step_up');
  // A LIST's columns (HOLE_SET: diameter, count, kind, depth).
  const [listCols, setListCols] = useState<ColDraft[]>([{ ...NEW_COL }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNewOption('');
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setDataType(existing?.dataType ?? 'number');
    setMeasurementType(existing?.measurementType ?? '');
    setDefaultUom(existing?.defaultUom ?? '');
    setDecimals(existing?.decimals == null ? '' : String(existing.decimals));
    setDescription(existing?.description ?? '');
    setStatus(existing?.status ?? 'active');
    setOrderLevel(!!existing?.orderLevel);
    setOptions((existing?.options ?? []).map((o) => ({ id: o.id, value: o.value, label: o.label ?? '', status: o.status })));
    const axes = existing?.tableConfig?.axes;
    setTableAxes(axes?.length ? axes.map((a) => ({ label: a.label, unit: a.unit ?? '' })) : [{ label: '', unit: '' }]);
    setTableMode(existing?.tableConfig?.mode ?? 'step_up');
    const cols = existing?.dataType === 'list' ? listColumns(existing.tableConfig) : [];
    setListCols(cols.length ? cols.map((c) => ({ code: c.code, name: c.name, kind: c.kind, unit: c.unit ?? '', optionsText: (c.options ?? []).join(', '), required: !!c.required, integer: !!c.integer, blank: c.blank ?? '' })) : [{ ...NEW_COL }]);
  }, [open, existing]);

  const addOption = () => {
    const v = newOption.trim();
    if (!v || options.some((o) => o.value.toLowerCase() === v.toLowerCase())) return;
    setOptions((o) => [...o, { value: v, label: '' }]);
    setNewOption('');
  };

  const listConfig = dataType === 'list' ? listConfigOf(listCols) : null;
  const listProblem = listConfig ? listConfigProblem(listConfig) : null;
  // An existing list's columns are sent only when they changed.
  const listChanged = !!listConfig && (!existing || JSON.stringify(listConfig) !== JSON.stringify(listConfigOf(listColumns(existing.tableConfig))));
  const tableConfig = dataType === 'table'
    ? { axes: tableAxes.map((a) => ({ label: a.label.trim(), unit: a.unit.trim() || null })), mode: tableMode }
    : listConfig && listChanged ? listConfig : undefined;
  // Once a table has values, its axis COUNT is fixed (the shape of every stored
  // chart depends on it) — a relabel or a change of mode is still free.
  const axisCountLocked = dataType === 'table' && !!existing && existing.valueCount > 0;
  const tableIncomplete = dataType === 'table' && (!tableAxes.length || tableAxes.some((a) => !a.label.trim()));

  const save = async () => {
    setBusy(true);
    setError(null);
    let saved: Specification | null = null;
    try {
      const common = { name, measurementType: measurementType || null, defaultUom: defaultUom || null, decimals: decimals === '' ? null : Number(decimals), description: description || null, ...(dataType === 'table' || dataType === 'list' ? {} : { orderLevel }) };
      if (existing) {
        // dataType goes with it: the field is editable until the spec has values,
        // and leaving it out made changing it silently do nothing.
        saved = await cfApi.put<Specification>(`/specifications/${existing.id}`, { ...common, dataType, status, tableConfig });
        // Options are edited one by one on an existing spec: stored values keep their option ids.
        for (const o of options.filter((x) => !x.id)) await cfApi.post(`/specifications/${existing.id}/options`, { value: o.value, label: o.label || null });
        for (const o of options.filter((x) => x.id)) {
          const before = existing.options?.find((b) => b.id === o.id);
          if (before && ((before.label ?? '') !== o.label || before.status !== o.status)) {
            await cfApi.put(`/spec-options/${o.id}`, { label: o.label || null, status: o.status });
          }
        }
      } else {
        saved = await cfApi.post<Specification>('/specifications', {
          ...common, code, dataType,
          options: dataType === 'option' ? options.map((o) => ({ value: o.value, label: o.label || null })) : undefined,
          tableConfig,
        });
      }
      setBusy(false);
      onSaved(saved);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New specification'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13, mb: 2 }}>
          Defined once, used everywhere. How its value is obtained is decided where it is attached, not here.
        </Typography>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Code" required={!existing} value={code} disabled={!!existing} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus={!existing}
            helperText={existing ? 'Permanent — formulas and coding rules refer to it' : 'Capital letters, digits, _ — e.g. THICKNESS'}
            inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus={!!existing} />
          <TextField select label="Data type" value={dataType} disabled={!!existing && existing.valueCount > 0}
            helperText={existing && existing.valueCount > 0 ? 'Fixed once values exist' : ' '} onChange={(e) => setDataType(e.target.value as DataType)}>
            {(meta?.dataTypes ?? ['number', 'text', 'boolean', 'date', 'option', 'table', 'list']).map((d) => <MenuItem key={d} value={d}>{TYPE_LABEL[d] ?? d}</MenuItem>)}
          </TextField>
          <TextField select label="Measures" value={measurementType} onChange={(e) => setMeasurementType(e.target.value)} helperText=" ">
            <MenuItem value="">—</MenuItem>
            {(meta?.measurementTypes ?? []).map((m) => <MenuItem key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</MenuItem>)}
          </TextField>
          {(dataType === 'number' || dataType === 'table') && (
            <TextField label="Unit" value={defaultUom} onChange={(e) => setDefaultUom(e.target.value)}
              helperText={dataType === 'table' ? "The chart's own output unit, e.g. mm/min" : 'Every value is stored in this unit'} />
          )}
          {dataType === 'number' && (
            <TextField label="Decimals shown" type="number" value={decimals} onChange={(e) => setDecimals(e.target.value)} inputProps={{ min: 0, max: 6 }} />
          )}
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          {dataType !== 'table' && dataType !== 'list' && (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <FormControlLabel control={<Checkbox checked={orderLevel} onChange={(e) => setOrderLevel(e.target.checked)} inputProps={{ 'aria-label': 'Can be set for a whole order' }} />}
                label="Can be set for a whole order" />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', ml: 4 }}>
                An order and each of its lines can then carry one value for it (Order values tab) — coats, grade, impact class. Every row takes it unless the row has its own.
              </Typography>
            </Box>
          )}
          {existing && (
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')} helperText="Inactive keeps existing values but stops new use">
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          )}
        </Box>
        {dataType === 'option' && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontWeight: 500, mb: 0.5 }}>Options</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>A rule can narrow this list for the items it covers.</Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {options.map((o, i) => (
                <Box key={o.id ?? `new-${o.value}`} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" label="Value" value={o.value} disabled inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
                  <TextField size="small" label="Label (optional)" value={o.label} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  {o.id ? (
                    <TextField size="small" select value={o.status ?? 'active'} sx={{ width: 120 }} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, status: e.target.value as 'active' | 'inactive' } : x)))}>
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Retired</MenuItem>
                    </TextField>
                  ) : (
                    <IconButton aria-label={`Remove ${o.value}`} onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}><DeleteOutlineRounded /></IconButton>
                  )}
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" label="Add an option" value={newOption} onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
                <Button onClick={addOption} startIcon={<AddRounded />}>Add</Button>
              </Box>
            </Box>
          </Box>
        )}
        {dataType === 'list' && (
          <Box sx={{ mt: 2.5 }} data-testid="list-columns">
            <Typography sx={{ fontWeight: 500, mb: 0.5 }}>Columns</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>
              Each value is a list of rows with these columns — a hole set is Diameter (mm), Holes (whole number), Kind (drilled, punched, …) and Through (mm, empty = the part&rsquo;s thickness).
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              {listCols.map((c, i) => {
                const put = (patch: Partial<ColDraft>) => setListCols((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <Box key={i} data-testid="list-column" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(4, minmax(0, 1fr)) auto' }, gap: 1, alignItems: 'center', pb: 1.5, borderBottom: '1px solid var(--c-divider)' }}>
                    <TextField size="small" label="Code" value={c.code} onChange={(e) => put({ code: e.target.value.toUpperCase() })} placeholder="DIA" inputProps={{ style: { fontFamily: 'var(--font-mono)' }, 'aria-label': `Column ${i + 1} code` }} />
                    <TextField size="small" label="Name" value={c.name} onChange={(e) => put({ name: e.target.value })} placeholder="Diameter" inputProps={{ 'aria-label': `Column ${i + 1} name` }} />
                    <TextField size="small" select label="Holds" value={c.kind} onChange={(e) => put({ kind: e.target.value as ColDraft['kind'] })}>
                      <MenuItem value="number">A number</MenuItem>
                      <MenuItem value="word">A word</MenuItem>
                    </TextField>
                    {c.kind === 'number'
                      ? <TextField size="small" label="Unit" value={c.unit} onChange={(e) => put({ unit: e.target.value })} placeholder="mm" />
                      : <TextField size="small" label="Options (commas)" value={c.optionsText} onChange={(e) => put({ optionsText: e.target.value })} placeholder="drilled, punched" />}
                    <IconButton aria-label={`Remove column ${i + 1}`} disabled={listCols.length < 2} onClick={() => setListCols((all) => all.filter((_, j) => j !== i))}><DeleteOutlineRounded /></IconButton>
                    <Box sx={{ gridColumn: '1 / -1', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                      <FormControlLabel control={<Checkbox size="small" checked={c.required} onChange={(e) => put({ required: e.target.checked })} />} label="Needed in every row" />
                      {c.kind === 'number' && <FormControlLabel control={<Checkbox size="small" checked={c.integer} onChange={(e) => put({ integer: e.target.checked })} />} label="Whole number" />}
                      {!c.required && <TextField size="small" label="An empty cell means" value={c.blank} onChange={(e) => put({ blank: e.target.value })} placeholder="the part's thickness" sx={{ flex: 1, minWidth: 200 }} />}
                    </Box>
                  </Box>
                );
              })}
              <Button size="small" startIcon={<AddRounded />} sx={{ justifySelf: 'start' }} onClick={() => setListCols((all) => [...all, { ...NEW_COL }])}>Add a column</Button>
              {listProblem && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }} data-testid="list-columns-problem">{listProblem}</Typography>}
            </Box>
          </Box>
        )}
        {dataType === 'table' && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontWeight: 500, mb: 0.5 }}>Chart axes</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>
              One axis for a chart with a single input, such as thickness. Two for one with two, such as thickness and hole diameter.
            </Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {tableAxes.map((a, i) => (
                <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" label={`Axis ${i + 1} label`} value={a.label} placeholder={i === 0 ? 'Thickness' : 'Hole diameter'}
                    onChange={(e) => setTableAxes((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <TextField size="small" label="Unit" value={a.unit} placeholder="mm"
                    onChange={(e) => setTableAxes((all) => all.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                  {tableAxes.length > 1 && (
                    <IconButton aria-label={`Remove axis ${i + 1}`} disabled={axisCountLocked}
                      onClick={() => setTableAxes((all) => all.filter((_, j) => j !== i))}><DeleteOutlineRounded /></IconButton>
                  )}
                </Box>
              ))}
              {tableAxes.length < 2 && (
                <Button size="small" onClick={() => setTableAxes((all) => [...all, { label: '', unit: '' }])} startIcon={<AddRounded />}
                  disabled={axisCountLocked} sx={{ justifySelf: 'start' }}>
                  Add a second axis
                </Button>
              )}
              {axisCountLocked && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  This chart already has values, so the number of axes is fixed — relabelling an axis or changing how it reads between rows is still free.
                </Typography>
              )}
            </Box>
            <TextField select label="Reading between rows" value={tableMode} sx={{ mt: 2 }} fullWidth helperText=" "
              onChange={(e) => setTableMode(e.target.value as TableMode)}>
              <MenuItem value="step_up">The next row up — never a faster or larger reading than the chart gives</MenuItem>
              <MenuItem value="linear">A straight line between the two rows around it</MenuItem>
            </TextField>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{canManage ? 'Cancel' : 'Close'}</Button>
        {canManage && (
          <Button variant="contained" onClick={save} disabled={busy || !name.trim() || (!existing && !code.trim()) || tableIncomplete || !!listProblem} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save' : 'Create'}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
