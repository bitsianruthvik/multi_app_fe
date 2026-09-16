import api, { API_HOST } from '@core/utils/axiosConfig';

/**
 * Order readiness — the five preparation stages and what is missing from each.
 *
 * Computed entirely on the server (orderReadinessService.js). Nothing here
 * re-derives a count from rows the page happens to have loaded: the strip, the
 * tab labels and the Build tasks warning all render this one object, which is
 * the only reason they cannot contradict each other.
 */

/**
 * `not_applicable` is a real state, not a gap in the type (U3).
 *
 * The server emits it for a stage that genuinely does not apply to this order
 * — Production on a quote, today (orderReadinessService.js applicability) —
 * and `satisfied()` there treats it exactly like `done`. Before this was added
 * to the type, `STATE_COLOR[state]` was `undefined` wherever a stage rendered,
 * which is a silent hole in a color map, not a visible bug — so it went
 * unnoticed until a quote's Production step drew an uncoloured icon.
 */
/** `pending` = not reached yet: an earlier stage is unfinished, so this one has no status of its own. */
export type StageState = 'todo' | 'partial' | 'done' | 'not_applicable' | 'pending';

export interface ReadinessStage {
  key: 'lines' | 'nesting' | 'params' | 'production';
  label: string;
  state: StageState;
  count: number;
  total: number;
  detail: string;
  /** One short figure for the step strip, the same everywhere: "82 rows", "24 blanks · 129 sheets". */
  summary?: string | null;
  /**
   * `state === 'done' || state === 'not_applicable' || applicability === 'optional'`
   * — computed server-side (orderReadinessService.js's own `satisfied()`), so
   * Next/Confirm gating never has to re-derive it and risk disagreeing with
   * the server's own `preparationComplete`/`canConfirm`.
   */
  satisfied: boolean;
  /** Production only: how many production orders are on the floor. The structure editor warns before editing under them. */
  deployed?: number;
  /** Production only: deployed orders whose BOM changed since deploy (order numbers) — Re-deploy clears it. */
  stale?: string[];
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
  nesting: 'nesting',
  params: 'params',
  production: 'production',
};

/**
 * The order the wizard walks its stages in — matches the server's own
 * `STAGE_KEYS` (orderReadinessService.js). Used to fall an unrecognised saved
 * `wizardStep` (e.g. one written before two old steps were merged into
 * 'production') forward onto the real next stage, rather than hardcoding a
 * step name that might itself stop existing.
 */
export const STAGE_ORDER: ReadinessStage['key'][] = ['lines', 'nesting', 'params', 'production'];

/**
 * `POST /orders/:id/wizard-step` — the user explicitly choosing where to be in
 * the wizard (EU-7 A5). This replaced a raw `fabMutate('fabErpOrder', 'update',
 * { wizard_step })`, which 400s: EU-1 removed `wizard_step` from
 * `fabErpOrder.writeFields` because this is the only endpoint allowed to move
 * it backward or park it on an unfinished stage.
 */
export async function setWizardStep(orderId: number, step: ReadinessStage['key']) {
  const res = await api.post<{ ok: boolean; readiness: OrderReadiness }>(
    `${base()}/orders/${orderId}/wizard-step`, { step },
  );
  return res.data;
}

// ── revisions (P2 / decision 4) ─────────────────────────────────────────────

export interface OrderRevision {
  id: number;
  rev: number;
  orderLineId: number | null;
  reason: string;
  /** applyTree's own counts (orderRevisionService.recordRevision) — an object, not a string. */
  summary: { created: number; updated: number; removed: number; sized?: number } | null;
  createdBy: number | null;
  createdAt: string;
}

/**
 * `POST /orders/:id/revise` — the entry point into revision mode on a
 * CONFIRMED order. Records nothing itself (EU-12): it only checks the order is
 * out of draft and hands back the current readiness so the wizard can reopen.
 * Every structure change the reopened wizard makes must carry this same
 * `reason` through `applyStructure`'s `revisionReason` — that call is what
 * actually writes the `fab_order_structure_revisions` row.
 */
export async function reviseOrder(orderId: number, reason: string) {
  const res = await api.post<{ ok: boolean; revisionMode: boolean; readiness: OrderReadiness }>(
    `${base()}/orders/${orderId}/revise`, { reason },
  );
  return res.data;
}

export async function fetchOrderRevisions(orderId: number): Promise<OrderRevision[]> {
  const res = await api.get<{ rows: OrderRevision[] }>(`${base()}/orders/${orderId}/revisions`);
  return res.data.rows;
}

// ── quote → sales order (P3 / EU-13) ────────────────────────────────────────

export interface ConvertedOrder {
  id: number;
  orderNumber: string;
  orderType: string;
  status: string;
}

/** `POST /orders/:id/convert` — a quote becomes a sales order. */
export async function convertQuote(orderId: number) {
  const res = await api.post<{ ok: boolean; order: ConvertedOrder; readiness: OrderReadiness }>(
    `${base()}/orders/${orderId}/convert`, {},
  );
  return res.data;
}
