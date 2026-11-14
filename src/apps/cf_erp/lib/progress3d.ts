import type { Model3DElement } from '../api/drawings';
import type { RowProgress, RowProgressRow, RowUnit } from '../api/rowProgress';

/**
 * THE 3D PROGRESS VIEW's rules (user, 2026-11-01), pure so they can be tested:
 *  - a piece takes the colour of the flow step its row is at (one colour per operation, in flow order);
 *  - a row whose pieces have gone into their parent is painted with the parent — so once the flow is at a
 *    sub-assembly, the whole sub-assembly is one colour, at any depth;
 *  - 2026-11-14 (user: "which part is in which step right now"): a piece being worked GLOWS in that operation's
 *    colour; with nothing happening on it, it takes the colour of the LAST operation done on it, solid;
 *  - finished = green, nothing done yet = light grey, not released yet = steel;
 *  - a part whose cut pieces are not all cut yet is a GHOST (faint, dashed edges) — the steel is not there yet;
 *  - a step being worked right now pulses (the model does not say which portion of a part an operation touches, so
 *    the whole piece pulses rather than the portion);
 *  - outside the production order asked for: very faint.
 */

export const DONE = '#2e9b57';
export const WAITING = '#c9d1da';
export const NOT_RELEASED = '#8a99ab';
export const OUTSIDE = '#e3e7ec';
/** Distinct, colour-blind-friendly hues for operations, in flow order (then repeated a shade darker). */
const OP_HUES = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#06b6d4', '#a855f7', '#eab308', '#0ea5e9'];

export const opColour = (ops: { code: string }[], code: string): string => {
  const i = Math.max(0, ops.findIndex((o) => o.code === code));
  return OP_HUES[i % OP_HUES.length];
};

export interface Look { colour: string; ghost: boolean; pulse: boolean; faint: boolean; words: string }

/** The row an element belongs to: its own mark, else the nearest level it is in. */
export function rowOfElement(e: Model3DElement, byMark: Map<string, RowProgressRow>): RowProgressRow | null {
  const norm = (s: string) => s.trim().replace(/[\s_-]+/g, '-').toUpperCase();
  if (e.mark && byMark.has(norm(e.mark))) return byMark.get(norm(e.mark)) ?? null;
  for (const m of [...(e.in ?? [])].reverse()) if (byMark.has(norm(m))) return byMark.get(norm(m)) ?? null;
  for (const m of e.in ?? []) if (byMark.has(norm(m))) return byMark.get(norm(m)) ?? null;
  return null;
}

export function marksOf(p: RowProgress): Map<string, RowProgressRow> {
  const m = new Map<string, RowProgressRow>();
  for (const r of p.rows) if (r.markNorm && !m.has(r.markNorm)) m.set(r.markNorm, r);
  return m;
}

/** A row's state in one unit, following 'joined' up to the row that carries the work. */
export function effective(p: RowProgress, row: RowProgressRow, unit: number): { row: RowProgressRow; u: RowUnit } {
  const byId = new Map(p.rows.map((r) => [r.rowId, r]));
  let r = row; let u = r.units[unit] ?? r.units[0];
  for (let hops = 0; u?.state === 'joined' && r.parentRowId != null && hops < 40; hops++) {
    const up = byId.get(r.parentRowId); if (!up) break;
    r = up; u = r.units[unit] ?? r.units[0];
  }
  return { row: r, u };
}

export function lookOf(p: RowProgress, row: RowProgressRow | null, unit: number): Look {
  if (!row) return { colour: WAITING, ghost: false, pulse: false, faint: true, words: 'not in this line\'s rows' };
  const own = row.units[unit] ?? row.units[0];
  const { row: carrier, u } = effective(p, row, unit);
  const faint = own ? !own.inOrder : false;
  const ghost = !!own?.cut && own.cut.done < own.cut.total && own.state === 'waiting';
  const head = carrier.rowId !== row.rowId ? `${row.name} · in ${carrier.name}` : row.name;
  if (!u || u.state === 'not_released') return { colour: NOT_RELEASED, ghost, pulse: false, faint, words: `${head} · not released yet` };
  if (u.state === 'done') return { colour: DONE, ghost: false, pulse: false, faint, words: `${head} · finished — every operation done` };
  // 2026-11-14 (user): work happening now glows in its operation's colour; otherwise the piece takes the colour of
  // the last operation done on it, not glowing. Older servers send neither: fall back to the step it is at.
  const count = u.pieces > 1 ? ` · ${u.done} of ${u.pieces} finished` : '';
  const next = u.op && u.op.code !== u.now?.code ? ` · next ${u.op.name}` : '';
  if (u.now) return { colour: opColour(p.operations, u.now.code), ghost: false, pulse: true, faint, words: `${head} · being worked now: ${u.now.name}${count}` };
  if (u.last) return { colour: opColour(p.operations, u.last.code), ghost: false, pulse: false, faint, words: `${head} · last done: ${u.last.name}${next}${count}` };
  if (u.now === undefined && u.state === 'working' && u.op) return { colour: opColour(p.operations, u.op.code), ghost: false, pulse: u.inProgress, faint, words: `${head} · at ${u.op.name}${u.inProgress ? ' (being worked)' : ''}${count}` };
  const cutWords = own?.cut ? ` · cut ${own.cut.done} of ${own.cut.total}` : '';
  return { colour: WAITING, ghost, pulse: false, faint, words: `${head} · nothing done yet${u.op ? `, first ${u.op.name}` : ''}${cutWords}` };
}

/** The legend: what each colour means here (only what is on screen). */
export interface LegendEntry { colour: string; label: string; ghost?: boolean; /** an operation: pieces in it now glow */ op?: boolean; working?: number; last?: number }

export function legendOf(p: RowProgress, looks: Look[]): LegendEntry[] {
  const out: LegendEntry[] = [];
  const has = (c: string) => looks.some((l) => l.colour === c && !l.ghost);
  if (has(NOT_RELEASED)) out.push({ colour: NOT_RELEASED, label: 'Not released' });
  if (has(WAITING)) out.push({ colour: WAITING, label: 'Nothing done yet' });
  // Each operation on screen, with how many pieces are being worked in it now and how many it was the last for.
  for (const o of p.operations) {
    const c = opColour(p.operations, o.code);
    const mine = looks.filter((l) => l.colour === c && !l.ghost);
    if (mine.length) out.push({ colour: c, label: o.name, op: true, working: mine.filter((l) => l.pulse).length, last: mine.filter((l) => !l.pulse).length });
  }
  if (has(DONE)) out.push({ colour: DONE, label: 'Finished' });
  if (looks.some((l) => l.ghost)) out.push({ colour: WAITING, label: 'Cut pieces not cut yet', ghost: true });
  return out;
}
