import { cfApi, qs } from './client';

/**
 * GST (CF_ERP_GST_PLAN §6). Every amount is INR with 2 dp. Prices everywhere stay
 * net of tax; tax is worked out on top, by the server — the screens only show it.
 */

export interface TaxSettings {
  legalName: string | null;
  tradeName: string | null;
  gstin: string | null;
  stateCode: string | null;
  stateName: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  pincode: string | null;
  lutNumber: string | null;
  invoicePrefix: string | null;
  einvoiceRequired: boolean;
  gstRates: number[];
}

export interface StateRow { code: string; name: string }

export interface GstinCheck { valid: boolean; stateCode: string | null; stateName: string | null; pan: string | null; message: string | null }

export type GstRegistration = 'regular' | 'composition' | 'unregistered' | 'sez' | 'overseas';

export interface PartyAddress {
  id: number;
  label: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  stateCode: string | null;
  gstin: string | null;
  isDefaultShip: boolean;
}

/** What a sales-order line's tax looks like: rate, the split, and why it could not be worked out. */
export interface LineTax {
  taxable: number | null;
  gstRate: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  taxTotal: number | null;
  gross: number | null;
  taxNote: string | null;
}

/** The order's tax on top of `amount`: CGST + SGST inside the state, IGST outside. */
export interface OrderTax {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  gross: number;
  isIgst: boolean;
  placeOfSupply: string | null;
  /** False when some line could not be taxed (no state, no rate…) — then gross is NOT a tax-inclusive total. */
  taxComplete?: boolean;
  taxNote?: string | null;
}

export interface PurchaseTax { gstRate: number | null; cgst: number | null; sgst: number | null; igst: number | null; taxTotal: number | null; gross: number | null }

export interface InvoiceProblem { text: string; fix?: { label: string; to: string } | null }

export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type TransportMode = 'road' | 'rail' | 'air' | 'ship';

export interface Transport {
  mode: TransportMode | null;
  vehicleNo: string | null;
  transporter: string | null;
  transporterGstin: string | null;
  distanceKm: number | null;
  lrNo: string | null;
  lrDate: string | null;
}

export interface InvoiceSummary {
  id: number;
  invoiceNo: string | null;
  status: InvoiceStatus;
  invoiceDate: string | null;
  order: { id: number; code: string };
  customer: { id: number; name: string | null };
  taxable: number;
  tax: number;
  grandTotal: number;
  irn: boolean;
  ewayBills: number;
}

export interface InvoiceLine {
  id: number;
  orderLineId: number;
  lineNo: number;
  movementId: number | null;
  movementCode: string | null;
  description: string;
  hsnCode: string | null;
  isService: boolean;
  quantity: number;
  uom: string | null;
  billedQty: number | null;
  billedUom: string | null;
  rate: number | null;
  rateBasis: string | null;
  taxable: number | null;
  gstRate: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;
}

export interface InvoiceParty { name?: string | null; gstin?: string | null; stateCode?: string | null; stateName?: string | null; address?: string | null; city?: string | null; pincode?: string | null }

export interface Invoice extends Omit<InvoiceSummary, 'irn' | 'ewayBills'> {
  fy: string | null;
  supplier: InvoiceParty | null;
  buyer: InvoiceParty | null;
  shipTo: (InvoiceParty & { addressId?: number | null }) | null;
  placeOfSupply: { code: string; name: string } | null;
  isIgst: boolean;
  lines: InvoiceLine[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; roundOff: number; grandTotal: number; inWords: string | null };
  transport: Transport | null;
  /** The IRN text once entered (the list carries only a yes/no). */
  irn: string | boolean | null;
  ackNo: string | null;
  ackDate: string | null;
  signedQr: string | null;
  ewayBills: { id: number; ewayNo: string; vehicleNo: string | null; validUntil: string | null }[];
  notes: string | null;
  cancelledReason?: string | null;
  /** Why it cannot be issued yet, each with an optional fix to jump to. A plain string is also accepted. */
  problems: (string | InvoiceProblem | { label?: string; text?: string; fix?: { label: string; to: string }; to?: string })[];
}

