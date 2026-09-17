/**
 * TaxonomyTree — Category → Group → Sub-group as ONE tree, replacing the three
 * flat list tabs (`TaxonomyTab`'s old list component). Every node shows how
 * many catalog items sit on it; clicking a node opens its detail dialog;
 * "+ group" / "+ sub-group" add a child under that node; delete goes through
 * the existing confirm + in-use check.
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { Box, Button, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import type { FabItemCategory, FabItemGroup, FabItemSubgroup } from '../../types';
import type { TaxonomyCounts } from '../../api/catalogDetail';
import { EmptyState, Mono, StatusBadge } from '../../components';

export type TaxonomyLevel = 'category' | 'group' | 'subgroup';
export type TaxonomyEntity = FabItemCategory | FabItemGroup | FabItemSubgroup;

/** Where a "+ add" click wants its child filed. */
export interface TaxonomyAddTarget {
  level: TaxonomyLevel;
  categoryId?: number | null;
  groupId?: number | null;
}

const LEVEL_LABEL: Record<TaxonomyLevel, string> = { category: 'Category', group: 'Group', subgroup: 'Sub-group' };

function itemsLabel(n: number | undefined) {
  const v = n ?? 0;
  return `${v} item${v === 1 ? '' : 's'}`;
}

/**
 * One row of the tree. Declared at module level, not inside `TaxonomyTree`,
 * so React keeps the same component type between renders.
 */
