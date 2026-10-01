import { useMemo, useRef, useState, type RefObject, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { SheetGrid, type SheetCell, type SheetGridHandle, type SheetWrite } from '@shared/ui';
import { effectiveCell, type ValuesColumn, type ValuesView } from '../Values/valuesModel';
import { ownInput, valueEditable, rowLabel, type BomRow, type Pending } from './bomModel';
import type { SpecValues } from './useSpecValues';
import type { RowMark } from './BomTree';
import type { DropPosition } from './bomArrangement';

export interface GridWrite { row: BomRow; code: string; text: string; saved: string }
type Cell = { text: string; input: string; saved: string; editable: boolean; why?: string; applies?: boolean; type?: string; options?: { id: number; value: string; label?: string | null }[] };

/** The BOM around the shared SheetGrid: SheetGrid owns selection, clipboard and
 * the editor; this owns what a BOM cell means, plus row drag/drop and moving. */
export function BomGrid({ rows, view, records: recordValues, recordIds, pending, busy, canEdit, canEditValues, onToggle, onWrites, onMove, dropRefusal, trailingCell, flowCell, markOf, placeholderOf, roleOf, canEditRole, onRole, onlyUsedColumns, footer, gaps, handleRef }: {
  rows: BomRow[]; view: ValuesView | null; pending: Pending; busy: boolean; canEdit: (row: BomRow) => boolean;
  records?: SpecValues; recordIds?: number[]; canEditValues: (row: BomRow) => boolean;
  onToggle: (key: string) => void; onWrites: (writes: GridWrite[]) => void;
  onMove: (row: BomRow, target: BomRow, position: DropPosition) => void;
  dropRefusal: (row: BomRow, target: BomRow, position: DropPosition) => string | null;
  trailingCell: (row: BomRow) => ReactNode; flowCell: (row: BomRow) => ReactNode;
  markOf: (row: BomRow) => RowMark | null;
  placeholderOf: (row: BomRow) => { code: string; title: string } | null;
  /** The description shown after the dot: a typed one wins over the saved one. */
  roleOf?: (row: BomRow) => string | null;
  /** Whether the description may be edited on this row. */
  canEditRole?: (row: BomRow) => boolean;
  onRole?: (row: BomRow, text: string) => void;
  /** "cut from 25 × 500 × 11650" for a part whose automatic cut pieces are hidden. */
  /** Show a column only if some row on screen can use it. */
  onlyUsedColumns?: boolean;
  footer?: ReactNode;
  /** Values stage: the spec codes still missing on each record (by record id). Those cells turn amber and the row says how many. */
  gaps?: ReadonlyMap<number, string[]>;
  /** The grid's handle, for a screen that jumps to a cell. */
  handleRef?: RefObject<SheetGridHandle | null>;
}) {
  const ownHandle = useRef<SheetGridHandle>(null);
  const grid = handleRef ?? ownHandle;
  const [drag, setDrag] = useState<BomRow | null>(null);
  const [drop, setDrop] = useState<{ key: string; position: DropPosition; refusal: string | null } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ key: string; text: string } | null>(null);
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
  /** Whether a row can hold this variable at all — the same lookups cellAt makes, without building the cell. */
  const uses = (row: BomRow, code: string): boolean => {
    if (recordValues) return !!recordValues.get(row.node.id)?.resolution?.specs.some((s) => s.applicable && s.spec.code === code);
    const info = catalog.records.get(row.node.id);
    return !!info?.columns.get(code) && !!info.row.cells[code];
  };
  const loaded = !!recordValues || !!view;
  const shown = onlyUsedColumns && loaded ? catalog.cols.filter((c) => rows.some((r) => uses(r, c.code))) : catalog.cols;
  const columns = [{ code: '$quantity', name: 'Quantity' }, { code: '$total', name: 'Total' }, ...shown];
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.node.key, r])), [rows]);
  const colByKey = new Map(columns.map((c) => [c.code, c]));
  /** The tooltip of a cell whose variable the row's definition or item does not have. */
  const notOf = (row: BomRow) => `Not a value of ${row.node.name}`;
  const cellAt = (row: BomRow, col: { code: string }): Cell => {
    if (col.code === '$total') return { text: String(row.node.total), input: String(row.node.total), saved: '', editable: false, why: 'Calculated from the quantities above this row.' };
    if (col.code === '$quantity') {
      const text = row.paste?.quantity ?? (row.node.lineId == null ? undefined : pending.quantity[row.node.lineId]) ?? String(row.node.quantity);
      return { text, input: text, saved: String(row.paste?.source.quantity ?? row.node.quantity), editable: !busy && !!row.parent && canEdit(row), type: 'number' };
    }
    if (recordValues) {
      const entry = recordValues.get(row.node.id), resolution = entry?.resolution;
      const s = resolution?.specs.find((spec) => spec.applicable && spec.spec.code === col.code);
      if (resolution && !s) return { text: '', input: '', saved: '', editable: false, applies: false, why: notOf(row) };
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
    if (view && info && (!actual || !raw)) return { text: '', input: '', saved: '', editable: false, applies: false, why: notOf(row) };
    if (!view || !info || !actual || !raw) return { text: '', input: '', saved: '', editable: false, why: view ? 'This variable does not apply to this row.' : 'Loading values…' };
    const c = effectiveCell(view, actual, info.row, raw, !busy && !row.paste && canEditValues(row));
    const input = pending.values?.[row.node.id]?.[col.code] ?? c.input;
    const text = input === '' ? c.defaultDisplay ?? c.display ?? ''
      : actual.dataType === 'option' ? c.options?.find((o) => String(o.id) === input)?.label || c.options?.find((o) => String(o.id) === input)?.value || input
        : actual.dataType === 'boolean' ? input === 'true' ? 'Yes' : 'No' : input;
    return { text, input, saved: c.input, editable: c.editable, type: actual.dataType, options: c.options,
      why: row.paste ? 'Save this copy to edit its own values.' : info.row.readOnly ?? c.why ?? (c.missing ? 'Required value is missing.' : undefined) };
  };
  const sheetCell = (row: BomRow, col: { code: string }): SheetCell => {
    const c = cellAt(row, col), n = row.node;
    // Does not apply: low-light, not editable, and never flagged missing — different from a required value that is empty.
    if (c.applies === false) return { text: '', applies: false, editable: false, why: c.why, title: c.why };
    const changed = col.code === '$quantity' ? !!row.paste || (n.lineId != null && n.lineId in pending.quantity) : col.code in (pending.values?.[n.id] ?? {});
    const gap = !!gaps?.get(n.id)?.includes(col.code);
    return { text: c.text, input: c.input, editable: c.editable, why: gap ? (c.why ?? 'Required value is missing.') : c.why, tone: changed ? 'warning' : 'normal', tint: gap && !changed ? 'var(--c-warning-200)' : undefined,
      kind: c.type === 'number' ? 'number' : c.type === 'option' ? 'option' : c.type === 'boolean' ? 'bool' : c.type === 'date' ? 'date' : 'text',
      options: c.options?.map((o) => ({ value: String(o.id), label: o.label || o.value })), title: gap ? `Missing — ${c.why ?? 'a required value'}` : c.why ?? c.text };
  };
  const onSheetWrites = (writes: SheetWrite[]) => onWrites(writes.flatMap((w) => {
    const row = rowByKey.get(w.rowKey), col = colByKey.get(w.colKey);
    return row && col ? [{ row, code: col.code, text: w.text, saved: cellAt(row, col).saved }] : [];
  }));
  const startRole = (row: BomRow) => setRoleEdit({ key: row.node.key, text: roleOf?.(row) ?? row.node.role ?? '' });
  const finishRole = (row: BomRow, save: boolean) => {
    if (save && roleEdit && roleEdit.key === row.node.key) onRole?.(row, roleEdit.text);
    setRoleEdit(null);
  };
  const targetRow = rows.find((r) => r.node.key === moveTarget);
  const moveWhy = moveDialog && targetRow ? dropRefusal(moveDialog, targetRow, movePosition) : 'Choose a destination.';

  return <>
    <SheetGrid ref={grid} ariaLabel="BOM spreadsheet" busy={busy || (!view && !recordValues)} footer={footer}
      cornerHeader="BOM line" rowHeaderWidth={400} rowHeight={46}
      hint="Click a cell to select · Ctrl+C / Ctrl+V to copy and paste · Double-click or Enter to edit · Shift-click selects a block · Drag the handle to move a row"
      columns={columns.map((col, i) => ({ key: col.code, label: col.name, width: i < 2 ? 88 : 145, header: <>
        {col.name}{'unit' in col && col.unit && <Typography component="span" sx={{ display: 'block', fontSize: 10, color: 'var(--c-text-3)' }}>{col.unit}</Typography>}
      </> }))}
      rows={rows.map((row) => {
        const n = row.node, mark = markOf(row), marker = drop?.key === n.key ? drop : null;
        const roleText = roleOf ? roleOf(row) : n.role, roleEditable = !!canEditRole?.(row) && !!onRole;
        return { key: n.key, label: n.name, depth: n.depth, collapsible: row.hasChildren, collapsed: !row.open,
          lead: canEdit(row) && row.parent ? <Tooltip title="Drag to move · click for move options"><IconButton size="small" draggable={!busy} disabled={busy}
            aria-label={`Move ${n.name}`} onClick={() => { setMoveDialog(row); setMoveTarget(''); setMovePosition('before'); }}
            onDragStart={(e) => { setDrag(row); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.key); }}
            onDragEnd={() => { setDrag(null); setDrop(null); }} sx={{ cursor: 'grab', width: 32, height: 40 }}><DragIndicatorRounded fontSize="small" /></IconButton></Tooltip> : <Box sx={{ width: 32, flexShrink: 0 }} />,
          header: <>
            {roleEdit?.key === n.key ? (
              <Box component="input" autoFocus aria-label={`Description of ${n.name}`} value={roleEdit.text} maxLength={100} placeholder="Description, e.g. Girder G2"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRoleEdit({ key: n.key, text: e.target.value })}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { e.stopPropagation(); if (e.key === 'Enter') finishRole(row, true); else if (e.key === 'Escape') finishRole(row, false); }}
                onBlur={() => finishRole(row, true)}
                onClick={(e: MouseEvent) => e.stopPropagation()} onDoubleClick={(e: MouseEvent) => e.stopPropagation()} onMouseDown={(e: MouseEvent) => e.stopPropagation()}
                onCopy={(e: ClipboardEvent) => e.stopPropagation()} onPaste={(e: ClipboardEvent) => e.stopPropagation()}
                sx={{ width: '100%', font: 'inherit', fontSize: 12, p: '1px 4px', border: '1px solid var(--c-primary-400)', borderRadius: 'var(--r-sm)', background: 'var(--c-surface)', color: 'var(--c-text)' }} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
                <Box onDoubleClick={roleEditable ? () => startRole(row) : undefined} title={roleEditable ? 'Double-click to change the description' : undefined}
                  sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{rowLabel(n.name, roleText)}</Box>
                {roleEditable && <Tooltip title="Change the description"><IconButton size="small" aria-label={`Edit description of ${n.name}`} onClick={() => startRole(row)} sx={{ p: 0.25, color: 'var(--c-text-3)' }}><EditOutlined sx={{ fontSize: 14 }} /></IconButton></Tooltip>}
              </Box>
            )}
            <Box sx={{ fontSize: 10, color: 'var(--c-text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={placeholderOf(row)?.title}>{row.paste ? `New copy${row.paste.source.children.length ? ' with children' : ''} · Save to edit this copy` : placeholderOf(row)?.code ?? (n.kind === 'temporary' ? '' : n.code ?? '')}{mark && !row.paste ? ` · ${mark.label}` : ''}</Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              {flowCell(row)}
              {(gaps?.get(n.id)?.length ?? 0) > 0 && <Box component="span" data-testid="row-gaps" title={`Required values still empty: ${gaps?.get(n.id)?.join(', ')}`}
                sx={{ fontSize: 10.5, fontWeight: 600, px: 0.75, borderRadius: 'var(--r-sm)', background: 'var(--c-warning-200)', color: 'var(--c-warning-800)', whiteSpace: 'nowrap' }}>{gaps?.get(n.id)?.length} missing</Box>}
            </Box>
          </>,
          trail: <>
            <Box sx={{ display: 'flex', flexShrink: 0 }}>{trailingCell(row)}</Box>
            {marker && <Box component="span" sx={{ position: 'absolute', right: 8, top: 0, zIndex: 5, fontSize: 10, background: 'var(--c-surface-2)', color: marker.refusal ? 'var(--c-danger-600)' : 'var(--c-primary-700)' }}>{marker.refusal ?? (marker.position === 'inside' ? `Into ${n.name}` : marker.position === 'before' ? 'Before this row' : 'After this row')}</Box>}
          </> };
      })}
      cellAt={(rowKey, colKey) => { const row = rowByKey.get(rowKey), col = colByKey.get(colKey); return row && col ? sheetCell(row, col) : { text: '' }; }}
      onWrites={onSheetWrites} onToggleRow={onToggle}
      rowProps={(key) => {
        const row = rowByKey.get(key);
        if (!row) return undefined;
        return {
          onDragOver: (e) => {
            if (!drag) return;
            const rect = e.currentTarget.getBoundingClientRect(), fraction = (e.clientY - rect.top) / rect.height;
            const position = fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside';
            const refusal = dropRefusal(drag, row, position);
            if (!refusal) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
            setDrop({ key, position, refusal });
          },
          onDrop: (e) => {
            e.preventDefault();
            if (drag && drop?.key === key && !drop.refusal) { onMove(drag, row, drop.position); grid.current?.clearSelection(); }
            setDrop(null); setDrag(null);
          },
        };
      }}
      rowSx={(key) => drop?.key === key ? { '& > td': { boxShadow: `inset 0 ${drop.position === 'after' ? '-3px' : '3px'} 0 ${drop.refusal ? 'var(--c-danger-600)' : 'var(--c-primary-600)'}` } } : undefined} />
    <Dialog open={!!moveDialog} onClose={() => setMoveDialog(null)} fullWidth maxWidth="sm">
      <DialogTitle>Move {moveDialog?.node.name}<IconButton aria-label="Close move options" onClick={() => setMoveDialog(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseRounded /></IconButton></DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '16px !important' }}>
        <TextField select label="Position" value={movePosition} onChange={(e) => setMovePosition(e.target.value as DropPosition)}><MenuItem value="before">Before</MenuItem><MenuItem value="after">After</MenuItem><MenuItem value="inside">Inside, as its last child</MenuItem></TextField>
        <TextField select label="Row" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}>{rows.map((r) => <MenuItem key={r.node.key} value={r.node.key}>{'— '.repeat(r.node.depth)}{rowLabel(r.node.name, r.node.role)}</MenuItem>)}</TextField>
        {moveTarget && moveWhy && <Alert severity="info">{moveWhy}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setMoveDialog(null)}>Cancel</Button><Button variant="contained" disabled={!!moveWhy || busy} onClick={() => { if (moveDialog && targetRow) onMove(moveDialog, targetRow, movePosition); setMoveDialog(null); }}>Move row</Button></DialogActions>
    </Dialog>
  </>;
}
