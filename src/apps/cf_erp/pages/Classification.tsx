import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, IconButton,
  MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import { cfApi, CfApiError, qs } from '../api/client';
import type { NodeScope, Resolution, Rule, Tree, TreeNode } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { CapsLabel, EmptyState, ErrorNotice, Mono, PageHeader, RuleBadge, SectionCard, SkeletonRows, StatusBadge, Surface } from '../components/ui';
import { RuleDialog } from '../components/RuleDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SpecsTable } from '../components/SpecsTable';
import { useToast } from '../components/toastContext';
import { DialogHeader } from '../components/FormDialog';

function findNode(nodes: TreeNode[], id: number | null): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

function pathTo(nodes: TreeNode[], id: number, trail: TreeNode[] = []): TreeNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n];
    const hit = pathTo(n.children, id, [...trail, n]);
    if (hit) return hit;
  }
  return null;
}

function NodeRow({ node, depth, selectedId, expanded, toggle, select }: {
  node: TreeNode; depth: number; selectedId: number | null; expanded: Set<number>; toggle: (id: number) => void; select: (id: number) => void;
}) {
  const open = expanded.has(node.id);
  const selected = node.id === selectedId;
  return (
    // The row was mouse-only: the tree item now takes focus, Enter/Space selects
    // it and the arrow keys open and close it, as an ARIA tree should.
    <Box component="li" role="treeitem" tabIndex={0} aria-label={`${node.level}: ${node.name}`}
      aria-expanded={node.children.length ? open : undefined} aria-selected={selected}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(node.id); }
        if (e.key === 'ArrowRight' && node.children.length && !open) toggle(node.id);
        if (e.key === 'ArrowLeft' && node.children.length && open) toggle(node.id);
      }}
      sx={{ listStyle: 'none', outline: 'none', '&:focus-visible > .tree-row': { outline: '2px solid var(--c-primary-500)', outlineOffset: '-2px' } }}>
      <Box className="tree-row"
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5 + depth * 2, pr: 1, py: 0.5, borderRadius: 'var(--r-sm)', cursor: 'pointer',
          background: selected ? 'var(--c-primary-50)' : 'transparent', color: selected ? 'var(--c-primary-900)' : 'var(--c-text)',
          '&:hover': { background: selected ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
        }} onClick={() => select(node.id)}>
        <IconButton size="small" aria-label={open ? 'Collapse' : 'Expand'} disabled={!node.children.length}
          onClick={(e) => { e.stopPropagation(); toggle(node.id); }} sx={{ visibility: node.children.length ? 'visible' : 'hidden' }}>
          <ChevronRightRounded sx={{ fontSize: 18, transition: 'transform var(--t-mid) var(--ease)', transform: open ? 'rotate(90deg)' : 'none' }} />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: 14, fontWeight: selected ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</Box>
        </Box>
        {node.ruleCount > 0 && <Tooltip title={`${node.ruleCount} spec rule(s) set here`}><Box component="span"><Mono muted>{node.ruleCount}r</Mono></Box></Tooltip>}
        {(node.itemCount + node.definitionCount) > 0 && <Tooltip title={`${node.itemCount} item(s), ${node.definitionCount} definition(s)`}><Box component="span"><Mono muted>{node.itemCount + node.definitionCount}</Mono></Box></Tooltip>}
        {node.machineCount > 0 && <Tooltip title={`${node.machineCount} machine(s)`}><Box component="span"><Mono muted>{node.machineCount}m</Mono></Box></Tooltip>}
      </Box>
      <Collapse in={open} timeout={200} unmountOnExit>
        <Box component="ul" role="group" sx={{ m: 0, p: 0 }}>
          {node.children.map((c) => <NodeRow key={c.id} node={c} depth={depth + 1} selectedId={selectedId} expanded={expanded} toggle={toggle} select={select} />)}
        </Box>
      </Collapse>
    </Box>
  );
}

