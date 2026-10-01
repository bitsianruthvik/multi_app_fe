import {
  useEffect, useImperativeHandle, useMemo, useRef, useState,
  type ClipboardEvent, type HTMLAttributes, type KeyboardEvent, type ReactNode, type Ref,
} from 'react';
import { Alert, Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';

/**
 * SheetGrid — the Excel-like grid. It exists so a screen that wants "type over
 * a number, paste a block from Excel, drag to select" gets all of it, and the
 * same keys, from one place. Without it every grid re-implements selection,
 * clipboard and the editor slightly differently and users learn each one.
 *
 * The grid knows nothing about what a cell means. The screen supplies
 * `cellAt(rowKey, colKey)` and receives `onWrites` with the cells to change.
 * Nothing is written by the grid itself; a paste is refused whole if any
 * target cell is read-only.
 */

export type SheetOption = string | { value: string; label: string };

export type SheetCell = {
  /** What is shown (and copied). */
  text: string;
  editable?: boolean;
  /** Tooltip / message when the cell is not editable. */
  why?: string;
  /** muted = computed (grey) · strong = typed over (semibold) · blank = no box, never written. */
  tone?: 'normal' | 'muted' | 'strong' | 'warning' | 'blank';
  /** bool cells edit as Yes/No and write 'true' / 'false'; option cells write the option's value. */
  kind?: 'text' | 'number' | 'date' | 'option' | 'bool';
  options?: SheetOption[];
  /** Tiny corner marker (e.g. an override dot). */
  mark?: ReactNode;
  title?: string;
  /**
   * false = this cell does not APPLY to its row (a spec the row's item lacks, an operation not in its flow). Drawn
   * low-light (hatched, no text), never editable, skipped by Tab / Enter-to-next, paste and fill (reported as "don't
   * apply", not as read-only). Different from `editable: false` (applies, but cannot be typed) and from a missing
   * value (applies, is empty). `why` is the tooltip ("Not a value of Web plate"). Default: applies.
   */
  applies?: boolean;
  /** A soft background for this cell (a CSS colour, ideally a token mix) — e.g. one tint per contractor. Selection still wins. */
  tint?: string;
  /** What the editor starts with when it differs from `text` (an option's value, say). Default: `text`. */
  input?: string;
  /**
   * The text that, written back, puts this cell back as it was. Undo uses it: the grid reads
   * `restore ?? text` BEFORE each write. A formula cell restores to '' so undo clears the
   * override instead of typing the formula's value. Default: `text`.
   */
  restore?: string;
};

/** text '' = clear. For option cells `text` is the option's value; for bool cells 'true' / 'false'. */
export type SheetWrite = { rowKey: string; colKey: string; text: string };
/** Selected keys, in display order. */
export type SheetRange = { rows: string[]; cols: string[] };

export interface SheetRow {
  key: string;
  depth?: number;
  header: ReactNode;
  /** Plain text for messages and aria labels. Default: the key. */
  label?: string;
  collapsible?: boolean;
  collapsed?: boolean;
  /** Rendered before the indent and chevron (a drag handle, a checkbox). */
  lead?: ReactNode;
  /** Rendered at the far end of the row header (counts, actions). */
  trail?: ReactNode;
}

export interface SheetColumn {
  key: string;
  header: ReactNode;
  label?: string;
  width?: number;
  align?: 'left' | 'right';
}

export interface SheetGridHandle {
  clearSelection: () => void;
  /** Select one cell and scroll it into view. Returns false when the row or column is not on screen. */
  selectCell: (rowKey: string, colKey: string) => boolean;
  /** Undo / redo the last write batch (same as Ctrl+Z / Ctrl+Y). Return whether anything was applied. */
  undo: () => boolean;
  redo: () => boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface SheetGridProps {
  rows: SheetRow[];
  columns: SheetColumn[];
  cellAt: (rowKey: string, colKey: string) => SheetCell;
  onWrites?: (writes: SheetWrite[]) => void;
  onSelectionChange?: (sel: SheetRange) => void;
  onToggleRow?: (rowKey: string) => void;
  /** Clicking a ROW HEADER selects these rows (e.g. a whole subtree). Default: just that row. */
  rowSelect?: (rowKey: string) => string[];
  stickyHeader?: boolean;
  /** Default true. */
  frozenFirstColumn?: boolean;
  footer?: ReactNode;
  // ── small generic extras ──
  /** Called with a refusal or hint. Without it the grid shows the message itself, above the table. */
  onProblem?: (message: string | null) => void;
  /** Text in the top-left corner cell. */
  cornerHeader?: ReactNode;
  /** Width of the frozen first column. On a narrow window it is capped at half the screen so the data columns stay reachable. */
  rowHeaderWidth?: number;
  /**
   * Default true. Below 600 px (a phone) the grid is shown read-only with a one-line note: typing, pasting and
   * dragging in a tiny grid is a broken editor, and an honest "easier on a wider screen" is not.
   */
  narrowReadOnly?: boolean;
  rowHeight?: number;
  ariaLabel?: string;
  busy?: boolean;
  /** The line under the grid. Pass null to hide it. */
  hint?: ReactNode;
  /** Extra attributes per row (drag and drop, test hooks). */
  rowProps?: (rowKey: string) => HTMLAttributes<HTMLTableRowElement> | undefined;
  /** Extra styling per row, applied to the <tr>; address cells as '& > td'. */
  rowSx?: (rowKey: string) => SxProps<Theme> | undefined;
  /** When this changes (another line, another view) the undo history resets. */
  historyKey?: string;
  onHistoryChange?: (h: { canUndo: boolean; canRedo: boolean }) => void;
  ref?: Ref<SheetGridHandle>;
}

type HistoryItem = { rowKey: string; colKey: string; before: string; after: string };
const HISTORY_LIMIT = 50;

type Point = { row: number; col: number };
const same = (a: Point | null, b: Point) => a?.row === b.row && a.col === b.col;
const INTERACTIVE = 'button, input, select, a, [draggable="true"]';
const optionValue = (o: SheetOption) => (typeof o === 'string' ? o : o.value);
const optionLabel = (o: SheetOption) => (typeof o === 'string' ? o : o.label || o.value);

type OptionMatch = { option: SheetOption } | { ambiguous: string[] } | null;
/**
 * Forgiving option matching: exact value or label (case-insensitive), else a label/value that STARTS WITH the
 * text followed by a non-alphanumeric character or the end ("BO" → "BO — no impact test"), else a unique option
 * that contains the text as a whole word. Several candidates at a step → ambiguous (the labels are returned).
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper, exported for the tests and screens that validate options
export function matchOption(options: SheetOption[] | undefined, raw: string): OptionMatch {
  const text = raw.trim().toLowerCase();
  if (!options || !text) return null;
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = options.find((o) => [optionValue(o), optionLabel(o)].some((x) => x.toLowerCase() === text));
  if (exact) return { option: exact };
  for (const re of [new RegExp(`^${esc}(?:[^a-z0-9]|$)`, 'i'), new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, 'i')]) {
    const hits = options.filter((o) => re.test(optionLabel(o)) || re.test(optionValue(o)));
    if (hits.length === 1) return { option: hits[0] };
    if (hits.length > 1) return { ambiguous: hits.map(optionLabel) };
  }
  return null;
}
const refusal = (text: string, colName: string, m: OptionMatch) =>
  m && 'ambiguous' in m ? `“${text}” could be ${m.ambiguous.map((l) => `“${l}”`).join(' or ')} in ${colName}. Type more of it.` : `“${text}” is not an allowed ${colName}.`;

/** The note shown instead of an editor on a phone-width window. */
export const SHEET_GRID_NARROW_NOTE = 'Editing this is easier on a wider screen';
export const SHEET_GRID_NARROW_QUERY = '(max-width:599.95px)';

export const SHEET_GRID_HINT = 'Click a cell to select · Ctrl+C / Ctrl+V to copy and paste · Ctrl+D / Ctrl+R to fill down / right · Ctrl+Z to undo · Double-click or Enter to edit · Shift-click or drag selects a block · Click a header to select a whole column or row';

export function SheetGrid({
  rows, columns, cellAt: cellAtRaw, onWrites, onSelectionChange, onToggleRow, rowSelect, stickyHeader = true, frozenFirstColumn = true, footer,
  onProblem, cornerHeader, rowHeaderWidth = 220, rowHeight = 32, ariaLabel = 'Spreadsheet', busy, hint, rowProps, rowSx, historyKey, onHistoryChange, narrowReadOnly = true, ref,
}: SheetGridProps) {
  const narrow = useMediaQuery(SHEET_GRID_NARROW_QUERY, { noSsr: true });
  const readOnly = narrowReadOnly && narrow;
  const cellAt = (rowKey: string, colKey: string): SheetCell => {
    const c = cellAtRaw(rowKey, colKey);
    return readOnly && c.editable ? { ...c, editable: false, why: SHEET_GRID_NARROW_NOTE } : c;
  };
  const table = useRef<HTMLTableElement>(null);
  const selecting = useRef(false);
  const endingEdit = useRef(false);
  const typed = useRef(''), typedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReported = useRef('');
  const [anchor, setAnchor] = useState<Point | null>(null), [extent, setExtent] = useState<Point | null>(null);
  const [editor, setEditor] = useState<{ at: Point; text: string } | null>(null);
  const [inline, setInline] = useState<string | null>(null);
  const problem = (message: string | null) => { if (onProblem) onProblem(message); else setInline(message); };
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.key, i])), [rows]);
  const anyCollapsible = rows.some((r) => r.collapsible !== undefined);

  const undoStack = useRef<HistoryItem[][]>([]);
  const redoStack = useRef<HistoryItem[][]>([]);
  const lastHistory = useRef('0:0');
  const notifyHistory = () => {
    const h = { canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 };
    const sig = `${+h.canUndo}:${+h.canRedo}`;
    if (sig === lastHistory.current) return;
    lastHistory.current = sig; onHistoryChange?.(h);
  };
  const seenKey = useRef(historyKey);
  useEffect(() => {
    if (seenKey.current === historyKey) return;
    seenKey.current = historyKey; undoStack.current = []; redoStack.current = []; notifyHistory();
  });
  const live = useRef({ undo: (): boolean => false, redo: (): boolean => false });
  const goTo = useRef<(rowKey: string, colKey: string) => boolean>(() => false);
  goTo.current = (rowKey, colKey) => {
    const r = rowIndex.get(rowKey), c = columns.findIndex((x) => x.key === colKey);
    if (r === undefined || c < 0) return false;
    setAnchor({ row: r, col: c }); setExtent({ row: r, col: c });
    setTimeout(() => focus({ row: r, col: c }), 0);
    return true;
  };
  useImperativeHandle(ref, () => ({
    clearSelection: () => { setAnchor(null); setExtent(null); },
    selectCell: (rowKey, colKey) => goTo.current(rowKey, colKey),
    undo: () => live.current.undo(), redo: () => live.current.redo(),
    get canUndo() { return undoStack.current.length > 0; }, get canRedo() { return redoStack.current.length > 0; },
  }), []);
  const lookup = (rowKey: string, colKey: string): SheetCell | null => {
    if (!rowIndex.has(rowKey) || !columns.some((c) => c.key === colKey)) return null;
    return cellAt(rowKey, colKey);
  };
  /** Every write the grid makes goes through here: record the restore text first, then emit. */
  const emit = (writes: SheetWrite[]) => {
    if (!writes.length) return;
    const entry: HistoryItem[] = writes.map((w) => {
      const c = cellAt(w.rowKey, w.colKey);
      return { rowKey: w.rowKey, colKey: w.colKey, before: c.restore ?? c.text, after: w.text };
    });
    undoStack.current = [...undoStack.current, entry].slice(-HISTORY_LIMIT); redoStack.current = [];
    onWrites?.(writes); notifyHistory();
  };
  const travel = (from: { current: HistoryItem[][] }, to: { current: HistoryItem[][] }, field: 'before' | 'after'): boolean => {
    const entry = from.current[from.current.length - 1];
    if (!entry) return false;
    const writes: SheetWrite[] = [], skipped: string[] = [];
    for (const it of entry) {
      const c = lookup(it.rowKey, it.colKey);
      if (c && writable(c)) writes.push({ rowKey: it.rowKey, colKey: it.colKey, text: it[field] });
      else skipped.push(`${rows[rowIndex.get(it.rowKey) ?? -1]?.label ?? it.rowKey} · ${columns.find((k) => k.key === it.colKey)?.label ?? it.colKey}`);
    }
    if (!writes.length) { problem(`Nothing ${field === 'before' ? 'undone' : 'redone'}: ${skipped.join(', ')} ${skipped.length > 1 ? 'are' : 'is'} read-only now.`); return false; }
    from.current = from.current.slice(0, -1); to.current = [...to.current, entry].slice(-HISTORY_LIMIT);
    onWrites?.(writes);
    problem(skipped.length ? `${skipped.join(', ')} ${skipped.length > 1 ? 'were' : 'was'} read-only and left as is.` : null);
    notifyHistory(); return true;
  };
  const undo = () => !editor && travel(undoStack, redoStack, 'before');
  const redo = () => !editor && travel(redoStack, undoStack, 'after');
  live.current = { undo, redo };

  const cellOf = (at: Point): SheetCell => {
    const row = rows[at.row], col = columns[at.col];
    if (!row || !col) return { text: '', editable: false };
    return cellAt(row.key, col.key);
  };
  const isBlank = (c: SheetCell) => c.tone === 'blank';
  const isNa = (c: SheetCell) => c.applies === false;
  const writable = (c: SheetCell) => !!c.editable && !isBlank(c) && !isNa(c);
  /** The next cell in reading order (Tab) or down the column (Enter) that applies; null when there is none. */
  const nextApplying = (from: Point, step: (p: Point) => Point | null): Point | null => {
    for (let p = step(from); p; p = step(p)) if (!isNa(cellOf(p))) return p;
    return null;
  };
  const stepTab = (back: boolean) => (p: Point): Point | null => {
    let row = p.row, col = p.col + (back ? -1 : 1);
    if (col >= columns.length) { row++; col = 0; }
    if (col < 0) { row--; col = columns.length - 1; }
    return row < 0 || row >= rows.length ? null : { row, col };
  };
  const stepDown = (p: Point): Point | null => (p.row + 1 < rows.length ? { row: p.row + 1, col: p.col } : null);
  const naText = (n: number) => `${n} cell${n > 1 ? 's' : ''} ${n > 1 ? "don't" : "doesn't"} apply to ${n > 1 ? 'their' : 'its'} row and ${n > 1 ? 'were' : 'was'} skipped`;
  const bounds = () => {
    const a = anchor ?? { row: 0, col: 0 }, b = extent ?? a;
    return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row), left: Math.min(a.col, b.col), right: Math.max(a.col, b.col) };
  };
  const selected = (at: Point) => { const b = bounds(); return !!anchor && at.row >= b.top && at.row <= b.bottom && at.col >= b.left && at.col <= b.right; };
  const focus = (at: Point) => table.current?.querySelector<HTMLElement>(`[data-cell="${at.row}:${at.col + 1}"]`)?.focus();
  const choose = (at: Point, extend = false) => { if (!extend || !anchor) setAnchor(at); setExtent(at); };

  // Report the selection to the screen, but only when it really changes — the
  // screen may rebuild `rows` on every render, and must not be re-notified for that.
  useEffect(() => {
    if (!onSelectionChange) return;
    let sel: SheetRange = { rows: [], cols: [] };
    if (anchor) {
      const b = bounds();
      sel = { rows: rows.slice(b.top, b.bottom + 1).map((r) => r.key), cols: columns.slice(b.left, b.right + 1).map((c) => c.key) };
    }
    const sig = JSON.stringify(sel);
    if (sig === lastReported.current) return;
    lastReported.current = sig;
    onSelectionChange(sel);
  });

  const commit = (returnFocus = false) => {
    if (!editor || endingEdit.current) return;
    endingEdit.current = true;
    const c = cellOf(editor.at);
    if (writable(c)) {
      let text = editor.text;
      if (c.kind === 'option' && text !== '') {
        const m = matchOption(c.options, text);
        if (m && 'option' in m) text = optionValue(m.option);
        else { problem(refusal(text, columns[editor.at.col].label ?? columns[editor.at.col].key, m)); setEditor(null); if (returnFocus) focus(editor.at); return; }
      }
      emit([{ rowKey: rows[editor.at.row].key, colKey: columns[editor.at.col].key, text }]);
    }
    setEditor(null);
    if (returnFocus) focus(editor.at);
  };
  const begin = (at: Point, text?: string) => {
    const c = cellOf(at);
    if (!writable(c)) { if (c.why) problem(c.why); return; }
    endingEdit.current = false;
    choose(at); problem(null);
    let start = text ?? c.input ?? c.text;
    if (c.kind === 'option' && text !== undefined) { typed.current = text; const m = matchOption(c.options, text); if (m && 'option' in m) start = optionValue(m.option); }
    setEditor({ at, text: start });
  };
  const copy = (e: ClipboardEvent) => {
    if (editor || !anchor) return;
    const b = bounds(), lines: string[] = [];
    for (let row = b.top; row <= b.bottom; row++) {
      const line: string[] = [];
      for (let col = b.left; col <= b.right; col++) line.push(cellOf({ row, col }).text.replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
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
    if (height * width > 10000 || b.top + height > rows.length || b.left + width > columns.length) {
      problem('The pasted cells do not fit here. Select a smaller block or a different starting cell.'); return;
    }
    const writes: SheetWrite[] = []; let naSkipped = 0;
    for (let r = 0; r < height; r++) for (let k = 0; k < width; k++) {
      const at = { row: b.top + r, col: b.left + k }, c = cellOf(at);
      const colName = columns[at.col].label ?? columns[at.col].key;
      if (isNa(c)) { naSkipped++; continue; }
      if (!writable(c)) { problem(`Nothing pasted: ${rows[at.row].label ?? rows[at.row].key} · ${colName} is read-only or does not apply.`); return; }
      let text = (single ? data[0][0] : data[r]?.[k] ?? '').trim();
      if (c.kind === 'option' && text !== '') {
        const m = matchOption(c.options, text);
        if (!m || !('option' in m)) { problem(`Nothing pasted: ${refusal(text, colName, m)}`); return; }
        text = optionValue(m.option);
      }
      if (c.kind === 'bool' && text !== '') {
        if (/^(yes|true|1)$/i.test(text)) text = 'true';
        else if (/^(no|false|0)$/i.test(text)) text = 'false';
        else { problem('Nothing pasted: a Yes/No cell needs Yes or No.'); return; }
      }
      writes.push({ rowKey: rows[at.row].key, colKey: columns[at.col].key, text });
    }
    if (!writes.length && naSkipped) { problem(`Nothing pasted: ${naText(naSkipped)}.`); return; }
    emit(writes); problem(naSkipped ? `${naText(naSkipped)}.` : null); setExtent({ row: b.top + height - 1, col: b.left + width - 1 });
  };
  /** Ctrl+D / Ctrl+R: copy the first row (column) of the selection into the rest, as one history entry. */
  const fill = (dir: 'down' | 'right') => {
    const b = bounds(), down = dir === 'down';
    const span = down ? b.bottom - b.top : b.right - b.left;
    const srcLine = span === 0 ? (down ? b.top - 1 : b.left - 1) : (down ? b.top : b.left);
    if (srcLine < 0) { problem(`Nothing to fill ${dir}: select the cells to fill and the one to copy from.`); return; }
    const first = srcLine + 1, last = down ? b.bottom : b.right;
    const lo = down ? b.left : b.top, hi = down ? b.right : b.bottom;
    const writes: SheetWrite[] = []; let skipped = 0, naSkipped = 0;
    for (let k = lo; k <= hi; k++) {
      const src = cellOf(down ? { row: srcLine, col: k } : { row: k, col: srcLine });
      const value = isBlank(src) ? null : src.input ?? src.text;
      for (let i = first; i <= last; i++) {
        const at = down ? { row: i, col: k } : { row: k, col: i };
        if (isNa(cellOf(at))) { naSkipped++; continue; }
        if (value === null || !writable(cellOf(at))) { skipped++; continue; }
        writes.push({ rowKey: rows[at.row].key, colKey: columns[at.col].key, text: value });
      }
    }
    emit(writes);
    const notes = [skipped ? `${skipped} cell${skipped > 1 ? 's' : ''} skipped (read-only)` : '', naSkipped ? naText(naSkipped) : ''].filter(Boolean);
    problem(notes.length ? `${notes.join(' · ')}.` : null);
  };
  const onKey = (e: KeyboardEvent, at: Point) => {
    if (editor) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[dr]$/i.test(e.key)) {
      e.preventDefault(); fill(e.key.toLowerCase() === 'd' ? 'down' : 'right'); return;
    }
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] };
    if (e.key === 'Tab') {
      // Tab goes to the next cell that applies to its row; hatched cells are stepped over.
      const next = nextApplying(at, stepTab(e.shiftKey));
      e.preventDefault(); if (next) { choose(next); focus(next); } return;
    }
    if (delta[e.key]) {
      e.preventDefault();
      const [dr, dc] = delta[e.key];
      let row = at.row + dr, col = at.col + dc;
      if (e.key === 'Tab' && col >= columns.length) { row++; col = 0; }
      if (e.key === 'Tab' && col < 0) { row--; col = columns.length - 1; }
      const next = { row: Math.max(0, Math.min(rows.length - 1, row)), col: Math.max(0, Math.min(columns.length - 1, col)) };
      choose(next, e.shiftKey && e.key !== 'Tab'); focus(next); return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key)) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); begin(at); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); begin(at, e.key); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); const b = bounds(), writes: SheetWrite[] = [];
      for (let row = b.top; row <= b.bottom; row++) for (let col = b.left; col <= b.right; col++) {
        if (writable(cellOf({ row, col }))) writes.push({ rowKey: rows[row].key, colKey: columns[col].key, text: '' });
      }
      emit(writes);
    }
  };
  const selectColumn = (col: number, extend: boolean) => {
    if (!rows.length) return;
    const from = extend && anchor ? anchor.col : col;
    setAnchor({ row: 0, col: from }); setExtent({ row: rows.length - 1, col });
    focus({ row: 0, col });
  };
  const selectRow = (key: string) => {
    if (!columns.length) return;
    const idx = (rowSelect ? rowSelect(key) : [key]).map((k) => rowIndex.get(k)).filter((i): i is number => i != null);
    if (!idx.length) return;
    setAnchor({ row: Math.min(...idx), col: 0 }); setExtent({ row: Math.max(...idx), col: columns.length - 1 });
    focus({ row: Math.min(...idx), col: 0 });
  };

  const headSticky: Record<string, string | number> = stickyHeader ? { position: 'sticky', top: 0 } : {};
  const firstSticky: Record<string, string | number> = frozenFirstColumn ? { position: 'sticky', left: 0 } : {};

  const capped = (w: number) => `min(${w}px, 50vw)`;

  return <>
    {readOnly && rows.some((r) => columns.some((c) => cellAtRaw(r.key, c.key).editable)) && <Alert severity="info" role="note" data-testid="sheet-grid-narrow-note" sx={{ mb: 1 }}>{SHEET_GRID_NARROW_NOTE}</Alert>}
    {inline && <Alert severity="info" onClose={() => setInline(null)} sx={{ mb: 1 }}>{inline}</Alert>}
    <Box sx={{ overflow: 'auto', maxHeight: 'min(70vh, 720px)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
      <Box component="table" ref={table} role="grid" aria-label={ariaLabel} aria-busy={busy}
        onCopy={copy} onPaste={paste} onPointerUp={() => { selecting.current = false; }}
        sx={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%', tableLayout: 'fixed', fontSize: 12,
          '& th, & td': { borderRight: '1px solid var(--c-divider)', borderBottom: '1px solid var(--c-divider)' },
          '& th': { ...headSticky, zIndex: 3, background: 'var(--c-surface-2)', textAlign: 'left', py: 1, px: 1, fontWeight: 600, cursor: 'pointer' },
          '& td': { height: rowHeight, px: 1, outlineOffset: '-2px', '&:focus-visible': { outline: '2px solid var(--c-focus)' } },
          '& .sg-corner': { ...firstSticky, ...headSticky, zIndex: 4, width: capped(rowHeaderWidth), minWidth: capped(rowHeaderWidth), maxWidth: capped(rowHeaderWidth), cursor: 'default' },
          '& .sg-rowhead': { ...firstSticky, zIndex: 2, width: capped(rowHeaderWidth), minWidth: capped(rowHeaderWidth), maxWidth: capped(rowHeaderWidth), background: 'var(--c-surface)', cursor: 'default' },
          // A faint row emphasis on hover, on the cells that apply only; the hatched ones stay low.
          '& tbody tr:hover td.sg-data:not([data-na="true"])': { backgroundImage: 'linear-gradient(color-mix(in srgb, var(--c-primary-600) 6%, transparent), color-mix(in srgb, var(--c-primary-600) 6%, transparent))' },
          '& .sg-data': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', position: 'relative' },
        }}>
        <thead><tr>
          <th scope="col" className="sg-corner">{cornerHeader}</th>
          {columns.map((col, i) => <th key={col.key} scope="col" data-col={i} style={{ width: col.width ?? 145, minWidth: col.width ?? 145, maxWidth: col.width ?? 145, textAlign: col.align ?? 'left' }}
            onClick={(e) => { if ((e.target as HTMLElement).closest('button, input, select, a')) return; selectColumn(i, e.shiftKey); }}>{col.header}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, r) => {
          const extra = rowProps?.(row.key);
          return <Box component="tr" key={row.key} aria-level={(row.depth ?? 0) + 1} aria-expanded={row.collapsible ? !row.collapsed : undefined} {...extra}
            sx={rowSx?.(row.key)} data-row={row.key}>
            <Box component="td" role="rowheader" data-cell={`${r}:0`} className="sg-rowhead" tabIndex={-1}
              onClick={(e) => { if ((e.target as HTMLElement).closest(INTERACTIVE)) return; selectRow(row.key); }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {row.lead}
                <Box sx={{ ml: Math.min(row.depth ?? 0, 7) * 1.25, display: 'flex', minWidth: 0, alignItems: 'center', flex: 1 }}>
                  {anyCollapsible && <IconButton size="small" disabled={!row.collapsible} aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} ${row.label ?? row.key}`}
                    onClick={() => onToggleRow?.(row.key)} sx={{ width: 28, height: rowHeight - 6, visibility: row.collapsible ? 'visible' : 'hidden' }}>
                    {row.collapsed ? <ChevronRightRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
                  </IconButton>}
                  <Box sx={{ minWidth: 0, flex: 1 }}>{row.header}</Box>
                </Box>
                {row.trail}
              </Box>
            </Box>
            {columns.map((col, c) => {
              const at = { row: r, col: c }, cell = cellOf(at), editing = same(editor?.at ?? null, at), active = selected(at);
              const tone = cell.tone ?? 'normal', blank = tone === 'blank', can = writable(cell), na = isNa(cell);
              return <Box component="td" key={col.key} role="gridcell" data-cell={`${r}:${c + 1}`} className="sg-data" data-tone={tone} data-na={na ? 'true' : undefined}
                tabIndex={same(anchor, at) || (!anchor && r === 0 && c === 0) ? 0 : -1} aria-selected={active} aria-readonly={!can} aria-disabled={na || undefined}
                title={na ? cell.why ?? cell.title ?? 'Does not apply to this row' : cell.title ?? cell.why ?? cell.text} onClick={(e) => { if ((e.target as HTMLElement).closest('button, input, select, a')) return; choose(at, e.shiftKey); e.currentTarget.focus(); }}
                onPointerDown={(e) => { if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, a')) return; selecting.current = true; choose(at, e.shiftKey); }}
                onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button, input, select, a')) begin(at); }}
                onPointerEnter={(e) => { if (e.buttons === 1 && selecting.current && !editor && anchor) setExtent(at); }}
                onKeyDown={(e) => { if (!(e.target as HTMLElement).closest('input, select, button')) onKey(e, at); }}
                sx={{ cursor: 'cell', textAlign: col.align ?? 'left',
                  ...(na ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--c-text-3) 16%, transparent) 5px 6px)' } : {}),
                  color: tone === 'muted' || (!can && tone !== 'strong') ? 'var(--c-text-3)' : 'var(--c-text)',
                  fontWeight: tone === 'strong' ? 600 : undefined,
                  background: active ? 'var(--c-primary-50) !important' : na ? 'var(--c-surface-3)' : cell.tint && !blank ? cell.tint : tone === 'warning' ? 'var(--c-warning-50)' : blank ? 'var(--c-surface)' : can || tone === 'muted' || tone === 'strong' ? 'var(--c-surface)' : 'var(--c-surface-2)',
                  ...(blank ? { borderRightColor: 'transparent', borderBottomColor: 'transparent' } : {}),
                  outline: same(anchor, at) ? '2px solid var(--c-primary-600)' : undefined,
                }}>
                {cell.mark != null && <Box component="span" data-mark="" sx={{ position: 'absolute', top: 2, right: 2, lineHeight: 0, fontSize: 8, pointerEvents: 'none' }}>{cell.mark}</Box>}
                {editing && editor ? <Box
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endingEdit.current = true; setEditor(null); focus(at); }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault(); e.stopPropagation(); commit();
                      const next = e.key === 'Enter' ? nextApplying(at, stepDown) : nextApplying(at, stepTab(e.shiftKey));
                      if (next) { choose(next); focus(next); } else focus(at);
                    }
                  }}>
                  {cell.kind === 'option' || cell.kind === 'bool'
                    ? <select autoFocus value={editor.text} aria-label={col.label ?? col.key} onChange={(e) => setEditor({ at, text: e.target.value })} style={{ width: '100%', minHeight: 32 }}
                      onKeyDown={cell.kind === 'option' ? (e) => {
                        // Typing picks the forgiving match ("BO" → "BO — no impact test"); Enter then commits it.
                        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) { typed.current = ''; return; }
                        e.preventDefault(); typed.current += e.key;
                        if (typedTimer.current) clearTimeout(typedTimer.current);
                        typedTimer.current = setTimeout(() => { typed.current = ''; }, 1200);
                        const m = matchOption(cell.options, typed.current);
                        if (m && 'option' in m) setEditor({ at, text: optionValue(m.option) });
                      } : undefined}>
                      <option value="" />
                      {cell.kind === 'bool' ? <><option value="true">Yes</option><option value="false">No</option></>
                        : cell.options?.map((o) => <option key={optionValue(o)} value={optionValue(o)}>{optionLabel(o)}</option>)}
                    </select>
                    : <input autoFocus type={cell.kind === 'date' ? 'date' : 'text'} inputMode={cell.kind === 'number' ? 'decimal' : undefined} aria-label={col.label ?? col.key}
                      value={editor.text} onChange={(e) => setEditor({ at, text: e.target.value })}
                      style={{ width: '100%', minHeight: 32, boxSizing: 'border-box', font: 'inherit', color: 'var(--c-text)', background: 'var(--c-surface)', border: 0, outline: 0, textAlign: col.align ?? 'left' }} />}
                </Box> : blank || na ? '' : cell.text || (can ? '' : '—')}
              </Box>;
            })}
          </Box>;
        })}</tbody>
      </Box>
      {footer}
    </Box>
    {hint !== null && <Typography sx={{ mt: 0.75, fontSize: 11, color: 'var(--c-text-3)' }}>{hint ?? SHEET_GRID_HINT}</Typography>}
  </>;
}
