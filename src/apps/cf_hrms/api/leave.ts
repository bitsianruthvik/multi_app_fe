import { api } from './client';

/**
 * Leave policies — the client side of CF_HRMS_HIRING_SPEC.md §8.3. The types
 * are that section's.
 *
 * THREE THINGS, KEPT APART:
 *   a leave TYPE     a company-wide name — Casual leave, Sick leave;
 *   a leave POLICY   a named set of rules, one rule per leave type it grants.
 *                    It belongs to no role or location by itself;
 *   where it APPLIES company default -> location -> role, the most specific
 *                    wins. A position's policy is its role's, else its
 *                    location's, else the company default, else none.
 *
 * EVERY SENTENCE ABOUT A RULE IS THE SERVER'S. `rule.summary` comes with a
 * read; while a rule is being edited the same sentence is asked for from
 * `POST /leave/policies/preview-summary`. Nothing here composes one.
 *
 * Not in this round: balances, accrual, applying for leave, approvals.
 */

export type LeaveBasis = 'PER_YEAR' | 'PER_EVENT' | 'UNLIMITED_UNPAID';
export type LeaveAccrual = 'UPFRONT' | 'MONTHLY' | 'PER_DAYS_WORKED' | 'ON_REQUEST' | 'EARNED_BY_WORK' | 'HALF_YEARLY';

/** One step of a notice that depends on the length of the leave (§23.1). `upToDays` null = anything longer (the last step). */
export interface NoticeTier { upToDays: number | null; days: number }
export type CarryForward = 'NONE' | 'CAPPED' | 'ALL';
export type AppliesTo = 'ANYONE' | 'WOMEN' | 'MEN';

export interface Ref { id: number; name: string; status: string }
export interface LabelRef { id: number; name: string }
export interface Effective { policy: Ref | null; from: 'ROLE' | 'LABEL' | 'LOCATION' | 'COMPANY' | null;
  /** The label it came from (spec §17), when `from` is LABEL: its department's one label. */
  label?: LabelRef | null;
  /** "Office staff — from the role" / "Shop floor — from the label Machine" / "No leave policy" */ line: string }

export interface Rule { id?: number; leaveTypeId: number; leaveTypeCode: string; leaveTypeName: string; isPaid: boolean; sortOrder: number;
  basis: LeaveBasis; days: number | null;
  accrual: LeaveAccrual; daysWorkedPerLeaveDay: number | null;
  prorateOnJoining: boolean; allowedInProbation: boolean; waitDaysAfterJoining: number;
  carryForward: CarryForward; carryForwardCapDays: number | null; encashable: boolean; encashCapDays: number | null;
  maxDaysAtOnce: number | null; minNoticeDays: number; halfDayAllowed: boolean; countDaysOffBetween: boolean;
  proofAfterDays: number | null; appliesTo: AppliesTo; maxTimesInService: number | null;
  expiresAfterDays: number | null; negativeBalanceAllowed: boolean; notes: string | null;
  /** §23.1 — joined after this day of a month: that month does not count (MONTHLY, or when prorating). */
  joiningCutoffDay: number | null;
  /** §23.1 — MONTHLY: a month's credit is given on the first day of the next month. */
  creditInArrears: boolean;
  /** §23.1 — the notice by length; replaces minNoticeDays when set. */
  noticeTiers: NoticeTier[] | null;
  /** §23.1 — leave types that may not be next to this one. */
  notWithLeaveTypeIds: number[];
  /** Written by the server, one or two plain sentences. */
  summary: string }

/** A rule as it is sent: the rule without what only the server writes. */
export type RuleInput = Omit<Rule, 'id' | 'leaveTypeCode' | 'leaveTypeName' | 'isPaid' | 'summary'>;

export interface PolicySummary { id: number; code: string | null; name: string; description: string | null; status: string; yearStartsMonth: number;
  /** §23.1 — 'YYYY-MM-DD': nothing is earned before it. null = from the start. */
  effectiveFrom?: string | null;
  leaveTypes: { code: string; name: string; days: number | null; basis: string }[];
  /** "Casual 12 · Sick 12 · Earned 15 · Maternity · Paternity" */ headline: string;
  usedBy: { company: boolean; locations: number; roles: number; labels?: number; positions: number } }
export interface Policy extends PolicySummary { rules: Rule[] }

export interface LeaveType { id: number; code: string; name: string; unit?: string | null; isPaid: boolean; status: string }

export interface PolicyTemplate { key: string; name: string; description: string; rules: Rule[] }

export interface Assignments {
  company: { policy: Ref | null };
  locations: { locationId: number; name: string; policy: Ref | null; effective: Effective }[];
  /** Every label of the company, in its order (spec §17). positionCount = positions whose policy comes from this label. */
  labels?: AssignmentLabel[];
  /** Only roles WITH an assignment of their own. */
  roles: { roleId: number; title: string; positionCount: number; policy: Ref | null }[];
  unassignedPositions: number;
}

export interface AssignmentLabel { labelId: number; name: string; policy: Ref | null; positionCount: number }

export type AssignmentScope = 'COMPANY' | 'LOCATION' | 'ROLE' | 'LABEL';


