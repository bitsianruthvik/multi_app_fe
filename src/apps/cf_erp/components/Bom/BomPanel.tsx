import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import type { BomType, StructureNode } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { ORDER_STATUS_LABEL, bomPermission } from '../../lib/orders';
import { EmptyState, ErrorNotice, Fact, Mono, SectionCard, SkeletonRows, StatusBadge, WarnBadge } from '../ui';
import { AddChildDialog, EditLineDialog } from '../BomDialogs';
import { ChooseItemDialog } from '../ChooseItemDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../toastContext';
import { allowedChildren, bomTypeOfKind, flattenBom, openableKeys, type BomRow } from './bomModel';
import { BomTree, type BomAction } from './BomTree';
import { LOCKED_ORDER, useBom, type BomSource } from './useBom';

const TYPE_TEXT: Record<BomType, { title: string; body: string; empty: string }> = {
  standard: {
    title: 'Standard BOM',
    body: 'What this catalog item is made of, every time. Catalog items only.',
    empty: 'Add the first catalog item it is made of.',
  },
  template: {
    title: 'Template BOM',
    body: 'The usual structure of this blueprint. An order copies it — each template line becomes a temporary item there, and can then be changed freely.',
    empty: 'Add the first item or definition it is made of.',
  },
  custom: {
    title: 'Custom BOM',
    body: 'This order’s own structure. Adding a template creates a new temporary item here.',
    empty: 'Add catalog items, templates (each becomes a temporary item) or selections.',
  },
};

/**
 * Every BOM on screen: a record's own on its BOM tab, and the whole structure a
 * sales line sells on the order's Structure tab. One tree, one set of rows, one
 * set of actions — the root is a row at its own depth like every other, and what
 * may be changed is worked out per row from the BOM that holds the line, the way
 * the backend does it (routes/boms.js `permFor`).
 */
