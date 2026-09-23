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

function toCfError(err: unknown): CfApiError {
  const text = err instanceof Error ? err.message : String(err);
  const m = /^API request failed: (\d{3})[^-]*- ([\s\S]*)$/.exec(text);
  if (!m) return new CfApiError(0, text.includes('timed out') ? 'The server took too long to answer.' : 'Could not reach the server.');
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

async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  try {
    return await apiFetch<T>(`${base()}${path}`, { method, body });
  } catch (err) {
    throw toCfError(err);
  }
}

export const cfApi = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => call<T>('PUT', path, body ?? {}),
  del: <T>(path: string) => call<T>('DELETE', path),
};

/** Query string from an object, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
