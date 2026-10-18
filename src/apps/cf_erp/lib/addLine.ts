/**
 * ADD LINE (three choices) and the New order dialog's values — the words and rules the dialogs share.
 * Pure: no React, no requests (scripts/cf_erp_add_line_choices_test.mjs reads them).
 */

export type AddChoice = 'parts' | 'standard' | 'drawing';

export interface ChoiceCard { key: AddChoice; hotkey: string; title: string; hint: string }

/** The three ways to add a line (user, 2026-10-18), in the order shown. A stock order only builds from the catalog. */
export function addChoices(orderType: 'customer' | 'stock'): ChoiceCard[] {
  const all: ChoiceCard[] = [
    { key: 'parts', hotkey: '1', title: 'Build from parts', hint: 'Pick a template (its parts are laid out at once) or a catalog item.' },
    { key: 'standard', hotkey: '2', title: 'From a standard drawing', hint: 'Type the drawing number — its BOM, values and part drawings are copied.' },
    { key: 'drawing', hotkey: '3', title: 'From a new drawing', hint: 'Upload a DWG or DXF. AI builds the line at once; rows to check are marked.' },
  ];
  return orderType === 'stock' ? all.filter((c) => c.key === 'parts') : all;
}

/** The choice a key picks ("1", "2", "3"), or null. */
export function choiceForKey(key: string, cards: ChoiceCard[]): AddChoice | null {
  return cards.find((c) => c.hotkey === key)?.key ?? null;
}

/** The next card on an arrow key, wrapping. */
export function moveChoice(current: number, key: string, count: number): number {
  if (!count) return 0;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count;
  return current;
}

/** The prefix a BOM line's note carries when AI was unsure of the row (BE drawingLineService.AI_FLAG). */
export const AI_FLAG = 'Check (by AI):';

/** A BOM line's note split: the AI flag's reasons (null when none) and the rest of the note. */
export function splitAiNote(notes: string | null | undefined): { ai: string | null; rest: string | null } {
  const parts = String(notes ?? '').split(' · ').map((p) => p.trim()).filter(Boolean);
  const ai = parts.find((p) => p.startsWith(AI_FLAG));
  const rest = parts.filter((p) => !p.startsWith(AI_FLAG)).join(' · ');
  return { ai: ai ? ai.slice(AI_FLAG.length).trim() : null, rest: rest || null };
}

/** What a drawing file is, before it is sent: { kind } or { error } in words (the server checks again). */
export function drawingFileKind(name: string): { kind: 'dxf' | 'dwg' } | { error: string } {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  if (ext === 'dxf' || ext === 'dwg') return { kind: ext };
  if (ext === 'pdf') return { error: 'Thanks — PDF drawings (scans) cannot be read by AI yet. Please upload the DWG or DXF of the drawing, or build the line from parts.' };
  return { error: 'The drawing must be a DWG or a DXF file.' };
}

/** "From the last order SO260012" / "Most templates" — under a prefilled field. */
export function prefillWord(from: 'last_order' | 'template' | undefined, lastOrderCode: string | null): string | null {
  if (from === 'last_order') return lastOrderCode ? `As on ${lastOrderCode}` : 'As on the last order';
  if (from === 'template') return 'What the templates use';
  return null;
}

/** The order values the New order dialog sends: every field with a value (an empty field sends nothing). */
export function defaultsToSend(inputs: Record<string, string>): { specCode: string; value: string }[] {
  return Object.entries(inputs).filter(([, v]) => v != null && String(v).trim() !== '').map(([specCode, value]) => ({ specCode, value: String(value).trim() }));
}

/** "22 rows to check" / "All checked". */
export function flagsWord(n: number): string {
  return n === 0 ? 'All checked' : `${n} ${n === 1 ? 'row' : 'rows'} to check`;
}
