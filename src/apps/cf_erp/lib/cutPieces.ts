/**
 * What the Cut pieces table's Plate column says.
 *
 * A cut piece is not cut from a plate until nesting lays it out, so most of the
 * time the honest answer is "chosen at nesting". Once nested it is the nest lot
 * (the sheet it is cut from); a plate somebody chose by hand shows as itself.
 */
export interface PlateCell {
  plate: { code: string | null; name: string | null; isSelection?: boolean } | null;
  nest?: { nestNo?: string | null; code?: string | null } | null;
}

export const CHOSEN_AT_NESTING = 'chosen at nesting';

export function plateText(b: PlateCell): string {
  const lot = b.nest?.nestNo ?? b.nest?.code ?? null;
  if (lot) return b.plate?.code ? `${lot} · ${b.plate.code}` : lot;
  if (!b.plate || b.plate.isSelection) return CHOSEN_AT_NESTING;
  return b.plate.code ?? b.plate.name ?? '—';
}

/** "Cut pieces (12)" — the Nesting button's words: the count when it is known, else just the name. */
export const cutPiecesLabel = (count: number | null | undefined) => (count == null ? 'Cut pieces' : `Cut pieces (${count})`);
