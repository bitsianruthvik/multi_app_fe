import { useCallback, useMemo } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import type { NodeScope, Tree, TreeNode } from '../api/types';

/** The level names when the tree did not bring its own (services/tree.js `LEVELS`). */
const FALLBACK_LEVELS = ['Family', 'Subfamily', 'Variant'];

interface Node {
  id: number;
  parentId: number | null;
  depth: number;
  name: string;
  status: 'active' | 'inactive';
  scope: NodeScope;
}

function flatten(tree: Tree | null): Node[] {
  const out: Node[] = [];
  const walk = (n: TreeNode) => {
    out.push({ id: n.id, parentId: n.parentId, depth: n.depth, name: n.name, status: n.status, scope: n.scope });
    n.children.forEach(walk);
  };
  (tree?.roots ?? []).forEach(walk);
  return out;
}

/**
 * One filter per classification level — Family, Subfamily, Variant — where a
 * choice at any level narrows the others.
 *
 * It is one value underneath, not three: the **deepest** level chosen, which is
 * also what the list sends as `classificationId` (the backend filters on that
 * node's whole subtree, so a Family filters to everything under it — see
 * `listRecords` in masterRecordService.js). Everything else follows from that
 * one id:
 *
 *   - choosing a level sets it and clears the levels below, because a Variant
 *     under a different Subfamily is no longer reachable;
 *   - the levels *above* are read back off the chosen node, so picking a
 *     Variant on its own fills its Subfamily and Family in rather than leaving
 *     them blank;
 *   - clearing a level falls back to the nearest level above it that is still
 *     chosen, so a Family survives its Subfamily being cleared.
 *
 * Scope is deliberately not filtered beyond machines: it is a picker hint, not
 * a rule (the backend's `requireLeaf` never checks it), so a filter that hid an
 * 'item' Variant from the definitions list could hide rows that really are
 * there.
 */
export function ClassificationLevelFilter({ tree, value, onChange }: {
  tree: Tree | null;
  /** The deepest level chosen — the single id the list filters by. */
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const levels = tree?.levels?.length ? tree.levels : FALLBACK_LEVELS;
  const nodes = useMemo(() => flatten(tree), [tree]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /** What each level shows: the chosen node's whole chain, root first. */
  const picked = useMemo(() => {
    const out: (number | null)[] = levels.map(() => null);
    let node = value != null ? byId.get(value) : undefined;
    // A malformed parent chain must not spin: the tree is only `levels` deep.
    for (let hop = 0; node && hop <= levels.length; hop += 1) {
      if (node.depth < out.length) out[node.depth] = node.id;
      node = node.parentId != null ? byId.get(node.parentId) : undefined;
    }
    return out;
  }, [value, byId, levels]);

  /** The nearest level above `depth` that is still chosen — what narrows it. */
  const narrowedBy = useCallback((depth: number): number | null => {
    for (let d = depth - 1; d >= 0; d -= 1) if (picked[d] != null) return picked[d];
    return null;
  }, [picked]);

  const descendsFrom = useCallback((node: Node, ancestorId: number) => {
    let current: Node | undefined = node;
    for (let hop = 0; current && hop <= levels.length; hop += 1) {
      if (current.id === ancestorId) return true;
      current = current.parentId != null ? byId.get(current.parentId) : undefined;
    }
    return false;
  }, [byId, levels.length]);

  return (
    <Box sx={{ display: 'flex', gap: 1, flex: '1 1 480px', minWidth: 0, flexWrap: 'wrap' }}>
      {levels.map((label, depth) => {
        const above = narrowedBy(depth);
        const options = nodes.filter((n) => n.depth === depth
          // A Family narrows the Variants to its grandchildren even with no
          // Subfamily chosen — whatever is chosen highest still applies.
          && (above == null || descendsFrom(n, above))
          // Machine families hold machine types, never items or definitions;
          // the Machines screen has its own filter for those. An inactive node
          // is not offered either — but whatever is already being filtered on
          // stays on its list, so the box never reads empty while it filters.
          && ((n.scope !== 'machine' && n.status === 'active') || n.id === picked[depth]));
        const selected = options.find((o) => o.id === picked[depth]) ?? null;
        return (
          <Autocomplete<Node>
            key={label}
            size="small"
            options={options}
            value={selected}
            getOptionLabel={(o) => (o.status === 'inactive' ? `${o.name} (inactive)` : o.name)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, o) => onChange(o ? o.id : narrowedBy(depth))}
            sx={{ flex: '1 1 148px', minWidth: 140 }}
            renderInput={(params) => <TextField {...params} label={label} placeholder="Any" />}
          />
        );
      })}
    </Box>
  );
}
