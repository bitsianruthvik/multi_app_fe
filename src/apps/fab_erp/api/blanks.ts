/**
 * blanks.ts — the nesting stage's API.
 *
 * A BLANK is the rectangle that gets cut: material, grade and a size, with a
 * count. It is per SIZE and not per part — one blank on the KEPL order serves
 * eight part rows — which is the whole reason this replaced a screen that
 * linked a plate straight to each part.
 */

import api, { API_HOST } from '@core/utils/axiosConfig';
import { fabGet, fabPost } from './client';

const base = () =>
  `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

export type Effort = 'quick' | 'standard' | 'deep';

export interface NestItem { key: string; name: string; rect: string; qty: number }

/**
 * One real placed piece on a sheet — {x,y,l,w,rotated}, the packer's own
 * shape, inflated by the cutting gap. Sent with every packed sheet, sent BACK
 * on accept (so the server verifies the layout exactly rather than re-solving
 * it), and kept with the accepted plan so the sheet drawn later is the sheet
 * that was accepted.
 */
export interface NestPiece {
  key: string; x: number; y: number; l: number; w: number; rotated: boolean;
}

/** A sheet size that would have cut waste — a purchasing answer, not a packing one. */
export interface SizeAdvice {
  thickness: number;
  grade: string | null;
  material: string | null;
  plates: number;
  from: { length: number; width: number };
  to: { length: number; width: number };
  savingPct: number;
  savingKg: number;
}

/** One SHEET, carrying several rectangles. */
export interface Nest {
  nestNo: string;
  plateCatalogItemId: number;
  plateCode: string | null;
  plateName: string | null;
  thickness: number;
  width: number;
  length: number;
  isDrop: boolean;
  plateKg: number;
  /** 0-100, uncapped above 100 (see `overfilled`) — EU-10. */
  utilisationPct?: number;
  overfilled?: boolean;
  /** @deprecated alias of `utilisationPct`, same 0-100 scale — EU-21 removes it. */
  usedPct: number;
  items: NestItem[];
  /** Real per-piece geometry (see `NestPiece`). */
  pieces?: NestPiece[];
  /** True when `pieces` is a re-pack for display rather than the layout that was accepted. */
  piecesDerived?: boolean;
}

export interface Blank {
  key: string; code: string; name: string;
  /** The short handle the cutting-plan sheet uses for this blank — B1, B2 … in list order. */
  ref?: string;
  material: string | null; grade: string | null;
  thickness: number; width: number; length: number;
  qty: number; unitWeightKg: number; totalWeightKg: number;
  /** The DISTINCT part names drawing on this rectangle — many, usually. */
  partNames: string[];
  partCount: number;
  nests: { nestNo: string; qty: number; plate: string; isDrop: boolean; sharedWith: number }[];
  plateSizes: string[]; plateCount: number; sharesPlates: number;
  placed: number; short: number; reason: string | null;
}

export interface BlankSummary {
  blanks: number; pieces: number; plates: number; mixedPlates: number;
  boughtKg: number; grossKg: number; usedKg: number; dropKg: number;
  yield: number; short: number;
}

export interface SkippedPart {
  name: string;
  reason: string;
  /** Lets the screen link straight back to the Structure row — not always present. */
  itemId?: number;
}

export interface BlankPlanResponse {
  /** True when this is the plan the order accepted, not a fresh proposal. */
  fromSaved?: boolean;
  /** True once the plan has been accepted onto a cutting order. */
  accepted?: boolean;
  /** How this plan was arrived at, for the reader. */
  provenance?: string | null;
  orderNumber: string;
  /** Which effort level produced this. */
  effort?: Effort;
  /** The packer seed — the order id, so one order always packs the same way. */
  seed?: number;
  /** False only if the safety stop fired, in which case the plan may move. */
  reproducible?: boolean;
  blanks: Blank[];
  nests: Nest[];
  skipped: SkippedPart[];
  summary: BlankSummary;
  /** Yield bands, when the backend states them — not sent today; FE falls back to 90/75. */
  thresholds?: { good: number; warn: number };
  /** Sheet sizes that would have cut waste, most steel first. Fresh packs only. */
  advice?: SizeAdvice[];
}

/**
 * The plan. Reads back what the order ALREADY accepted unless repack is set —
 * re-packing is 36 seconds at 500 restarts, and being shown the plan you
 * already have should not cost that.
 */
export const getBlankPlan = (orderId: number | string, effort: Effort = 'standard', repack = false) =>
  fabGet<BlankPlanResponse>(
    `orders/${orderId}/blanks?effort=${effort}${repack ? '&repack=1' : ''}`,
  );

/** The accepted plan if there is one, else an empty answer — never a fresh pack. */
export const getSavedBlankPlan = (orderId: number | string) =>
  fabGet<BlankPlanResponse>(`orders/${orderId}/blanks?saved=1`);

export interface AcceptResponse {
  cuttingOrderNumber: string;
  blanks: number;
  sheets: number;
  platesLinked: number;
  partsRepointed: number;
  tasks: number;
  fromSheet?: {
    rows: number;
    sheets: number;
    short: { code: string; rect: string; needed: number; planned: number }[];
  };
}

export const acceptBlankPlan = (
  orderId: number | string,
  plan: { nests: Nest[]; flows?: Record<string, number>; provenance?: string },
) => fabPost<AcceptResponse>(`orders/${orderId}/blanks/accept`, { plan });

/**
 * Download the plan to edit by hand.
 *
 * Fetched as a blob rather than opened as a link, because the endpoint needs the
 * Authorization header the axios instance carries and a bare <a href> would not.
 */
export async function downloadPlanSheet(orderId: number | string, effort: Effort = 'standard') {
  const res = await api.get(`${base()}/orders/${orderId}/blanks/sheet?effort=${effort}`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Cutting_plan.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The blank list with NO sheets — every blank this order needs, one row each,
 * Nest and Plate code left empty — for a planner who nests by hand from the
 * start and never runs the packer. Same file shape as the plan, so the same
 * upload reads it back.
 */
export async function downloadBlankListSheet(orderId: number | string) {
  const res = await api.get(`${base()}/orders/${orderId}/blanks/sheet?effort=template`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Blank_list_to_nest.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload a hand-made plan. It APPLIES, exactly as accepting a suggestion does. */
export async function uploadPlanSheet(orderId: number | string, file: File) {
  const form = new FormData();
  form.append('excel_file', file);
  const res = await api.post(`${base()}/orders/${orderId}/blanks/sheet`, form);
  return res.data as AcceptResponse;
}

/**
 * A blank-plan pack as a background run (EU-11's `fab_nesting_runs`).
 *
 * `startRun` returns before the pack necessarily even starts; `getRun` is what
 * a poller reads back. Its `result` is the same shape `getBlankPlan` returns —
 * one code path renders either source.
 */
export interface NestingRun {
  id: number;
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  kind: string;
  effort: Effort | null;
  result: BlankPlanResponse | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export const startNestingRun = (orderId: number | string, effort: Effort) =>
  fabPost<{ ok: boolean; runId: number }>(`orders/${orderId}/nesting/runs`, { effort });

export const getNestingRun = (orderId: number | string, runId: number) =>
  fabGet<{ ok: boolean } & NestingRun>(`orders/${orderId}/nesting/runs/${runId}`);

/** The newest run to finish `done` for this order — what EU-18 shows on mount instead of packing. */
export const getLatestNestingRun = (orderId: number | string) =>
  fabGet<{ ok: boolean; run: NestingRun | null }>(`orders/${orderId}/nesting/runs`, { latest: 1 });

export const cancelNestingRun = (orderId: number | string, runId: number) =>
  fabPost<{ ok: boolean; cancelled: boolean }>(`orders/${orderId}/nesting/runs/${runId}/cancel`, {});
