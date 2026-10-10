import { api } from './client';
import type { ReportingSummary, ResolvedRelationship } from './assignments';

/**
 * Positions — the sanctioned seats, their work contexts, their FORMAL reporting
 * and their content overlays. (Backend: apps/cf_hrms/routes/positions.js.)
 *
 * A position is the organisation's DESIGN: it survives a vacancy and it
 * survives the person leaving. Nothing here is required to do work — a work
 * assignment may have no position at all.
 */

/** A real shift record — General, Day and Night are shifts like any other. */
export interface PositionShift {
  id: number;
  code: string | null;
  name: string;
}

export interface PositionRow {
  id: number;
  positionCode: string | null;
  positionTitle: string | null;
  displayTitle: string;
  roleId: number;
  roleCode: string | null;
  roleTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  locationId: number | null;
  locationName: string | null;
  /**
   * Always 1 since 2026-10-10: a position is ONE chair for ONE person. The
   * server still sends these three; no screen may show them as a number.
   */
  sanctionedHeadcount: number;
  seats: number;
  /** 0 or 1. */
  filledCount: number;
  /** 1 when nobody is in the position, else 0. A FACT, not a failure — never coloured as an error. */
  vacancyCount: number;
  overFilled: boolean;
  /** The position's shift. Changing it also moves the occupant's shift. */
  defaultShiftId: number | null;
  shiftCode: string | null;
  shiftName: string | null;
  /** The same shift as one object (contract of 2026-10-10). Absent from an older server. */
  shift?: PositionShift | null;
  /** The one person in the position; null when it is vacant. Absent from an older server. */
  occupant?: { employeeId: number; name: string; employeeCode: string | null } | null;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  contextCount?: number;
  reportingCount?: number;
  overrideCount?: number;
}

export interface PositionListResult {
  asOf: string;
  items: PositionRow[];
  total: number;
  totals: { sanctioned: number; filled: number; vacant: number; overFilled: number };
}

export interface PositionContextRow {
  id: number;
  positionId: number;
  workContextId: number;
  workContextName: string | null;
  workContextCode: string | null;
  contextType: string | null;
  isPrimary: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
}

export interface ReportingScope {
  type: string;
  label: string | null;
  workContextId: number | null;
  workContextName: string | null;
  notes: string | null;
  key?: string;
}

