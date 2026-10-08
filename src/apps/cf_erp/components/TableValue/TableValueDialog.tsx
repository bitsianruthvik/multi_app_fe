import { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, IconButton, Tooltip, Typography, styled,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ContentPasteGoRounded from '@mui/icons-material/ContentPasteGoRounded';
import type { TableConfig, TableValue, TableValue1D, TableValue2D } from '../../api/types';
import { isTable2D } from '../../api/types';
import { DialogHeader } from '../FormDialog';
import {
  addColumn, addRow, axisCountOf, emptyTable, parsePastedBlock, parseTableValue, removeColumn, removeRow,
  serializeTableValue, setCell, setColumnHeader, setRowHeader, summaryOf, validateTable,
} from './tableValueModel';

/**
 * The grid dialog for a table specification's chart — rows = axis 1, columns =
 * axis 2 (a 1-D table has no columns of its own, just one value per row). Not
 * a FormDialog: there is nothing to save to the backend here — the result is
 * handed back as the same JSON string every other data type's value is, and
 * whatever holds it (SpecValueInput's caller) saves it the way it saves anything.
 */
export function TableValueDialog({
  open, onClose, specName, tableConfig, value, onSave, disabled, resultLabel,
}: {
  open: boolean;
  onClose: () => void;
  specName: string;
  tableConfig: TableConfig | null | undefined;
  /** The current value, JSON-encoded exactly as SpecValueInput carries it. */
  value: string;
  onSave: (serialized: string) => void;
  disabled?: boolean;
  /** Heading of the value column, with its unit, e.g. "Gas cutting speed (mm/min)". */
  resultLabel?: string;
}) {
  const axisCount = axisCountOf(tableConfig);
  const axisLabel = (i: number, fallback: string) => {
    const a = tableConfig?.axes?.[i];
    return a ? `${a.label}${a.unit ? ` (${a.unit})` : ''}` : fallback;
  };
  // A fresh table per opening, so typing in one row and cancelling never
  // leaks into the next time the dialog is opened.
  const [table, setTable] = useState<TableValue>(() => parseTableValue(value) ?? emptyTable(axisCount));
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const problems = useMemo(() => validateTable(table, tableConfig), [table, tableConfig]);
  const summary = summaryOf(tableConfig, table);

  const applyPaste = () => {
    const out = parsePastedBlock(pasteText, axisCount);
    if ('error' in out) { setPasteError(out.error); return; }
    setTable(out.table);
    setPasteError(null);
    setPasting(false);
    setPasteText('');
  };

  const save = () => { onSave(serializeTableValue(table)); onClose(); };
  const clear = () => { onSave(''); onClose(); };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogHeader title={`${specName} — chart`} onClose={onClose}
        subtitle={`${axisCount === 2 ? `${axisLabel(0, 'Row')} × ${axisLabel(1, 'Column')}` : axisLabel(0, 'Row')}${resultLabel ? ` → ${resultLabel}` : ''}`} />
      <DialogContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{summary}</Typography>
          <Button size="small" startIcon={<ContentPasteGoRounded fontSize="small" />} onClick={() => setPasting((p) => !p)} disabled={disabled}>
            Paste from Excel
          </Button>
        </Box>
        {pasting && (
          <Box sx={{ mb: 2, p: 1.5, borderRadius: 'var(--r-sm)', border: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>
              {axisCount === 1
                ? `Copy two columns from Excel — ${axisLabel(0, 'the row value')} and the rate — and paste here.`
                : `Copy a block from Excel: the first row is ${axisLabel(1, 'the column values')}, the first column is ${axisLabel(0, 'the row values')}, leave the corner cell blank.`}
            </Typography>
            <PasteArea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPasteError(null); }}
              placeholder={axisCount === 1 ? '6\t3535\n8\t2860\n12\t1700' : '\t14\t21\n10\t50\t55\n20\t80\t100'} rows={5} />
            {pasteError && <Alert severity="error" sx={{ mt: 1, borderRadius: 'var(--r-sm)' }}>{pasteError}</Alert>}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="contained" onClick={applyPaste} disabled={!pasteText.trim()}>Replace the chart with this</Button>
              <Button size="small" onClick={() => { setPasting(false); setPasteText(''); setPasteError(null); }}>Cancel</Button>
            </Box>
          </Box>
        )}

        <Box sx={{ overflow: 'auto', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm)', maxHeight: 420 }}>
          {isTable2D(table)
            ? <Grid2D table={table} axisLabel={axisLabel} disabled={disabled} onChange={setTable} />
            : <Grid1D table={table} axisLabel={axisLabel} resultLabel={resultLabel} disabled={disabled} onChange={setTable} />}
        </Box>
        <Box sx={{ mt: 1 }}>
          <Button size="small" startIcon={<AddRounded fontSize="small" />} onClick={() => setTable((t) => addRow(t))} disabled={disabled}>
            Add row
          </Button>
          {axisCount === 2 && (
            <Button size="small" startIcon={<AddRounded fontSize="small" />} sx={{ ml: 1 }}
              onClick={() => setTable((t) => (isTable2D(t) ? addColumn(t) : t))} disabled={disabled}>
              Add column
            </Button>
          )}
        </Box>
        {problems.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 'var(--r-sm)' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {problems.map((p) => <span key={p}>{p}</span>)}
            </Box>
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={clear} disabled={disabled || !value}>Clear chart</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={disabled || problems.length > 0}>Use this chart</Button>
      </DialogActions>
    </Dialog>
  );
}

const PasteArea = styled('textarea')({
  width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 8,
  border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)', resize: 'vertical',
});

const Table = styled('table')({
  borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 13, color: 'var(--c-text)',
  '& th, & td': { borderBottom: '1px solid var(--c-divider)', borderRight: '1px solid var(--c-divider)', padding: 0, textAlign: 'left' },
  '& thead th': { position: 'sticky', top: 0, background: 'var(--c-surface-2)', padding: '4px 6px', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' },
  '& td.hd, & th.hd': { position: 'sticky', left: 0, background: 'var(--c-surface-2)', zIndex: 1, width: 110 },
  '& .cell-in': {
    boxSizing: 'border-box', width: '100%', height: 32, border: 0, margin: 0, padding: '0 8px', background: 'transparent', color: 'inherit',
    font: 'inherit', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 13, outline: 'none', textAlign: 'right',
  },
  '& .cell-in:focus': { boxShadow: 'inset 0 0 0 2px var(--c-primary-500)', background: 'var(--c-surface)' },
  '& .cell-in::placeholder': { color: 'var(--c-text-3)', opacity: 1 },
});

const numOr = (raw: string, fallback: number) => (raw.trim() === '' ? fallback : Number(raw));

function Grid1D({ table, axisLabel, resultLabel, disabled, onChange }: {
  table: TableValue1D; axisLabel: (i: number, fallback: string) => string; resultLabel?: string; disabled?: boolean; onChange: (t: TableValue) => void;
}) {
  return (
    <Table>
      <thead><tr><th className="hd">{axisLabel(0, 'Row')}</th><th>{resultLabel ?? 'Rate'}</th><th style={{ width: 32 }} /></tr></thead>
      <tbody>
        {table.x.map((x, i) => (
          <tr key={i}>
            <td className="hd">
              <input className="cell-in" type="number" value={x} disabled={disabled}
                onChange={(e) => onChange(setRowHeader(table, i, numOr(e.target.value, x)))} />
            </td>
            <td>
              <input className="cell-in" type="number" placeholder="cannot" value={table.v[i] ?? ''} disabled={disabled}
                onChange={(e) => onChange(setCell(table, i, 0, e.target.value.trim() === '' ? null : Number(e.target.value)))} />
            </td>
            <td>
              <Tooltip title="Remove row">
                <span><IconButton size="small" disabled={disabled} onClick={() => onChange(removeRow(table, i))}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
              </Tooltip>
            </td>
          </tr>
        ))}
        {!table.x.length && <tr><td colSpan={3} style={{ padding: 12, color: 'var(--c-text-3)', textAlign: 'center' }}>No rows yet — add one, or paste from Excel.</td></tr>}
      </tbody>
    </Table>
  );
}

function Grid2D({ table, axisLabel, disabled, onChange }: {
  table: TableValue2D; axisLabel: (i: number, fallback: string) => string; disabled?: boolean; onChange: (t: TableValue2D) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <th className="hd">{axisLabel(0, 'Row')} \ {axisLabel(1, 'Column')}</th>
          {table.y.map((y, j) => (
            <th key={j}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                <input className="cell-in" type="number" value={y} disabled={disabled}
                  onChange={(e) => onChange(setColumnHeader(table, j, numOr(e.target.value, y)))} />
                <Tooltip title="Remove column">
                  <span><IconButton size="small" disabled={disabled} onClick={() => onChange(removeColumn(table, j))}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
                </Tooltip>
              </Box>
            </th>
          ))}
          <th style={{ width: 32 }} />
        </tr>
      </thead>
      <tbody>
        {table.x.map((x, i) => (
          <tr key={i}>
            <td className="hd">
              <input className="cell-in" type="number" value={x} disabled={disabled}
                onChange={(e) => onChange(setRowHeader(table, i, numOr(e.target.value, x)) as TableValue2D)} />
            </td>
            {table.y.map((_, j) => (
              <td key={j}>
                <input className="cell-in" type="number" placeholder="not set" value={table.v[j]?.[i] ?? ''} disabled={disabled}
                  onChange={(e) => onChange(setCell(table, i, j, e.target.value.trim() === '' ? null : Number(e.target.value)) as TableValue2D)} />
              </td>
            ))}
            <td>
              <Tooltip title="Remove row">
                <span><IconButton size="small" disabled={disabled} onClick={() => onChange(removeRow(table, i) as TableValue2D)}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
              </Tooltip>
            </td>
          </tr>
        ))}
        {!table.x.length && <tr><td colSpan={table.y.length + 2} style={{ padding: 12, color: 'var(--c-text-3)', textAlign: 'center' }}>No rows yet — add one, or paste from Excel.</td></tr>}
      </tbody>
    </Table>
  );
}