export function BomPanel({ source, ownsBom = false, showWhereUsed = false, onChanged }: {
  source: BomSource;
  /** This screen is the BOM's home: its own lines are changed here, and its status and revision are managed here. */
  ownsBom?: boolean;
  /** A record's own tab also answers "where else is this used?". */
  showWhereUsed?: boolean;
  /** Reloads the screen around it — a change moves roll-ups and counts above. */
  onChanged?: () => void;
}) {
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const toast = useToast();
  const bom = useBom(source, { whereUsed: showWhereUsed, onChanged });
  const state = bom.state;
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [adding, setAdding] = useState<StructureNode | null>(null);
  const [editing, setEditing] = useState<BomRow | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<BomRow | null>(null);

  // Open everything the first time; after that the person's choice stands across reloads.
  const expanded = useMemo(() => open ?? new Set(state ? openableKeys(state.root) : []), [open, state]);
  const rows = useMemo(() => (state ? flattenBom(state.root, expanded) : []), [state, expanded]);

  const usedCard = (
    <SectionCard title="Where it is used" subtitle="BOMs that hold it — directly, or as the item chosen for a selection.">
      <ErrorNotice error={bom.whereUsedError} onRetry={bom.reloadWhereUsed} />
      {bom.whereUsed.length === 0 ? <Typography sx={{ color: 'var(--c-text-3)', fontSize: 13 }}>Not used in any BOM.</Typography> : (
        <Box sx={{ display: 'grid', gap: 0.5 }}>
          {bom.whereUsed.map((u) => (
            <Box key={u.lineId} sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', p: 0.75, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' } }}>
              <Mono><Link to={appPath(company, recordPath(u.parent.kind, u.parent.id))}>{u.parent.code ?? '—'}</Link></Mono>
              <Typography sx={{ flex: 1, fontSize: 13, minWidth: 140 }}>{u.parent.name}</Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{TYPE_TEXT[u.bomType].title}{u.via === 'selection' ? ' · via selection' : ''}</Typography>
              {u.order && <Mono muted><Link to={appPath(company, `orders/${u.order.id}`)}>{u.order.code}</Link></Mono>}
              <Mono>×{u.quantity}</Mono>
            </Box>
          ))}
        </Box>
      )}
    </SectionCard>
  );

  if (bom.error) return <ErrorNotice error={bom.error} onRetry={bom.reload} />;
  if (!state) return <SkeletonRows rows={5} height={40} />;

  const root = state.root;
  const label = root.code ?? root.name;
  // Whether this record holds a BOM at all is the server's call (`canHaveBom`);
  // its kind only names the BOM when there is one.
  const holdsBom = state.canHaveBom ?? state.bomType != null;
  const type = holdsBom && state.bomType ? TYPE_TEXT[state.bomType] : null;
  if (!type) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
        <SectionCard title="No BOM"><Typography sx={{ color: 'var(--c-text-2)' }}>A selection definition chooses an existing catalog item, so it has no BOM of its own.</Typography></SectionCard>
        {showWhereUsed && usedCard}
      </Box>
    );
  }
  const custom = state.bomType === 'custom';

  /**
   * Whether the lines of one record's BOM may be changed from this screen: the
   * BOM this screen is about, and an order's own temporary items. A line inside
   * some other record's catalog BOM is changed on that record — the backend
   * wants the catalog grant there, so offering it here would only fail.
   */
  const mayEdit = (holder: StructureNode | null, bomType: BomType | null) => !state.frozen
    && !!holder && (holder.kind === 'temporary' || (holder.depth === 0 && ownsBom))
    && bomType != null && isPermitted(bomPermission(bomType === 'custom'));
  /**
   * What a node may be given. The server answered for the root of a record's
   * own BOM; deeper nodes of an order's structure were never asked about, so
   * those fall back to the local table — and a node that holds no BOM offers
   * nothing rather than somebody else's list.
   */
  const allowedUnder = (node: StructureNode) => allowedChildren(
    bomTypeOfKind(node.kind),
    node.key === root.key ? state.allowedChildKinds : null,
  );
  const canAddToRoot = mayEdit(root, state.bomType) && allowedUnder(root).length > 0;
  const actionsFor = (row: BomRow): BomAction[] => {
    const list: BomAction[] = [];
    if (mayEdit(row.node, bomTypeOfKind(row.node.kind)) && allowedUnder(row.node).length > 0) list.push('add');
    if (mayEdit(row.parent, row.bomType)) {
      if (row.node.selection) list.push('choose');
      list.push('change', 'remove');
    }
    return list;
  };
  const onAction = (action: BomAction, row: BomRow) => {
    if (action === 'add') setAdding(row.node);
    else if (action === 'choose') setChoosing(row.node.lineId);
    else if (action === 'change') setEditing(row);
    else setRemoving(row);
  };

  // Why it cannot be changed — said here, rather than leaving a tree with no
  // menus and no explanation, or letting a save come back as a bare refusal.
  const why: ReactNode = state.line?.lineType === 'standard' ? (
    <>
      This is <Mono>{label}</Mono>’s Standard BOM, shared by every order that sells it. Change it on{' '}
      <Link to={appPath(company, `${recordPath(root.kind, root.id)}?tab=bom`)}>the item itself</Link>.
    </>
  ) : root.status === 'obsolete'
    ? `${label} is obsolete, so its lines cannot change. Reactivate the record to edit them.`
    : state.order && LOCKED_ORDER.includes(state.order.status)
      ? `Order ${state.order.code} is ${ORDER_STATUS_LABEL[state.order.status].toLowerCase()}, so everything made for it is frozen.`
      : state.released
        ? `Released to production${state.order ? ` on order ${state.order.code}` : ''}${state.line ? `, line ${state.line.lineNo}` : ''}, so its structure is frozen. Take the release back — while nothing has started — to change it.`
        : !isPermitted(bomPermission(custom))
          ? `You can see this ${type.title}, but your role cannot change ${custom ? 'an order’s structure' : 'the catalog'}.`
          : null;

  const addingBomType = adding ? bomTypeOfKind(adding.kind) : null;
  const addingKinds = adding ? allowedUnder(adding) : [];
  const removingNode = removing?.node;
  const run = async (done: string, change: Promise<boolean>) => { if (await change) toast.success(done); };
  const addButton = (variant?: 'contained') => (
    <Button variant={variant} startIcon={<AddRounded />} onClick={() => setAdding(root)}>Add line</Button>
  );
  // Only worth offering once something below the first level can be folded away.
  const deep = state.stats.maxDepth > 1;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <ErrorNotice error={bom.actionError} />
      <SectionCard title={type.title} subtitle={type.body}
        actions={(
          <>
            {deep && <Button size="small" startIcon={<UnfoldMoreRounded />} onClick={() => setOpen(new Set(openableKeys(root)))}>Expand all</Button>}
            {deep && <Button size="small" startIcon={<UnfoldLessRounded />} onClick={() => setOpen(new Set([root.key]))}>Collapse all</Button>}
            {canAddToRoot && addButton()}
          </>
        )}>
        {why && <Alert severity="info" sx={{ mb: 2 }}>{why}</Alert>}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          {state.bom && !custom && <Fact label="Status"><StatusBadge status={state.bom.status} /></Fact>}
          {state.bom && !custom && <Fact label="Revision"><Mono>{state.bom.revision ?? '—'}</Mono></Fact>}
          <Fact label="In the structure"><Mono>{state.stats.nodes - 1}</Mono></Fact>
          {state.stats.temporary > 0 && <Fact label="Temporary items"><Mono>{state.stats.temporary}</Mono></Fact>}
          {state.stats.drafts > 0 && <Fact label="Still draft"><WarnBadge label={`${state.stats.drafts} draft`} title="Release will need every one of them active." /></Fact>}
          {state.stats.unresolved > 0 && <Fact label="To choose"><WarnBadge label={`${state.stats.unresolved} selection${state.stats.unresolved > 1 ? 's' : ''}`} title="Choose a catalog item for each of them before release." /></Fact>}
          {/* Worth naming only when the person did not arrive from the order itself. */}
          {state.order && !state.line && <Fact label="Order"><Mono><Link to={appPath(company, `orders/${state.order.id}`)}>{state.order.code}</Link></Mono></Fact>}
          <Box sx={{ flex: 1 }} />
          {/* Status and revision belong to the BOM itself, so they are managed
              where the BOM lives — not on an order that happens to show it. */}
          {ownsBom && state.bom && !custom && isPermitted(bomPermission(false)) && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {state.bom.status === 'draft' && <Button variant="contained" size="small" startIcon={<CheckCircleRounded />} onClick={() => run('BOM activated.', bom.setStatus('active'))}>Activate BOM</Button>}
              {state.bom.status === 'active' && <Button size="small" startIcon={<ArchiveRounded />} onClick={() => run('BOM marked obsolete.', bom.setStatus('obsolete'))}>Mark obsolete</Button>}
              {state.bom.status === 'obsolete' && <Button size="small" startIcon={<CheckCircleRounded />} onClick={() => run('BOM reactivated.', bom.setStatus('active'))}>Reactivate</Button>}
              {state.bom.status !== 'obsolete' && <Button size="small" startIcon={<HistoryRounded />} onClick={() => run('Revision moved on.', bom.revise())}>New revision</Button>}
            </Box>
          )}
        </Box>
        {state.truncated && <Box sx={{ mb: 1 }}><WarnBadge label="Deeper levels not shown" title="The structure is deeper than this view goes." /></Box>}
        <BomTree rows={rows} label={`What ${label} is made of`} actionsFor={actionsFor} onAction={onAction}
          onToggle={(key) => { const next = new Set(expanded); if (next.has(key)) next.delete(key); else next.add(key); setOpen(next); }}
          footer={root.children.length === 0 && (
            <EmptyState title="Nothing below it yet" body={canAddToRoot ? type.empty : undefined} action={canAddToRoot && addButton('contained')} />
          )} />
      </SectionCard>
      {showWhereUsed && usedCard}

      <AddChildDialog open={!!adding && addingKinds.length > 0} parentId={adding?.id ?? 0} parentLabel={adding?.code ?? adding?.name ?? ''}
        allowedKinds={addingKinds} custom={addingBomType === 'custom'}
        onClose={() => setAdding(null)}
        onDone={() => {
          // Open what was just added to, or the new line lands out of sight.
          if (adding) setOpen(new Set([...expanded, adding.key]));
          toast.success('Line added.');
          bom.reload();
        }} />
      <EditLineDialog open={!!editing} lineId={editing?.node.lineId ?? null} label={editing ? (editing.node.code ?? editing.node.name) : ''}
        quantity={editing?.node.quantity ?? 1} role={editing?.node.role ?? null}
        flowId={editing?.node.flow?.from === 'line' ? editing.node.flow.id : null}
        canHaveFlow={!!editing && !editing.node.selection && editing.node.kind !== 'selection'} custom={editing?.bomType === 'custom'}
        onClose={() => setEditing(null)} onDone={() => { toast.success('Line saved.'); bom.reload(); }} />
      <ChooseItemDialog open={choosing != null} lineId={choosing} onClose={() => setChoosing(null)} onDone={() => { toast.success('Item chosen.'); bom.reload(); }} />
      <ConfirmDialog open={!!removing} danger confirmLabel="Remove line" title={`Remove ${removingNode?.code ?? removingNode?.name}?`}
        body={removingNode?.kind === 'temporary'
          ? `${removingNode.code ?? removingNode.name} exists only for this place, so it is deleted with everything below it. Its code is not given out again.`
          : 'The line goes; the item itself stays in the catalog.'}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { if (removingNode?.lineId != null) { await bom.removeLine(removingNode.lineId); toast.success('Line removed.'); } }} />
    </Box>
  );
}
