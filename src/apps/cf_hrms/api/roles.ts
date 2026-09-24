/**
 * The Roles world's API surface: roles, their content, and the six reusable
 * content masters. Everything goes through `api` (api/client.ts), which is the
 * one path that knows the base URL, the token and how to turn a failed request
 * back into a message plus a `problems` array the dialogs can render.
 *
 * WHY THESE READS DO NOT USE THE GENERIC QUERY API. The plan allows plain lists
 * through `/api/query/v1/:resource`, and these would qualify — but every list on
 * these screens carries something the generic engine cannot produce: a master's
 * "used by 7 roles", a role's readiness, and the KRA → responsibility → KPI
 * nesting. Splitting the screens across two clients to save one endpoint would
 * buy nothing and cost the error shape.
 *
 * THE VOCABULARY IS THE POINT (plan §2 rule 4, taxonomy §6):
 *   KRA            an area of outcome the role is accountable for
 *   Responsibility an activity or duty expected of the role
 *   KPI            a measurable indicator
 * Three kinds, three masters, three screens. They never collapse into one list,
 * so there is no shared "content item" type here either — the types are separate
 * on purpose.
 */
import { api } from './client';

// ---------------------------------------------------------------------------
// Masters
// ---------------------------------------------------------------------------

export type MasterKind =
  | 'kras'
  | 'responsibilities'
  | 'kpis'
  | 'skills'
  | 'qualifications'
  | 'authorities';

export interface MasterItem {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  usageCount: number;
  /** KRA */
  category?: string | null;
  /** Responsibility */
  responsibilityClass?: string | null;
  /** KPI */
  measurementType?: string | null;
  unit?: string | null;
  direction?: string | null;
  formulaText?: string | null;
  dataSource?: string | null;
  defaultFrequency?: string | null;
  /** Skill / Qualification / Authority */
  skillType?: string | null;
  qualificationType?: string | null;
  authorityType?: string | null;
}

export interface MasterUsage {
  kind: MasterKind;
  id: number;
  roles: { id: number; roleCode: string | null; title: string; status: string }[];
}

export const listMaster = (kind: MasterKind) =>
  api.get<{ kind: MasterKind; label: string; items: MasterItem[] }>(`/role-masters/${kind}`);

export const masterUsage = (kind: MasterKind, id: number) =>
  api.get<MasterUsage>(`/role-masters/${kind}/${id}/usage`);

export const createMaster = (kind: MasterKind, body: Record<string, unknown>) =>
  api.post<MasterItem>(`/role-masters/${kind}`, body);

export const updateMaster = (kind: MasterKind, id: number, body: Record<string, unknown>) =>
  api.put<MasterItem>(`/role-masters/${kind}/${id}`, body);

export const deleteMaster = (kind: MasterKind, id: number) =>
  api.del<{ ok: boolean }>(`/role-masters/${kind}/${id}`);

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export type RoleStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface Role {
  id: number;
  roleCode: string | null;
  title: string;
  rolePurpose: string | null;
  roleSummary: string | null;
  defaultDepartmentId: number | null;
  departmentName: string | null;
  departmentCode: string | null;
  status: RoleStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  kraCount: number;
  responsibilityCount: number;
  kpiCount: number;
  skillCount: number;
  authorityCount: number;
  positionCount: number;
  /** A JD opens with the purpose; a role without one opens with a blank line. */
  hasPurpose: boolean;
  jdReady: boolean;
}

export interface RolesOverview {
  total: number;
  active: number;
  draft: number;
  retired: number;
  noPurpose: number;
  noKras: number;
}

export const listRoles = () => api.get<{ items: Role[] }>('/roles');
export const rolesOverview = () => api.get<RolesOverview>('/roles/overview');
export const listDepartments = () =>
  api.get<{ items: { id: number; code: string | null; name: string }[] }>('/roles/departments');
export const getRole = (id: number) => api.get<Role>(`/roles/${id}`);
export const createRole = (body: Record<string, unknown>) => api.post<Role>('/roles', body);
export const updateRole = (id: number, body: Record<string, unknown>) => api.put<Role>(`/roles/${id}`, body);
export const deleteRole = (id: number) => api.del<{ ok: boolean }>(`/roles/${id}`);

// ---------------------------------------------------------------------------
// Role content
// ---------------------------------------------------------------------------

/** The nine content kinds. Six draw on a master; three are free-standing. */
export type ContentKind =
  | 'kras'
  | 'responsibilities'
  | 'kpis'
  | 'skills'
  | 'qualifications'
  | 'experience'
  | 'authorities'
  | 'relationships'
  | 'conditions';

export interface ContentDefinition {
  name: string;
  code?: string | null;
  description?: string | null;
  category?: string | null;
  responsibilityClass?: string | null;
  measurementType?: string | null;
  unit?: string | null;
  direction?: string | null;
  formulaText?: string | null;
  dataSource?: string | null;
  defaultFrequency?: string | null;
  skillType?: string | null;
  qualificationType?: string | null;
  authorityType?: string | null;
  status?: string | null;
}

export interface AuthorityLimit {
  amount?: number;
  currency?: string;
  scope?: string;
  condition?: string;
}

