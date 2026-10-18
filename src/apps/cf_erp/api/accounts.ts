import { cfApi, qs } from './client';
import type { OrderCosts } from './money';

/**
 * ACCOUNTS (backend init.sql §74, routes/accounts.js; contract TM/CF_ERP_ORDER_FLOW_PLAN.md "2026-10-18 — Step 3B"):
 * the Billing board (one card per payment milestone — per dispatch or per week when pro-rata), raising a GST tax
 * invoice from due cards, receipts, and the cost sheet of each sales order.
 */

export type CardStatus = 'upcoming' | 'due' | 'billed' | 'paid';
export interface CardInvoice {
  id: number; invoiceNo: string; invoiceDate: string | null; dueDate: string | null; creditDays: number | null;
  grandTotal: number; received: number; outstanding: number;
}
export interface BillingCard {
  /** "<orderId>|<milestone key>|<part key>" */
  id: string;
  orderId: number;
  orderCode: string;
  customer: string | null;
  title: string | null;
  milestone: { key: string; label: string; trigger: string; kind: 'percent' | 'amount'; value: number; creditDays: number; proRata: boolean; amount: number };
  /** 'all' | 'rest' (still to come) | 'w<monday>' (a week) | 'mv<id>' (a dispatch) | '<key>+' (a late top-up) */
  partKey: string;
  note: string | null;
  amount: number;
  fraction?: number | null;
  dueOn: string | null;
  daysDue?: number;
  status: CardStatus;
  overdue: boolean;
  daysOverdue: number;
  invoice: CardInvoice | null;
  tax?: number;
}
export interface BillingLane { key: CardStatus; label: string; cards: BillingCard[]; total: number }
export interface BillingOrder {
  id: number; code: string; customer: string | null; title: string | null; status: string;
  value: number; milestonesTotal: number; billed: number; invoiced: number; received: number; outstanding: number; onAccount: number;
  due: number; dueCount: number; upcoming: number; overdue: boolean; fullyBilled: boolean; fullyPaid: boolean;
}
export interface BillingBoard {
  lanes: BillingLane[];
  orders: BillingOrder[];
  today: string;
  counts: { due: number; overdue: number; dueAmount: number };
}

export interface Fix { label: string; to: string }
export interface PlanLine {
  slNo: number; card: string; milestoneKey: string; partKey: string; label: string; note: string | null; description: string;
  hsnCode: string | null; gstRate: number | null; taxable: number; cgst: number | null; sgst: number | null; igst: number | null; total: number | null;
}
export interface InvoicePlan {
  dryRun: true;
  order: { id: number; code: string; customer: string | null };
  invoiceDate: string; creditDays: number; dueDate: string | null;
  cards: { id: string; label: string; note: string | null; amount: number }[];
  buyer: { name: string; gstin: string | null; stateName: string | null; stateCode: string | null } | null;
  placeOfSupply: { code: string; name: string } | null;
  isIgst: boolean | null;
  lines: PlanLine[];
  totals: { taxable: number; cgst: number; sgst: number; igst: number; tax: number; roundOff: number; grandTotal: number; inWords: string };
  problems: { text: string; fix: Fix | null }[];
}
export interface RaisedInvoice { id: number; invoiceNo: string; status: string; dueDate: string | null; creditDays: number | null; totals: { grandTotal: number }; received: number; outstanding: number }

export interface RaiseInput { orderId: number; cards: string[]; invoiceDate?: string; creditDays?: number | null; notes?: string | null }

export const getBillingBoard = (search?: string, orderId?: number) => cfApi.get<BillingBoard>(`/accounts/billing${qs({ search, orderId })}`);
export const previewInvoice = (input: RaiseInput) => cfApi.post<InvoicePlan>('/accounts/invoices', { ...input, dryRun: true });
export const raiseInvoice = (input: RaiseInput) => cfApi.post<RaisedInvoice>('/accounts/invoices', input);
export const invoicePdf = (id: number) => cfApi.getBlob(`/accounts/invoices/${id}/pdf`);

