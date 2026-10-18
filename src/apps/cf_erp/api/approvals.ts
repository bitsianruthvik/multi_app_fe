import { cfApi, qs } from './client';
import type { Estimate, Terms } from './acceptance';

/**
 * The MANAGEMENT approvals inbox (backend init.sql §73, routes/approvals.js, services/approvalService.js). Every type
 * has its own permission tag; the inbox shows a person only the types they hold. Requester ≠ approver (an admin may
 * decide their own). A rejection needs a reason.
 */

export type ApprovalType = 'order_acceptance' | 'rate_change' | 'purchase_order' | 'contractor_po' | 'po_close_short' | 'rebaseline';

/** Each approval type and its permission tag — the same table as the backend's APPROVAL_TYPES. */
export const APPROVAL_TAGS: Record<ApprovalType, string> = {
  order_acceptance: 'cf_erp_approve_order_acceptance',
  rate_change: 'cf_erp_approve_rate_change',
  purchase_order: 'cf_erp_approve_purchase_order',
  contractor_po: 'cf_erp_approve_contractor_po',
  po_close_short: 'cf_erp_approve_po_close_short',
  rebaseline: 'cf_erp_approve_rebaseline',
};
/** Any one of them opens the Management tab (navMeta). */
export const ANY_APPROVAL = Object.values(APPROVAL_TAGS).join('|');

export interface PoContextLine {
  id: number;
  lineNo: number;
  item: { id: number; code: string | null; name: string | null; uom: string | null };
  quantity: number;
  received: number;
  pending: number;
  rate: number | null;
  amount: number | null;
  expectedDate: string | null;
  quotes: { supplier: { id: number; name: string }; rate: number; deliveryDays: number | null; remark: string | null; thisVendor: boolean; pr: string }[];
  lowestQuote: number | null;
  comparison: string;
}
export interface PoContext {
  kind: 'purchase_order';
  purchaseOrder: { id: number; code: string; status: string; type: 'material' | 'contractor'; expectedDate: string | null; forOrder: { id: number; code: string } | null };
  vendor: { id: number; name: string } | null;
  lines: PoContextLine[];
  amount: number;
  pendingAmount: number;
  reason: string | null;
}
export interface AcceptanceContext {
  kind: 'order_acceptance';
  version: number;
  versionKind: 'acceptance' | 'rate_change';
  order: { id: number; code: string; customer: string | null; committedDate: string | null; status: string };
  terms: Omit<Terms, 'charges'> & { charges: (Terms['charges'][number] & { operation: string | null })[] };
  estimate: Estimate | null;
  approvedBefore: { version: number; estimate: Estimate | null } | null;
  changes: string[];
  note: string | null;
}

export interface Approval {
  id: number;
  type: ApprovalType;
  typeLabel: string;
  permission: string | null;
  subject: { type: string; id: number; code: string | null };
  order: { id: number; code: string | null; customer: string | null } | null;
  title: string;
  summary: string | null;
  amount: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  requestedBy: { id: number; name: string | null } | null;
  requestedAt: string;
  requestNote: string | null;
  decidedBy: { id: number; name: string | null } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  context: PoContext | AcceptanceContext | null;
}

export interface ApprovalList { rows: Approval[]; counts: Partial<Record<ApprovalType, number>>; types: { key: ApprovalType; label: string }[] }

export const listApprovals = (q: { status?: 'pending' | 'decided' | 'all'; type?: ApprovalType | ''; orderId?: number } = {}) => cfApi.get<ApprovalList>(`/approvals${qs(q)}`);
export const getApproval = (id: number) => cfApi.get<Approval>(`/approvals/${id}`);
export const decideApproval = (id: number, decision: 'approve' | 'reject', note?: string) => cfApi.post<{ approval: Approval; result: unknown }>(`/approvals/${id}/decide`, { decision, ...(note ? { note } : {}) });
export const withdrawApproval = (id: number) => cfApi.post<Approval>(`/approvals/${id}/withdraw`, {});
