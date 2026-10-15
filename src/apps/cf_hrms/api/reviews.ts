import { api } from './client';
import type { Band, BasedOn, Bands, CombineRule, Direction, Frequency, PlanStatus, RatingStep } from './performance';

/**
 * Check-ins, reviews and action items — the client side of CF_HRMS_HIRING_SPEC.md §20.
 *
 *   CHECK_IN   for one slot of a plan (a month, usually); opened by HR or the manager
 *   FINAL      one per active plan, made by the app when the period's last month begins;
 *              due a few days after the period ends (Performance settings)
 *
 *   OPEN → EMPLOYEE_DONE (the person has written their part) → DONE (the manager closed it)
 *   A check-in may be cancelled. A DONE review is read-only except for the Owner, with a reason.
 *
 * The person writes only their comment and blockers, on their own open review, and marks
 * their own actions done — the server checks each field. Every sentence is the server's.
 */

export type ReviewKind = 'CHECK_IN' | 'FINAL';
export type ReviewStatus = 'OPEN' | 'EMPLOYEE_DONE' | 'DONE' | 'CANCELLED';
export type ReviewState = 'DUE' | 'OVERDUE' | 'DONE' | 'CANCELLED';
export type ActionStatus = 'OPEN' | 'DONE' | 'DROPPED';

export interface ReviewCan {
  /** The person: write their comment and blockers; say their part is done. */ writeOwn: boolean; finishOwn: boolean;
  /** HR / the manager. */ writeManager: boolean; rate: boolean; close: boolean; cancel: boolean;
  /** The Owner, on a DONE review, with a reason. */ amend: boolean;
  addAction: boolean;
}
export interface Review {
  id: number; kind: ReviewKind; kindLabel: string; status: ReviewStatus; statusLabel: string;
  state: ReviewState; stateLabel: string; dueDate: string; overdue: boolean; daysOverdue: number;
  slot: { start: string; end: string; name: string } | null;
  /** "Final review · Q3 2026-27", "Check-in · Oct 2026". */ title: string;
  planId: number; planStatus: PlanStatus;
  period: { id: number; name: string; frequency: Frequency; start: string; end: string; status: string };
  periodId: number; periodName: string;
  employee: { id: number; name: string; employeeCode: string | null };
  employeeId: number; employeeName: string; employeeCode: string | null;
  positionId: number | null; positionCode: string | null; positionTitle: string | null;
  roleId: number | null; roleTitle: string | null; departmentId: number | null; departmentName: string | null;
  managerPositionId: number | null; managerPositionCode: string | null; managerPositionTitle: string | null; managerName: string | null;
  employeeComment: string | null; blockers: string | null; managerComment: string | null;
  rating: RatingStep | null; ratingValue: number | null;
  /** Who opened it; null = made by the app (a final review). */ openedBy: string | null;
  employeeDoneAt: string | null; closedAt: string | null; closedBy: string | null;
  cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null;
  amendedAt: string | null; amendedBy: string | null; amendReason: string | null;
  openActions: number; createdAt: string;
  can?: ReviewCan;
}
export interface ReviewList {
  items: Review[]; total?: number; count?: number;
  periods: Review['period'][];
  managers: { id: number; code: string | null; title: string | null; name: string | null }[];
  counts: { due: number; overdue: number; done: number };
  /** Manager login: how many people are below them. */ people?: number;
}
/** One row of a review's KPI table — scoring.js's numbers, as on the plan page. */
export interface ReviewKpiRow {
  kpiId: number; kraId: number | null; kraName: string | null; name: string; unit: string | null; direction: Direction;
  targetNumber: number | null; targetText: string | null; target: string;
  combine: CombineRule; combineLabel: string;
  /** A number, or for words "2 of 3 met". */ actual: number | string | null; combinedTarget: number | null;
  achievement: number | null; band: Band; bandLabel: string; counted: number; slotCount: number;
  /** SLOT: the check-in's own slot. PERIOD: the whole period so far. */ scope: 'SLOT' | 'PERIOD';
}
export interface Action {
  id: number; planId: number; reviewId: number | null; review: { id: number; kind: ReviewKind; label: string } | null;
  text: string;
  owner: { employeeId: number; name: string; employeeCode: string | null; isThePerson: boolean };
  ownerEmployeeId: number; ownerName: string;
  dueDate: string; overdue: boolean; daysOverdue: number;
  status: ActionStatus; statusLabel: string; state: 'OPEN' | 'OVERDUE' | 'DONE' | 'DROPPED';
  doneOn: string | null; note: string | null; closedAt: string | null; closedBy: string | null; createdBy: string | null; createdAt: string;
  employee: { id: number; name: string; employeeCode: string | null };
  employeeId: number; employeeName: string; employeeCode: string | null;
  periodId: number; periodName: string; positionCode: string | null; positionTitle: string | null;
  departmentId: number | null; departmentName: string | null; managerPositionId: number | null; planStatus: PlanStatus;
  can?: { done: boolean; edit: boolean; drop: boolean };
}
export interface ActionList { items: Action[]; total?: number; count?: number; owners: { id: number; name: string }[]; counts: { open: number; overdue: number } }
export interface ReviewPage {
  review: Review & { can: ReviewCan };
  kpis: ReviewKpiRow[];
  kras: { id: number; name: string; weightPercent: number | null; score: number | null; band: Band }[];
  planScore: { score: number | null; band: Band; bandLabel: string; basedOn: BasedOn; scoreLine: string | null };
  tableLine: string;
  ratingScale: RatingStep[];
  bands: Bands;
  actions: Action[];
}
export interface OwnerOption { employeeId: number; name: string; employeeCode: string | null; relation: 'PERSON' | 'MANAGER' | 'YOU'; label: string }
export interface PlanReviews {
  plan: { id: number; status: PlanStatus; employeeId: number; period: { id: number; name: string; start: string; end: string } };
  reviews: Review[];
  actions: Action[];
  /** The slots a check-in may be for. */ slots: { start: string; end: string; name: string; whole: boolean; open: boolean; hasCheckIn: boolean }[];
  owners: OwnerOption[];
  /** The day the plan's final review is made. */ finalOpensOn: string;
  can: { openCheckIn: boolean; addAction: boolean };
  line: string | null;
}
export interface MyReviews { linked: boolean; line: string | null; reviews: Review[]; actions: Action[] }
export interface ReviewSummary {
  employeeId: number;
  latestRating: { reviewId: number; value: number; label: string; periodName: string; closedAt: string | null } | null;
  openActions: number; overdueActions: number;
}
export interface ManagerPart { managerComment?: string | null; rating?: number | null; reason?: string }
export interface ActionInput { text?: string; ownerEmployeeId?: number; dueDate?: string; reviewId?: number | null; note?: string | null }

