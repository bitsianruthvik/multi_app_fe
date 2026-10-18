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
  /** The backend's `detail` object, when it sent one (e.g. which cards a planner save refused). */
  detail?: unknown;

  constructor(status: number, message: string, code?: string, problems: string[] = [], detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.problems = problems;
    this.detail = detail;
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
    if (!text.includes('timed out')) return new CfApiError(0, 'Could not reach the server. It may be restarting — try again in a few seconds.');
    return new CfApiError(0, method === 'GET' ? TIMED_OUT_READ : TIMED_OUT_WRITE, 'TIMED_OUT');
  }
  const status = Number(m[1]);
  try {
    const body = JSON.parse(m[2]);
    return new CfApiError(status, body.message ?? 'Something went wrong.', body.code, Array.isArray(body.problems) ? body.problems : [], body.detail);
  } catch {
    return new CfApiError(status, status === 403 ? 'You do not have permission for this.' : 'Something went wrong.');
  }
}

/** The company slug from the URL (/:company/cf_erp/...). The backend takes the company from the token. */
function base(): string {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return `/api/${company}/cf_erp`;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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
  responseType?: 'json' | 'blob';
}

/**
 * A READ THAT FAILED FOR A MOMENT IS ASKED AGAIN, ONCE (2026-10-18). On production a read could
 * meet a database connection the server had just closed ("Record payment" opened on "Something
 * went wrong" and worked on the second click), or the instance being replaced ("Could not reach the
 * server"). A GET changes nothing, so it is sent once more after a short pause before the screen
 * hears of it; a write is never repeated here (it may have landed). A timeout is not retried — the
 * server was there, just slow, and a second wait would double it. A plain 500 is NOT retried: the
 * server answered, and a read is not always without effect. The database hang-up comes as a 503
 * DB_CONNECTION_LOST since the backend's fix (lib/errors.translateDbError), and that is retried.
 */
export const GET_RETRY_DELAY_MS = 800;
export function isRetryableRead(method: Method, e: CfApiError): boolean {
  if (method !== 'GET' || e.code === 'TIMED_OUT') return false;
  return e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504;
}

async function call<T>(method: Method, path: string, body?: unknown, opts: CallOptions = {}): Promise<T> {
  const once = () => apiFetch<T>(`${base()}${path}`, {
    method,
    body,
    ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
    ...(opts.responseType ? { responseType: opts.responseType } : {}),
  });
  try {
    return await once();
  } catch (err) {
    const first = toCfError(err, method);
    if (!isRetryableRead(method, first)) throw first;
    await new Promise((r) => setTimeout(r, GET_RETRY_DELAY_MS));
    try {
      return await once();
    } catch (again) {
      throw toCfError(again, method);
    }
  }
}

export const cfApi = {
  get: <T>(path: string, opts?: CallOptions) => call<T>('GET', path, undefined, opts),
  getBlob: (path: string, opts?: CallOptions) => call<Blob>('GET', path, undefined, { ...opts, responseType: 'blob' }),
  post: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('POST', path, body ?? {}, opts),
  put: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('PUT', path, body ?? {}, opts),
  patch: <T>(path: string, body?: unknown, opts?: CallOptions) => call<T>('PATCH', path, body ?? {}, opts),
  del: <T>(path: string, opts?: CallOptions) => call<T>('DELETE', path, undefined, opts),
  /** A DELETE that carries a body (a plate change's reason, init.sql §62). */
  delWith: <T>(path: string, body: unknown, opts?: CallOptions) => call<T>('DELETE', path, body ?? {}, opts),
};

/** Query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