interface NodeForm { code: string; name: string; scope: NodeScope; description: string; sortOrder: string; status: 'active' | 'inactive' }

function NodeDialog({ open, onClose, onSaved, parent, existing, levels }: {
  open: boolean; onClose: () => void; onSaved: (id: number, scope: NodeScope) => void; parent: TreeNode | null; existing: TreeNode | null; levels: string[];
}) {
  const [form, setForm] = useState<NodeForm>({ code: '', name: '', scope: 'both', description: '', sortOrder: '0', status: 'active' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(existing
      ? { code: existing.code, name: existing.name, scope: existing.scope, description: existing.description ?? '', sortOrder: String(existing.sortOrder), status: existing.status }
      : { code: '', name: '', scope: parent?.scope ?? 'both', description: '', sortOrder: '0', status: 'active' });
  }, [open, existing, parent]);
  const level = existing ? existing.level : levels[parent ? parent.depth + 1 : 0];
  // Scope Machine belongs to a whole Family: its levels follow it, and only an empty Family can switch.
  const isFamily = existing ? existing.depth === 0 : !parent;
  const underMachines = existing ? existing.depth > 0 && existing.scope === 'machine' : parent?.scope === 'machine';
  const set = (k: keyof NodeForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, sortOrder: Number(form.sortOrder) || 0 };
      const saved = existing
        ? await cfApi.put<{ id: number }>(`/classification/${existing.id}`, body)
        : await cfApi.post<{ id: number }>('/classification', { ...body, parentId: parent?.id ?? null });
      setBusy(false);
      onSaved(saved.id, form.scope);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>{existing ? `Edit ${level.toLowerCase()}` : `New ${level.toLowerCase()}`}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        {parent && !existing && <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13, mb: 2 }}>Under {parent.name}</Typography>}
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2, mt: 1 }}>
          <TextField label="Code" required value={form.code} onChange={set('code')} autoFocus inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="Used in generated codes" />
          <TextField label="Name" required value={form.name} onChange={set('name')} />
          <TextField select label="Holds" value={form.scope} onChange={set('scope')} disabled={underMachines}
            helperText={underMachines ? 'Every level of a machine family is for machines'
              : form.scope === 'machine' ? 'Machine types — usually added from Production › Machines'
              : 'Items and definitions: a picker filter only'}>
            <MenuItem value="both">Items and definitions</MenuItem>
            <MenuItem value="item">Items</MenuItem>
            <MenuItem value="definition">Definitions</MenuItem>
            {(isFamily || underMachines) && <MenuItem value="machine">Machines (a machine family)</MenuItem>}
          </TextField>
          <TextField label="Description" value={form.description} onChange={set('description')} />
          <TextField label="Sort order" type="number" value={form.sortOrder} onChange={set('sortOrder')} />
          {existing && (
            <TextField select label="Status" value={form.status} onChange={set('status')}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive — hidden from pickers</MenuItem>
            </TextField>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !form.code.trim() || !form.name.trim()} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function NodePanel({ node, path, levels, leafDepth, canManage, onEdit, onAddChild, onDelete, onChanged }: {
  node: TreeNode; path: TreeNode[]; levels: string[]; leafDepth: number; canManage: boolean; onEdit: () => void; onAddChild: () => void; onDelete: () => void; onChanged: () => void;
}) {
  const company = useCompanySlug();
  const toast = useToast();
  const rules = useLoad(() => cfApi.get<Rule[]>(`/rules${qs({ subjectType: 'classification', subjectId: node.id })}`), [node.id]);
  const resolved = useLoad(() => cfApi.get<Resolution>(`/classification/${node.id}/resolved`), [node.id]);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: Rule | null }>({ open: false, rule: null });
  const [deleteRule, setDeleteRule] = useState<Rule | null>(null);
  const refresh = () => { rules.reload(); resolved.reload(); onChanged(); };

  return (
    // Both halves matter: minWidth 0 lets this panel shrink inside the page grid,
    // and minmax(0, 1fr) stops its own column growing to the specs table's
    // minimum width — otherwise the table's horizontal scroll never engages and
    // the whole page scrolls sideways instead.
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <Surface elevation={2} sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 240 }}>
            <CapsLabel>{node.level}</CapsLabel>
            <Typography variant="h1" component="h2" sx={{ mt: 0.25 }}>{node.name}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.75, flexWrap: 'wrap' }}>
              <Mono>{node.code}</Mono>
              {node.status === 'inactive' && <StatusBadge status="inactive" />}
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                {path.map((p) => p.name).join(' › ')}
              </Typography>
            </Box>
            {node.description && <Typography sx={{ mt: 1, color: 'var(--c-text-2)' }}>{node.description}</Typography>}
          </Box>
          {canManage && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {node.depth < leafDepth && <Button startIcon={<AddRounded />} onClick={onAddChild}>Add {levels[node.depth + 1].toLowerCase()}</Button>}
              <Button startIcon={<EditRounded />} onClick={onEdit}>Edit</Button>
              <Tooltip title="Delete — refused while anything lives under it"><IconButton aria-label="Delete node" onClick={onDelete}><DeleteOutlineRounded /></IconButton></Tooltip>
            </Box>
          )}
        </Box>
        {node.depth === leafDepth && node.scope === 'machine' && (
          <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
            <Button component={Link} to={`${appPath(company, 'machines')}?classificationId=${node.id}`} size="small">{node.machineCount} machine(s) of this type</Button>
          </Box>
        )}
        {node.depth === leafDepth && node.scope !== 'machine' && (
          <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
            <Button component={Link} to={`${appPath(company, 'items')}?classificationId=${node.id}`} size="small">{node.itemCount} item(s) here</Button>
            <Button component={Link} to={`${appPath(company, 'definitions')}?classificationId=${node.id}`} size="small">{node.definitionCount} definition(s) here</Button>
          </Box>
        )}
      </Surface>

      <SectionCard title="Specification rules set here"
        subtitle="Rules apply to every item and definition below this node. A more specific level can override a rule or switch it off."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setRuleDialog({ open: true, rule: null })}>Add rule</Button>}>
        <ErrorNotice error={rules.error} onRetry={rules.reload} />
        {rules.loading && !rules.data ? <SkeletonRows rows={3} /> : (rules.data ?? []).length === 0 ? (
          <Typography sx={{ color: 'var(--c-text-2)' }}>No rules at this level{node.depth > 0 ? ' — rules from above still apply (see below).' : '.'}</Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {(rules.data ?? []).map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1, borderRadius: 'var(--r-sm)', '&:hover': { background: 'var(--c-surface-2)' }, '&:hover .row-actions, &:focus-within .row-actions': { opacity: 1 } }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ fontWeight: 500 }}>{r.specName} <Mono muted>{r.specCode}</Mono></Box>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                    {r.isApplicable
                      ? `${r.captureAt === 'item' ? 'On each item' : r.captureAt === 'batch' ? 'On each batch' : 'On each unit'}${r.isRequired ? ' · required' : ''}${r.formulaCode ? ` · ${r.formulaCode}` : ''}${r.optionValues.length ? ` · only ${r.optionValues.join(', ')}` : ''}`
                      : 'Switched off from here down'}
                  </Typography>
                </Box>
                {r.isApplicable && <RuleBadge rule={r.valueRule} />}
                {canManage && (
                  <Box className="row-actions" sx={{ opacity: 0, transition: 'opacity 140ms', display: 'flex' }}>
                    <IconButton size="small" aria-label={`Edit rule ${r.specCode}`} onClick={() => setRuleDialog({ open: true, rule: r })}><EditRounded fontSize="small" /></IconButton>
                    <IconButton size="small" aria-label={`Delete rule ${r.specCode}`} onClick={() => setDeleteRule(r)}><DeleteOutlineRounded fontSize="small" /></IconButton>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      <SectionCard title="Everything that reaches this node"
        subtitle="Rules from this node and above, merged. Values set here are defaults for the items below — they take effect wherever a rule is Fixed or Defaulted.">
        <ErrorNotice error={resolved.error} onRetry={resolved.reload} />
        {resolved.loading && !resolved.data ? <SkeletonRows rows={4} /> : resolved.data && (
          <SpecsTable resolution={resolved.data} emptyHint="No rules reach this node yet. Add one above."
            onSave={canManage ? async (values) => {
              await cfApi.put(`/classification/${node.id}/values`, { values });
              toast.success('Defaults saved — items below were updated.');
              refresh();
            } : undefined} />
        )}
      </SectionCard>

      <RuleDialog open={ruleDialog.open} existing={ruleDialog.rule} onClose={() => setRuleDialog({ open: false, rule: null })}
        onSaved={() => { toast.success('Rule saved.'); refresh(); }} subjectType="classification" subjectId={node.id} subjectLabel={`${node.level.toLowerCase()} ${node.name}`} forMachines={node.scope === 'machine'} />
      <ConfirmDialog open={!!deleteRule} title="Delete this rule?" danger confirmLabel="Delete rule"
        body={`${deleteRule?.specName} stops applying from ${node.name} down, unless a broader rule still covers it. Values it produced on items are recalculated.`}
        onClose={() => setDeleteRule(null)}
        onConfirm={async () => { await cfApi.del(`/rules/${deleteRule?.id}`); toast.success('Rule deleted.'); refresh(); }} />
    </Box>
  );
}

