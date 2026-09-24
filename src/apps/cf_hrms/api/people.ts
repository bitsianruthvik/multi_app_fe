import { api } from './client';

/**
 * People — employees, identifiers, documents and employment events.
 *
 * Everything here goes through `routes/people.js`, not the generic query API.
 * Two reasons, and both matter:
 *
 *  1. **Identifiers cannot be reached any other way.** `identifier_value` is
 *     deliberately absent from resourceDef.json, so the generic API cannot
 *     select it under any filter. That route is the only read path, and it masks
 *     unless the caller holds `cf_hrms_people_pii`.
 *  2. **Department and location are two hops away.** They belong to the WORK, not
 *     to the person — employee → work assignment → department — and the query
 *     engine's relation joins are single-hop. The list endpoint resolves them
 *     from the primary active assignment, which is the only place they are true.
 */

export interface EmployeeRow {
  id: number;
  employeeCode: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  dateOfJoining: string;
  employmentType: 'EMPLOYEE' | 'CONTRACT' | 'TRAINEE' | 'CONSULTANT' | 'OTHER';
  employmentStatus: 'ACTIVE' | 'NOTICE' | 'INACTIVE' | 'EXITED';
  exitDate: string | null;
  contractorId: number | null;
  contractorName: string | null;
  contractorCode: string | null;
  /** Nullable by design: most of a workforce never logs in. Not a data gap. */
  userId: number | null;
  userEmail: string | null;
  hasPhoto: boolean;
  activeAssignmentCount: number;
  openAssignmentCount: number;
  assignmentCount: number;
  totalAllocationPercent: number;
  primaryAssignmentId: number | null;
  primaryRoleTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  locationId: number | null;
  locationName: string | null;
  documentCount: number;
  expiredDocumentCount: number;
  expiringDocumentCount: number;
}

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface EmergencyContact {
  name?: string;
  relationship?: string;
  phone?: string;
  altPhone?: string;
}

