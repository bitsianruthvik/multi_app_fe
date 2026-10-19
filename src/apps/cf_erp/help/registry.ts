/**
 * The help topics as one index: read from the Markdown files (TM/CF_ERP_HELP_SPEC.md), matched to a screen, searched,
 * and grouped by role and by area. Pure — load.ts hands it the files; scripts/cf_erp_help_test.mjs runs it in node.
 */
import { parseFrontmatter } from './frontmatter';
import { plainText } from './markdown';

export const HELP_ROLES = ['sales', 'management', 'accounts', 'purchase', 'stores', 'production', 'maintenance', 'design', 'admin'] as const;
export type HelpRole = typeof HELP_ROLES[number];
export const ROLE_LABEL: Record<HelpRole, string> = {
  sales: 'Sales', management: 'Management', accounts: 'Accounts', purchase: 'Purchase', stores: 'Stores',
  production: 'Production', maintenance: 'Maintenance', design: 'Design', admin: 'Admin',
};

/** The areas in the order a manual reads them. */
export const HELP_AREAS = ['roles', 'home', 'sales', 'order', 'management', 'accounts', 'purchase', 'stores', 'production', 'maintenance', 'catalog', 'setup'] as const;
export const AREA_LABEL: Record<string, string> = {
  roles: 'Getting started', home: 'Home', sales: 'Sales', order: 'The order page', management: 'Management', accounts: 'Accounts',
  purchase: 'Purchase', stores: 'Stores', production: 'Production', maintenance: 'Maintenance', catalog: 'Catalog', setup: 'Setup',
};

export interface HelpTopic {
  id: string;
  title: string;
  area: string;
  roles: string[];
  /** Route patterns, e.g. /:company/cf_erp/orders/:id */
  routes: string[];
  /** The tab / stage keys this topic is about; empty = the whole screen. */
  tabs: string[];
  order: number;
  body: string;
  /** Where it came from (./content/<area>/<id>.md). */
  file: string;
  /** Lower-case words for search: title, headings and text. */
  searchText: string;
  /** Header problems (shown on the Help page to whoever writes the topics; the topic still shows). */
  errors: string[];
}

export interface HelpIndex {
  topics: HelpTopic[];
  byId: Map<string, HelpTopic>;
  /** Files that could not be read as a topic at all, in words. */
  problems: string[];
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);

/** One file → one topic (or null when it has no usable id). */
export function topicFromFile(file: string, raw: string): { topic: HelpTopic | null; errors: string[] } {
  const fm = parseFrontmatter(raw);
  const errors = [...fm.errors];
  const d = fm.data;
  const fileId = (file.split('/').pop() ?? '').replace(/\.md$/i, '');
  const fileArea = file.split('/').slice(-2, -1)[0] ?? '';
  const id = typeof d.id === 'string' && d.id ? d.id : fileId;
  if (!id) return { topic: null, errors: [...errors, 'no id'] };
  if (d.id == null) errors.push('no "id" (the file name is used)');
  else if (id !== fileId) errors.push(`id "${id}" is not the file name "${fileId}"`);
  if (typeof d.title !== 'string' || !d.title) errors.push('no "title"');
  const area = typeof d.area === 'string' && d.area ? d.area : fileArea;
  if (!(HELP_AREAS as readonly string[]).includes(area)) errors.push(`unknown area "${area}"`);
  const roles = asList(d.roles).map((r) => r.toLowerCase());
  for (const r of roles) if (!(HELP_ROLES as readonly string[]).includes(r)) errors.push(`unknown role "${r}"`);
  const routes = asList(d.routes);
  for (const r of routes) if (!r.startsWith('/')) errors.push(`route "${r}" does not start with /`);
  const order = typeof d.order === 'number' ? d.order : 1000;
  const title = typeof d.title === 'string' && d.title ? d.title : id;
  const text = plainText(fm.body);
  return {
    topic: {
      id, title, area, roles, routes, tabs: asList(d.tab), order, body: fm.body, file, errors,
      searchText: `${title}\n${id}\n${text}`.toLowerCase(),
    },
    errors,
  };
}

