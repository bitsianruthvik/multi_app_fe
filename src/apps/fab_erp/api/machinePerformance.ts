/**
 * machinePerformance.ts — where a machine's time went, what came off it, and
 * how fast it runs when it runs.
 *
 * Backend: multi_app_be/apps/fab_erp/routes/analytics.js
 *          multi_app_be/apps/fab_erp/services/machineAnalyticsService.js
 *
 * The honesty flags on these types (`tonnesSource`, `touchBasis`, `reliable`,
 * `n`) are not decoration — they are the difference between a measurement and a
 * guess, and the UI is expected to render them, not drop them.
 */

import { fabGet } from './client';

/** Where a tonnage figure came from. `planned` means nobody recorded output. */
export type TonnesSource = 'produced' | 'planned' | 'mixed' | 'none';

/** What the touch-time subtraction had to work with. */
export type TouchBasis = 'calendar' | 'crew' | 'elapsed' | 'none';

export interface StoppageBucket {
  code: string;
  label: string;
  scope: 'site' | 'machine' | 'task';
  minutes: number;
}

export interface MachineTimeUse {
  /** The machine's shift time in the period, clipped to now. */
  availableMinutes: number;
  runningMinutes: number;
  stoppageMinutes: number;
  unaccountedMinutes: number;
  stoppages: StoppageBucket[];
  shiftCount: number;
}

export interface MachineOutput {
  tonnes: number;
  runs: number;
  runsWithWeight: number;
  runsMissingWeight: number;
  runsFromProducedQty: number;
  runsFromPlannedQty: number;
  tonnesSource: TonnesSource;
  scrapQty: number;
  reworkRuns: number;
  qcFailRuns: number;
}

export interface ThroughputStats {
  n: number;
  /** False below 5 runs — show the rate, but not as a spread. */
  reliable: boolean;
  /** Everything that came off the machine, including runs with no touch time. */
  totalTonnes: number;
  totalTouchHours: number;
  /** Only the runs that have BOTH a weight and touch time — the rate's basis. */
  ratedTonnes: number;
  ratedTouchHours: number;
  /**
   * Time-weighted rate over rated runs only. Deliberately not
   * totalTonnes ÷ totalTouchHours: a run paused across the window would put its
   * tonnes in the numerator and nothing in the denominator, inflating the rate.
   */
  overallTonnesPerHour: number | null;
  meanTonnesPerHour: number | null;
  medianTonnesPerHour: number | null;
  p10: number | null;
  p90: number | null;
  /** Null at n = 1 — one run has no spread. Never 0. */
  stdDev: number | null;
  coefficientOfVariation: number | null;
}

export interface MachineRun {
  taskId: number;
  itemId: number | null;
  itemMark: string | null;
  itemName: string | null;
  operationName: string | null;
  startedAt: string;
  completedAt: string;
  elapsedMinutes: number;
  /** Working time inside the run with known stoppages removed — an upper bound. */
  touchMinutes: number;
  touchBasis: TouchBasis;
  qty: number;
  unitWeightKg: number | null;
  tonnes: number | null;
  tonnesSource: TonnesSource;
  scrapQty: number | null;
  qcResult: string | null;
  isRework: boolean;
  tonnesPerHour: number | null;
}

export interface MachinePerformance {
  ok: boolean;
  resourceId: number;
  resourceName: string;
  from: string;
  to: string;
  timezone: string;
  timeUse: MachineTimeUse;
  output: MachineOutput;
  throughput: ThroughputStats;
  runsDetail: MachineRun[];
}

export interface FleetRow {
  resourceId: number;
  name: string;
  code: string | null;
  availableMinutes: number;
  runningMinutes: number;
  stoppageMinutes: number;
  unaccountedMinutes: number;
  utilisationPct: number | null;
  tonnes: number;
  tonnesSource: TonnesSource;
  runs: number;
  touchHours: number;
  tonnesPerHour: number | null;
  medianTonnesPerHour: number | null;
  coefficientOfVariation: number | null;
  n: number;
  reliable: boolean;
}

export function getFleetPerformance(from: string, to: string) {
  return fabGet<{ ok: boolean; from: string; to: string; machines: FleetRow[] }>(
    'analytics/machine-performance', { from, to },
  );
}

export function getMachinePerformance(resourceId: number, from: string, to: string) {
  return fabGet<MachinePerformance>(
    `analytics/machine-performance/${resourceId}`, { from, to },
  );
}