export interface Employee extends Omit<EmployeeRow,
  'activeAssignmentCount' | 'openAssignmentCount' | 'assignmentCount' | 'totalAllocationPercent'
  | 'primaryAssignmentId' | 'primaryRoleTitle' | 'departmentId' | 'departmentName'
  | 'locationId' | 'locationName' | 'documentCount' | 'expiredDocumentCount' | 'expiringDocumentCount'> {
  addressJson: Address | null;
  emergencyContactJson: EmergencyContact | null;
  photoFileName: string | null;
  photoMimeType: string | null;
  photoSizeBytes: number | null;
  userName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentSummary {
  id: number;
  employeeId: number;
  roleId: number;
  roleTitle: string | null;
  roleCode: string | null;
  positionId: number | null;
  positionCode: string | null;
  positionTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  locationId: number | null;
  locationName: string | null;
  assignmentTitle: string | null;
  allocationPercent: number | null;
  isPrimary: boolean;
  shiftId: number | null;
  shiftCode: string | null;
  shiftName: string | null;
  status: 'PLANNED' | 'ACTIVE' | 'SUSPENDED' | 'ENDED';
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  isOpen: boolean;
  isActive: boolean;
  contexts: { id: number; name: string; type: string; isPrimary: boolean }[];
}

export interface EmployeeDetail {
  asOf: string;
  employee: Employee;
  assignments: AssignmentSummary[];
  counts: {
    assignments: number;
    activeAssignments: number;
    openAssignments: number;
    identifiers: number;
    documents: number;
    expiredDocuments: number;
    expiringDocuments: number;
    events: number;
  };
  totalAllocationPercent: number;
}

export interface Identifier {
  id: number;
  identifierType: string;
  /** Masked ("XXXX XXXX 1234") unless the response says otherwise. Never cached. */
  value: string;
  isVerified: boolean;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
}

export interface IdentifierList {
  employeeId: number;
  /** True when the values below are masked — which is the default for everyone. */
  masked: boolean;
  /** Whether this caller holds cf_hrms_people_pii at all. Drives whether "Reveal" is offered. */
  canSeePii: boolean;
  items: Identifier[];
}

export interface EmployeeDocument {
  id: number;
  employeeId: number;
  documentType: string;
  title: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: string;
  issueDate: string | null;
  expiryDate: string | null;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  verifiedByEmployeeId: number | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  notes: string | null;
  createdAt: string;
  /** Negative when it has already expired. Null when the document never expires. */
  daysToExpiry: number | null;
}

export interface EmploymentEvent {
  id: number;
  eventType: 'JOIN' | 'TRANSFER' | 'ASSIGNMENT_CHANGE' | 'DEPARTMENT_CHANGE' | 'CONTRACTOR_CHANGE' | 'EXIT' | 'OTHER';
  eventDate: string;
  workAssignmentId: number | null;
  assignmentRoleTitle: string | null;
  summary: string;
  detailsJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface PeoplePickers {
  contractors: { id: number; code: string | null; name: string }[];
  identifierTypes: string[];
  documentTypes: string[];
  employmentTypes: string[];
  employmentStatuses: string[];
  eventTypes: string[];
  verificationStatuses: string[];
  limits: { documentStoredBytes: number; photoStoredBytes: number };
}

export interface FileTransport {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}

export interface EmployeeInput {
  employeeCode?: string;
  fullName?: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: Address | null;
  emergencyContact?: EmergencyContact | null;
  dateOfJoining?: string;
  employmentType?: string;
  contractorId?: number | null;
  employmentStatus?: string;
  exitDate?: string | null;
}

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const peopleApi = {
  pickers: () => api.get<PeoplePickers>('/people/pickers'),

  list: (filters: { status?: string; employmentType?: string; contractorId?: string; search?: string } = {}) =>
    api.get<{ asOf: string; total: number; items: EmployeeRow[] }>(`/people/employees${qs(filters)}`),

  get: (id: number) => api.get<EmployeeDetail>(`/people/employees/${id}`),
  create: (body: EmployeeInput) => api.post<EmployeeDetail>('/people/employees', body),
  update: (id: number, body: EmployeeInput) => api.put<EmployeeDetail>(`/people/employees/${id}`, body),
  remove: (id: number) => api.del<{ id: number }>(`/people/employees/${id}`),

  assignments: (id: number) =>
    api.get<{ asOf: string; items: AssignmentSummary[]; activeCount: number; totalAllocationPercent: number }>(
      `/people/employees/${id}/assignments`,
    ),

  /**
   * Masked. Call this for the tab.
   *
   * `reveal` asks for the real numbers and is honoured only for a caller holding
   * cf_hrms_people_pii; for anyone else the response comes back masked with
   * `masked: true` rather than as an error. An honoured reveal writes an audit
   * row on the server. The values it returns are held only by the component that
   * displays them and are dropped when it unmounts — they are never stored, never
   * put in a URL and never written to a query string.
   */
  identifiers: (id: number, reveal = false) =>
    api.get<IdentifierList>(`/people/employees/${id}/identifiers${reveal ? '?reveal=1' : ''}`),
  addIdentifier: (id: number, body: { identifierType: string; value: string; isVerified?: boolean; validFrom?: string | null; validTo?: string | null }) =>
    api.post<{ id: number }>(`/people/employees/${id}/identifiers`, body),
  updateIdentifier: (identifierId: number, body: Record<string, unknown>) =>
    api.put<{ id: number }>(`/people/identifiers/${identifierId}`, body),
  removeIdentifier: (identifierId: number) => api.del<{ id: number }>(`/people/identifiers/${identifierId}`),

  documents: (id: number) => api.get<{ asOf: string; items: EmployeeDocument[] }>(`/people/employees/${id}/documents`),
  addDocument: (id: number, body: Record<string, unknown>) =>
    api.post<{ id: number }>(`/people/employees/${id}/documents`, body),
  updateDocument: (documentId: number, body: Record<string, unknown>) =>
    api.put<{ id: number }>(`/people/documents/${documentId}`, body),
  removeDocument: (documentId: number) => api.del<{ id: number }>(`/people/documents/${documentId}`),
  documentFile: (documentId: number) => api.get<FileTransport>(`/people/documents/${documentId}/file`),

  events: (id: number) => api.get<{ items: EmploymentEvent[] }>(`/people/employees/${id}/events`),
  addEvent: (id: number, body: { eventType: string; eventDate: string; summary: string; details?: unknown }) =>
    api.post<{ id: number }>(`/people/employees/${id}/events`, body),

  photo: (id: number) => api.get<{ hasPhoto: boolean } & Partial<FileTransport>>(`/people/employees/${id}/photo`),
  setPhoto: (id: number, body: { fileName: string; mimeType: string; dataBase64: string }) =>
    api.put<{ ok: boolean }>(`/people/employees/${id}/photo`, body),
  removePhoto: (id: number) => api.del<{ ok: boolean }>(`/people/employees/${id}/photo`),
};

/**
 * Reads a File as base64 without the `data:` prefix.
 *
 * Uploads travel as base64 in a JSON body because @core/api/client — the one
 * sanctioned HTTP path, and the only one that attaches the JWT — JSON-encodes
 * every request and has no multipart mode.
 */
export function readFileAsBase64(file: File): Promise<{ fileName: string; mimeType: string; dataBase64: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: comma > -1 ? result.slice(comma + 1) : result,
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  });
}

