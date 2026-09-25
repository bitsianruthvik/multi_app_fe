import { query, mutate } from '@core/api-builder';
import { send } from '@core/api-builder/client';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import { api } from './client';

/**
 * The Access area's data layer — the PLATFORM's own tables, not cf_hrms's.
 *
 * Everything here goes through the generic query API (`@core/api-builder`),
 * which is the only read/write path the nine core tables have. cf_hrms's own 46
 * resources deliberately declare no `writable`, so they cannot be reached this
 * way; these nine can, and that is the whole reason this area exists.
 *
 * FOUR FACTS ABOUT THAT API THAT THE SCREENS ARE BUILT AROUND
 *
 *  1. **A failed query answers 200.** `{ success: false, error }` with an HTTP
 *     200 is the normal shape of a broken read here, so every call below checks
 *     `success` rather than trusting the status code. A screen that only caught
 *     throws showed an empty table and called it "no rows".
 *
 *  2. **The requested `fields` list does not narrow the response.** The backend
 *     projects every field its own resourceDef declares and drops the ones the
 *     table does not actually have. `fields` is validated client-side only
 *     (`validateFields` against `manifest.json`) — so asking for a field the
 *     manifest lacks fails BEFORE any request, with a generic failure on screen
 *     and nothing in the network tab.
 *
 *  3. **`users` exposes no `role_id`.** The core resourceDef projects
 *     id · name · email · company_id and a team join, and nothing else survives
 *     the schema filter (`age` and `status` are not columns on this schema at
 *     all). A login's role can therefore be WRITTEN here but not READ back, and
 *     the People screen says so rather than showing a column of dashes. Fixing
 *     it is one line in `multi_app_be/resourceDef.json`.
 *
 *  4. **Scoping is per-table, from the JWT.** `users`, `roles`, `teams` and
 *     `role_capability` carry a company_id and are scoped to the caller's
 *     tenant automatically. `features` and `features_capability` do NOT — they
 *     are global vocabulary, shared by every tenant on the platform. That is
 *     why the Capabilities screen is read-mostly and says out loud that a new
 *     row there is visible to everyone.
 */

/** A platform login. `teamName` arrives via the resource's join, not a column. */
export interface PlatformUser {
  id: number;
  name: string;
  email: string;
  teamName: string | null;
  company_id: number | null;
}

export interface PlatformRole {
  id: number;
  name: string;
  role_tag: string | null;
}

export interface PlatformTeam {
  id: number;
  name: string;
}

export interface PlatformFeature {
  id: number;
  feature_name: string;
  feature_tag: string | null;
  type: 'frontend' | 'backend';
}

/**
 * A capability — a named bundle of features. `features_json` is a MySQL JSON
 * column of feature ids; it comes back parsed, and it is genuinely null on the
 * rows a historical bug left behind (a capability that grants nothing).
 */
export interface PlatformCapability {
  capability_id: number;
  name: string;
  features_json: number[] | null;
}

/**
 * One grant: this role, in this company, holds this capability.
 *
 * `app_id` is real in the table but absent from the core resourceDef, so it can
 * neither be read nor written here. A grant made from this screen is therefore
 * app-wide (NULL = wildcard) — which the Roles screen states in its helper text
 * rather than leaving someone to discover it.
 */
export interface RoleGrant {
  id: number;
  role_id: number | null;
  team_id: number | null;
  company_id: number | null;
  capability_id: number | null;
}

export interface ErrorLogRow {
  id: number;
  level?: string | null;
  message?: string | null;
  context?: string | null;
  created_at?: string | null;
}

/* ─────────────────────────────────────────────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Unwraps the generic API's envelope. See fact 1 above: `success: false` comes
 * back with a 200, so this is the only place that decides whether a read
 * worked, and it raises the backend's own words instead of "Something failed".
 */
function rows<T>(res: any, what: string): T[] {
  if (res && res.success === false) {
    throw new Error(res.error || `Could not load ${what}.`);
  }
  return (res?.data ?? []) as T[];
}

/**
 * The same check for a write — and it is the one that actually bites. A refused
 * insert comes back as `{ success: false }` with a 200, so a caller that only
 * awaited the promise would close its dialog, show a success toast and reload a
 * list that has not changed. Everything that writes goes through here.
 */
