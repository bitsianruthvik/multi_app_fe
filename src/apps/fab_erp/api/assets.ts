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

// ── Where a machine is (Phase 8) ────────────────────────────────────────────

export interface MachineArea {
  id: number;
  code: string;
  name: string;
  plantId: number | null;
  plantName: string | null;
}

export interface MachineLocation {
  resourceId: number;
  name: string;
  code: string | null;
  pieceId: number | null;
  serialNo: string | null;
  locationId: number | null;
  locationCode: string | null;
  locationName: string | null;
  plantName: string | null;
  /** In an off-site area. It is STILL schedulable — off-site work is real work. */
  offSite: boolean;
  history: Array<{
    id: number; txnType: string; qty: number; txnDate: string;
    notes: string | null; locationCode: string | null; locationName: string | null;
  }>;
}

export interface SparePart {
  id: number; code: string; name: string; unit: string | null;
  categoryCode: string; groupName: string | null;
}

export interface SpareSpend {
  resourceId: number;
  currency: string | null;
  lineCount: number;
  /** Charged to the period — routine spares. */
  expensed: number;
  /** Added to what the machine is worth — major and insurance spares. */
  capitalised: number;
  /** Free-text lines with no catalog item, so no treatment to inherit. */
  unclassified: number;
  total: number;
}

export const fetchMachineAreas = (plantId?: number) =>
  fabGet<{ locations: MachineArea[] }>('assets/machine-locations', plantId ? { plantId } : {});

export const fetchMachineLocation = (resourceId: number) =>
  fabGet<MachineLocation>(`assets/resources/${resourceId}/location`);

export const moveMachine = (resourceId: number, stockLocationId: number, note?: string) =>
  fabPost<{ ok: true; to: MachineArea; offSite: boolean; stillSchedulable: boolean }>(
    `assets/resources/${resourceId}/move`, { stockLocationId, note },
  );

export const fetchSpareParts = (q?: string) =>
  fabGet<{ items: SparePart[] }>('assets/spare-parts', q ? { q } : {});

export const fetchSpareSpend = (resourceId: number) =>
  fabGet<SpareSpend>(`assets/resources/${resourceId}/spend`);
