import { cfApi, qs } from './client';
import type { Approval } from './approvals';

/**
 * Delay alerts by department (§110, services/alertService.js) and the MD's dashboard (services/mdDashboardService.js).
 */
export type AlertKind = 'po_date_moved' | 'po_late' | 'start_late' | 'unplanned_start' | 'finish_late';
export type Department = 'md' | 'planning' | 'stores' | 'purchase' | 'floor';
export const DEPARTMENT_LABEL: Record<Department, string> = { md: 'MD', planning: 'Planning', stores: 'Stores', purchase: 'Purchase', floor: 'Shop floor' };
export const KIND_LABEL: Record<AlertKind, string> = {
  po_date_moved: 'Delivery date moved', po_late: 'Procurement late', start_late: 'Start late', unplanned_start: 'Unplanned start', finish_late: 'Finish late',
};

/** The bar beside an alert: danger red, warning amber, info blue. */
export const SEV_INK: Record<'info' | 'warning' | 'danger', string> = { danger: 'var(--c-danger-600)', warning: 'var(--c-warning-600)', info: 'var(--c-info-600)' };

export interface Alert {
  id: number; kind: AlertKind; kindLabel: string; severity: 'info' | 'warning' | 'danger'; title: string; detail: string | null;
  departments: Department[]; order: { id: number; code: string } | null; productionOrderId: number | null;
  operation: { id: number; name: string } | null; subject: { type: string; id: number } | null; link: string | null;
  daysLate: number | null; count: number | null; status: 'open' | 'acknowledged' | 'resolved';
  firstAt: string; lastAt: string; ackedAt: string | null; ackedBy: string | null;
}
export interface AlertList {
  departments: Department[]; alerts: Alert[];
  counts: { total: number; open: number; byKind: Partial<Record<AlertKind, number>>; byDepartment: Partial<Record<Department, number>> };
}
export interface AlertQuery { status?: 'active' | 'open' | 'acknowledged' | 'resolved'; department?: Department | ''; kind?: AlertKind | ''; orderId?: number; all?: boolean }

export const listAlerts = (q: AlertQuery = {}) => cfApi.get<AlertList>(`/alerts${qs({ ...q, department: q.department || undefined, kind: q.kind || undefined, all: q.all ? 1 : undefined })}`);
export const ackAlert = (id: number) => cfApi.post<{ id: number; status: string }>(`/alerts/${id}/ack`, {});
export const resolveAlert = (id: number) => cfApi.post<{ id: number; status: string }>(`/alerts/${id}/resolve`, {});
export const checkAlertsNow = () => cfApi.post<{ found: number }>('/alerts/check', {});

export interface MdTodayRow { id: number; label: string; planned: number; started: number; done: number; running: number; behind: number; unplanned: number }
export interface MdPlanRow {
  id: number; label: string; steps: number; done: number; due: number; overdue: number; planned: number; running: number; donePct: number; duePct: number;
  customer?: string | null; committed?: string | null; planEnd?: string | null; late?: boolean; code?: string | null;
}
export interface MdDashboard {
  by: 'order' | 'operation'; planRunAt: string | null;
  summary: { planned: number; started: number; done: number; running: number; behind: number; unplanned: number; alerts: number; danger: number; requests: number };
  today: MdTodayRow[]; plan: MdPlanRow[];
  alerts: { rows: Alert[]; byKind: Partial<Record<AlertKind, number>> };
  requests: Approval[];
}
export const getMdDashboard = (by: 'order' | 'operation') => cfApi.get<MdDashboard>(`/md-dashboard${qs({ by })}`);
