/**
 * CF_ERP Planner — types. The contract is TM/CF_ERP_PLANNER_PLAN.md §2 (snapshot) and §3 (engine).
 *
 * Words used below:
 * - period   — an ISO week cut at month ends. Identified by `Period.key` (opaque string).
 * - unit     — a card on the board: a whole order line (`'l<lineId>'`) or a piece (`'p<pieceId>'`)
 *              with its whole subtree, or a lot of loose pieces of one design row under one parent
 *              (`'g<parentPieceId>.<bomLineId>'`, `quantity` of them, one mark).
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
  /** How many of it (a lot: how many loose pieces ship together — "45 ×"). */
  quantity?: number;
  /** A lot of loose pieces (`'g<parent piece>.<bom line>'`): one design row under one parent, one mark. */
  lot?: boolean;
  /** A lot's pieces (`pieceId` is its first). */
  pieceIds?: Id[];
  tonnes: number;
  /** minutes per function key, for the whole subtree. */
  work: Record<string, number>;
  noRate: number;
  done: boolean;
  progress: number;
  materials: UnitMaterial[];
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
  pinned: boolean;
}

export interface PlannerSnapshot {
  horizon: Horizon;
  settings: PlannerSettings;
  targets: Record<string, number>;
  functions: PlannerFunction[];
  orders: PlannerOrder[];
  units: PlannerUnit[];
  supply: Record<string, SupplyItem>;
  entries: Record<string, PlanEntryRow>;
}

// ── Plan ────────────────────────────────────────────────────────────────────────────────────────

export interface PlanEntry {
  /** Period key of the ship period. */
  period: string;
  pinned: boolean;
}

/** `{ [unitKey]: { period, pinned } }` — see the header for which units count. */
export type Plan = Record<string, PlanEntry>;

export interface EngineOptions {
  /** Per-order-line level overrides, `{ [lineId]: 'line' | '<depth>' }`. */
  levels?: Record<string, PlanLevel>;
}

export interface AutoPlanOptions extends EngineOptions {
  /** Default: `snapshot.settings.minLinesPerMonth`. */
  minLinesPerMonth?: number;
  /** Default: `snapshot.settings.allowPartialLines`. */
  allowPartialLines?: boolean;
}

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

export type BlockedKind = 'not_ordered' | 'material_late';

export interface UnitEval {
  /** Ship period key, null = unplanned. */
  period: string | null;
  pinned: boolean;
  /** First period key of the lead (work starts here); null when unplanned. */
  leadStart: string | null;
  /** Lead in periods (1..4) — computed even when unplanned. */
  lead: number;
  /** Latest date among the supply lots covering this unit; null when it needs nothing (or blocked). */
  materialDate: string | null;
  /** Source of that latest lot (`'stock'` / `'PO-12'`). */
  materialSource: string | null;
  /** Plain reason when the unit cannot run where it is, e.g. "Not ordered: PL20 short by 1.2 t". */
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
