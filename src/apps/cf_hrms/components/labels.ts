/**
 * An org unit's KIND on the screens: its ONE label (spec §9; the groups of §15
 * were removed on 2026-10-16; "kind" is the word since §33, 2026-10-24).
 *
 *   useLabels()        the company's labels (and the shifts "New positions start on"
 *                      offers), read once per screen
 *   labelFilterDefs()  the list toolbar's kind filter ("Kind" on Org units, "Org unit
 *                      kind" elsewhere): the address param the server reads, `label=12`
 *   matchesLabel()     the server's rule, for a screen that filters in the browser
 *   labelFilterText()  what an active filter says: the label's name
 *   labelColour()      a soft colour per kind, for "Colour by kind" on the org chart
 *
 * An org unit's kind is its OWN — a parent "Plant" does not pass it to its children.
 */
import { useCallback, useEffect, useState } from 'react';
import { orgApi, type DepartmentLabel, type ShiftChoice } from '../api/organisation';
import type { FilterDef } from './list/ListToolbar';

/** The labels, or [] while loading / when the login may not read them (the filter then simply is not offered). */
export function useLabels(enabled = true): { labels: DepartmentLabel[]; shifts: ShiftChoice[]; reload: () => void; loaded: boolean } {
  const [state, setState] = useState<{ labels: DepartmentLabel[]; shifts: ShiftChoice[] }>({ labels: [], shifts: [] });
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    orgApi.departmentLabels
      .read()
      .then((r) => { if (live) setState(r); })
      .catch(() => { if (live) setState({ labels: [], shifts: [] }); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, loaded };
}

/** The kind filter (none while there are no kinds). `withCounts` = org units of each kind. */
export function labelFilterDefs(labels: DepartmentLabel[], { withCounts = false, label = 'Org unit kind' } = {}): FilterDef[] {
  if (!labels.length) return [];
  return [{
    key: 'label',
    label,
    options: labels.map((l) => ({ value: String(l.id), label: l.name, ...(withCounts ? { count: l.departmentCount } : {}) })),
  }];
}

/** The label ids an address `label` param holds: ids, or (as an older address had it) names. */
function wanted(param: string, labels: DepartmentLabel[]): Set<number> {
  const byName = new Map(labels.map((l) => [l.name.toLowerCase(), l.id]));
  const out = new Set<number>();
  for (const raw of param.split(',')) {
    const t = raw.trim();
    if (!t) continue;
    const id = /^\d+$/.test(t) ? Number(t) : byName.get(t.toLowerCase());
    if (id != null) out.add(id);
  }
  return out;
}

/** Does an org unit of this kind pass `label=…`? The same rule as the server: any of. */
export function matchesLabel(param: string, labelId: number | null | undefined, labels: DepartmentLabel[]): boolean {
  if (!param) return true;
  return labelId != null && wanted(param, labels).has(labelId);
}

/** "Machine" — what an active kind filter says. */
export function labelFilterText(param: string, labels: DepartmentLabel[]): string {
  const ids = wanted(param, labels);
  return labels.filter((l) => ids.has(l.id)).map((l) => l.name).join(' · ');
}

/**
 * Soft colours for "Colour by kind" (one per kind, in the list's order).
 * Translucent, so they sit on the light and the dark theme alike.
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
