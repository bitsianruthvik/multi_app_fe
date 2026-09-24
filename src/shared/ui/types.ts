/**
 * The contracts the kit is built on. Nothing here knows about any one app.
 *
 * `NavSection[]` is the single nav source an app hands the shell: the top nav's
 * two rows, the breadcrumb, the ⌘K palette's "Go to" group and the mobile sheet
 * all read this one array. A second definition is exactly how a nav and a
 * breadcrumb drift apart — keep it to one (DESIGN_SYSTEM.md §3).
 */

/** Semantic tone. `warning`/`danger` read as "needs you". */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

/** A status's tone family — the same five, named for what StatusBadge does. */
export type StatusTone = BadgeTone;

/** One screen in the navigation. */
export interface NavScreen {
  /** Stable id. Defaults to `path` when omitted. */
  key?: string;
  /** Human label. Sentence case. */
  label: string;
  /** Route segment under /:company/:appSlug/ — also the breadcrumb key. */
  path: string;
  /** feature_tag gate; undefined = always visible. */
  permission?: string;
  /**
   * Key the count source resolves to a row-2 badge. Undefined = no badge.
   * Counts are advisory: a missing count renders no badge, never an error.
   */
  countKey?: string;
  /** Extra terms the command palette should match this screen on. */
  keywords?: string[];
  /** This screen has detail routes at /:company/:appSlug/<path>/:id. */
  hasDetail?: boolean;
}

/** A group of screens — one entry in the top nav's first row. */
export interface NavSection {
  key: string;
  label: string;
  screens: NavScreen[];
}

/** How a count badge should read: a size stays neutral, waiting work takes a tone. */
export interface CountMeta {
  tone?: BadgeTone;
  /** Turns a bare number into a phrase: "34 open", "2 short". */
  suffix?: string;
}

export type CountMetaMap = Record<string, CountMeta>;
export type NavCounts = Record<string, number>;

/**
 * A permission predicate. It is a plain function, not a hook, so callers can
 * filter a list of N screens by N different tags without breaking the rules of
 * hooks. `useIsPermitted()` returns one; an app may pass its own.
 */
export type Can = (permission?: string) => boolean;

export interface ResolvedNav {
  section: NavSection;
  screen: NavScreen;
  /** The id from a detail route, or null on the collection itself. */
  detailId: string | null;
}

/** A screen's stable id. */
export const screenKey = (screen: NavScreen): string => screen.key ?? screen.path;

/** The route for a screen path within an app. */
export const appPath = (company: string, appSlug: string, path: string): string =>
  `/${company}/${appSlug}/${path}`;

/**
 * Which section and screen a pathname belongs to.
 * Matching is on the first segment after the app slug, so a detail route
 * resolves to its parent screen — that is what keeps both nav rows highlighted
 * three levels deep. Returns null for routes outside the nav (a profile page,
 * say) so callers can fall back.
 */
export function resolveNav(
  sections: NavSection[],
  appSlug: string,
  pathname: string,
): ResolvedNav | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[1] !== appSlug) return null;
  const screenPath = parts[2];
  if (!screenPath) return null;
  for (const section of sections) {
    const screen = section.screens.find((s) => s.path === screenPath);
    if (screen) {
      const rest = parts.slice(3);
      return {
        section,
        screen,
        detailId: rest.length > 0 ? rest.join('/') : null,
      };
    }
  }
  return null;
}

/** Every screen with its section — the palette's "Go to" source. */
export const allScreens = (sections: NavSection[]): { section: NavSection; screen: NavScreen }[] =>
  sections.flatMap((section) => section.screens.map((screen) => ({ section, screen })));

/** Human label for a route segment; falls back to a de-hyphenated path. */
export function labelForPath(sections: NavSection[], path: string): string {
  for (const section of sections) {
    const screen = section.screens.find((s) => s.path === path);
    if (screen) return screen.label;
  }
  return path.replace(/-/g, ' ');
}

/** Every countKey declared across the nav, so a loader can batch exactly one query set. */
export const countKeys = (sections: NavSection[]): string[] =>
  Array.from(
    new Set(
      sections.flatMap((s) => s.screens.map((sc) => sc.countKey).filter((k): k is string => !!k)),
    ),
  );
