import { useMemo, useState } from 'react';
import { Box, Button, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import { cfApi } from '../api/client';
import type { LineStructure, StructureNode } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { recordPath } from '../lib/paths';
import { EmptyState, ErrorNotice, KindChip, Mono, SkeletonRows, StatStrip, StatusBadge, WarnBadge } from './ui';
import { AddChildDialog, EditLineDialog } from './BomDialogs';
import { ChooseItemDialog } from './ChooseItemDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { FlowTag } from './FlowTag';
import { useToast } from './toastContext';

const CUSTOM_KINDS = ['catalog', 'template', 'selection'] as const;

function flatten(root: StructureNode, open: Set<string>) {
  const rows: StructureNode[] = [];
  const walk = (n: StructureNode) => {
    rows.push(n);
    if (open.has(n.key)) n.children.forEach(walk);
  };
  walk(root);
  return rows;
}

function allKeys(root: StructureNode) {
  const keys: string[] = [];
  const walk = (n: StructureNode) => { if (n.children.length) keys.push(n.key); n.children.forEach(walk); };
  walk(root);
  return keys;
}

/**
 * The whole structure a sales line sells (DESIGN_SYSTEM.md §4.7 Hierarchy):
 * indented rows, each with its quantity per parent and its total for the line.
 * On an open order every temporary item can take new parts, every line can be
 * changed or removed, and every selection can have its catalog item chosen —
 * each change re-works the roll-ups above it and the inherited values below.
 */
export function StructureTree({ lineId, onChanged }: { lineId: number; onChanged?: () => void }) {
  const company = useCompanySlug();
  const toast = useToast();
  const data = useLoad(() => cfApi.get<LineStructure>(`/order-lines/${lineId}/structure`), [lineId]);
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; node: StructureNode } | null>(null);
  const [adding, setAdding] = useState<StructureNode | null>(null);
  const [editing, setEditing] = useState<StructureNode | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<StructureNode | null>(null);
  const refresh = () => { data.reload(); onChanged?.(); };

  const s = data.data;
  // Open everything the first time; after that the person's choice stands across reloads.
  const expanded = useMemo(() => open ?? new Set(s ? allKeys(s.root) : []), [open, s]);
  const rows = useMemo(() => (s ? flatten(s.root, expanded) : []), [s, expanded]);
  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key); else next.add(key);
    setOpen(next);
  };

  if (data.error) return <ErrorNotice error={data.error} onRetry={data.reload} />;
  if (!s) return <SkeletonRows rows={6} height={40} />;
  const editable = s.order.editable;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 1.5 }}>
      <StatStrip stats={[
        { label: 'In the structure', value: s.stats.nodes, hint: 'items and selections' },
        { label: 'Temporary items', value: s.stats.temporary, hint: 'made for this order' },
        { label: 'Still draft', value: s.stats.drafts, tone: 'warning', hint: 'release will need them active' },
        { label: 'Items to choose', value: s.stats.unresolved, tone: 'warning', hint: 'selections without an item' },
      ]} />
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<UnfoldMoreRounded />} onClick={() => setOpen(new Set(allKeys(s.root)))}>Expand all</Button>
        <Button size="small" startIcon={<UnfoldLessRounded />} onClick={() => setOpen(new Set([s.root.key]))}>Collapse</Button>
      </Box>
      {s.truncated && <WarnBadge label="Deeper levels not shown" title="The structure is deeper than this view goes." />}
      <Box role="tree" aria-label={`Structure of line ${s.line.lineNo}`} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflowX: 'auto' }}>
        <Box sx={{ minWidth: 720 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 90px 110px 44px', gap: 1, px: 1.5, py: 1, borderBottom: '1px solid var(--c-divider)', color: 'var(--c-text-3)', fontSize: 12, fontWeight: 600 }}>
            <span>Item</span><Box sx={{ textAlign: 'right' }}>Per parent</Box><Box sx={{ textAlign: 'right' }}>For the line</Box><span>Status</span><span />
          </Box>
          {rows.map((n) => {
            const hasKids = n.children.length > 0;
            const isOpen = expanded.has(n.key);
            const canAdd = editable && n.kind === 'temporary';
            const canChange = editable && n.lineId != null;
            return (
              <Box key={n.key} role="treeitem" aria-level={n.depth + 1} aria-expanded={hasKids ? isOpen : undefined}
                sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 90px 110px 44px', gap: 1, alignItems: 'center', px: 1.5, py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:hover': { background: 'var(--c-surface-2)' }, '&:last-of-type': { borderBottom: 0 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, pl: n.depth * 2.25 }}>
                  {hasKids ? (
                    <IconButton size="small" aria-label={isOpen ? `Collapse ${n.code ?? n.name}` : `Expand ${n.code ?? n.name}`} onClick={() => toggle(n.key)} sx={{ p: 0.25 }}>
                      {isOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                    </IconButton>
                  ) : <Box sx={{ width: 26, flexShrink: 0 }} />}
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Mono><Link to={appPath(company, recordPath(n.kind, n.id))}>{n.code ?? '—'}</Link></Mono>
                      <KindChip kind={n.kind} />
                      <FlowTag flow={n.flow} />
                      {n.selection && !n.resolved && <WarnBadge label="Choose item" title={`Choose a catalog item for ${n.selection.code ?? n.selection.name}.`} />}
                    </Box>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.name}{n.role ? ` · ${n.role}` : ''}{n.selection && n.resolved ? ` · for ${n.selection.code ?? n.selection.name}` : ''}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right' }}><Mono>{n.depth === 0 ? '—' : `×${n.quantity}`}</Mono></Box>
                <Box sx={{ textAlign: 'right' }}><Mono>{n.total}</Mono>{n.uom && <Mono muted> {n.uom}</Mono>}</Box>
                <Box><StatusBadge status={n.status} /></Box>
                <Box>
                  {(canAdd || canChange || (editable && n.selection)) && (
                    <Tooltip title="Actions">
                      <IconButton size="small" aria-label={`Actions for ${n.code ?? n.name}`} onClick={(e) => setMenu({ anchor: e.currentTarget, node: n })}><MoreVertRounded fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
            );
          })}
          {rows.length === 1 && !s.root.children.length && (
            <EmptyState title="Nothing below it yet" body={editable ? 'Add parts from the row’s menu.' : undefined} />
          )}
        </Box>
      </Box>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.node.kind === 'temporary' && editable && <MenuItem onClick={() => { setAdding(menu.node); setMenu(null); }}>Add a part…</MenuItem>}
        {menu?.node.selection && editable && <MenuItem onClick={() => { setChoosing(menu.node.lineId); setMenu(null); }}>Choose the item…</MenuItem>}
        {menu?.node.lineId != null && editable && <MenuItem onClick={() => { setEditing(menu.node); setMenu(null); }}>Change quantity, role or flow…</MenuItem>}
        {menu?.node.lineId != null && editable && <MenuItem onClick={() => { setRemoving(menu.node); setMenu(null); }} sx={{ color: 'var(--c-danger-700)' }}>Remove…</MenuItem>}
      </Menu>

      <AddChildDialog open={!!adding} parentId={adding?.id ?? 0} parentLabel={adding?.code ?? adding?.name ?? ''} allowedKinds={[...CUSTOM_KINDS]} custom
        onClose={() => setAdding(null)} onDone={() => { toast.success('Part added.'); refresh(); }} />
      <EditLineDialog open={!!editing} lineId={editing?.lineId ?? null} label={editing?.code ?? ''} quantity={editing?.quantity ?? 1} role={editing?.role ?? null}
        flowId={editing?.flow?.from === 'line' ? editing.flow.id : null} canHaveFlow={!!editing && !editing.selection && editing.kind !== 'selection'}
        onClose={() => setEditing(null)} onDone={() => { toast.success('Saved.'); refresh(); }} />
      <ChooseItemDialog open={choosing != null} lineId={choosing} onClose={() => setChoosing(null)} onDone={() => { toast.success('Item chosen.'); refresh(); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove" title={`Remove ${removing?.code ?? removing?.name}?`}
        body={removing?.kind === 'temporary'
          ? 'It exists only for this order, so it is deleted with everything below it. Its code is not given out again.'
          : 'The line goes from this structure; the catalog item itself stays.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { await cfApi.del(`/bom-lines/${removing?.lineId}`); toast.success('Removed.'); refresh(); }} />
    </Box>
  );
}