/** Hierarchy / Tree (DESIGN_SYSTEM.md §4.7) with the selected node's rules beside it. */
export default function Classification() {
  const toast = useToast();
  const company = useCompanySlug();
  // The screen is reachable with catalog_view alone, but every write below
  // needs setup_manage — without this gate the buttons are all 403s.
  const canManage = useIsPermitted()('cf_erp_setup_manage');
  const { data: tree, error, loading, reload } = useLoad(() => cfApi.get<Tree>('/classification'), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<{ open: boolean; parent: TreeNode | null; existing: TreeNode | null }>({ open: false, parent: null, existing: null });
  const [confirmDelete, setConfirmDelete] = useState<TreeNode | null>(null);
  // Machine families are managed from Production › Machines now, so this tree
  // is about items and definitions again. They are filtered out, never hidden:
  // the note below says how many there are and shows them on demand.
  const [showMachines, setShowMachines] = useState(false);

  const machineFamilies = useMemo(() => (tree?.roots ?? []).filter((r) => r.scope === 'machine'), [tree]);
  const roots = useMemo(() => (tree?.roots ?? []).filter((r) => showMachines || r.scope !== 'machine'), [tree, showMachines]);

  // Open every family on first load so the structure is visible at a glance.
  useEffect(() => {
    if (tree && expanded.size === 0) setExpanded(new Set(tree.roots.map((r) => r.id)));
    if (tree && selectedId === null && tree.roots[0]) {
      const first = tree.roots.find((r) => r.scope !== 'machine');
      // Nothing but machine families: show them rather than an empty tree.
      if (!first) setShowMachines(true);
      setSelectedId((first ?? tree.roots[0]).id);
    }
  }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => (tree ? findNode(tree.roots, selectedId) : null), [tree, selectedId]);
  const path = useMemo(() => (tree && selected ? pathTo(tree.roots, selected.id) ?? [] : []), [tree, selected]);
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleMachines = () => {
    const next = !showMachines;
    setShowMachines(next);
    // Hiding them must not leave the panel showing a family the tree no longer lists.
    if (!next && path[0]?.scope === 'machine') setSelectedId(tree?.roots.find((r) => r.scope !== 'machine')?.id ?? null);
  };
  const afterSave = (id: number, scope: NodeScope) => {
    reload();
    // A machine family made from here would otherwise vanish the moment it saved.
    if (scope === 'machine') setShowMachines(true);
    setSelectedId(id);
    if (dialog.parent) setExpanded((s) => new Set(s).add(dialog.parent!.id));
    toast.success('Saved.');
  };

  return (
    <Box>
      <PageHeader title="Classification" subtitle="One Family › Subfamily › Variant tree for items and definitions. Items and definitions sit on a Variant; specification rules set on any node reach everything below it. Machine families are managed on Production › Machines."
        actions={(canManage || machineFamilies.length > 0) && (
          <>
            {machineFamilies.length > 0 && (
              <Button startIcon={<PrecisionManufacturingRounded />} onClick={toggleMachines}>
                {showMachines ? 'Hide machine families' : 'Show machine families'}
              </Button>
            )}
            {canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog({ open: true, parent: null, existing: null })}>New family</Button>}
          </>
        )} />
      <ErrorNotice error={error} onRetry={reload} />
      {machineFamilies.length > 0 && !showMachines && (
        <Surface e={0} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', px: 2, py: 1.25, mb: 2, background: 'var(--c-surface-2)', borderStyle: 'dashed' }}>
          <PrecisionManufacturingRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} aria-hidden />
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px', minWidth: 0 }}>
            {machineFamilies.length} machine famil{machineFamilies.length === 1 ? 'y is' : 'ies are'} left out of this tree — machine types are added and renamed on Machines now.
          </Typography>
          <Button size="small" onClick={toggleMachines}>Show them here</Button>
          <Button size="small" component={Link} to={appPath(company, 'machines')}>Go to Machines</Button>
        </Surface>
      )}
      {loading && !tree ? <SkeletonRows rows={8} /> : tree && (tree.roots.length === 0 ? (
        <Surface><EmptyState title="No classification yet" body="Start with a family, e.g. Steel, then add subfamilies and variants under it."
          action={canManage && <Button variant="contained" onClick={() => setDialog({ open: true, parent: null, existing: null })}>New family</Button>} /></Surface>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 2, alignItems: 'start' }}>
          <Surface sx={{ p: 1, position: { md: 'sticky' }, top: 0 }}>
            <Box component="ul" role="tree" aria-label="Classification" sx={{ m: 0, p: 0 }}>
              {roots.map((r) => <NodeRow key={r.id} node={r} depth={0} selectedId={selectedId} expanded={expanded} toggle={toggle} select={setSelectedId} />)}
            </Box>
            {roots.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', p: 1.5 }}>Only machine families here — show them above, or add an item family.</Typography>}
          </Surface>
          {selected && (
            <NodePanel key={selected.id} node={selected} path={path} levels={tree.levels} leafDepth={tree.leafDepth} canManage={canManage} onChanged={reload}
              onEdit={() => setDialog({ open: true, parent: null, existing: selected })}
              onAddChild={() => setDialog({ open: true, parent: selected, existing: null })}
              onDelete={() => setConfirmDelete(selected)} />
          )}
        </Box>
      ))}
      <NodeDialog open={dialog.open} parent={dialog.parent} existing={dialog.existing} levels={tree?.levels ?? ['Family', 'Subfamily', 'Variant']}
        onClose={() => setDialog({ open: false, parent: null, existing: null })} onSaved={afterSave} />
      <ConfirmDialog open={!!confirmDelete} title={`Delete ${confirmDelete?.name}?`} danger confirmLabel="Delete"
        body="Its own rules and default values go with it. The delete is refused while anything lives under it."
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          await cfApi.del(`/classification/${confirmDelete?.id}`);
          toast.success('Deleted.');
          setSelectedId(confirmDelete?.parentId ?? null);
          reload();
        }} />
    </Box>
  );
}
