/**
 * fab_erp navigation — the SINGLE source of truth.
 *
 * Four consumers read this and only this:
 *   1. FabErpTopNav      — row 1, the five primary sections
 *   2. SectionNav        — row 2, the active section's sub-nav + count badges
 *   3. UserLayout        — the top-bar breadcrumb label for any route
 *   4. CommandPalette    — the "Go to" result group
 *
 * Why one file: the previous setup had the rail in `index.ts` and a separate
 * `FAB_ERP_SECTIONS` label map in `core/layouts/UserLayout.tsx`. They drifted —
 * the label map ended up with 4 entries for deleted routes (workbench, mrp,
 * scheduler, routing-plans) and was missing 12 live ones, so a third of the app
 * showed a raw de-hyphenated slug as its breadcrumb. Anything nav-shaped goes
 * here or it will drift again.
 *
 * Adding a screen: add one NavEntry to the right section. That is the whole
 * change — rail, breadcrumb and palette all pick it up.
 *
 * See FAB_ERP_UX_ELEVATION_PLAN.md §2.1 for the agreed structure.
 */

/** Semantic tone for a row-2 count badge. `warning`/`danger` read as "needs you". */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface NavEntry {
  /** Route segment under /:company/fab_erp/ — also the breadcrumb key. */
  slug: string;
  /** Human label. Sentence case. */
  label: string;
  /** feature_tag gate; undefined = always visible. */
  permission?: string;
  /**
   * Key the SectionNav count loader resolves to a badge. Undefined = no badge.
   * Counts are advisory: a failed fetch renders no badge, never an error.
   */
  countKey?: string;
  /** Extra terms that should match this entry in the command palette. */
  keywords?: string[];
  /**
   * Detail routes that belong to this entry (e.g. 'orders/:soId'). Used so a
   * detail page still highlights its parent and resolves a breadcrumb.
   */
  childSlugs?: string[];
}

