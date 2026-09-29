import type { Evaluation } from './types';

const tonnes = (d: number) => {
  const a = Math.abs(d);
  const s = a >= 10 ? String(Math.round(a)) : String(Number(a.toFixed(1)));
  return `${d > 0 ? '+' : '-'}${s} t`;
};

/** Up to three names, then "and N more". */
const some = (names: string[]) => (names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`);

/**
 * What changed between two evaluations, in short plain lines, most important first:
 * tonnes per month, lines that move month, functions crossing 100 %, cards becoming late or blocked.
 */
export function feedback(before: Evaluation, after: Evaluation, max = 8): string[] {
  const L = after.labels;
  const out: string[] = [];

  // tonnes per month
  for (const ym of Object.keys(after.months)) {
    const d = after.months[ym].tonnes - (before.months[ym]?.tonnes ?? 0);
    if (Math.abs(d) >= 0.05) out.push(`${tonnes(d)} in ${L.months[ym] ?? ym}`);
  }

  // lines moving month
  const moved: Record<string, string[]> = {};
  const dropped: string[] = [];
  for (const [g, x] of Object.entries(after.lines)) {
    const was = before.lines[g]?.month ?? null;
    if (x.month === was) continue;
    const name = L.lines[g] ?? g;
    if (x.month) (moved[x.month] ??= []).push(name);
    else dropped.push(name);
  }
  for (const ym of Object.keys(moved).sort()) {
    const names = moved[ym];
    out.push(`${some(names)} now ship${names.length === 1 ? 's' : ''} in ${L.months[ym] ?? ym}`);
  }
  if (dropped.length) out.push(`${some(dropped)} no longer ship${dropped.length === 1 ? 's' : ''} in this plan`);

  // functions crossing 100 %
  for (const [fn, row] of Object.entries(after.load)) {
    for (const [pk, cell] of Object.entries(row)) {
      const was = before.load[fn]?.[pk]?.pct ?? 0;
      const name = L.functions[fn] ?? fn;
      const week = L.periods[pk] ?? pk;
      if (cell.pct > 100 && was <= 100) out.push(`${name} ${Math.round(cell.pct)}% in ${week}`);
      else if (cell.pct <= 100 && was > 100) out.push(`${name} back under 100% in ${week}`);
    }
  }

  // cards becoming late / blocked
  const late: string[] = [], blocked: string[] = [];
  for (const [k, u] of Object.entries(after.units)) {
    const b = before.units[k];
    if (u.late && !b?.late) late.push(L.units[k] ?? k);
    if (u.blocked && !b?.blocked) blocked.push(L.units[k] ?? k);
  }
  if (late.length) out.push(`${some(late)} now ${late.length === 1 ? 'ships' : 'ship'} after the committed date`);
  if (blocked.length) out.push(`${some(blocked)} ${blocked.length === 1 ? 'is' : 'are'} now blocked by material`);

  if (out.length > max) return [...out.slice(0, max - 1), `and ${out.length - max + 1} more changes`];
  return out;
}
