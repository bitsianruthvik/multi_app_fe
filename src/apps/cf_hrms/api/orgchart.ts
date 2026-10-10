import { api } from './client';
import type { HiringRef, JoiningRef } from './hiring';

/**
 * Org chart read model — the client side of CF_HRMS_ORG_CHART_SPEC.md §9.
 *
 * The contract was fixed before either end was built, so this file is a literal
 * transcription of it and nothing more. Two things in it are load-bearing and
 * easy to quietly break:
 *
 *  1. **`edges` is every relationship, not the tree.** The server never decides
 *     which edge is "the" edge. The client picks `PRIMARY_MANAGER` for the tree
 *     and draws everything else as a secondary link. Filtering edges here would
 *     re-introduce the single-manager model the whole schema exists to avoid
 *     (CF_HRMS_PLAN.md §2 rule 9).
 *  2. **A node is ONE position: one chair, one person, one shift** (since
 *     2026-10-10). `occupants` has 0 or 1 entries, `vacancies` is 0 or 1, and
 *     the shift is `defaultShift` — General, Day and Night are shift records.
 *     There is no day-and-night position any more.
 *  3. **`cardId` groups positions into the ROLE CARDS the chart draws.** A card
 *     is the positions with the same role and department whose managers sit in
 *     one card; the id is the lowest position id in it. The grouping is the
 *     server's — the client groups by the field and never re-derives it.
 *
 * `arrange`, zoom, collapsed nodes, the shift filter and the attendance-colour
 * toggle are deliberately absent: they are per-viewer view state and live in
 * localStorage (§9, "What is NOT in the API").
 */

/** A shift's code — G, D, N, or a company's own. Never 'DN': a position is on ONE shift. */
export type ShiftPattern = string;

export interface OrgChartContext {
  id: number;
  name: string;
  /** MACHINE, AREA, LINE … — a context is never a manager (plan §2 rule 3). */
  contextType: string | null;
  isPrimary: boolean;
}

export interface OrgChartOccupant {
  employeeId: number;
  employeeCode: string | null;
  name: string;
  assignmentId: number;
  allocationPercent: number | null;
  shiftCode: string | null;
  /** null when there is no attendance record on the view date. */
  attendanceStatus: string | null;
  /**
   * Set where the payload has no employee id to compare (the employee slice):
   * occupants carrying the same key are ONE person in two seats (spec §16).
   */
  sameAs?: string | null;
}

/**
 * One department — a unit, a machine, an area or a shared crew; they are all
 * departments since 2026-10-10 (CF_HRMS_PLAN.md §9.4). `type` is a LABEL: no
 * logic may branch on its text. `isShared` and `serves` are facts.
 */
export interface OrgChartDepartment {
  id: number;
  code: string | null;
  name: string;
  parentId: number | null;
  type: string | null;
  isShared: boolean;
  /** Department ids a shared department works for. */
  serves: number[];
  /** Pre-order place in the department tree; the array arrives in this order. */
  rank: number;
}

export interface OrgChartRequirement {
  shiftId: number | null;
  shiftCode: string | null;
  requiredCount: number;
}

export interface OrgChartCounts {
  kras: number;
  responsibilities: number;
  kpis: number;
  qualifications: number;
  openPoints: number;
}

export interface OrgChartNode {
  id: number;
  /**
   * The role card this position is drawn in (see the file header). Absent from
   * a server older than 2026-10-10; the layout then treats each position as its
   * own card — a fallback, not a rule.
   */
  cardId?: number;
  positionCode: string | null;
  title: string;
  /** Disambiguated with the parent's title when a title repeats. */
  displayTitle: string;
  roleId: number | null;
  roleTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  /**
   * The unit's code, which is the code of the seat that heads it (spec §15):
   * a box whose positionCode equals it heads its work process.
   */
  departmentCode?: string | null;
  /** The unit's place in a pre-order walk of the unit tree; orders process boxes. */
  departmentRank?: number | null;
  /** The unit has no parent unit — leadership; its teams are never boxed by process. */
  departmentIsRoot?: boolean;
  locationId: number | null;
  locationName: string | null;
  status: string;
  /** Always 1: a position is one chair. Not read by any screen. */
  sanctionedHeadcount: number;
  /** Always 1. Not read by any screen. */
  effectiveSanctioned?: number;
  overFilled?: boolean;
  /** The position's shift code — the same shift as `defaultShift`. */
  shiftPattern: ShiftPattern;
  /** The position's shift. Always set by a current server. */
  defaultShift: { id: number; code: string; name: string } | null;
  contexts: OrgChartContext[];
  /** The one person in the position, or nobody. */
  occupants: OrgChartOccupant[];
  /** Always empty: a shift is the position's own, not a requirement row. */
  requirements: OrgChartRequirement[];
  /** 1 when nobody is in the position, else 0. */
  vacancies: number;
  /**
   * The OPEN hiring on this position, or null. A position with one is still
   * VACANT everywhere it is counted; it is only drawn with the candidate.
   */
  hiring?: HiringRef | null;
  /** Someone appointed here who joins on a later day. Still vacant until then. */
  joining?: JoiningRef | null;
  counts: OrgChartCounts;
  hasContent: boolean;
}

