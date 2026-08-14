import api, { API_HOST } from '@core/utils/axiosConfig';

/**
 * Order readiness — the five preparation stages and what is missing from each.
 *
 * Computed entirely on the server (orderReadinessService.js). Nothing here
 * re-derives a count from rows the page happens to have loaded: the strip, the
 * tab labels and the Build tasks warning all render this one object, which is
 * the only reason they cannot contradict each other.
 */

export type StageState = 'todo' | 'partial' | 'done';

export interface ReadinessStage {
  key: 'lines' | 'boq' | 'nesting' | 'flows' | 'tasks' | 'procurement' | 'production';
  label: string;
  state: StageState;
  count: number;
  total: number;
  detail: string;
}

export interface ReadinessBlocker {
  stage: string;
  count: number;
  message: string;
}

export interface OrderReadiness {
  orderId: number;
  status: string;
  /**
   * The step the wizard was last on, remembered server-side so closing it and
   * coming back — on any machine — lands where the work actually stopped.
   */
  wizardStep: ReadinessStage['key'] | null;
  preparationComplete: boolean;
  /** Draft, and every step done. The only state in which Confirm will succeed. */
  canConfirm: boolean;
  nextStage: ReadinessStage['key'] | null;
  stages: ReadinessStage[];
  blockers: ReadinessBlocker[];
}

const base = () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp`;

export async function fetchOrderReadiness(orderId: number): Promise<OrderReadiness> {
  const res = await api.get<OrderReadiness>(`${base()}/orders/${orderId}/readiness`);
  return res.data;
}

/** The tab each stage lives on, so a stage can be clicked to get to its work. */
export const STAGE_TAB: Record<ReadinessStage['key'], string> = {
  lines: 'lines',
  boq: 'items',
  nesting: 'nesting',
  flows: 'flows',
  tasks: 'dag',
  procurement: 'procurement',
  production: 'production',
};