function TreeRow({
  level, entity, count, depth, expandable, expanded, onToggle, onOpen, onAddChild, onDelete, canEdit, secondary,
}: {
  level: TaxonomyLevel;
  entity: TaxonomyEntity;
  count: number | undefined;
  depth: 0 | 1 | 2;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAddChild?: () => void;
  onDelete?: () => void;
  canEdit: boolean;
  secondary?: string;
}) {
  const childLabel = level === 'category' ? 'group' : level === 'group' ? 'sub-group' : null;
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        pl: 1 + depth * 3, pr: 1, py: 0.75,
        borderBottom: '1px solid var(--c-divider)',
        '&:hover': { background: 'var(--c-surface-2)' },
        '&:hover .tree-actions': { opacity: 1 },
      }}
    >
      <IconButton
        size="small" onClick={onToggle} disabled={!expandable}
        aria-label={expanded ? 'Collapse' : 'Expand'}
        sx={{ width: 28, height: 28, visibility: expandable ? 'visible' : 'hidden' }}
      >
        {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
      </IconButton>
      <Box
        role="button" tabIndex={0} onClick={onOpen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
      >
        <Typography sx={{ fontSize: depth === 0 ? 14 : 13, fontWeight: depth === 0 ? 600 : 500, color: 'var(--c-text)', whiteSpace: 'nowrap' }}>
          {entity.name}
        </Typography>
        <Mono chip>{entity.code}</Mono>
        {secondary && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {secondary}
          </Typography>
        )}
      </Box>
      <Typography sx={{ fontSize: 12, color: count ? 'var(--c-text-2)' : 'var(--c-text-3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {itemsLabel(count)}
      </Typography>
      {entity.isSystem === 1 && <StatusBadge status="System" family="info" />}
      <Box className="tree-actions" sx={{ display: 'flex', gap: 0.25, opacity: 0.4, transition: 'opacity .12s', minWidth: canEdit ? 130 : 0, justifyContent: 'flex-end' }}>
        {canEdit && childLabel && onAddChild && (
          <Button size="small" startIcon={<AddIcon />} onClick={onAddChild} sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>
            {childLabel}
          </Button>
        )}
        {canEdit && entity.isSystem === 0 && onDelete && (
          <Tooltip title={`Delete ${LEVEL_LABEL[level].toLowerCase()}`}>
            <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

type GroupRow = { grp: FabItemGroup; subs: FabItemSubgroup[] };
type CatRow = { cat: FabItemCategory; groups: GroupRow[] };

export function TaxonomyTree({
  categories, groups, subgroups, counts, canEdit, onNodeClick, onAddClick, onDeleteClick,
}: {
  categories: FabItemCategory[];
  groups: FabItemGroup[];
  subgroups: FabItemSubgroup[];
  counts: TaxonomyCounts | null;
  canEdit: boolean;
  onNodeClick: (level: TaxonomyLevel, entity: TaxonomyEntity) => void;
  onAddClick: (target: TaxonomyAddTarget) => void;
  onDeleteClick: (level: TaxonomyLevel, entity: TaxonomyEntity) => void;
}) {
  const [search, setSearch] = useState('');
  const [openCats, setOpenCats] = useState<Set<number>>(() => new Set());
  const [openGroups, setOpenGroups] = useState<Set<number>>(() => new Set());

  const groupsByCat = useMemo(() => {
    const m = new Map<number, FabItemGroup[]>();
    for (const g of groups) { const arr = m.get(g.categoryId) ?? []; arr.push(g); m.set(g.categoryId, arr); }
    return m;
  }, [groups]);
  const subsByGroup = useMemo(() => {
    const m = new Map<number, FabItemSubgroup[]>();
    for (const s of subgroups) { const arr = m.get(s.groupId) ?? []; arr.push(s); m.set(s.groupId, arr); }
    return m;
  }, [subgroups]);

  /**
   * A search keeps a node if it, or anything under it, matches — and shows
   * every ancestor of a match open so the hit is on screen, not folded away.
   * A matching parent shows its whole subtree.
   */
  const q = search.trim().toLowerCase();
  const visible = useMemo<CatRow[]>(() => {
    const hit = (e: TaxonomyEntity) => !q || e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
    const fullGroup = (grp: FabItemGroup): GroupRow => ({ grp, subs: subsByGroup.get(grp.id) ?? [] });
    const out: CatRow[] = [];
    for (const cat of categories) {
      const allGroups = groupsByCat.get(cat.id) ?? [];
      if (!q || hit(cat)) { out.push({ cat, groups: allGroups.map(fullGroup) }); continue; }
      const grpRows: GroupRow[] = [];
      for (const grp of allGroups) {
        if (hit(grp)) { grpRows.push(fullGroup(grp)); continue; }
        const subs = (subsByGroup.get(grp.id) ?? []).filter(hit);
        if (subs.length) grpRows.push({ grp, subs });
      }
      if (grpRows.length) out.push({ cat, groups: grpRows });
    }
    return out;
  }, [categories, groupsByCat, subsByGroup, q]);

  const isCatOpen = (id: number) => (q ? true : openCats.has(id));
  const isGrpOpen = (id: number) => (q ? true : openGroups.has(id));
  const toggle = (set: Dispatch<SetStateAction<Set<number>>>, id: number) =>
    set((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  function expandAll() {
    setOpenCats(new Set(categories.map((c) => c.id)));
    setOpenGroups(new Set(groups.map((g) => g.id)));
  }
  function collapseAll() { setOpenCats(new Set()); setOpenGroups(new Set()); }

  if (categories.length === 0) {
    return (
      <EmptyState
        title="No categories yet"
        hint="A category is the top level of the taxonomy. Add one to start filing items."
        action={canEdit ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => onAddClick({ level: 'category' })}>Add category</Button> : undefined}
      />
    );
  }

  const emptyLine = (depth: number, text: string) => (
    <Typography sx={{ pl: 1 + depth * 3 + 4.5, py: 0.75, fontSize: 12, color: 'var(--c-text-3)', borderBottom: '1px solid var(--c-divider)' }}>
      {text}
    </Typography>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          size="small" placeholder="Find a category, group or sub-group…" value={search}
          onChange={(e) => setSearch(e.target.value)} sx={{ width: 320 }}
        />
        <Button size="small" onClick={expandAll} disabled={!!q}>Expand all</Button>
        <Button size="small" onClick={collapseAll} disabled={!!q}>Collapse all</Button>
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => onAddClick({ level: 'category' })}>Add category</Button>
        )}
      </Box>

      <Box sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflow: 'hidden' }}>
        {visible.length === 0 && (
          <Box sx={{ p: 3 }}><EmptyState title="Nothing matches" hint="Try a different name or code." /></Box>
        )}
        {visible.map(({ cat, groups: grpRows }) => (
          <Box key={cat.id}>
            <TreeRow
              level="category" entity={cat} depth={0}
              count={counts?.categories[String(cat.id)]}
              expandable={(groupsByCat.get(cat.id)?.length ?? 0) > 0}
              expanded={isCatOpen(cat.id)}
              onToggle={() => toggle(setOpenCats, cat.id)}
              onOpen={() => onNodeClick('category', cat)}
              onAddChild={() => onAddClick({ level: 'group', categoryId: cat.id })}
              onDelete={() => onDeleteClick('category', cat)}
              canEdit={canEdit}
              secondary={cat.description ?? undefined}
            />
            {isCatOpen(cat.id) && grpRows.map(({ grp, subs }) => (
              <Box key={grp.id}>
                <TreeRow
                  level="group" entity={grp} depth={1}
                  count={counts?.groups[String(grp.id)]}
                  expandable={(subsByGroup.get(grp.id)?.length ?? 0) > 0}
                  expanded={isGrpOpen(grp.id)}
                  onToggle={() => toggle(setOpenGroups, grp.id)}
                  onOpen={() => onNodeClick('group', grp)}
                  onAddChild={() => onAddClick({ level: 'subgroup', categoryId: cat.id, groupId: grp.id })}
                  onDelete={() => onDeleteClick('group', grp)}
                  canEdit={canEdit}
                  secondary={grp.description ?? undefined}
                />
                {isGrpOpen(grp.id) && subs.map((sub) => (
                  <TreeRow
                    key={sub.id}
                    level="subgroup" entity={sub} depth={2}
                    count={counts?.subgroups[String(sub.id)]}
                    expandable={false} expanded={false}
                    onToggle={() => undefined}
                    onOpen={() => onNodeClick('subgroup', sub)}
                    onDelete={() => onDeleteClick('subgroup', sub)}
                    canEdit={canEdit}
                    secondary={sub.description ?? undefined}
                  />
                ))}
                {isGrpOpen(grp.id) && subs.length === 0 && !q && emptyLine(2, 'No sub-groups in this group.')}
              </Box>
            ))}
            {isCatOpen(cat.id) && grpRows.length === 0 && !q && emptyLine(1, 'No groups in this category.')}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
