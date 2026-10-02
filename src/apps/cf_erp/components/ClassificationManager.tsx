import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, IconButton, InputAdornment,
  MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DriveFileMoveRounded from '@mui/icons-material/DriveFileMoveRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import { cfApi, CfApiError } from '../api/client';
import type { ClassificationScreen, NodeScope, ScreenTree, ScreenTreeNode } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import {
  SCREEN_LABEL, findScreenNode, holdingsText, holdsAnything, manageTagsFor, moveTargets, pathOf, reasonText,
  screenCount, screenTreePath, searchTree,
} from '../lib/classificationScreens';
import { CapsLabel, EmptyState, ErrorNotice, Mono, SkeletonRows, StatusBadge, Surface } from './ui';
import { ConfirmDialog } from './ConfirmDialog';
import { DialogHeader } from './FormDialog';
import { ClassificationRules } from './ClassificationRules';
import { useToast } from './toastContext';

const SUBTITLE: Record<ClassificationScreen, string> = {
  items: 'The branches that hold items, worked out from what is filed where — nothing is tagged by hand. An empty branch you add here stays here until something is filed in it.',
  definitions: 'The branches that hold definitions, and every branch a selection picks from — worked out, never tagged. An empty branch you add here stays here until something is filed in it.',
  machines: 'Machine families, their groups and machine types. Every machine sits on a type at the deepest level.',
};

function NodeRow({ node, depth, screen, selectedId, expanded, toggle, select }: {
  node: ScreenTreeNode; depth: number; screen: ClassificationScreen; selectedId: number | null; expanded: Set<number>;
  toggle: (id: number) => void; select: (id: number) => void;
}) {
  const open = expanded.has(node.id);
  const selected = node.id === selectedId;
  const count = screenCount(node, screen);
  return (
    <Box component="li" role="treeitem" tabIndex={0} aria-label={`${node.level}: ${node.name}`} data-testid={`cls-node-${node.id}`}
      aria-expanded={node.children.length ? open : undefined} aria-selected={selected}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(node.id); }
        if (e.key === 'ArrowRight' && node.children.length && !open) toggle(node.id);
        if (e.key === 'ArrowLeft' && node.children.length && open) toggle(node.id);
      }}
      sx={{ listStyle: 'none', outline: 'none', '&:focus-visible > .tree-row': { outline: '2px solid var(--c-primary-500)', outlineOffset: '-2px' } }}>
      <Box className="tree-row" onClick={() => select(node.id)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, pl: 0.5 + depth * 2, pr: 1, py: 0.25, borderRadius: 'var(--r-sm)', cursor: 'pointer',
          background: selected ? 'var(--c-primary-50)' : 'transparent', color: selected ? 'var(--c-primary-900)' : 'var(--c-text)',
          '&:hover': { background: selected ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
        }}>
        <IconButton size="small" aria-label={open ? 'Collapse' : 'Expand'} disabled={!node.children.length}
          onClick={(e) => { e.stopPropagation(); toggle(node.id); }} sx={{ visibility: node.children.length ? 'visible' : 'hidden' }}>
          <ChevronRightRounded sx={{ fontSize: 18, transition: 'transform var(--t-mid) var(--ease)', transform: open ? 'rotate(90deg)' : 'none' }} />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: selected ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: node.status === 'inactive' ? 'var(--c-text-3)' : undefined }}>
          {node.name}
        </Box>
        <Tooltip title={`${holdingsText(node.subtree)} — ${reasonText(node.visibleBecause)}`}>
          <Box component="span" data-testid={`cls-count-${node.id}`}><Mono muted={!count}>{count.toLocaleString('en-IN')}</Mono></Box>
        </Tooltip>
      </Box>
      <Collapse in={open} timeout={150} unmountOnExit>
        <Box component="ul" role="group" sx={{ m: 0, p: 0 }}>
          {node.children.map((c) => <NodeRow key={c.id} node={c} depth={depth + 1} screen={screen} selectedId={selectedId} expanded={expanded} toggle={toggle} select={select} />)}
        </Box>
      </Collapse>
    </Box>
  );
}

interface NodeForm { code: string; name: string; scope: NodeScope; description: string; status: 'active' | 'inactive' }

