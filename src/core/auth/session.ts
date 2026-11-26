/**
 * ONE SIGN-IN PER COMPANY IN THIS BROWSER (2026-11-26). The user: "different companies should track different tokens…
 * If I want to track all my clients in the same browser, this is blocking me." Until now the browser kept ONE sign-in
 * (localStorage "token" + "companySlug"), so signing in to a second company signed the first one out.
 *
 * Now every company has its own: `token:<company>` and `appSlug:<company>`. A page uses the sign-in of the company in
 * its own address (/placebo/... → placebo's), so two tabs of two companies work side by side. `companySlug` stays as
 * "the company signed in to last", only for pages whose address names no company.
 *
 * Nothing here widens what a sign-in can do: each token still names its one company, and the server refuses it for
 * another company's address (core/utils/jwt.js tokenFitsUrl, authmiddleware). Every read of the sign-in goes through
 * this file, never localStorage("token") directly.
 */

const TOKEN = "token:";
const APP = "appSlug:";
const LAST = "companySlug";
const CRM_KEPT = "cf_crm:verifiedUser";

/** First parts of an address that are not a company (App.tsx routes outside /:company). */
const NOT_A_COMPANY = new Set(["select-company", "platform", "login", "reset-password", "forgot-password", "debug"]);

const norm = (slug: string | null | undefined) => (slug ? decodeURIComponent(String(slug)).trim().toLowerCase() : "");

function store(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
function read(key: string): string | null { try { return store()?.getItem(key) ?? null; } catch { return null; } }
function write(key: string, value: string) { try { store()?.setItem(key, value); } catch { /* storage full or blocked */ } }
function remove(key: string) { try { store()?.removeItem(key); } catch { /* blocked */ } }

/** The company the current page's address names, or null (/, /select-company, /platform/…). */
export function companyOfPage(path: string = typeof window !== "undefined" ? window.location.pathname : ""): string | null {
  const first = path.split("/").filter(Boolean)[0];
  const slug = norm(first);
  return slug && !NOT_A_COMPANY.has(slug) ? slug : null;
}

/** The company signed in to last (for an address that names none). */
export function lastCompany(): string | null { return norm(read(LAST)) || null; }

/** The company this page works for: its address's, else the last one signed in to. */
export function currentCompany(): string | null { return companyOfPage() ?? lastCompany(); }

/** The sign-in for a company (by default the page's). Never another company's. */
export function getToken(company: string | null = currentCompany()): string | null {
  const slug = norm(company);
  return slug ? read(TOKEN + slug) : null;
}

/** Keep a sign-in for a company (after signing in, or a fresh token after a password change / two-step code). */
export function setToken(company: string, token: string) {
  const slug = norm(company);
  if (!slug || !token) return;
  write(TOKEN + slug, token);
  write(LAST, slug);
}

/** The app last opened in a company. */
export function getAppSlug(company: string | null = currentCompany()): string | null {
  const slug = norm(company);
  return slug ? read(APP + slug) : null;
}
export function setAppSlug(company: string, app: string | null) {
  const slug = norm(company);
  if (!slug) return;
  if (app) write(APP + slug, app); else remove(APP + slug);
}

/** Every company this browser is signed in to. */
export function signedInCompanies(): string[] {
  const s = store();
  if (!s) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(TOKEN) && s.getItem(k)) out.push(k.slice(TOKEN.length));
  }
  return out.sort();
}

/** Sign one company out in this browser (the others stay signed in). */
export function clearSession(company: string | null) {
  const slug = norm(company);
  if (!slug) return;
  remove(TOKEN + slug);
  remove(APP + slug);
  try {
    const kept = JSON.parse(read(CRM_KEPT) || "null");
    if (!kept || norm(kept.company) === slug) remove(CRM_KEPT);
  } catch { remove(CRM_KEPT); }
  if (lastCompany() === slug) {
    const other = signedInCompanies()[0];
    if (other) write(LAST, other); else remove(LAST);
  }
}

/**
 * The single sign-in kept before 2026-11-26 ("token", "companySlug", "appSlug") becomes that company's own, so nobody
 * is signed out by this change. Runs once when this file loads.
 */
(function moveTheOldSignIn() {
  const old = read("token");
  const company = norm(read(LAST));
  if (old && company && !read(TOKEN + company)) {
    write(TOKEN + company, old);
    const app = read("appSlug");
    if (app) write(APP + company, app);
  }
  if (old !== null) remove("token");
  remove("appSlug");
})();
