/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralized API client for all backend requests.
 * Uses VITE_API_BASE_URL from environment and automatically attaches JWT tokens.
 */

import { getToken } from "@core/auth/session";

const API_BASE_URL =
  import.meta.env.VITE_API_HOST ||
  import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    "VITE_API_BASE_URL is not defined. Please set it in your environment configuration.",
  );
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  responseType?: "json" | "blob";
}

/**
 * Centralized API fetch function.
 * All backend requests MUST go through this function.
 *
 * @param endpoint - API endpoint path (e.g., "/api/users" or "api/users")
 * @param options - Fetch options (method, body, headers, timeout)
 * @returns Promise resolving to the parsed JSON response
 * @throws Error on non-2xx responses or network failures
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    headers: customHeaders = {},
    timeout = 30000,
    responseType = "json",
  } = options;

  // Normalize endpoint to ensure it starts with /
  const normalizedEndpoint = endpoint.startsWith("/")
    ? endpoint
    : `/${endpoint}`;
  const url = `${API_BASE_URL}${normalizedEndpoint}`;

  // Build headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  // The sign-in of the company in the page's address (core/auth/session.ts: one per company)
  const token = getToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: "include", // Send cookies for session-based auth
    });

    clearTimeout(timeoutId);

    // Handle non-2xx responses
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    // Most requests are JSON; downloads opt into the raw workbook bytes.
    const data = responseType === "blob" ? await response.blob() : await response.json();
    return data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Handle abort/timeout errors
    if (error.name === "AbortError") {
      throw new Error(`API request timed out after ${timeout}ms`);
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * A GET whose answer is JSON a line at a time (application/x-ndjson): `onLine` gets each line, parsed, the moment it
 * arrives — so a screen can draw one part of a long answer while the server still works on the rest. Same base URL,
 * token and cookies as apiFetch. Resolves when the answer has ended; rejects on a non-2xx answer, a network failure or
 * the timeout (the lines already handed over stay handed over). A line that is not JSON is skipped.
 */
export async function apiFetchLines(
  endpoint: string,
  onLine: (line: unknown) => void,
  { timeout = 30000 }: { timeout?: number } = {},
): Promise<void> {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const headers: Record<string, string> = {};
  const token = getToken();   // the sign-in of the company in the page's address, as apiFetch
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const take = (text: string) => {
    if (!text.trim()) return;
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return; }
    onLine(parsed);
  };
  try {
    const response = await fetch(`${API_BASE_URL}${normalizedEndpoint}`, {
      method: "GET",
      headers,
      signal: controller.signal,
      credentials: "include",
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    if (!response.body) {
      for (const text of (await response.text()).split("\n")) take(text);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let at = pending.indexOf("\n");
      while (at >= 0) {
        take(pending.slice(0, at));
        pending = pending.slice(at + 1);
        at = pending.indexOf("\n");
      }
    }
    take(pending + decoder.decode());
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`API request timed out after ${timeout}ms`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * GET request helper
 */
export async function apiGet<T = any>(
  endpoint: string,
  options?: Omit<ApiFetchOptions, "method" | "body">,
): Promise<T> {
  return apiFetch<T>(endpoint, { ...options, method: "GET" });
}

/**
 * POST request helper
 */
export async function apiPost<T = any>(
  endpoint: string,
  body?: any,
  options?: Omit<ApiFetchOptions, "method" | "body">,
): Promise<T> {
  return apiFetch<T>(endpoint, { ...options, method: "POST", body });
}

/**
 * PUT request helper
 */
export async function apiPut<T = any>(
  endpoint: string,
  body?: any,
  options?: Omit<ApiFetchOptions, "method" | "body">,
): Promise<T> {
  return apiFetch<T>(endpoint, { ...options, method: "PUT", body });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T = any>(
  endpoint: string,
  options?: Omit<ApiFetchOptions, "method" | "body">,
): Promise<T> {
  return apiFetch<T>(endpoint, { ...options, method: "DELETE" });
}

/**
 * Legacy compatibility: return the base URL for direct URL construction
 * @deprecated Use apiFetch instead of constructing URLs manually
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}
