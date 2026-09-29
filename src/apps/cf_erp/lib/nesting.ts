import type {
  Nest, NestDrift, NestGroup, NestMetrics, NestPiece, NestSizeAdvice, NestVerdict, NestWaste, NestingPlan,
} from '../api/types';

/**
 * Words and arithmetic for the nesting screen.
 *
 * Everything a user reads about a layout is built here rather than glued
 * together in the component, for the same reason `lib/process.ts` exists: the
 * sentences are the product, and two screens must not word the same fact two
 * ways.
 *
 * THE TWO SIZES. `requiredLength`/`requiredWidth` is what the layout needs with
 * the kerf charged at the rim; `length`/`width` is the plate that is bought.
 * They are different numbers ON PURPOSE — plate edges are not straight, so the
 * shop orders +100 mm on length and +50 mm on width — and the screen shows both
 * rather than quietly reporting the difference as waste.
 */

/** A number of millimetres, grouped, and never with a decimal tail nobody reads. */
export const mm = (n: number | null | undefined): string =>
  (n == null || !Number.isFinite(n) ? '—' : `${Math.round(n * 10) / 10}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','));

export const mmPair = (l: number | null | undefined, w: number | null | undefined) => `${mm(l)} × ${mm(w)} mm`;

/** Kilograms, to the kilogram. Steel is not weighed in grams here. */
export const kg = (n: number | null | undefined): string =>
  (n == null || !Number.isFinite(n) ? '—' : `${Math.round(n)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','));

/** Tonnes, for figures that would otherwise be six digits wide. */
export const tonnes = (n: number | null | undefined): string =>
  (n == null || !Number.isFinite(n) ? '—' : (n / 1000).toFixed(n < 10_000 ? 2 : 1));

