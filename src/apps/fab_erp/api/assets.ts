/**
 * assets.ts — the machine as an asset: valuation, maintenance, and what has
 * been bought for it.
 *
 * Mirrors routes/assets.js. Depreciation is never sent from here — it is
 * computed on the server from cost/method/life/date, because a book value
 * stored or computed in two places is a book value that disagrees with itself.
 */

import { fabGet, fabPost, fabDel } from './client';

export type MaintenanceStatus = 'ok' | 'due' | 'overdue' | 'in_progress';

export interface MaintenancePlan {
  id: number;
  resourceId: number;
  resourceName?: string;
  resourceCode?: string | null;
  name: string;
  frequencyDays: number;
  leadDays: number;
  lastDoneAt: string | null;
  nextDueAt: string | null;
  notes: string | null;
  status: MaintenanceStatus;
  /** Set when maintenance is open on this plan right now. */
  openLogId: number | null;
  startedAt: string | null;
}

export interface MaintenanceLog {
  id: number;
  planId: number | null;
  planName: string | null;
  dueAt: string | null;
  startedAt: string;
  completedAt: string | null;
  downtimeMinutes: number | null;
  notes: string | null;
}

export interface MaintenanceView {
  plans: MaintenancePlan[];
  counts: { overdue: number; due: number; inProgress: number };
  openByResource: Array<{ id: number; resourceId: number; planId: number | null; startedAt: string }>;
  history?: MaintenanceLog[];
}

export interface Valuation {
  resourceId: number;
  name: string;
  currency: string | null;
  applicable: boolean;
  /** Why there is no figure — shown instead of a misleading zero. */
  reason: string | null;
  cost: number | null;
  method: string | null;
  ageYears: number | null;
  accumulated: number | null;
  bookValue: number | null;
  annualCharge: number | null;
}

export interface AssetPurchase {
  id: number;
  orderNumber: string;
  status: string;
  createdAt: string;
  currency: string | null;
  supplierName: string | null;
  lineCount: number;
  value: number;
}

export const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Straight line' },
  { value: 'wdv', label: 'Reducing balance (WDV)' },
  { value: 'none', label: 'None' },
] as const;

/** Due list across the whole shop. */
export const fetchMaintenance = () => fabGet<MaintenanceView>('assets/maintenance');

/** One machine's plans plus its service history. */
export const fetchMachineMaintenance = (resourceId: number) =>
  fabGet<MaintenanceView>(`assets/resources/${resourceId}/maintenance`);

export const saveMaintenancePlan = (plan: {
  id?: number; resourceId: number; name: string;
  frequencyDays: number; leadDays?: number; lastDoneAt?: string | null; notes?: string | null;
}) => fabPost<{ id: number; nextDueAt: string | null }>('assets/maintenance/plans', plan);

export const deleteMaintenancePlan = (planId: number) =>
  fabDel<{ ok: true }>(`assets/maintenance/plans/${planId}`);

/** Begin maintenance — this also takes the machine out of service. */
export const startMaintenance = (resourceId: number, body: { planId?: number | null; note?: string } = {}) =>
  fabPost<{ ok: true; logId: number; dueAt: string | null }>(
    `assets/resources/${resourceId}/maintenance/start`, body,
  );

export const stopMaintenance = (resourceId: number, body: { note?: string } = {}) =>
  fabPost<{ ok: true; logId: number; planId: number | null; nextDueAt: string | null }>(
    `assets/resources/${resourceId}/maintenance/stop`, body,
  );

export const fetchValuation = (resourceId: number) =>
  fabGet<Valuation>(`assets/resources/${resourceId}/valuation`);

export const raiseAssetPurchase = (body: {
  resourceId?: number; resourceTypeId?: number; supplierId: number;
  expectedDate?: string | null; notes?: string | null;
  lines: Array<{ description: string; qty: number; unitPrice?: number | null; code?: string }>;
}) => fabPost<{ ok: true; order: { id: number; orderNumber: string; lineCount: number; freeTextOnly: boolean } }>(
  'assets/purchase', body,
);

export const fetchAssetPurchases = (params: { resourceId?: number; resourceTypeId?: number }) =>
  fabGet<{ orders: AssetPurchase[] }>('assets/purchases', params);
