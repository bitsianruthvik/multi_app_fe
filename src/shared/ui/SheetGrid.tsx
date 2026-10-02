import { createPortal } from 'react-dom';
import {
  useEffect, useImperativeHandle, useMemo, useRef, useState,
  type ClipboardEvent, type HTMLAttributes, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref,
} from 'react';
import { Alert, Box, IconButton, Typography, useMediaQuery } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { readPref, writePref } from './storage';

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
 *
 * Two layouts. WIDE: one column per key, every row draws every column (a cell a
 * row lacks is hatched n/a). STRIP (`rowColumns`): each row draws only its own
 * cells, left-aligned, with a short label above them; consecutive rows with the
 * same cells share one label line and line up, so a block paste or fill-down
 * across them works as in a sheet. A screen whose rows carry different fields
 * (BOM values, operations per flow) uses STRIP; nobody hunts for their cell in
 * a sea of hatching.
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
  /** The text colour (a CSS colour / token) when the tone's grey or black is not what the cell means — a status grid. */
  ink?: string;
  /** A short state word put on the cell as data-state (tests, styling hooks). */
  state?: string;
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
/**
 * Selected keys, in display order. In strip layout the rows of a selection need not share their columns, so
 * `cells` lists exactly the cells selected (row × its own column) and `cols` is every column key among them.
 */
export type SheetRange = { rows: string[]; cols: string[]; cells?: { rowKey: string; colKey: string }[] };

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
  /** Strip layout: the short label above the cell ("L", "Thk", "Grade"). Default: `label`. */
  short?: string;
  /** Strip layout: the unit beside the short label, in mono ("mm"). */
  unit?: string;
  /** Strip layout: the cell's width. Default 96. */
  stripWidth?: number;
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
  /**
   * STRIP layout: the column keys THIS row has, in the order they are drawn. Rows draw only these, each with a
   * short label above it; consecutive rows with the same list share one label line. Without it: the wide layout.
   */
  rowColumns?: (rowKey: string) => string[];
  /** Strip layout: offer a "Line up all columns" switch that falls back to the wide layout. Default true. Remembered per `prefKey`. */
  lineUpToggle?: boolean;
  /** Where the "Line up all columns" choice is remembered. Default: the aria label. */
  prefKey?: string;
  /**
   * A data cell was clicked (or Enter / F2 pressed on one that cannot be typed in). For a grid whose cells
   * OPEN something — a drawer of actions — rather than edit in place. The click still selects the cell.
   */
  onCellClick?: (rowKey: string, colKey: string) => void;
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
  /** Where to draw the "Line up all columns" switch (a screen's own toolbar element); omitted = a line above the grid. */
  lineUpSlot?: HTMLElement | null;
  /** Default true: the frozen first column's right edge can be dragged (double-click resets); the width is remembered per `prefKey` on this device. */
  resizableRowHeader?: boolean;
  /**
   * Make the grid as tall as the window (under whatever sits above it) instead of 70vh, so its own scroll is the page's scroll and the
   * heading row (and, in strip layout, the label line of the rows in view) never leaves the screen.
   */
  fillViewport?: boolean;
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
/** A slot past the end of a strip row: nothing is there. */
const VOID: SheetCell = Object.freeze({ text: '', editable: false, applies: false, tone: 'blank' }) as SheetCell;
const STRIP_WIDTH = 96;
const isDropdown = (c: SheetCell) => c.kind === 'option' || c.kind === 'bool';

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
/**
 * Typing into an open drop-down: the forgiving match first, else — like a native list's type-ahead — the first
 * option that starts with the text, else the first that contains it. Only for choosing while typing; a paste or a
 * commit still needs `matchOption`.
 */
function typeAhead(options: SheetOption[] | undefined, raw: string): SheetOption | null {
  const m = matchOption(options, raw);
  if (m && 'option' in m) return m.option;
  const text = raw.trim().toLowerCase();
  if (!options || !text) return null;
  const has = (o: SheetOption, f: (x: string) => boolean) => f(optionLabel(o).toLowerCase()) || f(optionValue(o).toLowerCase());
  return options.find((o) => has(o, (x) => x.startsWith(text))) ?? options.find((o) => has(o, (x) => x.includes(text))) ?? null;
}
const refusal = (text: string, colName: string, m: OptionMatch) =>
  m && 'ambiguous' in m ? `“${text}” could be ${m.ambiguous.map((l) => `“${l}”`).join(' or ')} in ${colName}. Type more of it.` : `“${text}” is not an allowed ${colName}.`;

/** The note shown instead of an editor on a phone-width window. */
export const SHEET_GRID_NARROW_NOTE = 'Editing this is easier on a wider screen';
export const SHEET_GRID_NARROW_QUERY = '(max-width:599.95px)';

export const SHEET_GRID_HINT = 'Type to fill a cell · Enter, Tab or an arrow keeps it and moves on · F2 edits in place · Esc cancels · Ctrl+C / Ctrl+V copy and paste · Ctrl+D / Ctrl+R fill down / right · Ctrl+Z undo · Shift-click or drag selects a block';

const HEAD_MIN = 160, HEAD_MAX = 900;

