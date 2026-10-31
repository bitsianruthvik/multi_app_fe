import { cfApi, LONG_WRITE_MS } from './client';

/**
 * Timings as Excel (backend routes/timingSheets.js, services/timingSheetService.js, 2026-10-31). Three sheets, each a
 * download and an upload previewed first (dryRun) and applied after — matched by business keys (operation code,
 * machine type / machine code, piece code), never by hidden ids:
 *   standard   every operation's timing rules                           /operation-times/sheet
 *   order      one order's time per operation                           /orders/:id/operation-times/sheet
 *   floor      an order's (or one production order's) floor progress    /orders/:id/floor-sheet
 */
export type TimingSheetSource =
  | { kind: 'standard' }
  | { kind: 'order'; orderId: number; orderCode?: string }
  | { kind: 'floor'; orderId: number; orderCode?: string; productionOrderId?: number | null; productionOrderCode?: string | null };

export interface TimingSheetResult {
  dryRun: boolean;
  applied?: boolean;
  ok: boolean;
  problems: string[];
  changes: Array<{ action: string; path?: string; field?: string; detail?: string; from?: unknown; to?: unknown; stepId?: number }>;
  summary: { sentence: string; warning?: string; [k: string]: unknown };
  /** Floor sheet, applied: each row recorded or refused, with why. */
  done?: Array<{ stepId: number; label: string; good: number; scrap: number; wave: number }>;
  refused?: Array<{ stepId: number; label: string | null; reason: string }>;
}

const pathFor = (s: TimingSheetSource) => (s.kind === 'standard' ? '/operation-times/sheet'
  : s.kind === 'order' ? `/orders/${s.orderId}/operation-times/sheet`
    : `/orders/${s.orderId}/floor-sheet`);

const fileName = (s: TimingSheetSource) => (s.kind === 'standard' ? `Standard_times_${new Date().toISOString().slice(0, 10)}.xlsx`
  : s.kind === 'order' ? `Order_times_${s.orderCode ?? s.orderId}.xlsx`
    : `Floor_progress_${s.productionOrderCode ?? s.orderCode ?? s.orderId}.xlsx`);

export async function downloadTimingSheet(source: TimingSheetSource): Promise<void> {
  const q = source.kind === 'floor' && source.productionOrderId ? `?productionOrderId=${source.productionOrderId}` : '';
  const blob = await cfApi.getBlob(`${pathFor(source)}${q}`, { timeoutMs: LONG_WRITE_MS });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(source).replace(/[^A-Za-z0-9_.-]+/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const body = (source: TimingSheetSource, fileBase64: string, dryRun: boolean) => ({
  fileBase64,
  dryRun,
  ...(source.kind === 'floor'
    // Wall-clock times in the file are read in this browser's zone (minutes east of UTC).
    ? { tz: -new Date().getTimezoneOffset(), ...(source.productionOrderId ? { productionOrderId: source.productionOrderId } : {}) }
    : {}),
});

export const previewTimingSheet = (source: TimingSheetSource, fileBase64: string) =>
  cfApi.post<TimingSheetResult>(pathFor(source), body(source, fileBase64, true), { timeoutMs: LONG_WRITE_MS });

export const applyTimingSheet = (source: TimingSheetSource, fileBase64: string) =>
  cfApi.post<TimingSheetResult>(pathFor(source), body(source, fileBase64, false), { timeoutMs: LONG_WRITE_MS });
