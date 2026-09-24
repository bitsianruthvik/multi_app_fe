import { api } from './client';
import type { ContentOverrideRow, LookupRow, PositionLookup, RelationshipTypeRow, ReportingScope } from './positions';

/**
 * Work assignments — the centre of the model. (Backend:
 * apps/cf_hrms/routes/assignments.js, services/reportingResolver.js.)
 *
 * THE ONE RULE THIS MODULE ENFORCES BY ITS SHAPE: there is no `managerId`
 * anywhere in it. Reporting is a SET of typed, scoped rows, each tagged with
 * the layer it came from, and the server never flattens it. A UI that wants
 * "the manager" has to choose which row it means, in front of the user.
 */

export interface AssignmentRow {
  id: number;
  employeeId: number;
  employeeCode: string | null;
  employeeName: string;
  employmentStatus: string | null;
  roleId: number;
  roleCode: string | null;
  roleTitle: string | null;
  /** null is normal and correct — Position is optional, Role is required. */
  positionId: number | null;
  positionCode: string | null;
  positionTitle: string | null;
  roleDiffersFromPosition: boolean;
  departmentId: number | null;
  departmentName: string | null;
  locationId: number | null;
  locationName: string | null;
  assignmentTitle: string | null;
  /** Advisory. Shown and flagged when a person is over-committed; never blocked. */
  allocationPercent: number | null;
  isPrimary: boolean;
  defaultShiftId: number | null;
  shiftCode: string | null;
  shiftName: string | null;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reason: string | null;
  actualManagerCount: number;
  inheritedManagerCount: number;
  managerCount: number;
  hasNoManager: boolean;
  contextCount: number;
  overrideCount: number;
  liveOnDate: boolean;
  employeeAllocationTotal?: number;
  employeeAssignmentCount?: number;
  employeeOverAllocated?: boolean;
}

export interface AssignmentListResult {
  asOf: string;
  items: AssignmentRow[];
  total: number;
  totals: {
    assignments: number;
    live: number;
    noManager: number;
    noPosition: number;
    overAllocatedEmployees: number;
    roleDiffersFromPosition: number;
  };
}

export interface SiblingAssignment {
  id: number;
  roleId: number;
  roleTitle: string | null;
  positionId: number | null;
  assignmentTitle: string | null;
  allocationPercent: number | null;
  isPrimary: boolean;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

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
  id: number;
  origin: 'POSITION' | 'ASSIGNMENT';
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

export interface RelationshipsResult {
  asOf: string;
  includeEnded: boolean;
  assignment: AssignmentHead;
  relationships: ResolvedRelationship[];
  summary: ReportingSummary;
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

export interface AssignmentFilters {
  on?: string;
  status?: string;
  employeeId?: number | '';
  roleId?: number | '';
  positionId?: number | '';
  search?: string;
  noPosition?: boolean;
  liveOnly?: boolean;
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
  options: (on?: string) => api.get<AssignmentOptions>(`/assignments/options${qs({ on })}`),
  list: (f: AssignmentFilters = {}) => api.get<AssignmentListResult>(`/assignments${qs(f)}`),
  get: (id: number, on?: string) =>
    api.get<{ asOf: string; assignment: AssignmentRow; siblingAssignments: SiblingAssignment[] }>(`/assignments/${id}${qs({ on })}`),
  create: (body: Record<string, unknown>) => api.post<{ assignment: AssignmentRow }>('/assignments', body),
  update: (id: number, body: Record<string, unknown>) => api.put<{ assignment: AssignmentRow }>(`/assignments/${id}`, body),
  setStatus: (id: number, status: string) => api.post<{ assignment: AssignmentRow }>(`/assignments/${id}/status`, { status }),
  end: (id: number, effectiveTo?: string) =>
    api.post<{ ok: true; endedReportingRows: number; endedContextLinks: number }>(`/assignments/${id}/end`, { effectiveTo }),
  remove: (id: number) => api.del<{ ok: true }>(`/assignments/${id}`),

  contexts: (id: number) => api.get<{ items: AssignmentContextRow[]; total: number }>(`/assignments/${id}/contexts`),
  addContext: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/assignments/${id}/contexts`, body),
  removeContext: (rowId: number) => api.del<{ ok: true }>(`/work-assignment-contexts/${rowId}`),

  /** v1.1 §13.5 — ALL active relationships with their scopes. Never one manager. */
  relationships: (id: number, on?: string, includeEnded?: boolean) =>
    api.get<RelationshipsResult>(`/assignments/${id}/reporting-relationships${qs({ on, includeEnded })}`),
  /** v1.1 §13.5 — the position's formal defaults plus this assignment's additions/narrowings. */
  resolvedReporting: (id: number, on?: string) =>
    api.get<ResolvedReportingResult>(`/assignments/${id}/resolved-reporting${qs({ on })}`),

  addReporting: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/assignments/${id}/reporting-relationships`, body),
  updateReporting: (rowId: number, body: Record<string, unknown>) => api.put<{ ok: true }>(`/assignment-reporting-relationships/${rowId}`, body),
  endReporting: (rowId: number, effectiveTo?: string) => api.post<{ ok: true }>(`/assignment-reporting-relationships/${rowId}/end`, { effectiveTo }),
  removeReporting: (rowId: number) => api.del<{ ok: true }>(`/assignment-reporting-relationships/${rowId}`),

  managerAssignments: (employeeId: number) =>
    api.get<{ asOf: string; items: ManagerAssignmentOption[] }>(`/assignment-managers/${employeeId}/assignments`),

  overrides: (id: number) => api.get<{ items: ContentOverrideRow[]; total: number }>(`/assignments/${id}/overrides`),
  addOverride: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/assignments/${id}/overrides`, body),
  removeOverride: (rowId: number) => api.del<{ ok: true }>(`/work-assignment-content-overrides/${rowId}`),
};
