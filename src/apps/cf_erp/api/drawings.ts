import { cfApi, LONG_WRITE_MS } from './client';

/** Part drawings (DXF) on an order line's Nesting stage — the contract with the server's drawings routes. */
export interface DrawingGeometry {
  lengthMm: number; widthMm: number;
  areaMm2: number;
  rectAreaMm2: number;
  usePct: number;
  cutLengthMm: number;
  piercings: number;
  holes: number; holeDiameters: number[];
  innerCuts: number;
  /** [[ [x,y], ... ], ...] mm, origin at the rectangle's corner; ring 0 is the outline, then cut-outs, then holes. */
  rings: number[][][];
}

export interface DrawingRow {
  id: number; code: string | null; name: string; pieces: number;
  lengthMm: number | null; widthMm: number | null; thicknessMm: number | null;
  sizeMatches: boolean | null;
}

export interface Drawing {
  id: number; mark: string; fileName: string; uploadedAt: string;
  geometry: DrawingGeometry; rows: DrawingRow[]; warnings: string[];
}

export interface DrawingsSummary {
  parts: number; partsWithDrawing: number; pieces: number; piecesWithDrawing: number;
  rectAreaM2: number; trueAreaM2: number; usePct: number | null;
  rectKg: number; trueKg: number; savingKg: number;
}

export interface DrawingsView {
  line: { id: number; lineNo: number; orderId: number; orderCode: string; released: boolean };
  drawings: Drawing[];
  partsWithoutDrawing: { id: number; code: string | null; name: string; mark: string | null; pieces: number }[];
  summary: DrawingsSummary;
}

export interface DrawingsUploadFile {
  name: string; mark: string;
  status: 'new' | 'replaces' | 'unmatched' | 'error';
  rows: DrawingRow[];
  geometry: DrawingGeometry | null;
  problems: string[];
  warnings: string[];
}

export interface DrawingsUpload {
  dryRun: boolean; saved: boolean;
  files: DrawingsUploadFile[];
  view: DrawingsView | null;
}

export interface DrawingFileBody { name: string; content: string }

const base = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}/drawings`;

export const getDrawings = (orderId: number, lineId: number) =>
  cfApi.get<DrawingsView>(base(orderId, lineId));

/** All the files in ONE request (the server takes up to 50 MB). `dryRun` reads and matches; nothing is written. */
export const uploadDrawings = (orderId: number, lineId: number, files: DrawingFileBody[], dryRun: boolean) =>
  cfApi.post<DrawingsUpload>(base(orderId, lineId), { files, dryRun }, { timeoutMs: LONG_WRITE_MS });

export const deleteDrawing = (orderId: number, lineId: number, drawingId: number) =>
  cfApi.del<DrawingsView>(`${base(orderId, lineId)}/${drawingId}`, { timeoutMs: LONG_WRITE_MS });
