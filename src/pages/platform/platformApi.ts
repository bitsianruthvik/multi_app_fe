import { apiFetch } from '@core/api/client';

/**
 * The product team's compliance console (CF_HRMS_HIRING_SPEC.md §36.4) — backend
 * apps/cf_hrms/routes/platform.js at /api/platform/compliance. Outside any company: the backend lets
 * in only a login listed in platform_admins (with the same email); everybody else gets 403.
 */
export interface PlatformError extends Error { status: number; code?: string; problems: string[] }

function toError(err: unknown): PlatformError {
  const text = err instanceof Error ? err.message : String(err);
  const m = /^API request failed: (\d{3})[^-]*- ([\s\S]*)$/.exec(text);
  const e = new Error('Could not reach the server.') as PlatformError;
  e.status = 0; e.problems = [];
  if (!m) return e;
  e.status = Number(m[1]);
  try {
    const body = JSON.parse(m[2]);
    e.message = body.message ?? 'Something went wrong.';
    e.code = body.code;
    e.problems = Array.isArray(body.problems) ? body.problems : [];
  } catch {
    e.message = e.status === 403 ? 'This console is for the product team.' : 'Something went wrong.';
  }
  return e;
}

async function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  try {
    return await apiFetch<T>(`/api/platform/compliance${path}`, { method, body, timeout: 60000 });
  } catch (err) {
    throw toError(err);
  }
}

export interface Source {
  id: number; code: string; name: string; url: string; kind: 'html_list' | 'rss' | 'pdf_index'; frequencyHours: number;
  domains: string[]; jurisdictions: string[]; linkPattern: string | null; watchText: boolean; alsoSites: string | null; note: string | null; active: boolean;
  lastCheckedAt: string | null; lastOkAt: string | null; lastChangeAt: string | null; lastStatus: 'NEVER' | 'OK' | 'CHANGED' | 'ERROR' | 'BLOCKED';
  lastError: string | null; failCount: number; itemCount: number; nextCheckAt: string | null;
}
export interface Notice {
  id: number; sourceId: number; source: { id: number; code: string; name: string; domains: string[]; jurisdictions: string[] } | null;
  changeKind: 'NEW' | 'CHANGED'; title: string; url: string; itemDate: string | null; foundAt: string; status: 'NEW' | 'OPEN' | 'LINKED' | 'PUBLISHED' | 'DISMISSED';
  summary: string | null; domain: string | null; jurisdiction: string | null; ruleKey: string | null; ruleVersionId: string | null;
  reviewer: string | null; openedAt: string | null; linkedAt: string | null; dismissedReason: string | null; dismissedAt: string | null; publicationId: number | null;
}
export interface Publication {
  id: number; noticeId: number | null; domain: string; jurisdiction: string; ruleKey: string; ruleVersionId: string | null; versionLabel: string | null;
  title: string; summary: string | null; effectiveFrom: string; sourceUrl: string | null; via: 'LAW_LAYER' | 'ADAPTER'; publishedBy: string | null;
  publishedAt: string; companiesNotified: number; acknowledged: number;
}
export interface LawStatus { connected: boolean; present: boolean; missing: string[]; runSnapshot: boolean; error: string | null }
export interface RuleRef { domain: string; jurisdiction: string; ruleKey: string; versions: number }

export const platformApi = {
  me: () => call<{ admin: { id: number; name: string; email: string }; lawLayer: LawStatus }>('GET', '/me'),
  sources: () => call<{ sources: Source[]; kinds: string[]; domains: string[] }>('GET', '/sources'),
  addSource: (b: Partial<Source>) => call<{ source: Source }>('POST', '/sources', b),
  updateSource: (id: number, b: Partial<Source>) => call<{ source: Source }>('PUT', `/sources/${id}`, b),
  check: (id: number) => call<{ result: { status?: string; skipped?: boolean; reason?: string; error?: string; found?: { new: number; changed: number }; items?: number; note?: string }; source: Source }>('POST', `/sources/${id}/check`),
  notices: (status: string) => call<{ notices: Notice[]; counts: Record<string, number> }>('GET', `/notices?status=${status}`),
  open: (id: number) => call<{ notice: Notice }>('POST', `/notices/${id}/open`),
  link: (id: number, b: { domain: string; jurisdiction: string; ruleKey: string }) => call<{ notice: Notice }>('POST', `/notices/${id}/link`, b),
  draft: (id: number, b: Record<string, unknown>) => call<{ notice: Notice; draft: { id: string | number; status: string; version: number } | null; message?: string; lawLayer: LawStatus }>('POST', `/notices/${id}/draft`, b),
  publish: (id: number, b: Record<string, unknown>) => call<{ notice: Notice; publicationId: number; notified: { companyId: number; affected: boolean; emails: number }[] }>('POST', `/notices/${id}/publish`, b),
  dismiss: (id: number, reason: string) => call<{ notice: Notice }>('POST', `/notices/${id}/dismiss`, { reason }),
  rules: () => call<{ rules: RuleRef[]; lawLayer: LawStatus }>('GET', '/rules'),
  publications: () => call<{ publications: Publication[] }>('GET', '/publications'),
};
