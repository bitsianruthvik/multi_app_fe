import { cfApi, qs } from './client';

/**
 * Production › Dashboard (multi_app_be services/dashboardService.js,
 * routes/dashboard.js). Minutes everywhere; dates are plant dates (YYYY-MM-DD);
 * times are the plant's wall clock ('YYYY-MM-DDTHH:MM:SS'). A null number means
 * "not known" (no shift, no weight, no cost) — never zero.
 */

export interface DashPeriod { from: string; to: string; days: number; today: string; now: string; timezone: string }
export interface DashMeta { queries: number; stages: number; ms: number }

export type MachineState = 'running' | 'stopped' | 'idle' | 'off_shift';

export interface ReasonMinutes { id: number; code: string; label: string; minutes: number; count: number; machines?: number }

export interface MachineDay { date: string; shift: number; run: number; runIn: number; stop: number; overtime: number; tonnes: number; utilisationPct?: number | null }

export interface DashMachine {
  id: number; code: string; name: string;
  type: { id: number; name: string } | null;
  hasShifts: boolean;
  now: {
    state: MachineState; inShift: boolean;
    running: { operation: string; pieceCode: string | null; orderCode: string | null; since: string }[];
    stop: { reason: string; since: string } | null;
    lastActivityAt: string | null;
  };
  shiftMin: number; runMin: number; runInShiftMin: number; overtimeMin: number | null;
  stopMin: number; stopInShiftMin: number; notRecordedMin: number;
  utilisationPct: number | null;
  output: { operationsDone: number; stepsWorked: number; piecesGood: number; piecesScrap: number; tonnes: number | null; unweighedSessions: number };
  standard: { earnedMin: number; coveragePct: number | null; performancePct: number | null };
  reasons: ReasonMinutes[];
  operators: { id: number; name: string; minutes: number }[];
  days: MachineDay[];
}

export interface MachinesDashboard {
  period: DashPeriod;
  plant: {
    machines: number; runningNow: number; stoppedNow: number; idleInShiftNow: number; offShiftNow: number; withoutShifts: number;
    shiftMin: number; runMin: number; runInShiftMin: number; overtimeMin: number; stopMin: number; notRecordedMin: number;
    utilisationPct: number | null; recordedPct: number | null;
    operationsDone: number; piecesGood: number;
    tonnesHandled: number | null; tonnesFinished: number; tonnesDispatched: number; unweighedMovements: number;
    earnedMin: number; performancePct: number | null;
    topReasons: ReasonMinutes[];
    days: MachineDay[];
  };
  types: { id: number; name: string }[];
  machines: DashMachine[];
  meta: DashMeta;
}

export type RiskStatus = 'late' | 'at_risk' | 'no_forecast' | 'on_track' | 'no_date' | 'done';
export type MaterialStatus = 'covered' | 'in_stock' | 'on_order' | 'to_buy';

export interface OrderStage {
  operationId: number; code: string; name: string; steps: number; done: number; inProgress: number; onHold: number; contracted: number;
  pctDone: number; workMinLeft: number | null;
}

export interface ShortMaterial {
  itemId: number; code: string | null; name: string; uom: string | null;
  needed: number; issued: number; reserved: number; short: number; shortSteps: number;
  freeNow: number; onOrder: number; expected: string | null; status: MaterialStatus;
}

export interface DashOrderLine {
  id: number; lineNo: number;
  item: { id: number | null; code: string | null; name: string | null; uom: string | null };
  quantity: number; made: number; delivered: number;
  released: boolean; releaseId: number | null; noSteps: boolean;
  committedDate: string | null;
  progressPct: number; basis: 'work' | 'count' | 'made' | null; estCoveragePct: number | null; stepsTotal: number;
  tonnes: number | null; tonnesMade: number | null; tonnesDispatched: number | null;
  period: { workMin: number; pctGained: number; made: number; dispatched: number; tonnesMade: number | null; tonnesDispatched: number | null };
  plan: { last: string; first: string; entries: number } | null;
  amount?: number | null;
}

export interface DashOrder {
  id: number; code: string; revision: number; title: string | null; orderType: 'customer' | 'stock'; planPriority: number | null;
  customer: { id: number; name: string } | null;
  committedDate: string | null;
  progress: { pct: number; basis: 'tonnes' | 'lines'; lineBasis: 'work' | 'count' | null; stepsTotal: number; workMinLeft: number | null };
  tonnes: { total: number | null; made: number | null; dispatched: number | null; unweighedLines: number[] };
  lines: { total: number; released: number; made: number; dispatched: number };
  period: { workMin: number; pctGained: number; tonnesMade: number | null; tonnesDispatched: number | null };
  forecast: { date: string | null; pace: string | null; pacePctPerWeek: number; plan: string | null; planComplete: boolean; planned: number; estimate: true };
  risk: { status: RiskStatus; daysLeft: number | null; slipDays: number | null; why: string };
  stages: OrderStage[];
  bottleneck: { operationId: number; code: string; name: string; basis: 'work' | 'count'; workMinLeft: number | null; stepsLeft: number; sharePct: number } | null;
  blocked: { onHold: number; holdReasons: { reason: string; count: number }[]; materialSteps: number };
  material: { requirements: number; items: number; fullyIssued: number; covered: number; inStock: number; onOrder: number; toBuy: number; short: ShortMaterial[] };
  money: {
    value: number | null; valueComplete: boolean; unpricedLines: number[];
    invoiced: number; invoicedCount: number; draftInvoices: number;
    materialCost: number; materialUncostedRows: number;
  } | null;
  lineRows: DashOrderLine[];
}

export interface OrdersDashboard {
  period: DashPeriod;
  totals: {
    orders: number; lines: number;
    late: number; atRisk: number; onTrack: number; noForecast: number; noDate: number; done: number;
    tonnes: number; tonnesMade: number; tonnesDispatched: number; tonnesComplete: boolean;
    periodTonnesMade: number; periodTonnesDispatched: number;
    onHold: number; materialSteps: number;
    value: number | null; valueComplete?: boolean | null; invoiced: number | null; materialCost: number | null;
  };
  withMoney: boolean;
  orders: DashOrder[];
  meta: DashMeta;
}

export const getMachinesDashboard = (from: string, to: string) => cfApi.get<MachinesDashboard>(`/dashboard/machines${qs({ from, to })}`);
export const getOrdersDashboard = (from: string, to: string) => cfApi.get<OrdersDashboard>(`/dashboard/orders${qs({ from, to })}`);
