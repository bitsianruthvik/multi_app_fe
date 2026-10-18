import type { NestCustomPlateSetting, NestGradeRule } from '../api/cutting';

/**
 * Setup › Cutting (§90, 2026-10-19): the words of the grade / impact rule and what the plate-rules card saves.
 * The server's rule: multi_app_be apps/cf_erp/lib/plateGrade.js.
 */
export const GRADE_RULE_WORDS: Record<NestGradeRule, string> = {
  warn: 'Warn only (default)',
  better: "Refuse: the piece's grade; its impact class or a better one",
  exact: 'Refuse: exactly the grade and impact class the piece asks',
  higher: 'Refuse: a higher grade of the same family may stand in; impact class equal or better',
};

/** The custom-plate limits as the card types them. */
export const PLATE_LIMITS: { key: keyof Omit<NestCustomPlateSetting, 'on'>; label: string }[] = [
  { key: 'maxLength', label: 'Longest' }, { key: 'maxWidth', label: 'Widest' },
  { key: 'minLength', label: 'Shortest' }, { key: 'minWidth', label: 'Narrowest' }, { key: 'step', label: 'Step' },
];
export type PlateLimitsDraft = Record<(typeof PLATE_LIMITS)[number]['key'], string>;

export const limitsDraft = (c?: NestCustomPlateSetting | null): PlateLimitsDraft =>
  Object.fromEntries(PLATE_LIMITS.map((f) => [f.key, c?.[f.key] == null ? '' : String(c[f.key])])) as PlateLimitsDraft;

/** A typed limit that is not a size: not a number of mm from 1 to 30 000 (blank is fine). */
export const badMm = (s: string) => s.trim() !== '' && !(Number(s) > 0 && Number(s) <= 30000);

/** The card's draft as the save sends it: blank = null. */
export function plateRulesBody(rule: NestGradeRule | '', on: boolean, d: PlateLimitsDraft): { gradeRule: NestGradeRule | null; customPlates: NestCustomPlateSetting } {
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  return { gradeRule: rule === '' ? null : rule, customPlates: { on, maxLength: n(d.maxLength), maxWidth: n(d.maxWidth), minLength: n(d.minLength), minWidth: n(d.minWidth), step: n(d.step) } };
}
