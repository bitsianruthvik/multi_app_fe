import { api } from './client';

/**
 * Compliance — a company's side (CF_HRMS_HIRING_SPEC.md §36.4, §36.5; backend routes/compliance.js):
 * law changes published by the product team and what they mean here, acknowledging them, the deadline
 * calendar, and the CA's review (rule sets, comments, what changed, the calculation trace, sign-off, the
 * review pack). The product team's own console is src/pages/platform (not this app).
 */

export interface Impact {
  affected: boolean;
  people: number;
  structures: number;
  policies: number;
  lines: string[];
  inForce: number;
  proposals: { title: string; kind?: string }[];
}

export interface ComplianceNotification {
  id: number;
  kind: 'LAW_CHANGE' | 'DEADLINE';
  publicationId: number | null;
  deadlineKey: string | null;
  dueDate: string | null;
  title: string;
  body: string;
  impact: Impact | null;
  status: 'OPEN' | 'ACKNOWLEDGED';
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  ackNote: string | null;
  createdAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  domain: string | null;
  jurisdiction: string | null;
}

export interface Deadline {
  key: string;
  kind: 'TDS_DEPOSIT' | 'TDS_RETURN' | 'FORM16' | 'PF' | 'ESI' | 'PT' | 'MIN_WAGE' | 'TAX_YEAR';
  period: string;
  title: string;
  dueDate: string;
  source: string;
  link: string;
  status: 'DONE' | 'OVERDUE' | 'DUE_SOON' | 'UPCOMING';
  doneAt: string | null;
  doneBy: string | null;
  doneNote: string | null;
  daysLeft: number;
}

export interface RuleSetSummary {
  set: string;
  label: string;
  rules: number;
  unverified: number;
  status: 'PENDING' | 'APPROVED' | 'QUESTIONED';
  decidedStatus: string | null;
  changedSinceDecision: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  comments: number;
  via: 'LAW_LAYER' | 'ADAPTER';
}

export interface ReviewRule {
  id: string | number;
  ruleKey: string;
  value: unknown;
  valueWords: string;
  effectiveFrom: string | null;
  version: number | null;
  sourceUrl: string | null;
  sourceNote: string | null;
  verified: boolean;
  examples: unknown;
  regime: string | null;
}

export interface ReviewComment {
  id: number;
  action: 'COMMENT' | 'APPROVE' | 'QUESTION';
  body: string | null;
  ruleKey: string | null;
  by: string;
  at: string;
}

export interface RuleSetDetail extends RuleSetSummary {
  ruleList: ReviewRule[];
  commentList: ReviewComment[];
}

export interface Changes {
  lastSignoff: { year: string; by: string; at: string; note: string | null } | null;
  publications: { id: number; title: string; domain: string; jurisdiction: string; ruleKey: string; effectiveFrom: string; publishedAt: string; sourceUrl: string | null; summary: string | null }[];
  changedSets: { set: string; label: string; status: string; isNew: boolean }[];
  openQuestions: { set: string; label: string; body: string; by: string; at: string }[];
}

export interface TraceLine {
  code: string;
  name: string;
  kind: string;
  amount: number;
  fullAmount: number | null;
  basis: string | null;
  source: string;
  forMonth: string | null;
  rule: { id?: string | number; ruleKey?: string; version?: number; domain?: string; jurisdiction?: string; effectiveFrom?: string; sourceUrl?: string | null; verified?: boolean; missing?: string } | null;
}

export interface Trace {
  run: { id: number; month: string; status: string };
  person: { employeeId: number; code: string; name: string; state: string | null; structure: string | null; payableDays: number; lopDays: number; gross: number; deductions: number; net: number; tds: number };
  basis: 'SNAPSHOT' | 'DERIVED';
  basisWords: string;
  lines: TraceLine[];
  tax: { year: string | null; regime: string | null; engineTds: number | null; projectedTax: number | null } | null;
  /** With a snapshot: the law layer recomputed the run with those versions (nothing written). */
  reproduced: { same?: boolean; runSame?: boolean; differences?: string[]; error?: string } | null;
}

export interface Signoff { id: number; year: string; by: string; at: string; note: string | null; sets: number }
export interface FileAnswer { fileName: string; mimeType: string; contentBase64: string; rules?: number }

export interface BellItem { id: string; kind: string; title: string; when: string | null; link: string }

export const complianceApi = {
  summary: () => api.get<{ openNotices: number; latest: ComplianceNotification[]; due: Deadline[]; overdue: number; canAcknowledge: boolean }>('/compliance/summary'),
  bell: () => api.get<{ count: number; items: BellItem[] }>('/compliance/bell'),
  notifications: (status: 'OPEN' | 'ACKNOWLEDGED' | 'ALL' = 'ALL') =>
    api.get<{ notifications: ComplianceNotification[]; emails: { queued: number; sent: number }; canAcknowledge: boolean }>(`/compliance/notifications?status=${status}`),
  acknowledge: (id: number, note?: string) => api.post<{ notification: ComplianceNotification }>(`/compliance/notifications/${id}/acknowledge`, { note }),
  calendar: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const s = q.toString();
    return api.get<{ from: string; to: string; on: string; states: string[]; deadlines: Deadline[]; canMark: boolean }>(`/compliance/calendar${s ? `?${s}` : ''}`);
  },
  markDone: (key: string, done = true, note?: string) => api.post<{ deadline: Deadline }>('/compliance/calendar/done', { key, done, note }),

  sets: () => api.get<{ on: string; sets: RuleSetSummary[]; lawLayer: { connected: boolean; missing: string[] }; canReview: boolean; canTrace: boolean }>('/compliance/review/sets'),
  set: (set: string) => api.get<{ set: RuleSetDetail; canReview: boolean }>(`/compliance/review/sets/${encodeURIComponent(set)}`),
  comment: (set: string, body: { action: 'COMMENT' | 'APPROVE' | 'QUESTION'; body?: string; ruleKey?: string | null }) =>
    api.post<{ set: RuleSetDetail }>(`/compliance/review/sets/${encodeURIComponent(set)}/comments`, body),
  changes: () => api.get<Changes>('/compliance/review/changes'),
  runs: () => api.get<{ runs: { id: number; month: string; status: string; people: number }[] }>('/compliance/review/runs'),
  people: (runId: number) => api.get<{ people: { runPersonId: number; employeeId: number; code: string; name: string }[] }>(`/compliance/review/runs/${runId}/people`),
  trace: (runId: number, employeeId: number) => api.get<Trace>(`/compliance/review/trace?runId=${runId}&employeeId=${employeeId}`),
  signoffs: () => api.get<{ signoffs: Signoff[]; canSignOff: boolean }>('/compliance/review/signoffs'),
  signOff: (body: { year: string; note?: string; withOpenQuestions?: boolean }) => api.post<{ signoffs: Signoff[]; caNote: string }>('/compliance/review/signoffs', body),
  pack: (format: 'xlsx' | 'pdf') => api.get<FileAnswer>(`/compliance/review/pack?format=${format}`),
};
