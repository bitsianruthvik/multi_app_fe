import { cfApi, LONG_WRITE_MS } from './client';

/**
 * CUTTING ALLOWANCE by BOM part name (init.sql §64, 2026-10-16; TM/CF_ERP_NESTING_V2.md "Cutting allowance").
 * A rule adds mm at each end of a part's length (× 2) plus mm for every metre of it. It changes only the cut
 * pieces; the rows keep their drawn length, so the order weight stays as drawn. Three levels, the most specific
 * wins: the customer's default per part name, the order's override per part name, one row's own.
 * Every write works the cut pieces of the open lines out again and answers `refreshed` / `frozen` / `message`.
 */

export type AllowanceScope = 'customer' | 'order' | 'row';

export interface AllowanceRule {
  id: number;
  scope: AllowanceScope;
  perEndMm: number;
  perMetreMm: number;
  /** "7.5 mm at each end", "5 mm at each end + 1 mm a metre", "none". */
  words: string;
}

export interface AllowanceExample { drawnLength: number; cutLength: number; extraMm: number; words: string }

export interface DefinitionRef { id: number; code: string | null; name: string | null }

export interface AllowanceFollowUp {
  refreshed?: { lineId: number; lineNo: number; orderId: number; orderCode: string; made: boolean; reason: string; message: string | null }[];
  frozen?: { lineId: number; lineNo: number; orderId: number; orderCode: string; reason: string; message: string }[];
  message?: string | null;
}

export interface PartName { id: number; code: string | null; name: string | null; shortName: string | null }

export interface CustomerAllowances extends AllowanceFollowUp {
  customer: { id: number; code: string; name: string };
  rules: (AllowanceRule & { definitionId: number; definition: DefinitionRef; example: AllowanceExample | null })[];
  note: string;
}

export interface OrderPartName {
  definitionId: number;
  definition: DefinitionRef;
  rows: number;
  lengths: { min: number; max: number } | null;
  customer: AllowanceRule | null;
  order: AllowanceRule | null;
  effective: AllowanceRule | null;
  /** On the longest row of that part name. */
  example: AllowanceExample | null;
  rowOverrides: number;
}

export interface AllowanceRow {
  partId: number; code: string | null; name: string | null; lineId: number; lineNo: number | null;
  definition: DefinitionRef | null; drawnLength: number | null;
}

export interface OrderAllowances extends AllowanceFollowUp {
  order: {
    id: number; code: string; revision: number; status: string;
    customer: { id: number; code: string | null; name: string | null } | null;
    editable: boolean; reason: string | null;
  };
  partNames: OrderPartName[];
  rows: (AllowanceRow & { rule: AllowanceRule; example: AllowanceExample | null })[];
  /** Plate parts with no part name (added by hand): only a row rule reaches them. */
  noPartName: number;
  lines: { lineId: number; lineNo: number; frozen: boolean; reason: string | null; message: string | null }[];
  note: string;
}

export interface RowAllowance extends AllowanceFollowUp {
  row: AllowanceRow;
  customer: AllowanceRule | null;
  order: AllowanceRule | null;
  own: AllowanceRule | null;
  effective: AllowanceRule | null;
  example: AllowanceExample | null;
  editable: boolean;
  reason: string | null;
  /** The row's line is locked (or released, or its order closed): its cut pieces stay as they are. */
  lineFrozen: { reason: string; message: string } | null;
  note: string;
}

/** What a cut piece carries (cutPlateService.describe → `allowance`), null when cut as drawn. */
export interface CutPieceAllowance {
  extraMm: number | null; minMm: number; maxMm: number;
  drawnLength: number | null; cutLength: number;
  rule: { scope: AllowanceScope; perEndMm: number; perMetreMm: number; words: string } | null;
  /** "+15 mm allowance". */
  words: string;
}

export interface RuleInput { perEndMm: number; perMetreMm: number }

const W = { timeoutMs: LONG_WRITE_MS };

export const getPartNames = (search = '') => cfApi.get<{ partNames: PartName[] }>(`/cut-allowances/part-names${search ? `?search=${encodeURIComponent(search)}` : ''}`);

export const getCustomerAllowances = (customerId: number) => cfApi.get<CustomerAllowances>(`/customers/${customerId}/cut-allowances`);
export const setCustomerAllowance = (customerId: number, definitionId: number, rule: RuleInput) =>
  cfApi.put<CustomerAllowances>(`/customers/${customerId}/cut-allowances/${definitionId}`, rule, W);
export const clearCustomerAllowance = (customerId: number, definitionId: number) =>
  cfApi.del<CustomerAllowances>(`/customers/${customerId}/cut-allowances/${definitionId}`, W);

export const getOrderAllowances = (orderId: number) => cfApi.get<OrderAllowances>(`/orders/${orderId}/cut-allowances`);
export const setOrderAllowance = (orderId: number, definitionId: number, rule: RuleInput) =>
  cfApi.put<OrderAllowances>(`/orders/${orderId}/cut-allowances/${definitionId}`, rule, W);
export const clearOrderAllowance = (orderId: number, definitionId: number) =>
  cfApi.del<OrderAllowances>(`/orders/${orderId}/cut-allowances/${definitionId}`, W);

const rowPath = (orderId: number, lineId: number, rowId: number) => `/orders/${orderId}/lines/${lineId}/rows/${rowId}/cut-allowance`;
export const getRowAllowance = (orderId: number, lineId: number, rowId: number) => cfApi.get<RowAllowance>(rowPath(orderId, lineId, rowId));
export const setRowAllowance = (orderId: number, lineId: number, rowId: number, rule: RuleInput) => cfApi.put<RowAllowance>(rowPath(orderId, lineId, rowId), rule, W);
export const clearRowAllowance = (orderId: number, lineId: number, rowId: number) => cfApi.del<RowAllowance>(rowPath(orderId, lineId, rowId), W);
