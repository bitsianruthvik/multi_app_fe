import { cfApi, LONG_WRITE_MS, qs } from './client';
import type { SalesOrder } from './types';

/**
 * STANDARD DRAWINGS (backend routes/standards.js, init.sql §69). A standard is a number + name + its sheet in the
 * drawings register, and VERSIONS — each a BOM tree with values and part files. A line can be made from one, and a
 * line's BOM can be saved onto one (the next version). A version never changes; lines made earlier keep their copy.
 */
export interface StandardVersion {
  id: number;
  versionNo: number;
  rows: number;
  parts: number;
  weightKg: number | null;
  madeFrom: 'import' | 'line' | string;
  fromLineId: number | null;
  note: string | null;
  createdAt: string;
}

export interface StandardSummary {
  id: number;
  number: string;
  name: string;
  description: string | null;
  revision: string | null;
  sourceUrl: string | null;
  /** Keep inside the company (e.g. RDSO property). */
  internal: boolean;
  notes: string | null;
  drawingId: number | null;
  currentVersionId: number | null;
  createdAt: string;
  version?: Pick<StandardVersion, 'versionNo' | 'rows' | 'parts' | 'weightKg' | 'madeFrom' | 'createdAt'> | null;
  versions?: number;
  files?: number;
  lines?: number;
}

export interface StandardTreeRow {
  key: string;
  rowId: number | null;
  parentKey: string | null;
  depth: number;
  lineNo: number | null;
  role: string | null;
  name: string;
  /** row = a row of the standard; catalog = a catalog item as it is; choose = a selection still to be chosen. */
  kind: 'row' | 'catalog' | 'choose';
  definition: { id: number; code: string | null; name: string } | null;
  quantity: number;
  /** Pieces per one of the standard. */
  total: number;
  mark: string | null;
  notes: string | null;
  sizeText: string | null;
  grade: string | null;
  weightKg: number | null;
  values: { code: string; name: string | null; text: string | null; source: string }[];
  fileId: number | null;
}

export interface StandardFile {
  id: number;
  kind: 'part' | 'source';
  mark: string | null;
  fileName: string;
  fileKind: 'dxf' | 'pdf';
  lengthMm: number | null;
  widthMm: number | null;
  areaMm2: number | null;
  holes: number | null;
  drawingId: number | null;
}

export interface StandardDetail extends Omit<StandardSummary, 'versions' | 'version' | 'files' | 'lines'> {
  drawing: { id: number; code: string | null; number: string; revision: string; title: string | null; url: string | null; status: string } | null;
  versions: StandardVersion[];
  version: StandardVersion | null;
  tree: StandardTreeRow[];
  files: StandardFile[];
  lines: { id: number; lineNo: number; orderId: number; orderCode: string; orderStatus: string; versionNo: number | null }[];
}

export interface LineStandardState {
  line: { id: number; lineNo: number; orderId: number; orderCode: string; hasBom: boolean; locked: boolean };
  standard: StandardSummary | null;
  version: StandardVersion | null;
  latest: StandardVersion | null;
  newer?: boolean;
  edited: boolean;
  kept: boolean;
  /** save = tied to a standard with no BOM from it yet; update = its BOM differs from the version it came from. */
  offer: 'save' | 'update' | null;
  canCreate: boolean;
  saved?: { versionId: number; versionNo: number; rows: number; parts: number; weightKg: number | null };
}

export interface NewStandardBody {
  number: string;
  name?: string;
  revision?: string;
  description?: string;
  sourceUrl?: string;
  internal?: boolean;
  notes?: string;
  file?: { name: string; content: string } | null;
}

export interface FromStandardBody {
  standardId?: number;
  number?: string;
  versionId?: number;
  quantity: string | number;
  committedDate?: string | null;
  description?: string | null;
  rate?: string;
  rateBasis?: string;
}

export type OrderFromStandard = SalesOrder & {
  fromStandard: { lineId: number; standardId: number; number: string; versionNo: number; rows: number; cutPieces: { made: boolean; reason: string | null; message: string | null } } | null;
};

export const listStandards = (search = '') => cfApi.get<{ rows: StandardSummary[] }>(`/standard-drawings${qs({ search })}`);
export const getStandard = (id: number, versionId?: number | null) => cfApi.get<StandardDetail>(`/standard-drawings/${id}${qs({ versionId: versionId ?? undefined })}`);
export const createStandard = (body: NewStandardBody) => cfApi.post<StandardDetail>('/standard-drawings', body, { timeoutMs: LONG_WRITE_MS });
export const updateStandard = (id: number, body: Partial<NewStandardBody>) => cfApi.put<StandardDetail>(`/standard-drawings/${id}`, body);
export const standardFileBlob = (fileId: number) => cfApi.getBlob(`/standard-drawings/files/${fileId}`, { timeoutMs: LONG_WRITE_MS });

/** A new line made from a standard: its BOM, values and part drawings copied — long on production, so wait for it. */
export const addLineFromStandard = (orderId: number, body: FromStandardBody) =>
  cfApi.post<OrderFromStandard>(`/orders/${orderId}/lines/from-standard`, body, { timeoutMs: LONG_WRITE_MS });
export const getLineStandard = (lineId: number) => cfApi.get<LineStandardState>(`/order-lines/${lineId}/standard`);
/** A new standard tied to this line; its file also goes on the line's top row. */
export const markLineStandard = (lineId: number, body: NewStandardBody) =>
  cfApi.post<StandardDetail>(`/order-lines/${lineId}/standard`, body, { timeoutMs: LONG_WRITE_MS });
export const saveLineToStandard = (lineId: number, note?: string) =>
  cfApi.post<LineStandardState>(`/order-lines/${lineId}/standard/save`, note ? { note } : {}, { timeoutMs: LONG_WRITE_MS });
export const keepStandard = (lineId: number) => cfApi.post<LineStandardState>(`/order-lines/${lineId}/standard/keep`, {});

/** "RDSO/B-11751R3 · v2" */
export const standardLabel = (s: { number: string; versionNo?: number | null }) => (s.versionNo ? `${s.number} · v${s.versionNo}` : s.number);

/** What the standard-line dialog says, from the state: one plain sentence. */
export function lineStandardSentence(st: LineStandardState): string {
  if (!st.standard) return st.canCreate ? 'This line is not tied to a standard drawing.' : 'This line has no BOM of its own.';
  const v = st.version ? `version ${st.version.versionNo}` : null;
  if (st.offer === 'save') return `Tied to ${st.standard.number}. Its BOM is not on the standard yet.`;
  if (st.offer === 'update') return `Made from ${st.standard.number} ${v}. Its BOM has changed since.`;
  if (st.kept) return `Made from ${st.standard.number} ${v}. Its BOM differs; the standard was kept as it is.`;
  if (st.newer && st.latest) return `Made from ${st.standard.number} ${v}. A newer version ${st.latest.versionNo} exists; this line keeps its own copy.`;
  return `Made from ${st.standard.number} ${v ?? ''}. Its BOM is the standard's.`.replace(' .', '.');
}