export interface OrgChartEdge {
  id?: number;
  /** The subordinate. */
  fromPositionId: number;
  /** The manager. */
  toPositionId: number;
  typeCode: string;
  typeName: string;
  isFormal: boolean;
  isPrimary: boolean;
  scopeType: string;
  /** "statutory compliance" — what an unlabelled dotted line fails to say. */
  scopeLabel: string | null;
  scopeWorkContextId: number | null;
  scopeWorkContextName?: string | null;
  scopeSentence: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface OrgChartGraph {
  asOf: string;
  root: { positionId: number; positionCode: string | null } | null;
  nodes: OrgChartNode[];
  edges: OrgChartEdge[];
  /** The whole department tree (the employee slice sends only its own branch). */
  departments?: OrgChartDepartment[];
  /** Node ids with no primary manager. Karni has exactly one: P001, the Chairman. */
  roots?: number[];
  /** Edges the server dropped because `?root=` cut them. Zero when the whole org is fetched. */
  edgesOutsideSubtree?: number;
  generatedInMs?: number;
  counts: {
    positions: number;
    /** Equal to `positions`. */
    sanctioned: number;
    filled: number;
    vacant: number;
    /** Open hirings. Each is on a vacant position, so this is part of `vacant`, never added to it. */
    hiring?: number;
    /** Vacant positions somebody is appointed to and has not joined yet. Also part of `vacant`. */
    joining?: number;
    /** Role cards. */
    cards?: number;
    /** Per shift code. */
    byShift?: Record<string, { positions: number; filled: number }>;
    present: number;
    absent: number;
    edges?: number;
    roots?: number;
    openPoints?: number;
    byShiftPattern?: Record<string, number>;
  };
}

/**
 * One row of the resolved reporting set — never flattened to a manager id.
 *
 * The server returns the resolver's own nested shape (`relationshipType`,
 * `scope`, `manager`, `managerPosition`) *and* the flat aliases below. The flat
 * ones are used here: a card should not have to know the resolver's internals
 * to say who someone answers to.
 */
export interface CardReportingRow {
  relationshipTypeId?: number | null;
  typeCode: string;
  typeName: string;
  isPrimary?: boolean;
  isFormal?: boolean;
  /** Which layer the row came from: 'POSITION' (inherited) or 'ASSIGNMENT'. */
  origin?: string | null;
  /** FORMAL (the seat's line) vs ACTUAL (who this person really answers to). */
  layer?: string | null;
  inherited?: boolean;
  /** The resolver's own sentence — better than anything reconstructed here. */
  note?: string | null;
  scopeType?: string | null;
  scopeLabel?: string | null;
  scopeSentence?: string | null;
  managerPositionId?: number | null;
  managerPositionTitle?: string | null;
  managerPositionCode?: string | null;
  /** The seat's occupants today. Empty when the manager's seat is vacant. */
  managerCandidates?: { employeeId: number; name: string; assignmentId?: number | null }[];
  vacant?: boolean;
}

export interface CardContentItem {
  id?: number | null;
  definitionId?: number | null;
  code?: string | null;
  text: string;
  kraId?: number | null;
  kraText?: string | null;
  layer?: string | null;
  weightPercent?: number | null;
  isMandatory?: boolean | null;
}

export interface CardOccupant extends OrgChartOccupant {
  designation?: string | null;
  startDate?: string | null;
  isPrimary?: boolean | null;
}

export interface OpenPoint {
  id: number;
  entityType?: string | null;
  entityId?: number | null;
  entityLabel?: string | null;
  positionId?: number | null;
  positionTitle?: string | null;
  question: string;
  status: string;
  answer?: string | null;
  raisedOn?: string | null;
}

export interface PositionCard {
  positionId: number;
  positionCode: string | null;
  title: string;
  displayTitle?: string | null;
  status?: string | null;
  roleId: number | null;
  roleTitle: string | null;
  rolePurpose: string | null;
  departmentId?: number | null;
  departmentName: string | null;
  locationId?: number | null;
  locationName: string | null;
  sanctionedHeadcount: number;
  effectiveSanctioned?: number;
  shiftPattern: ShiftPattern;
  /** The role card the position is drawn in. */
  cardId?: number;
  /** The position's shift. */
  shift?: { id: number; code: string | null; name: string } | null;
  /** The other positions of the same card (same role, department and manager). */
  siblings?: {
    positionId: number;
    positionCode: string | null;
    shift: { id: number; code: string | null; name: string } | null;
    occupant: { employeeId: number; name: string } | null;
    hiring?: HiringRef | null;
    joining?: JoiningRef | null;
  }[];
  vacancies: number;
  contexts: OrgChartContext[];
  occupants: CardOccupant[];
  /** The open hiring on this position, or null. */
  hiring?: HiringRef | null;
  joining?: JoiningRef | null;
  /** The full resolved set, with scopes. Never one manager. */
  reporting: CardReportingRow[];
  directReports?: { positionId: number; title: string; positionCode?: string | null }[];
  kras: CardContentItem[];
  responsibilities: CardContentItem[];
  kpis: CardContentItem[];
  qualifications: CardContentItem[];
  openPoints: OpenPoint[];
}

export interface SearchHit {
  positionId: number;
  positionCode: string | null;
  title: string;
  matches: { kind: string; text: string }[];
}

export interface OpenPointGroup {
  entityType: string;
  /** "Organisation", "Position", "Work assignment" — the type said in words. */
  entityKind?: string;
  entityLabel: string;
  entityId?: number | null;
  positionId?: number | null;
  points: OpenPoint[];
}

/* ── The Departments view (spec §13) ──────────────────────────────────────
 * `GET /orgchart/departments` — what each unit is accountable for.
 *
 * Content belongs to ROLES and roles are shared, so the server de-duplicates
 * within a unit (three seats holding one duty is one line, carried three
 * times) and never across units (the same duty under Printing and under
 * Slitting is the true answer for both). Every line names its carriers; a
 * reader must never be left thinking one person does what three do.
 */

export type AccountabilityKind = 'KRA' | 'RESPONSIBILITY' | 'KPI' | 'QUALIFICATION';

/** One distinct statement. `units[].lines[].line` indexes into `DepartmentRollup.lines`. */
export interface AccountabilityLine {
  kind: AccountabilityKind;
  definitionId: number | null;
  name: string;
  /** "2400 MT · Monthly", "Owner", "Required · Education". Absent when there is nothing to add. */
  detail?: string;
  /** Only when it says more than the name. */
  description?: string;
}

export interface UnitLine {
  line: number;
  /** The positions in this unit that carry the line, heads first. */
  positionIds: number[];
  /** Of those, the ones whose line comes from (or was changed by) a position overlay. */
  exceptionPositionIds?: number[];
}

export interface UnitSuppressed {
  kind: string;
  definitionId: number;
  name: string;
  positionIds: number[];
  reasons: string[];
}

export interface DepartmentUnit {
  /** 0 is the synthetic "Not in any department" unit, present only when positions have none. */
  id: number;
  code: string | null;
  name: string;
  parentId: number | null;
  status: string;
  depth: number;
  /** Ancestors, root first. The screen prints them above the name. */
  path: { id: number; name: string; code: string | null; qualifier: string | null }[];
  /** Another unit somewhere carries the same name. */
  clash: boolean;
  /** What tells same-named siblings apart: the head's machine, the head's title, or the code. */
  qualifier: string | null;
  qualifierKind: 'context' | 'head' | 'code' | null;
  childIds: number[];
  /** Where the unit starts: its positions whose primary manager sits outside it. */
  headPositionIds: number[];
  /** This unit's OWN positions (not its sections'), heads first. */
  positionIds: number[];
  lines: UnitLine[];
  suppressed: UnitSuppressed[];
  synthetic?: boolean;
}

export interface DepartmentRollup {
  asOf: string;
  /** Depth-first, siblings by name, so namesakes sit together. */
  units: DepartmentUnit[];
  lines: AccountabilityLine[];
  positions: Record<string, {
    id: number;
    code: string | null;
    title: string;
    roleId: number | null;
    roleTitle: string | null;
    unitId: number;
    status: string;
  }>;
  /** Each role, with every unit it is used in — "also used in 7 other units". */
  roles: Record<string, { id: number; title: string; unitIds: number[]; positionIds: number[] }>;
  /**
   * `carried` — distinct lines some current position holds. `written` — distinct
   * lines on any role at all. Zero `written` means nobody has written any yet,
   * which the screen says once, rather than "none" in every unit.
   */
  totals: Record<AccountabilityKind, { carried: number; written: number }>;
  exceptions: { positions: number; unresolved: { positionId: number; message: string }[] };
  counts: { units: number; positions: number; unplacedPositions: number; distinctUnitNames: number };
  /** Round trips the server used. Six for the whole company, plus ~13 per seat-level exception. */
  queries: number;
  generatedInMs: number;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const orgChartApi = {
  /** The whole graph in one payload — 114 nodes is small; paging it would cost more than it saves. */
  graph: (opts: { on?: string; root?: number | '' } = {}) =>
    api.get<OrgChartGraph>(`/orgchart${qs({ on: opts.on, root: opts.root || undefined })}`),

  card: (positionId: number, on?: string) =>
    api.get<PositionCard>(`/orgchart/positions/${positionId}/card${qs({ on })}`),

  /** Multi-word AND across responsibility, KRA, KPI and qualification text. */
  search: (q: string, on?: string) =>
    api.get<SearchHit[]>(`/orgchart/search${qs({ q, on })}`),

  /** Every unit and what it is accountable for, as of a date. One payload, like the graph. */
  departments: (on?: string) =>
    api.get<DepartmentRollup>(`/orgchart/departments${qs({ on })}`),

  openPoints: () => api.get<OpenPointGroup[]>('/orgchart/open-points'),

  updateOpenPoint: (id: number, body: { status: 'RESOLVED' | 'DISMISSED' | 'OPEN'; answer?: string }) =>
    api.put<OpenPoint>(`/orgchart/open-points/${id}`, body),
};