export interface ContentRow {
  id: number;
  kind: ContentKind;
  /** Always 'ROLE' here. Position and assignment overlays arrive in a later phase. */
  layer: 'ROLE';
  roleId: number;
  definitionId: number | null;
  definition: ContentDefinition | null;
  roleKraAssignmentId: number | null;
  sequence: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  notes: string | null;
  retired: boolean;
  // kra / kpi
  weightPercent?: number | null;
  isMandatory?: boolean;
  // responsibility
  responsibilityClass?: string | null;
  responsibilityClassOverride?: string | null;
  // kpi
  targetOperator?: string | null;
  targetValue?: number | string | boolean | { min: number; max: number } | null;
  frequencyOverride?: string | null;
  frequency?: string | null;
  // skill / qualification / experience
  requirementLevel?: string | null;
  proficiencyLevel?: string | null;
  minYears?: number | null;
  preferredYears?: number | null;
  experienceArea?: string | null;
  // authority
  limitJson?: AuthorityLimit | null;
  // relationship
  relationshipScope?: string | null;
  counterparty?: string | null;
  purpose?: string | null;
  // working condition
  conditionType?: string | null;
  description?: string | null;
}

export interface KraGroup extends ContentRow {
  responsibilities: ContentRow[];
  kpis: ContentRow[];
}

export interface RoleContent {
  role: Role;
  on: string;
  scope: 'effective' | 'all';
  layer: 'ROLE';
  kras: KraGroup[];
  /** Ungrouped content. Visible under "Additional", never dropped. */
  additional: { responsibilities: ContentRow[]; kpis: ContentRow[] };
  skills: ContentRow[];
  qualifications: ContentRow[];
  experience: ContentRow[];
  authorities: ContentRow[];
  relationships: ContentRow[];
  conditions: ContentRow[];
  weights: {
    kraTotal: number;
    kraWeighted: number;
    kraBalanced: boolean;
    kpiTotal: number;
    kpiWeighted: number;
  };
  counts: Record<string, number>;
}

export const getRoleContent = (id: number, opts: { on?: string; scope?: 'effective' | 'all' } = {}) => {
  const q = new URLSearchParams();
  if (opts.on) q.set('on', opts.on);
  if (opts.scope) q.set('scope', opts.scope);
  const qs = q.toString();
  return api.get<RoleContent>(`/roles/${id}/content${qs ? `?${qs}` : ''}`);
};

export const addContent = (roleId: number, kind: ContentKind, body: Record<string, unknown>) =>
  api.post<ContentRow>(`/roles/${roleId}/content/${kind}`, body);

export const updateContent = (kind: ContentKind, id: number, body: Record<string, unknown>) =>
  api.put<ContentRow>(`/role-content/${kind}/${id}`, body);

export const removeContent = (kind: ContentKind, id: number, endOn?: string) =>
  api.del<{ ok: boolean }>(`/role-content/${kind}/${id}${endOn ? `?endOn=${endOn}` : ''}`);

export const reorderContent = (roleId: number, kind: ContentKind, ids: number[]) =>
  api.put<{ ok: boolean }>(`/roles/${roleId}/content/${kind}/order`, { ids });

export const regroupContent = (kind: ContentKind, id: number, roleKraAssignmentId: number | null) =>
  api.put<ContentRow>(`/role-content/${kind}/${id}/group`, { roleKraAssignmentId });

// ---------------------------------------------------------------------------
// Vocabularies. /meta is the backend's copy of the ENUMs (routes/index.js), so
// a picker never hard-codes a value a migration could rename.
// ---------------------------------------------------------------------------

export interface HrmsMeta {
  responsibilityClasses: string[];
  measurementTypes: string[];
  kpiDirections: string[];
  frequencies: string[];
  targetOperators: string[];
  skillTypes: string[];
  qualificationTypes: string[];
  authorityTypes: string[];
  requirementLevels: string[];
  relationshipScopes: string[];
  workingConditionTypes: string[];
  roleStatuses: string[];
  activeStatuses: string[];
}

export const getMeta = () => api.get<HrmsMeta>('/meta');

/**
 * Sentence case for the screens; the database keeps the SHOUTING. Acronyms stay
 * acronyms — "Ppe" is not a word anyone recognises on a working-conditions row.
 */
const ACRONYMS = new Set(['PPE', 'KPI', 'KRA', 'JD', 'HR', 'QC', 'IT', 'ERP', 'ESI', 'PF']);

export function pretty(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('_')
    .map((w, i) => {
      if (ACRONYMS.has(w.toUpperCase())) return w.toUpperCase();
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

/** A KPI target as one readable phrase: "≥ 95%", "between 8 and 12 kg/t", "tracked". */
export function targetText(row: ContentRow): string {
  const unit = row.definition?.unit ? ` ${row.definition.unit}` : '';
  const v = row.targetValue;
  switch (row.targetOperator) {
    case 'GTE':
      return `≥ ${v}${unit}`;
    case 'LTE':
      return `≤ ${v}${unit}`;
    case 'EQ':
      return `= ${v}${unit}`;
    case 'BETWEEN':
      return v && typeof v === 'object' ? `${v.min}–${v.max}${unit}` : '—';
    case 'INFO':
      return 'Tracked, not judged';
    default:
      return '—';
  }
}

/** An authority limit as one line: "₹50,000 · Plant consumables · within budget". */
export function limitText(limit: AuthorityLimit | null | undefined): string {
  if (!limit) return 'No limit recorded';
  const parts: string[] = [];
  if (limit.amount !== undefined && limit.amount !== null) {
    parts.push(`${limit.currency ?? ''}${limit.currency ? ' ' : ''}${Number(limit.amount).toLocaleString()}`.trim());
  }
  if (limit.scope) parts.push(limit.scope);
  if (limit.condition) parts.push(limit.condition);
  return parts.length ? parts.join(' · ') : 'No limit recorded';
}
