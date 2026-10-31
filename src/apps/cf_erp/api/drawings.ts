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
  /** where the sheet lives when no file is kept here (an RDSO series PDF, opened at its page) */
  url?: string | null;
  /** a file of this revision is kept somewhere (an order line, a standard drawing): GET /drawings/:id/file opens it */
  hasFile?: boolean; fileName?: string | null; fileKind?: 'dxf' | 'pdf' | null;
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

/** How a file found its rows: the row it was aimed at, the register drawing it was put on, a code in its name (`L(1,5)-1-TFL1`), or its drawing mark. */
export type MatchedBy = 'row' | 'register' | 'code' | 'mark' | 'none';

/** A number or a list — the server may say "3" or give the rows themselves. */
export type CountOrList = number | unknown[];

/** One value read from a file (or its name) and written to the rows it goes to. */
export interface DrawingValue {
  specCode: string;
  value: string | number | null;
  /** 'drawing' (its shape), 'name' (the file name), 'text' (a note in the drawing). */
  from: string;
  /** The rows it was written to (their ids, or a count). */
  rows: CountOrList;
  /** The rows that keep a value of their own (ids or a count). A plain `true` = all of them. */
  kept?: CountOrList | boolean;
}

export interface DrawingsUploadFile {
  name: string; mark: string;
  fileKind: 'dxf' | 'pdf' | null;
  /** 'conflict': a copy of a matched row already has another file — it is saved only with "Replace on all". */
  status: 'new' | 'replaces' | 'unmatched' | 'error' | 'conflict';
  matchedBy?: MatchedBy;
  /** The bracket code the name carried, when it did. */
  pattern?: string | null;
  hints?: { thicknessMm?: number | null; grade?: string | null } | null;
  /** The copies the file also goes to (linked copies): the rows it started from, those added, those left out. */
  fanOut?: { fromRowIds?: number[]; added?: CountOrList; skipped?: CountOrList } | null;
  values?: DrawingValue[];
  /** status 'conflict': the other files on rows this one goes to. */
  conflicts?: { rowId: number; label: string; drawingId: number; fileName: string; mark: string }[];
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
export interface DrawingFileBody {
  name: string; content: string; drawingId?: number; rowId?: number;
  /** Aimed at one row (rowId): 'one' keeps the file off its copies, and the row stops being a copy. Left out = every copy gets it. */
  links?: 'one';
  /** A copy has another file: replace it on every row this file goes to. */
  replaceOnMembers?: boolean;
}

export interface StartDrawingBody {
  rowIds: number[]; number: string; revision?: string; title?: string;
  source?: 'shop' | 'customer'; status?: 'draft' | 'issued'; notes?: string;
  /** 'one' keeps the new register drawing to these rows only (no copies). */
  links?: 'one' | 'all';
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

/** A register revision's file as a Blob (kept on any order line, or by a standard drawing), for the viewer. */
export const fetchRegisterBlob = (drawingId: number): Promise<Blob> =>
  cfApi.getBlob(`/drawings/${drawingId}/file`, { timeoutMs: LONG_WRITE_MS });

/** The saved file as a Blob, for the viewer (the same route as the download, so the JWT goes with it). */
export const fetchDrawingBlob = (orderId: number, lineId: number, d: { id: number }): Promise<Blob> =>
  cfApi.getBlob(`${base(orderId, lineId)}/${d.id}/file`, { timeoutMs: LONG_WRITE_MS });

/** A DXF Blob as text. The server stores the file text as latin1, so that is how it is read back (not UTF-8). */
export async function blobAsText(blob: Blob): Promise<string> {
  const buf: ArrayBuffer = typeof blob.arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error ?? new Error('Could not read the file.'));
      r.readAsArrayBuffer(blob);
    });
  return new TextDecoder('windows-1252').decode(buf);
}

/** One row of an order line in the drawing tree: where it sits and the drawing that covers it, if any. */
export interface DrawingTreeRow {
  rowId: number; parentId: number | null; code: string | null; name: string; level: string; depth: number; seq: number; mark: string | null;
  hasDrawing: boolean;
  /** the file's id, for `GET …/drawings/:id/file` */
  drawingId: number | null;
  fileKind: 'dxf' | 'pdf' | null; fileName: string | null;
  number: string | null; revision: string | null; status: RegisterRef['status'] | null;
  isPlatePart: boolean; cutPlateIds: number[];
  /** No file on the line: the register drawing that covers the row — opened by its kept file, else by its link. */
  sheet?: RowSheet | null;
}
export interface RowSheet {
  id: number; number: string; revision: string; title: string | null; status: RegisterRef['status'];
  url: string | null; hasFile: boolean; fileName: string | null; fileKind: 'dxf' | 'pdf' | null;
}
export interface DrawingTree { line: DrawingsView['line']; rows: DrawingTreeRow[] }

/** Every row of the line with its parent and drawing — one read (view permission), for the viewer's levels. */
export const getDrawingTree = (orderId: number, lineId: number) =>
  cfApi.get<DrawingTree>(`${base(orderId, lineId)}/tree`);

// ── the line's 3D model (kept with its standard drawing; services/model3dService.js) ──
export type Model3DSection =
  | { type: 'I'; h: number; bTop: number; tTop: number; bBot: number; tBot: number; tw: number }
  | { type: 'box'; h: number; w: number; bTop: number; tTop: number; bBot: number; tBot: number; tw: number }
  | { type: 'pipe'; d: number; t: number };
export interface Model3DElement {
  id: string;
  /** the drawing mark of the BOM row it belongs to; `in` = the marks of the rows above it */
  mark: string | null; in?: string[]; label?: string;
  member?: { a: [number, number, number]; b: [number, number, number]; up: [number, number, number]; section: Model3DSection };
  box?: { c: [number, number, number]; size: [number, number, number] };
  /** a shaped plate: its outline (mm) extruded `t` along w; the outline's x runs along u, y along v, its (0,0) at o */
  plate?: { pts: [number, number][]; t: number; o: [number, number, number]; u: [number, number, number]; v: [number, number, number]; w: [number, number, number] };
}
export interface Model3D { schema: string; units: 'mm'; up?: 'z'; title?: string; notes?: string[]; elements: Model3DElement[] }
export const getLineModel3d = (orderId: number, lineId: number) =>
  cfApi.get<{ fileId: number; fileName: string; model: Model3D }>(`/orders/${orderId}/lines/${lineId}/model3d`);
