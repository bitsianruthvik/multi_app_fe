import { apiFetch } from '@core/api/client';

/**
 * cf_erp API access. Every request still goes through the platform's
 * apiFetch (the one sanctioned path: base URL, token, cookies). apiFetch
 * reports failures as text — "API request failed: 422 … - {json}" — so this
 * wrapper turns that back into a structured error, because the backend's
 * `problems` list is the whole point of its validation: every issue at once,
 * in words, shown next to the form.
 */
export class CfApiError extends Error {
  status: number;
  code?: string;
  problems: string[];

  constructor(status: number, message: string, code?: string, problems: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.problems = problems;
  }
}

/*
 * A WRITE THAT TIMES OUT MAY STILL FINISH. The browser gives up; the server does
 * not — the request runs on in its transaction and commits. "The server took too
 * long" read as "nothing happened", so people pressed the button again and got
 * two of everything (2026-09-26: an order line added twice, 62 temporary items
 * each). A timed-out write says so, and says to reload first.
 */
const TIMED_OUT_READ = 'The server took too long to answer.';
const TIMED_OUT_WRITE = 'The server took too long to answer. It may still finish — reload before trying again.';

function toCfError(err: unknown, method: Method = 'GET'): CfApiError {
  const text = err instanceof Error ? err.message : String(err);
  const m = /^API request failed: (\d{3})[^-]*- ([\s\S]*)$/.exec(text);
  if (!m) {
    if (!text.includes('timed out')) return new CfApiError(0, 'Could not reach the server.');
    return new CfApiError(0, method === 'GET' ? TIMED_OUT_READ : TIMED_OUT_WRITE, 'TIMED_OUT');
  }
  const status = Number(m[1]);
  try {
    const body = JSON.parse(m[2]);
    return new CfApiError(status, body.message ?? 'Something went wrong.', body.code, Array.isArray(body.problems) ? body.problems : []);
  } catch {
    return new CfApiError(status, status === 403 ? 'You do not have permission for this.' : 'Something went wrong.');
  }
}

/** The company slug from the URL (/:company/cf_erp/...). The backend takes the company from the token. */
function base(): string {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return `/api/${company}/cf_erp`;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * How long a write that builds a whole structure may take: putting a template on
 * an order copies its Template BOM beneath it, and edit mode can paste a girder
 * line. On production every database round trip is ~49 ms away, so these can
 * run past the platform's 30 s default — and a request abandoned there still
 * commits. Pass it as `{ timeoutMs: LONG_WRITE_MS }`.
 */
export const LONG_WRITE_MS = 5 * 60 * 1000;

export interface CallOptions {
  /** Wait this long before giving up; the platform default is 30 s. */
  timeoutMs?: number;
}

async function call<T>(method: Method, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
  try {
    return await apiFetch<T>(`${base()}${path}`, { method, body, ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}) });
  } catch (err) {
    throw toCfError(err, method);
  }
}

export const cfApi = {
  get: <T>(path: string, opts?: CallOptions) => call<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('POST', path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('PUT', path, body ?? {}, opts),
  del: <T>(path: string, opts?: CallOptions) => call<T>('DELETE', path, undefined, opts),
};

/** Query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