/** Add a node (root or child) or rename one. A new node is stamped with this screen. */
function NodeDialog({ open, screen, parent, existing, levels, onClose, onSaved }: {
  open: boolean; screen: ClassificationScreen; parent: ScreenTreeNode | null; existing: ScreenTreeNode | null; levels: string[];
  onClose: () => void; onSaved: (id: number) => void;
}) {
  const [form, setForm] = useState<NodeForm>({ code: '', name: '', scope: 'both', description: '', status: 'active' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(existing
      ? { code: existing.code, name: existing.name, scope: existing.scope, description: existing.description ?? '', status: existing.status }
      : { code: '', name: '', scope: screen === 'machines' ? 'machine' : parent?.scope ?? 'both', description: '', status: 'active' });
  }, [open, existing, parent, screen]);
  const level = existing ? existing.level : levels[parent ? parent.depth + 1 : 0] ?? 'Node';
  const set = (k: keyof NodeForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const base = { code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || null };
      const saved = existing
        ? await cfApi.put<{ id: number }>(`/classification/${existing.id}`, { ...base, status: form.status, ...(screen !== 'machines' ? { scope: form.scope } : {}) })
        : await cfApi.post<{ id: number }>('/classification', { ...base, parentId: parent?.id ?? null, scope: form.scope, createdIn: screen });
      setBusy(false);
      onSaved(saved.id);
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, 'Could not save.'));
    }
  };
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={existing ? `Rename ${level.toLowerCase()}` : `New ${level.toLowerCase()}`}
        subtitle={existing ? existing.name : parent ? `Under ${parent.name}` : `A new top level on ${SCREEN_LABEL[screen]}`} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' }, gap: 2, mt: 1 }}>
          <TextField label="Code" required value={form.code} onChange={set('code')} autoFocus inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="Used in generated codes" />
          <TextField label="Name" required value={form.name} onChange={set('name')} />
          {screen !== 'machines' && (
            <TextField select label="Offered for" value={form.scope === 'machine' ? 'both' : form.scope} onChange={set('scope')} helperText="A picker filter only">
              <MenuItem value="both">Items and definitions</MenuItem>
              <MenuItem value="item">Items</MenuItem>
              <MenuItem value="definition">Definitions</MenuItem>
            </TextField>
          )}
          <TextField label="Description" value={form.description} onChange={set('description')} sx={screen === 'machines' ? { gridColumn: '1 / -1' } : undefined} />
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
        <Button variant="contained" onClick={save} disabled={busy || !form.code.trim() || !form.name.trim()} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
          {busy ? 'Saving…' : existing ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** "Move to…" — any node one level up on the same side, read from the whole side of the tree. */
function MoveDialog({ open, screen, node, onClose, onMoved }: {
  open: boolean; screen: ClassificationScreen; node: ScreenTreeNode | null; onClose: () => void; onMoved: () => void;
}) {
  const full = useLoad(() => (open ? cfApi.get<ScreenTree>(screenTreePath(screen, true)) : Promise.resolve(null)), [open, screen]);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setTarget(''); setError(null); } }, [open]);
  const targets = useMemo(() => (node ? moveTargets(full.data, node) : []), [full.data, node]);
  const move = async () => {
    if (!node || !target) return;
    setBusy(true); setError(null);
    try {
      await cfApi.put(`/classification/${node.id}`, { parentId: Number(target) });
      setBusy(false); onMoved(); onClose();
    } catch (e) {
      setBusy(false);
      setError(e instanceof CfApiError ? e : new CfApiError(0, 'Could not move it.'));
    }
  };
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={`Move ${node?.name ?? ''}`} subtitle="A branch moves only while it is empty — re-file what is in it first." onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error ?? full.error} onRetry={full.error ? full.reload : undefined} />
        {node && holdsAnything(node.subtree) && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-warning-700, var(--c-text-2))', mb: 1.5 }}>
            It holds {holdingsText(node.subtree)} — the move will be refused.
          </Typography>
        )}
        {full.loading && !full.data ? <SkeletonRows rows={2} /> : (
          <TextField select fullWidth label="New parent" value={target} onChange={(e) => setTarget(e.target.value)} sx={{ mt: 1 }}
            helperText={targets.length ? 'Only a level directly above it, on the same side of the tree' : 'There is nowhere else on this level to move it'}>
            {targets.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.path}</MenuItem>)}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={move} disabled={busy || !target}>{busy ? 'Moving…' : 'Move'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The Classification pop-up of Items, Definitions or Machines: that screen's
 * DERIVED part of the one tree, with counts, search, add / rename / move /
 * retire, and the selected node's rules. Replaces Setup › Classification.
 */
export function ClassificationManager({ open, screen, onClose, onChanged }: {
  open: boolean; screen: ClassificationScreen; onClose: () => void;
  /** Something was added, renamed, moved or retired — the screen's own tree is stale. */
  onChanged?: () => void;
}) {
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canManage = manageTagsFor(screen).some((t) => isPermitted(t));
  const canSeeRules = isPermitted('cf_erp_catalog_view');
  const canEditRules = isPermitted('cf_erp_setup_manage');
  const tree = useLoad(() => (open ? cfApi.get<ScreenTree>(screenTreePath(screen)) : Promise.resolve(null)), [open, screen]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<{ open: boolean; parent: ScreenTreeNode | null; existing: ScreenTreeNode | null }>({ open: false, parent: null, existing: null });
  const [moving, setMoving] = useState<ScreenTreeNode | null>(null);
  const [retiring, setRetiring] = useState<ScreenTreeNode | null>(null);

  useEffect(() => { if (!open) { setSearch(''); setSelectedId(null); setExpanded(new Set()); } }, [open]);
  // Families open on the first read, so the structure shows at a glance.
  useEffect(() => {
    if (tree.data && expanded.size === 0) setExpanded(new Set(tree.data.roots.map((r) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.data]);

  const roots = useMemo(() => tree.data?.roots ?? [], [tree.data]);
  const shown = useMemo(() => searchTree(roots, search), [roots, search]);
  const openIds = search.trim() ? new Set([...expanded, ...shown.open]) : expanded;
  const selected = useMemo(() => findScreenNode(roots, selectedId), [roots, selectedId]);
  const path = useMemo(() => (selected ? pathOf(roots, selected.id) ?? [] : []), [roots, selected]);
  const levels = tree.data?.levels ?? ['Family', 'Subfamily', 'Variant'];
  const leafDepth = tree.data?.leafDepth ?? levels.length - 1;
  const toggle = (id: number) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allIds = useMemo(() => { const out: number[] = []; const walk = (n: ScreenTreeNode) => { if (n.children.length) out.push(n.id); n.children.forEach(walk); }; roots.forEach(walk); return out; }, [roots]);
  const changed = () => { tree.reload(); onChanged?.(); };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: { md: '86vh' } } }} aria-label={`Classification — ${SCREEN_LABEL[screen]}`}>
      <DialogHeader title={`Classification — ${SCREEN_LABEL[screen]}`} subtitle={SUBTITLE[screen]} onClose={onClose} />
      <DialogContent dividers sx={{ p: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '340px minmax(0, 1fr)' }, minHeight: 0 }}>
        <Box sx={{ borderRight: { md: '1px solid var(--c-border)' }, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', borderBottom: '1px solid var(--c-border)' }}>
            <TextField size="small" fullWidth placeholder="Search name or code" value={search} onChange={(e) => setSearch(e.target.value)}
              inputProps={{ 'aria-label': 'Search the classification' }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded sx={{ fontSize: 18 }} /></InputAdornment> }} />
            <Tooltip title="Expand all"><IconButton size="small" aria-label="Expand all" onClick={() => setExpanded(new Set(allIds))}><UnfoldMoreRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Collapse all"><IconButton size="small" aria-label="Collapse all" onClick={() => setExpanded(new Set())}><UnfoldLessRounded fontSize="small" /></IconButton></Tooltip>
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', p: 1, minHeight: 200 }}>
            <ErrorNotice error={tree.error} onRetry={tree.reload} />
            {tree.loading && !tree.data ? <SkeletonRows rows={8} /> : (
              <Box component="ul" role="tree" aria-label={`Classification for ${SCREEN_LABEL[screen]}`} sx={{ m: 0, p: 0 }}>
                {shown.roots.map((r) => <NodeRow key={r.id} node={r} depth={0} screen={screen} selectedId={selectedId} expanded={openIds} toggle={toggle} select={setSelectedId} />)}
              </Box>
            )}
            {tree.data && !shown.roots.length && (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', p: 1.5 }}>
                {search.trim() ? 'Nothing here matches.' : `Nothing on ${SCREEN_LABEL[screen]} yet — add a ${levels[0].toLowerCase()} to start.`}
              </Typography>
            )}
          </Box>
          <Box sx={{ p: 1.5, borderTop: '1px solid var(--c-border)', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            {canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setDialog({ open: true, parent: null, existing: null })}>Add {levels[0].toLowerCase()}</Button>}
            {!!tree.data?.hiddenCount && (
              <Typography data-testid="cls-hidden-note" sx={{ fontSize: 12, color: 'var(--c-text-3)', flex: '1 1 160px' }}>
                {tree.data.hiddenCount} other branch{tree.data.hiddenCount === 1 ? '' : 'es'} hold{tree.data.hiddenCount === 1 ? 's' : ''} nothing for {SCREEN_LABEL[screen]} and {tree.data.hiddenCount === 1 ? 'is' : 'are'} left out.
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ overflow: 'auto', p: 2, minWidth: 0 }}>
          {!selected ? (
            <EmptyState title="Choose a branch" hint="Pick one on the left to see what it holds, rename, move or retire it, and the specification rules set on it." />
          ) : (
            <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <Surface elevation={2} sx={{ p: 2.5 }} data-testid="cls-detail">
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <CapsLabel>{selected.level}</CapsLabel>
                    <Typography variant="h2" component="h3" sx={{ mt: 0.25 }}>{selected.name}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.75, flexWrap: 'wrap' }}>
                      <Mono>{selected.code}</Mono>
                      {selected.status === 'inactive' && <StatusBadge status="inactive" />}
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{path.map((p) => p.name).join(' › ')}</Typography>
                    </Box>
                    <Typography sx={{ mt: 1, fontSize: 13 }} data-testid="cls-holds">Holds {holdingsText(selected.subtree)}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Shown here because it {reasonText(selected.visibleBecause)}</Typography>
                  </Box>
                  {canManage && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {selected.depth < leafDepth && <Button startIcon={<AddRounded />} onClick={() => setDialog({ open: true, parent: selected, existing: null })}>Add {levels[selected.depth + 1].toLowerCase()}</Button>}
                      <Button startIcon={<EditRounded />} onClick={() => setDialog({ open: true, parent: null, existing: selected })}>Rename</Button>
                      {selected.depth > 0 && <Button startIcon={<DriveFileMoveRounded />} onClick={() => setMoving(selected)}>Move to…</Button>}
                      <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setRetiring(selected)}>Retire</Button>
                    </Box>
                  )}
                </Box>
              </Surface>
              {canSeeRules && <ClassificationRules key={selected.id} node={selected} canManage={canEditRules} onChanged={tree.reload} />}
            </Box>
          )}
        </Box>
      </DialogContent>

      <NodeDialog open={dialog.open} screen={screen} parent={dialog.parent} existing={dialog.existing} levels={levels}
        onClose={() => setDialog({ open: false, parent: null, existing: null })}
        onSaved={(id) => {
          if (dialog.parent) setExpanded((s) => new Set(s).add(dialog.parent!.id));
          setSelectedId(id);
          toast.success(dialog.existing ? 'Saved.' : `Added to ${SCREEN_LABEL[screen]}.`);
          changed();
        }} />
      <MoveDialog open={!!moving} screen={screen} node={moving} onClose={() => setMoving(null)}
        onMoved={() => { toast.success('Moved.'); changed(); }} />
      <ConfirmDialog open={!!retiring} title={`Retire ${retiring?.name ?? ''}?`} danger confirmLabel="Retire"
        body={retiring && holdsAnything(retiring.subtree)
          ? `It holds ${holdingsText(retiring.subtree)}, so it will be refused — re-file or retire those first.`
          : 'It is removed from every screen. Its own rules and default values go with it.'}
        onClose={() => setRetiring(null)}
        onConfirm={async () => {
          await cfApi.del(`/classification/${retiring?.id}`);
          toast.success('Retired.');
          setSelectedId(retiring?.parentId ?? null);
          changed();
        }} />
    </Dialog>
  );
}