/** Every file → the index. A later file with an id already taken is reported and left out. */
export function buildIndex(files: Record<string, string>): HelpIndex {
  const topics: HelpTopic[] = [];
  const byId = new Map<string, HelpTopic>();
  const problems: string[] = [];
  // A file named after its id is taken first, so it keeps the id when another file claims it too.
  const read = Object.keys(files).sort().map((file) => ({ file, ...topicFromFile(file, files[file]) }));
  const named = (r: typeof read[number]) => !!r.topic && r.file.endsWith(`/${r.topic.id}.md`);
  for (const { file, topic, errors } of [...read.filter(named), ...read.filter((r) => !named(r))]) {
    if (!topic) { problems.push(`${file}: ${errors.join('; ')}`); continue; }
    if (byId.has(topic.id)) { problems.push(`${file}: id "${topic.id}" is used by ${byId.get(topic.id)!.file} too`); continue; }
    if (errors.length) problems.push(`${file}: ${errors.join('; ')}`);
    topics.push(topic);
    byId.set(topic.id, topic);
  }
  topics.sort(byAreaOrder);
  return { topics, byId, problems };
}

const areaRank = (a: string) => { const i = (HELP_AREAS as readonly string[]).indexOf(a); return i < 0 ? HELP_AREAS.length : i; };
export function byAreaOrder(a: HelpTopic, b: HelpTopic): number {
  return areaRank(a.area) - areaRank(b.area) || a.order - b.order || a.title.localeCompare(b.title);
}

// ── matching a screen ──

const segs = (p: string) => p.split('?')[0].split('#')[0].split('/').filter(Boolean);

/** Does `/:company/cf_erp/orders/:id` match `/placebo/cf_erp/orders/12`? Literal segments must be equal; `:x` takes any one. */
export function matchRoute(pattern: string, pathname: string): boolean {
  const p = segs(pattern);
  const s = segs(pathname);
  if (p.length !== s.length) return false;
  return p.every((seg, i) => (seg.startsWith(':') ? s[i] !== '' : seg === safeDecode(s[i])));
}
function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/** The tab the URL names: `?tab=` first, else `?view=` (Tracker, Planner keep their tab there). */
export function tabOfSearch(search: string): string | null {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return p.get('tab') || p.get('view') || null;
}

/**
 * The topics for where the user is, best first:
 *   1. topics for this route whose `tab` is the current tab (the `tab` argument, else the URL's ?tab= / ?view=);
 *   2. topics for this route without a `tab`;
 *   3. only when no tab is known: the route's tab topics too (so the panel still offers them).
 * A topic about another tab of the same screen is left out while a tab is known.
 */
export function topicsForLocation(index: Pick<HelpIndex, 'topics'>, pathname: string, search = '', tab?: string | null): HelpTopic[] {
  const current = tab ?? tabOfSearch(search);
  const onRoute = index.topics.filter((t) => t.routes.some((r) => matchRoute(r, pathname)));
  const forTab = current ? onRoute.filter((t) => t.tabs.includes(current)) : [];
  const general = onRoute.filter((t) => t.tabs.length === 0);
  const otherTabs = current ? [] : onRoute.filter((t) => t.tabs.length > 0);
  const sort = (xs: HelpTopic[]) => [...xs].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return [...sort(forTab), ...sort(general), ...sort(otherTabs)];
}

// ── search ──

/** Every word must appear; title hits rank first, then headings, then the text. */
export function searchTopics(index: Pick<HelpIndex, 'topics'>, query: string, limit = 50): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.trim()).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { t: HelpTopic; score: number }[] = [];
  for (const t of index.topics) {
    if (!words.every((w) => t.searchText.includes(w))) continue;
    const title = t.title.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (title === w) score += 20;
      else if (title.startsWith(w)) score += 12;
      else if (title.includes(w)) score += 8;
      if (t.id.includes(w)) score += 3;
      score += Math.min(5, t.searchText.split(w).length - 1);
    }
    scored.push({ t, score });
  }
  return scored.sort((a, b) => b.score - a.score || byAreaOrder(a.t, b.t)).slice(0, limit).map((x) => x.t);
}

// ── by role, by area ──

export function topicsForArea(index: Pick<HelpIndex, 'topics'>, area: string): HelpTopic[] {
  return index.topics.filter((t) => t.area === area).sort(byAreaOrder);
}

/** A role's manual: its "Getting started" guide(s) first, then every other topic for that role, area by area. */
export function manualForRole(index: Pick<HelpIndex, 'topics'>, role: string): HelpTopic[] {
  const mine = index.topics.filter((t) => t.roles.includes(role));
  const guides = mine.filter((t) => t.area === 'roles').sort(byAreaOrder);
  const rest = mine.filter((t) => t.area !== 'roles').sort(byAreaOrder);
  return [...guides, ...rest];
}

/** The areas that have topics, in manual order (unknown areas last). */
export function areasInUse(index: Pick<HelpIndex, 'topics'>): string[] {
  const used = new Set(index.topics.map((t) => t.area));
  return [...HELP_AREAS.filter((a) => used.has(a)), ...[...used].filter((a) => !(HELP_AREAS as readonly string[]).includes(a)).sort()];
}
