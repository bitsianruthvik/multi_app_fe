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
   * Its LABEL's name — "Department", "Section", "Machine" or whatever the
   * company's list holds. Every department has exactly one. Nothing may branch on its text.
   */
  type?: string | null;
  /** Its label's id (null only for a name the list no longer has). Its own — never its parent's. */
  labelId?: number | null;
  /** A shared crew: its people work for the departments in `serves`. */
  isShared?: boolean;
  serves?: number[];
  /** Its place among its siblings (spec §34): lists order by it, then code. Drag and drop sets it. */
  sortOrder?: number;
  /** Spec §40.2: its head position(s) — one, or one per shift. Absent from an older backend. */
  heads?: UnitHead[];
  headsPerShift?: boolean;
  reportsInto?: UnitReportsIntoSummary;
  /** Positions directly in it. */
  positionCount?: number;
}

/** A position as the reporting screens name it (spec §40). */
export interface PosRef {
  positionId: number;
  code: string | null;
  title: string;
  unitId: number | null;
  unitName: string | null;
  unitType: string | null;
  shiftId: number | null;
  shiftCode: string | null;
  occupantName: string | null;
}

/** One head of an org unit: per shift, or for every shift (`shiftId` null). */
export interface UnitHead {
  positionId: number;
  shiftId: number | null;
  shiftCode: string | null;
  shiftName: string | null;
  code: string | null;
  title: string;
  occupantName: string | null;
}

/** DEFAULT = the parent's head (or further up); CHOSEN = a position picked by hand. */
export type ReportsIntoMode = 'DEFAULT' | 'CHOSEN';

export interface UnitReportsIntoSummary {
  mode: ReportsIntoMode;
  positionId: number | null;
  reason: string | null;
  effective: PosRef | null;
  /** "Head of Production — Ravi Kumar (default: the head of Production)" */
  text: string;
}

/** GET /organisation/departments/:id/reporting — a unit's head and Reports into, and what may be picked. */
export interface UnitReporting {
  unit: { id: number; name: string; type: string | null; parentId: number | null };
  heads: UnitHead[];
  perShift: boolean;
  reportsInto: {
    mode: ReportsIntoMode;
    positionId: number | null;
    reason: string | null;
    effective: PosRef | null;
    defaultTarget: PosRef | null;
    defaultText: string;
  };
  candidates: {
    heads: PosRef[];
    reportsInto: { unitId: number; unitName: string; unitType: string | null; distance: number; positions: PosRef[] }[];
    elsewhere: PosRef[];
  };
  shifts: { id: number; code: string | null; name: string }[];
}

export interface UnitReportingBody {
  heads?: { positionId: number; shiftId: number | null }[];
  reportsInto?: { mode: 'DEFAULT' } | { mode: 'CHOSEN'; positionId: number; reason?: string };
}

/** Spec §40.5: one thing the consistency check found, with its one-click fixes. */
export type FindingKind = 'CROSS_TREE' | 'UNIT_NO_HEAD' | 'NO_MANAGER' | 'LOOP';
export type FixAction = 'USE_DEFAULT' | 'CHOOSE' | 'MARK_INTENDED' | 'SET_HEAD' | 'MAKE_HEAD';

export interface ConsistencyFix {
  action: FixAction;
  label: string;
  hint: string | null;
  needsReason: boolean;
  needsPosition: boolean;
  candidates: PosRef[];
  target: PosRef | null;
  edgeId?: number;
  unitId?: number;
}

export interface ConsistencyFinding {
  key: string;
  kind: FindingKind;
  sentence: string;
  unit: { id: number; name: string; type: string | null } | null;
  position: PosRef | null;
  manager: PosRef | null;
  loop: PosRef[] | null;
  fixes: ConsistencyFix[];
}

export interface Consistency {
  asOf: string;
  counts: { total: number; crossTree: number; unitNoHead: number; noManager: number; loops: number };
  findings: ConsistencyFinding[];
}

export interface FixBody {
  key: string;
  action: FixAction;
  positionId?: number;
  reason?: string;
  edgeId?: number;
  unitId?: number;
}

/**
 * GET /organisation/departments/:id/move-check — what moving a unit would do,
 * in the confirm's words (spec §34.3). Writes nothing.
 */
