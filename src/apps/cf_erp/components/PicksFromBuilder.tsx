import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StarBorderRounded from '@mui/icons-material/StarBorderRounded';
import type { MasterRecord, Tree } from '../api/types';
import { flattenTree } from '../lib/tree';
import { ClassificationPicker } from './ClassificationPicker';
import { RecordPicker } from './RecordPicker';
import { Mono } from './ui';
import type { PendingEntry } from '../lib/picksFrom';

/**
 * The "Picks from" list of a selection that is still being created: branches
 * (any level, covering everything filed under them) and single catalog items,
 * the first item starred as the default. Nothing is saved until Create.
 */
export function PicksFromBuilder({ tree, value, onChange }: { tree: Tree | null; value: PendingEntry[]; onChange: (next: PendingEntry[]) => void }) {
  const [node, setNode] = useState<number | null>(null);
  const [item, setItem] = useState<MasterRecord | null>(null);
  const flat = flattenTree(tree);

  const addNode = () => {
    if (node == null || value.some((e) => e.kind === 'node' && e.nodeId === node)) return;
    const f = flat.find((n) => n.id === node);
    onChange([...value, { kind: 'node', nodeId: node, label: f?.name ?? `Branch ${node}`, path: f?.path ?? '' }]);
    setNode(null);
  };
  const addItem = () => {
    if (!item) return;
    // The first item becomes the default unless one is already starred.
    const hasDefault = value.some((e) => e.kind === 'item' && e.isDefault);
    onChange([...value, { kind: 'item', itemId: item.id, label: item.name, code: item.code, isDefault: !hasDefault }]);
    setItem(null);
  };
  const star = (i: number) => onChange(value.map((e, k) => (e.kind !== 'item' ? e : { ...e, isDefault: k === i ? !e.isDefault : false })));

  return (
    <Box sx={{ gridColumn: '1 / -1' }}>
      <Typography sx={{ fontWeight: 600, fontSize: 13.5, mb: 0.25 }}>Picks from</Typography>
      <Typography sx={{ color: 'var(--c-text-2)', fontSize: 12.5, mb: 1 }}>
        Branches (everything filed under them) and single catalog items. It needs at least one entry before it can be activated.
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mb: 1 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ flex: 1 }}><ClassificationPicker tree={tree} value={node} onChange={setNode} leafOnly={false} label="Add branch" screen="items" /></Box>
          <Button startIcon={<AddRounded />} disabled={node == null} onClick={addNode}>Add</Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <RecordPicker kinds={['catalog']} value={item} onChange={setItem} label="Add item"
              excludeIds={value.flatMap((e) => (e.kind === 'item' ? [e.itemId] : []))} />
          </Box>
          <Button startIcon={<AddRounded />} disabled={!item} onClick={addItem}>Add</Button>
        </Box>
      </Box>
      {value.length === 0 ? (
        <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13 }}>Nothing yet. The first item added becomes the default.</Typography>
      ) : (
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          {value.map((e, i) => (
            <Box key={e.kind === 'node' ? `n${e.nodeId}` : `i${e.itemId}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.5, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
              {e.kind === 'node' ? (
                <>
                  <AccountTreeRounded fontSize="small" sx={{ color: 'var(--c-text-2)', mx: 0.75 }} />
                  <Box sx={{ flex: 1 }}>{e.label} <Mono muted>{e.path}</Mono></Box>
                </>
              ) : (
                <>
                  <Tooltip title={e.isDefault ? 'The default choice' : 'Make this the default'}>
                    <IconButton size="small" aria-label={e.isDefault ? 'Default' : `Make ${e.code ?? e.label} the default`} onClick={() => star(i)}>
                      {e.isDefault ? <StarRounded sx={{ color: 'var(--c-warning-600)' }} fontSize="small" /> : <StarBorderRounded fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Mono sx={{ minWidth: 120 }}>{e.code ?? '—'}</Mono>
                  <Box sx={{ flex: 1 }}>{e.label}</Box>
                </>
              )}
              <IconButton size="small" aria-label={`Remove ${e.label}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><DeleteOutlineRounded fontSize="small" /></IconButton>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
