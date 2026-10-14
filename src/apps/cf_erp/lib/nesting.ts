import type {
  Nest, NestDrift, NestGroup, NestMetrics, NestPiece, NestRunSnapshot, NestSizeAdvice, NestVerdict, NestWaste, NestingPlan,
} from '../api/types';
import type { CompareMetrics, NestExtras, NestFileRead, PieceExtras } from '../api/nesting';

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
      help: 'Nothing here is written down yet. Use it to make it the plan the shop cuts to.',
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
  { value: 'quick', name: 'Quick', label: '5 min', help: 'Up to 5 minutes.', bound: '5 minutes' },
  { value: 'standard', name: 'Standard', label: '10 min', help: 'Up to 10 minutes.', bound: '10 minutes' },
  { value: 'deep', name: 'Deep', label: '20 min', help: 'Up to 20 minutes.', bound: '20 minutes' },
  { value: 'long', name: 'Long', label: '1 hour', help: 'Up to 1 hour.', bound: '1 hour' },
] as const;

/** Said once under every time picker. */
export const EFFORT_LINE = 'These are ceilings. A small line finishes early.';

/** For the long level: the run belongs to the server, not to this page. */
export const EFFORT_LONG_LINE = 'A long run keeps going on the server if you close this page. Come back later for the result.';

