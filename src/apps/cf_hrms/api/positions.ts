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
  sanctionedHeadcount: number;
  /** Effective seats on the date: sanctioned, or the day+night total. See backend services/seatCount.js. */
  seats: number;
  filledCount: number;
  /** sanctioned − filled. A FACT, not a failure — never coloured as an error. */
  vacancyCount: number;
  overFilled: boolean;
  defaultShiftId: number | null;
  shiftCode: string | null;
  shiftName: string | null;
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
  setStatus: (id: number, status: string) => api.post<{ position: PositionRow }>(`/positions/${id}/status`, { status }),
  remove: (id: number) => api.del<{ ok: true }>(`/positions/${id}`),

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
