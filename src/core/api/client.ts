/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralized API client for all backend requests.
 * Uses VITE_API_BASE_URL from environment and automatically attaches JWT tokens.
 */

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

  // Attach JWT token from localStorage if available
  const token = localStorage.getItem("token");
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

    // Parse JSON response
    const data = await response.json();
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