export interface Uninvoiced { movementId: number; movementCode: string; date: string; lineNo: number; quantity: number }
export interface OrderInvoices { rows: InvoiceSummary[]; uninvoiced: Uninvoiced[] }

export const getTaxSettings = () => cfApi.get<TaxSettings>('/settings/tax');
export const saveTaxSettings = (body: Partial<TaxSettings>) => cfApi.put<TaxSettings>('/settings/tax', body);
let statesCache: Promise<StateRow[]> | null = null;
/** The state list never changes within a session — asked once. */
export const getStates = () => {
  if (!statesCache) statesCache = cfApi.get<StateRow[]>('/tax/states').catch((e) => { statesCache = null; throw e; });
  return statesCache;
};
export const checkGstin = (gstin: string) => cfApi.get<GstinCheck>(`/tax/validate-gstin${qs({ gstin })}`);

export const listAddresses = (partyId: number) => cfApi.get<PartyAddress[]>(`/parties/${partyId}/addresses`);
export const addAddress = (partyId: number, body: Partial<PartyAddress>) => cfApi.post<PartyAddress>(`/parties/${partyId}/addresses`, body);
export const saveAddress = (partyId: number, id: number, body: Partial<PartyAddress>) => cfApi.put<PartyAddress>(`/parties/${partyId}/addresses/${id}`, body);
export const removeAddress = (partyId: number, id: number) => cfApi.del<unknown>(`/parties/${partyId}/addresses/${id}`);

export const listInvoices = (q: { status?: string; orderId?: number; customerId?: number; q?: string }) => cfApi.get<{ rows: InvoiceSummary[] }>(`/invoices${qs(q)}`);
export const getInvoice = (id: number) => cfApi.get<Invoice>(`/invoices/${id}`);
export const orderInvoices = (orderId: number) => cfApi.get<OrderInvoices>(`/orders/${orderId}/invoices`);
export const makeInvoice = (orderId: number, movementIds?: number[]) => cfApi.post<Invoice>(`/orders/${orderId}/invoices`, movementIds?.length ? { movementIds } : {});
export const saveInvoice = (id: number, body: Record<string, unknown>) => cfApi.put<Invoice>(`/invoices/${id}`, body);
export const removeInvoiceLine = (id: number, lineId: number) => cfApi.del<Invoice>(`/invoices/${id}/lines/${lineId}`);
export const deleteInvoice = (id: number) => cfApi.del<unknown>(`/invoices/${id}`);
export const issueInvoice = (id: number) => cfApi.post<Invoice>(`/invoices/${id}/issue`);
export const cancelInvoice = (id: number, reason: string) => cfApi.post<Invoice>(`/invoices/${id}/cancel`, { reason });
export const saveIrn = (id: number, body: { irn: string; ackNo: string; ackDate: string; signedQr: string }) => cfApi.put<Invoice>(`/invoices/${id}/irn`, body);
export const addEwayBill = (id: number, body: { ewayNo: string; vehicleNo: string | null; validUntil: string | null }) => cfApi.post<Invoice>(`/invoices/${id}/eway-bills`, body);
export const removeEwayBill = (id: number, ewbId: number) => cfApi.del<Invoice>(`/invoices/${id}/eway-bills/${ewbId}`);
/** The printable page as HTML text, fetched with the auth header. */
export const printInvoiceBlob = (id: number, copy: string) => cfApi.getBlob(`/invoices/${id}/print${qs({ copy })}`);
export const einvoiceFile = (id: number) => cfApi.getBlob(`/invoices/${id}/einvoice.json`);
export const ewayBillFile = (id: number) => cfApi.getBlob(`/invoices/${id}/ewaybill.json`);
