import { cfApi, qs } from './client';
import type {
  FloorDay, FloorGap, FloorMachine, FloorOperator, FloorQueue, FloorReason, FloorRow, FloorRunning, FloorSession,
  FloorStep, FloorStop, OperatorRow, StopReasonRow,
} from './types';

/**
 * The machine log (services/floorService.js, routes/floor.js — plan section 2).
 * The backend was built in parallel, so every reply is read loosely: a field
 * the server names a little differently (`startedAt` / `start`) or leaves out
 * becomes a plain default, never a crash on a tablet at a machine.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;
const num = (v: unknown, d = 0): number => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const list = (v: unknown): Loose[] => (Array.isArray(v) ? (v as Loose[]) : []);

export const toMachine = (r: Loose): FloorMachine => ({
  id: r.id, code: String(r.code ?? ''), name: String(r.name ?? r.code ?? `#${r.id}`), type: str(r.type),
  running: num(r.running), stopped: !!r.stopped, stopReason: str(r.stopReason ?? r.stoppedReason), lastActivityAt: str(r.lastActivityAt),
});
export const toReason = (r: Loose): FloorReason => ({
  id: r.id, code: String(r.code ?? ''), label: String(r.label ?? r.code ?? ''), needsNote: !!(r.needsNote ?? r.needs_note),
});
/** A queue step is `{ id, … }`; a running row or a session names its step as `stepId` or `step: { id }`. */
export const toStep = (r: Loose): FloorStep => {
  const s: Loose = { ...(r.step ?? {}), ...r };
  return {
    id: num(r.stepId ?? r.step?.id ?? r.id), pieceCode: String(s.pieceCode ?? ''), pieceName: String(s.pieceName ?? s.pieceCode ?? ''),
    operation: String(s.operation ?? s.operationName ?? ''), qtyLeft: num(s.qtyLeft), qtyTotal: num(s.qtyTotal), orderCode: str(s.orderCode),
    state: str(s.state), ready: s.ready !== false, why: str(s.why), pausedSessionId: numOrNull(s.pausedSessionId),
  };
};
export const toRunning = (r: Loose): FloorRunning => {
  const step = toStep(r);
  return { ...step, sessionId: num(r.sessionId ?? r.id), stepId: step.id, startedAt: String(r.startedAt ?? r.start ?? new Date().toISOString()) };
};
export const toStop = (r: Loose): FloorStop => ({
  id: r.id, reasonId: numOrNull(r.reasonId), reason: String(r.reason ?? r.reasonLabel ?? 'Stopped'), note: str(r.note),
  start: String(r.start ?? r.startedAt), end: str(r.end ?? r.endedAt),
});
export const toSession = (r: Loose): FloorSession => {
  const step = toStep(r);
  return {
    id: r.id, stepId: step.id, pieceCode: step.pieceCode, pieceName: step.pieceName, operation: step.operation,
    start: String(r.start ?? r.startedAt), end: str(r.end ?? r.endedAt), good: numOrNull(r.good), scrap: numOrNull(r.scrap), endKind: r.endKind ?? null,
  };
};
const toGap = (r: Loose): FloorGap => ({ start: String(r.start), end: String(r.end), minutes: num(r.minutes) });
export const toDay = (r: Loose, date = ''): FloorDay => ({
  date: str(r.date) ?? date,
  shifts: list(r.shifts).map((s) => ({ start: String(s.start), end: String(s.end), label: String(s.label ?? '') })),
  sessions: list(r.sessions).map(toSession), stops: list(r.stops).map(toStop), // Slivers under a minute (one job ending as the next begins) are not a gap anybody can explain.
  notRecorded: list(r.notRecorded).map(toGap).filter((g) => g.minutes >= 1),
  totals: { work: num(r.totals?.work), stopped: num(r.totals?.stopped), notRecorded: num(r.totals?.notRecorded), shift: num(r.totals?.shift) },
  reopened: list(r.reopened).map((x) => ({ stepId: num(x.stepId), label: String(x.label ?? ''), qtyLeft: num(x.qtyLeft) })),
});

