/**
 * TaxonomyPicker — the cascading Category / Group / Sub-group selects.
 *
 * Existed five times (EU-16 item 4): the item quick-add dialog, the item
 * detail page, the Items tab's filter bar, and twice more inside the
 * taxonomy-add forms. Each copy reimplemented the same cascade rule —
 * changing Category clears a Group/Sub-group that no longer belongs to it,
 * and changing Group clears a mismatched Sub-group — which is exactly the
 * kind of rule that quietly drifts apart across five places. This is now the
 * one place it lives.
 */
import { useMemo } from 'react';
import { Box, MenuItem, Select, Typography } from '@mui/material';
import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../types';

export interface TaxonomyValue {
  categoryId: number | null;
  groupId: number | null;
  subgroupId: number | null;
}

/** Sentinel option value for "+ Add new…" — never a real taxonomy id. */
export const TAXONOMY_ADD_NEW = '__add_new__';

export interface TaxonomyPickerProps {
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  value: TaxonomyValue;
  onChange: (next: TaxonomyValue) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  /** Category gets a required marker + error styling. */
  required?: boolean;
  categoryError?: string;
  /** "None" in a form, "All" in a filter bar. */
  emptyLabel?: string;
  /** Renders a "+ Add new…" row per level and calls back instead of selecting it. */
  onAddNew?: (level: 'category' | 'group' | 'subgroup') => void;
  /** Per-option item counts, right-aligned — the filter bar's own use. */
  counts?: { category?: Map<number, number>; group?: Map<number, number>; subgroup?: Map<number, number> };
  /** Column captions above each select. Omit to render bare selects (a dialog row that already has its own field label). */
  labels?: { category?: string; group?: string; subgroup?: string };
  /** Hide the Sub-group select — the taxonomy-add forms only ever go one level deep. */
  hideSubgroup?: boolean;
}

function Count({ n }: { n: number }) {
  return (
    <Typography component="span" sx={{ ml: 'auto', pl: 1.5, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--c-text-3)', opacity: n ? 1 : 0.55 }}>
      {n}
    </Typography>
  );
}

export function TaxonomyPicker({
  categories, groups, subgroups, value, onChange, disabled, size = 'small',
  required, categoryError, emptyLabel = 'None', onAddNew, counts, labels, hideSubgroup,
}: TaxonomyPickerProps) {
  const availableGroups = useMemo(
    () => groups.filter((g) => !value.categoryId || g.categoryId === value.categoryId),
    [groups, value.categoryId],
  );
  const availableSubgroups = useMemo(
    () => subgroups.filter((s) => !value.groupId || s.groupId === value.groupId),
    [subgroups, value.groupId],
  );

  function onCategoryChange(raw: string) {
    if (raw === TAXONOMY_ADD_NEW) { onAddNew?.('category'); return; }
    const categoryId = raw === '' ? null : Number(raw);
    const groupOk = value.groupId != null && groups.some((g) => g.id === value.groupId && g.categoryId === categoryId);
    onChange({
      categoryId,
      groupId: groupOk ? value.groupId : null,
      subgroupId: groupOk ? value.subgroupId : null,
    });
  }
  function onGroupChange(raw: string) {
    if (raw === TAXONOMY_ADD_NEW) { onAddNew?.('group'); return; }
    const groupId = raw === '' ? null : Number(raw);
    const sgOk = value.subgroupId != null && subgroups.some((s) => s.id === value.subgroupId && s.groupId === groupId);
    onChange({ ...value, groupId, subgroupId: sgOk ? value.subgroupId : null });
  }
  function onSubgroupChange(raw: string) {
    if (raw === TAXONOMY_ADD_NEW) { onAddNew?.('subgroup'); return; }
    onChange({ ...value, subgroupId: raw === '' ? null : Number(raw) });
  }

  // Only Category is ever required — Group and Sub-group stay optional even
  // when `required` is set, so only the first field's label earns the `*`.
  const field = (label: string | undefined, control: React.ReactNode, error?: string, isRequired?: boolean) => (
    <Box sx={{ flex: 1 }}>
      {label && (
        <Typography variant="caption" color="text.secondary">
          {label}{isRequired && label ? ' *' : ''}
        </Typography>
      )}
      {control}
      {error && <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{error}</Typography>}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', gap: 2 }}>
      {field(labels?.category, (
        <Select fullWidth size={size} displayEmpty disabled={disabled} value={value.categoryId ?? ''}
          error={!!categoryError} onChange={(e) => onCategoryChange(String(e.target.value))}>
          <MenuItem value="" disabled={required}><em>{emptyLabel}</em></MenuItem>
          {categories.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}{counts?.category && <Count n={counts.category.get(c.id) ?? 0} />}
            </MenuItem>
          ))}
          {onAddNew && <MenuItem value={TAXONOMY_ADD_NEW}><em>+ Add new…</em></MenuItem>}
        </Select>
      ), categoryError, required)}

      {field(labels?.group, (
        <Select fullWidth size={size} displayEmpty disabled={disabled} value={value.groupId ?? ''}
          onChange={(e) => onGroupChange(String(e.target.value))}>
          <MenuItem value=""><em>{emptyLabel}</em></MenuItem>
          {availableGroups.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {g.name}{counts?.group && <Count n={counts.group.get(g.id) ?? 0} />}
            </MenuItem>
          ))}
          {onAddNew && <MenuItem value={TAXONOMY_ADD_NEW}><em>+ Add new…</em></MenuItem>}
        </Select>
      ))}

      {!hideSubgroup && field(labels?.subgroup, (
        <Select fullWidth size={size} displayEmpty disabled={disabled} value={value.subgroupId ?? ''}
          onChange={(e) => onSubgroupChange(String(e.target.value))}>
          <MenuItem value=""><em>{emptyLabel}</em></MenuItem>
          {availableSubgroups.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}{counts?.subgroup && <Count n={counts.subgroup.get(s.id) ?? 0} />}
            </MenuItem>
          ))}
          {onAddNew && <MenuItem value={TAXONOMY_ADD_NEW}><em>+ Add new…</em></MenuItem>}
        </Select>
      ))}
    </Box>
  );
}
