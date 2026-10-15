/**
 * Filters that share ONE address param (FilterDef.partOf) — the label groups,
 * spec §15.3: `label=12,31` is the "Unit" filter holding 12 and the "Area"
 * filter holding 31. The server reads the param whole: labels of one group are
 * "any of", groups are "and".
 */
import type { FilterDef } from './ListToolbar';
import type { ListFilters } from './useListFilters';

/** The value a filter shows: its own part of a shared param, or the param itself. */
export function filterValue(def: FilterDef, filters: ListFilters): string {
  if (!def.partOf) return filters.values[def.key] ?? '';
  const mine = new Set(def.partOf.values);
  return (filters.values[def.partOf.param] ?? '').split(',').map((v) => v.trim()).find((v) => mine.has(v)) ?? '';
}

/** The address patch that sets (or clears, with null) one filter. */
export function filterPatch(def: FilterDef, filters: ListFilters, value: string | null): Record<string, string | null> {
  if (!def.partOf) return { [def.key]: value };
  const mine = new Set(def.partOf.values);
  const rest = (filters.values[def.partOf.param] ?? '').split(',').map((v) => v.trim()).filter((v) => v && !mine.has(v));
  const next = value ? [...rest, value] : rest;
  return { [def.partOf.param]: next.length ? next.join(',') : null };
}
