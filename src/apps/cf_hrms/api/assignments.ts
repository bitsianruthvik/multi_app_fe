import { api } from './client';
import type { LookupRow, PositionLookup, RelationshipTypeRow, ReportingScope } from './positions';

/**
 * Work assignments — the centre of the model. (Backend:
 * apps/cf_hrms/routes/assignments.js, services/reportingResolver.js.)
 *
 * THE ONE RULE THIS MODULE ENFORCES BY ITS SHAPE: there is no `managerId`
 * anywhere in it. Reporting is a SET of typed, scoped rows, each tagged with
 * the layer it came from, and the server never flattens it. A UI that wants
 * "the manager" has to choose which row it means, in front of the user.
 */




export interface AssignmentContextRow {
  id: number;
  workAssignmentId: number;
  workContextId: number;
  workContextName: string | null;
  workContextCode: string | null;
  contextType: string | null;
  isPrimary: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
}

/** A manager, always as a person plus (preferably) which of their hats. Never a bare id. */
export interface ReportingManager {
  employeeId: number;
  employeeCode: string | null;
  name: string;
  workAssignmentId: number | null;
  workAssignmentTitle: string | null;
  roleId: number | null;
  roleTitle: string | null;
  positionId: number | null;
  positionCode: string | null;
}

/**
 * One resolved reporting row. `origin` says which LAYER it came from — the
 * position's formal design, or this assignment. The UI must show that, because
 * "inherited from the seat" and "added for this person" are different facts.
 */
export interface ResolvedRelationship {
  key: string;
  /** null on a DERIVED row: it is worked out from the org units and has no row to end or remove. */
  id: number | null;
  /**
   * POSITION / ASSIGNMENT: a stored line, from that layer. DERIVED (spec §40.3): no line is stored —
   * the position follows its org unit (UNIT_HEAD: the unit's head; REPORTS_INTO: the unit's Reports into).
   */
  origin: 'POSITION' | 'ASSIGNMENT' | 'DERIVED';
  /** EXPLICIT on a stored primary line; UNIT_HEAD / REPORTS_INTO on a derived one; null on other types. */
  source?: 'EXPLICIT' | 'UNIT_HEAD' | 'REPORTS_INTO' | 'WALKED_UP' | null;
  /** A derived row: the org unit it follows. */
  unit?: { id: number; name: string; type: string | null } | null;
  /** A stored primary line whose manager is outside the org unit tree (spec §40.5), and why if someone said so. */
  crossTree?: boolean;
  crossTreeReason?: string | null;
  layer: 'FORMAL' | 'ACTUAL';
  inherited: boolean;
  relationshipType: {
    id: number;
    code: string;
    name: string;
    isFormal: boolean;
    allowMultiple: boolean;
    sortOrder: number;
  };
  /** Primary FOR THIS LAYER. It never invalidates a dotted, functional or project row beside it. */
  isPrimary: boolean;
  scope: ReportingScope;
  scopeSentence: string;
  manager: ReportingManager | null;
  managerCandidates: ReportingManager[];
  managerPosition: { id: number; code: string | null; title: string | null; roleTitle: string | null } | null;
  vacant: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  endsOn: string | null;
  supersededById: number | null;
  note: string | null;
}

export interface AssignmentHead {
  id: number;
  employeeId: number;
  employeeCode: string | null;
  employeeName: string;
  roleId: number;
  roleTitle: string | null;
  positionId: number | null;
  positionCode: string | null;
  positionTitle: string | null;
  assignmentTitle: string | null;
  allocationPercent: number | null;
  isPrimary: boolean;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface ReportingSummary {
  total: number;
  byOrigin: { POSITION: number; ASSIGNMENT: number };
  byType: Record<string, number>;
  primaryCount: number;
  scopedCount: number;
  unresolvedFormalCount: number;
  hasAnyManager: boolean;
}


export interface ResolvedReportingResult {
  asOf: string;
  assignment: AssignmentHead;
  relationships: ResolvedRelationship[];
  /** Formal rows an assignment-level row replaced. Shown, never silently dropped. */
  superseded: ResolvedRelationship[];
  summary: ReportingSummary;
}

export interface AssignmentOptions {
  asOf: string;
  kraDefinitions: LookupRow[];
  responsibilityDefinitions: LookupRow[];
  kpiDefinitions: LookupRow[];
  employees: LookupRow[];
  roles: LookupRow[];
  positions: PositionLookup[];
  departments: LookupRow[];
  locations: LookupRow[];
  shifts: LookupRow[];
  workContexts: (LookupRow & { contextType: string })[];
  relationshipTypes: RelationshipTypeRow[];
  scopeTypes: string[];
  assignmentStatuses: string[];
}

export interface ManagerAssignmentOption {
  id: number;
  label: string;
  roleId: number | null;
  roleTitle: string | null;
  positionId: number | null;
  positionCode: string | null;
  positionTitle: string | null;
  isPrimary: boolean;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}


function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, v === true ? '1' : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const assignmentsApi = {
  /** The pick lists the "Add a manager" dialog needs. */
  options: (on?: string) => api.get<AssignmentOptions>(`/assignments/options${qs({ on })}`),
  /** Ends one position held. Its own reporting lines end with it. */
  end: (id: number, effectiveTo?: string) =>
    api.post<{ ok: true; endedReportingRows: number; endedContextLinks: number }>(`/assignments/${id}/end`, { effectiveTo }),

  /** The position's formal lines plus the ones added for this person. Never one manager. */
  resolvedReporting: (id: number, on?: string) =>
    api.get<ResolvedReportingResult>(`/assignments/${id}/resolved-reporting${qs({ on })}`),
  addReporting: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/assignments/${id}/reporting-relationships`, body),
  endReporting: (rowId: number, effectiveTo?: string) => api.post<{ ok: true }>(`/assignment-reporting-relationships/${rowId}/end`, { effectiveTo }),

  managerAssignments: (employeeId: number) =>
    api.get<{ asOf: string; items: ManagerAssignmentOption[] }>(`/assignment-managers/${employeeId}/assignments`),
};
