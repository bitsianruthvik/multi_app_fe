/**
 * Org units on the screens (CF_HRMS_HIRING_SPEC.md §33, 2026-10-24).
 *
 * Everything in the structure is an ORG UNIT (the tables still say
 * "department"); what it is comes from its ONE label, shown as its KIND:
 * Department, Section, Machine, or the company's own words. People were
 * confusing a department, a section and a machine when all three were called
 * "department", so every value names its kind: "Printing 2 (Machine)".
 *
 *   unitLabel(name, kind)   "Printing 2 (Machine)"; the plain name without a kind
 *   useUnitKinds()          a function that adds the kind to a name a list row
 *                           carries (by id when it has one, else by a unique name)
 *   forgetUnitKinds()       after a unit is added, renamed or re-kinded
 *   nextKindDown()          "Add under this": the kind after the parent's, in the kinds' order
 *
 * The kinds come from GET /organisation/departments, read once per company and
 * shared by every screen. A login that may not read it sees plain names.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCompanySlug } from '@shared/ui';
import { orgApi, type Department, type DepartmentLabel } from '../api/organisation';
import { kindColour } from './labels';
import type { FilterOption } from './list/ListToolbar';

/** "Printing 2 (Machine)". */
export function unitLabel(name: string | null | undefined, kind: string | null | undefined): string {
  const n = (name ?? '').trim();
  const k = (kind ?? '').trim();
  if (!n) return '';
  return k ? `${n} (${k})` : n;
}

/**
 * A kind inside a sentence: "New machine under Printing". An ordinary word is
 * lower-cased ("Machine" → "machine", "Shop Floor" → "shop floor"); a word with
 * capitals inside it is left alone ("CNC Cell", "QA").
 */
export function kindWord(kind: string | null | undefined): string {
  const k = (kind ?? '').trim();
  if (!k) return 'org unit';
  return k
    .split(/\s+/)
    .map((w) => (/^[A-Z]?[^A-Z]*$/.test(w) ? w.toLowerCase() : w))
    .join(' ');
}

/** "Machine · Nord / Uflex" — how the Org units list leads a row. */
export function kindAndName(name: string, kind: string | null | undefined): string {
  return kind ? `${kind} · ${name}` : name;
}

/**
 * "Add under this": if the parent's kind is at index i of the ordered kinds,
 * suggest i + 1; at the end of the list (or not in it), the parent's own kind.
 */
export function nextKindDown<T extends { id: number }>(kinds: T[], parentKindId: number | null | undefined): T | null {
  if (!kinds.length) return null;
  const i = kinds.findIndex((k) => k.id === parentKindId);
  if (i < 0) return kinds[0];
  return kinds[Math.min(i + 1, kinds.length - 1)];
}

interface KindIndex {
  byId: Map<number, string>;
  /** Only names that are unique in the company: a name used twice is left plain. */
  byName: Map<string, string>;
}

const cache = new Map<string, Promise<KindIndex>>();
const EMPTY: KindIndex = { byId: new Map(), byName: new Map() };

function build(rows: Department[]): KindIndex {
  const byId = new Map<number, string>();
  const seen = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.type) continue;
    byId.set(r.id, r.type);
    const key = r.name.trim().toLowerCase();
    seen.set(key, seen.has(key) && seen.get(key) !== r.type ? null : r.type);
  }
  const byName = new Map<string, string>();
  for (const [k, v] of seen) if (v) byName.set(k, v);
  return { byId, byName };
}

/** Drop the cached kinds (call after a unit is added, renamed, moved or re-kinded). */
export function forgetUnitKinds(): void {
  cache.clear();
}

/**
 * `withKind(name, id?)` → "Printing 2 (Machine)". Until the kinds arrive, or
 * when the login may not read the org units, the plain name.
 */
export function useUnitKinds(enabled = true): (name: string | null | undefined, id?: number | null) => string {
  const company = useCompanySlug() || '';
  const [index, setIndex] = useState<KindIndex>(EMPTY);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    let p = cache.get(company);
    if (!p) {
      p = orgApi.departments.list().then(build).catch(() => EMPTY);
      cache.set(company, p);
    }
    void p.then((i) => { if (live) setIndex(i); });
    return () => { live = false; };
  }, [company, enabled]);
  return useMemo(
    () => (name: string | null | undefined, id?: number | null) => {
      if (!name) return name ?? '';
      const kind = (id != null ? index.byId.get(id) : undefined) ?? index.byName.get(name.trim().toLowerCase());
      return unitLabel(name, kind);
    },
    [index],
  );
}

/* ── "Org unit (and below)" filters: one or more units (spec §34.2) ── */

/** The units as filter options: tree order, "Name (Kind)", indented, each in its kind's colour. */
export function orgUnitOptions(rows: Department[], labels: DepartmentLabel[] = []): FilterOption[] {
  const byLabel = new Map(labels.map((l) => [l.id, l]));
  return rows.map((r) => ({
    value: String(r.id),
    label: unitLabel(r.name, r.type),
    depth: r.depth,
    colour: r.labelId != null ? kindColour(byLabel.get(r.labelId) ?? null) : null,
  }));
}

/** The company's org units as options (and [] for a login that may not read them). */
export function useOrgUnitOptions(enabled = true): FilterOption[] {
  const [state, setState] = useState<{ rows: Department[]; labels: DepartmentLabel[] }>({ rows: [], labels: [] });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    Promise.all([orgApi.departments.list(), orgApi.departmentLabels.list().catch(() => [] as DepartmentLabel[])])
      .then(([rows, labels]) => { if (live) setState({ rows, labels }); })
      .catch(() => { if (live) setState({ rows: [], labels: [] }); });
    return () => { live = false; };
  }, [enabled]);
  return useMemo(() => orgUnitOptions(state.rows, state.labels), [state]);
}

