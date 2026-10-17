import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@core/api/client';

/**
 * karni_dashboard API. Every figure is worked out on the server from the SAP
 * rows the connector pushed; the screens never talk to SAP.
 */
function base(): string {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return `/api/${company}/karni_dashboard`;
}

export const kdApi = {
  get: <T>(path: string) => apiFetch<T>(`${base()}${path}`, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(`${base()}${path}`, { method: 'POST', body }),
};

const REFRESH_MS = 5 * 60 * 1000;

/** Loads one report, and again every 5 minutes while the screen is open. */
export function useReport<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const live = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await kdApi.get<T>(path);
      if (live.current) { setData(d); setError(null); }
    } catch (e) {
      if (live.current) setError(e);
    } finally {
      if (live.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    live.current = true;
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => { live.current = false; window.clearInterval(t); };
  }, [load]);

  return { data, error, loading, reload: load };
}

// ── Shapes ────────────────────────────────────────────────────────────────
export interface Ageing { notDue: number; d0_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }
export interface PartyAgeing extends Ageing { cardCode: string; cardName: string; docs: number; creditLimit?: number; accountBalance?: number }
export interface OpenItem {
  docEntry: number; docNum: number; docDate: string; dueDate: string; cardCode: string; cardName: string;
  total: number; paid: number; balance: number; daysOverdue: number;
}
export interface AgeingReport { asOf: string | null; totals: Partial<Ageing>; parties: PartyAgeing[]; open: OpenItem[] }

export interface Overview {
  asOf: string | null; fyStart: string;
  salesMonth: number; salesFy: number; salesToday: number;
  receivables: number; receivablesOverdue: number; payables: number;
  openSalesOrders: { count: number; value: number; late: number };
  openPurchaseOrders: { count: number; value: number; late: number };
  monthly: { month: string; sales: number }[];
  topCustomers: { cardCode: string; cardName: string; sales: number }[];
  receivablesAgeing: Partial<Ageing>;
}

export interface SalesReport {
  asOf: string | null; from: string; to: string; total: number;
  monthly: { month: string; sales: number }[];
  customers: { cardCode: string; cardName: string; sales: number; docs: number }[];
  salesPersons: { code: number; name: string; sales: number; docs: number }[];
  documents: { kind: string; docEntry: number; docNum: number; docDate: string; cardCode: string; cardName: string; net: number; total: number }[];
  documentCount: number;
}

export interface OpenDoc {
  docEntry: number; docNum: number; docDate: string; dueDate: string | null; cardCode: string; cardName: string;
  total: number; net: number; daysOld: number | null; late: boolean; salesPerson?: number; salesPersonName?: string | null;
}
export interface OpenDocs { asOf: string | null; count: number; value: number; late: number; rows: OpenDoc[] }

export interface InventoryItem {
  itemCode: string; itemName: string; group: string; onHand: number; onOrder: number; committed: number;
  uom: string; available: number; short: boolean;
}
export interface InventoryReport {
  asOf: string | null; itemCount: number; inStock: number; shortCount: number;
  groups: { group: string; items: number; inStock: number; short: number }[];
  items: InventoryItem[];
}

export interface SavedReport { id: string; internalKey: number; categoryCode: number; category: string; name: string; sql: string }
export interface SavedReports { asOf: string | null; count: number; reports: SavedReport[] }

export interface Connector {
  id: number; connectorUid: string; machine: string; winUser: string; status: 'pending' | 'approved' | 'revoked';
  approvedAt: string | null; lastSeenAt: string | null; createdAt: string;
}
export interface DatasetState { dataset: string; sinceDate: string | null; lastOkAt: string | null; lastError: string | null; rowCount: number | null }
export interface SyncRun { id: number; connectorId: number; startedAt: string; finishedAt: string; ok: boolean; summary: Record<string, { rows?: number; error?: string }> }
export interface Status { connectors: Connector[]; datasets: DatasetState[]; runs: SyncRun[] }
