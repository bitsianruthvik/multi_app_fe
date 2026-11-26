import api, { API_HOST } from "@core/utils/axiosConfig";

/**
 * The company admin panel (backend core/admin/adminPanelRoute.js): people, roles, what each role may do, history.
 * Company-level — it belongs to no app, so the address carries the company only.
 */
export interface PersonApp { appId: number; slug: string; appName: string; roleId: number; roleName: string | null; tags?: string[] }
export interface Person {
  id: number; name: string; username: string | null; email: string | null; login: string;
  /** May open this panel. */ admin: boolean;
  /** Their base role is NAMED admin: every check in every app passes (the older rule). */ fullAccess: boolean;
  baseRole: string | null; active: boolean; deactivatedAt: string | null; lastLoginAt: string | null; mustChangePassword: boolean;
  apps: PersonApp[];
}
export interface PeopleList { people: Person[]; counts: { all: number; active: number; admins: number } }

export interface RoleLevel { key: string; label: string; tags: string[] }
export interface RoleApp {
  appId: number; slug: string; name: string; hasCatalog: boolean; tags: string[]; locked: string[];
  departments: { key: string; label: string; help: string | null; level: string; levels: RoleLevel[] }[];
  approvals: { tag: string; label: string; on: boolean }[];
  switches: { key: string; label: string; help: string | null; tags: string[]; on: boolean; partly: boolean }[];
  other: { tag: string; label: string; on: boolean }[];
  all: { tag: string; label: string; on: boolean; locked: boolean }[];
  standard: { key: string; name: string; differs: boolean } | null;
}
export interface Role { id: number; name: string; fullAccess: boolean; people: { id: number; name: string; app: string }[]; apps: RoleApp[] }
export interface RoleRow {
  id: number; name: string; fullAccess: boolean; apps: { appId: number; slug: string; name: string }[]; people: number; baseOf: number;
  standard: { app: string; name: string; differs: boolean } | null;
}
export interface AppRow { appId: number; slug: string; name: string; hasCatalog: boolean; options?: { storesDesk?: boolean }; standards: { key: string; name: string; help: string | null }[] }
export interface RoleList { roles: RoleRow[]; apps: AppRow[] }
export interface Overview { company: { id: number; slug: string; name: string }; apps: { appId: number; slug: string; name: string; people: number; roles: number; hasCatalog: boolean }[] }
export interface BrandData { company: { name: string; slug: string } | null; colors: string[]; logo: string; updatedAt: string | null }
export interface HistoryRow { id: number; by: string | null; action: string; subject: { type: string; id: number | null }; summary: string; at: string }

/** What the server said went wrong, as lines for the screen. */
export function problemsOf(e: unknown): string[] {
  const d = (e as { response?: { data?: { message?: string; problems?: string[] } } })?.response?.data;
  if (d?.problems?.length) return d.problems;
  return [d?.message ?? (e as Error)?.message ?? "Something went wrong."];
}

export function adminApi(company: string) {
  const base = `${API_HOST}/api/${encodeURIComponent(company)}/admin-panel`;
  const get = <T,>(p: string) => api.get<T>(`${base}${p}`).then((r) => r.data);
  const post = <T,>(p: string, body: unknown = {}) => api.post<T>(`${base}${p}`, body).then((r) => r.data);
  const put = <T,>(p: string, body: unknown) => api.put<T>(`${base}${p}`, body).then((r) => r.data);
  return {
    me: () => get<{ admin: boolean }>("/me"),
    changePassword: (current: string, next: string) => post<{ changed: boolean }>("/me/password", { current, next }),
    overview: () => get<Overview>("/overview"),
    people: () => get<PeopleList>("/people"),
    person: (id: number) => get<Person>(`/people/${id}`),
    addPerson: (body: { name: string; login: string; apps: Record<number, number | null>; admin?: boolean }) => post<{ person: Person; tempPassword: string }>("/people", body),
    addPeople: (appId: number, rows: { name: string; login: string; role: string }[]) => post<{ added: { name: string; login: string; role: string | null; tempPassword: string }[] }>("/people/bulk", { appId, rows }),
    savePerson: (id: number, body: { name?: string; login?: string; admin?: boolean; apps?: Record<number, number | null> }) => put<Person>(`/people/${id}`, body),
    setActive: (id: number, active: boolean) => post<Person>(`/people/${id}/${active ? "activate" : "deactivate"}`),
    resetPassword: (id: number) => post<{ tempPassword: string }>(`/people/${id}/reset-password`),
    roles: () => get<RoleList>("/roles"),
    role: (id: number) => get<Role>(`/roles/${id}`),
    addRole: (body: { name: string; standard?: { appId: number; key: string }; copyOf?: number }) => post<Role>("/roles", body),
    saveRole: (id: number, body: { name?: string; apps?: Record<number, { tags: string[] }> }) => put<Role>(`/roles/${id}`, body),
    resetRole: (id: number, appId: number) => post<Role>(`/roles/${id}/reset`, { appId }),
    removeRole: (id: number) => api.delete(`${base}/roles/${id}`).then((r) => r.data as { removed: boolean }),
    history: () => get<HistoryRow[]>("/history?limit=200"),
    // the company's colours (3-6, or [] for the standard look) and logo (a data: URL, or "" for none)
    brand: () => get<BrandData>("/brand"),
    saveBrand: (body: { colors: string[]; logo: string }) => put<BrandData>("/brand", body),
  };
}
export type AdminApi = ReturnType<typeof adminApi>;
