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
  usedPct: number;
  items: NestItem[];
}

export interface Blank {
  key: string; code: string; name: string;
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

export interface BlankPlanResponse {
  orderNumber: string;
  blanks: Blank[];
  nests: Nest[];
  skipped: { name: string; reason: string }[];
  summary: BlankSummary;
}

export const getBlankPlan = (orderId: number | string, effort: Effort = 'standard') =>
  fabGet<BlankPlanResponse>(`orders/${orderId}/blanks?effort=${effort}`);

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
  plan: { nests: Nest[]; flows?: Record<string, number> },
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

/** Upload a hand-made plan. It APPLIES, exactly as accepting a suggestion does. */
export async function uploadPlanSheet(orderId: number | string, file: File) {
  const form = new FormData();
  form.append('excel_file', file);
  const res = await api.post(`${base()}/orders/${orderId}/blanks/sheet`, form);
  return res.data as AcceptResponse;
}
