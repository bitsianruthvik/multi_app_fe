/**
 * ORDER and LINE values (init.sql §65) — the words and the checks the Order values panel and the
 * Values grid share. Pure: no React, no requests (scripts/cf_erp_order_defaults_test.mjs reads them).
 *
 * Most specific wins: a row's own entry > the line's value > the order's value > the spec's own rule.
 */
import type { OrderSpec, OrderSpecLine, OrderSpecUsage, OrderSpecValue } from '../api/orderSpecDefaults';

export type InheritLevel = 'order' | 'line';

/** What a line shows for one spec: its own value, else the order's ("as the order"), else nothing. */
export function lineShows(line: Pick<OrderSpecLine, 'values'>, orderValues: Record<string, OrderSpecValue>, code: string):
  { value: OrderSpecValue | null; from: InheritLevel | null } {
  const own = line.values[code];
  if (own) return { value: own, from: 'line' };
  const order = orderValues[code];
  return order ? { value: order, from: 'order' } : { value: null, from: null };
}

/** "306 rows · 300 take it · 6 their own" — how a line's rows take one value; null when no row has it. */
export function usageText(u: OrderSpecUsage | null | undefined): string | null {
  if (!u || !u.rows) return null;
  const parts = [`${u.rows} ${u.rows === 1 ? 'row' : 'rows'}`];
  if (u.follow) parts.push(`${u.follow} take${u.follow === 1 ? 's' : ''} it`);
  if (u.own) parts.push(`${u.own} ${u.own === 1 ? 'has its' : 'have their'} own`);
  if (u.notAllowed) parts.push(`${u.notAllowed} not allowed`);
  if (u.empty) parts.push(`${u.empty} empty`);
  return parts.join(' · ');
}

/**
 * A typed value checked before it is sent: { value } (null = take it away) or { error } in words.
 * The server checks again; this only saves a round trip for a plain mistake.
 */
export function readSpecInput(spec: Pick<OrderSpec, 'dataType' | 'name' | 'options'>, text: string): { value: string | number | boolean | null } | { error: string } {
  const t = text.trim();
  if (t === '') return { value: null };
  switch (spec.dataType) {
    case 'number': {
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? { value: n } : { error: `${spec.name} needs a number.` };
    }
    case 'boolean':
      if (['true', 'yes', '1'].includes(t.toLowerCase())) return { value: true };
      if (['false', 'no', '0'].includes(t.toLowerCase())) return { value: false };
      return { error: `${spec.name} is yes or no.` };
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(t) ? { value: t } : { error: `${spec.name} needs a date as YYYY-MM-DD.` };
    case 'option': {
      const o = spec.options?.find((x) => String(x.id) === t) ?? spec.options?.find((x) => x.value.toLowerCase() === t.toLowerCase());
      return o ? { value: o.id } : { error: `"${t}" is not an option of ${spec.name}.` };
    }
    default:
      return { value: t };
  }
}

/** The sentence under the panel for the locked lines. */
export function lockedNote(lines: Pick<OrderSpecLine, 'lineNo' | 'frozen'>[]): string | null {
  const frozen = lines.filter((l) => l.frozen);
  if (!frozen.length) return null;
  const one = frozen.length === 1;
  return `${one ? 'Line' : 'Lines'} ${frozen.map((l) => l.lineNo).join(', ')} ${one ? 'is' : 'are'} locked — ${one ? 'it keeps' : 'they keep'} the values ${one ? 'it' : 'they'} locked with. A change here reaches ${one ? 'it' : 'them'} only through a revision of the order.`;
}
