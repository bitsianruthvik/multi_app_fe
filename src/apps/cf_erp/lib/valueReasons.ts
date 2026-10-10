import type { AskedValue, ReasonLevel, ReasonOperation, ValueReasons } from '../api/valueReasons';

/**
 * "Why is this asked?" in plain words (GET /records/:id/value-reasons). Pure: no React, no requests —
 * scripts/cf_erp_value_reasons_test.mjs reads these sentences.
 *
 * The one case the screen exists to show: a value somebody set by hand that nothing in the record's
 * flow reads. It is the candidate for removal when the list has to stay the smallest that can be filled.
 */

export type ReasonGroupKey = 'flow' | 'manual' | 'derived' | 'notAsked';
export interface ReasonRow {
  code: string;
  name: string;
  /** The sentence. */
  text: string;
  /** A hand-made value nothing in its flow reads — drawn in the warning colour. */
  warn: boolean;
  required: boolean;
}
export interface ReasonGroup { key: ReasonGroupKey; title: string; hint: string; rows: ReasonRow[] }

export const GROUP_TITLE: Record<ReasonGroupKey, string> = {
  flow: 'From its flow',
  manual: 'Set by hand',
  derived: 'Worked out',
  notAsked: 'No longer asked for',
};

const GROUP_HINT: Record<ReasonGroupKey, string> = {
  flow: 'Asked because an operation’s time reads it. These look after themselves: one goes when nothing reads it any more.',
  manual: 'A rule somebody added. One that nothing reads is worth a second look.',
  derived: 'Nobody fills these in.',
  notAsked: 'Still stored on the record, but nothing asks for it any more.',
};

/** "CNC Drilling (CNCDRILL)". */
export const operationText = (o: ReasonOperation): string => (o.code && o.code !== o.name ? `${o.name} (${o.code})` : o.name);

/** "A", "A and B", "A, B and C". */
export function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
export const operationsText = (ops: ReasonOperation[]): string => listText(ops.map(operationText));

/** "Variant: Plate part" · "this item" · "this definition" · "its template definition: Splice plate". */
export function levelText(at: ReasonLevel): string {
  if (at.level === 'This item') return 'this item';
  if (at.level === 'This definition') return 'this definition';
  const name = at.name ?? at.code ?? '';
  if (at.level === 'Template definition') return name ? `its template definition: ${name}` : 'its template definition';
  return name ? `${at.level}: ${name}` : at.level;
}

const HOW: Record<string, (at: ReasonLevel) => string> = {
  calculated: () => 'calculated',
  rollup: () => 'rolled up from its BOM',
  inherited: () => 'inherited from the row above it',
  fixed: (at) => `fixed on ${levelText(at)}`,
  defaulted: (at) => `defaulted on ${levelText(at)}`,
};

/** The sentence for one asked value, and whether it is the case worth a warning. */
export function reasonText(v: AskedValue, ctx: Pick<ValueReasons, 'flow' | 'frozen'>): { text: string; warn: boolean } {
  const r = v.reason;
  if (r.kind === 'flow') {
    const flow = r.flow?.code ?? ctx.flow?.code ?? null;
    if (r.operations.length) return { text: `Read by ${operationsText(r.operations)}${flow ? ` — in flow ${flow}` : ''}`, warn: false };
    // A frozen row keeps the list it had at freeze, whatever its flow reads today.
    if (ctx.frozen) return { text: `Kept from the flow it had when the design was frozen${flow ? ` — nothing in ${flow} reads it today` : ''}`, warn: false };
    return { text: `Added by its flow${flow ? ` ${flow}` : ''} — nothing in it reads it now`, warn: false };
  }
  if (r.kind === 'manual') {
    const where = `Set by hand on ${levelText(r.at)}`;
    if (r.readBy.length) return { text: `${where} — also read by ${operationsText(r.readBy)}`, warn: false };
    if (!ctx.flow) return { text: `${where} — it has no flow, so no operation reads it`, warn: false };
    return { text: `${where} — nothing in its flow reads it`, warn: true };
  }
  const how = r.note ? 'by cutting and nesting' : (HOW[r.how] ?? (() => r.how))(r.at);
  const readers = r.readBy?.length ? ` — read by ${operationsText(r.readBy)}` : '';
  return { text: `Worked out (${how})${readers}`, warn: false };
}

/** The four lists, in the order the screen shows them; an empty one is left out. */
export function reasonGroups(data: ValueReasons): ReasonGroup[] {
  const rows: Record<ReasonGroupKey, ReasonRow[]> = { flow: [], manual: [], derived: [], notAsked: [] };
  for (const v of data.values) {
    const { text, warn } = reasonText(v, data);
    rows[v.reason.kind].push({ code: v.code, name: v.name, text, warn, required: v.required });
  }
  // What nothing reads comes first among the hand-made ones: it is what the person came for.
  rows.manual.sort((a, b) => Number(b.warn) - Number(a.warn));
  for (const n of data.notAsked) rows.notAsked.push({ code: n.code, name: n.name, text: `Holds ${n.display}`, warn: false, required: false });
  return (['flow', 'manual', 'derived', 'notAsked'] as ReasonGroupKey[])
    .filter((key) => rows[key].length > 0)
    .map((key) => ({ key, title: GROUP_TITLE[key], hint: GROUP_HINT[key], rows: rows[key] }));
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "7 values asked: 3 from its flow, 2 set by hand (1 nothing reads), 2 worked out." */
export function reasonSummary(data: ValueReasons): string {
  if (!data.values.length) return 'It asks for no values.';
  const groups = reasonGroups(data);
  const of = (key: ReasonGroupKey) => groups.find((g) => g.key === key)?.rows ?? [];
  const unread = of('manual').filter((r) => r.warn).length;
  const bits = [
    of('flow').length ? `${of('flow').length} from its flow` : '',
    of('manual').length ? `${of('manual').length} set by hand${unread ? ` (${unread} nothing reads)` : ''}` : '',
    of('derived').length ? `${of('derived').length} worked out` : '',
  ].filter(Boolean);
  return `${count(data.values.length, 'value', 'values')} asked: ${bits.join(', ')}.`;
}

/** The line about the flow, above the lists. */
export function flowLine(data: ValueReasons): string {
  const made = data.flow ? `Made by flow ${data.flow.code}${data.flow.name && data.flow.name !== data.flow.code ? ` · ${data.flow.name}` : ''}.` : 'It has no flow, so no operation reads any of its values.';
  if (!data.frozen) return made;
  const line = data.frozen.lineNo != null ? `Line ${data.frozen.lineNo}${data.frozen.orderCode ? ` of ${data.frozen.orderCode}` : ''}` : 'Its line';
  const why = data.frozen.reason === 'released' ? 'was released to production' : data.frozen.reason === 'closed' ? 'belongs to a closed order' : 'is frozen';
  return `${made} ${line} ${why}: this list was fixed when the design was frozen, and no longer follows the flow.`;
}