/** A formal (position-to-position) reporting row, as the position screen shows it. */
export interface PositionReportingRow {
  id: number;
  origin: 'POSITION';
  layer: 'FORMAL';
  fromPositionId: number;
  fromPositionTitle: string | null;
  toPositionId: number;
  toPositionCode: string | null;
  toPositionTitle: string | null;
  toRoleTitle: string | null;
  relationshipTypeId: number;
  relationshipTypeCode: string | null;
  relationshipTypeName: string | null;
  isFormalType: boolean | null;
  allowMultiple: boolean | null;
  isPrimary: boolean;
  scope: ReportingScope;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface PositionOccupant {
  id: number;
  employeeId: number;
  employeeCode: string | null;
  employeeName: string;
  roleId: number | null;
  roleTitle: string | null;
  assignmentTitle: string | null;
  allocationPercent: number | null;
  isPrimary: boolean;
  status: string;
  departmentName: string | null;
  locationName: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  liveOnDate: boolean;
}

export interface ContentOverrideRow {
  id: number;
  contentType: 'KRA' | 'RESPONSIBILITY' | 'KPI';
  action: 'ADD' | 'OVERRIDE' | 'SUPPRESS';
  kraDefinitionId: number | null;
  responsibilityDefinitionId: number | null;
  kpiDefinitionId: number | null;
  definitionName: string | null;
  parentKraDefinitionId: number | null;
  parentKraName: string | null;
  overrideJson: Record<string, unknown> | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reason: string | null;
}

export interface LookupRow {
  id: number;
  code?: string | null;
  name: string;
  status?: string | null;
}
export interface RelationshipTypeRow extends LookupRow {
  isFormal: boolean;
  allowMultiple: boolean;
}
export interface PositionLookup extends LookupRow {
  roleTitle?: string | null;
  roleId?: number;
  departmentId?: number | null;
  locationId?: number | null;
  defaultShiftId?: number | null;
}

export interface PositionOptions {
  kraDefinitions: LookupRow[];
  responsibilityDefinitions: LookupRow[];
  kpiDefinitions: LookupRow[];
  roles: LookupRow[];
  departments: LookupRow[];
  locations: LookupRow[];
  shifts: LookupRow[];
  workContexts: (LookupRow & { contextType: string })[];
  relationshipTypes: RelationshipTypeRow[];
  positions: PositionLookup[];
  scopeTypes: string[];
  positionStatuses: string[];
}

export interface PositionFilters {
  on?: string;
  status?: string;
  roleId?: number | '';
  departmentId?: number | '';
  locationId?: number | '';
  search?: string;
}

/**
 * Taking a seat off the chart. GET /positions/:id/delete-impact says what
 * closing it, deleting it alone and deleting it with its team would each do —
 * and whether each is allowed — BEFORE anyone confirms. The server runs the very
 * same assessment again when the write arrives, so a refusal here is also a
 * refusal there; `expect` carries the number the person saw so a stale dialog
 * is caught instead of doing more than was agreed.
 *
 * "Its manager" is the PRIMARY_MANAGER line, because that is the line the org
 * chart draws its tree on. A dotted or functional line is not a manager: those
 * are not moved, they go with the seat, and `otherLines` counts them.
 */
export interface RemovalSeat {
  id: number;
  positionCode: string | null;
  title: string;
  status: string;
}
export interface RemovalOutcome {
  allowed: boolean;
  /** IN_USE · ROOT_HAS_TEAM · TEAM_IN_USE · REPORTING_LOOP · ALREADY_CLOSED — null when allowed. */
  code: string | null;
  /** The sentence to show when it is not allowed. The server writes it; do not rephrase it here. */
  reason: string | null;
}
export interface PositionRemovalImpact {
  asOf: string;
  position: RemovalSeat;
  /** Where its direct reports would move when they go UP: the first OPEN position above it. null = nowhere to send them. */
  manager: RemovalSeat | null;
  /**
   * Where the direct reports go: 'CARD' — to another position of the same role card (the sibling keeps
   * the team); 'UP' — to the manager, because this was the card's last position; null — it has none.
   * Absent from a server older than 2026-10-10 (read as 'UP').
   */
  movesReportsTo?: 'CARD' | 'UP' | null;
  /** The positions the reports move to. */
  moveTargets?: RemovalSeat[];
  directReports: (RemovalSeat & { assignments: number })[];
  team: {
    /** Positions under it, all levels, not counting itself. */
    count: number;
    /** What "with its team" deletes: `count` plus the seat itself. This is the number in the label. */
    total: number;
    /** How many of `count` are already closed. */
    closed: number;
    /** Team members holding live work assignments — each one blocks "with its team". */
    blockers: (RemovalSeat & { assignments: number })[];
  };
  /** Live work assignments on the seat itself. Blocks every kind of delete (not close). */
  ownAssignments: number;
  /** Dotted / functional / planned / ended lines that go with the seat(s), per outcome. */
  otherLines: { thisOnly: number; withTeam: number };
  outcomes: {
    close: RemovalOutcome & { movesReports: number };
    deleteOnly: RemovalOutcome & { movesReports: number };
    deleteWithTeam: RemovalOutcome & { deletes: number };
  };
}
export type RemovalMode = 'THIS_ONLY' | 'WITH_TEAM';
export interface RemovalResult {
  ok: true;
  /** Present on a delete. */
  mode?: RemovalMode;
  deletedIds?: number[];
  deletedCount?: number;
  /** Present on a close. */
  position?: PositionRow;
  alreadyClosed?: boolean;
  movedReports: RemovalSeat[];
  movedTo: RemovalSeat | null;
  /** The reports stayed in the card, under these sibling positions. */
  movedWithinCard?: boolean | null;
  movedToPositions?: RemovalSeat[];
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

export const positionsApi = {
  options: () => api.get<PositionOptions>('/positions/options'),
  list: (f: PositionFilters = {}) => api.get<PositionListResult>(`/positions${qs(f)}`),
  get: (id: number, on?: string) => api.get<{ asOf: string; position: PositionRow }>(`/positions/${id}${qs({ on })}`),
  create: (body: Record<string, unknown>) => api.post<{ position: PositionRow }>('/positions', body),
  update: (id: number, body: Record<string, unknown>) => api.put<{ position: PositionRow }>(`/positions/${id}`, body),
  /**
   * One more VACANT position in the same card: same role, department and
   * manager as `id`; its shift is `shiftId`, or the source's when omitted.
   */
  addSibling: (id: number, body: { shiftId?: number } = {}) =>
    api.post<{ position: PositionRow }>(`/positions/${id}/add-sibling`, body),
  setStatus: (id: number, status: string) => api.post<{ position: PositionRow }>(`/positions/${id}/status`, { status }),
  /** Read this BEFORE offering a close or a delete: it is what the confirm dialog says. */
  deleteImpact: (id: number) => api.get<PositionRemovalImpact>(`/positions/${id}/delete-impact`),
  /**
   * Delete a seat. `mode` is required by the server whenever the seat has direct
   * reports (THIS_ONLY moves them up to its manager; WITH_TEAM deletes them too).
   * `expect` is the number the person saw — reports moved, or positions deleted.
   */
  remove: (id: number, opts: { mode?: RemovalMode; expect?: number } = {}) =>
    api.del<RemovalResult>(`/positions/${id}${qs(opts)}`),
  /** Close a seat: it keeps its history and leaves the chart; its direct reports move up. */
  close: (id: number, expect?: number) =>
    api.post<RemovalResult>(`/positions/${id}/close`, expect == null ? {} : { expect }),

  contexts: (id: number) => api.get<{ items: PositionContextRow[]; total: number }>(`/positions/${id}/work-contexts`),
  addContext: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/positions/${id}/work-contexts`, body),
  removeContext: (rowId: number) => api.del<{ ok: true }>(`/position-work-contexts/${rowId}`),

  reporting: (id: number, on?: string, includeEnded?: boolean) =>
    api.get<{ asOf: string; managers: PositionReportingRow[]; directReports: PositionReportingRow[]; total: number }>(
      `/positions/${id}/reporting-relationships${qs({ on, includeEnded: includeEnded ? 1 : '' })}`,
    ),
  /**
   * The formal rows with each manager SEAT resolved to the people currently in
   * it. Same row shape as the assignment resolver, so one component renders
   * both — and so the org chart can read either without a second renderer.
   */
  resolvedReporting: (id: number, on?: string) =>
    api.get<{
      asOf: string;
      position: { id: number; code: string | null; title: string | null; roleTitle: string | null };
      relationships: ResolvedRelationship[];
      summary: ReportingSummary;
    }>(`/positions/${id}/resolved-reporting${qs({ on })}`),
  addReporting: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/positions/${id}/reporting-relationships`, body),
  endReporting: (rowId: number, effectiveTo?: string) => api.post<{ ok: true }>(`/position-reporting-relationships/${rowId}/end`, { effectiveTo }),
  removeReporting: (rowId: number) => api.del<{ ok: true }>(`/position-reporting-relationships/${rowId}`),

  occupants: (id: number, on?: string) =>
    api.get<{ asOf: string; items: PositionOccupant[]; total: number; filledCount: number }>(`/positions/${id}/occupants${qs({ on })}`),

  overrides: (id: number) => api.get<{ items: ContentOverrideRow[]; total: number }>(`/positions/${id}/overrides`),
  addOverride: (id: number, body: Record<string, unknown>) => api.post<{ id: number }>(`/positions/${id}/overrides`, body),
  removeOverride: (rowId: number) => api.del<{ ok: true }>(`/position-content-overrides/${rowId}`),
};