export type ReceiptMode = 'bank' | 'cheque' | 'upi' | 'cash' | 'other';
export const RECEIPT_MODES: Record<ReceiptMode, string> = { bank: 'Bank transfer (NEFT / RTGS)', cheque: 'Cheque', upi: 'UPI', cash: 'Cash', other: 'Other' };
export interface Receipt {
  id: number; code: string; date: string; amount: number; mode: ReceiptMode; modeLabel: string; reference: string | null; notes: string | null;
  order: { id: number; code: string }; customer: string | null; invoice: { id: number; invoiceNo: string } | null;
  allocated: number; onAccount: number; by: string | null; createdAt: string;
}
export interface OrderInvoiceOwed { id: number; invoiceNo: string; invoiceDate: string | null; dueDate: string | null; kind: string; grandTotal: number; received: number; outstanding: number }
export interface OrderPayments {
  order: { id: number; code: string; status: string; customer: string | null };
  invoices: OrderInvoiceOwed[];
  receipts: Receipt[];
  invoiced: number; received: number; onAccount: number; outstanding: number;
  billing: BillingOrder | null;
  fullyPaid: boolean;
}
export interface ReceiptInput { orderId?: number | null; invoiceId?: number | null; receiptDate?: string; amount: number | string; mode?: ReceiptMode; reference?: string | null; notes?: string | null }
export interface ReceiptResult { receipt: Receipt; allocated: number; onAccount: number; message: string; order: OrderPayments; closed: boolean }

export const listReceipts = (q: { orderId?: number; search?: string } = {}) => cfApi.get<{ rows: Receipt[]; modes: Record<ReceiptMode, string> }>(`/accounts/receipts${qs(q)}`);
export const recordReceipt = (input: ReceiptInput) => cfApi.post<ReceiptResult>('/accounts/receipts', input);
export const removeReceipt = (id: number, reason: string) => cfApi.delWith<OrderPayments>(`/accounts/receipts/${id}`, { reason });
export const orderPayments = (orderId: number) => cfApi.get<OrderPayments>(`/accounts/orders/${orderId}/payments`);

/** Something valued at nothing, and where to fix it (2026-10-18: never ₹0 silently). `to` is relative to /:company/cf_erp/. */
export interface CostFlag { code: 'NO_SCRAP_RATE' | 'NOT_COSTED' | string; message: string; fix: { label: string; to: string } | null }
/** SCRAP & OFFCUTS of an order: actual kg and value, against what the acceptance charges for them. */
export interface ScrapOffcuts {
  actual: { scrapKg: number; scrapValue: number; offcutKg: number; offcutValue: number; offcutLots: number };
  ratePerKg: number | null;
  charges: { key: string; label: string; of: 'scrap' | 'offcut' | 'material_pct'; estimate: number | null; unit: string | null; rate: number | null; contract: number; earned: number; actualKg: number | null; onActual: number | null }[];
  charged: { contract: number; earned: number };
  flags: CostFlag[];
}
export interface EarnedRow {
  key: string; label: string; kind: 'charge' | 'material' | 'lump_sum' | 'scrap_charge'; operation?: string | null; billing?: string; scrapOf?: 'scrap' | 'offcut' | 'material_pct';
  quantity: number | null; earnedQuantity: number | null; unit: string | null; rate: number | null; amount: number; contract: number; note: string;
}
export interface CostItem { itemId: number; code: string | null; name: string | null; uom: string | null; kind: 'material' | 'consumable' | 'customer' | 'scrap' | 'offcut'; quantity: number; value: number; uncosted: number }
export interface CostRow {
  order: { id: number; code: string; title: string | null; status: string; customer: string | null };
  contract: number; charged: number; invoiced: number; received: number;
  material: number; consumables: number; contractor: number; credits: number; creditsScrap: number; creditsOffcuts: number;
  customerMaterial: { rows: number; quantity: number }; uncostedRows: number;
  margin: number; marginPct: number | null;
  /** The list only (2026-10-18): actual scrap / offcut kg, what scrap & offcut charges earned, and how many things are not costed. */
  scrapKg?: number; offcutKg?: number; scrapCharged?: number; flags?: number;
}
export interface CostingList {
  rows: CostRow[];
  totals: { contract: number; charged: number; material: number; consumables: number; contractor: number; credits: number; margin: number };
  generalThisMonth: { value: number; uncostedRows: number };
}
export interface CostSheet extends CostRow {
  hasTerms: boolean;
  earned: { rows: EarnedRow[]; total: number; contract: number };
  scrapOffcuts?: ScrapOffcuts;
  items: CostItem[];
  lines: OrderCosts['lines'];
  totals: OrderCosts['totals'];
}
export const getCosting = (search?: string) => cfApi.get<CostingList>(`/accounts/costing${qs({ search })}`);
export const getCostSheet = (orderId: number) => cfApi.get<CostSheet>(`/accounts/costing/${orderId}`);

export const ACCOUNTS_VIEW = 'cf_erp_accounts_view';
export const ACCOUNTS_MANAGE = 'cf_erp_accounts_manage';