export interface MoveCheck {
  unit: { id: number; name: string; type: string | null };
  from: { id: number; name: string; type: string | null } | null;
  to: { id: number; name: string; type: string | null } | null;
  unitsUnder: number;
  positionsUnder: number;
  /** False when the move is refused (inside itself, where it already is); `problem` says why. */
  allowed: boolean;
  problem: string | null;
  /** "Move Lamination (Section) from Production to Operations — 6 positions and 2 units under it move with it". */
  sentence: string;
  /**
   * Spec §40.4: what the move does to its Reports into. DEFAULT follows the new parent's head by itself;
   * CHOSEN asks (`ask`): keep the chosen position, or switch to the new parent's head (`afterMove`).
   */
  reportsInto?: { mode: ReportsIntoMode; current: PosRef | null; afterMove: PosRef | null; ask: boolean };
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
  /** "New positions start on" (spec §17.2): the shift a new position in a department carrying it starts on. */
  defaultShiftId?: number | null;
  /**
   * Spec §34.1: the palette key this kind SHOWS (chosen, or its default) — see
   * `kindColour()` in components/labels.ts. `colourChosen` is the stored key, null = the default.
   */
  colour?: string | null;
  colourChosen?: string | null;
}

/** A shift as the Labels sheet offers it for "New positions start on". */
export interface ShiftChoice {
  id: number;
  code: string | null;
  name: string;
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
    /**
     * Re-parent (spec §34.3): under `parentId` (null = the top level), after its new siblings
     * or at `sortOrder`. The server refuses a cycle. Undo = the same call with the old parent and sortOrder.
     */
    move: (id: number, parentId: number | null, sortOrder?: number, reportsInto?: 'KEEP' | 'SWITCH') =>
      api.put<Department>(`/organisation/departments/${id}`, { parentId, ...(sortOrder ? { sortOrder } : {}), ...(reportsInto ? { reportsInto } : {}) }),
    /** Spec §40.2: the unit's head(s) and Reports into, with what may be picked. */
    reporting: (id: number) => api.get<UnitReporting>(`/organisation/departments/${id}/reporting`),
    setReporting: (id: number, body: UnitReportingBody) => api.put<UnitReporting>(`/organisation/departments/${id}/reporting`, body),
    /** The siblings under one parent (null = the top level), every one once, in the order wanted. */
    reorder: (parentId: number | null, ids: number[]) =>
      api.put<{ parentId: number | null; rows: { id: number; sortOrder: number }[] }>('/organisation/departments/order', { parentId, ids }),
    /** The confirm's words for a move (`parentId` null = the top level). */
    moveCheck: (id: number, parentId: number | null) =>
      api.get<MoveCheck>(`/organisation/departments/${id}/move-check?parentId=${parentId ?? ''}`),
  },

  /** Spec §40.5: the reporting consistency check, and its fixes. */
  consistency: {
    read: () => api.get<Consistency>('/organisation/consistency'),
    fix: (body: FixBody) => api.post<{ ok: true; fixed: string; consistency: Consistency }>('/organisation/consistency/fix', body),
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
    /** The list, with each label's department count and default shift, and the active shifts to choose from. */
    read: () =>
      api
        .get<{ labels: DepartmentLabel[]; shifts?: ShiftChoice[] }>('/organisation/department-labels')
        .then((r) => ({ labels: r.labels ?? [], shifts: r.shifts ?? [] })),
    list: () =>
      api.get<{ labels: DepartmentLabel[] }>('/organisation/department-labels').then((r) => r.labels ?? []),
    create: (name: string, colour?: string | null) => api.post<DepartmentLabel>('/organisation/department-labels', { name, ...(colour ? { colour } : {}) }),
    /** Spec §34.1: a palette key, or null for the kind's default colour. */
    setColour: (id: number, colour: string | null) => api.put<DepartmentLabel>(`/organisation/department-labels/${id}`, { colour }),
    rename: (id: number, name: string) => api.put<DepartmentLabel>(`/organisation/department-labels/${id}`, { name }),
    /** "New positions start on": a shift id, or null for no default. Existing positions never change. */
    setDefaultShift: (id: number, defaultShiftId: number | null) =>
      api.put<DepartmentLabel>(`/organisation/department-labels/${id}`, { defaultShiftId }),
    reorder: (ids: number[]) => api.put<{ labels: DepartmentLabel[] }>('/organisation/department-labels/order', { ids }),
    /** `moveTo`: another label, for the departments that carry this one. */
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
