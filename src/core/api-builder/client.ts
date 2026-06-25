/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { buildSecurityHeaders } from "./security";

// Read the backend API base URL directly from the environment so this
// fetch-based module does not depend on the axios config module.
// Falls back to empty string (not a throw) so individual calls fail with a
// clear network error rather than crashing at module init.
const API_HOST = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type SendOpts = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  query?: string;
  body?: any;
  idempotencyKey?: string;
  timeoutMs?: number;
  maxRetriesOnTimeout?: number;
  token?: string;
};

class TimeoutError extends Error {
  constructor(message?: string) {
    super(message || "timeout");
    this.name = "TimeoutError";
  }
}

export async function send(opts: SendOpts) {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxRetries = opts.maxRetriesOnTimeout ?? 1;
  // Resolve relative API paths to the backend host (dev server vs API host)
  const resolvedBase = opts.url.startsWith("http")
    ? opts.url
    : `${API_HOST}${opts.url.startsWith("/") ? "" : "/"}${opts.url}`;

  const fullUrl = opts.query
    ? `${resolvedBase}${resolvedBase.includes("?") ? "&" : "?"}${opts.query}`
    : resolvedBase;

  let attempt = 0;
  const maxAttempts = 2; // primary + one retry (always against the same backend URL)
  let lastError: any = null;

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    const headers = buildSecurityHeaders({
      token: opts.token,
      idempotencyKey: opts.idempotencyKey,
    });
    if (opts.body && !headers["Content-Type"])
      headers["Content-Type"] = "application/json";

    try {
      const res = await fetch(fullUrl, {
        method: opts.method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
        credentials: "include",
      });
      clearTimeout(id);

      const text = await res.text();
      let payload: any = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch (e) {
        // non-json response — keep raw text
      }

      if (!res.ok) {
        const err = new Error(`Request failed ${res.status}: ${text}`);
        (err as any).status = res.status;
        (err as any).body = payload;
        throw err;
      }

      return payload;
    } catch (err: any) {
      clearTimeout(id);
      lastError = err;

      // retry once on the first attempt (covers timeouts and network errors)
      if (attempt === 1) {
        continue;
      }

      // otherwise, throw the last error
      throw err;
    }
  }

  // if we exit loop, throw last observed error
  throw lastError || new Error("Request failed");
}

// Suppress unused variable warning for TimeoutError
void TimeoutError;
