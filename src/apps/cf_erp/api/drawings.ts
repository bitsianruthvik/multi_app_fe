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

/** A sheet of the drawings register: number + revision + status. */
export interface RegisterRef {
  id: number; code: string | null; number: string; revision: string;
  status: 'draft' | 'issued' | 'superseded' | 'withdrawn'; title: string | null;
  /** earlier revisions of the same drawing, oldest first */
  earlier: { id: number; revision: string; status: string; hasFile: boolean; fileName: string | null }[];
}

export interface Drawing {
  id: number; mark: string; fileName: string; fileKind: 'dxf' | 'pdf'; uploadedAt: string;
  /** the register drawing this file sits on */
  drawing: RegisterRef | null;
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
  /** register drawings started from rows that have no file yet */
  waiting: number;
}

export interface DrawingsView {
  line: { id: number; lineNo: number; orderId: number; orderCode: string; released: boolean };
  drawings: Drawing[];
  rowsWithoutDrawing: { id: number; code: string | null; name: string; level: string; mark: string | null; pieces: number; isPlatePart: boolean }[];
  /** register drawings linked to rows of this line that have no file yet */
  waiting: { drawing: RegisterRef; rows: DrawingRow[] }[];
  summary: DrawingsSummary;
}

export type RegisterAction = 'create' | 'attach' | 'revise' | 'replace';
export interface UploadRegister {
  action: RegisterAction; drawingId: number | null; code: string | null; number: string; revision: string; fromRevision: string | null;
}

export interface DrawingsUploadFile {
  name: string; mark: string;
  fileKind: 'dxf' | 'pdf' | null;
  status: 'new' | 'replaces' | 'unmatched' | 'error';
  rows: DrawingRow[];
  geometry: DrawingGeometry | null;
  problems: string[];
  warnings: string[];
  /** said, not wrong: e.g. the file name differs from the row's drawing mark */
  notes?: string[];
  /** the row the file was aimed at, when it was */
  targetRowId?: number | null;
  /** the row had no drawing mark and takes the file name as it */
  markSet?: boolean;
  register: UploadRegister | null;
}

export interface DrawingsUpload {
  dryRun: boolean; saved: boolean;
  files: DrawingsUploadFile[];
  view: DrawingsView | null;
}

/** `drawingId` puts the file on that register drawing by hand — the file name then does not matter. */
/** `rowId` aims the file at that row: no drawing mark is needed (a markless row takes the file name as its mark). */
export interface DrawingFileBody { name: string; content: string; drawingId?: number; rowId?: number }

export interface StartDrawingBody {
  rowIds: number[]; number: string; revision?: string; title?: string;
  source?: 'shop' | 'customer'; status?: 'draft' | 'issued'; notes?: string;
}
export interface StartDrawingResult {
  drawing: { id: number; code: string | null; number: string; revision: string; status: string };
  view: DrawingsView;
}

const base = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}/drawings`;

export const getDrawings = (orderId: number, lineId: number) =>
  cfApi.get<DrawingsView>(base(orderId, lineId));

/** All the files in ONE request (the server takes up to 50 MB). `dryRun` reads and matches; nothing is written. */
export const uploadDrawings = (orderId: number, lineId: number, files: DrawingFileBody[], dryRun: boolean) =>
  cfApi.post<DrawingsUpload>(base(orderId, lineId), { files, dryRun }, { timeoutMs: LONG_WRITE_MS });

export const deleteDrawing = (orderId: number, lineId: number, drawingId: number) =>
  cfApi.del<DrawingsView>(`${base(orderId, lineId)}/${drawingId}`, { timeoutMs: LONG_WRITE_MS });

/** Start a register drawing from rows before any file exists; it then waits for a file. */
export const startDrawing = (orderId: number, lineId: number, body: StartDrawingBody) =>
  cfApi.post<StartDrawingResult>(`${base(orderId, lineId)}/start`, body);

async function saveBlob(path: string, fileName: string): Promise<void> {
  const blob = await cfApi.getBlob(path, { timeoutMs: LONG_WRITE_MS });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The saved file itself, handed to the browser as a download. */
export const downloadDrawing = (orderId: number, lineId: number, d: { id: number; fileName: string }): Promise<void> =>
  saveBlob(`${base(orderId, lineId)}/${d.id}/file`, d.fileName);

/** The file of one register revision (works for earlier, superseded revisions too). */
export const downloadRegisterFile = (drawingId: number, fileName: string): Promise<void> =>
  saveBlob(`/drawings/${drawingId}/file`, fileName);