/** "40 s ago", "3 min ago" from milliseconds. */
export function agoWords(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** "Picked up again after an interruption (2 times)", or null when the run never was. */
export function resumedLine(resumes: number | null | undefined, resumed: boolean | null | undefined): string | null {
  const n = resumes ?? (resumed ? 1 : 0);
  if (!n) return null;
  return `Picked up again after an interruption (${n} ${n === 1 ? 'time' : 'times'})`;
}

/** A run made by the offline runner on a developer's computer is an ordinary ready run that says where it came from. */
export function offlineLine(startedBy: string | number | null | undefined, when: string | null | undefined): string | null {
  if (typeof startedBy !== 'string' || !startedBy.toLowerCase().startsWith('offline runner')) return null;
  const d = when ? new Date(when) : null;
  const at = d && !Number.isNaN(d.getTime())
    ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  return at ? `Nested on a computer, ${at}` : 'Nested on a computer';
}

export type Effort = typeof EFFORTS[number]['value'];

/** The plan response's `budget` — only what the screen reads. */
export interface NestingBudget { effort?: string; capped?: boolean }

/** 130 seconds as "2:10". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The quiet line shown while a proposal runs. */
export function progressLine(pieces: number | null, seconds: number, effort: Effort): string {
  const e = EFFORTS.find((x) => x.value === effort) ?? EFFORTS[1];
  const what = pieces ? `Packing ${pieces.toLocaleString('en-US')} pieces…` : 'Packing…';
  return `${what} ${clock(seconds)} — up to ${e.bound}`;
}

// ── Starting a run ("Nest it ourselves") ─────────────────────────────────────

/** The three runs one dialog starts: the whole line, what the customer's files left over, the whole line over again. */
export type StartMode = 'all' | 'rest' | 'again';

export const PLATES_NOT_CHOSEN = 'Choose which plates to use before nesting.';
export const STEEL_BLOCKED = 'Nesting is blocked until each steel has a plate ticked.';

export const START_HEAD: Record<StartMode, string> = { all: 'Nest it ourselves', rest: 'Nest the rest ourselves', again: 'Start again' };

/** What the run will do, in the sentence the button's tooltip always carried. */
export function startSentence(mode: StartMode, imported: boolean): string {
  if (mode === 'again') {
    return imported
      ? 'Lays out the whole line again, automatically. Accepting it replaces the imported nests too.'
      : 'Lays out the whole line again, automatically. Using the result replaces the plates saved now.';
  }
  return imported
    ? 'Lays out what the imported nests do not cover. Imported plates stay. Nothing is written until you use the result.'
    : 'Lays out every cut piece on the line. Nothing is written until you use the result.';
}

export const CAPPED_LINE = 'Stopped at the time limit — a longer run may find a little less waste.';

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
  if (isFreeLayout(nest)) {
    const pieces = (nest.pieces ?? []).length;
    return pieces ? `Cut order: 1 to ${pieces}, along the plate. Cut-outs are cut before the outline of each part. This plate has no rows or sequences.` : 'Nothing is placed on this plate.';
  }
  const n = (nest.sequences ?? []).length;
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
  const additions = additionsOf(plan);
  return {
    // Nest the rest on a customer's plates: the pieces added to them go back whole (nesting v2, section 5).
    ...(additions.length ? { additions } : {}),
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

export const MANUAL_HELP = 'Automatic nesting leaves these alone. Bring them in with nesting files.';

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
  if (isWaste(w)) return (w.kerf || 0) + (w.sequenceGaps || 0) + (w.rim || 0) + (w.offcut || 0) + (w.wastage || 0);
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
  const wasteSum = (kgs.kerf || 0) + (kgs.sequenceGaps || 0) + (kgs.rim || 0) + (kgs.offcut || 0) + (kgs.wastage || 0);
  // Parts from the API when it says; a plate with no layout has parts and waste of
  // zero, and what is left of its weight is shown as No layout, not as parts.
  const parts = typeof x.partsKg === 'number' ? x.partsKg : Math.max(total - wasteSum, 0);
  const rest = Math.max(total - parts - wasteSum, 0);
  const values: Record<WasteKey, number> = { parts, ...kgs, noLayout: rest > total * 0.001 ? rest : 0 };
  // A free layout has no sequence gaps: the cause is dropped when there is none, not shown as a zero.
  return WASTE_KEYS.filter((key) => (key !== 'noLayout' || values.noLayout > 0) && (key !== 'sequenceGaps' || values.sequenceGaps > 0)).map((key) => ({
    key, label: WASTE_LABEL[key], kg: values[key] || 0, pct: total > 0 ? ((values[key] || 0) / total) * 100 : 0,
  }));
}

/** The line's offcuts, counted from its plates. */
export function lineOffcuts(plan: NestingPlan): { count: number; kg: number } {
  const all = plan.groups.flatMap((g) => g.nests.flatMap((n) => n.offcuts ?? []));
  return { count: plan.totals.offcuts ?? all.length, kg: all.reduce((a, o) => a + (o.weightKg || 0), 0) };
}

/** True once any plate on the line came in from the sheet. */
export const anyImported = (plan: NestingPlan) => plan.groups.some((g) => g.nests.some(isImported));

/** "3 pieces left out · 1 plate excluded" — the nesting choices (init.sql §40), said once for the stage and the steps. */
export function choicesLine(c: { summary: { piecesLeftOut: number; platesExcluded: number } }): string {
  const s = c.summary;
  return `${s.piecesLeftOut} ${s.piecesLeftOut === 1 ? 'piece' : 'pieces'} left out · ${s.platesExcluded} ${s.platesExcluded === 1 ? 'plate' : 'plates'} excluded`;
}

// ── Background runs (the server owns the run; the screen only watches it) ──

export const RUN_CARRIES_ON = 'Nesting is running in the background — you can leave this page; it carries on.';
export const RUN_INTERRUPTED = 'The run was interrupted (the server restarted) — start it again.';

/** What the run is doing, in the words the shop floor would use. */
export function phaseWords(run: Pick<NestRunSnapshot, 'phase' | 'progress'>): string {
  switch (run.phase) {
    case 'reading': return 'Reading the order';
    case 'grouping': return 'Grouping by steel';
    case 'packing': return `Packing plates (${run.progress.done}/${run.progress.total} tries)`;
    case 'shaping': return 'Choosing the best layouts';
    case 'done': return 'Finished';
    default: return 'Stopped';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS in the browser's own time. */
export function logTime(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "Started by 4 at 14:02". The server may send a name or an id. */
export function startedLine(run: Pick<NestRunSnapshot, 'startedAt' | 'startedBy'>): string {
  const who = run.startedBy != null && run.startedBy !== '' ? ` by ${run.startedBy}` : '';
  const d = new Date(run.startedAt);
  const when = Number.isNaN(d.getTime()) ? '' : ` at ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Started${who}${when}`;
}



/** "125 plates · 2,944 pieces · 6.0% waste · 2 problems" */
export function runSummary(run: Pick<NestRunSnapshot, 'summary'>): string {
  const s = run.summary;
  if (!s) return '';
  const n = (x: number) => x.toLocaleString('en-US');
  return [
    `${n(s.plates)} ${s.plates === 1 ? 'plate' : 'plates'}`,
    `${n(s.pieces)} ${s.pieces === 1 ? 'piece' : 'pieces'}`,
    ...(s.wastePct != null ? [`${s.wastePct.toFixed(1)}% waste`] : []),
    `${n(s.problems)} ${s.problems === 1 ? 'problem' : 'problems'}`,
  ].join(' · ');
}

/* ===========================================================================
 * NESTING v2 — the customer's files, and the comparison (CF_ERP_NESTING_V2.md)
 * ======================================================================== */

type V2Nest = Nest & NestExtras;

/** True for a plate whose layout is the customer's own: a DXF of theirs, or a nest of their ProNest job. */
export const isCustomerPlate = (n: object): boolean => {
  const v = n as NestExtras;
  return v.layoutOrigin === 'customer' || v.sourceKind === 'dxf' || v.sourceKind === 'pronest';
};

/** True for a plate saved from a ProNest job file (.nif). */
export const isProNestPlate = (n: object): boolean => (n as NestExtras).sourceKind === 'pronest';

/** Where a plate's layout came from, in the words the card shows. */
export function originLine(n: Nest): string {
  const v = n as V2Nest;
  if (isProNestPlate(v)) return `ProNest job${v.sourceFile ? ` · ${v.sourceFile}` : ''}`;
  if (isCustomerPlate(v)) return `Customer's layout${v.sourceFile ? ` · ${v.sourceFile}` : ''}`;
  if (v.sourceKind === 'sheet') return 'From the Excel sheet';
  return 'Nested here';
}

/**
 * A ProNest plate's nest number, read off its lot number. The backend numbers
 * a job's plates "<job>-N<nn>", and "-<k>" when the nest is cut on several
 * plates (CF_ERP_NESTING_V2.md, "ProNest job files" §C). null when the lot
 * number is not of that form — the badge then names the job only.
 */
export function proNestNumber(lotNo: string | null | undefined): { nest: number; plate: number | null } | null {
  const m = /-N(\d+)(?:-(\d+))?$/.exec(lotNo ?? '');
  return m ? { nest: Number(m[1]), plate: m[2] ? Number(m[2]) : null } : null;
}

/** THE BADGE THAT SAYS WHERE A PLATE CAME FROM: ProNest / DXF / Excel sheet / Ours. `jobName` is the files route's, when it is loaded. */
export function plateSource(n: Nest, jobName?: string | null): { kind: 'pronest' | 'dxf' | 'sheet' | 'ours'; label: string; help: string } {
  const v = n as V2Nest;
  if (isProNestPlate(v)) {
    const no = proNestNumber(n.lotNo);
    const job = jobName || (v.sourceFile ?? '').replace(/\.nif$/i, '');
    return {
      kind: 'pronest', label: 'ProNest',
      help: `Copied from a ProNest job${job ? `: ${job}` : ''}${no ? `, nest ${no.nest}${no.plate ? ` (plate ${no.plate} of that nest)` : ''}` : ''}.`,
    };
  }
  if (isCustomerPlate(v)) return { kind: 'dxf', label: 'DXF', help: `Copied from a DXF nesting file${v.sourceFile ? `: ${v.sourceFile}` : ''}.` };
  if (isImported(n)) return { kind: 'sheet', label: 'Excel sheet', help: 'Brought in from the Excel sheet.' };
  return { kind: 'ours', label: 'Ours', help: 'Laid out by our packer.' };
}

/**
 * WHERE A CUT PIECE'S SHAPE CAME FROM. The server says it (`shapeFrom`,
 * 2026-10-13) on every cut plate and every piece: the part drawing's outline,
 * the customer's own outline on that plate, or the rectangle LENGTH × WIDTH.
 * Anything else — an older API, a value this screen does not know — is null,
 * and the screen then says nothing rather than guess.
 */
export type ShapeSource = 'nesting file' | 'drawing' | 'dimensions';

export const SHAPE_SOURCE_WORDS: Record<ShapeSource, string> = {
  'nesting file': 'from nesting file', drawing: 'from drawing', dimensions: 'from dimensions',
};

/** Said ONCE on a job's header when every piece of it agrees — not on every chip (2026-10-14). */
export const SHAPE_JOB_WORDS: Record<ShapeSource, string> = {
  'nesting file': 'Shapes as nested in the file', drawing: 'Shapes from the part drawings', dimensions: 'Shapes as rectangles, from the dimensions',
};

/** The field's value when it is one of the three; null otherwise. Test for the VALUE: the field is on everything now. */
export const shapeSourceOf = (value: unknown): ShapeSource | null =>
  (value === 'nesting file' || value === 'drawing' || value === 'dimensions' ? value : null);

export const shapeSourceOfPiece = (piece: object): ShapeSource | null => shapeSourceOf((piece as PieceExtras).shapeFrom);

/** Per cut piece of the plan, from its cut-plate entry: the source, and the note when it is its rectangle although a drawing exists. */
export function shapeSources(plan: Pick<NestingPlan, 'groups'>): Map<number, { from: ShapeSource; note: string | null }> {
  const out = new Map<number, { from: ShapeSource; note: string | null }>();
  for (const g of plan.groups) for (const cp of g.cutPlates) {
    const src = shapeSourceOf(cp.shapeFrom);
    if (src && !out.has(cp.id)) out.set(cp.id, { from: src, note: cp.shapeNote ?? null });
  }
  return out;
}

/** The pieces of one cut plate on one plate: the source they agree on, else null. */
export function shapeSourceOnPlate(pieces: { cutPlateId: number }[], cutPlateId: number): ShapeSource | null {
  const seen = new Set(pieces.filter((p) => p.cutPlateId === cutPlateId).map(shapeSourceOfPiece));
  const [only] = [...seen];
  return seen.size === 1 ? only : null;
}

/** A plate drawn by true shape has no rows or sequences, so it is coloured by part. */
export const isFreeLayout = (n: Nest): boolean => {
  const v = n as V2Nest;
  return v.layout === 'free' || isCustomerPlate(v) || ((v.sequences ?? []).length === 0 && (v.pieces ?? []).length > 0);
};

/** How many pieces on a plate our packer added to a customer's layout. */
export const ourPieceCount = (n: Nest): number =>
  (n.pieces as (NestPiece & PieceExtras)[]).filter((p) => p.placedBy === 'ours').length;

/** One uploaded file as a plate, so the plate diagram can draw the preview. */
export function fileNest(f: NestFileRead): Nest {
  const L = f.plate?.length ?? 1;
  const W = f.plate?.width ?? 1;
  const outside = new Set(f.errors.filter((e) => e.code === 'OUTSIDE_PLATE' && e.partId).map((e) => e.partId as string));
  const pieces = f.placements.map((p, i) => ({
    cutPlateId: p.cutPlateId, cutPlateCode: p.cutPlateCode, seqNo: 1, rowNo: 1, posNo: i + 1,
    x: p.x, y: p.y, length: p.length, width: p.width, rotated: p.rotationDeg === 90 || p.rotationDeg === 270,
    rotationDeg: p.rotationDeg, mirrored: p.mirrored, placedBy: p.placedBy ?? 'customer', area: p.area, rings: p.rings,
    shapeFrom: p.shapeFrom, outside: !!p.partId && outside.has(p.partId),
  }));
  const v2: NestExtras = { layoutOrigin: 'customer', sourceKind: f.sourceKind ?? 'dxf', sourceFile: f.sourceFile ?? f.filename, layout: 'free', scrap: f.scrap };
  return {
    lotNo: f.lotNo ?? f.nestNo ?? f.filename, plateItemId: f.plate?.itemId ?? null, plateCode: f.plate?.code ?? null, plateName: f.plate?.code ?? null,
    source: 'catalog', thickness: f.plate?.thickness ?? 0, grade: f.plate?.grade ?? null, material: null, density: null,
    length: L, width: W, requiredLength: null, requiredWidth: null, sheetArea: L * W, usedArea: 0, wasteArea: 0, wastePct: f.metrics?.wastePct ?? 0,
    weightKg: f.metrics?.plateKg ?? 0, wasteKg: f.metrics?.wasteKgTotal ?? 0, sequences: [], pieces, ...v2,
  } as Nest;
}

/** The pieces of a list, counted by cut plate code. */
export function pieceCounts(pieces: { cutPlateCode: string }[]): { code: string; qty: number }[] {
  const by = new Map<string, number>();
  for (const p of pieces) by.set(p.cutPlateCode, (by.get(p.cutPlateCode) ?? 0) + 1);
  return [...by].map(([code, qty]) => ({ code, qty }));
}

export interface NestRest {
  pieces: { cutPlateId: number; cutPlateCode: string; qty: number;
    onExisting: { lotNo: string; lotId: number; qty: number }[]; onNew: { lotNo: string; qty: number }[]; unplaced: number }[];
  onExisting: number; onNew: number; unplaced: number; existingPlatesUsed: number;
}

export interface NestAddition {
  lotId: number; lotNo: string; plateCode: string; length: number; width: number; sourceFile?: string | null; kerfMm?: number;
  pieces: (NestPiece & PieceExtras)[];
}

/** The proposal's v2 fields (§5). */
export const additionsOf = (plan: NestingPlan | null | undefined): NestAddition[] =>
  ((plan as unknown as { additions?: NestAddition[] } | null)?.additions) ?? [];
export const restOf = (plan: NestingPlan | null | undefined): NestRest | null =>
  ((plan as unknown as { rest?: NestRest } | null)?.rest) ?? null;

/** The sentence under "Nest the rest": where each left-over piece went. */
export function restLine(rest: NestRest | undefined | null): string | null {
  if (!rest) return null;
  const onOld = `${rest.onExisting} on the customer's ${rest.existingPlatesUsed === 1 ? 'plate' : 'plates'} (${rest.existingPlatesUsed})`;
  const text = `The left-over pieces: ${onOld}, ${rest.onNew} on new plates.`;
  return rest.unplaced > 0 ? `${text} ${rest.unplaced} could not be placed.` : text;
}

/** Rows of the comparison. `better` says which way is good: lower is better, or the row is only information. */
export const COMPARE_ROWS: { key: string; label: string; better: 'lower' | 'info'; unit: string; digits: number;
  get: (m: CompareMetrics) => number | null | undefined; sub?: boolean; help?: string }[] = [
  { key: 'plates', label: 'Plates', better: 'lower', unit: '', digits: 0, get: (m) => m.plates },
  { key: 'tonnesBought', label: 'Steel bought', better: 'lower', unit: 't', digits: 3, get: (m) => m.tonnesBought },
  { key: 'partsTonnes', label: 'Parts', better: 'info', unit: 't', digits: 3, get: (m) => m.partsTonnes, help: 'The steel in the parts. It should be the same on both sides.' },
  { key: 'wastePct', label: 'Waste', better: 'lower', unit: '%', digits: 1, get: (m) => m.wastePct },
  { key: 'wasteKgTotal', label: 'Waste, all causes', better: 'lower', unit: 'kg', digits: 0, get: (m) => m.wasteKgTotal },
  { key: 'wasteKerf', label: 'Kerf', sub: true, better: 'lower', unit: 'kg', digits: 0, get: (m) => m.wasteKg?.kerf },
  { key: 'wasteGaps', label: 'Sequence gaps', sub: true, better: 'lower', unit: 'kg', digits: 0, get: (m) => m.wasteKg?.sequenceGaps },
  { key: 'wasteRim', label: 'Rim', sub: true, better: 'lower', unit: 'kg', digits: 0, get: (m) => m.wasteKg?.rim },
  { key: 'wasteOffcut', label: 'Offcuts kept', sub: true, better: 'info', unit: 'kg', digits: 0, get: (m) => m.wasteKg?.offcut, help: 'Not lost: offcuts go back to stock.' },
  { key: 'wasteWastage', label: 'Wastage', sub: true, better: 'lower', unit: 'kg', digits: 0, get: (m) => m.wasteKg?.wastage },
  { key: 'offcuts', label: 'Offcuts', better: 'info', unit: '', digits: 0, get: (m) => m.offcuts?.count },
  { key: 'cutLengthM', label: 'Cut length', better: 'lower', unit: 'm', digits: 1, get: (m) => m.cutLengthM },
  { key: 'piercings', label: 'Piercings', better: 'lower', unit: '', digits: 0, get: (m) => m.piercings },
  { key: 'cost', label: 'Cost', better: 'lower', unit: '₹', digits: 0, get: (m) => m.cost?.value },
];

export const metricText = (v: number | null | undefined, digits: number, unit: string): string => {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return unit === '₹' ? `₹${s}` : unit === '%' ? `${s}%` : unit ? `${s} ${unit}` : s;
};

/** The backend's key for a row's difference, where it has one. */
export const DELTA_KEY: Record<string, string> = {
  plates: 'plates', tonnesBought: 'tonnesBought', partsTonnes: 'partsTonnes', wastePct: 'wastePct', wasteKgTotal: 'wasteKgTotal',
  cutLengthM: 'cutLengthM', piercings: 'piercings', cost: 'cost',
};

/**
 * Why a figure is missing, in the backend's words. Every null metric comes with one:
 * cost.reason, wastePctReason, or the side's own reason (no run, no whole-line plan).
 */
export function missingReason(key: string, m: CompareMetrics | null | undefined, sideReason?: string | null): string {
  if (!m) return sideReason || 'This side has no figures yet.';
  if (key === 'cost' && m.cost?.reason) return m.cost.reason;
  if (key === 'wastePct' && m.wastePctReason) return m.wastePctReason;
  return sideReason || 'The server gave no reason for this missing figure.';
}

/**
 * The difference (auto minus customer's) in words, with an arrow, and who is better.
 * `given` is the backend's own delta for the row (undefined = it has none for this row, so it is worked out here).
 */
export function differenceText(row: typeof COMPARE_ROWS[number], up: number | null | undefined, auto: number | null | undefined, given?: number | null | string):
  { arrow: string; text: string; side: 'auto' | 'uploaded' | 'same' | 'none' } {
  let d: number;
  if (typeof given === 'number') d = given;
  else if (given === null) return { arrow: '', text: '—', side: 'none' };
  else {
    if (up == null || auto == null || !Number.isFinite(up) || !Number.isFinite(auto)) return { arrow: '', text: '—', side: 'none' };
    d = auto - up;
  }
  const eps = 0.5 * 10 ** -row.digits;
  if (Math.abs(d) < eps) return { arrow: '=', text: 'Same', side: 'same' };
  const arrow = d < 0 ? '↓' : '↑';
  const amount = metricText(Math.abs(d), row.digits, row.unit);
  const word = d < 0 ? 'less' : 'more';
  if (row.better === 'info') return { arrow, text: `Auto ${amount} ${word}`, side: 'none' };
  const autoBetter = d < 0;
  return { arrow, text: `Auto ${amount} ${word} · ${autoBetter ? 'auto is better' : "customer's is better"}`, side: autoBetter ? 'auto' : 'uploaded' };
}

/** "ran 3 min ago" for the saved automatic run. */
export function ranAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'ran earlier';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'ran just now';
  if (s < 3600) return `ran ${Math.round(s / 60)} min ago`;
  if (s < 86400) return `ran ${Math.round(s / 3600)} h ago`;
  return `ran ${Math.round(s / 86400)} days ago`;
}

/** The file kinds the upload reads, as the files route names them ('dxf', 'nif'). An API that does not say reads both. */
export const nestKinds = (kinds: string[] | null | undefined): string[] => {
  const known = (kinds ?? []).map((k) => k.toLowerCase().replace(/^\./, '')).filter(Boolean);
  return known.length ? known : ['dxf', 'nif'];
};
/** The picker's `accept`: ".nif,.dxf", ProNest first. */
export const nestAccept = (kinds: string[]): string => [...kinds].sort((a, b) => Number(b === 'nif') - Number(a === 'nif')).map((k) => `.${k}`).join(',');
export const isNestFile = (name: string, kinds: string[]): boolean => kinds.some((k) => name.toLowerCase().endsWith(`.${k}`));
/** Said when what was dropped holds no file the upload reads. */
export const dropOnly = (kinds: string[]): string => (kinds.includes('nif')
  ? 'Drop ProNest job files (.nif) or DXF files here — one job file per thickness, or one DXF per plate.'
  : 'Drop DXF files here — one DXF per plate.');

/** How a ProNest part was recognised as a cut piece of the line, in plain words (`jobs[].matchedBy`). */
const MATCHED_BY_WORDS: Record<string, string> = {
  label: 'by mark', shape: 'by shape', size: 'by size', 'name size': 'by the size in its name',
  steel: 'by its steel', quantity: 'shared out by quantity', choice: 'by your choice',
};
const MATCHED_BY_ORDER = ['label', 'shape', 'size', 'name size', 'steel', 'quantity', 'choice'];

/** "by mark 109 · by shape 14 · …" — a way this screen does not know is still said, by its own name. */
export function matchedByLine(by: Record<string, number> | null | undefined): string {
  // `allowance` is an "of which": those pieces are also counted under the way that found them, so it never adds up.
  const keys = Object.keys(by ?? {}).filter((k) => k !== 'allowance' && (by?.[k] ?? 0) > 0);
  keys.sort((a, b) => (MATCHED_BY_ORDER.indexOf(a) + 1 || 99) - (MATCHED_BY_ORDER.indexOf(b) + 1 || 99));
  const words = keys.map((k) => `${MATCHED_BY_WORDS[k] ?? `by ${k}`} ${by?.[k]}`);
  const allowed = by?.allowance ?? 0;
  if (allowed > 0) words.push(`of which ${allowed} with a cutting allowance`);
  return words.join(' · ');
}

/** A part of the parts table that has no cut piece yet (or could be several). */
export const needsPick = (r: { status: string }): boolean => r.status === 'unmatched' || r.status === 'ambiguous';

/** The part's name as the shop knows it: a ProNest part name, a DXF mark, else "part" and its size. */
export function partName(r: { partName?: string; label?: string | null; drawn?: [number, number] }): string {
  if (r.partName) return r.partName;
  return r.label ? r.label : `part ${mm(r.drawn?.[0])} × ${mm(r.drawn?.[1])}`;
}

/** How a part of the parts table was matched, in plain words. */
export function partHow(status: string, m: { by: string; allowanceMm?: number | null } | null, matchedTo: { code: string }[] = []): string {
  if (!m) return status === 'ambiguous' ? 'It could be more than one cut piece' : 'No cut piece found for it';
  if (status === 'chosen' || m.by === 'choice') return 'you chose it';
  if (m.allowanceMm) return `with a ${m.allowanceMm} mm cutting allowance`;
  if (m.by === 'quantity') return matchedTo.length > 1 ? `shared out by quantity between ${matchedTo.map((x) => x.code).join(', ')}` : 'shared out by quantity';
  return MATCHED_BY_WORDS[m.by] ?? `by ${m.by}`;
}

// ── The upload review's short names (2026-10-14) ─────────────────────────────

/** The size inside a cut piece's code: 12X380X1400, 16X212.5X654. */
const SIZE_TOKEN = /^\d+(?:\.\d+)?(?:X\d+(?:\.\d+)?){1,2}$/i;

const splitCode = (code: string): { pre: string; size: string; post: string } | null => {
  const t = code.split('-');
  const i = t.findIndex((x) => SIZE_TOKEN.test(x));
  return i < 0 ? null : { pre: t.slice(0, i).join('-'), size: t[i], post: t.slice(i + 1).join('-') };
};

export interface CutPieceName {
  code: string;
  /** "12 × 380 × 1400", or the code itself when it cannot be shortened safely. */
  short: string;
  /** The part names, two at most ("Cross girder cover plate"); null when the answer carries none. */
  part: string | null;
  /** Every part, with its mark: "Cross girder cover plate (CGCP1)". */
  parts: string[];
  /** For the tooltip: the full code, then every part. */
  title: string;
}

/**
 * SHORT NAMES FOR CUT PIECES. A code like SO260009-1-12X380X1400-E350 is read as
 * its size, "12 × 380 × 1400": the order / line before the size and the grade
 * after it are dropped ONLY when every cut piece of the line carries the same
 * ones — never a hard-coded order. A code with no size in it, or two codes that
 * would come out the same, keep the code. The part names come from the answer's
 * `cutPieces` (the rows the cut piece is cut for).
 */
export function cutPieceNamer(
  codes: Iterable<string>,
  pieces: { code: string; parts?: { name: string | null; mark: string | null }[] }[] = [],
): (code: string) => CutPieceName {
  const all = [...new Set([...codes, ...pieces.map((p) => p.code)].filter(Boolean))];
  const split = all.map(splitCode);
  const every = split.length > 0 && split.every(Boolean);
  const dropPre = every && split.every((s) => s?.pre === split[0]?.pre);
  const dropPost = every && split.every((s) => s?.post === split[0]?.post);
  const shorten = (code: string): string => {
    const s = splitCode(code);
    if (!s || (!dropPre && !dropPost)) return code;
    const size = s.size.split(/x/i).join(' × ');
    return [dropPre ? '' : s.pre, size, dropPost ? '' : s.post].filter(Boolean).join(' ');
  };
  const seen = new Map<string, number>();
  for (const c of all) { const s = shorten(c); seen.set(s, (seen.get(s) ?? 0) + 1); }
  const partsOf = new Map(pieces.map((p) => [p.code, p.parts ?? []]));
  return (code: string) => {
    const s = shorten(code);
    const short = (seen.get(s) ?? 0) > 1 ? code : s;
    const rows = partsOf.get(code) ?? [];
    const names = [...new Set(rows.map((r) => r.name || r.mark).filter((x): x is string => !!x))];
    const parts = [...new Set(rows.map((r) => (r.name && r.mark ? `${r.name} (${r.mark})` : r.name || r.mark)).filter((x): x is string => !!x))];
    const part = names.length === 0 ? null : names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
    return { code, short, part, parts, title: [code, ...parts].join(' — ') };
  };
}

/** Where a nest is, for a compact list: its job's word ("16 mm") and its number; a DXF or a saved plate by its name. */
export interface NestPlace { group: string; nest: number | null }

/** "16 mm: 4, 5, 7, 8, 10; N12.dxf" — the nests of one job together, in order. */
export function compactNests(places: NestPlace[]): string {
  const by = new Map<string, Set<number>>();
  for (const p of places) {
    if (!by.has(p.group)) by.set(p.group, new Set());
    if (p.nest != null) by.get(p.group)?.add(p.nest);
  }
  return [...by].map(([g, n]) => (n.size ? `${g}: ${[...n].sort((a, b) => a - b).join(', ')}` : g)).join('; ');
}

/**
 * The word a job goes by in those lists: its thickness ("16 mm") when no other
 * job of the upload has that thickness, else its own name.
 */
export function jobWords(jobs: { filename: string; jobName?: string | null }[], files: NestFileRead[]): Map<string, string> {
  const thickness = (j: { filename: string; jobName?: string | null }): number | null => {
    const f = files.find((x) => (x.sourceFile ?? x.filename) === j.filename && x.plate?.thickness);
    if (f?.plate?.thickness) return f.plate.thickness;
    const m = /^(\d+(?:\.\d+)?)\s*MM/i.exec(j.jobName ?? j.filename);
    return m ? Number(m[1]) : null;
  };
  const t = new Map(jobs.map((j) => [j.filename, thickness(j)]));
  const out = new Map<string, string>();
  for (const j of jobs) {
    const mine = t.get(j.filename);
    const alone = mine != null && jobs.filter((o) => t.get(o.filename) === mine).length === 1;
    out.set(j.filename, alone ? `${mm(mine)} mm` : (j.jobName || j.filename.replace(/\.nif$/i, '')));
  }
  return out;
}

/** "ProNest LT 16.2" from the job's program and its full version. */
export function programWord(program: string | null | undefined, version: string | null | undefined): string {
  const short = (version ?? '').split('.').slice(0, 2).join('.');
  return [program || 'ProNest', short].filter(Boolean).join(' ');
}
export const REPLACE_WARNING = 'Plates you uploaded before that are not in these files will be removed. Their pieces go back to left over.';
