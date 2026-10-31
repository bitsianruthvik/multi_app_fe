import { cfApi, LONG_WRITE_MS } from './client';

/**
 * The buying chain as Excel (BE routes/buyingSheets.js): a material request's lines, a purchase request's quote grid,
 * a purchase order. GET …/sheet downloads the .xlsx; POST …/sheet { fileBase64, dryRun } answers a preview and only a
 * non-dry run writes. Rows are matched by item code, vendor columns by supplier code — any sheet with the same items reads back.
 */
export type BuyingSheetKind = 'mr' | 'pr' | 'po';

export interface BuyingSheetResult {
  dryRun: boolean;
  applied?: boolean;
  ok: boolean;
  problems: string[];
  changes: Array<{ action: string; field?: string; path?: string; detail?: string; from?: unknown; to?: unknown }>;
  summary: { sentence: string; rowsInSheet: number; rowsMatched: number; unchanged: number };
  record: { kind: string; id: number; code: string };
  /** Long or wide (purchase request quotes only). */
  format?: 'wide' | 'long';
}

const BASE: Record<BuyingSheetKind, string> = { mr: 'material-requests', pr: 'purchase-requests', po: 'purchase-orders' };
export const buyingSheetPath = (kind: BuyingSheetKind, id: number) => `/${BASE[kind]}/${id}/sheet`;

export async function downloadBuyingSheet(kind: BuyingSheetKind, id: number, fileName: string): Promise<void> {
  const blob = await cfApi.getBlob(buyingSheetPath(kind, id), { timeoutMs: LONG_WRITE_MS });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function uploadBuyingSheet(kind: BuyingSheetKind, id: number, fileBase64: string, dryRun: boolean): Promise<BuyingSheetResult> {
  return cfApi.post<BuyingSheetResult>(buyingSheetPath(kind, id), { fileBase64, dryRun }, { timeoutMs: LONG_WRITE_MS });
}
