import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ArchiveRounded from '@mui/icons-material/ArchiveRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import type { BomType, StructureNode } from '../../api/types';
import { useCompanySlug } from '../../hooks/useLoad';
import { useIsPermitted } from '../../hooks/useIsPermitted';
import { appPath } from '../../navMeta';
import { recordPath } from '../../lib/paths';
import { ORDER_STATUS_LABEL, bomPermission } from '../../lib/orders';
import { DangerBadge, EmptyState, ErrorNotice, Fact, Mono, SectionCard, SkeletonRows, StatusBadge, WarnBadge } from '../ui';
import { AddChildDialog, EditLineDialog } from '../BomDialogs';
import { ChooseItemDialog } from '../ChooseItemDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../toastContext';
import {
  allowedChildren, ancestorKeys, bomTypeOfKind, flattenBom, openableKeys, walkNodes,
  VALUES_PERMISSION, type BomRow,
} from './bomModel';
import { BomTree, type BomAction } from './BomTree';
import { BomValuesEditor } from './BomValuesEditor';
import { useSpecValues } from './useSpecValues';
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

  // Every node of the structure, open or shut — what the values sweep reads and
  // what "the next gap" walks, so a jump can reach into a folded branch.
  const flat = useMemo(() => (state ? walkNodes(state.root) : []), [state]);
  const ids = useMemo(() => flat.map((f) => f.node.id), [flat]);
  const values = useSpecValues(ids, !!state);
  /**
   * The node whose values are open, whether the cursor belongs in them, and a
   * counter that only a deliberate jump moves — a jump that lands back on the
   * node it came from (the last gap in the tree) has to put the cursor in the
   * field that is still empty, and that means opening the panel again.
   */
  const [picked, setPicked] = useState<{ key: string; autoFocus: boolean; jump: number } | null>(null);
  // A value save moves roll-ups and the order's own counts, but reloading the
  // whole structure after each of 120 saves would make the job unusable — so
  // the screen around catches up once, when the panel is closed.
  const saved = useRef(false);

  const pickedNode = useMemo(() => flat.find((f) => f.node.key === picked?.key)?.node ?? null, [flat, picked]);
  const staleId = pickedNode && values.get(pickedNode.id)?.stale ? pickedNode.id : null;
  const { refresh: refreshValues } = values;
  // Its own typed values are still true, but what it rolls up may have moved
  // under it since the sweep read it — so it is read again as it is opened.
  useEffect(() => { if (staleId != null) void refreshValues(staleId); }, [staleId, refreshValues]);

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
   * What this screen is about at all: the BOM it was opened for, and an order's
   * own temporary items. Anything else in the tree belongs to another record and
   * is changed there — the backend wants that record's grant, so offering it
   * here would only fail.
   */
  const mine = (node: StructureNode | null) => !state.frozen
    && !!node && (node.kind === 'temporary' || (node.depth === 0 && ownsBom));
  /**
   * Whether the lines of one record's BOM may be changed from this screen.
   */
  const mayEdit = (holder: StructureNode | null, bomType: BomType | null) => mine(holder)
    && bomType != null && isPermitted(bomPermission(bomType === 'custom'));
  /**
   * Whether a node's specification values may be typed here. The same reach as
   * the line actions — frozen, released and closed-order cases included, because
   * `mine` carries them — but a different grant: `PUT /records/:id/values` is
   * `PERM.catalog` whatever the node belongs to (see `VALUES_PERMISSION`).
   */
  const mayEditValues = (node: StructureNode) => mine(node) && isPermitted(VALUES_PERMISSION);
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

  // ── the values on the tree ────────────────────────────────────────────────
  // A node whose required values are still empty is what stops it being
  // activated, and a draft temporary item is what stops the line being
  // released — so the count is a column of its own rather than something you
  // find by opening each node.
  const order = flat.map((f) => f.node);
  const gapsAt = (node: StructureNode) => (mayEditValues(node) ? values.get(node.id)?.missing.length ?? 0 : 0);
  const gapNodes = order.filter((n) => gapsAt(n) > 0);
  const gapIds = new Set(gapNodes.map((n) => n.id));
  const gapCount = [...gapIds].reduce((n, id) => n + (values.get(id)?.missing.length ?? 0), 0);

  /** The next node still short of a value, after `afterKey` — wrapping, so the run finishes what it started. */
  const nextGap = (afterKey: string | null): StructureNode | null => {
    const start = afterKey ? order.findIndex((n) => n.key === afterKey) + 1 : 0;
    for (let i = start; i < order.length; i += 1) if (gapsAt(order[i]) > 0) return order[i];
    for (let i = 0; i < start; i += 1) if (gapsAt(order[i]) > 0) return order[i];
    return null;
  };
  const closeValues = () => {
    setPicked(null);
    if (saved.current) { saved.current = false; onChanged?.(); }
  };
  const goTo = (node: StructureNode | null) => {
    if (!node) { closeValues(); return; }
    // It may be inside a folded branch; nothing is worse than a jump to a row that is not there.
    setOpen(new Set([...expanded, ...ancestorKeys(flat, node.key)]));
    setPicked((p) => ({ key: node.key, autoFocus: true, jump: (p?.jump ?? 0) + 1 }));
  };

  const valueCell = (row: BomRow) => {
    const entry = values.get(row.node.id);
    if (!entry) return <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{values.scanning ? '…' : ''}</Typography>;
    if (entry.error) return <Tooltip title={entry.error.message}><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>unread</Typography></Tooltip>;
    if (entry.missing.length > 0) {
      return <DangerBadge label={`${entry.missing.length} missing`} title={`Still empty: ${entry.missing.join(', ')}`} />;
    }
    if (entry.fillable > 0) return <Typography sx={{ fontSize: 12, color: 'var(--c-success-800)' }}>All set</Typography>;
    return <Tooltip title="Nothing here is typed in — every value it needs is fixed, worked out, or captured later."><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</Typography></Tooltip>;
  };

  const whyNotValues = (node: StructureNode): string | null => {
    if (mayEditValues(node)) return null;
    if (!mine(node)) {
      return state.frozen
        ? 'These values are kept as they were — see the note above the tree.'
        : `${node.code ?? node.name} is not this order’s own work, so its values belong to the record itself.`;
    }
    return 'You can see these values, but your role cannot change them. Ask an administrator for the catalog permission.';
  };

  const editorFor = (row: BomRow) => (
    <BomValuesEditor key={`${row.node.key}:${picked?.jump ?? 0}`} node={row.node} entry={values.get(row.node.id)}
      canEdit={mayEditValues(row.node)} whyNot={whyNotValues(row.node)}
      autoFocus={picked?.autoFocus ?? false} hasNext={nextGap(row.node.key) != null}
      onSaved={(fresh) => { values.applySaved(row.node.id, fresh); saved.current = true; toast.success('Values saved.'); }}
      onNext={() => goTo(nextGap(row.node.key))}
      onReread={() => void values.refresh(row.node.id)}
      onClose={closeValues} />
  );

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
            {values.tooMany && <Button size="small" startIcon={<PlaylistAddCheckRounded />} onClick={values.start}>Check values</Button>}
            {gapNodes.length > 0 && (
              <Button size="small" variant="contained" startIcon={<PlaylistAddCheckRounded />} onClick={() => goTo(nextGap(picked?.key ?? null))}>
                Fill {gapCount} value{gapCount > 1 ? 's' : ''}
              </Button>
            )}
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
          {gapNodes.length > 0 && (
            <Fact label="Values missing">
              <DangerBadge label={`${gapCount} in ${gapIds.size} item${gapIds.size > 1 ? 's' : ''}`}
                title="Required values that are still empty. An item cannot be activated until they are filled, and a draft item stops release." />
            </Fact>
          )}
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
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline', mb: 1, minHeight: 18 }}>
          {/* A count that moves every few frames is not worth announcing; the
              tree carries aria-busy instead (§6.8). */}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            {values.scanning ? `Checking values… ${values.done} of ${values.total}`
              : values.tooMany ? `${values.total} nodes — values are read on request.`
                : ''}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            Select a row to fill its values · ↑ ↓ move · Enter opens and saves
          </Typography>
        </Box>
        <BomTree rows={rows} label={`What ${label} is made of`} actionsFor={actionsFor} onAction={onAction}
          onToggle={(key) => { const next = new Set(expanded); if (next.has(key)) next.delete(key); else next.add(key); setOpen(next); }}
          busy={values.scanning} selectedKey={picked?.key ?? null}
          onSelect={(row, opts) => (row
            ? setPicked((p) => ({ key: row.node.key, autoFocus: !opts?.keepFocus, jump: p?.jump ?? 0 }))
            : closeValues())}
          valueCell={valueCell} editorFor={editorFor}
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
