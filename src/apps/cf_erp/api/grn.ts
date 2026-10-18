import { cfApi, qs } from './client';
import type { HeldReceipt } from './procurement';
import type { PurchaseOrder } from './types';

/** init.sql §80 — a GRN that captures the money. The routes are in the backend's routes/grn.js. */
export interface GrnContext {
  purchaseOrder: { id: number; code: string; reverseCharge: boolean; suppliedByCustomer: boolean };
  company: { stateCode: string | null; stateName: string | null; gstin: string | null };
  supplier: { id: number; name: string; stateCode: string | null; registration: string; gstin: string | null } | null;
  gstRates: number[];
  supply: { isIgst: boolean | null; zeroRated: boolean; note: string | null; problem: string | null } | null;
  needsCompanyState: boolean;
  needsSupplierState: boolean;
  lines: { lineId: number; itemId: number; unitPrice: number | null; uom: string; hsnCode: string | null; gstRate: number | null }[];
}

export interface GrnLineBody {
  lineId: number; quantity: string; unitPrice: string; mrp?: string; discountMode?: 'pct' | 'amt'; discountValue?: string;
  hsnCode?: string; gstRate: string; batchId?: number; batch?: { supplierRef: string | null; values: { specificationId: number; value: string }[] };
}
export interface GrnBody {
  stockingAreaId: string; movementDate?: string; reference?: string | null; notes?: string | null;
  invoice: { no?: string; date?: string; pending?: boolean };
  charges?: { freight?: { amount: string; taxable: boolean; gstRate?: string }; other?: { amount: string; taxable: boolean; gstRate?: string } };
  companyStateCode?: string; supplierStateCode?: string;
  lines: GrnLineBody[];
}

export interface GrnBillLine {
  id: number; lineNo: number; purchaseLineId: number | null; movement: { id: number; code: string } | null;
  item: { id: number; code: string | null; name: string; uom: string | null };
  quantity: number; unitPrice: number | null; mrp: number | null;
  discount: { mode: 'pct' | 'amt' | null; value: number | null; amount: number | null };
  gross: number | null; taxable: number | null; hsnCode: string | null; gstRate: number | null;
  cgst: number | null; sgst: number | null; igst: number | null; lineTotal: number | null;
  freightShare: number | null; landedValue: number | null; landedUnitCost: number | null;
}
export interface GrnBill {
  id: number; purchaseOrder: { id: number; code: string }; supplier: { id: number; code: string; name: string } | null; grnDate: string;
  invoice: { no: string | null; date: string | null; pending: boolean };
  moneyCaptured: boolean; flags: ('invoice_pending' | 'no_money')[]; reversed: boolean;
  tax: { companyState: string | null; supplierState: string | null; supplyType: 'intra' | 'inter' | 'none' | null; supplyText: string | null; statePicked: boolean; reverseCharge: boolean };
  charges: { freight: { amount: number; taxable: boolean; gstRate: number | null; tax: number }; other: { amount: number; taxable: boolean; gstRate: number | null; tax: number } };
  totals: { taxable: number; charges: number; cgst: number; sgst: number; igst: number; total: number };
  lineCount: number; notes: string | null;
  lines?: GrnBillLine[];
}
export interface GrnResult { bill: GrnBill; movements: { id: number; code: string }[]; held: HeldReceipt[]; order: PurchaseOrder; warnings: string[] }

export const getGrnContext = (poId: number, lineIds?: number[]) =>
  cfApi.get<GrnContext>(`/purchase-orders/${poId}/grn-context${qs({ lineIds: lineIds?.length ? lineIds.join(',') : undefined })}`);
export const bookGrn = (poId: number, body: GrnBody) => cfApi.post<GrnResult>(`/purchase-orders/${poId}/grn`, body);
export const listGrnBills = (q: { supplierId?: number; purchaseOrderId?: number; flag?: 'invoice_pending' | 'no_money'; from?: string; to?: string; search?: string } = {}) =>
  cfApi.get<{ rows: GrnBill[]; summary: { count: number; total: number; invoicePending: number; noMoney: number } }>(`/grn-bills${qs(q)}`);
export const getGrnBill = (id: number) => cfApi.get<GrnBill>(`/grn-bills/${id}`);
export const completeGrnInvoice = (id: number, body: { no: string; date: string }) => cfApi.put<GrnBill>(`/grn-bills/${id}/invoice`, body);
