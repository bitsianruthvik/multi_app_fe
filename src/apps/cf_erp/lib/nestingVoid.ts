import type { OrderStage } from '../api/types';

/*
 * NESTING BEFORE THE FREEZE (user, 2026-11-01: "Once the BoM + diagrams are there, we should be able to run nesting.
 * … if the structure changes, throw a warning that the nesting will be void, then void it"). A custom line is nested
 * before it is locked; a save that changes what has to be cut takes every saved plate of the line off
 * (cutPlateService.withCutPieces → voidNestingIfMoved) and says so with `nestingVoided` on its answer. Pure.
 */

/** What a save's answer says when it voided the line's nesting. */
export interface NestingVoided { voided: boolean; plates?: number; why?: string | null; message?: string | null }

/** The warning to show after a save, or null when the save left the nesting alone. */
export function nestingVoidedNote(out: unknown): string | null {
  const v = out && typeof out === 'object' ? (out as { nestingVoided?: NestingVoided | null }).nestingVoided : null;
  if (!v?.voided) return null;
  return v.message || `The structure changed, so the nesting is void${v.plates ? `: ${v.plates} plate${v.plates === 1 ? ' was' : 's were'} taken off` : ''}. Nest the line again.`;
}

/** Every voided note of an answer that covers several lines (`lines: [{ lineId, nestingVoided }]`), else its own. */
export function nestingVoidedNotes(out: unknown): string[] {
  const lines = out && typeof out === 'object' ? (out as { lines?: unknown[] }).lines : null;
  if (Array.isArray(lines)) return lines.map(nestingVoidedNote).filter((x): x is string => !!x);
  const one = nestingVoidedNote(out);
  return one ? [one] : [];
}

/**
 * Is the line nested — plates saved — from its Nesting stage (the process view, processService)? The stage says
 * "37 plates laid out, …" when a plan is saved, and "The nesting is out of date — …" when one is saved but the
 * structure has moved since. `nested.plates` is read first if the server sends it. null = not nested.
 */
export function nestedState(stages: OrderStage[] | null | undefined): { plates: number | null } | null {
  const st = (stages ?? []).find((s) => s.stageKey === 'nesting');
  if (!st || !st.applies) return null;
  const given = (st as OrderStage & { nested?: { plates?: number } | null }).nested?.plates;
  if (typeof given === 'number') return given > 0 ? { plates: given } : null;
  const m = /^([\d,]+) plates? laid out/.exec(st.detail ?? '');
  if (m) {
    const n = Number(m[1].replace(/,/g, ''));
    return n > 0 ? { plates: n } : null;
  }
  if (/^The nesting is out of date/.test(st.detail ?? '')) return { plates: null };
  return null;
}

/** The banner on a nested line's structure, before any change is made. */
export function nestedBanner(n: { plates: number | null }): string {
  const plates = n.plates == null ? 'its plates are saved' : `${n.plates.toLocaleString('en-IN')} plate${n.plates === 1 ? '' : 's'}`;
  return `This line is nested (${plates}). A change to the structure — quantities, sizes, parts added or removed — voids the nesting.`;
}