async function written<T>(p: Promise<T>, what: string): Promise<T> {
  const res: any = await p;
  if (res && res.success === false) throw new Error(res.error || `Could not ${what}.`);
  return res as T;
}

/**
 * `features_json` is a MySQL JSON column. The driver normally hands it back
 * parsed, but a string is a legal thing to receive from a JSON column and one
 * `JSON.parse` in the wrong place would take the whole permissions screen down.
 * Normalised once, here, so no screen has to think about it.
 */
function toIdList(value: unknown): number[] | null {
  if (value == null) return null;
  const raw = typeof value === 'string' ? safeParse(value) : value;
  if (!Array.isArray(raw)) return null;
  const ids = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return ids.length ? ids : null;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const USER_FIELDS = ['id', 'name', 'email', 'teamName', 'company_id'];

export const accessApi = {
  users: async (): Promise<PlatformUser[]> =>
    rows<PlatformUser>(
      await query({ resource: 'users', fields: USER_FIELDS, sort: { name: 'asc' } }),
      'the people with logins',
    ),

  roles: async (): Promise<PlatformRole[]> =>
    rows<PlatformRole>(
      await query({ resource: 'roles', fields: ['id', 'name', 'role_tag'], sort: { name: 'asc' } }),
      'the roles',
    ),

  teams: async (): Promise<PlatformTeam[]> =>
    rows<PlatformTeam>(await query({ resource: 'teams', fields: ['id', 'name'] }), 'the teams'),

  features: async (): Promise<PlatformFeature[]> =>
    rows<PlatformFeature>(
      await query({ resource: 'features', fields: ['id', 'feature_name', 'feature_tag', 'type'] }),
      'the features',
    ),

  capabilities: async (): Promise<PlatformCapability[]> => {
    const raw = rows<PlatformCapability & { features_json: unknown }>(
      await query({
        resource: 'features_capability',
        fields: ['capability_id', 'name', 'features_json'],
      }),
      'the capabilities',
    );
    return raw.map((c) => ({ ...c, features_json: toIdList(c.features_json) }));
  },

  /** Every grant in this company. Scoped to the tenant by the backend, not here. */
  grants: async (): Promise<RoleGrant[]> =>
    rows<RoleGrant>(
      await query({
        resource: 'role_capability',
        fields: ['id', 'role_id', 'team_id', 'company_id', 'capability_id'],
      }),
      'the current access',
    ),

  /**
   * Creates a login. company_id is injected from the caller's JWT by the
   * backend — deliberately NOT a field on the form. The screen this replaced
   * had a Company picker listing every tenant on the platform, which let an
   * admin create an account in somebody else's company.
   */
  createUser: (input: { name: string; email: string; password: string; roleId: number; teamId: number | null }) =>
    written(
      mutate({
        resource: 'users',
        fields: ['id', 'name', 'email'],
        data: {
          name: input.name,
          email: input.email,
          password: input.password,
          role_id: input.roleId,
          ...(input.teamId ? { team_id: input.teamId } : {}),
        },
      }),
      'create that login',
    ),

  grant: (roleId: number, capabilityId: number) =>
    written(
      mutate({
        resource: 'role_capability',
        fields: ['id', 'role_id', 'capability_id'],
        data: { role_id: roleId, capability_id: capabilityId },
      }),
      'grant that capability',
    ),

  /**
   * Revokes a grant. A soft delete, scoped to the caller's company by the
   * backend. `@core/api-builder` exposes query and insert/update but no delete,
   * so this speaks to the same endpoint directly rather than adding a helper to
   * a shared module this work is not allowed to touch.
   */
  revoke: async (grantId: number) => {
    const res: any = await send({
      method: 'POST',
      url: '/api/query/v1/base_resource',
      body: { operation: 'delete', resource: 'role_capability', data: { id: grantId } },
    });
    if (res && res.success === false) throw new Error(res.error || 'Could not revoke that capability.');
    return res;
  },

  createFeature: (input: { featureName: string; featureTag: string; type: 'frontend' | 'backend' }) =>
    written(
      mutate({
        resource: 'features',
        fields: ['id', 'feature_name', 'feature_tag', 'type'],
        data: { feature_name: input.featureName, feature_tag: input.featureTag, type: input.type },
      }),
      'add that feature',
    ),

  /**
   * Creates a capability from a set of features.
   *
   * `features_json` goes over as a JSON *string*: the driver expands a raw JS
   * array into a SQL value list, which is not what a JSON column wants. The
   * screen this replaced wrote one row per feature with a `feature_id` column
   * that does not exist on this table and a client-invented `capability_id`
   * over an auto-increment primary key — so it never created a working
   * capability at all.
   */
  createCapability: (input: { name: string; featureIds: number[] }) =>
    written(
      mutate({
        resource: 'features_capability',
        fields: ['name', 'features_json'],
        data: { name: input.name, features_json: JSON.stringify(input.featureIds) },
      }),
      'add that capability',
    ),

  /**
   * Recent error log entries.
   *
   * The endpoint is real and authenticated, and it currently answers `[]` on
   * every call because no log table is configured on this platform. The screen
   * says that in its empty state instead of implying the system has had no
   * errors.
   */
  errorLogs: () => api.get<ErrorLogRow[]>('/admin/error-logs'),
};

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Which app a capability belongs to.
 *
 * The platform has no column for this: a capability is a name and a list of
 * feature ids, and the only honest signal of ownership is the tag prefix the
 * apps have used consistently since the first one shipped. So it is read from
 * the capability's own name first, then from the tags of the features it
 * grants — which catches the handful of early capabilities that were named in
 * prose ("Record Audio", "Sales Basic") before the convention existed.
 *
 * Grouping matters because the screen it replaced listed all ~80 in one
 * undifferentiated wall of chips: an HRMS administrator scrolling past
 * `fab_erp_buffer_config` to find `cf_hrms_leave_manage` is being asked to do
 * the product's filing for it.
 */
export type CapabilityApp = 'cf_hrms' | 'cf_erp' | 'fab_erp' | 'fab_flow' | 'audio_intelligence' | 'sales_control' | 'other';

export const APP_LABEL: Record<CapabilityApp, string> = {
  cf_hrms: 'CF HRMS',
  cf_erp: 'CF ERP',
  fab_erp: 'Fab ERP',
  fab_flow: 'Fab Flow',
  audio_intelligence: 'Audio Intelligence',
  sales_control: 'Sales Control',
  other: 'Other',
};

/** cf_hrms first — it is what an HRMS administrator came here to change. */
export const APP_ORDER: CapabilityApp[] = [
  'cf_hrms',
  'cf_erp',
  'fab_erp',
  'fab_flow',
  'audio_intelligence',
  'sales_control',
  'other',
];

function appFromTag(tag: string): CapabilityApp | null {
  const t = tag.toLowerCase();
  if (t.startsWith('cf_hrms')) return 'cf_hrms';
  if (t.startsWith('cf_erp')) return 'cf_erp';
  if (t.startsWith('fab_erp')) return 'fab_erp';
  if (t.startsWith('fab_')) return 'fab_flow';
  if (t.startsWith('audio') || t.includes('record') || t.includes('transcri')) return 'audio_intelligence';
  if (t.startsWith('sales')) return 'sales_control';
  return null;
}

export function capabilityApp(capability: PlatformCapability, featureById: Map<number, PlatformFeature>): CapabilityApp {
  const byName = appFromTag(capability.name ?? '');
  if (byName) return byName;
  for (const id of capability.features_json ?? []) {
    const f = featureById.get(id);
    const byFeature = f && appFromTag(f.feature_tag ?? f.feature_name ?? '');
    if (byFeature) return byFeature;
  }
  return 'other';
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Who may change the platform's access model.
 *
 * Deliberately NOT a cf_hrms feature tag — see `PLATFORM_ADMIN` in navMeta.ts
 * for why, and for how the shell resolves it. The screens use this directly to
 * gate their writes, so a reader who reaches one by URL gets a read-only page
 * rather than a crash or a button that fails.
 */
export function useIsPlatformAdmin(): boolean {
  const { user } = useAuth();
  return isAdminRole(user?.role);
}
