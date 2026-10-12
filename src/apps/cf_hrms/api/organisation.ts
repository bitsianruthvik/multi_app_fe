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
  /**
   * A LABEL — "Department", "Section", "Machine / area", "Shared crew" or
   * whatever the company calls its levels. Nothing may branch on its text.
   */
  type?: string | null;
  /** A shared crew: its people work for the departments in `serves`. */
  isShared?: boolean;
  serves?: number[];
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

/**
 * One of the company's department labels (spec §9): Department, Section,
 * Machine to begin with. A department's `type` is one of these names.
 */
export interface DepartmentLabel {
  id: number;
  name: string;
  sortOrder: number;
  departmentCount: number;
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
    /** The rows plus the type labels already in use (offered as suggestions). */
    listWithTypes: () =>
      api
        .get<{ rows: Department[]; types?: string[] }>('/organisation/departments')
        .then((r) => ({ rows: r.rows ?? [], types: r.types ?? [] })),
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

  /**
   * The company's own short list of department labels. A rename also renames
   * it on every department that uses it. Removing one in use is refused (409
   * `IN_USE`, `detail.departmentCount`) unless `moveTo` says where they go.
   */
  departmentLabels: {
    list: () =>
      api.get<{ labels: DepartmentLabel[] }>('/organisation/department-labels').then((r) => r.labels ?? []),
    create: (name: string) => api.post<DepartmentLabel>('/organisation/department-labels', { name }),
    rename: (id: number, name: string) => api.put<DepartmentLabel>(`/organisation/department-labels/${id}`, { name }),
    reorder: (ids: number[]) =>
      api.put<{ labels: DepartmentLabel[] }>('/organisation/department-labels/order', { ids }),
    remove: (id: number, moveTo?: number) =>
      api.del<{ ok: true }>(`/organisation/department-labels/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),
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