/** Turns a fetched file into a Blob URL. The caller revokes it. */
export function toBlobUrl(file: FileTransport): string {
  const bytes = Uint8Array.from(atob(file.dataBase64), (ch) => ch.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: file.mimeType }));
}

// ── shared vocabulary ───────────────────────────────────────────────────────

/**
 * Status tones passed to `StatusBadge` as a `map` rather than registered
 * globally with `registerStatusTones`. The kit supports both; a per-screen map
 * is used here because three other phases are being built against this app at
 * the same time and a single shared registration is a file four people edit.
 */
export const EMPLOYMENT_STATUS_TONE = {
  ACTIVE: 'success',
  NOTICE: 'warning',
  INACTIVE: 'neutral',
  EXITED: 'neutral',
} as const;

export const EMPLOYMENT_STATUS_LABEL = {
  ACTIVE: 'Active',
  NOTICE: 'On notice',
  INACTIVE: 'Inactive',
  EXITED: 'Exited',
} as const;

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  EMPLOYEE: 'Employee',
  CONTRACT: 'Contract',
  TRAINEE: 'Trainee',
  CONSULTANT: 'Consultant',
  OTHER: 'Other',
};

export const VERIFICATION_TONE = {
  VERIFIED: 'success',
  UNVERIFIED: 'neutral',
  REJECTED: 'danger',
} as const;

export const EVENT_TYPE_LABEL: Record<string, string> = {
  JOIN: 'Joined',
  TRANSFER: 'Transfer',
  ASSIGNMENT_CHANGE: 'Assignment change',
  DEPARTMENT_CHANGE: 'Department change',
  CONTRACTOR_CHANGE: 'Contractor change',
  EXIT: 'Exit',
  OTHER: 'Other',
};

export const EVENT_TYPE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  JOIN: 'success',
  TRANSFER: 'info',
  ASSIGNMENT_CHANGE: 'info',
  DEPARTMENT_CHANGE: 'info',
  CONTRACTOR_CHANGE: 'warning',
  EXIT: 'danger',
  OTHER: 'neutral',
};

/** A document's operational state. An expired licence is a problem, not a filing detail. */
export function expiryState(days: number | null): { tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string } {
  if (days === null) return { tone: 'neutral', label: 'No expiry' };
  if (days < 0) return { tone: 'danger', label: `Expired ${Math.abs(days)} d ago` };
  if (days === 0) return { tone: 'danger', label: 'Expires today' };
  if (days <= 30) return { tone: 'warning', label: `Expires in ${days} d` };
  return { tone: 'success', label: `Valid ${days} d` };
}
