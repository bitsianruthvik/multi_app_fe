/**
 * The Organisation + Setup endpoints (`/organisation/*`), typed.
 *
 * Seven screens share one shape on purpose: every list comes back as
 * `{ rows }`, and the three hierarchical ones come back already flattened into
 * PRE-ORDER with `depth`, `childCount` and a resolved `path`. The tree is
 * assembled on the server because that is where the cycle guard lives — a
 * client-side tree build over a looping parent chain hangs the browser, and a
 * screen is the worst place to discover that.
 *
 * Errors arrive from `client.ts` as an Error with a `problems` array attached;
 * screens hand that straight to the kit's `ErrorNotice`, which itemises it.
 */
import { api } from './client';

export type OrgStatus = 'ACTIVE' | 'INACTIVE';
export type LocationType = 'PLANT' | 'OFFICE' | 'UNIT' | 'BRANCH' | 'SITE' | 'OTHER';
export type ContextType = 'MACHINE' | 'LINE' | 'AREA' | 'PROJECT' | 'CELL' | 'OTHER';

/** What every row in a hierarchical list carries on top of its own fields. */
export interface TreeMeta {
  id: number;
  name: string;
  parentId: number | null;
  depth: number;
  childCount: number;
  /** "Production › Printing" — the ancestors resolved once, on the server. */
  path: string;
  /** Its parent is gone or unreadable; shown at the top level rather than hidden. */
  orphaned?: boolean;
  /** Reached only through a loop that predates the cycle guard. */
  inCycle?: boolean;
}

export interface Department extends TreeMeta {
  code: string | null;
  status: OrgStatus;
}

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface OrgLocation extends TreeMeta {
  code: string | null;
  locationType: LocationType;
  address: Address | null;
  status: OrgStatus;
}

export interface WorkContext extends TreeMeta {
  code: string | null;
  contextType: ContextType;
  locationId: number | null;
  locationName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  externalRef: string | null;
  status: OrgStatus;
}

export interface Contact {
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface Contractor {
  id: number;
  code: string | null;
  name: string;
  contact: Contact | null;
  status: OrgStatus;
  employeeCount: number;
}

export interface Shift {
  id: number;
  code: string;
  name: string;
  /** Both null is the FLEXIBLE shift — no fixed hours, by design, not missing data. */
  startTime: string | null;
  endTime: string | null;
  isFlexible: boolean;
  crossesMidnight: boolean;
  graceInMinutes: number;
  graceOutMinutes: number;
  status: OrgStatus;
}

export interface Holiday {
  id: number;
  holidayDate: string;
  name: string;
  locationId: number | null;
  locationName: string | null;
  isOptional: boolean;
}

export interface ReportingType {
  id: number;
  code: string;
  name: string;
  isFormal: boolean;
  allowMultiple: boolean;
  sortOrder: number;
  status: OrgStatus;
  /** How many reporting lines already use it — what makes a delete safe or not. */
  inUse: number;
}

export interface LookupRow {
  id: number;
  code: string | null;
  name: string;
  status: OrgStatus;
}

export interface Lookups {
  locations: (LookupRow & { locationType: LocationType })[];
  departments: LookupRow[];
  shifts: LookupRow[];
  locationTypes: LocationType[];
  contextTypes: ContextType[];
  statuses: OrgStatus[];
}

const list = <T>(path: string) => api.get<{ rows: T[] }>(path).then((r) => r.rows ?? []);

export const orgApi = {
  lookups: () => api.get<Lookups>('/organisation/lookups'),

  departments: {
    list: () => list<Department>('/organisation/departments'),
    create: (body: unknown) => api.post<Department>('/organisation/departments', body),
    update: (id: number, body: unknown) => api.put<Department>(`/organisation/departments/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/departments/${id}`),
  },

  locations: {
    list: () => list<OrgLocation>('/organisation/locations'),
    create: (body: unknown) => api.post<OrgLocation>('/organisation/locations', body),
    update: (id: number, body: unknown) => api.put<OrgLocation>(`/organisation/locations/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/locations/${id}`),
  },

  workContexts: {
    list: () => list<WorkContext>('/organisation/work-contexts'),
    create: (body: unknown) => api.post<WorkContext>('/organisation/work-contexts', body),
    update: (id: number, body: unknown) => api.put<WorkContext>(`/organisation/work-contexts/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/work-contexts/${id}`),
  },

  contractors: {
    list: () => list<Contractor>('/organisation/contractors'),
    create: (body: unknown) => api.post<Contractor>('/organisation/contractors', body),
    update: (id: number, body: unknown) => api.put<Contractor>(`/organisation/contractors/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/contractors/${id}`),
  },

  shifts: {
    list: () => list<Shift>('/organisation/shifts'),
    create: (body: unknown) => api.post<Shift>('/organisation/shifts', body),
    update: (id: number, body: unknown) => api.put<Shift>(`/organisation/shifts/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/shifts/${id}`),
  },

  holidays: {
    list: () => list<Holiday>('/organisation/holidays'),
    create: (body: unknown) => api.post<Holiday>('/organisation/holidays', body),
    update: (id: number, body: unknown) => api.put<Holiday>(`/organisation/holidays/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/holidays/${id}`),
  },

  reportingTypes: {
    list: () => list<ReportingType>('/organisation/reporting-types'),
    create: (body: unknown) => api.post<ReportingType>('/organisation/reporting-types', body),
    update: (id: number, body: unknown) => api.put<ReportingType>(`/organisation/reporting-types/${id}`, body),
    remove: (id: number) => api.del<{ ok: true }>(`/organisation/reporting-types/${id}`),
  },
};

/** Permission tags these screens gate on (plan §6). */
export const ORG_VIEW = 'cf_hrms_org_view';
export const ORG_MANAGE = 'cf_hrms_org_manage';
export const PEOPLE_VIEW = 'cf_hrms_people_view';
export const PEOPLE_MANAGE = 'cf_hrms_people_manage';
