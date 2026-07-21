/**
 * fab_erp API client
 *
 * fabQuery  — generic read via POST /api/query/v1/base_resource
 * fabMutate — permission-gated write via POST /api/:companySlug/fab_erp/mutate
 *
 * Both functions reuse the shared axios instance from @core/utils/axiosConfig,
 * which already attaches `Authorization: Bearer <token>` from localStorage and
 * handles 401 redirects automatically.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter value for a single field — mirrors what the backend generic query API accepts. */
export type FilterValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | { gte?: string | number; lte?: string | number; between?: [string | number, string | number] };

/** A single sort directive as accepted by the backend generic query API. */
export interface OrderByClause {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Optional parameters for fabQuery.
 * Param names match the generic query API body observed in fab_flow pages:
 *   fields, filters, orderBy, pagination.
 */
export interface FabQueryParams {
  /** Specific columns to return.  Omit for all allowed columns. */
  fields?: string[];
  /** Column-keyed filter map.  Values follow the backend filter shape. */
  filters?: Record<string, FilterValue>;
  /** Sort order — array of { field, direction } objects. */
  orderBy?: OrderByClause[];
  /** Limit / cursor-based pagination. */
  pagination?: {
    limit?: number;
    cursor?: string;
  };
}

// ---------------------------------------------------------------------------
// fabQuery — generic read
// ---------------------------------------------------------------------------

/**
 * Read rows from any resource via the generic query API.
 *
 * Calls: POST {API_HOST}/api/query/v1/base_resource
 * Body:  { operation: 'query', resource, fields?, filters?, orderBy?, pagination? }
 *
 * Returns the full Axios response `.data` (shape: { data: T[], total?: number, ... }).
 */
export async function fabQuery<T = unknown>(
  resource: string,
  params: FabQueryParams = {},
): Promise<T> {
  const { fields, filters, orderBy, pagination } = params;

  const body: Record<string, unknown> = {
    operation: 'query',
    resource,
  };

  if (fields !== undefined)     body.fields     = fields;
  if (filters !== undefined)    body.filters    = filters;
  if (orderBy !== undefined)    body.orderBy    = orderBy;
  if (pagination !== undefined) body.pagination = pagination;

  const res = await api.post<T>(
    `${API_HOST}/api/query/v1/base_resource`,
    body,
  );

  return res.data;
}

// ---------------------------------------------------------------------------
// fabMutate — permission-gated write
// ---------------------------------------------------------------------------

/**
 * Write (insert / update / delete) a row through the fab_erp mutate endpoint.
 *
 * Calls: POST {API_HOST}/api/:companySlug/fab_erp/mutate
 * Body:  { resource, op, payload }
 *
 * companySlug is read from localStorage key "companySlug" — the same key set
 * by AuthContext on login (see src/core/contexts/AuthContext.tsx).
 * The JWT is not included in the body; the shared axios instance injects it as
 * `Authorization: Bearer <token>` via its request interceptor.
 *
 * Returns the full Axios response `.data`.
 */
/** Generic POST to a fab_erp user endpoint, e.g. /bom/copy-template */
export async function fabPost<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabPost: companySlug not found in localStorage.');
  const res = await api.post<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, body);
  return res.data;
}

/** Generic PUT to a fab_erp user endpoint */
export async function fabPut<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabPut: companySlug not found in localStorage.');
  const res = await api.put<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, body);
  return res.data;
}

/** Generic PATCH to a fab_erp user endpoint */
export async function fabPatch<T = unknown>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabPatch: companySlug not found in localStorage.');
  const res = await api.patch<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, body);
  return res.data;
}

/** Generic DELETE to a fab_erp user endpoint */
export async function fabDel<T = unknown>(
  path: string,
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabDel: companySlug not found in localStorage.');
  const res = await api.delete<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`);
  return res.data;
}

/** Generic GET to a fab_erp user endpoint */
export async function fabGet<T = unknown>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) throw new Error('fabGet: companySlug not found in localStorage.');
  const res = await api.get<T>(`${API_HOST}/api/${companySlug}/fab_erp/${path}`, { params });
  return res.data;
}

export async function fabMutate<T = unknown>(
  resource: string,
  op: 'insert' | 'update' | 'delete',
  payload: Record<string, unknown>,
): Promise<T> {
  const companySlug = localStorage.getItem('companySlug');
  if (!companySlug) {
    throw new Error('fabMutate: companySlug not found in localStorage. User may not be logged in.');
  }

  const res = await api.post<T>(
    `${API_HOST}/api/${companySlug}/fab_erp/mutate`,
    { resource, op, payload },
  );

  return res.data;
}

// ---------------------------------------------------------------------------
// Task wait-breakdown (EU-5) — GET /tasks/:id/wait-breakdown
// ---------------------------------------------------------------------------

/** Wait-time reason enum, as returned by GET /tasks/:id/wait-breakdown. */
export type WaitReason =
  | 'waiting_predecessors'
  | 'waiting_materials'
  | 'no_shift'
  | 'machine_down'
  | 'no_operator'
  | 'machine_busy'
  | 'output_blocked'
  | 'unexplained_idle';

/** One contiguous wait segment within the breakdown. */
export interface WaitBreakdownSegment {
  reason: WaitReason;
  segStart: string;
  segEnd: string;
  workingMinutes: number;
}

export interface WaitBreakdownResponse {
  ok: boolean;
  taskId: number;
  /** Per-reason total working minutes. Reasons with no wait time are omitted. */
  totals: Partial<Record<WaitReason, number>>;
  totalWaitMinutes: number;
  /** Ordered by segStart. */
  segments: WaitBreakdownSegment[];
}

/** Fetch the per-reason wait-time breakdown for one task. */
export async function getWaitBreakdown(taskId: number): Promise<WaitBreakdownResponse> {
  return fabGet<WaitBreakdownResponse>(`tasks/${taskId}/wait-breakdown`);
}
