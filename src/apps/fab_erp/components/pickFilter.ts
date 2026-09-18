/**
 * pickFilter.ts — the plain data behind PickFilterFields, in its own module so
 * the component file exports components only (react-refresh).
 */
import type { PickFilterInput } from '../api/templates';

export interface PickTaxonomy {
  categories: { id: number; name: string }[];
  groups: { id: number; name: string; categoryId: number }[];
  subgroups: { id: number; name: string; groupId: number }[];
}

/** A filter while it is being edited — ids as '' until chosen. */
export interface PickDraft {
  categoryId: number | '';
  groupId: number | '';
  subgroupId: number | '';
  defaultItemId: number | null;
}

export const EMPTY_PICK: PickDraft = { categoryId: '', groupId: '', subgroupId: '', defaultItemId: null };

export const pickDraftOf = (p: PickFilterInput | null | undefined): PickDraft => (p
  ? { categoryId: p.categoryId, groupId: p.groupId ?? '', subgroupId: p.subgroupId ?? '', defaultItemId: p.defaultItemId ?? null }
  : EMPTY_PICK);

/** The draft as the server takes it, or null when no category is chosen yet. */
export const pickInputOf = (d: PickDraft): PickFilterInput | null => (d.categoryId === ''
  ? null
  : {
    categoryId: d.categoryId,
    groupId: d.groupId === '' ? null : d.groupId,
    subgroupId: d.subgroupId === '' ? null : d.subgroupId,
    defaultItemId: d.defaultItemId,
  });

/** One key per distinct filter, to load and cache its candidates once. */
export const pickFilterKey = (p: { categoryId: number; groupId?: number | null; subgroupId?: number | null }) =>
  `${p.categoryId}|${p.groupId ?? ''}|${p.subgroupId ?? ''}`;
