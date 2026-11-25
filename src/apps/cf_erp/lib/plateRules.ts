import type { NestCustomPlateSetting, NestGradeRule } from '../api/cutting';

/**
 * Setup › Cutting (§90, 2026-10-19): the words of the grade / impact rule and what the plate-rules card saves.
 * The server's rule: multi_app_be apps/cf_erp/lib/plateGrade.js.
 */
export const GRADE_RULE_WORDS: Record<NestGradeRule, string> = {
  warn: 'Warn only (never refuse)',
  better: "Refuse: the piece's grade; its impact class or a better one",
  exact: 'Refuse: exactly the grade and impact class the piece asks',
  higher: 'Refuse: a higher grade of the same family may stand in; impact class equal or better',
};

/** The custom-plate limits as the card types them. */
export const PLATE_LIMITS: { key: keyof Omit<NestCustomPlateSetting, 'on'>; label: string; unit?: string }[] = [
  { key: 'maxLength', label: 'Longest' }, { key: 'maxWidth', label: 'Widest' },
  { key: 'minLength', label: 'Shortest' }, { key: 'minWidth', label: 'Narrowest' }, { key: 'step', label: 'Step' },
  { key: 'minLotPieces', label: 'Least pieces of a size', unit: 'pcs' },
  { key: 'minLotTonnes', label: 'or least tonnes of a size', unit: 't' },
];
export type PlateLimitsDraft = Record<(typeof PLATE_LIMITS)[number]['key'], string>;

export const limitsDraft = (c?: NestCustomPlateSetting | null): PlateLimitsDraft =>
  Object.fromEntries(PLATE_LIMITS.map((f) => [f.key, c?.[f.key] == null ? '' : String(c[f.key])])) as PlateLimitsDraft;

/** The standard sizes as typed ("1500, 2000, 2500") and back. */
export const sizesText = (v?: number[] | null) => (v?.length ? v.join(', ') : '');
export const sizesOf = (s: string): number[] | null => { const v = s.split(/[,\s/]+/).filter(Boolean).map(Number); return v.length ? v : null; };
/** Typed standard sizes that are not all sizes in mm. */
export const badSizes = (s: string) => s.trim() !== '' && s.split(/[,\s/]+/).filter(Boolean).some((x) => !(Number(x) > 0 && Number(x) <= 30000));

/** A typed limit that is not a size: not a number of mm from 1 to 30 000 (blank is fine). */
export const badMm = (s: string) => s.trim() !== '' && !(Number(s) > 0 && Number(s) <= 30000);

/** The card's draft as the save sends it: blank = null. */
export function plateRulesBody(rule: NestGradeRule | '', on: boolean, d: PlateLimitsDraft, std: { widths: string; lengths: string } = { widths: '', lengths: '' }): { gradeRule: NestGradeRule | null; customPlates: NestCustomPlateSetting } {
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  return { gradeRule: rule === '' ? null : rule, customPlates: { on, maxLength: n(d.maxLength), maxWidth: n(d.maxWidth), minLength: n(d.minLength), minWidth: n(d.minWidth), step: n(d.step), minLotPieces: n(d.minLotPieces), minLotTonnes: n(d.minLotTonnes), standardWidths: sizesOf(std.widths), standardLengths: sizesOf(std.lengths) } };
}
