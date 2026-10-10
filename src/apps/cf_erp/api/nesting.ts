import { cfApi, LONG_WRITE_MS } from './client';
import type { NestRunAnswer, NestRunSnapshot, NestSheetResult, NestingChoices, PlateChoice } from './types';

/**
 * The nesting sheet and the CNC files (CF_ERP_NESTING_PLAN.md, "Decided
 * 2026-09-29"). The screen's own reads and writes (the saved plan, propose,
 * accept) stay in NestingPanel; these are the file round-trips.
 */

const base = (orderId: number, lineId: number) => `/orders/${orderId}/lines/${lineId}/nesting`;

/** Hand a blob to the browser as a download. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A file name that survives every OS. */
const safe = (s: string) => s.replace(/[^\w.-]+/g, '_');

export async function downloadNestingSheet(orderId: number, lineId: number, name: string): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/sheet`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(`Nesting_${name}.xlsx`));
}

export async function downloadCncZip(orderId: number, lineId: number, name: string): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/cnc`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(`CNC_${name}.zip`));
}

export async function downloadLotCnc(orderId: number, lineId: number, lotId: number, lotNo: string | null): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/cnc/${lotId}`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(`${lotNo ?? `lot_${lotId}`}.dxf`));
}

/**
 * Fill in whatever the answer lacks, so an older backend (or a partial answer)
 * still renders instead of throwing on `.map` of undefined.
 */
function normalise(out: Partial<NestSheetResult> | null | undefined): NestSheetResult {
  const problems = Array.isArray(out?.problems) ? out.problems : [];
  return {
    applied: !!out?.applied,
    canSave: out?.canSave ?? problems.length === 0,
    needsForce: !!out?.needsForce,
    problems,
    nests: Array.isArray(out?.nests) ? out.nests.map((n) => ({
      ...n,
      items: Array.isArray(n.items) ? n.items : [],
      reasons: Array.isArray(n.reasons) ? n.reasons : [],
      hasLayout: n.hasLayout !== false,
    })) : [],
    coverage: Array.isArray(out?.coverage) ? out.coverage : [],
  };
}

/**
 * Read the sheet without writing anything. `file` is the contract's name; the
 * backend deployed before it reads `fileBase64`, so both are sent.
 */
export async function previewNestingSheet(orderId: number, lineId: number, file: string, filename: string): Promise<NestSheetResult> {
  const out = await cfApi.post<Partial<NestSheetResult>>(`${base(orderId, lineId)}/sheet`,
    { file, fileBase64: file, filename, dryRun: true }, { timeoutMs: LONG_WRITE_MS });
  return normalise(out);
}

/** Save the sheet: it replaces every plate on the line. `force` saves it although the check had doubts. */
export async function saveNestingSheet(orderId: number, lineId: number, file: string, filename: string, force: boolean): Promise<NestSheetResult> {
  const out = await cfApi.post<Partial<NestSheetResult>>(`${base(orderId, lineId)}/sheet`,
    { file, fileBase64: file, filename, dryRun: false, force }, { timeoutMs: LONG_WRITE_MS });
  return normalise(out);
}

/**
 * THE NESTING CHOICES (init.sql §40): Step A — the cut pieces a run considers —
 * and Step B — the raw plates it may draw on. Read with the line; saved whole
 * (both lists, an empty pair resets). Every run applies them.
 */
export function getNestingChoices(orderId: number, lineId: number): Promise<NestingChoices> {
  return cfApi.get<NestingChoices>(`${base(orderId, lineId)}/choices`);
}

export function saveNestingChoices(orderId: number, lineId: number, excludedCutPlateIds: number[], excludedPlateIds: number[]): Promise<NestingChoices> {
  return cfApi.put<NestingChoices>(`${base(orderId, lineId)}/choices`, { excludedCutPlateIds, excludedPlateIds });
}

/** Which plates nesting may use on this line: standard only, or standard and custom. Needed before the first run. */
export function setNestPlates(orderId: number, lineId: number, plates: PlateChoice): Promise<{ lineId: number; plateChoice: PlateChoice }> {
  return cfApi.put<{ lineId: number; plateChoice: PlateChoice }>(`${base(orderId, lineId)}/plates`, { plates });
}

/** Flip a catalog plate between STANDARD and CUSTOM (the generic values save; needs the catalog grant). */
export function setPlateKind(plateItemId: number, kind: 'STANDARD' | 'CUSTOM'): Promise<unknown> {
  return cfApi.put(`/records/${plateItemId}/values`, { values: [{ specCode: 'PLATE_KIND', value: kind }] });
}

/**
 * NESTING RUNS. The server owns the run (one per order line), so leaving the
 * page does not stop it. Start returns at once; poll `getNestRun` until done.
 */
export function startNestRun(orderId: number, lineId: number, options: Record<string, unknown> = {}): Promise<NestRunSnapshot> {
  return cfApi.post<NestRunSnapshot>(`${base(orderId, lineId)}/runs`, options);
}

/** The line's current run, or `{ status: 'none' }`. With `plan`, a finished run carries its proposal. */
export function getNestRun(orderId: number, lineId: number, opts: { plan?: boolean } = {}): Promise<NestRunAnswer> {
  return cfApi.get<NestRunAnswer>(`${base(orderId, lineId)}/runs/current${opts.plan ? '?plan=1' : ''}`);
}

/** Forget a finished run ("Discard proposal"). */
export function discardNestRun(orderId: number, lineId: number): Promise<{ ok: boolean; running: boolean }> {
  return cfApi.del<{ ok: boolean; running: boolean }>(`${base(orderId, lineId)}/runs/current`);
}

/* ===========================================================================
 * NESTING v2 — the customer's own nesting files, and the comparison with ours.
 * Contract: TM/CF_ERP_NESTING_V2.md. Every type here is the contract's shape;
 * a field the contract calls optional is optional here.
 * ======================================================================== */

/** The true outline of one placed piece, in plate mm (origin lower-left). */
export interface PieceRings {
  outline: [number, number][];
  /** Torch-cut windows, as corner lists. */
  cutouts: [number, number][][];
  /** Drilled holes: centre and diameter. */
  holes: { cx: number; cy: number; d: number }[];
}

/** What a piece gained in v2 (§1, §7). The base NestPiece type is older; read these through a cast. */
export interface PieceExtras {
  rotationDeg?: number;
  mirrored?: boolean;
  placedBy?: 'customer' | 'ours';
  area?: number;
  rings?: PieceRings;
  /** 'nesting file': a part with no drawing keeps the customer's outline. */
  shapeFrom?: string | null;
  /** The file puts it across the plate's edge (preview only): drawn in the error colour. */
  outside?: boolean;
}

/** What a plate gained in v2 (§7). */
export interface NestExtras {
  sourceKind?: 'dxf' | 'sheet' | 'shape' | null;
  sourceFile?: string | null;
  layoutOrigin?: 'customer' | 'ours' | null;
  layout?: 'free' | null;
  /** Closed areas between common-cut parts that are no part (preview only). */
  scrap?: { partId?: string; x: number; y: number; length: number; width: number }[];
}

export interface NestLineState {
  id: number; lineNo: number; orderId: number; orderCode: string; frozen?: boolean; released?: boolean;
}

export interface NestLeftOver {
  cutPlateId: number; cutPlateCode: string; qty: number;
  thickness?: number | null; length?: number | null; width?: number | null; grade?: string | null;
  manual?: boolean; leftOut?: boolean;
}

export interface NestFileCoverage {
  cutPlateId: number; cutPlateCode: string; needed: number; nested: number;
  customer?: number; ours?: number; diff: number; manual?: boolean; leftOut?: boolean;
}

export interface NestFilesTotals {
  plates: number; uploadedPlates: number; automaticPlates: number; pieces: number;
  piecesAddedByUs: number; leftOverPieces: number; leftOverToNest: number;
}

/** GET …/nesting/files */
export interface NestFilesInfo {
  line: NestLineState;
  canUpload: boolean;
  readOnlyReason: string | null;
  limits: { maxFiles: number; maxFileBytes: number; kinds: string[] };
  plates: {
    lotId: number; lotNo: string | null; origin: 'imported' | 'auto'; sourceKind: string | null; layoutOrigin: string | null;
    plateCode: string | null; length: number; width: number; pieces: number; customerPieces: number; ourPieces: number;
    file: { id: number; filename: string; nestNo: string | null } | null;
    parts: { cutPlateId: number; cutPlateCode: string; qty: number }[];
  }[];
  coverage: NestFileCoverage[];
  leftOver: NestLeftOver[];
  totals: NestFilesTotals | null;
}

export interface NestProblem {
  code: string; message: string; partId?: string; otherPartId?: string; cutPlateId?: number; cutPlateCode?: string; needsForce?: boolean;
  pairs?: { a: string; b: string; distance: number; text: string }[]; parts?: string[]; surplus?: number;
  /** PART_AMBIGUOUS: objects. PLATE_AMBIGUOUS: plate codes. */
  choices?: (string | { key: string; cutPlateId: number; code: string; thickness?: number | null; grade?: string | null })[];
}

export interface NestFilePlacement {
  partId?: string; cutPlateId: number; cutPlateCode: string;
  x: number; y: number; length: number; width: number;
  rotationDeg?: number; mirrored?: boolean; placedBy?: 'customer' | 'ours'; area?: number; rings?: PieceRings;
  by?: string; confidence?: number; shapeFrom?: string | null;
}

export interface NestFileMetrics {
  plateKg?: number; partsKg?: number; wasteKgTotal?: number; wastePct?: number;
  wasteKg?: { kerf: number; sequenceGaps: number; rim: number; offcut: number; wastage: number };
  offcuts?: number; offcutKg?: number;
}

export interface NestFileRead {
  filename: string; bytes?: number; nestNo?: string | null; lotNo?: string | null;
  status: 'ok' | 'warning' | 'error';
  action: 'add' | 'replace' | 'unchanged' | null;
  plate: {
    itemId: number; code: string; thickness: number | null; grade: string | null; length: number; width: number;
    drawn: boolean; resolvedBy: 'size' | 'code' | null; kerfMm: number;
  } | null;
  parts: number; placed: number;
  placements: NestFilePlacement[];
  counts: { cutPlateId: number; cutPlateCode: string; qty: number }[];
  errors: NestProblem[];
  warnings: NestProblem[];
  scrap?: { partId?: string; x: number; y: number; length: number; width: number }[];
  notes: string[];
  metrics: NestFileMetrics | null;
  lotId?: number;
}

export interface NestDiffParts { cutPlateCode: string; qty?: number; was?: number; now?: number; change?: number }

export interface NestDiff {
  added: { lotNo: string; filename: string; plateCode: string; pieces: number; parts: NestDiffParts[] }[];
  replaced: {
    lotId: number; lotNo: string; newLotNo?: string; filename: string;
    was: { plateCode: string; pieces: number; filename?: string }; now: { plateCode: string; pieces: number };
    parts: NestDiffParts[]; moved: number; added: number; removed: number;
    droppedOurs?: { cutPlateCode: string; qty: number }[];
  }[];
  unchanged: { lotId: number; lotNo: string; filename: string; plateCode: string; pieces: number }[];
  removed: { lotId: number; lotNo: string; origin: string; filename: string | null; plateCode: string; pieces: number; parts: NestDiffParts[] }[];
  droppedAuto: { lotId: number; lotNo: string; pieces: number; because: string[] }[];
  droppedOurs: { lotId: number; lotNo: string; parts: NestDiffParts[]; because: string }[];
  renumbered: { lotId: number; from: string; to: string }[];
}

/** Answer of POST …/nesting/files, for a preview and for a save. */
export interface NestFilesResult {
  dryRun: boolean; applied: boolean; mode: 'merge' | 'replace';
  canSave: boolean; needsForce: boolean;
  files: NestFileRead[];
  problems: string[]; problemList: NestProblem[];
  warnings: string[]; warningList: NestProblem[];
  diff: NestDiff;
  coverage: NestFileCoverage[];
  leftOver: NestLeftOver[];
  surplus: { cutPlateId: number; cutPlateCode: string; needed: number; nested: number; surplus: number; on: { name: string; qty: number }[] }[];
  totals: NestFilesTotals | null;
  message: string;
  saved?: { lots: number; pieces: number; offcuts: number; removedLots: number };
}

export interface NestFileUpload { filename: string; file: string; plateCode?: string; nestNo?: string }

export interface NestFilesRequest {
  files: NestFileUpload[];
  dryRun: boolean;
  force?: boolean;
  mode?: 'merge' | 'replace';
  choices?: Record<string, Record<string, string | number>>;
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Fill in what an answer lacks, so a partial one renders instead of throwing. */
function normaliseFiles(out: Partial<NestFilesResult> | null | undefined): NestFilesResult {
  const o = out ?? {};
  const d = (o.diff ?? {}) as Partial<NestDiff>;
  return {
    dryRun: o.dryRun !== false,
    applied: !!o.applied,
    mode: o.mode === 'replace' ? 'replace' : 'merge',
    canSave: o.canSave ?? arr(o.problems).length === 0,
    needsForce: !!o.needsForce,
    files: arr<NestFileRead>(o.files).map((f) => ({
      ...f, placements: arr(f.placements), counts: arr(f.counts), errors: arr(f.errors), warnings: arr(f.warnings), notes: arr(f.notes),
      metrics: f.metrics ?? null, plate: f.plate ?? null,
    })),
    problems: arr<string>(o.problems), problemList: arr<NestProblem>(o.problemList),
    warnings: arr<string>(o.warnings), warningList: arr<NestProblem>(o.warningList),
    diff: {
      added: arr(d.added), replaced: arr(d.replaced), unchanged: arr(d.unchanged), removed: arr(d.removed),
      droppedAuto: arr(d.droppedAuto), droppedOurs: arr(d.droppedOurs), renumbered: arr(d.renumbered),
    },
    coverage: arr(o.coverage), leftOver: arr(o.leftOver), surplus: arr(o.surplus),
    totals: o.totals ?? null,
    message: o.message ?? '',
    saved: o.saved,
  };
}

export function getNestFiles(orderId: number, lineId: number): Promise<NestFilesInfo> {
  return cfApi.get<Partial<NestFilesInfo>>(`${base(orderId, lineId)}/files`).then((o) => ({
    line: o.line as NestLineState,
    canUpload: o.canUpload !== false,
    readOnlyReason: o.readOnlyReason ?? null,
    limits: o.limits ?? { maxFiles: 200, maxFileBytes: 4194304, kinds: ['dxf'] },
    plates: arr(o.plates), coverage: arr(o.coverage), leftOver: arr(o.leftOver), totals: o.totals ?? null,
  }));
}

/** Read the files (dryRun true) or save them. One request, however many files. */
export async function sendNestFiles(orderId: number, lineId: number, req: NestFilesRequest): Promise<NestFilesResult> {
  const body = {
    files: req.files, dryRun: req.dryRun, mode: req.mode ?? 'merge',
    ...(req.force ? { force: true } : {}),
    ...(req.choices && Object.keys(req.choices).length ? { choices: req.choices } : {}),
  };
  const out = await cfApi.post<Partial<NestFilesResult>>(`${base(orderId, lineId)}/files`, body, { timeoutMs: LONG_WRITE_MS });
  return normaliseFiles(out);
}

export interface NestLotRemoved {
  applied: boolean; message: string;
  removed: { lotId: number; lotNo: string | null; filename: string | null; plateCode: string | null; pieces: number; parts: { cutPlateCode: string; qty: number }[] };
  totals: NestFilesTotals | null;
}

/** Take one plate off the line; its pieces go back to left over. */
export function removeNestLot(orderId: number, lineId: number, lotId: number): Promise<NestLotRemoved> {
  return cfApi.del<NestLotRemoved>(`${base(orderId, lineId)}/lots/${lotId}`, { timeoutMs: LONG_WRITE_MS });
}

/** The customer's file of one plate, as a download. */
export async function downloadCustomerFile(orderId: number, lineId: number, lotId: number, filename: string | null): Promise<void> {
  const blob = await cfApi.getBlob(`${base(orderId, lineId)}/files/${lotId}`, { timeoutMs: LONG_WRITE_MS });
  save(blob, safe(filename || `plate_${lotId}.dxf`));
}

/* ---- Runs: progress, stop (§9) --------------------------------------------- */

export interface RunBest { plates: number; areaBoughtM2: number; wastePct: number | null; unplaced: number; atMs: number; scope?: string }
export interface RunCurvePoint { atMs: number; plates: number; areaBoughtM2: number; wastePct: number | null; unplaced: number }

/** A run snapshot with what the 5 / 10 / 20 minute runs add. */
export interface KeepAwake {
  on?: boolean; configured?: boolean; runs?: number; everyMs?: number; pings?: number; failures?: number;
  lastPingAt?: string | null; lastOkAt?: string | null; lastStatus?: number | null; lastError?: string | null;
}

export type RunV2 = NestRunSnapshot & {
  progress: {
    best?: RunBest | null; curve?: RunCurvePoint[];
    resumes?: number; checkpointAt?: string | null; checkpointAgeMs?: number | null; checkpointBytes?: number | null; keepAwake?: KeepAwake | null;
  };
  canStop?: boolean; stopRequested?: boolean; stopped?: boolean; resumed?: boolean; elsewhere?: boolean; restored?: boolean;
};

/** "Stop and use this": the run ends within a second or two with its best layout. */
export function stopNestRun(orderId: number, lineId: number): Promise<RunV2> {
  return cfApi.post<RunV2>(`${base(orderId, lineId)}/runs/current/stop`, {});
}

/** The same for a comparison run. */
export function stopNestCompare(orderId: number, lineId: number): Promise<RunV2> {
  return cfApi.post<RunV2>(`${base(orderId, lineId)}/compare/stop`, {});
}

/** Cancel a comparison run: it is gone at once. */
export function cancelNestCompare(orderId: number, lineId: number): Promise<{ ok: boolean; cancelled?: boolean; runId?: string }> {
  return cfApi.del(`${base(orderId, lineId)}/compare`);
}

/* ---- Compare (§6) ---------------------------------------------------------- */

export interface CompareCost { value: number | null; currency?: string; basis?: string; customerPlates?: number; reason: string | null }

export interface CompareMetrics {
  plates: number; pieces: number; tonnesBought: number | null; partsTonnes: number | null;
  wastePct: number | null; wastePctReason?: string | null; wasteKgTotal: number | null;
  wasteKg?: { kerf: number | null; sequenceGaps: number | null; rim: number | null; offcut: number | null; wastage: number | null };
  offcuts?: { count: number; kg: number } | null;
  cutLengthM: number | null; sharedCutM?: number | null; piercings: number | null;
  cost: CompareCost | null;
}

export interface ComparePlate {
  lotNo: string | null; lotId: number | null; origin: string; file?: string | null; plateCode: string | null;
  thickness?: number | null; length?: number; width?: number; kerfMm?: number | null; pieces: number; plateKg?: number; partsKg?: number;
  wastePct: number | null; offcuts?: number; offcutKg?: number; cost: number | null; costBasis?: string | null;
}

export interface CompareRun {
  runId: string | null; status: 'ready' | 'accepted' | 'discarded' | 'none' | 'running' | 'stale' | 'unavailable' | string;
  decision?: 'auto' | 'uploaded' | null;
  ranAt?: string | null; startedBy?: string | null; reason?: string | null;
  params?: { effort?: string } | null;
  metrics: CompareMetrics | null; perPlate: ComparePlate[];
  plan?: { groups?: { nests?: unknown[] }[] } | null;
}

export interface CompareWillReplace {
  side: string; customerPlates: number; ourPlates: number; plates: number; customerPieces: number; ourPiecesOnCustomerPlates: number;
  ourPieces: number; pieces: number; customerFiles: number; withPlates: number | null; withPieces: number | null;
  notNestedAfter: number | null; withReason?: string | null; message: string;
}

export interface CompareAnswer {
  line?: NestLineState;
  demand?: { pieces: number; cutPlates: number; coversWholeLine: boolean } | null;
  uploaded: { metrics: CompareMetrics; perPlate: ComparePlate[]; files?: { lotId: number; lotNo: string; filename: string }[] } | null;
  auto: CompareRun;
  stale: { runId: string; ranAt: string | null; status: string; reason: string } | null;
  delta: Record<string, number | string | null> | null;
  deltaReason?: string | null;
  verdict: string | null;
  willReplace?: CompareWillReplace | null;
  likeForLike: { same: boolean; uploadedPieces: number; autoPieces: number; differ: unknown[]; overNested: unknown[] } | null;
  wholeLine: {
    saved: { metrics: CompareMetrics; perPlate: ComparePlate[]; complete?: boolean; leftOverPieces?: number } | null;
    auto: { runId?: string; status?: string; reason?: string | null; metrics: CompareMetrics | null; perPlate: ComparePlate[] } | null;
    delta?: Record<string, number | string | null> | null; verdict?: string | null; deltaReason?: string | null;
  } | null;
  run: RunV2 | null;
  lastFailure: { error?: { code?: string; message?: string } } | null;
  canAccept: { uploaded: boolean; auto: boolean; reason: string | null } | null;
}

export function getNestCompare(orderId: number, lineId: number, opts: { detail?: boolean } = {}): Promise<CompareAnswer> {
  return cfApi.get<Partial<CompareAnswer>>(`${base(orderId, lineId)}/compare?with=auto${opts.detail ? '&detail=1' : ''}`).then((o) => ({
    ...o,
    uploaded: o.uploaded ?? null,
    auto: { metrics: null, perPlate: [], runId: null, status: 'none', ...(o.auto ?? {}) } as CompareRun,
    stale: o.stale ?? null, delta: o.delta ?? null, verdict: o.verdict ?? null, likeForLike: o.likeForLike ?? null,
    wholeLine: o.wholeLine ?? null, willReplace: o.willReplace ?? null, deltaReason: o.deltaReason ?? null, run: o.run ?? null, lastFailure: o.lastFailure ?? null, canAccept: o.canAccept ?? null,
  }));
}

export interface CompareStarted { started: boolean; running: boolean; runId: string; status: string; reason?: string }

/** Start the automatic side. `rerun` packs again although a run already answers. */
export function startNestCompare(orderId: number, lineId: number, opts: { effort?: 'quick' | 'standard' | 'deep' | 'long'; rerun?: boolean } = {}): Promise<CompareStarted> {
  return cfApi.post<CompareStarted>(`${base(orderId, lineId)}/compare`, { run: true, effort: opts.effort ?? 'quick', rerun: !!opts.rerun });
}

export interface CompareAccepted { decision: 'uploaded' | 'auto'; message: string; replaced?: { uploadedPlates: number; plates: number } }

export function acceptNestCompare(orderId: number, lineId: number, side: 'uploaded' | 'auto', runId: string): Promise<CompareAccepted> {
  return cfApi.post<CompareAccepted>(`${base(orderId, lineId)}/compare/accept`, { side, runId }, { timeoutMs: LONG_WRITE_MS });
}
