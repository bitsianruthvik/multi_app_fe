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
  // One or more kinds ("any of", as the server reads `label=12,13`), each chip in the kind's colour (spec §34.1).
  return [{
    key: 'label',
    label,
    searchable: true,
    multiple: true,
    options: labels.map((l) => ({ value: String(l.id), label: l.name, colour: kindColour(l), ...(withCounts ? { count: l.departmentCount } : {}) })),
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

/* ── Colour per kind (spec §34.1) ──────────────────────────────────────────
 * The server stores a palette KEY on each kind (never a raw hex) and every
 * label read carries `colour`: the key the kind SHOWS (chosen, or its default
 * — Department blue, Section teal, Machine amber, the others the first key no
 * other kind shows). This is the one place a key becomes colours.
 *
 * Each key has a fill, a text and an edge colour for the light and the dark
 * theme. Checked (WCAG): the text is at least 4.5:1 on its fill and on the
 * surface, the edge at least 3:1 on the surface, in both themes. They are
 * written once below as CSS variables (--kind-<key>-fill / -text / -edge)
 * under the platform theme's light and dark selectors, so a chip, a filter chip
 * or a chart box follows the theme without re-rendering.
 */
export const KIND_COLOURS = ['blue', 'teal', 'green', 'lime', 'amber', 'orange', 'red', 'pink', 'purple', 'indigo', 'cyan', 'slate'] as const;
export type KindColourKey = (typeof KIND_COLOURS)[number];

/** [fill, text, edge] per theme. */
const KIND_PALETTE: Record<KindColourKey, { name: string; light: [string, string, string]; dark: [string, string, string] }> = {
  blue: { name: 'Blue', light: ['#E7EFFE', '#1D4ED8', '#3B82F6'], dark: ['#13254A', '#93C5FD', '#60A5FA'] },
  teal: { name: 'Teal', light: ['#E0F5F1', '#0F766E', '#0D9488'], dark: ['#0D2E2B', '#5EEAD4', '#2DD4BF'] },
  green: { name: 'Green', light: ['#E6F6EA', '#166534', '#16A34A'], dark: ['#10301C', '#86EFAC', '#4ADE80'] },
  lime: { name: 'Olive', light: ['#F0F7DD', '#3F6212', '#4D7C0F'], dark: ['#222F0C', '#BEF264', '#A3E635'] },
  amber: { name: 'Amber', light: ['#FDF1D8', '#92400E', '#B45309'], dark: ['#33240A', '#FCD34D', '#FBBF24'] },
  orange: { name: 'Orange', light: ['#FDEBDD', '#9A3412', '#EA580C'], dark: ['#371C0B', '#FDBA74', '#FB923C'] },
  red: { name: 'Red', light: ['#FDE6E6', '#B91C1C', '#EF4444'], dark: ['#381616', '#FCA5A5', '#F87171'] },
  pink: { name: 'Pink', light: ['#FCE6F2', '#BE185D', '#EC4899'], dark: ['#371329', '#F9A8D4', '#F472B6'] },
  purple: { name: 'Purple', light: ['#F2E7FE', '#7E22CE', '#A855F7'], dark: ['#2A1742', '#D8B4FE', '#C084FC'] },
  indigo: { name: 'Indigo', light: ['#E7E9FD', '#4338CA', '#6366F1'], dark: ['#1C1F47', '#A5B4FC', '#818CF8'] },
  cyan: { name: 'Cyan', light: ['#E0F4FA', '#0E7490', '#0891B2'], dark: ['#0A2F38', '#67E8F9', '#22D3EE'] },
  slate: { name: 'Slate', light: ['#ECEFF4', '#475569', '#64748B'], dark: ['#232A38', '#CBD5E1', '#94A3B8'] },
};

/** The CSS variables, written once into <head> the first time this module loads. */
function installKindColours(): void {
  if (typeof document === 'undefined' || document.getElementById('cf-hrms-kind-colours')) return;
  const vars = (t: 'light' | 'dark') =>
    KIND_COLOURS.map((k) => {
      const [fill, text, edge] = KIND_PALETTE[k][t];
      return `--kind-${k}-fill:${fill};--kind-${k}-text:${text};--kind-${k}-edge:${edge};`;
    }).join('');
  const style = document.createElement('style');
  style.id = 'cf-hrms-kind-colours';
  style.textContent =
    `html[data-ui='platform']{${vars('light')}}` +
    `html[data-ui='platform'][data-theme='dark'],html[data-ui='platform'] [data-theme='dark']{${vars('dark')}}`;
  document.head.appendChild(style);
}
installKindColours();

export interface KindColour {
  key: KindColourKey;
  /** "Teal" — for the picker. */
  name: string;
  /** CSS colours that follow the theme (CSS variables). */
  fill: string;
  text: string;
  edge: string;
  /** The swatch in a picker: the edge colour. */
  swatch: string;
  /** Plain hex per theme, for an export that cannot read CSS variables (a PNG / SVG of the chart). */
  light: { fill: string; text: string; edge: string };
  dark: { fill: string; text: string; edge: string };
}

const isKey = (v: unknown): v is KindColourKey => typeof v === 'string' && (KIND_COLOURS as readonly string[]).includes(v);

/**
 * A kind's colours, from its label (its `colour`) or a key. Null for no
 * colour (a label from an older server, an unknown key) — draw it plainly.
 */
export function kindColour(labelOrKey: { colour?: string | null } | string | null | undefined): KindColour | null {
  const key = typeof labelOrKey === 'string' ? labelOrKey.trim().toLowerCase() : labelOrKey?.colour ?? null;
  if (!isKey(key)) return null;
  const p = KIND_PALETTE[key];
  const triple = ([fill, text, edge]: [string, string, string]) => ({ fill, text, edge });
  return {
    key,
    name: p.name,
    fill: `var(--kind-${key}-fill, ${p.light[0]})`,
    text: `var(--kind-${key}-text, ${p.light[1]})`,
    edge: `var(--kind-${key}-edge, ${p.light[2]})`,
    swatch: `var(--kind-${key}-edge, ${p.light[2]})`,
    light: triple(p.light),
    dark: triple(p.dark),
  };
}

/** The colours of the kind with this id, from the company's list (null when unknown). */
export function kindColourOf(labels: DepartmentLabel[], labelId: number | null | undefined): KindColour | null {
  if (labelId == null) return null;
  return kindColour(labels.find((l) => l.id === labelId) ?? null);
}

/** Inline styles for a small kind chip / tag: fill, text, a hairline edge. Empty for no colour. */
export function kindChipSx(colour: KindColour | null): Record<string, string> {
  if (!colour) return {};
  return { background: colour.fill, color: colour.text, borderColor: colour.edge };
}
