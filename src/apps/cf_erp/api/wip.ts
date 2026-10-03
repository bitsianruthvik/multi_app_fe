import { cfApi, qs } from './client';
import type { WipAnswer } from './types';

/** GET /stock/wip — every piece being made, as stock, grouped by order line. */
export const getWip = (params: { orderId?: number | string | null; search?: string } = {}) =>
  cfApi.get<WipAnswer>(`/stock/wip${qs({ orderId: params.orderId, search: params.search })}`);

/**
 * GET /offcuts — one page. Prefer `usePagedList('/offcuts', …)` on screens; this
 * is the same request for a caller that wants the answer directly.
 */
export const listOffcuts = (params: { status?: string; thickness?: number | string; grade?: string; search?: string; limit?: number; offset?: number } = {}) =>
  cfApi.get<{ rows: import('./types').Offcut[]; total: number; counts?: { status: Record<string, number> }; limit: number; offset: number; hasMore: boolean }>(
    `/offcuts${qs({ paged: 1, ...params })}`,
  );