const withQuery = (search: string) => (search && !search.startsWith('?') ? `?${search}` : search);

/** What a review / plan screen calls, by login. Missing = not offered to that login. */
export interface ReviewSource {
  review: (id: number) => Promise<ReviewPage>;
  writeManager?: (id: number, body: ManagerPart) => Promise<unknown>;
  close?: (id: number, body: ManagerPart) => Promise<unknown>;
  cancel?: (id: number, reason?: string) => Promise<unknown>;
  writeOwn?: (id: number, body: { employeeComment?: string | null; blockers?: string | null }) => Promise<unknown>;
  finishOwn?: (id: number) => Promise<unknown>;
  planReviews?: (planId: number) => Promise<PlanReviews>;
  openCheckIn?: (planId: number, slot: { slotStart: string; slotEnd: string }) => Promise<{ id: number }>;
  addAction?: (planId: number, body: ActionInput) => Promise<{ id: number }>;
  changeAction?: (id: number, body: ActionInput) => Promise<unknown>;
  actionDone?: (id: number, note?: string) => Promise<unknown>;
  dropAction?: (id: number, note: string) => Promise<unknown>;
  /** Where a review opens, from this login's screens. */
  reviewPath: (company: string, id: number) => string;
}

/** HR routes (`/performance/…`). */
export const reviewApi = {
  list: (search: string) => api.get<ReviewList>(`/performance/reviews${withQuery(search)}`),
  review: (id: number) => api.get<ReviewPage>(`/performance/reviews/${id}`),
  writeManager: (id: number, body: ManagerPart) => api.put<{ ok: true; amended: boolean }>(`/performance/reviews/${id}`, body),
  close: (id: number, body: ManagerPart) => api.post<{ ok: true }>(`/performance/reviews/${id}/close`, body),
  cancel: (id: number, reason?: string) => api.post<{ ok: true }>(`/performance/reviews/${id}/cancel`, { reason }),
  planReviews: (planId: number) => api.get<PlanReviews>(`/performance/plans/${planId}/reviews`),
  openCheckIn: (planId: number, slot: { slotStart: string; slotEnd: string }) => api.post<{ id: number }>(`/performance/plans/${planId}/check-ins`, slot),
  actions: (search: string) => api.get<ActionList>(`/performance/actions${withQuery(search)}`),
  addAction: (planId: number, body: ActionInput) => api.post<{ id: number }>(`/performance/plans/${planId}/actions`, body),
  changeAction: (id: number, body: ActionInput) => api.put<{ ok: true }>(`/performance/actions/${id}`, body),
  actionDone: (id: number, note?: string) => api.post<{ ok: true }>(`/performance/actions/${id}/done`, note ? { note } : {}),
  dropAction: (id: number, note: string) => api.post<{ ok: true }>(`/performance/actions/${id}/drop`, { note }),
  summary: (employeeId: number) => api.get<ReviewSummary>(`/performance/employees/${employeeId}/review-summary`),
  reviewPath: (company: string, id: number) => `/${company}/cf_hrms/reviews/${id}`,
};