export const pct = (n: number | null | undefined): string =>
  (n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(1)}%`);

/** One steel, in the order the shop says it: 12 mm E350 MS. */
export const steelWord = (g: Pick<NestGroup, 'thickness' | 'grade' | 'material'>): string =>
  [`${mm(g.thickness)} mm`, g.grade, g.material].filter(Boolean).join(' ');

/** Where the numbers on screen came from, said in one line. */
export function basisWord(plan: NestingPlan): { label: string; family: 'success' | 'info' | 'neutral'; help: string } {
  if (plan.basis === 'proposal') {
    return {
      label: 'Proposal',
      family: 'info',
      help: 'Nothing here is written down yet. Accept it to make it the plan the shop cuts to.',
    };
  }
  if (plan.saved) {
    return {
      label: 'Saved plan',
      family: 'success',
      help: 'This is what was accepted, read back exactly as it was agreed. Opening the screen never re-packs it.',
    };
  }
  return {
    label: 'Nothing saved yet',
    family: 'neutral',
    help: 'No layout has been accepted for this line. Propose one to see what the steel would cost.',
  };
}

/** How hard the packer may look. The floor is deterministic, so more is never worse. */
export const EFFORTS = [
  { value: 'quick', label: 'Quick', help: 'One pass, no repairs. Seconds.' },
  { value: 'standard', label: 'Standard', help: 'Sixty repairs. The usual answer.' },
  { value: 'deep', label: 'Deep', help: 'Four hundred repairs. Minutes, and never a worse answer than Standard.' },
] as const;

export type Effort = typeof EFFORTS[number]['value'];

/**
 * THE MARGIN, AS IT ACTUALLY CAME OUT. The shop asks for +100 mm of length and
 * +50 mm of width over what the layout needs, because a mill edge is not
 * straight. The plate bought is a catalog size, so the margin it really carries
 * is whatever is left over — and that is worth showing, because it can be less
 * than asked for, which is exactly what `sizeAdvice` complains about.
 */
export interface Margin {
  length: number | null;
  width: number | null;
  wantLength: number | null;
  wantWidth: number | null;
  /** The plate is smaller than the layout needs — impossible from the packer, but a hand layout can do it. */
  short: boolean;
  /** It fits, but with less slack than the shop asks for. */
  thin: boolean;
}

export function marginOf(nest: Nest, group: Pick<NestGroup, 'orderMarginLengthMm' | 'orderMarginWidthMm'>): Margin {
  const length = nest.requiredLength == null ? null : nest.length - nest.requiredLength;
  const width = nest.requiredWidth == null ? null : nest.width - nest.requiredWidth;
  const wantLength = group.orderMarginLengthMm;
  const wantWidth = group.orderMarginWidthMm;
  return {
    length,
    width,
    wantLength,
    wantWidth,
    short: (length != null && length < 0) || (width != null && width < 0),
    thin: (length != null && wantLength != null && length >= 0 && length < wantLength)
      || (width != null && wantWidth != null && width >= 0 && width < wantWidth),
  };
}

/** The margin as a sentence, for the plate's hover text. */
export function marginSentence(m: Margin): string {
  if (m.length == null || m.width == null) return 'What the layout needs was not recorded with this plate, so the margin cannot be shown.';
  if (m.short) return 'This plate is smaller than the layout needs. It cannot be cut as drawn.';
  const asked = m.wantLength != null && m.wantWidth != null
    ? ` The shop asks for +${mm(m.wantLength)} and +${mm(m.wantWidth)}.`
    : '';
  return `${mm(m.length)} mm of length and ${mm(m.width)} mm of width are left over the layout — the slack a crooked mill edge is cut off.${asked}`;
}

/** Wastage, in the two units the shop argues in. */
export const wasteWord = (wasteKg: number, wastePct: number) => `${kg(wasteKg)} kg · ${pct(wastePct)}`;

/**
 * The cut order, said out loud. The sequence number is not a label: the floor
 * pierces sequence 1 in full, then 2, then 3, and that is what stops a part
 * shifting mid-cut.
 */
export function cutOrderSentence(nest: Nest): string {
  const n = nest.sequences.length;
  if (!n) return 'Nothing is placed on this plate.';
  if (n === 1) return 'One sequence: the whole plate is cut as one unit.';
  return `${n} sequences, cut in order — 1 in full, then 2${n > 2 ? `, then 3${n > 3 ? ' …' : ''}` : ''}. Piercing may not start on a later sequence.`;
}

/** A sequence holding more rows than its part size allows — worth saying, never hidden. */
export const sequenceOver = (s: { rows: number; rowsAllowed: number }) => s.rows > s.rowsAllowed;

/**
 * A stable colour per cut plate, so the same rectangle is the same colour on
 * every plate of the line. Eight chart tokens, both themes, then it wraps.
 */
export const PIECE_COLOURS = 8;
export const pieceColour = (index: number) => `var(--c-chart-${(index % PIECE_COLOURS) + 1})`;

/** Every cut plate the plan mentions, in a fixed order, so the colours never move. */
export function colourIndex(plan: NestingPlan): Map<number, number> {
  const ids = new Set<number>();
  for (const g of plan.groups) {
    for (const cp of g.cutPlates) ids.add(cp.id);
    for (const n of g.nests) for (const p of n.pieces) ids.add(p.cutPlateId);
  }
  const out = new Map<number, number>();
  [...ids].sort((a, b) => a - b).forEach((id, i) => out.set(id, i));
  return out;
}

/** Which cut plates are actually drawn on one plate, in the order they are cut. */
export function platePieceKinds(nest: Nest): { cutPlateId: number; cutPlateCode: string; count: number }[] {
  const by = new Map<number, { cutPlateId: number; cutPlateCode: string; count: number }>();
  for (const p of nest.pieces) {
    const hit = by.get(p.cutPlateId);
    if (hit) hit.count += 1;
    else by.set(p.cutPlateId, { cutPlateId: p.cutPlateId, cutPlateCode: p.cutPlateCode, count: 1 });
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.cutPlateCode.localeCompare(b.cutPlateCode));
}

/** One sequence's band on the plate, derived from its pieces rather than stored. */
export interface SeqBand {
  seqNo: number;
  y0: number;
  y1: number;
  rows: { rowNo: number; y0: number; y1: number; pieces: PlacedPiece[] }[];
  size: 'small' | 'big';
  rowsAllowed: number;
}

/** A piece we have a place for. An imported nest we could not fit has pieces with no x/y. */
export type PlacedPiece = NestPiece & { x: number; y: number };

export const placedPieces = (nest: Nest): PlacedPiece[] =>
  nest.pieces.filter((p): p is PlacedPiece => p.x != null && p.y != null);

export function bandsOf(nest: Nest): SeqBand[] {
  const bySeq = new Map<number, PlacedPiece[]>();
  for (const p of placedPieces(nest)) {
    const list = bySeq.get(p.seqNo);
    if (list) list.push(p);
    else bySeq.set(p.seqNo, [p]);
  }
  const summary = new Map(nest.sequences.map((s) => [s.seqNo, s]));
  return [...bySeq.entries()].sort((a, b) => a[0] - b[0]).map(([seqNo, pieces]) => {
    const byRow = new Map<number, PlacedPiece[]>();
    for (const p of pieces) {
      const list = byRow.get(p.rowNo);
      if (list) list.push(p);
      else byRow.set(p.rowNo, [p]);
    }
    const s = summary.get(seqNo);
    return {
      seqNo,
      y0: Math.min(...pieces.map((p) => p.y)),
      y1: Math.max(...pieces.map((p) => p.y + p.width)),
      rows: [...byRow.entries()].sort((a, b) => a[0] - b[0]).map(([rowNo, ps]) => ({
        rowNo,
        y0: Math.min(...ps.map((p) => p.y)),
        y1: Math.max(...ps.map((p) => p.y + p.width)),
        pieces: ps.slice().sort((x, y) => x.posNo - y.posNo || x.x - y.x),
      })),
      size: s?.size ?? 'big',
      rowsAllowed: s?.rowsAllowed ?? 3,
    };
  });
}

/** `sizeAdvice` in one sentence, whichever of its two shapes it is. */
export function adviceSentence(a: NestSizeAdvice): string {
  if (a.detail) return a.detail;
  const on = `${mm(a.sheetLength)} × ${mm(a.sheetWidth)} mm`;
  const want = `${mm(a.orderLength)} × ${mm(a.orderWidth)} mm`;
  const many = (a.nests ?? 1) > 1 ? `${a.nests} plates of ` : '';
  return `${many}${on} carry a layout that only needs ${mm(a.needLength)} × ${mm(a.needWidth)} mm. A ${want} plate — which nobody stocks — would buy ${pct(a.savingPct)} less steel.`;
}

/**
 * THE SAME ADVICE ONCE. The API reports the ordering margin PER LOT, so a line
 * that buys forty identical plates says the identical sentence forty times.
 * Identical sentences are one row with a count — the reader learns nothing from
 * the thirty-nine repeats, and the useful ones are buried underneath them.
 */
export function dedupeAdvice(list: NestSizeAdvice[]): { advice: NestSizeAdvice; count: number }[] {
  const by = new Map<string, { advice: NestSizeAdvice; count: number }>();
  for (const a of list) {
    const key = `${a.kind ?? 'catalog'}|${a.plateCode ?? a.sheetKey ?? ''}|${adviceSentence(a)}`;
    const hit = by.get(key);
    if (hit) hit.count += 1;
    else by.set(key, { advice: a, count: 1 });
  }
  // Worst first: the catalogue gaps quote a saving, the margin ones do not.
  return [...by.values()].sort((x, y) => (y.advice.savingPct ?? 0) - (x.advice.savingPct ?? 0) || y.count - x.count);
}

/**
 * `lotNo` is null on the ordering-margin advice because the API numbers its
 * lots after it collects the advice, so the plate's code is what names it.
 */
export const adviceTitle = (a: NestSizeAdvice): string =>
  (a.kind === 'ordering margin'
    ? `${a.lotNo ?? a.plateCode ?? 'A plate'} — the ordering margin does not fit`
    : `${steelWord(a as never)} — a size nobody stocks`);

/**
 * The slim body `POST …/nesting/accept` reads. Everything else it takes from the database.
 * Imported plates are left out: accepting keeps them as they are and only
 * replaces the automatic ones.
 */
export function acceptBody(plan: NestingPlan) {
  return {
    nests: plan.groups.flatMap((g) => g.nests.filter((n) => !isImported(n)).map((n) => ({
      lotNo: n.lotNo,
      plateItemId: n.plateItemId,
      source: n.source,
      isManual: n.isManual ?? false,
      pieces: n.pieces.map((p) => ({
        cutPlateId: p.cutPlateId,
        seqNo: p.seqNo,
        rowNo: p.rowNo,
        x: p.x,
        y: p.y,
        length: p.length,
        width: p.width,
        rotated: p.rotated,
      })),
    }))),
  };
}

/** Said before the Accept button, so the commitment is read before it is made. */
export const ACCEPT_WHAT_HAPPENS = [
  'Each plate becomes a lot: one physical plate this line will draw from stock.',
  'Every piece is written down where it sits, in cut order, so the floor cuts what is on screen.',
  'The plate quantity on each cut plate stops being an area fraction and becomes this plan.',
];

/**
 * One out-of-date rectangle in words, after its code — the three ways a saved
 * layout stops matching the structure (nestingService.layoutDrift).
 */
export function driftWords(d: NestDrift): string {
  if (d.why === 'gone') return ` — no longer in the structure; the layout still places ${d.placed}.`;
  if (d.why === 'unplaced') return ` — the line needs ${d.needs}, and the layout places none.`;
  return ` — the line needs ${d.needs}, the layout places ${d.placed}.`;
}

export const ACCEPT_AGAIN = 'Accepting again replaces the automatic plates — the old ones are removed, not added to. Imported plates stay as they are.';

/** Said in place of hiding the buttons, so a read-only role learns why it cannot act. */
export const NO_MANAGE = 'You can see this layout, but your role cannot change the order. Ask an administrator for the sales-order permission.';

export const MANUAL_HELP = 'Bring these in with the Excel sheet.';

export const LOOK_IS_A_LOOK = 'Opening this reads the saved plan. It never re-packs, so what you see is what was agreed.';

// ── Imported nests, the rule check, waste by cause, offcuts ──────────────────

export const isImported = (n: Pick<Nest, 'origin'>) => n.origin === 'imported';

/** Absent on the old API, which only ever sent plates it had laid out itself. */
export const hasLayout = (n: Pick<Nest, 'hasLayout'>) => n.hasLayout !== false;

export const NO_LAYOUT = 'No layout from us — cut it with the program it came from.';

/** The check's answer in words. The API's codes never reach the screen. */
export const VERDICT: Record<NestVerdict, { label: string; family: 'success' | 'warning' | 'danger'; help: string }> = {
  fits: { label: 'Fits', family: 'success', help: 'We laid it out on this plate with our rules.' },
  tight: { label: 'Tight', family: 'warning', help: "Area is enough but our layout couldn't fit it — their program may." },
  wont_fit: { label: "Won't fit", family: 'danger', help: 'Not enough plate, or the wrong steel.' },
};

export const verdictOf = (v: string | null | undefined) => (v && v in VERDICT ? VERDICT[v as NestVerdict] : null);

/** The six parts of a plate, in the order they are drawn and listed. */
export const WASTE_KEYS = ['parts', 'kerf', 'sequenceGaps', 'rim', 'offcut', 'wastage', 'noLayout'] as const;
export type WasteKey = typeof WASTE_KEYS[number];

export const WASTE_LABEL: Record<WasteKey, string> = {
  parts: 'Parts', kerf: 'Kerf', sequenceGaps: 'Sequence gaps', rim: 'Rim', offcut: 'Offcut', wastage: 'Wastage', noLayout: 'No layout',
};

export const WASTE_HELP: Record<WasteKey, string> = {
  parts: 'The cut plates themselves.',
  kerf: 'Steel the cut burns away around each part.',
  sequenceGaps: 'The gaps left between sequences.',
  rim: 'The strip along the plate edge.',
  offcut: 'Pieces big enough to keep and use again.',
  wastage: 'What is left — scrap.',
  noLayout: 'Plates we have no layout for, so we cannot split them.',
};

export const WASTE_COLOUR: Record<WasteKey, string> = {
  parts: 'var(--c-primary-500)',
  kerf: 'var(--c-neutral-600)',
  sequenceGaps: 'var(--c-info-600)',
  rim: 'var(--c-primary-200)',
  offcut: 'var(--c-success-600)',
  wastage: 'var(--c-danger-600)',
  noLayout: 'var(--c-neutral-200)',
};

const isWaste = (v: unknown): v is NestWaste => !!v && typeof v === 'object' && 'wastage' in (v as object);

/** Everything the parts do not cover, in kg, whichever shape the API sent. */
export function wasteTotalKg(x: Pick<Nest | NestMetrics, 'wasteKg' | 'wasteTotalKg'>): number {
  if (typeof x.wasteTotalKg === 'number') return x.wasteTotalKg;
  const w = x.wasteKg;
  if (typeof w === 'number') return w;
  if (isWaste(w)) return w.kerf + w.sequenceGaps + w.rim + w.offcut + w.wastage;
  return 0;
}

export interface WastePart { key: WasteKey; label: string; kg: number; pct: number }

/**
 * The plate split by cause, in kg and % of the plate. Null when the API sent no
 * breakdown (the old API, or a plan saved before it existed). Kilograms come
 * straight from the API when it sends them, else from the mm² in proportion to
 * the plate's weight — the same steel, so the same kg per mm².
 */
export function wasteBreakdown(
  x: { weightKg: number; wasteKg: number | NestWaste; waste?: NestWaste | null; partsKg?: number },
  plateArea: number,
): WastePart[] | null {
  let kgs: NestWaste | null = null;
  if (isWaste(x.wasteKg)) kgs = x.wasteKg;
  else if (isWaste(x.waste) && plateArea > 0 && x.weightKg > 0) {
    const r = x.weightKg / plateArea;
    const w = x.waste;
    kgs = { kerf: w.kerf * r, sequenceGaps: w.sequenceGaps * r, rim: w.rim * r, offcut: w.offcut * r, wastage: w.wastage * r };
  }
  if (!kgs) return null;
  const total = x.weightKg || 0;
  const wasteSum = kgs.kerf + kgs.sequenceGaps + kgs.rim + kgs.offcut + kgs.wastage;
  // Parts from the API when it says; a plate with no layout has parts and waste of
  // zero, and what is left of its weight is shown as No layout, not as parts.
  const parts = typeof x.partsKg === 'number' ? x.partsKg : Math.max(total - wasteSum, 0);
  const rest = Math.max(total - parts - wasteSum, 0);
  const values: Record<WasteKey, number> = { parts, ...kgs, noLayout: rest > total * 0.001 ? rest : 0 };
  return WASTE_KEYS.filter((key) => key !== 'noLayout' || values.noLayout > 0).map((key) => ({
    key, label: WASTE_LABEL[key], kg: values[key], pct: total > 0 ? (values[key] / total) * 100 : 0,
  }));
}

/** The line's offcuts, counted from its plates. */
export function lineOffcuts(plan: NestingPlan): { count: number; kg: number } {
  const all = plan.groups.flatMap((g) => g.nests.flatMap((n) => n.offcuts ?? []));
  return { count: plan.totals.offcuts ?? all.length, kg: all.reduce((a, o) => a + (o.weightKg || 0), 0) };
}

/** True once any plate on the line came in from the sheet. */
export const anyImported = (plan: NestingPlan) => plan.groups.some((g) => g.nests.some(isImported));
