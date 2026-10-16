/**
 * Cutting allowance (init.sql §64) — the words and the arithmetic the screens share. Mirrors
 * cutAllowanceService.extraMmOf / ruleWords / exampleOf on the server: keep them in step.
 */
import type { AllowanceRule, AllowanceScope, RuleInput } from '../api/cutAllowances';

const r1 = (n: number) => Math.round(n * 10) / 10;
/** "15 mm", "7.5 mm". */
export const mmText = (n: number) => `${r1(n)} mm`;

/** The extra length a rule gives a part of this drawn length: 2 × at each end + a metre × metres, to 0.1 mm. */
export function extraMm(rule: RuleInput | null | undefined, drawnLength: number | null | undefined): number {
  if (!rule) return 0;
  const L = Number(drawnLength) > 0 ? Number(drawnLength) : 0;
  return r1(2 * (Number(rule.perEndMm) || 0) + (Number(rule.perMetreMm) || 0) * (L / 1000));
}

/** "7.5 mm at each end", "5 mm at each end + 1 mm a metre", "none". */
export function ruleText(rule: RuleInput | null | undefined): string {
  if (!rule) return 'none';
  const bits: string[] = [];
  if (Number(rule.perEndMm)) bits.push(`${mmText(Number(rule.perEndMm))} at each end`);
  if (Number(rule.perMetreMm)) bits.push(`${mmText(Number(rule.perMetreMm))} a metre`);
  return bits.length ? bits.join(' + ') : 'none';
}

/** "11940 → 11955 mm (+15 mm)" — or "11940 mm, cut as drawn". */
export function exampleText(rule: RuleInput | null | undefined, drawnLength: number | null | undefined): string | null {
  const L = Number(drawnLength);
  if (!(L > 0)) return null;
  const e = extraMm(rule, L);
  return e ? `${r1(L)} → ${r1(L + e)} mm (+${mmText(e)})` : `${r1(L)} mm, cut as drawn`;
}

export const SCOPE_WORD: Record<AllowanceScope, string> = { customer: 'Customer default', order: 'This order', row: 'This row' };

/** Where the rule in force comes from, in words: "From the customer", "Set on this order", … */
export function sourceText(rule: AllowanceRule | null | undefined): string {
  if (!rule) return 'No allowance';
  return rule.scope === 'customer' ? 'From the customer' : rule.scope === 'order' ? 'Set on this order' : 'Set on this row';
}

/**
 * Reads the two inputs as typed. Returns the rule, or the sentence that says what is wrong.
 * Empty = 0. Never negative; at most 200 mm at an end and 20 mm a metre (the server's limits).
 */
export function readInputs(perEnd: string, perMetre: string): { rule: RuleInput } | { error: string } {
  const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
  const e = num(perEnd);
  const m = num(perMetre);
  if (!Number.isFinite(e) || !Number.isFinite(m)) return { error: 'Type a number of mm.' };
  if (e < 0 || m < 0) return { error: 'An allowance only makes a cut piece longer — no number below 0.' };
  if (e > 200) return { error: 'At most 200 mm at each end.' };
  if (m > 20) return { error: 'At most 20 mm a metre.' };
  return { rule: { perEndMm: e, perMetreMm: m } };
}

/** The follow-up of a save, in one sentence, or null. */
export function followUpText(r: { message?: string | null } | null | undefined): string | null {
  return r?.message ?? null;
}

/** The hover text of a cut piece's "+15 mm allowance": drawn → cut, and the rule when one rule made it. */
export function allowanceTitle(a: { drawnLength: number | null; cutLength: number; rule: { scope: AllowanceScope; perEndMm: number; perMetreMm: number } | null }): string {
  const bits: string[] = [];
  if (a.drawnLength != null) bits.push(`Drawn ${r1(a.drawnLength)} mm, cut ${r1(a.cutLength)} mm.`);
  else bits.push(`Cut ${r1(a.cutLength)} mm; its parts are drawn at different lengths.`);
  if (a.rule) bits.push(`${SCOPE_WORD[a.rule.scope]}: ${ruleText(a.rule)}.`);
  bits.push('The order weight stays as drawn.');
  return bits.join(' ');
}
