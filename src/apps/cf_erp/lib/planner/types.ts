/**
 * CF_ERP Planner — types. The contract is TM/CF_ERP_PLANNER_PLAN.md §2 (snapshot) and §3 (engine).
 *
 * Words used below:
 * - period   — an ISO week cut at month ends. Identified by `Period.key` (opaque string).
 * - unit     — a card on the board: a whole order line (`'l<lineId>'`) or a piece (`'p<pieceId>'`)
 *              with its whole subtree. A row of N pieces is N units `'p<pieceId>#1'` … `'#N'`
 *              (planner v2: each quantity ships on its own; the old lot cards `'g…'` are gone).
 *
 * ── Booking (planner v2, TM/CF_ERP_PLANNER_V2_PLAN.md) ─────────────────────────────────────────
 * A unit's work is a chain of steps (`stages`: deepest BOM level first, flow order inside a
 * level). Planned units are booked in PRIORITY order onto what each machine type has left in each
 * week (finite capacity): a unit placed in a ship week books its chain BACKWARDS from that week,
 * as late as possible but not before its material. What does not fit shows as overload. A plan
 * entry with a `start` week (a stretched bar) instead spreads each machine type's minutes evenly
 * over start…ship. Auto-plan books every unit as EARLY as material and the capacity left allow.
 * - mark     — a shipping mark (a unit with `isMark`). A LINE (shipping group, `groupKey`) ships in
 *              the period its last mark ships.
 * - function — a machine type; `'contractor'` (or any function flagged `unlimited`) never runs out.
 *
 * ── Which units are on the board (the "active" units) ──────────────────────────────────────────
 * Each order line has a LEVEL: `'line'` (the whole order line) or a depth as text (`'2'`). The level
 * comes from `snapshot.orders[].lines[].level`, overridden per line by `EngineOptions.levels`
 * (`{ [lineId]: level }`) — the page passes its unsaved level picks there instead of copying the
 * snapshot. Starting at the order line, a unit at (or below) the level is active unless the plan
 * has NO entry for it but DOES have entries for some of its descendants: then it is split and its
 * children are resolved the same way. That is how auto-plan's "split SPAN-01 into its girder
 * lines" is stored — entries for the girder lines, none for the span — and it needs no extra
 * field. Consequence for the page: when the user changes a line's level, drop that line's entries
 * (`dropLineEntries`) so stale deeper entries do not keep the old split.
 * Plan entries for units that are not active (e.g. an ancestor above the level) are ignored.
 *
 * Treat a snapshot as immutable: the engine caches an index per snapshot object (WeakMap).
 */

// ── Snapshot (GET /planner) ─────────────────────────────────────────────────────────────────────

export type Id = number | string;
/** `'line'` or a piece-tree depth as text, e.g. `'2'`. */
export type PlanLevel = string;

