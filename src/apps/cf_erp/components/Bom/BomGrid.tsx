import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { effectiveCell, type ValuesColumn, type ValuesView } from '../Values/valuesModel';
import { ownInput, valueEditable, type BomRow, type Pending } from './bomModel';
import type { SpecValues } from './useSpecValues';
import type { RowMark } from './BomTree';
import type { DropPosition } from './bomArrangement';

export interface GridWrite { row: BomRow; code: string; text: string; saved: string }
type Point = { row: number; col: number };
type Cell = { text: string; input: string; saved: string; editable: boolean; why?: string; type?: string; options?: { id: number; value: string; label?: string | null }[] };
const same = (a: Point | null, b: Point) => a?.row === b.row && a.col === b.col;

/** Selection is separate from editing and dragging. Only the handle drags;
 * cells own clipboard events, and a double click/Enter/F2 enters the editor. */
export function BomGrid({ rows, view, records: recordValues, recordIds, pending, busy, canEdit, canEditValues, onToggle, onWrites, onMove, dropRefusal, trailingCell, flowCell, markOf, placeholderOf, footer }: {
  rows: BomRow[]; view: ValuesView | null; pending: Pending; busy: boolean; canEdit: (row: BomRow) => boolean;
  records?: SpecValues; recordIds?: number[]; canEditValues: (row: BomRow) => boolean;
  onToggle: (key: string) => void; onWrites: (writes: GridWrite[]) => void;
  onMove: (row: BomRow, target: BomRow, position: DropPosition) => void;
  dropRefusal: (row: BomRow, target: BomRow, position: DropPosition) => string | null;
  trailingCell: (row: BomRow) => ReactNode; flowCell: (row: BomRow) => ReactNode;
  markOf: (row: BomRow) => RowMark | null;
  placeholderOf: (row: BomRow) => { code: string; title: string } | null;
  footer?: ReactNode;
}) {
  const table = useRef<HTMLTableElement>(null);
  const selecting = useRef(false);
  const endingEdit = useRef(false);
  const [anchor, setAnchor] = useState<Point | null>(null), [extent, setExtent] = useState<Point | null>(null);
  const [editor, setEditor] = useState<{ at: Point; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drag, setDrag] = useState<BomRow | null>(null);
  const [drop, setDrop] = useState<{ key: string; position: DropPosition; refusal: string | null } | null>(null);
  const [moveDialog, setMoveDialog] = useState<BomRow | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [movePosition, setMovePosition] = useState<DropPosition>('before');
  const catalog = useMemo(() => {
    const cols = new Map<string, ValuesColumn>();
    const records = new Map<number, { row: ValuesView['groups'][number]['rows'][number]; columns: Map<string, ValuesColumn> }>();
    for (const group of view?.groups ?? []) {
      for (const col of group.columns) {
        const old = cols.get(col.code);
        cols.set(col.code, old ? { ...old, editable: old.editable || col.editable } : col);
      }
      const columns = new Map(group.columns.map((c) => [c.code, c]));
      for (const row of group.rows) records.set(row.id, { row, columns });
    }
    // Record BOMs reuse the same resolution and editability rules as their
    // former per-row editor. Child records remain shared and read-only.
    for (const id of recordIds ?? rows.map((r) => r.node.id)) for (const s of recordValues?.get(id)?.resolution?.specs ?? []) {
      if (!s.applicable) continue;
      const mode = recordValues?.get(id)?.resolution?.mode ?? 'item';
      const old = cols.get(s.spec.code);
      cols.set(s.spec.code, { ...s.spec, rule: s.rule.valueRule, required: s.rule.isRequired, editable: !!old?.editable || valueEditable(s, mode) });
    }
    return { cols: [...cols.values()].sort((a, b) => Number(b.editable) - Number(a.editable)), records };
  }, [view, rows, recordValues, recordIds]);
  const columns = [{ code: '$name', name: 'BOM line' }, { code: '$quantity', name: 'Quantity' }, { code: '$total', name: 'Total' }, ...catalog.cols];
  const cellAt = (at: Point): Cell => {
    const row = rows[at.row], col = columns[at.col];
    if (!row || !col) return { text: '', input: '', saved: '', editable: false };
    if (col.code === '$name') return { text: row.node.name, input: row.node.name, saved: '', editable: false };
    if (col.code === '$total') return { text: String(row.node.total), input: String(row.node.total), saved: '', editable: false, why: 'Calculated from the quantities above this row.' };
    if (col.code === '$quantity') {
      const text = row.paste?.quantity ?? (row.node.lineId == null ? undefined : pending.quantity[row.node.lineId]) ?? String(row.node.quantity);
      return { text, input: text, saved: String(row.paste?.source.quantity ?? row.node.quantity), editable: !busy && !!row.parent && canEdit(row), type: 'number' };
    }
    if (recordValues) {
      const entry = recordValues.get(row.node.id), resolution = entry?.resolution;
      const s = resolution?.specs.find((spec) => spec.applicable && spec.spec.code === col.code);
      if (!s || !resolution) return { text: '', input: '', saved: '', editable: false, why: entry?.error?.message ?? (entry ? 'This variable does not apply to this row.' : 'Loading values…') };
      const saved = ownInput(s, resolution.mode), input = pending.values?.[row.node.id]?.[col.code] ?? saved;
      const editable = !busy && !row.paste && canEditValues(row) && !resolution.frozen && valueEditable(s, resolution.mode) && s.spec.dataType !== 'table';
      const text = input === '' ? (saved !== '' && pending.values?.[row.node.id]?.[col.code] !== undefined ? '' : s.value?.display ?? '') : s.spec.dataType === 'option'
        ? s.options?.find((o) => String(o.id) === input)?.label || s.options?.find((o) => String(o.id) === input)?.value || input
        : s.spec.dataType === 'boolean' ? input === 'true' ? 'Yes' : 'No' : input;
      return { text, input, saved, editable, type: s.spec.dataType, options: s.options,
        why: !canEditValues(row) ? 'Shared values: open this item or definition to edit them.' : editable ? undefined : `${s.rule.valueRule} value — read-only here.` };
    }
    const info = catalog.records.get(row.node.id), actual = info?.columns.get(col.code);
    const raw = info?.row.cells[col.code];
    if (!view || !info || !actual || !raw) return { text: '', input: '', saved: '', editable: false, why: view ? 'This variable does not apply to this row.' : 'Loading values…' };
    const c = effectiveCell(view, actual, info.row, raw, !busy && !row.paste && canEditValues(row));
    const input = pending.values?.[row.node.id]?.[col.code] ?? c.input;
    const text = input === '' ? c.defaultDisplay ?? c.display ?? ''
      : actual.dataType === 'option' ? c.options?.find((o) => String(o.id) === input)?.label || c.options?.find((o) => String(o.id) === input)?.value || input
        : actual.dataType === 'boolean' ? input === 'true' ? 'Yes' : 'No' : input;
    return { text, input, saved: c.input, editable: c.editable, type: actual.dataType, options: c.options,
      why: row.paste ? 'Save this copy to edit its own values.' : info.row.readOnly ?? c.why ?? (c.missing ? 'Required value is missing.' : undefined) };
  };
  const bounds = () => {
    const a = anchor ?? { row: 0, col: 0 }, b = extent ?? a;
    return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row), left: Math.min(a.col, b.col), right: Math.max(a.col, b.col) };
  };
  const selected = (at: Point) => { const b = bounds(); return !!anchor && at.row >= b.top && at.row <= b.bottom && at.col >= b.left && at.col <= b.right; };
  const focus = (at: Point) => table.current?.querySelector<HTMLElement>(`[data-cell="${at.row}:${at.col}"]`)?.focus();
  const choose = (at: Point, extend = false) => { if (!extend || !anchor) setAnchor(at); setExtent(at); };
  const commit = (returnFocus = false) => {
    if (!editor || endingEdit.current) return;
    endingEdit.current = true;
    const c = cellAt(editor.at);
    if (c.editable) onWrites([{ row: rows[editor.at.row], code: columns[editor.at.col].code, text: editor.text, saved: c.saved }]);
    setEditor(null);
    if (returnFocus) focus(editor.at);
  };
  const begin = (at: Point, text?: string) => {
    const c = cellAt(at);
    if (!c.editable) { if (c.why) setProblem(c.why); return; }
    endingEdit.current = false;
    choose(at); setProblem(null); setEditor({ at, text: text ?? c.input });
  };
  const copy = (e: ClipboardEvent) => {
    if (editor || !anchor) return;
    const b = bounds(), lines: string[] = [];
    for (let row = b.top; row <= b.bottom; row++) {
      const line: string[] = [];
      for (let col = b.left; col <= b.right; col++) line.push(cellAt({ row, col }).text.replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
      lines.push(line.join('\t'));
    }
    e.preventDefault(); e.clipboardData.setData('text/plain', lines.join('\n'));
  };
  const paste = (e: ClipboardEvent) => {
    if (editor || !anchor) return;
    e.preventDefault();
    const data = e.clipboardData.getData('text/plain').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').map((s) => s.split('\t'));
    const b = bounds(), single = data.length === 1 && data[0].length === 1;
    const height = single ? b.bottom - b.top + 1 : data.length, width = single ? b.right - b.left + 1 : Math.max(...data.map((r) => r.length));
    if (height * width > 10000 || b.top + height > rows.length || b.left + width > columns.length) { setProblem('The pasted cells do not fit here. Select a smaller block or a different starting cell.'); return; }
    const writes: GridWrite[] = [];
    for (let r = 0; r < height; r++) for (let k = 0; k < width; k++) {
      const at = { row: b.top + r, col: b.left + k }, c = cellAt(at);
      if (!c.editable) { setProblem(`Nothing pasted: ${rows[at.row].node.name} · ${columns[at.col].name} is read-only or does not apply.`); return; }
      let text = (single ? data[0][0] : data[r]?.[k] ?? '').trim();
      if (c.type === 'option' && text !== '') {
        const option = c.options?.find((o) => [o.value, o.label, String(o.id)].some((s) => s?.toLowerCase() === text.toLowerCase()));
        if (!option) { setProblem(`Nothing pasted: “${text}” is not an allowed ${columns[at.col].name}.`); return; }
        text = String(option.id);
      }
      if (c.type === 'boolean' && text !== '') {
        if (/^(yes|true|1)$/i.test(text)) text = 'true';
        else if (/^(no|false|0)$/i.test(text)) text = 'false';
        else { setProblem('Nothing pasted: a Yes/No cell needs Yes or No.'); return; }
      }
      writes.push({ row: rows[at.row], code: columns[at.col].code, text, saved: c.saved });
    }
    onWrites(writes); setProblem(null); setExtent({ row: b.top + height - 1, col: b.left + width - 1 });
  };
  const onKey = (e: KeyboardEvent, at: Point) => {
    if (editor) return;
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] };
    if (delta[e.key]) {
      e.preventDefault();
      const [dr, dc] = delta[e.key];
      let row = at.row + dr, col = at.col + dc;
      if (e.key === 'Tab' && col >= columns.length) { row++; col = 0; }
      if (e.key === 'Tab' && col < 0) { row--; col = columns.length - 1; }
      const next = { row: Math.max(0, Math.min(rows.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)) };
      choose(next, e.shiftKey && e.key !== 'Tab'); focus(next); return;
    }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); begin(at); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); begin(at, e.key); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); const b = bounds(), writes: GridWrite[] = [];
      for (let row = b.top; row <= b.bottom; row++) for (let col = b.left; col <= b.right; col++) {
        const c = cellAt({ row, col });
        if (c.editable) writes.push({ row: rows[row], code: columns[col].code, text: '', saved: c.saved });
      }
      onWrites(writes);
    }
  };
  const targetRow = rows.find((r) => r.node.key === moveTarget);
  const moveWhy = moveDialog && targetRow ? dropRefusal(moveDialog, targetRow, movePosition) : 'Choose a destination.';

  return <>
    {problem && <Alert severity="info" onClose={() => setProblem(null)} sx={{ mb: 1 }}>{problem}</Alert>}
    <Box sx={{ overflow: 'auto', maxHeight: 'min(70vh, 720px)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
      <Box component="table" ref={table} role="grid" aria-label="BOM spreadsheet" aria-busy={busy || (!view && !recordValues)}
        onCopy={copy} onPaste={paste} onPointerUp={() => { selecting.current = false; }}
        sx={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%', tableLayout: 'fixed', fontSize: 12,
          '& th, & td': { borderRight: '1px solid var(--c-divider)', borderBottom: '1px solid var(--c-divider)' },
          '& th': { position: 'sticky', top: 0, zIndex: 3, background: 'var(--c-surface-2)', textAlign: 'left', py: 1, px: 1 },
          '& td': { height: 46, px: 1, outlineOffset: '-2px', '&:focus-visible': { outline: '2px solid var(--c-focus)' } },
          '& .bom-name': { position: 'sticky', left: 0, width: 400, minWidth: 400, maxWidth: 400, zIndex: 2, background: 'var(--c-surface)' },
          '& th.bom-name': { zIndex: 4, background: 'var(--c-surface-2)' },
          '& .bom-data': { width: 145, minWidth: 145, maxWidth: 145, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' },
          '& .bom-small': { width: 88, minWidth: 88, maxWidth: 88 },
        }}>
        <thead><tr>{columns.map((col, i) => <th key={col.code} scope="col" className={i === 0 ? 'bom-name' : i < 3 ? 'bom-small' : 'bom-data'}>
          {col.name}{'unit' in col && col.unit && <Typography component="span" sx={{ display: 'block', fontSize: 10, color: 'var(--c-text-3)' }}>{col.unit}</Typography>}
        </th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => {
          const n = row.node, mark = markOf(row), marker = drop?.key === n.key ? drop : null;
          return <tr key={n.key} aria-level={n.depth + 1} aria-expanded={row.hasChildren ? row.open : undefined}
            onDragOver={(e) => {
              if (!drag) return;
              const rect = e.currentTarget.getBoundingClientRect(), fraction = (e.clientY - rect.top) / rect.height;
              const position = fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside';
              const refusal = dropRefusal(drag, row, position);
              if (!refusal) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
              setDrop({ key: n.key, position, refusal });
            }}
            onDrop={(e) => { e.preventDefault(); if (drag && marker && !marker.refusal) { onMove(drag, row, marker.position); setAnchor(null); setExtent(null); } setDrop(null); setDrag(null); }}>
            {columns.map((col, colIndex) => {
              const at = { row: rowIndex, col: colIndex }, c = cellAt(at), editing = same(editor?.at ?? null, at), active = selected(at);
              const changed = col.code === '$quantity' ? !!row.paste || (n.lineId != null && n.lineId in pending.quantity) : col.code in (pending.values?.[n.id] ?? {});
              return <Box component="td" key={col.code} role="gridcell" data-cell={`${rowIndex}:${colIndex}`} className={colIndex === 0 ? 'bom-name' : colIndex < 3 ? 'bom-data bom-small' : 'bom-data'}
                tabIndex={same(anchor, at) || (!anchor && rowIndex === 0 && colIndex === 0) ? 0 : -1} aria-selected={active} aria-readonly={!c.editable}
                title={c.why ?? c.text} onClick={(e) => { if ((e.target as HTMLElement).closest('button, input, select, a')) return; choose(at, e.shiftKey); e.currentTarget.focus(); }}
                onPointerDown={(e) => { if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, a')) return; selecting.current = true; choose(at, e.shiftKey); }}
                onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button, input, select, a')) begin(at); }}
                onPointerEnter={(e) => { if (e.buttons === 1 && selecting.current && !drag && !editor && anchor) setExtent(at); }}
                onKeyDown={(e) => { if (!(e.target as HTMLElement).closest('input, select, button')) onKey(e, at); }}
                sx={{ cursor: colIndex === 0 ? 'default' : 'cell', color: c.editable || colIndex === 0 ? 'var(--c-text)' : 'var(--c-text-3)',
                  background: active ? 'var(--c-primary-50) !important' : changed ? 'var(--c-warning-50)' : c.editable || colIndex === 0 ? 'var(--c-surface)' : 'var(--c-surface-2)',
                  boxShadow: marker ? `inset 0 ${marker.position === 'after' ? '-3px' : '3px'} 0 ${marker.refusal ? 'var(--c-danger-600)' : 'var(--c-primary-600)'}` : undefined,
                  outline: same(anchor, at) ? '2px solid var(--c-primary-600)' : undefined,
                }}>
                {colIndex === 0 ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  {canEdit(row) && row.parent ? <Tooltip title="Drag to move · click for move options"><IconButton size="small" draggable={!busy} disabled={busy}
                    aria-label={`Move ${n.name}`} onClick={() => { setMoveDialog(row); setMoveTarget(''); setMovePosition('before'); }}
                    onDragStart={(e) => { setDrag(row); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.key); }}
                    onDragEnd={() => { setDrag(null); setDrop(null); }} sx={{ cursor: 'grab', width: 32, height: 40 }}><DragIndicatorRounded fontSize="small" /></IconButton></Tooltip> : <Box sx={{ width: 32, flexShrink: 0 }} />}
                  <Box sx={{ ml: Math.min(n.depth, 7) * 1.25, display: 'flex', minWidth: 0, alignItems: 'center', flex: 1 }}>
                    <IconButton size="small" disabled={!row.hasChildren} aria-label={`${row.open ? 'Collapse' : 'Expand'} ${n.name}`} onClick={() => onToggle(n.key)} sx={{ width: 28, height: 40, visibility: row.hasChildren ? 'visible' : 'hidden' }}>{row.open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton>
                    <Box sx={{ minWidth: 0, flex: 1 }}><Box sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}{n.role ? ` · ${n.role}` : ''}</Box>
                      <Box sx={{ fontSize: 10, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={placeholderOf(row)?.title}>{row.paste ? `New copy${row.paste.source.children.length ? ' with children' : ''} · save to edit values` : placeholderOf(row)?.code ?? (n.kind === 'temporary' ? '' : n.code ?? '')}{mark && !row.paste ? ` · ${mark.label}` : ''}</Box>
                      {flowCell(row)}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>{trailingCell(row)}</Box>
                  {marker && <Box component="span" sx={{ position: 'absolute', right: 8, top: 0, zIndex: 5, fontSize: 10, background: 'var(--c-surface-2)', color: marker.refusal ? 'var(--c-danger-600)' : 'var(--c-primary-700)' }}>{marker.refusal ?? (marker.position === 'inside' ? `Into ${n.name}` : marker.position === 'before' ? 'Before this row' : 'After this row')}</Box>}
                </Box> : editing && editor ? <Box
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endingEdit.current = true; setEditor(null); focus(at); }
                    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); commit(); const next = { row: Math.min(rows.length - 1, at.row + (e.key === 'Enter' ? 1 : 0)), col: Math.min(columns.length - 1, Math.max(0, at.col + (e.key === 'Tab' ? e.shiftKey ? -1 : 1 : 0))) }; choose(next); focus(next); }
                  }}>
                  {c.type === 'option' || c.type === 'boolean' ? <select autoFocus value={editor.text} aria-label={col.name} onChange={(e) => setEditor({ at, text: e.target.value })} style={{ width: '100%', minHeight: 32 }}>
                    <option value="" />{c.type === 'boolean' ? <><option value="true">Yes</option><option value="false">No</option></> : c.options?.map((o) => <option key={o.id} value={o.id}>{o.label || o.value}</option>)}
                  </select> : <input autoFocus type={c.type === 'date' ? 'date' : 'text'} inputMode={c.type === 'number' ? 'decimal' : undefined} aria-label={col.name} value={editor.text} onChange={(e) => setEditor({ at, text: e.target.value })} style={{ width: '100%', minHeight: 32, boxSizing: 'border-box', font: 'inherit', color: 'var(--c-text)', background: 'var(--c-surface)', border: 0, outline: 0 }} />}
                </Box> : c.text || (c.editable ? '' : '—')}
              </Box>;
            })}
          </tr>;
        })}</tbody>
      </Box>
      {footer}
    </Box>
    <Typography sx={{ mt: 0.75, fontSize: 11, color: 'var(--c-text-3)' }}>Click a cell to select · Ctrl+C / Ctrl+V to copy and paste · Double-click or Enter to edit · Shift-click selects a block · Drag the handle to move a row</Typography>
    <Dialog open={!!moveDialog} onClose={() => setMoveDialog(null)} fullWidth maxWidth="sm">
      <DialogTitle>Move {moveDialog?.node.name}<IconButton aria-label="Close move options" onClick={() => setMoveDialog(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRounded /></IconButton></DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '16px !important' }}>
        <TextField select label="Position" value={movePosition} onChange={(e) => setMovePosition(e.target.value as DropPosition)}><MenuItem value="before">Before</MenuItem><MenuItem value="after">After</MenuItem><MenuItem value="inside">Inside, as its last child</MenuItem></TextField>
        <TextField select label="Row" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>{rows.map((r) => <MenuItem key={r.node.key} value={r.node.key}>{'— '.repeat(r.node.depth)}{r.node.name}{r.node.role ? ` · ${r.node.role}` : ''}</MenuItem>)}</TextField>
        {moveTarget && moveWhy && <Alert severity="info">{moveWhy}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setMoveDialog(null)}>Cancel</Button><Button variant="contained" disabled={!!moveWhy || busy} onClick={() => { if (moveDialog && targetRow) onMove(moveDialog, targetRow, movePosition); setMoveDialog(null); }}>Move row</Button></DialogActions>
    </Dialog>
  </>;
}
