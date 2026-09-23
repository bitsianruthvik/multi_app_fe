import { useMemo } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import type { Tree } from '../api/types';
import { flattenTree } from '../lib/tree';

/**
 * Picks a classification node. `leafOnly` limits it to Variants (where items
 * and definitions sit); `scope` hides nodes scoped to the other kind — a
 * picker filter only, never a rule (decision Q6). Machine families are a rule:
 * they show only with scope 'machine', and only they do.
 */
export function ClassificationPicker({
  tree, value, onChange, label = 'Variant', leafOnly = true, scope, disabled, helperText, error, required, autoFocus,
}: {
  tree: Tree | null;
  value: number | null;
  onChange: (id: number | null) => void;
  label?: string;
  leafOnly?: boolean;
  scope?: 'item' | 'definition' | 'machine';
  disabled?: boolean;
  helperText?: string;
  error?: boolean;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const options = useMemo(() => {
    const all = flattenTree(tree);
    const offered = all.filter((n) => {
      if ((leafOnly && !n.isLeaf) || n.status !== 'active') return false;
      if (scope === 'machine') return n.scope === 'machine';
      return n.scope !== 'machine' && (!scope || n.scope === 'both' || n.scope === scope);
    });
    // The node already on the record stays on the list even when the filters
    // would drop it (it went inactive, say) — otherwise the picker reads empty
    // and looks as if nothing is set.
    const current = value != null && !offered.some((o) => o.id === value) ? all.find((n) => n.id === value) : null;
    return current ? [current, ...offered] : offered;
  }, [tree, leafOnly, scope, value]);
  const selected = options.find((o) => o.id === value) ?? null;
  return (
    <Autocomplete
      options={options}
      value={selected}
      disabled={disabled}
      groupBy={(o) => o.family}
      getOptionLabel={(o) => o.path}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onChange={(_, o) => onChange(o?.id ?? null)}
      renderInput={(params) => <TextField {...params} label={label} helperText={helperText} error={error} required={required} autoFocus={autoFocus} />}
      size="small"
      fullWidth
    />
  );
}
