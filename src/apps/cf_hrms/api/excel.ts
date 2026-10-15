import { api } from './client';

/**
 * The Excel routes (CF_HRMS_HIRING_SPEC.md §13.4): one workbook per entity,
 * and an upload in two steps — a preview that changes nothing, then an apply
 * that re-checks everything and refuses if the data moved in between.
 */
export type ExcelEntity =
  | 'departments'
  | 'locations'
  | 'roles'
  | 'positions'
  | 'employees'
  | 'holidays'
  | 'shifts'
  | 'library-kras'
  | 'library-responsibilities'
  | 'library-kpis'
  | 'library-skills'
  | 'library-qualifications'
  | 'library-authorities'
  | 'actuals';

export interface ExcelFile {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface ExcelPreviewRow {
  /** Excel's own row number, as the server sends it. */
  row: number;
  action: 'ADD' | 'CHANGE' | 'SAME' | 'PROBLEM';
  label: string;
  changes: { column: string; from: string | null; to: string | null }[];
  problems: string[];
}

export interface ExcelPreview {
  entity: string;
  fileName: string;
  summary: { add: number; change: number; same: number; problems: number };
  rows: ExcelPreviewRow[];
  fileProblems: string[];
}

export interface ExcelApplyResult {
  added: number;
  changed: number;
  skipped: number;
  issuedCodes: { row: number; code: string }[];
}

export interface ExcelEntityInfo {
  entity: string;
  label: string;
  area: string;
  canDownload: boolean;
  canUpload: boolean;
}

function query(filters?: Record<string, string>, blank?: boolean): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  if (blank) p.set('blank', '1');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const excelApi = {
  /** The workbook holding what the filters show; `blank` gives the same file with no data rows. */
  workbook: (entity: ExcelEntity, filters?: Record<string, string>, blank?: boolean) =>
    api.get<ExcelFile>(`/excel/${entity}/workbook${query(filters, blank)}`),

  /** Reads the file and says what it would do. Changes nothing. */
  preview: (entity: ExcelEntity, file: { fileName: string; contentBase64: string }) =>
    api.post<ExcelPreview>(`/excel/${entity}/preview`, {
      fileName: file.fileName,
      contentBase64: file.contentBase64,
    }),

  /** Applies the file. 409 `PREVIEW_STALE` when the counts no longer match `expect`; 422 `HAS_PROBLEMS`. */
  apply: (
    entity: ExcelEntity,
    body: {
      fileName: string;
      contentBase64: string;
      expect: { add: number; change: number };
      skipProblemRows?: boolean;
    },
  ) => api.post<ExcelApplyResult>(`/excel/${entity}/apply`, body),

  /** Which entities this login may download and upload. */
  entities: () => api.get<ExcelEntityInfo[]>('/excel/entities'),
};

/** Hands a Blob to the browser as a download (a temporary `<a download>`). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // The click only starts the download; give the browser a moment before the URL goes.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Hands a base64 file to the browser as a download (Blob + a temporary <a download>). */
export function saveBase64File(file: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}): void {
  const binary = atob(file.contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  saveBlob(
    new Blob([bytes], { type: file.mimeType || 'application/octet-stream' }),
    file.fileName,
  );
}

/** Reads a picked File as base64 (no data: prefix). */
export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('This file could not be read. Try choosing it again.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
