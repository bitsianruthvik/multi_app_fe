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
  get: <T>(path: string) => apiFetch<T>(`${base()}${path}`, { method: 'GET', timeout: 60000 }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(`${base()}${path}`, { method: 'POST', body }),
};

const REFRESH_MS = 5 * 60 * 1000;

/** Loads one report, and again every 5 minutes while the screen is open. Pass null to skip. */
export function useReport<T>(path: string | null, refresh = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!path);
  const live = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
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
    const t = refresh ? window.setInterval(load, REFRESH_MS) : 0;
    return () => { live.current = false; if (t) window.clearInterval(t); };
  }, [load, refresh]);

  return { data, error, loading, reload: load };
}

// ── Shapes ────────────────────────────────────────────────────────────────
export interface Ageing { notDue: number; d0_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }
export interface PartyAgeing extends Ageing { cardCode: string; cardName: string; docs: number; creditLimit?: number; accountBalance?: number }
export interface OpenItem {
  docEntry: number; docNum: number; docDate: string; dueDate: string; cardCode: string; cardName: string; unit: string | null;
  total: number; paid: number; balance: number; daysOverdue: number;
}
export interface DueSoon { count: number; amount: number; docs: OpenItem[] }
export interface PartyBook {
  asOf: string | null; totals: Ageing; parties: PartyAgeing[]; open: OpenItem[]; dueIn7: DueSoon;
  payments: {
    monthly: { month: string; amount: number }[]; fy: number; month: number;
    byParty: { cardCode: string; cardName: string; amount: number; count: number }[];
    recent: { docEntry: number; docNum: number; docDate: string; cardName: string; unit: string | null; amount: number }[];
  };
}

export interface Overview {
  asOf: string | null; today: string; fyStart: string;
  salesToday: number; salesMonth: number; salesPrevMonthSamePeriod: number; salesFy: number; salesPrevFySamePeriod: number; interUnitFy: number;
  collectionsMonth: number; paymentsMonth: number;
  receivables: number; receivablesOverdue: number; payables: number; payablesOverdue: number;
  openSalesOrders: { count: number; value: number; late: number };
  openPurchaseOrders: { count: number; value: number; late: number };
  productionMonthQty: number;
  monthly: { month: string; sales: number; collections: number }[];
  daily: { date: string; sales: number }[];
  byUnit: { unit: string; sales: number }[];
  topCustomers: { cardCode: string; cardName: string; sales: number }[];
  receivablesAgeing: Ageing;
  todayActivity: { ordersCount: number; ordersValue: number; deliveriesCount: number; deliveriesQty: number; grnCount: number; grnValue: number; productionQty: number; productionDocs: number };
  dueIn7Receivable: DueSoon; dueIn7Payable: DueSoon;
}

export interface SalesReport {
  asOf: string | null; from: string; to: string; total: number; tax: number; qty: number; documentCount: number; customerCount: number;
  monthly: { month: string; sales: number }[];
  daily: { date: string; sales: number }[];
  customers: { cardCode: string; cardName: string; sales: number; docs: number }[];
  salesPersons: { code: number; name: string; sales: number; docs: number }[];
  items: { itemCode: string; itemName: string; group: string; uom: string; qty: number; sales: number; lines: number }[];
  itemGroups: { group: string; sales: number; qty: number }[];
  byUnit: { unit: string; sales: number; qty: number }[];
  documents: { kind: string; docEntry: number; docNum: number; docDate: string; unit: string | null; cardCode: string; cardName: string; net: number; tax: number; total: number }[];
  interUnit: number;
}
export interface CustomerSales {
  from: string; to: string; cardCode: string; cardName: string; city: string | null; balance: number; creditLimit: number; total: number;
  items: { itemCode: string; itemName: string; uom: string; qty: number; sales: number }[];
  monthly: { month: string; sales: number }[];
}

export interface OpenDoc {
  docEntry: number; docNum: number; docDate: string; dueDate: string | null; cardCode: string; cardName: string; unit: string | null;
  total: number; net: number; daysOld: number | null; late: boolean; salesPerson?: number; salesPersonName?: string | null;
}
export interface OpenDocs { asOf: string | null; count: number; value: number; late: number; rows: OpenDoc[] }
export interface PendingLine {
  docEntry: number; docNum: number; docDate: string; lineNum: number; unit: string | null; cardCode: string; cardName: string;
  itemCode: string; itemName: string; uom: string; ordered: number; open: number; value: number; shipDate: string | null; late: boolean;
}
export interface SalesOrdersReport extends OpenDocs {
  pendingValue: number; pendingLines: number; lateLines: number; itemsShort: number;
  byItem: { itemCode: string; itemName: string; uom: string; open: number; value: number; lines: number; late: number; stock: number; short: number }[];
  byCustomer: { cardCode: string; cardName: string; lines: number; open: number; value: number; late: number }[];
  pending: PendingLine[];
}