export const getMachines = async () => list(await cfApi.get<unknown>('/floor/machines')).map(toMachine);
export const getOperators = async (machineId?: number) => list(await cfApi.get<unknown>(`/floor/operators${qs({ machineId })}`))
  .map((o): FloorOperator => ({ id: o.id, code: str(o.code), name: String(o.name) }));
export const getReasons = async () => list(await cfApi.get<unknown>('/floor/reasons')).map(toReason);
export const getQueue = async (machineId: number, search = ''): Promise<FloorQueue> => {
  const r = await cfApi.get<Loose>(`/floor/machines/${machineId}/queue${qs({ search })}`);
  return { running: list(r.running).map(toRunning), next: list(r.next).map(toStep), stop: r.stop ? toStop(r.stop) : null };
};
export const getDay = async (machineId: number, date: string) =>
  toDay(await cfApi.get<Loose>(`/floor/machines/${machineId}/day${qs({ date })}`), date);

export const startWork = (machineId: number, operatorId: number, stepIds: number[]) => cfApi.post<unknown>('/floor/start', { machineId, operatorId, stepIds });
export const pauseWork = (sessionIds: number[]) => cfApi.post<unknown>('/floor/pause', { sessionIds });
export const resumeWork = (sessionIds: number[]) => cfApi.post<unknown>('/floor/resume', { sessionIds });
export const finishWork = (sessionId: number, good: number, scrap: number, done: boolean) => cfApi.post<unknown>('/floor/finish', { sessionId, good, scrap, done });
export const stopMachine = (machineId: number, operatorId: number, reasonId: number, note?: string, since?: string) =>
  cfApi.post<unknown>('/floor/stop', { machineId, operatorId, reasonId, ...(note ? { note } : {}), ...(since ? { since } : {}) });
export const endStop = (stopId: number) => cfApi.post<unknown>(`/floor/stop/${stopId}/end`, {});

/**
 * Saves rows of a day in one transaction. `deleted` is the plan's list of ids;
 * ids of work and of stops come from two tables and can be equal, so
 * `deletedRows` says which is which (the server may ignore it).
 */
export async function saveDay(machineId: number, date: string, operatorId: number, rows: FloorRow[], deleted: { kind: 'work' | 'stop'; id: number }[] = []): Promise<FloorDay> {
  const r = await cfApi.put<Loose>(`/floor/machines/${machineId}/day`, { date, operatorId, rows, deleted: deleted.map((d) => d.id), deletedRows: deleted });
  return toDay(r, date);
}

/* Setup for managers. The plan lists no routes for these; plain REST is assumed. */
const toOperatorRow = (r: Loose): OperatorRow => ({ id: r.id, code: str(r.code), name: String(r.name), status: r.status === 'inactive' ? 'inactive' : 'active', machineIds: (Array.isArray(r.machineIds) ? list(r.machineIds).map(Number) : list(r.machines).map((m) => Number(m.id))) });
const toReasonRow = (r: Loose): StopReasonRow => ({ ...toReason(r), sortOrder: num(r.sortOrder ?? r.sort_order), status: r.status === 'inactive' ? 'inactive' : 'active' });
export const listOperatorRows = async () => list(await cfApi.get<unknown>('/operators')).map(toOperatorRow);
export const saveOperator = (id: number | null, body: { name: string; code: string; status: string; machineIds: number[] }) =>
  id ? cfApi.put<unknown>(`/operators/${id}`, body) : cfApi.post<unknown>('/operators', body);
export const deleteOperator = (id: number) => cfApi.del<unknown>(`/operators/${id}`);
export const listReasonRows = async () => list(await cfApi.get<unknown>('/stop-reasons')).map(toReasonRow);
export const saveReason = (id: number | null, body: { label: string; code: string; sortOrder: number; needsNote: boolean; status: string }) =>
  id ? cfApi.put<unknown>(`/stop-reasons/${id}`, body) : cfApi.post<unknown>('/stop-reasons', body);
export const deleteReason = (id: number) => cfApi.del<unknown>(`/stop-reasons/${id}`);