export function SheetGrid({
  rows, columns, cellAt: cellAtRaw, onWrites, onSelectionChange, onToggleRow, onCellClick, rowSelect, stickyHeader = true, frozenFirstColumn = true, footer,
  onProblem, cornerHeader, rowHeaderWidth = 220, rowHeight = 32, ariaLabel = 'Spreadsheet', busy, hint, rowProps, rowSx, historyKey, onHistoryChange, narrowReadOnly = true,
  rowColumns, lineUpToggle = true, prefKey, ref, resizableRowHeader = true, fillViewport = false, lineUpSlot,
}: SheetGridProps) {
  const narrow = useMediaQuery(SHEET_GRID_NARROW_QUERY, { noSsr: true });
  const readOnly = narrowReadOnly && narrow;
  const cellAtRo = (rowKey: string, colKey: string): SheetCell => {
    const c = cellAtRaw(rowKey, colKey);
    return readOnly && c.editable ? { ...c, editable: false, why: SHEET_GRID_NARROW_NOTE } : c;
  };
  const table = useRef<HTMLTableElement>(null);
  const selecting = useRef(false);
  const endingEdit = useRef(false);
  const wantPicker = useRef(false);
  const typed = useRef(''), typedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReported = useRef('');
  const [anchor, setAnchor] = useState<Point | null>(null), [extent, setExtent] = useState<Point | null>(null);
  /** enter = started by typing: the arrows commit and move (Excel's Enter mode). edit = F2 / double-click / Enter: Left/Right move the caret. */
  const [editor, setEditor] = useState<{ at: Point; text: string; mode: 'enter' | 'edit' } | null>(null);
  const [inline, setInline] = useState<string | null>(null);
  const lineUpPref = `sheetgrid.lineUp.${prefKey ?? ariaLabel}`;
  const headWPref = `sheetgrid.headW.${prefKey ?? ariaLabel}`;
  const [headW, setHeadW] = useState<number>(() => {
    const saved = readPref<number>(headWPref, 0);
    return resizableRowHeader && Number.isFinite(saved) && saved >= HEAD_MIN && saved <= HEAD_MAX ? saved : rowHeaderWidth;
  });
  const scroller = useRef<HTMLDivElement>(null);
  const dragHead = (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = headW, el = e.currentTarget;
    let last = startW;
    el.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => { last = Math.max(HEAD_MIN, Math.min(HEAD_MAX, Math.round(startW + ev.clientX - startX))); setHeadW(last); };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); writePref(headWPref, last); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const resetHead = () => { setHeadW(rowHeaderWidth); writePref(headWPref, rowHeaderWidth); };
  /**
   * fillViewport: the box ends at the bottom of the window wherever the page is scrolled to, so its own scroll (and
   * with it the sticky heading) is always the one in use — a fixed 70vh box starting low on the page ran past the
   * fold and the heading scrolled out of sight with the page. Re-measured on any scroll or resize.
   */
  const [fillH, setFillH] = useState<number | null>(null);
  useEffect(() => {
    if (!fillViewport) return undefined;
    let raf = 0;
    const measureFill = () => {
      raf = 0;
      const box = scroller.current;
      if (!box) return;
      const next = Math.max(260, Math.floor(window.innerHeight - box.getBoundingClientRect().top - 72));
      setFillH((cur) => (cur != null && Math.abs(cur - next) < 2 ? cur : next));
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(measureFill); };
    measureFill();
    window.addEventListener('scroll', queue, true);
    window.addEventListener('resize', queue);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue);
    if (ro && document.body) ro.observe(document.body);
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener('scroll', queue, true); window.removeEventListener('resize', queue); ro?.disconnect(); };
  }, [fillViewport]);
  const [lineUp, setLineUp] = useState<boolean>(() => readPref(lineUpPref, false));
  const problem = (message: string | null) => { if (onProblem) onProblem(message); else setInline(message); };
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.key, i])), [rows]);
  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const anyCollapsible = rows.some((r) => r.collapsible !== undefined);

  // ── layout: which column key sits in which slot of which row ──
  const strip = !!rowColumns && !lineUp;
  const allKeys = columns.map((c) => c.key);
  const stripKeys: string[][] | null = strip ? rows.map((r) => rowColumns!(r.key).filter((k) => colByKey.has(k))) : null;
  const keysOf = (r: number): string[] => (stripKeys ? stripKeys[r] ?? [] : allKeys);
  const sigOf = (r: number) => keysOf(r).join('\u0001');
  const slotCount = stripKeys ? Math.max(0, ...stripKeys.map((k) => k.length)) : columns.length;
  const keyAt = (at: Point): string | undefined => keysOf(at.row)[at.col];
  const labelOf = (key: string | undefined) => (key ? colByKey.get(key)?.label ?? key : '');
  const cellAt = (rowKey: string, colKey: string): SheetCell => cellAtRo(rowKey, colKey);

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
    const r = rowIndex.get(rowKey);
    const c = r === undefined ? -1 : keysOf(r).indexOf(colKey);
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
    if (!rowIndex.has(rowKey) || !colByKey.has(colKey)) return null;
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
      else skipped.push(`${rows[rowIndex.get(it.rowKey) ?? -1]?.label ?? it.rowKey} · ${labelOf(it.colKey)}`);
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
    const row = rows[at.row], key = row ? keyAt(at) : undefined;
    if (!row || !key) return VOID;
    return cellAt(row.key, key);
  };
  const isBlank = (c: SheetCell) => c.tone === 'blank';
  const isNa = (c: SheetCell) => c.applies === false;
  const writable = (c: SheetCell) => !!c.editable && !isBlank(c) && !isNa(c);
  /** The next cell in reading order (Tab) or down the column (Enter) that applies; null when there is none. */
  const nextApplying = (from: Point, step: (p: Point) => Point | null): Point | null => {
    for (let p = step(from); p; p = step(p)) if (!isNa(cellOf(p))) return p;
    return null;
  };
  /** Reading order over the cells that exist: along the row, then the first cell of the next row that has any. */
  const stepTab = (back: boolean) => (p: Point): Point | null => {
    let row = p.row, col = p.col + (back ? -1 : 1);
    while (row >= 0 && row < rows.length) {
      const len = keysOf(row).length;
      if (col >= 0 && col < len) return { row, col };
      row += back ? -1 : 1;
      if (row < 0 || row >= rows.length) return null;
      col = back ? keysOf(row).length - 1 : 0;
    }
    return null;
  };
  /**
   * One row up or down. Wide: the same column. Strip: the next row that has cells, at the cell with the same
   * column key, else the nearest one under it (the same slot, or that row's last).
   */
  const stepVert = (dir: 1 | -1) => (p: Point): Point | null => {
    const key = keyAt(p);
    for (let r = p.row + dir; r >= 0 && r < rows.length; r += dir) {
      const ks = keysOf(r);
      if (!ks.length) continue;
      if (!stripKeys) return { row: r, col: p.col };
      const i = key ? ks.indexOf(key) : -1;
      return { row: r, col: i >= 0 ? i : Math.min(p.col, ks.length - 1) };
    }
    return null;
  };
  /** Down (up) the COLUMN: the next row that has this very cell; rows without it are passed. Wide: one row. */
  const stepColumn = (dir: 1 | -1) => (p: Point): Point | null => {
    if (!stripKeys) return stepVert(dir)(p);
    const key = keyAt(p);
    for (let r = p.row + dir; key && r >= 0 && r < rows.length; r += dir) {
      const i = keysOf(r).indexOf(key);
      if (i >= 0) return { row: r, col: i };
    }
    return null;
  };
  const stepSide = (dir: 1 | -1) => (p: Point): Point | null => {
    const col = p.col + dir;
    return col >= 0 && col < keysOf(p.row).length ? { row: p.row, col } : null;
  };
  const naText = (n: number) => `${n} cell${n > 1 ? 's' : ''} ${n > 1 ? "don't" : "doesn't"} apply to ${n > 1 ? 'their' : 'its'} row and ${n > 1 ? 'were' : 'was'} skipped`;
  const bounds = () => {
    const a = anchor ?? { row: 0, col: 0 }, b = extent ?? a;
    return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row), left: Math.min(a.col, b.col), right: Math.max(a.col, b.col) };
  };
  const selected = (at: Point) => { const b = bounds(); return !!anchor && at.row >= b.top && at.row <= b.bottom && at.col >= b.left && at.col <= b.right; };
  const focus = (at: Point) => table.current?.querySelector<HTMLElement>(`[data-cell="${at.row}:${at.col + 1}"]`)?.focus();
  const choose = (at: Point, extend = false) => { if (!extend || !anchor) setAnchor(at); setExtent(at); };
  const go = (next: Point | null, extend = false) => { if (next) { choose(next, extend); focus(next); } };

  // Report the selection to the screen, but only when it really changes — the
  // screen may rebuild `rows` on every render, and must not be re-notified for that.
  useEffect(() => {
    if (!onSelectionChange) return;
    let sel: SheetRange = { rows: [], cols: [] };
    if (anchor) {
      const b = bounds();
      if (stripKeys) {
        const cells: { rowKey: string; colKey: string }[] = [], cols: string[] = [];
        for (let r = b.top; r <= b.bottom; r++) for (let c = b.left; c <= b.right; c++) {
          const k = keyAt({ row: r, col: c });
          if (!k) continue;
          cells.push({ rowKey: rows[r].key, colKey: k });
          if (!cols.includes(k)) cols.push(k);
        }
        sel = { rows: rows.slice(b.top, b.bottom + 1).map((r) => r.key), cols, cells };
      } else {
        sel = { rows: rows.slice(b.top, b.bottom + 1).map((r) => r.key), cols: columns.slice(b.left, b.right + 1).map((c) => c.key) };
      }
    }
    const sig = JSON.stringify(sel);
    if (sig === lastReported.current) return;
    lastReported.current = sig;
    onSelectionChange(sel);
  });

  /** Writes the editor's text. False when the text was refused (an option that does not match) — the caller then stays put. */
  const commit = (returnFocus = false): boolean => {
    if (!editor || endingEdit.current) return true;
    endingEdit.current = true;
    const c = cellOf(editor.at), key = keyAt(editor.at);
    if (writable(c) && key) {
      let text = editor.text;
      if (c.kind === 'option' && text !== '') {
        const m = matchOption(c.options, text);
        if (m && 'option' in m) text = optionValue(m.option);
        else { problem(refusal(text, labelOf(key), m)); setEditor(null); focus(editor.at); return false; }
      }
      emit([{ rowKey: rows[editor.at.row].key, colKey: key, text }]);
    }
    setEditor(null);
    if (returnFocus) focus(editor.at);
    return true;
  };
  const begin = (at: Point, text?: string, picker = false) => {
    const c = cellOf(at);
    if (!writable(c)) { if (c.why) problem(c.why); return; }
    endingEdit.current = false;
    choose(at); problem(null);
    let start = text ?? c.input ?? c.text;
    if (c.kind === 'option' && text !== undefined) { typed.current = text; const o = typeAhead(c.options, text); start = o ? optionValue(o) : ''; }
    if (c.kind === 'bool' && text !== undefined) start = /^[yt1]/i.test(text) ? 'true' : /^[nf0]/i.test(text) ? 'false' : c.input ?? '';
    wantPicker.current = picker && isDropdown(c);
    setEditor({ at, text: start, mode: text !== undefined ? 'enter' : 'edit' });
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
    // Strip: the block lands on the rows shaped like the first one; a row with other cells is skipped, and said.
    const sig0 = sigOf(b.top), wide = keysOf(b.top).length;
    if (height * width > 10000 || b.top + height > rows.length || b.left + width > wide) {
      problem('The pasted cells do not fit here. Select a smaller block or a different starting cell.'); return;
    }
    const writes: SheetWrite[] = []; let naSkipped = 0, otherRows = 0;
    for (let r = 0; r < height; r++) {
      if (stripKeys && sigOf(b.top + r) !== sig0) { otherRows++; continue; }
      for (let k = 0; k < width; k++) {
        const at = { row: b.top + r, col: b.left + k }, c = cellOf(at), key = keyAt(at) as string;
        const colName = labelOf(key);
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
        writes.push({ rowKey: rows[at.row].key, colKey: key, text });
      }
    }
    const notes = [naSkipped ? naText(naSkipped) : '', otherRows ? `${otherRows} row${otherRows > 1 ? 's have' : ' has'} different cells and ${otherRows > 1 ? 'were' : 'was'} skipped` : ''].filter(Boolean);
    if (!writes.length && notes.length) { problem(`Nothing pasted: ${notes.join(' · ')}.`); return; }
    emit(writes); problem(notes.length ? `${notes.join(' · ')}.` : null); setExtent({ row: b.top + height - 1, col: b.left + width - 1 });
  };
  /**
   * Ctrl+D / Ctrl+R: copy the first row (column) of the selection into the rest, as one history entry. Down goes by
   * COLUMN KEY, so in strip layout a row below gets the value only where it has the same cell.
   */
  const fill = (dir: 'down' | 'right') => {
    const b = bounds(), down = dir === 'down';
    const span = down ? b.bottom - b.top : b.right - b.left;
    let srcLine = span === 0 ? (down ? b.top - 1 : b.left - 1) : (down ? b.top : b.left);
    // Strip: "the row above" is the nearest row above that has cells.
    if (down && span === 0 && stripKeys) while (srcLine >= 0 && !keysOf(srcLine).length) srcLine--;
    if (srcLine < 0) { problem(`Nothing to fill ${dir}: select the cells to fill and the one to copy from.`); return; }
    const first = span === 0 ? (down ? b.top : b.left) : srcLine + 1, last = down ? b.bottom : b.right;
    const lo = down ? b.left : b.top, hi = down ? b.right : b.bottom;
    const writes: SheetWrite[] = []; let skipped = 0, naSkipped = 0;
    for (let k = lo; k <= hi; k++) {
      const srcAt = down ? (stripKeys && span === 0 ? stepColumn(-1)({ row: b.top, col: k }) : { row: srcLine, col: k }) : { row: k, col: srcLine };
      if (!srcAt) continue;
      const src = cellOf(srcAt), srcKey = keyAt(srcAt);
      if (src === VOID) continue;
      const value = isBlank(src) ? null : src.input ?? src.text;
      for (let i = first; i <= last; i++) {
        let at: Point = down ? { row: i, col: k } : { row: k, col: i };
        if (down && stripKeys) {
          const ks = keysOf(i);
          if (!ks.length) continue;
          const j = srcKey ? ks.indexOf(srcKey) : -1;
          if (j < 0) { naSkipped++; continue; }
          at = { row: i, col: j };
        }
        if (cellOf(at) === VOID) continue;
        if (isNa(cellOf(at))) { naSkipped++; continue; }
        if (value === null || !writable(cellOf(at))) { skipped++; continue; }
        writes.push({ rowKey: rows[at.row].key, colKey: keyAt(at) as string, text: value });
      }
    }
    // Several selected slots of one strip row can name one target twice; the last one wins, once.
    const seen = new Map<string, SheetWrite>();
    for (const w of writes) seen.set(`${w.rowKey}\u0001${w.colKey}`, w);
    emit([...seen.values()]);
    const notes = [skipped ? `${skipped} cell${skipped > 1 ? 's' : ''} skipped (read-only)` : '', naSkipped ? naText(naSkipped) : ''].filter(Boolean);
    problem(notes.length ? `${notes.join(' · ')}.` : null);
  };
  const onKey = (e: KeyboardEvent, at: Point) => {
    if (editor) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && /^[dr]$/i.test(e.key)) {
      e.preventDefault(); fill(e.key.toLowerCase() === 'd' ? 'down' : 'right'); return;
    }
    if (e.key === 'Tab') {
      // Tab goes to the next cell that applies to its row; hatched cells are stepped over.
      e.preventDefault(); go(nextApplying(at, stepTab(e.shiftKey))); return;
    }
    if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); if (isDropdown(cellOf(at))) begin(at, undefined, true); return; }
    const arrows: Record<string, (p: Point) => Point | null> = { ArrowUp: stepVert(-1), ArrowDown: stepVert(1), ArrowLeft: stepSide(-1), ArrowRight: stepSide(1) };
    if (arrows[e.key]) { e.preventDefault(); go(arrows[e.key](at), e.shiftKey); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key)) {
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      if (onCellClick && !writable(cellOf(at))) onCellClick(rows[at.row].key, keyAt(at) as string);
      else begin(at, undefined, e.key === 'Enter');
    }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); begin(at, e.key); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault(); const b = bounds(), writes: SheetWrite[] = [];
      for (let row = b.top; row <= b.bottom; row++) for (let col = b.left; col <= b.right; col++) {
        const key = keyAt({ row, col });
        if (key && writable(cellOf({ row, col }))) writes.push({ rowKey: rows[row].key, colKey: key, text: '' });
      }
      emit(writes);
    }
  };
  /** Keys inside an open editor: Enter / Tab / the arrows keep the value and move on, as in Excel. */
  const onEditorKey = (e: KeyboardEvent, at: Point, cell: SheetCell) => {
    if (!editor) return;
    const key = e.key, dropdown = isDropdown(cell);
    if (key === 'Escape') { e.preventDefault(); e.stopPropagation(); endingEdit.current = true; setEditor(null); focus(at); return; }
    if (key === 'F2') { e.preventDefault(); e.stopPropagation(); setEditor({ ...editor, mode: editor.mode === 'edit' ? 'enter' : 'edit' }); return; }
    let next: Point | null | undefined;
    // Enter walks down the column (strip: to the next row with the same cell), as filling a column does.
    if (key === 'Enter') next = nextApplying(at, stepColumn(e.shiftKey ? -1 : 1)) ?? nextApplying(at, stepVert(e.shiftKey ? -1 : 1));
    else if (key === 'Tab') next = nextApplying(at, stepTab(e.shiftKey));
    else if (key === 'ArrowUp' || key === 'ArrowDown') {
      // A dropdown opened on purpose (F2 / Enter / Alt+↓) walks its options; anything else moves.
      if (e.altKey || (dropdown && editor.mode === 'edit')) return;
      next = stepVert(key === 'ArrowUp' ? -1 : 1)(at);
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      if (editor.mode === 'edit' || e.shiftKey) return;   // in place: the caret moves
      next = stepSide(key === 'ArrowLeft' ? -1 : 1)(at);
    } else return;
    e.preventDefault(); e.stopPropagation();
    if (!commit()) return;
    if (next) { choose(next); focus(next); } else focus(at);
  };
  const selectColumn = (col: number, extend: boolean) => {
    if (!rows.length) return;
    const from = extend && anchor ? anchor.col : col;
    setAnchor({ row: 0, col: from }); setExtent({ row: rows.length - 1, col });
    focus({ row: 0, col });
  };
  /** Strip: a label selects that cell down its group of identical rows. */
  const selectSlot = (top: number, bottom: number, col: number, extend: boolean) => {
    const from = extend && anchor ? anchor.col : col;
    setAnchor({ row: top, col: from }); setExtent({ row: bottom, col });
    focus({ row: top, col });
  };
  const selectRow = (key: string) => {
    const idx = (rowSelect ? rowSelect(key) : [key]).map((k) => rowIndex.get(k)).filter((i): i is number => i != null);
    if (!idx.length) return;
    const right = Math.max(...idx.map((i) => keysOf(i).length)) - 1;
    if (right < 0) return;
    setAnchor({ row: Math.min(...idx), col: 0 }); setExtent({ row: Math.max(...idx), col: right });
    focus({ row: Math.min(...idx), col: 0 });
  };

  const headSticky: Record<string, string | number> = stickyHeader ? { position: 'sticky', top: 0 } : {};
  const firstSticky: Record<string, string | number> = frozenFirstColumn ? { position: 'sticky', left: 0 } : {};

  const capped = (w: number) => `min(${w}px, 50vw)`;
  const widthOf = (key: string | undefined) => (key ? colByKey.get(key)?.stripWidth ?? STRIP_WIDTH : STRIP_WIDTH);
  /** Strip: each slot is as wide as the widest cell any row puts there. */
  const slotWidths = stripKeys ? Array.from({ length: slotCount }, (_, i) => Math.max(...stripKeys.map((ks) => (ks[i] ? widthOf(ks[i]) : 0)), 40)) : [];
  /** Strip: where each run of identically-shaped rows ends (by its first row). */
  const groupEnd = new Map<number, number>();
  if (stripKeys) {
    for (let r = 0; r < rows.length; r++) {
      if (!keysOf(r).length || (r > 0 && keysOf(r - 1).length && sigOf(r - 1) === sigOf(r))) continue;
      let end = r;
      while (end + 1 < rows.length && sigOf(end + 1) === sigOf(r)) end++;
      groupEnd.set(r, end);
    }
  }
  const hasEditable = () => rows.some((r) => (rowColumns ? rowColumns(r.key) : allKeys).some((k) => colByKey.has(k) && cellAtRaw(r.key, k).editable));

  const dataCell = (row: SheetRow, r: number, c: number) => {
    const at = { row: r, col: c }, key = keyAt(at) as string, col = colByKey.get(key) as SheetColumn;
    const cell = cellOf(at), editing = same(editor?.at ?? null, at), active = selected(at);
    const tone = cell.tone ?? 'normal', blank = tone === 'blank', can = writable(cell), na = isNa(cell);
    const width = stripKeys ? slotWidths[c] : col.width ?? 145;
    const label = labelOf(key);
    return <Box component="td" key={stripKeys ? `${c}:${key}` : key} role="gridcell" data-cell={`${r}:${c + 1}`} data-col-key={key} className="sg-data" data-tone={tone} data-na={na ? 'true' : undefined} data-state={cell.state}
      data-dropdown={isDropdown(cell) && can ? 'true' : undefined}
      tabIndex={same(anchor, at) || (!anchor && r === 0 && c === 0) ? 0 : -1} aria-selected={active} aria-readonly={!can} aria-disabled={na || undefined}
      title={na ? cell.why ?? cell.title ?? 'Does not apply to this row' : cell.title ?? cell.why ?? cell.text}
      onClick={(e) => { if ((e.target as HTMLElement).closest('button, input, select, a')) return; choose(at, e.shiftKey); e.currentTarget.focus(); if (!e.shiftKey) onCellClick?.(row.key, key); }}
      onPointerDown={(e) => { if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, a')) return; if (e.shiftKey) e.preventDefault(); /* shift-click extends the cell range, not a text selection across the page */ selecting.current = true; choose(at, e.shiftKey); }}
      onMouseDown={(e) => { if (e.shiftKey && !(e.target as HTMLElement).closest('button, input, select, a')) e.preventDefault(); }}
      onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button, input, select, a')) begin(at); }}
      onPointerEnter={(e) => { if (e.buttons === 1 && selecting.current && !editor && anchor) setExtent(at); }}
      onKeyDown={(e) => { if (!(e.target as HTMLElement).closest('input, select, button')) onKey(e, at); }}
      style={stripKeys ? { width, minWidth: width, maxWidth: width } : undefined}
      sx={{ cursor: 'cell', textAlign: col.align ?? 'left',
        ...(na ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--c-text-3) 16%, transparent) 5px 6px)' } : {}),
        color: cell.ink ?? (tone === 'muted' || (!can && tone !== 'strong') ? 'var(--c-text-3)' : 'var(--c-text)'),
        fontWeight: tone === 'strong' ? 600 : undefined,
        background: active ? 'var(--c-primary-50) !important' : na ? 'var(--c-surface-3)' : cell.tint && !blank ? cell.tint : tone === 'warning' ? 'var(--c-warning-50)' : blank ? 'var(--c-surface)' : can || tone === 'muted' || tone === 'strong' ? 'var(--c-surface)' : 'var(--c-surface-2)',
        ...(blank ? { borderRightColor: 'transparent', borderBottomColor: 'transparent' } : {}),
        outline: same(anchor, at) ? '2px solid var(--c-primary-600)' : undefined,
        ...(isDropdown(cell) && can && !editing ? { pr: 2.25 } : {}),
      }}>
      {cell.mark != null && <Box component="span" data-mark="" sx={{ position: 'absolute', top: 2, right: 2, lineHeight: 0, fontSize: 8, pointerEvents: 'none' }}>{cell.mark}</Box>}
      {/* A dropdown says so before it is opened. */}
      {isDropdown(cell) && can && !editing && <Box component="span" aria-hidden data-caret="" sx={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--c-text-3)', pointerEvents: 'none' }}>▾</Box>}
      {editing && editor ? <Box
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}
        onKeyDown={(e) => onEditorKey(e, at, cell)}>
        {cell.kind === 'option' || cell.kind === 'bool'
          ? <select autoFocus value={editor.text} aria-label={label} onChange={(e) => setEditor({ ...editor, text: e.target.value })} style={{ width: '100%', minHeight: 28 }}
            ref={(el) => {
              if (!el || !wantPicker.current) return;
              wantPicker.current = false;
              // Opens the list where the browser allows it (needs the key press's activation); elsewhere the arrows still choose.
              try { (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.(); } catch { /* not allowed here — the select stays focused */ }
            }}
            onKeyDown={cell.kind === 'option' ? (e) => {
              // Typing picks the forgiving match ("BO" → "BO — no impact test"); Enter then commits it.
              if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) { typed.current = ''; return; }
              e.preventDefault(); typed.current += e.key;
              if (typedTimer.current) clearTimeout(typedTimer.current);
              typedTimer.current = setTimeout(() => { typed.current = ''; }, 1200);
              const o = typeAhead(cell.options, typed.current);
              if (o) setEditor({ ...editor, text: optionValue(o) });
            } : (e) => {
              if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
              e.preventDefault();
              if (/^[yt1]$/i.test(e.key)) setEditor({ ...editor, text: 'true' });
              else if (/^[nf0]$/i.test(e.key)) setEditor({ ...editor, text: 'false' });
            }}>
            <option value="" />
            {cell.kind === 'bool' ? <><option value="true">Yes</option><option value="false">No</option></>
              : cell.options?.map((o) => <option key={optionValue(o)} value={optionValue(o)}>{optionLabel(o)}</option>)}
          </select>
          : <input autoFocus type={cell.kind === 'date' ? 'date' : 'text'} inputMode={cell.kind === 'number' ? 'decimal' : undefined} aria-label={label}
            value={editor.text} onChange={(e) => setEditor({ ...editor, text: e.target.value })}
            style={{ width: '100%', minHeight: 28, boxSizing: 'border-box', font: 'inherit', color: 'var(--c-text)', background: 'var(--c-surface)', border: 0, outline: 0, textAlign: col.align ?? 'left' }} />}
      </Box> : blank || na ? '' : cell.text || (can ? '' : '—')}
    </Box>;
  };

  const resizeHandle = resizableRowHeader ? <Box component="span" role="separator" aria-orientation="vertical" aria-label="Drag to resize the first column (double-click resets)" title="Drag to resize · double-click to reset" data-testid="sheet-grid-resize"
    onPointerDown={dragHead} onDoubleClick={resetHead} onClick={(e) => e.stopPropagation()}
    sx={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 6, cursor: 'col-resize', touchAction: 'none', zIndex: 5, '&:hover, &:active': { background: 'color-mix(in srgb, var(--c-primary-600) 35%, transparent)' } }} /> : null;
  const stripHead = !!stripKeys && groupEnd.size > 0;

  /** Strip: the short labels over a run of identically-shaped rows. */
  const labelRow = (r: number) => {
    const ks = keysOf(r), end = groupEnd.get(r) ?? r;
    return <tr key={`labels:${rows[r].key}`} className="sg-labelrow" role="row" data-labels-for={rows[r].key}>
      <td className="sg-rowhead sg-labelhead sg-corner" data-sticky={stickyHeader ? 'true' : undefined} style={{ textAlign: 'left', fontWeight: 600, zIndex: 4 }}>{cornerHeader}{resizeHandle}</td>
      {ks.map((k, i) => {
        const col = colByKey.get(k) as SheetColumn, first = cellOf({ row: r, col: i }), dd = isDropdown(first) && writable(first);
        return <td key={k} role="columnheader" className="sg-label" data-label={k} title={`${col.label ?? k}${col.unit ? ` (${col.unit})` : ''} — click to select it down these rows`}
          onClick={(e) => selectSlot(r, end, i, e.shiftKey)} style={{ width: slotWidths[i], minWidth: slotWidths[i], maxWidth: slotWidths[i], textAlign: col.align ?? 'left' }}>
          {col.short ?? col.label ?? k}{col.unit && <Box component="span" sx={{ fontFamily: 'var(--font-mono)', ml: 0.5 }}>{col.unit}</Box>}{dd && <Box component="span" aria-label="drop-down" sx={{ ml: 0.25 }}>▾</Box>}
        </td>;
      })}
      {ks.length < slotCount && <td className="sg-void" colSpan={slotCount - ks.length} />}
    </tr>;
  };

  const lineUpButton = (
    <Box sx={lineUpSlot ? undefined : { display: 'flex', justifyContent: 'flex-end', mb: 0.5 }}>
      {/* A button, not a checkbox input: screens find their cell editor as "the input". */}
      <Box component="button" type="button" role="switch" aria-checked={lineUp} data-testid="sheet-grid-line-up"
        title={lineUp ? 'Every column for every row, hatched where a row has no such cell' : 'Each row shows only its own cells'}
        onClick={() => { const next = !lineUp; setLineUp(next); writePref(lineUpPref, next); setAnchor(null); setExtent(null); setEditor(null); }}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 12, color: 'var(--c-text-3)', p: 0.25, borderRadius: 'var(--r-sm)', whiteSpace: 'nowrap', '&:hover': { color: 'var(--c-text-2)' } }}>
        <Box component="span" aria-hidden sx={{ position: 'relative', width: 26, height: 14, borderRadius: 7, background: lineUp ? 'var(--c-primary-600)' : 'var(--c-border)', transition: 'background var(--t-fast) var(--ease)' }}>
          <Box component="span" sx={{ position: 'absolute', top: 2, left: lineUp ? 14 : 2, width: 10, height: 10, borderRadius: '50%', background: 'var(--c-surface)', transition: 'left var(--t-fast) var(--ease)' }} />
        </Box>
        {lineUpSlot ? 'Line up columns' : 'Line up all columns'}
      </Box>
    </Box>
  );

  return <>
    {readOnly && hasEditable() && <Alert severity="info" role="note" data-testid="sheet-grid-narrow-note" sx={{ mb: 1 }}>{SHEET_GRID_NARROW_NOTE}</Alert>}
    {inline && <Alert severity="info" onClose={() => setInline(null)} sx={{ mb: 1 }}>{inline}</Alert>}
    {rowColumns && lineUpToggle && (lineUpSlot ? createPortal(lineUpButton, lineUpSlot) : lineUpButton)}
    <Box ref={scroller} data-testid="sheet-grid-scroll" sx={{ overflow: 'auto', maxHeight: fillViewport ? (fillH ?? 'max(360px, calc(100vh - 128px))') : 'min(70vh, 720px)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)' }}>
      <Box component="table" ref={table} role="grid" aria-label={ariaLabel} aria-busy={busy} data-layout={stripKeys ? 'strip' : 'wide'}
        onCopy={copy} onPaste={paste} onPointerUp={() => { selecting.current = false; }}
        sx={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%', tableLayout: 'fixed', fontSize: 12,
          '& th, & td': { borderRight: '1px solid var(--c-divider)', borderBottom: '1px solid var(--c-divider)' },
          '& th': { ...headSticky, zIndex: 3, background: 'var(--c-surface-2)', textAlign: 'left', py: 0.5, px: 1, fontWeight: 600, cursor: 'pointer' },
          '& td': { height: rowHeight, px: 1, outlineOffset: '-2px', '&:focus-visible': { outline: '2px solid var(--c-focus)' } },
          '& .sg-corner': { ...firstSticky, ...headSticky, zIndex: 4, width: capped(headW), minWidth: capped(headW), maxWidth: capped(headW), cursor: 'default' },
          '& .sg-rowhead': { ...firstSticky, zIndex: 2, width: capped(headW), minWidth: capped(headW), maxWidth: capped(headW), background: 'var(--c-surface)', cursor: 'default' },
          // A faint row emphasis on hover, on the cells that apply only; the hatched ones stay low.
          '& tbody tr:hover td.sg-data:not([data-na="true"])': { backgroundImage: 'linear-gradient(color-mix(in srgb, var(--c-primary-600) 6%, transparent), color-mix(in srgb, var(--c-primary-600) 6%, transparent))' },
          '& .sg-data': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', position: 'relative' },
          // Strip: the labels are quiet — small, muted, no box of their own — and the space past a row's last cell is nothing.
          '& .sg-labelrow td': { ...headSticky, zIndex: 3, boxShadow: stickyHeader ? '0 1px 0 var(--c-divider)' : undefined, height: 16, py: 0.125, pt: 0.25, fontSize: 10.5, lineHeight: 1.1, color: 'var(--c-text-3)', borderBottom: 0, borderRightColor: 'transparent', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: 'var(--c-surface)' },
          '& .sg-labelrow td.sg-label': { cursor: 'pointer', '&:hover': { color: 'var(--c-primary-700)' } },
          '& td.sg-void': { borderRightColor: 'transparent', borderBottomColor: 'transparent', background: 'var(--c-surface)' },
        }}>
        {stripKeys && <colgroup>
          <col style={{ width: capped(headW) }} />
          {slotWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>}
        {!stripHead && <thead><tr>
          <th scope="col" className="sg-corner" data-sticky={stickyHeader ? 'true' : undefined}>
            {cornerHeader}
            {resizeHandle}
          </th>
          {stripKeys
            ? slotCount > 0 && <th scope="colgroup" colSpan={slotCount} style={{ cursor: 'default', fontWeight: 400, color: 'var(--c-text-3)', fontSize: 11 }}>Each row shows only its own cells</th>
            : columns.map((col, i) => <th key={col.key} scope="col" data-col={i} style={{ width: col.width ?? 145, minWidth: col.width ?? 145, maxWidth: col.width ?? 145, textAlign: col.align ?? 'left' }}
              onClick={(e) => { if ((e.target as HTMLElement).closest('button, input, select, a')) return; selectColumn(i, e.shiftKey); }}>{col.header}</th>)}
        </tr></thead>}
        <tbody>{rows.flatMap((row, r) => {
          const extra = rowProps?.(row.key);
          const len = keysOf(r).length;
          const tr = <Box component="tr" key={row.key} aria-level={(row.depth ?? 0) + 1} aria-expanded={row.collapsible ? !row.collapsed : undefined} {...extra}
            sx={rowSx?.(row.key)} data-row={row.key}>
            <Box component="td" role="rowheader" data-cell={`${r}:0`} className="sg-rowhead" tabIndex={-1}
              onClick={(e) => { if ((e.target as HTMLElement).closest(INTERACTIVE)) return; selectRow(row.key); }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {row.lead}
                <Box sx={{ ml: Math.min(row.depth ?? 0, 7) * 1.25, display: 'flex', minWidth: 0, alignItems: 'center', flex: 1 }}>
                  {anyCollapsible && <IconButton size="small" disabled={!row.collapsible} aria-label={`${row.collapsed ? 'Expand' : 'Collapse'} ${row.label ?? row.key}`}
                    onClick={() => onToggleRow?.(row.key)} sx={{ width: 28, height: Math.max(20, rowHeight - 6), visibility: row.collapsible ? 'visible' : 'hidden' }}>
                    {row.collapsed ? <ChevronRightRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
                  </IconButton>}
                  <Box sx={{ minWidth: 0, flex: 1 }}>{row.header}</Box>
                </Box>
                {row.trail}
              </Box>
            </Box>
            {Array.from({ length: len }, (_, c) => dataCell(row, r, c))}
            {len < slotCount && <td className="sg-void" colSpan={slotCount - len} />}
          </Box>;
          return groupEnd.has(r) ? [labelRow(r), tr] : [tr];
        })}</tbody>
      </Box>
      {footer}
    </Box>
    {hint !== null && <Typography sx={{ mt: 0.75, fontSize: 11, color: 'var(--c-text-3)' }}>{hint ?? SHEET_GRID_HINT}</Typography>}
  </>;
}
