import { SECTIONS } from "@apps/cf_erp/navMeta";

/**
 * "What this role sees": the menu of an app worked out from a set of permissions, the same way the app's own menu is
 * (cf_erp navMeta: tags joined by "|" = any, by "&" = all; no tag = everyone). Only cf_erp describes its menu this way
 * so far; another app answers null and the panel shows the count of permissions instead.
 *
 * A company's Stores menu is one of two sets (the older screens, or the Stores desk): which one comes with the roles
 * list (AppRow.options.storesDesk) and is kept here for every caller.
 */
const options: Record<string, { storesDesk?: boolean }> = {};
export function setAppOptions(apps: { slug: string; options?: { storesDesk?: boolean } }[]) { for (const a of apps) options[a.slug] = a.options ?? {}; }

export function menuOf(appSlug: string, tags: string[]): { section: string; screens: string[] }[] | null {
  if (appSlug !== "cf_erp") return null;
  const has = new Set(tags);
  const desk = options.cf_erp?.storesDesk ? "v2" : "v1";
  const passes = (permission?: string) => !permission || permission.split("|").some((alt) => alt.split("&").every((t) => has.has(t.trim())));
  const out: { section: string; screens: string[] }[] = [];
  for (const s of SECTIONS) {
    if (s.key === "home") continue;
    const screens = [...new Set(s.screens.filter((x) => (!x.desk || x.desk === desk) && passes(x.permission)).map((x) => x.label))];
    if (screens.length) out.push({ section: s.label, screens });
  }
  return out;
}
