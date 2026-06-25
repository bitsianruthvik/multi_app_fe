let BASE = "http://localhost:4000";
try {
  // @ts-ignore
  const envHost =
    (import.meta &&
      import.meta.env &&
      (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_HOST)) ||
    null;
  if (envHost) BASE = String(envHost).replace(/\/$/, "");
  else if (typeof window !== "undefined") BASE = window.location.origin;
} catch (e) {
  if (typeof window !== "undefined") BASE = window.location.origin;
}

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path: string) {
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    credentials: "include",
    headers: { ...authHeaders() },
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch (e) {
    if (!res.ok) throw new Error("Network error");
    throw e;
  }
  return json;
}

export async function apiPost(path: string, body: any) {
  const url = `${BASE}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch (e) {
    if (!res.ok) throw new Error("Network error");
    throw e;
  }
  return json;
}