export interface DispatchReport {
  asOf: string | null; from: string; to: string; qty: number; value: number; deliveries: number; customers: number;
  daily: { date: string; qty: number; value: number }[];
  byCustomer: { cardCode: string; cardName: string; qty: number; value: number; lines: number }[];
  byItem: { itemCode: string; itemName: string; group: string; uom: string; qty: number; value: number }[];
  byGroup: { group: string; qty: number; value: number }[];
  documents: { docEntry: number; docNum: number; docDate: string; cardName: string; unit: string | null; qty: number; value: number }[];
}

export interface PurchaseReport {
  asOf: string | null; from: string; to: string; spend: number; invoices: number; vendors: number;
  monthly: { month: string; spend: number }[];
  byVendor: { cardCode: string; cardName: string; spend: number; qty: number; lines: number }[];
  byItem: { itemCode: string; itemName: string; group: string; uom: string; spend: number; qty: number; avgPrice: number | null }[];
  byGroup: { group: string; spend: number; qty: number }[];
  poVsGrn: {
    ordered: number; received: number; pending: number; lateLines: number;
    vendors: { cardCode: string; cardName: string; lines: number; ordered: number; received: number; pending: number; late: number; fill: number | null }[];
    lines: { docEntry: number; docNum: number; docDate: string; lineNum: number; unit: string | null; cardName: string; itemCode: string; itemName: string; uom: string;
      ordered: number; received: number; pending: number; value: number; shipDate: string | null; late: boolean }[];
  };
  grnDaily: { date: string; value: number }[];
  grnByGroup: { group: string; value: number; qty: number }[];
}

export interface ProductionOrderRow {
  id: number; docNum: number; itemCode: string; itemName: string; uom: string; status: string; planned: number; completed: number; rejected: number;
  postingDate: string; dueDate: string | null; machine: string; section: string; unit: string | null; salesOrder: number | null; customer: string | null;
  progress: number; late: boolean;
}
export interface ProductionReport {
  asOf: string | null; from: string; to: string;
  kpis: { openOrders: number; released: number; planned: number; lateOrders: number; output: number; outputValue: number; issued: number; outputToday: number; yield: number | null; closedInRange: number };
  statusCounts: { status: string; count: number }[];
  sections: string[];
  daily: Array<{ date: string } & Record<string, number | string>>;
  bySection: { section: string; openOrders: number; planned: number; completed: number; late: number; progress: number }[];
  machines: { machine: string; section: string; openOrders: number; planned: number; completed: number; late: number; output: number; outputValue: number; yield: number | null }[];
  shifts: { shift: string; output: number; receipts: number }[];
  operators: { operator: string; machine: string; output: number; receipts: number }[];
  consumptionByGroup: { group: string; qty: number; value: number }[];
  consumptionByStage: { stage: string; qty: number; value: number }[];
  yieldOrders: { id: number; docNum: number; itemName: string; machine: string; section: string; status: string; input: number; output: number; loss: number; yield: number }[];
  openOrders: ProductionOrderRow[];
}

export interface InventoryItem {
  itemCode: string; itemName: string; group: string; uom: string; onHand: number; committed: number; onOrder: number; value: number;
  warehouses: number; available: number; short: boolean;
}
export interface InventoryReport {
  asOf: string | null; value: number; qty: number; itemCount: number; shortCount: number;
  byWarehouse: { warehouse: string; name: string; unit: string | null; items: number; onHand: number; value: number }[];
  byGroup: { group: string; lines: number; onHand: number; value: number }[];
  byUnit: { unit: string; value: number; onHand: number }[];
  items: InventoryItem[];
  consumption: { group: string; qty: number; value: number }[];
  transfers: { docEntry: number; docNum: number; docDate: string; dueDate: string | null; from: string; to: string; unit: string | null; late: boolean }[];
}
export interface InventoryItemDetail {
  itemCode: string; itemName: string; group: string; uom: string;
  warehouses: { warehouse: string; name: string; unit: string | null; onHand: number; committed: number; onOrder: number; value: number }[];
}

export interface SavedReport {
  id: string; internalKey: number; categoryCode: number; category: string; name: string; sql: string; standard: boolean; coveredBy: string | null;
}
export interface SavedReports { asOf: string | null; count: number; karni: number; reports: SavedReport[] }

export interface Connector {
  id: number; connectorUid: string; machine: string; winUser: string; status: 'pending' | 'approved' | 'revoked';
  approvedAt: string | null; lastSeenAt: string | null; createdAt: string;
}
export interface DatasetState { dataset: string; sinceDate: string | null; lastOkAt: string | null; lastError: string | null; rowCount: number | null }
export interface SyncRun { id: number; connectorId: number; startedAt: string; finishedAt: string; ok: boolean; summary: Record<string, { rows?: number; error?: string }> }
export interface Status { connectors: Connector[]; datasets: DatasetState[]; runs: SyncRun[] }
