import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import type { Resolution } from '../../api/types';
import { blankRow, fromDraft, listColumns, listState, listSummary, parseList, sameList, toDraft, type DraftRow, type ListColumn, type ListRow } from '../../lib/listValue';
import CloseRounded from '@mui/icons-material/CloseRounded';

/** The dialog's title with a close button (not FormDialog's: this file stays free of the API client, so the grid can use it anywhere). */
function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <DialogTitle sx={{ pr: 6 }}>{title}
      <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRounded /></IconButton>
    </DialogTitle>
  );
}

/**
 * A LIST VALUE's rows (HOLE_SET: diameter, count, kind, depth), one row per entry and a cell per column — number
 * inputs, a select for a column with options, the column's "blank means …" as the placeholder. Add and remove rows;
 * Save hands back the rows (the caller saves them as the spec's value — the server checks them again).
 *
 * The drawing's set (or the worked-out one) is shown beside it when the typed rows differ, with "Back to the drawing":
 * the typed value is cleared and the piece follows the drawing again.
 */
export interface ListDrawing { rows: ListRow[]; display: string | null; from: 'drawing' | 'calculated' }

export function ListValueDialog({ open, onClose, title, columns, typed, drawing, disabled, onSave, onBack }: {
  open: boolean;
  onClose: () => void;
  title: string;
  columns: ListColumn[];
  /** the piece's own rows; null = it follows the drawing (the form starts from the drawing's set) */
  typed: ListRow[] | null;
  drawing?: ListDrawing | null;
  disabled?: boolean;
  onSave: (rows: ListRow[]) => void;
  /** clear the typed rows (offered when there is a typed value and a drawing's set to go back to) */
  onBack?: () => void;
}) {
  const start = typed ?? drawing?.rows ?? [];
  const [draft, setDraft] = useState<DraftRow[]>(() => (start.length ? toDraft(start, columns) : [blankRow(columns)]));
  useEffect(() => { if (open) setDraft(start.length ? toDraft(start, columns) : [blankRow(columns)]); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const checked = useMemo(() => fromDraft(draft, columns), [draft, columns]);
  const rows = 'rows' in checked ? checked.rows : null;
  const differs = !!drawing && !!rows && !sameList(rows, drawing.rows);
  const set = (i: number, code: string, v: string) => setDraft((d) => d.map((r, j) => (j === i ? { ...r, [code]: v } : r)));
  const drawingWord = drawing?.from === 'drawing' ? "The drawing's set" : 'The worked-out set';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="list-dialog">
      <Head title={title} onClose={onClose} />
      <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
        {drawing && (
          <Box data-testid="list-drawing" sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', p: 1, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', fontSize: 13 }}>
            <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{drawingWord}:</Box>
            <Box component="span" sx={{ fontFamily: 'var(--font-mono)' }}>{drawing.display ?? listSummary(drawing.rows, columns)}</Box>
            {!differs && rows && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>— the same as below</Box>}
            {differs && !disabled && (
              <Button size="small" onClick={() => setDraft(drawing.rows.length ? toDraft(drawing.rows, columns) : [blankRow(columns)])} data-testid="list-copy-drawing">Copy it below</Button>
            )}
          </Box>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label={`${title} rows`}>
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.code} scope="col">{c.name}{c.unit ? ` (${c.unit})` : ''}{c.required ? ' *' : ''}</TableCell>
                ))}
                <TableCell scope="col" sx={{ width: 48 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {draft.map((r, i) => (
                <TableRow key={i} data-testid="list-row">
                  {columns.map((c) => {
                    const bad = 'problem' in checked && checked.row === i && checked.code === c.code;
                    const common = { size: 'small' as const, fullWidth: true, disabled, value: r[c.code] ?? '', error: bad,
                      onChange: (e: { target: { value: string } }) => set(i, c.code, e.target.value), inputProps: { 'aria-label': `${c.name}, row ${i + 1}`, 'data-col': c.code } };
                    return (
                      <TableCell key={c.code} sx={{ minWidth: c.kind === 'word' ? 150 : 110 }}>
                        {c.kind === 'word' && c.options?.length ? (
                          <TextField {...common} select SelectProps={{ displayEmpty: true }}>
                            <MenuItem value=""><Box component="span" sx={{ color: 'var(--c-text-3)' }}>{c.blank ?? '—'}</Box></MenuItem>
                            {c.options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                          </TextField>
                        ) : (
                          <TextField {...common} type={c.kind === 'number' ? 'number' : 'text'} placeholder={c.blank ?? ''}
                            inputProps={{ ...common.inputProps, ...(c.kind === 'number' ? { step: c.integer ? 1 : 'any', min: 0 } : { maxLength: 60 }) }} />
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <Tooltip title="Remove this row">
                      <span><IconButton size="small" aria-label={`Remove row ${i + 1}`} disabled={disabled} onClick={() => setDraft((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : [blankRow(columns)]))}><DeleteOutlineRounded fontSize="small" /></IconButton></span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {!disabled && <Button size="small" startIcon={<AddRounded />} sx={{ justifySelf: 'start' }} onClick={() => setDraft((d) => [...d, blankRow(columns)])} data-testid="list-add-row">Add a row</Button>}
        {'problem' in checked && <Alert severity="warning" sx={{ py: 0 }} data-testid="list-problem">{checked.problem}</Alert>}
        {rows && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }} data-testid="list-summary">Saved as: {listSummary(rows, columns)}</Typography>}
      </DialogContent>
      <DialogActions>
        {onBack && typed && drawing && !disabled && (
          <Button onClick={() => { onBack(); onClose(); }} data-testid="list-back" sx={{ mr: 'auto' }}>Back to the drawing</Button>
        )}
        <Button onClick={onClose}>{disabled ? 'Close' : 'Cancel'}</Button>
        {!disabled && <Button variant="contained" disabled={!rows} onClick={() => { if (rows) { onSave(rows); onClose(); } }} data-testid="list-save">Save</Button>}
      </DialogActions>
    </Dialog>
  );
}

/**
 * The same dialog for a piece known only by its record id (the order's Values / Structure grid): its resolution
 * (GET /records/:id/specs, read by `load`) gives the columns, the typed rows and the drawing's set.
 */
export function RecordListDialog({ recordId, load, specCode, title, disabled, onClose, onSave, onBack, pendingText }: {
  recordId: number; load: (recordId: number) => Promise<Resolution>; specCode: string; title: string; disabled?: boolean; onClose: () => void;
  /** rows typed in the grid and not saved yet (their JSON; '' = going back to the drawing) — they stand over the saved ones */
  pendingText?: string;
  onSave: (rows: ListRow[]) => void; onBack: () => void;
}) {
  const [res, setRes] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load(recordId).then((r) => { if (live) setRes(r); })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [recordId, load]);
  const s = res?.specs.find((x) => x.applicable && x.spec.code === specCode) ?? null;
  if (!s) {
    return (
      <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
        <Head title={title} onClose={onClose} />
        <DialogContent>
          {error ? <Alert severity="error">{error}</Alert> : res ? <Typography>{specCode} is not a value of this piece.</Typography>
            : <Box role="status" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><CircularProgress size={16} /> Reading its rows…</Box>}
        </DialogContent>
      </Dialog>
    );
  }
  const st = listState(s);
  const typed = pendingText === undefined ? st.typed : pendingText === '' ? null : parseList(pendingText);
  return <ListValueDialog open onClose={onClose} title={title} columns={listColumns(s.spec.tableConfig)} typed={typed} drawing={st.drawing}
    disabled={disabled} onSave={onSave} onBack={onBack} />;
}
