import { cfApi, LONG_WRITE_MS } from './client';

export type BomSheetSource =
  | { kind: 'record'; recordId: number }
  | { kind: 'orderLine'; lineId: number };

export interface BomSheetSummary {
  sentence: string;
  rowsInSheet: number;
  rowsMatched: number;
  quantityChanged: number;
  roleChanged: number;
  notesChanged: number;
  valuesChanged: number;
  rowsAdded: number;
  rowsRemoved: number;
  rowsRemovedBeneath: number;
  unchanged: number;
}

export interface BomSheetResult {
  dryRun: boolean;
  applied?: boolean;
  ok: boolean;
  summary: BomSheetSummary;
  changes: Array<{ action: string; field?: string; path?: string; detail?: string; from?: unknown; to?: unknown }>;
  problems: string[];
}

const pathFor = (source: BomSheetSource) => source.kind === 'record'
  ? `/records/${source.recordId}/bom/sheet`
  : `/order-lines/${source.lineId}/sheet`;

export async function downloadBomSheet(source: BomSheetSource): Promise<void> {
  const blob = await cfApi.getBlob(pathFor(source), { timeoutMs: LONG_WRITE_MS });
  const name = source.kind === 'record' ? `BOM_record_${source.recordId}.xlsx` : `BOM_order_line_${source.lineId}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      resolve(value.replace(/^data:[^,]*,/, ''));
    };
    reader.readAsDataURL(file);
  });
}

export function previewBomSheet(source: BomSheetSource, fileBase64: string): Promise<BomSheetResult> {
  return cfApi.post<BomSheetResult>(pathFor(source), { fileBase64, dryRun: true }, { timeoutMs: LONG_WRITE_MS });
}

export function applyBomSheet(source: BomSheetSource, fileBase64: string): Promise<BomSheetResult> {
  return cfApi.post<BomSheetResult>(pathFor(source), { fileBase64 }, { timeoutMs: LONG_WRITE_MS });
}