export interface Period {
  key: string;
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive (a Sunday or a month's last day). */
  end: string;
  /** YYYY-MM */
  month: string;
  label: string;
}

export interface Horizon {
  from: string;
  to: string;
  periods: Period[];
}

export interface PlannerSettings {
  minLinesPerMonth: number;
  allowPartialLines: boolean;
}

export interface PlannerFunction {
  key: string;
  name: string;
  machines?: number;
  /** minutes per period key; missing key = 0. Ignored when `unlimited`. */
  capacity?: Record<string, number>;
  noShifts?: boolean;
  /** true for the `contractor` pseudo-function. */
  unlimited?: boolean;
  /** The machine type's path in the classification tree, root first (Family › Subfamily › Variant). */
  path?: TypePathNode[];
}

export interface TypePathNode {
  id: Id;
  name: string;
  depth: number;
  /** 'Family' | 'Subfamily' | 'Variant' */
  level?: string;
}

export interface LevelOption {
  value: PlanLevel;
  label: string;
}

export interface PlannerLine {
  id: Id;
  lineNo: number;
  name: string;
  quantity: number;
  locked: boolean;
  released: boolean;
  level: PlanLevel;
  levels: LevelOption[];
}

export interface PlannerOrder {
  id: Id;
  code: string;
  customer: string;
  committedDate: string | null;
  priority: number | null;
  lines: PlannerLine[];
}

export interface UnitMaterial {
  itemId: Id;
  qty: number;
}

/** The server's material-ready engine answer (CF_ERP_BUYING_V2.md §4–5). */
export type MaterialState = 'ready' | 'dated' | 'late' | 'waiting';

export interface MaterialReason {
  item: { id: Id; code: string; name?: string; uom?: string };
  need: number;
  short: number;
  state: MaterialState;
  date: string | null;
  skipped: boolean;
  requisitionLineId?: Id | null;
  cover?: { kind: string; date?: string | null; qty: number; [k: string]: unknown }[];
  text: string;
}

export interface UnitMaterialInfo {
  state: MaterialState;
  readyDate: string | null;
  /** The first day (a plan period's start) its work may start; null = any week. */
  earliest: string | null;
  soft: boolean;
  materials: number;
  text: string;
  reasons: MaterialReason[];
  moreReasons?: number;
  estimate?: boolean;
  incomplete?: string;
}

/** A stored placement the material no longer allows (PlanEntryRow.blocked). */
export interface EntryBlocked {
  kind: 'material_late' | 'waiting';
  message: string;
  readyDate: string | null;
  earliest: string | null;
  was?: { state: MaterialState | null; date: string | null };
}

export interface MaterialReadySummary {
  engine: number;
  today: string;
  counts: Partial<Record<MaterialState, number>>;
  blockedEntries: number;
}

/** One step of a unit's chain: minutes on one machine type. */
export interface StageStep {
  fn: string;
  minutes: number;
}

/** The steps of one BOM depth, in flow order. */
export interface UnitStage {
  depth: number;
  steps: StageStep[];
}

export interface PlannerUnit {
  key: string;
  orderId: Id;
  lineId: Id;
  level: PlanLevel;
  pieceId: Id | null;
  code: string;
  name: string;
  depth: number;
  parentKey: string | null;
  /** the line (shipping group) it belongs to — normally the key of the line-depth unit. */
  groupKey: string;
  isMark: boolean;
  marks: number;
  /** How many of it (1 for each of a row's N units). */
  quantity?: number;
  /** A lot of loose pieces (old snapshots only). */
  lot?: boolean;
  /** A lot's pieces (`pieceId` is its first). */
  pieceIds?: Id[];
  /** Which of a row's N units this is (1…N); null/absent for a row of one. */
  copy?: number | null;
  /** The work in the order it is done (see "Booking" above). */
  stages?: UnitStage[];
  /** This row is planned "its parts separately" for this order (its children are the cards). */
  split?: boolean;
  /** "Plan its parts separately" is offered: a locked row with parts below. */
  splittable?: boolean;
  /** The BOM row, for PUT /planner/lines/:id/splits. */
  bomLineId?: Id | null;
  tonnes: number;
  /** minutes per function key, for the whole subtree. */
  work: Record<string, number>;
  noRate: number;
  done: boolean;
  progress: number;
  materials: UnitMaterial[];
  /** The server's answer: null = shown at no level; absent = an old snapshot (no gate). */
  material?: UnitMaterialInfo | null;
  committedDate: string | null;
}

export interface SupplyLot {
  date: string;
  qty: number;
  /** `'stock'` or a PO code (`'PO-…'`). */
  source: string;
  received: boolean;
}

export interface SupplyItem {
  name: string;
  code: string;
  uom: string;
  lots: SupplyLot[];
}

export interface PlanEntryRow {
  shipDate: string;
  /** A stretched bar's first week (its start); null = booked back from the ship week. */
  startDate?: string | null;
  pinned: boolean;
  /** Present only when the stored placement can no longer stand. */
  blocked?: EntryBlocked;
}

export interface PlannerSnapshot {
  horizon: Horizon;
  settings: PlannerSettings;
  targets: Record<string, number>;
  functions: PlannerFunction[];
  orders: PlannerOrder[];
  units: PlannerUnit[];
  /** Old pooled supply — still sent, no longer read by the engine. */
  supply?: Record<string, SupplyItem>;
  materialReady?: MaterialReadySummary;
  entries: Record<string, PlanEntryRow>;
  /**
   * A line's units in the order dragged by hand (`{ [unitKey]: 1.. }`, per line; init.sql §38).
   * Ranked units of a line come first, in rank order, then the rest in structure order.
   */
  ranks?: Record<string, number>;
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────

export interface PlanEntry {
  /** Period key of the ship period. */
  period: string;
  /** Period key of a stretched bar's first week (≤ period); absent = booked back from the ship week. */
  start?: string;
  pinned: boolean;
}

/** `{ [unitKey]: { period, pinned } }` — see the header for which units count. */
export type Plan = Record<string, PlanEntry>;

export interface EngineOptions {
  /** Per-order-line level overrides, `{ [lineId]: 'line' | '<depth>' }`. */
  levels?: Record<string, PlanLevel>;
}

/** Auto-plan books every unpinned unit as early as it can, in priority order (planner v2). */
export type AutoPlanOptions = EngineOptions;

export interface AutoPlanResult {
  plan: Plan;
  notes: string[];
}

export interface CanPlaceResult {
  ok: boolean;
  reason?: string;
  /** When refused for material: the earliest period key the unit could ship in (null if none). */
  earliest?: string | null;
}

/** canStretch: may this planned unit start in that week? */
export interface CanStretchResult {
  ok: boolean;
  reason?: string;
  /** The earliest start week its material allows (null = any). */
  earliestStart?: string | null;
}

// ── Evaluation ──────────────────────────────────────────────────────────────────────────────────

export interface MonthEval {
  tonnes: number;
  target: number | null;
  /** Lines (shipping groups) whose last mark ships in this month. */
  linesShipped: number;
  marksShipped: number;
  /** Busiest function over the month (minutes / capacity); `fn` null when nothing is loaded. */
  bottleneck: { fn: string | null; name: string; pct: number };
}

export interface LoadCell {
  minutes: number;
  /** null = unlimited (contractors). */
  capacity: number | null;
  /** 0..; 0 for unlimited; minutes on zero capacity reads as 999. */
  pct: number;
}

export type BlockedKind = 'waiting' | 'material_late';

export interface UnitEval {
  /** Ship period key, null = unplanned. */
  period: string | null;
  pinned: boolean;
  /** First week its work is booked in (the bar's left edge); null when unplanned. */
  leadStart: string | null;
  /** The bar's width in weeks (leadStart…period); 0 when unplanned. */
  lead: number;
  /** The stretched start week the plan holds for it, else null (booked back from the ship week). */
  start: string | null;
  /** Weeks its chain takes in an empty shop from its material (the shortest possible bar); null = it cannot finish inside the plan. */
  minWeeks: number | null;
  /** Minutes booked per week per machine type: `{ [periodKey]: { [fnKey]: minutes } }`. */
  booked: Record<string, Record<string, number>>;
  /** The server's ready date for its material; null when it needs nothing, or waits. */
  materialDate: string | null;
  /** Always null now (kept for older callers). */
  materialSource: string | null;
  /** The server's state for its material (null = no answer / needs nothing). */
  materialState: MaterialState | null;
  /** The server's sentence for it. */
  materialText: string | null;
  /** Plain reason when the unit cannot run where it is — the backend's sentence. */
  blocked: string | null;
  blockedKind: BlockedKind | null;
  late: boolean;
  overload: boolean;
  /** Line (group) keys whose last mark ships with this unit — the "ships the line" tick. */
  completesLines: string[];
}

export interface LineEval {
  /** Ship period key of the line's last mark; null if not every mark is planned. */
  period: string | null;
  month: string | null;
  marks: number;
  marksPlanned: number;
}

export interface Score {
  tonnesInHorizon: number;
  linesShipped: number;
  lateUnits: number;
  overloadedCells: number;
  unplannedUnits: number;
  blockedUnits: number;
}

/** Display words the engine uses (and `feedback` needs); shared per snapshot. */
export interface EvalLabels {
  periods: Record<string, string>;
  /** YYYY-MM → "Oct" */
  months: Record<string, string>;
  functions: Record<string, string>;
  units: Record<string, string>;
  lines: Record<string, string>;
}

export interface Evaluation {
  months: Record<string, MonthEval>;
  load: Record<string, Record<string, LoadCell>>;
  /** Every ACTIVE unit (planned or not). Its keys are the cards on the board. */
  units: Record<string, UnitEval>;
  lines: Record<string, LineEval>;
  score: Score;
  labels: EvalLabels;
}
