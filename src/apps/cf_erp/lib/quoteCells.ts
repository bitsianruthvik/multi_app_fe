/**
 * A typed cell that saves itself (the PR quote grid's rate cells, pages/PurchaseRequestDetail.tsx) — the rules that
 * keep fast typing safe (walkthrough 2026-10-18 step 42: typing quickly lost or doubled rates, because every save
 * re-read the PR and wrote the server's answer into the cell under the cursor). Pure, no React:
 *
 *   - while a cell has focus, what is typed is the cell's; a server answer never overwrites it (it only moves `base`);
 *   - a cell whose own save is on its way keeps what was typed until that save answers;
 *   - a cell typed in and not yet sent keeps it too;
 *   - otherwise (idle, nothing waiting) the cell shows what the server says — so another person's change, or a
 *     re-read, still reaches it.
 *
 * `base` is the last value the server is known to hold for the cell; `sent` the text whose save is on its way.
 */
export interface CellDraft {
  text: string;
  base: string;
  focused: boolean;
  sent: string | null;
}

export const draftOf = (server: string): CellDraft => ({ text: server, base: server, focused: false, sent: null });

const same = (a: string, b: string) => a.trim() === b.trim();

/** A server answer arrives for this cell. */
export function reconcile(d: CellDraft, server: string): CellDraft {
  const typedAhead = d.focused || d.sent != null || !same(d.text, d.base);
  return typedAhead ? { ...d, base: server } : { ...d, text: server, base: server };
}

/** What a save would send now: the text, when it differs from the server and is not already on its way. */
export function toSend(d: CellDraft): string | null {
  if (d.sent != null) return null;
  return same(d.text, d.base) ? null : d.text.trim();
}

/** The save of `sent` answered: `server` is the cell's value in the answer (null = the save failed). */
export function settle(d: CellDraft, server: string | null): CellDraft {
  const sent = d.sent;
  if (server == null) return { ...d, sent: null };                     // failed: the typed text stays, to try again
  const next = { ...d, sent: null, base: server };
  // The answer is shown unless the person typed on while it was on its way (then their newer text waits for its own save).
  if (!d.focused && sent != null && same(d.text, sent)) next.text = server;
  return next;
}

/**
 * A rate as typed: "62", "62.5", "1,250" (Indian or Western grouping), "₹ 62". Empty = no quote (null).
 * Anything else is 'invalid' — never sent.
 */
export function parseRate(text: string): number | null | 'invalid' {
  const t = text.replace(/[₹\s]/g, '').replace(/,/g, '');
  if (t === '') return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return 'invalid';
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

/** The text a server rate is shown as (the same text a re-read gives, so an unchanged cell compares equal). */
export const rateText = (rate: number | null | undefined) => (rate == null ? '' : String(rate));

