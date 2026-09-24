import { api } from './client';

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
 *  2. **`shiftPattern` and `vacancies` are derived together.** A `DN` position
 *     is sanctioned per shift, so its vacancy count is Σ(requiredCount), not
 *     `sanctionedHeadcount`. Karni's 156 vacancies are 110 day/night seats plus
 *     59 single-shift ones minus 13 filled; reading `sanctionedHeadcount` alone
 *     shows 101 and the screen silently understates the thing it exists to say.
 *
 * `arrange`, zoom, collapsed nodes, the shift filter and the attendance-colour
 * toggle are deliberately absent: they are per-viewer view state and live in
 * localStorage (§9, "What is NOT in the API").
 */

export type ShiftPattern = 'G' | 'D' | 'N' | 'DN';

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
  positionCode: string | null;
  title: string;
  /** Disambiguated with the parent's title when a title repeats. */
  displayTitle: string;
  roleId: number | null;
  roleTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  locationId: number | null;
  locationName: string | null;
  status: string;
  /** ONE seat. Stays 1 on a day/night position — it is not what the box fills. */
  sanctionedHeadcount: number;
  /**
   * What the box must actually fill on the view date: `sanctionedHeadcount` for
   * a single-shift seat, `Σ(requirements[].requiredCount)` for a `DN` one. This
   * is the field row padding uses. Padding from `sanctionedHeadcount` instead
   * renders 78 vacancies where Karni has 156 — the single most common way to
   * get this screen wrong, which is why the server now derives it.
   */
  effectiveSanctioned?: number;
  /** More people assigned than the seat sanctions — an inconsistency, not a vacancy. */
  overFilled?: boolean;
  shiftPattern: ShiftPattern;
  defaultShift: { id: number; code: string; name: string } | null;
  contexts: OrgChartContext[];
  occupants: OrgChartOccupant[];
  requirements: OrgChartRequirement[];
  vacancies: number;
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
  /** Node ids with no primary manager. Karni has exactly one: P001, the Chairman. */
  roots?: number[];
  /** Edges the server dropped because `?root=` cut them. Zero when the whole org is fetched. */
  edgesOutsideSubtree?: number;
  generatedInMs?: number;
  counts: {
    positions: number;
    sanctioned: number;
    filled: number;
    vacant: number;
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
  /** Seats on the date — `sanctionedHeadcount` doubled by a day/night pattern. */
  effectiveSanctioned?: number;
  shiftPattern: ShiftPattern;
  vacancies: number;
  contexts: OrgChartContext[];
  occupants: CardOccupant[];
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
  entityLabel: string;
  entityId?: number | null;
  positionId?: number | null;
  points: OpenPoint[];
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

  openPoints: () => api.get<OpenPointGroup[]>('/orgchart/open-points'),

  updateOpenPoint: (id: number, body: { status: 'RESOLVED' | 'DISMISSED' | 'OPEN'; answer?: string }) =>
    api.put<OpenPoint>(`/orgchart/open-points/${id}`, body),
};
