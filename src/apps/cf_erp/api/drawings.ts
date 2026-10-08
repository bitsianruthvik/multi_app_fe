import { cfApi, LONG_WRITE_MS } from './client';

/** Drawings (DXF or PDF) for any row of an order line, on its Structure tab — the contract with the server's drawings routes. */
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
  id: number; code: string | null; name: string;
  /** e.g. "Girder segment", "Plate part" */
  level: string;
  isPlatePart: boolean;
  pieces: number;
  lengthMm: number | null; widthMm: number | null; thicknessMm: number | null;
  /** only for plate parts with a shape */
  sizeMatches: boolean | null;
}

export interface Drawing {
  id: number; mark: string; fileName: string; fileKind: 'dxf' | 'pdf'; uploadedAt: string;
  levels: string[];
  /** only a plate part's DXF is read as a shape */
  geometry: DrawingGeometry | null;
  rows: DrawingRow[]; warnings: string[];
}

export interface DrawingsSummary {
  rows: number; rowsWithDrawing: number;
  parts: number; partsWithShape: number;
  pieces: number; piecesWithShape: number;
  rectAreaM2: number; trueAreaM2: number; usePct: number | null;
  rectKg: number; trueKg: number; savingKg: number;
}

export interface DrawingsView {
  line: { id: number; lineNo: number; orderId: number; orderCode: string; released: boolean };
  drawings: Drawing[];
  rowsWithoutDrawing: { id: number; code: string | null; name: string; level: string; mark: string | null; pieces: number; isPlatePart: boolean }[];
  summary: DrawingsSummary;
}

export interface DrawingsUploadFile {
  name: string; mark: string;
  fileKind: 'dxf' | 'pdf' | null;
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

/** The saved file itself, handed to the browser as a download. */
export async function downloadDrawing(orderId: number, lineId: number, d: { id: number; fileName: string }): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/${d.id}/file`, { timeoutMs: LONG_WRITE_MS });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = d.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