export interface NavSection {
  /** Stable id used for the active-section calculation and persisted state. */
  id: string;
  label: string;
  items: NavEntry[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'today',
    label: 'Today',
    items: [
      { slug: 'home', label: 'Home', keywords: ['cockpit', 'dashboard', 'pulse', 'today'] },
    ],
  },
  {
    id: 'production',
    label: 'Production',
    items: [
      { slug: 'task-queue', label: 'Queue', permission: 'fab_erp_taskqueue_view', countKey: 'openTasks', keywords: ['work', 'operator', 'start', 'stop'] },
      { slug: 'dispatch', label: 'Dispatch', permission: 'fab_erp_taskqueue_view', keywords: ['dispatch', 'plan', 'planning', 'assign', 'next job', 'what next', 'ranking', 'priority', 'run'] },
      { slug: 'task-engine', label: 'Engine', permission: 'fab_erp_taskengine_view', countKey: 'activeOrders', keywords: ['dag', 'graph', 'swimlane', 'progress'] },
      { slug: 'machine-board', label: 'Machines', permission: 'fab_erp_machine_state_manage', countKey: 'machinesRunning', keywords: ['shop floor', 'state', 'running', 'down'] },
      { slug: 'machine-timeline', label: 'Timeline', permission: 'fab_erp_time_backfill', keywords: ['gantt', 'utilisation', 'backfill', 'history', 'reconcile', 'gaps', 'unaccounted', 'anomalies'] },
      // No countKey: "unaccounted time gaps" needs a per-machine shift-vs-events
      // diff, which is too expensive for a nav badge that reloads on every
      // section change. Add one only if /nav-counts can answer it in one query.
      { slug: 'people', label: 'People', permission: 'fab_erp_machine_state_manage', keywords: ['crew', 'operator', 'worker', 'roster', 'contractor', 'vendor', 'staff'] },
      { slug: 'shift-log', label: 'Shift Log', permission: 'fab_erp_time_backfill', keywords: ['back-entry', 'paper', 'clipboard', 'past', 'downtime', 'absent', 'yesterday'] },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    items: [
      { slug: 'orders', label: 'Orders', permission: 'fab_erp_projects_view', countKey: 'openOrders', keywords: ['sales', 'purchase', 'manufacturing', 'so', 'po'], childSlugs: ['orders/:soId'] },
      { slug: 'customers', label: 'Customers', permission: 'fab_erp_projects_view', keywords: ['client', 'buyer'] },
      { slug: 'item-batches', label: 'Stock', permission: 'fab_erp_inventory_view', keywords: ['batches', 'inventory', 'on hand'] },
      { slug: 'stock-in', label: 'Stock in', permission: 'fab_erp_inventory_manage', keywords: ['receive', 'goods in', 'inward', 'add stock', 'raw material', 'grn'] },
    ],
  },
  {
    id: 'analyse',
    label: 'Analyse',
    items: [
      { slug: 'critical-chain', label: 'Critical chain', permission: 'fab_erp_cc_view', countKey: 'redBuffers', keywords: ['ccpm', 'buffer', 'fever', 'drum', 'toc'] },
      { slug: 'machine-performance', label: 'Machines', permission: 'fab_erp_shopfloor_analytics_view', keywords: ['utilisation', 'utilization', 'throughput', 'tonnes', 'tonnage', 'output', 'productivity', 'variation', 'oee', 'performance', 'idle'] },
      { slug: 'analytics', label: 'Machine buffers', permission: 'fab_erp_shopfloor_analytics_view', keywords: ['buffer', 'wip', 'queue', 'reports', 'analytics'] },
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    items: [
      { slug: 'setup', label: 'Readiness', keywords: ['hub', 'overview', 'checklist', 'configure'] },
      { slug: 'item-catalog', label: 'Items', permission: 'fab_erp_items_meta_view', countKey: 'items', keywords: ['parts', 'catalog', 'category', 'group', 'taxonomy', 'bom', 'bill of materials'], childSlugs: ['item-catalog/:itemId'] },
      { slug: 'operations', label: 'Operations', permission: 'fab_erp_operations_view', countKey: 'operations', keywords: ['process', 'time formula'] },
      { slug: 'operation-flows', label: 'Flows', permission: 'fab_erp_flows_view', countKey: 'flows', keywords: ['routing', 'sequence', 'steps'] },
      { slug: 'flow-rules', label: 'Flow rules', permission: 'fab_erp_flows_view', keywords: ['flow allocation', 'default flow', 'suffix', 'drilled', 'per level', 'assign flows'] },
      { slug: 'plants', label: 'Plants', permission: 'fab_erp_resources_view', keywords: ['site', 'stock location', 'warehouse'] },
      { slug: 'resource-types', label: 'Resources', permission: 'fab_erp_resources_view', countKey: 'machines', keywords: ['machines', 'labour', 'capacity', 'resource type'] },
      { slug: 'shift-calendars', label: 'Calendars', permission: 'fab_erp_calendars_view', keywords: ['shifts', 'working days', 'holidays'] },
      { slug: 'progress-templates', label: 'Progress stages', permission: 'fab_erp_taskengine_view', keywords: ['stage template', 'project progress'] },
      { slug: 'item-metrics', label: 'Metrics', permission: 'fab_erp_items_meta_view', keywords: ['dimension', 'attribute', 'length', 'thickness', 'weight'] },
      { slug: 'buffer-config', label: 'Buffers', permission: 'fab_erp_buffer_config', keywords: ['physical buffer', 'stock area', 'wip'] },
      { slug: 'codegen-settings', label: 'Code generation', permission: 'fab_erp_items_meta_view', keywords: ['numbering', 'prefix', 'sequence'] },
    ],
  },
];

// ── Derived lookups ─────────────────────────────────────────────────────────
// Built once at module load. Keep these as the only way other modules resolve
// a slug, so no consumer re-implements matching.

export interface ResolvedEntry {
  section: NavSection;
  entry: NavEntry;
  /** True when the slug matched a childSlugs pattern rather than the entry itself. */
  isChild: boolean;
}

const BY_SLUG = new Map<string, ResolvedEntry>();
for (const section of NAV_SECTIONS) {
  for (const entry of section.items) {
    BY_SLUG.set(entry.slug, { section, entry, isChild: false });
  }
}

/**
 * Resolve a URL path to its section + nav entry.
 *
 * `pathname` is the full location (e.g. `/placebo/fab_erp/orders/42`). Matching
 * is on the first segment after the app slug, so detail routes resolve to their
 * parent entry — that is what keeps row 1 and row 2 highlighted on a detail page.
 * Returns null for unknown routes (e.g. /profile) so callers can fall back.
 */
export function resolveRoute(pathname: string): ResolvedEntry | null {
  const parts = pathname.split('/').filter(Boolean);
  // parts = [company, 'fab_erp', slug, ...rest]
  const slug = parts[2];
  if (!slug) return null;
  const hit = BY_SLUG.get(slug);
  if (!hit) return null;
  return { ...hit, isChild: parts.length > 3 };
}

/** Human label for a route segment; falls back to a de-hyphenated slug. */
export function labelForSlug(slug: string): string {
  return BY_SLUG.get(slug)?.entry.label ?? slug.replace(/-/g, ' ');
}

/** All entries flattened — the command palette's "Go to" source. */
export function allEntries(): { section: NavSection; entry: NavEntry }[] {
  return NAV_SECTIONS.flatMap((section) => section.items.map((entry) => ({ section, entry })));
}

/** Every countKey declared above, so the badge loader can batch exactly one query set. */
export const COUNT_KEYS: string[] = Array.from(
  new Set(NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.countKey).filter((k): k is string => !!k))),
);
