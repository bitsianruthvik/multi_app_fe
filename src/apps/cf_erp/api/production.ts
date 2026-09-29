import { cfApi } from './client';
import type {
  AssignmentView, TimeWrite, TimesView, WorkOrderDetail, WorkOrderRow, WorkOrderStatus,
} from './types';

/**
 * Times and contractor work orders (services/timeEstimateService.js,
 * services/workOrderService.js). Every write answers with the whole view, so a
 * screen replaces its state with the reply and never patches it by hand.
 */
const line = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}`;

export const getTimes = (orderId: number, lineId: number) => cfApi.get<TimesView>(`${line(orderId, lineId)}/times`);
export const putTimes = (orderId: number, lineId: number, cells: TimeWrite[]) => cfApi.put<TimesView>(`${line(orderId, lineId)}/times`, { cells });

export const getAssignment = (orderId: number, lineId: number) => cfApi.get<AssignmentView>(`${line(orderId, lineId)}/assignment`);
export const postAssignment = (orderId: number, lineId: number, cells: { pieceId: number; operationId: number }[], contractorId: number | null) =>
  cfApi.post<AssignmentView>(`${line(orderId, lineId)}/assignment`, { cells, contractorId });

/** Several groups in ONE transaction (all or nothing): each group is its cells and who does them (null = in-house). */
export const postAssignments = (orderId: number, lineId: number, assignments: { cells: { pieceId: number; operationId: number }[]; contractorId: number | null }[]) =>
  cfApi.post<AssignmentView>(`${line(orderId, lineId)}/assignment`, { assignments });

// The work-order shapes are read loosely: a field the server leaves out is null, not a crash.
type Loose = Record<string, unknown> & { order?: { id?: number; code?: string }; line?: { id?: number; lineNo?: number }; contractor?: { id?: number; name?: string } };
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
function progressOf(v: unknown): WorkOrderRow['progress'] {
  const p = v as { done?: unknown; total?: unknown; steps?: unknown } | null;
  if (!p || typeof p !== 'object') return null;
  const total = num(p.total) ?? num(p.steps);
  return total == null ? null : { done: num(p.done) ?? 0, total };
}
export function toWorkOrderRow(raw: unknown): WorkOrderRow {
  const r = raw as Loose;
  return {
    id: r.id as number, code: (str(r.code) ?? `#${r.id}`), status: (r.status as WorkOrderStatus) ?? 'draft',
    contractorId: num(r.contractorId) ?? r.contractor?.id ?? null, contractorName: str(r.contractorName) ?? r.contractor?.name ?? null,
    orderId: num(r.orderId) ?? r.order?.id ?? null, orderCode: str(r.orderCode) ?? r.order?.code ?? null,
    lineId: num(r.orderLineId) ?? num(r.lineId) ?? r.line?.id ?? null, lineNo: num(r.lineNo) ?? r.line?.lineNo ?? null,
    cellCount: num(r.cellCount) ?? 0, progress: progressOf(r.progress),
  };
}
export function toWorkOrderDetail(raw: unknown): WorkOrderDetail {
  const r = raw as Loose;
  return {
    ...toWorkOrderRow(raw), startDate: str(r.startDate), dueDate: str(r.dueDate), notes: str(r.notes),
    scope: Array.isArray(r.scope) ? (r.scope as WorkOrderDetail['scope']).map((s) => ({ pieceCode: String(s.pieceCode ?? ''), operations: s.operations ?? [] })) : [],
  };
}

export const listWorkOrders = async () => {
  const raw = await cfApi.get<unknown>('/work-orders');
  const rows = Array.isArray(raw) ? raw : (raw as { workOrders?: unknown[]; rows?: unknown[] })?.workOrders ?? (raw as { rows?: unknown[] })?.rows ?? [];
  return rows.map(toWorkOrderRow);
};
export const getWorkOrder = async (id: number) => toWorkOrderDetail(await cfApi.get<unknown>(`/work-orders/${id}`));
// The replies are not trusted for their shape — the screen reloads the work order after a write.
export const patchWorkOrder = (id: number, body: { startDate?: string | null; dueDate?: string | null; notes?: string | null }) =>
  cfApi.patch<unknown>(`/work-orders/${id}`, body);
export const setWorkOrderStatus = (id: number, status: WorkOrderStatus) => cfApi.post<unknown>(`/work-orders/${id}/status`, { status });