export const ruleInputOf = (r: Rule, sortOrder: number): RuleInput => ({
  leaveTypeId: r.leaveTypeId, sortOrder,
  basis: r.basis, days: r.days, accrual: r.accrual, daysWorkedPerLeaveDay: r.daysWorkedPerLeaveDay,
  prorateOnJoining: r.prorateOnJoining, allowedInProbation: r.allowedInProbation, waitDaysAfterJoining: r.waitDaysAfterJoining,
  carryForward: r.carryForward, carryForwardCapDays: r.carryForwardCapDays, encashable: r.encashable, encashCapDays: r.encashCapDays,
  maxDaysAtOnce: r.maxDaysAtOnce, minNoticeDays: r.minNoticeDays, halfDayAllowed: r.halfDayAllowed, countDaysOffBetween: r.countDaysOffBetween,
  proofAfterDays: r.proofAfterDays, appliesTo: r.appliesTo, maxTimesInService: r.maxTimesInService,
  expiresAfterDays: r.expiresAfterDays, negativeBalanceAllowed: r.negativeBalanceAllowed, notes: r.notes,
  joiningCutoffDay: r.joiningCutoffDay ?? null, creditInArrears: r.creditInArrears ?? false,
  noticeTiers: r.noticeTiers?.length ? r.noticeTiers : null, notWithLeaveTypeIds: r.notWithLeaveTypeIds ?? [],
});

/** A rule for a leave type just added to a policy: a number of days a year, all at the start, lapsing. */
export const blankRule = (t: LeaveType, sortOrder: number): Rule => ({
  leaveTypeId: t.id, leaveTypeCode: t.code, leaveTypeName: t.name, isPaid: t.isPaid, sortOrder,
  basis: t.isPaid ? 'PER_YEAR' : 'UNLIMITED_UNPAID', days: null, accrual: t.isPaid ? 'UPFRONT' : 'ON_REQUEST', daysWorkedPerLeaveDay: null,
  prorateOnJoining: false, allowedInProbation: true, waitDaysAfterJoining: 0,
  carryForward: 'NONE', carryForwardCapDays: null, encashable: false, encashCapDays: null,
  maxDaysAtOnce: null, minNoticeDays: 0, halfDayAllowed: false, countDaysOffBetween: false,
  proofAfterDays: null, appliesTo: 'ANYONE', maxTimesInService: null,
  expiresAfterDays: null, negativeBalanceAllowed: false, notes: null,
  joiningCutoffDay: null, creditInArrears: false, noticeTiers: null, notWithLeaveTypeIds: [],
  summary: '',
});

export const leaveApi = {
  types: () => api.get<{ types: LeaveType[] }>('/leave/types').then((r) => r.types ?? []),
  createType: (body: { code: string; name: string; unit?: string; isPaid?: boolean; status?: string }) =>
    api.post<{ type: LeaveType }>('/leave/types', body),
  updateType: (id: number, body: Partial<{ code: string; name: string; unit: string; isPaid: boolean; status: string }>) =>
    api.put<{ type: LeaveType }>(`/leave/types/${id}`, body),
  /** 409 IN_USE when a policy uses it. */
  removeType: (id: number) => api.del<unknown>(`/leave/types/${id}`),

  policies: () => api.get<{ policies: PolicySummary[] }>('/leave/policies').then((r) => r.policies ?? []),
  policy: (id: number) => api.get<{ policy: Policy }>(`/leave/policies/${id}`).then((r) => r.policy),
  /** Rules are filled from the starting point or the copied policy; leave types it needs are created. */
  createPolicy: (body: { name: string; code?: string; description?: string; yearStartsMonth?: number; fromTemplate?: string; copyOf?: number }) =>
    api.post<{ policy: Policy }>('/leave/policies', body).then((r) => r.policy),
  /** `rules`, when sent, REPLACES the policy's rule set. 422 INVALID with problems[] per rule. */
  updatePolicy: (id: number, body: { name?: string; description?: string | null; yearStartsMonth?: number; effectiveFrom?: string | null; status?: string; rules?: RuleInput[] }) =>
    api.put<{ policy: Policy }>(`/leave/policies/${id}`, body).then((r) => r.policy),
  /** 409 IN_USE, saying where it is assigned. */
  removePolicy: (id: number) => api.del<unknown>(`/leave/policies/${id}`),
  templates: () => api.get<{ note: string; templates: PolicyTemplate[] }>('/leave/policy-templates'),
  /** The sentence for a rule as it stands on the screen, and what is wrong with it. Saves nothing. */
  previewSummary: (rule: RuleInput) =>
    api.post<{ summary: string; problems: string[] }>('/leave/policies/preview-summary', { rule }),

  assignments: () => api.get<Assignments>('/leave/assignments'),
  /** `policyId: null` removes the assignment at that level. */
  assign: (body: { scope: AssignmentScope; locationId?: number; roleId?: number; labelId?: number; policyId: number | null }) =>
    api.put<{ assignments: Assignments }>('/leave/assignments', body).then((r) => r.assignments),
  policyFor: (q: { positionId?: number; roleId?: number; locationId?: number }) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v != null) p.set(k, String(v));
    return api.get<{ effective: Effective }>(`/leave/policy-for?${p.toString()}`).then((r) => r.effective);
  },
};

export const POLICY_STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft', ACTIVE: 'Active', ARCHIVED: 'Archived' };
export const POLICY_STATUS_TONE: Record<string, 'warning' | 'success' | 'neutral'> = { DRAFT: 'warning', ACTIVE: 'success', ARCHIVED: 'neutral' };

/** "Used by: company default · 1 location · 3 roles · 140 positions" */
export function usedByLine(u: PolicySummary['usedBy'] | undefined): string {
  if (!u) return 'Not applied anywhere yet';
  const bits = [
    u.company ? 'company default' : null,
    u.locations ? `${u.locations} location${u.locations === 1 ? '' : 's'}` : null,
    u.labels ? `${u.labels} label${u.labels === 1 ? '' : 's'}` : null,
    u.roles ? `${u.roles} role${u.roles === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  if (!bits.length) return 'Not applied anywhere yet';
  return `Used by: ${bits.join(' · ')} · ${u.positions} position${u.positions === 1 ? '' : 's'}`;
}
