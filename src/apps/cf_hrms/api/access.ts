import { useAuth } from '@core/contexts/AuthContext';
import { api, type ApiProblem } from './client';

/**
 * Setup › Logins and access — the typed client for cf_hrms's own `/access/*`
 * routes (CF_HRMS_HIRING_SPEC.md §12.5).
 *
 * Every route here needs the right "manage logins and access roles"; the server
 * checks it again on each call. Nothing in this file talks to the platform's
 * generic query API any more: an access role, its rights and a login are read
 * and written only through these routes.
 *
 * PASSWORDS. `createLogin` and `resetPassword` answer with a generated password
 * exactly once. This module hands it straight to the caller and keeps nothing;
 * the only caller is the dialog that shows it (`LoginPasswordDialog`).
 */

export type AccessRight = 'view' | 'edit' | 'remove' | 'upload';
export type AccessScope = 'COMPANY' | 'DEPARTMENT';

/** One row of the tick-box table: an area and the rights that exist for it. */
export interface CatalogArea {
  key: string;
  label: string;
  screens: string[];
  rights: { right: AccessRight; tag: string; label: string }[];
}

/** A right that stands on its own, outside the table. */
export interface CatalogNamed {
  tag: string;
  label: string;
  hint?: string | null;
  sensitive?: boolean;
}

/** A ready-made role a new one can start from. */
export interface CatalogTemplate {
  key: string;
  label: string;
  scope: AccessScope;
  tags: string[];
  description?: string | null;
}

export interface AccessCatalog {
  areas: CatalogArea[];
  named: CatalogNamed[];
  templates: CatalogTemplate[];
}

export interface AccessRole {
  roleId: number;
  label: string;
  platformName: string;
  description: string | null;
  scope: AccessScope;
  templateKey: string | null;
  locked: boolean;
  tags: string[];
  loginCount: number;
  /** One sentence written by the server. Shown as it comes, never rebuilt here. */
  summary: string;
}

export interface Login {
  userId: number;
  name: string;
  email: string;
  role: { id: number; label: string };
  state: 'ACTIVE' | 'DISABLED';
  employee: {
    id: number;
    employeeCode: string;
    fullName: string;
    positionCode: string | null;
    departmentName: string | null;
  } | null;
  isYou: boolean;
}

export interface PersonWithoutLogin {
  employeeId: number;
  employeeCode: string;
  name: string;
  positionCode: string | null;
  roleTitle: string | null;
}

export interface LoginsAnswer {
  logins: Login[];
  withoutLogin: PersonWithoutLogin[];
}

/** A login as a 409 `IN_USE` lists it. Only the name and email are relied on. */
export interface LoginHoldingRole {
  userId?: number;
  name?: string;
  email?: string;
}

export interface ErrorLogRow {
  id: number;
  level?: string | null;
  message?: string | null;
  context?: string | null;
  created_at?: string | null;
}

export const SCOPE_LABEL: Record<AccessScope, string> = {
  COMPANY: 'Whole company',
  DEPARTMENT: 'Their org unit and everything under it',
};

export const accessApi = {
  catalog: async (): Promise<AccessCatalog> => {
    const c = await api.get<Partial<AccessCatalog>>('/access/catalog');
    return { areas: c.areas ?? [], named: c.named ?? [], templates: c.templates ?? [] };
  },

  roles: async (): Promise<AccessRole[]> => (await api.get<{ roles: AccessRole[] }>('/access/roles')).roles ?? [],

  /** `copyFrom` is a ready-made role's key, or the id of an existing role. */
  createRole: async (body: { label: string; description?: string; scope: AccessScope; copyFrom?: number | string }) =>
    (await api.post<{ role: AccessRole }>('/access/roles', body)).role,

  /** `tags`, when sent, REPLACES the role's rights. */
  updateRole: (roleId: number, body: { label?: string; description?: string | null; scope?: AccessScope; tags?: string[] }) =>
    api.put<{ role: AccessRole; loginsAffected: number }>(`/access/roles/${roleId}`, body),

  deleteRole: (roleId: number) => api.del<unknown>(`/access/roles/${roleId}`),

  logins: async (): Promise<LoginsAnswer> => {
    const res = await api.get<Partial<LoginsAnswer>>('/access/logins');
    return { logins: res.logins ?? [], withoutLogin: res.withoutLogin ?? [] };
  },

  /** Answers with the generated password ONCE. Hand it to the dialog and nowhere else. */
  createLogin: (body: { employeeId: number; email: string; roleId: number }) =>
    api.post<{ login: Login; password: string }>('/access/logins', body),

  updateLogin: async (userId: number, body: { roleId?: number; email?: string }) =>
    (await api.put<{ login: Login }>(`/access/logins/${userId}`, body)).login,

  disableLogin: async (userId: number) => (await api.post<{ login: Login }>(`/access/logins/${userId}/disable`)).login,

  enableLogin: async (userId: number) => (await api.post<{ login: Login }>(`/access/logins/${userId}/enable`)).login,

  /** Answers with a new generated password ONCE. */
  resetPassword: (userId: number) => api.post<{ password: string }>(`/access/logins/${userId}/reset-password`),

  /**
   * Recent error log entries (platform admin only).
   *
   * The endpoint is real and authenticated, and it currently answers `[]` on
   * every call because no log table is configured on this platform. The screen
   * says that in its empty state instead of implying there were no errors.
   */
  errorLogs: () => api.get<ErrorLogRow[]>('/admin/error-logs'),
};

/** The server's refusal code (`LOCKED`, `IN_USE`, `LAST_OWNER`, `INVALID`), if it sent one. */
export function refusalCode(e: unknown): string | undefined {
  return (e as Partial<ApiProblem> | null)?.code;
}

/** The logins a 409 `IN_USE` names — empty when the server sent none. */
export function loginsHolding(e: unknown): LoginHoldingRole[] {
  // The server sends them under `detail.logins` (accessService.deleteRole).
  const body = (e as Partial<ApiProblem> | null)?.body as { detail?: { logins?: unknown }; logins?: unknown } | undefined;
  const raw = body?.detail?.logins ?? body?.logins;
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is LoginHoldingRole => !!l && typeof l === 'object');
}

/**
 * The platform admin — the only person the Error logs tab is listed for. Not a
 * cf_hrms right: the log belongs to the platform, not to this app.
 */
export function useIsPlatformAdmin(): boolean {
  const { user } = useAuth();
  // Exactly the name the server bypasses on — not "administrator", not a role that merely contains it.
  return String(user?.role ?? '').toLowerCase() === 'admin';
}
