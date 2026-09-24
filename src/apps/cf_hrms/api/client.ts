import { apiFetch } from '@core/api/client';

/**
 * cf_hrms API access. Every request goes through the platform's apiFetch — the
 * one sanctioned path for base URL, token and cookies.
 *
 * apiFetch reports failures as text ("API request failed: 422 … - {json}"), so
 * this wrapper turns that back into structure. The backend answers a bad write
 * with a `problems` array: every issue at once, in words. That list is the
 * whole point of its validation, and it has to survive the trip to the form.
 *
 * Errors are thrown as plain `Error` with `problems` attached, so the kit's
 * `errorMessage` / `ErrorNotice` (which know nothing about any app) render them
 * without cf_hrms needing its own error class. See DESIGN_SYSTEM.md §7.
 */
export interface ApiProblem extends Error {
  status: number;
  code?: string;
  problems: string[];
}

function toApiError(err: unknown): ApiProblem {
  const text = err instanceof Error ? err.message : String(err);
  const m = /^API request failed: (\d{3})[^-]*- ([\s\S]*)$/.exec(text);
  const make = (status: number, message: string, code?: string, problems: string[] = []) => {
    const e = new Error(message) as ApiProblem;
    e.status = status;
    e.code = code;
    e.problems = problems;
    return e;
  };
  if (!m) {
    return make(
      0,
      text.includes('timed out')
        ? 'The server took too long to answer.'
        : 'Could not reach the server.',
    );
  }
  const status = Number(m[1]);
  try {
    const body = JSON.parse(m[2]);
    return make(
      status,
      body.message ?? 'Something went wrong.',
      body.code,
      Array.isArray(body.problems) ? body.problems : [],
    );
  } catch {
    return make(
      status,
      status === 403 ? 'You do not have permission for this.' : 'Something went wrong.',
    );
  }
}

/** The company slug from the URL. The backend takes the company from the token, never from here. */
function base(): string {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return `/api/${company}/cf_hrms`;
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  try {
    return await apiFetch<T>(`${base()}${path}`, { method, body });
  } catch (err) {
    throw toApiError(err);
  }
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body?: unknown) => call<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => call<T>('PUT', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
};

/**
 * Nav badge counts. Advisory by contract: if this fails the shell renders no
 * badges rather than an error, so a slow count never blocks navigation.
 */
export async function fetchNavCounts(): Promise<Record<string, number>> {
  try {
    return await api.get<Record<string, number>>('/overview/nav-counts');
  } catch {
    return {};
  }
}