/** A manager login, for the people below them (`/user/me/team/…`). Never their own review. */
export const teamReviewApi = {
  list: () => api.get<ReviewList>('/user/me/team/reviews'),
  review: (id: number) => api.get<ReviewPage>(`/user/me/team/reviews/${id}`),
  writeManager: (id: number, body: ManagerPart) => api.put<{ ok: true }>(`/user/me/team/reviews/${id}`, body),
  close: (id: number, body: ManagerPart) => api.post<{ ok: true }>(`/user/me/team/reviews/${id}/close`, body),
  cancel: (id: number, reason?: string) => api.post<{ ok: true }>(`/user/me/team/reviews/${id}/cancel`, { reason }),
  planReviews: (planId: number) => api.get<PlanReviews>(`/user/me/team/plans/${planId}/reviews`),
  openCheckIn: (planId: number, slot: { slotStart: string; slotEnd: string }) => api.post<{ id: number }>(`/user/me/team/plans/${planId}/check-ins`, slot),
  addAction: (planId: number, body: ActionInput) => api.post<{ id: number }>(`/user/me/team/plans/${planId}/actions`, body),
  changeAction: (id: number, body: ActionInput) => api.put<{ ok: true }>(`/user/me/team/actions/${id}`, body),
  actionDone: (id: number, note?: string) => api.post<{ ok: true }>(`/user/me/team/actions/${id}/done`, note ? { note } : {}),
  dropAction: (id: number, note: string) => api.post<{ ok: true }>(`/user/me/team/actions/${id}/drop`, { note }),
  reviewPath: (company: string, id: number) => `/${company}/cf_hrms/my-place/team-reviews/${id}`,
};

/** The person themselves (`/user/me/…`): their reviews and the actions they own. */
export const myReviewApi = {
  mine: () => api.get<MyReviews>('/user/me/reviews'),
  review: (id: number) => api.get<ReviewPage>(`/user/me/reviews/${id}`),
  writeOwn: (id: number, body: { employeeComment?: string | null; blockers?: string | null }) => api.put<{ ok: true }>(`/user/me/reviews/${id}`, body),
  finishOwn: (id: number) => api.post<{ ok: true }>(`/user/me/reviews/${id}/done`, {}),
  actionDone: (id: number, note?: string) => api.post<{ ok: true }>(`/user/me/actions/${id}/done`, note ? { note } : {}),
  reviewPath: (company: string, id: number) => `/${company}/cf_hrms/my-place/reviews/${id}`,
};

export const REVIEW_SOURCES: Record<'hr' | 'team' | 'self', ReviewSource> = {
  hr: reviewApi,
  team: teamReviewApi,
  self: { review: myReviewApi.review, writeOwn: myReviewApi.writeOwn, finishOwn: myReviewApi.finishOwn, actionDone: myReviewApi.actionDone, reviewPath: myReviewApi.reviewPath },
};
