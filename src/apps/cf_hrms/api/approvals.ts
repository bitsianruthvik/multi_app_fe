import { useEffect, useSyncExternalStore } from 'react';
import { api } from './client';
import type { LeaveRequest, Person, RequestWithContext } from './leaveRequests';

/**
 * Approvals — everything waiting for the signed-in login to decide
 * (CF_HRMS_HIRING_SPEC.md §22.5, §22.6).
 *
 * ONE LIST, MANY KINDS. Today only leave asks for a decision (`kind: 'LEAVE'`).
 * The item shape is kind-neutral on purpose, and the screen draws one row
 * component for all of them with a `kind` switch for the icon and the sheet,
 * so the next kind (a regularisation, an expense) joins by adding a case, not a
 * screen.
 */

export type ApprovalKind = 'LEAVE';

export interface ApprovalItem {
  kind: ApprovalKind;
  id: number;
  person: Person;
  /** "Casual leave · 3 days" */
  title: string;
  /** "12–15 Oct" */
  when: string;
  submittedAt: string | null;
  waitingDays: number;
  /** Short NOTE / BLOCK texts. */
  flags: string[];
  status: string;
}

export interface ApprovalList {
  items: ApprovalItem[];
  counts: { pending: number };
}

export const approvalsApi = {
  list: (status: 'PENDING' | 'DECIDED') => api.get<ApprovalList>(`/user/me/approvals?status=${status}`),
  leave: (id: number) => api.get<RequestWithContext>(`/user/me/approvals/leave/${id}`),
  approveLeave: (id: number, note?: string) =>
    api.post<{ request: LeaveRequest }>(`/user/me/approvals/leave/${id}/approve`, { note: note || undefined }).then((r) => r.request),
  /** The note is required. */
  rejectLeave: (id: number, note: string) =>
    api.post<{ request: LeaveRequest }>(`/user/me/approvals/leave/${id}/reject`, { note }).then((r) => r.request),
};

/* ── the waiting count: one read shared by the nav, Home and the page ─── */

let pending: number | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(n: number | null) {
  if (n === pending) return;
  pending = n;
  for (const l of listeners) l();
}

/** Re-reads how many approvals wait. Advisory: a failure leaves the last answer. */
export function refreshPendingApprovals(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = approvalsApi
    .list('PENDING')
    .then((r) => publish(r.counts?.pending ?? r.items.length))
    .catch(() => {
      if (pending == null) publish(0);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Tell every reader the count right away (the Approvals page has just loaded it). */
export function setPendingApprovals(n: number) {
  publish(n);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const read = () => pending;

/**
 * The number of approvals waiting for this login, or null before the first
 * answer. `enabled` false = this login cannot have any (no self view, no leave
 * edit), and nothing is asked.
 */
export function usePendingApprovals(enabled: boolean): number | null {
  const n = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (enabled) void refreshPendingApprovals();
  }, [enabled]);
  return enabled ? n : null;
}
