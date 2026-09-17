/**
 * fab_erp Month Fit API helpers.
 *
 * Wraps the two `/plan/month-fit` routes in routes/planner.js. The read returns
 * MEASUREMENTS only — what each station has left this month, and what every
 * open piece of work needs — and the fit itself runs in the browser
 * (components/monthfit/fitModel.ts), so trying another machine or another shift
 * never waits on the server.
 *
 * Reads are gated by `fab_erp_planner_view`, marks by `fab_erp_planner_manage`.
 */

import { fabGet, fabPut } from './client';

export interface FitStation {
  id: number;
  name: string;
  machines: number;
  machinesDown: number;
  /** Shifts a day on this station's calendar. 1 when it cannot be counted. */
  shifts: number;
  /** Working minutes between now and the end of the month, across its machines. */
  capacityMin: number;
  /** No calendar at all: the engine treats it as always available. */
  unbounded: boolean;
}

export type FitNodeKind = 'line' | 'item' | 'loose';

export interface FitNode {
  /** 'l<order line id>' or 'i<item id>'. Unique within one production order. */
  key: string;
  parentKey: string | null;
  kind: FitNodeKind;
  depth: number;
  isBlank: boolean;
  tonnes: number;
  qty: number | null;
  label: string;
  sub: string;
  /** Minutes of this row's OWN open tasks, per resource type id ('0' = none). */
  own: Record<string, number>;
  taskCount: number;
}

export type FitPurpose = 'cutting' | 'fabrication' | 'unreleased';

export interface FitPo {
  /** 0 for work no production order has claimed yet. */
  id: number;
  orderNumber: string | null;
  status: string | null;
  purpose: FitPurpose;
  committed: string | null;
  nodes: FitNode[];
}

export interface FitOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  status: string;
  priorityRank: number | null;
  /** YYYY-MM-DD. `must_finish_by` when set, else the customer's required date. */
  committed: string | null;
  committedKind: 'must' | 'required';
  pos: FitPo[];
}

export type MarkState = 'in' | 'out';

export interface FitMark {
  orderId: number;
  poId: number;
  /** 'po' for the whole production order, else a node key. */
  nodeKey: string;
  state: MarkState;
}

export interface MonthFitResponse {
  ok: boolean;
  month: string;
  timezone: string;
  from: string;
  to: string;
  monthEnd: string;
  today: string;
  stations: FitStation[];
  orders: FitOrder[];
  marks: FitMark[];
}

export async function getMonthFit(params: { month?: string } = {}): Promise<MonthFitResponse> {
  return fabGet<MonthFitResponse>('plan/month-fit', params.month ? { month: params.month } : {});
}

export async function saveMonthMarks(body: {
  month: string;
  marks: Array<{ orderId: number; poId: number; nodeKey: string; state: MarkState | null }>;
}): Promise<{ ok: boolean; saved: number; cleared: number }> {
  return fabPut('plan/month-fit/marks', body);
}
