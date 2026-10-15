/**
 * Labels in groups on the screens (CF_HRMS_HIRING_SPEC.md §15.3–§15.4).
 *
 *   useLabelGroups()        the company's groups and their labels, read once per screen
 *   labelFilterDefs()       one filter per group for the list toolbar, all writing the ONE
 *                           address param the server reads: `label=12,31`
 *   matchesLabels()         the server's rule, for a screen that filters in the browser:
 *                           labels of one group are "any of", groups are "and"
 *   labelColour()           a soft colour per label, for "Colour by" on the org chart
 *
 * A department's labels are its OWN — a parent "Plant" does not label its children.
 */
import { useCallback, useEffect, useState } from 'react';
import { orgApi, type DepartmentLabelRef, type LabelGroup } from '../api/organisation';
import type { FilterDef } from './list/ListToolbar';

/** The groups, or [] while loading / when the login may not read them (the filters then simply are not offered). */
export function useLabelGroups(enabled = true): { groups: LabelGroup[]; reload: () => void; loaded: boolean } {
  const [groups, setGroups] = useState<LabelGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    orgApi.labelGroups
      .list()
      .then((g) => { if (live) setGroups(g); })
      .catch(() => { if (live) setGroups([]); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { groups, reload, loaded };
}

/** One filter per group (groups with labels only), in group order. `counts` = departments per label, when known. */
export function labelFilterDefs(groups: LabelGroup[], { withCounts = false } = {}): FilterDef[] {
  return groups
    .filter((g) => g.labels.length > 0)
    .map((g) => ({
      key: `label:${g.id}`,
      label: g.name,
      partOf: { param: 'label', values: g.labels.map((l) => String(l.id)) },
      options: g.labels.map((l) => ({ value: String(l.id), label: l.name, ...(withCounts ? { count: l.departmentCount } : {}) })),
    }));
}

/** The label ids an address `label` param holds, by group. */
function wantedByGroup(param: string, groups: LabelGroup[]): Map<number, Set<number>> {
  const groupOf = new Map<number, number>();
  const byName = new Map<string, number[]>();
  for (const g of groups) {
    for (const l of g.labels) {
      groupOf.set(l.id, g.id);
      byName.set(l.name.toLowerCase(), [...(byName.get(l.name.toLowerCase()) ?? []), l.id]);
    }
  }
  const out = new Map<number, Set<number>>();
  let unknown = 0;
  for (const raw of param.split(',')) {
    const t = raw.trim();
    if (!t) continue;
    // An id, or (as an older address had it) a label's name.
    const ids = /^\d+$/.test(t) ? [Number(t)] : (byName.get(t.toLowerCase()) ?? []);
    if (!ids.length) { unknown -= 1; out.set(unknown, new Set()); continue; }
    for (const id of ids) {
      const g = groupOf.get(id);
      if (g === undefined) { unknown -= 1; out.set(unknown, new Set()); continue; } // matches nothing, as on the server
      if (!out.has(g)) out.set(g, new Set());
      out.get(g)!.add(id);
    }
  }
  return out;
}

/** Does a department with these labels pass `label=…`? The same rule as lib/listFilters.js. */
export function matchesLabels(param: string, labels: DepartmentLabelRef[] | undefined, groups: LabelGroup[]): boolean {
  if (!param) return true;
  const wanted = wantedByGroup(param, groups);
  if (!wanted.size) return true;
  const mine = new Set((labels ?? []).map((l) => l.labelId));
  for (const ids of wanted.values()) if (![...ids].some((id) => mine.has(id))) return false;
  return true;
}

/** "Unit 2 · Plant" — what an active label filter says, in group order. */
export function labelFilterText(param: string, groups: LabelGroup[]): string {
  const ids = new Set(param.split(',').map((v) => Number(v.trim())));
  return groups.flatMap((g) => g.labels.filter((l) => ids.has(l.id)).map((l) => l.name)).join(' · ');
}

/**
 * Soft colours for "Colour by" (one per label of the chosen group, in its
 * order). Translucent, so they sit on the light and the dark theme alike.
 */
const PALETTE: Array<{ fill: string; edge: string }> = [
  { fill: 'rgba(59, 130, 246, 0.14)', edge: 'rgba(59, 130, 246, 0.60)' },
  { fill: 'rgba(16, 185, 129, 0.15)', edge: 'rgba(16, 185, 129, 0.60)' },
  { fill: 'rgba(245, 158, 11, 0.17)', edge: 'rgba(217, 119, 6, 0.65)' },
  { fill: 'rgba(236, 72, 153, 0.13)', edge: 'rgba(219, 39, 119, 0.55)' },
  { fill: 'rgba(139, 92, 246, 0.14)', edge: 'rgba(139, 92, 246, 0.60)' },
  { fill: 'rgba(20, 184, 166, 0.15)', edge: 'rgba(13, 148, 136, 0.60)' },
  { fill: 'rgba(239, 68, 68, 0.12)', edge: 'rgba(220, 38, 38, 0.55)' },
  { fill: 'rgba(132, 204, 22, 0.17)', edge: 'rgba(101, 163, 13, 0.60)' },
];
export const labelColour = (index: number) => PALETTE[((index % PALETTE.length) + PALETTE.length) % PALETTE.length];
