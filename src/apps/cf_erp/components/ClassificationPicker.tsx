import { useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete, Box, MenuItem, TextField, Typography, createFilterOptions } from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { CreatedClassification, NodeScope, Tree, TreeNode } from '../api/types';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useLoad } from '../hooks/useLoad';
import { flattenTree, type FlatNode } from '../lib/tree';
import { FormDialog } from './FormDialog';
import { ErrorNotice } from './ui';
import { useToast } from './toastContext';

/* ── Creating one ─────────────────────────────────────────────────────────── */

/** The one route that makes a classification node from the catalog side. */
const CREATE_PATH = '/catalog/classification';

/**
 * The backend's refusals, in words (the pattern MachineTypeDialog uses).
 * `invalid()` already sends a sentence and a `problems` list, and ErrorNotice
 * shows both — and its NOT_ALLOWED names the very family it refused, which is
 * better than anything said here. So this adds what to do about it next rather
 * than talking over it; a code with nothing to add keeps the answer as it came.
 */
const REFUSAL_NEXT: Record<string, string> = {
  NOT_ALLOWED: 'Choose a family that holds items instead, or start a new one here.',
};

function asRefusal(e: unknown): CfApiError {
  const err = e instanceof CfApiError ? e : new CfApiError(0, e instanceof Error ? e.message : String(e));
  const next = err.code ? REFUSAL_NEXT[err.code] : undefined;
  if (!next || err.problems.includes(next)) return err;
  return new CfApiError(err.status, err.message, err.code, [...err.problems, next]);
}

const NEW = '__new__';

/** One level of the chain: an existing node, or a new one typed in here. */
interface LevelDraft { pick: string; code: string; name: string }
const BLANK: LevelDraft = { pick: '', code: '', name: '' };

/** A node the level selects can offer — from the tree, or made a moment ago. */
interface PickNode { id: number; parentId: number | null; depth: number; code: string; name: string; status: 'active' | 'inactive'; scope: NodeScope }

function allNodes(tree: Tree | null): PickNode[] {
  const out: PickNode[] = [];
  const walk = (n: TreeNode) => {
    out.push({ id: n.id, parentId: n.parentId, depth: n.depth, code: n.code, name: n.name, status: n.status, scope: n.scope });
    n.children.forEach(walk);
  };
  (tree?.roots ?? []).forEach(walk);
  return out;
}

/**
 * Creates a classification node without leaving the form that needed it —
 * a Variant, and the Family and Subfamily above it when those are missing too.
 *
 * The backend makes one node per request, so the chain is written top down and
 * what it managed to create stays created: a refusal half way turns the levels
 * already written into ordinary picks, so trying again does not make a second
 * copy of them.
 *
 * Machine families are never offered as a parent and machine scope is never
 * sent — the route refuses both (NOT_ALLOWED), and a machine type is added
 * from the Machines screen instead.
 */
export function CreateClassificationDialog({
  open, tree, initialName, fixedDepth = null, onClose, onCreated,
}: {
  open: boolean;
  /** The tree the caller already holds; with none the dialog reads its own. */
  tree?: Tree | null;
  /** What the person had typed into the picker — the new node's name, to start. */
  initialName?: string;
  /** Create at this level only (a picker that wants a Variant); otherwise the level is chosen here. */
  fixedDepth?: number | null;
  onClose: () => void;
  /** The new node, ready to be selected and to be shown in a picker that has not reloaded its tree. */
  onCreated?: (node: FlatNode) => void;
}) {
  const toast = useToast();
  // Nothing is fetched while it is shut, and nothing is fetched at all when the
  // caller already has the tree on screen.
  const own = useLoad(() => (open && !tree ? cfApi.get<Tree>('/classification') : Promise.resolve(null)), [open, !tree]);
  const t = tree ?? own.data;
  const levels = useMemo(() => t?.levels ?? ['Family', 'Subfamily', 'Variant'], [t]);
  const leafDepth = t?.leafDepth ?? levels.length - 1;
  const levelCount = levels.length;
  const nodes = useMemo(() => allNodes(t), [t]);

  const [depth, setDepth] = useState<number>(fixedDepth ?? leafDepth);
  const [above, setAbove] = useState<LevelDraft[]>(() => Array.from({ length: levelCount }, () => ({ ...BLANK })));
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  /** Levels written by this dialog — options until the caller's tree catches up. */
  const [made, setMade] = useState<PickNode[]>([]);

  // Set up once per opening. The tree can land a moment after the dialog does,
  // and a second reset then would wipe what was already typed.
  const started = useRef(false);
  useEffect(() => {
    if (!open) { started.current = false; return; }
    if (started.current) return;
    started.current = true;
    setDepth(fixedDepth ?? leafDepth);
    setAbove(Array.from({ length: levelCount }, () => ({ ...BLANK })));
    setForm({ code: '', name: initialName?.trim() ?? '', description: '' });
    setMade([]);
  }, [open, fixedDepth, leafDepth, levelCount, initialName]);

  const setLevel = (d: number, patch: Partial<LevelDraft>) => setAbove((rows) => rows.map((r, i) => (i === d ? { ...r, ...patch } : r)));
  // A new level has nothing under it yet, so everything below it is new too.
  const pickLevel = (d: number, value: string) => setAbove((rows) => rows.map((r, i) => (i < d ? r : i === d ? { ...r, pick: value } : { ...BLANK })));

  const optionsAt = (d: number, parentId: number | null) => {
    const seen = new Set<number>();
    const out: PickNode[] = [];
    for (const n of [...nodes, ...made]) {
      // Machine families are a rule, not a filter: nothing under one may hold items.
      if (n.depth !== d || n.parentId !== parentId || n.scope === 'machine' || seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
    return out;
  };

  /** The rows above the new node, each resolved against the one before it. */
  const chain = useMemo(() => {
    const rows: { depth: number; draft: LevelDraft; isNew: boolean; forced: boolean; options: PickNode[]; waiting: boolean }[] = [];
    let parentId: number | null = null;
    let parentIsNew = false;
    let waiting = false;
    for (let d = 0; d < depth; d++) {
      const draft = above[d] ?? BLANK;
      const isNew = parentIsNew || draft.pick === NEW;
      // Nothing exists under a level that is itself new, so there is nothing to
      // choose from there — every level below it is typed in.
      rows.push({ depth: d, draft, isNew, forced: parentIsNew, options: parentIsNew ? [] : optionsAt(d, parentId), waiting });
      if (isNew) {
        parentIsNew = true;
        parentId = null;
        if (!draft.code.trim() || !draft.name.trim()) waiting = true;
      } else if (draft.pick) {
        parentId = Number(draft.pick);
      } else {
        parentId = null;
        waiting = true;
      }
    }
    return { rows, ready: !waiting };
    // `nodes` and `made` feed optionsAt; the rest is state this reads directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [above, depth, nodes, made]);

  const ready = chain.ready && !!form.code.trim() && !!form.name.trim();

  const submit = async () => {
    const rows = above.map((r) => ({ ...r }));
    const madeNow: PickNode[] = [];
    const madeLabels: string[] = [];
    const trail: string[] = [];
    let parentId: number | null = null;
    try {
      for (let d = 0; d < depth; d++) {
        const draft = rows[d];
        if (draft.pick && draft.pick !== NEW) {
          const id = Number(draft.pick);
          parentId = id;
          trail.push([...nodes, ...made, ...madeNow].find((n) => n.id === id)?.name ?? '');
          continue;
        }
        const node: CreatedClassification = await cfApi.post<CreatedClassification>(CREATE_PATH, { parentId, code: draft.code.trim(), name: draft.name.trim(), scope: 'both' });
        rows[d] = { pick: String(node.id), code: '', name: '' };
        madeNow.push({ id: node.id, parentId, depth: node.depth, code: node.code, name: node.name, status: 'active', scope: node.scope });
        madeLabels.push(levels[d] ?? `level ${d + 1}`);
        trail.push(node.name);
        parentId = node.id;
      }
      const leaf = await cfApi.post<CreatedClassification>(CREATE_PATH, {
        parentId, code: form.code.trim(), name: form.name.trim(), description: form.description.trim() || undefined, scope: 'both',
      });
      const also = madeLabels.map((l) => l.toLowerCase()).join(' and ');
      toast.success(`${leaf.code} created${also ? `, with its ${also}` : ''}.`);
      onCreated?.({
        id: leaf.id,
        depth: leaf.depth,
        level: levels[leaf.depth] ?? levels[depth] ?? '',
        code: leaf.code,
        name: leaf.name,
        path: [...trail, leaf.name].join(' › '),
        family: trail[0] ?? leaf.name,
        scope: leaf.scope,
        status: 'active',
        isLeaf: leaf.depth === leafDepth,
      });
    } catch (e) {
      // What was written above stays written — the rows become ordinary picks,
      // so a second attempt continues from where this one stopped.
      if (madeNow.length) {
        setAbove(rows);
        setMade((m) => [...m, ...madeNow]);
      }
      throw asRefusal(e);
    }
  };

  const levelWord = (levels[depth] ?? 'Variant').toLowerCase();
  return (
    <FormDialog open={open} onClose={onClose} onSubmit={submit} submitLabel={`Create ${levelWord}`} busyLabel="Creating…" submitDisabled={!ready} maxWidth="sm"
      title={`New ${levelWord}`}
      subtitle={`Where items and definitions sit: ${levels.join(' › ')}. Choose the levels above it, or make those here too.`}>
      <ErrorNotice error={own.error} onRetry={own.reload} sx={{ mb: 0 }} />
      {fixedDepth == null && (
        <TextField select size="small" label="Create a" value={String(depth)} onChange={(e) => setDepth(Number(e.target.value))}
          helperText={depth === leafDepth ? 'Items and definitions sit on this level' : 'A level to hang others under'}>
          {levels.map((l, i) => <MenuItem key={l} value={String(i)}>{l}</MenuItem>)}
        </TextField>
      )}
      {chain.rows.map(({ depth: d, draft, isNew, forced, options, waiting }) => (
        <Box key={d} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
          {/* The choice stays on screen after "new" is picked, so it can be taken back. */}
          {!forced && (
            <TextField select size="small" label={levels[d]} value={draft.pick} onChange={(e) => pickLevel(d, e.target.value)} disabled={waiting} sx={{ gridColumn: '1 / -1' }}
              helperText={waiting ? `Choose a ${(levels[d - 1] ?? '').toLowerCase()} first` : options.length ? `Which ${levels[d].toLowerCase()} it sits under` : `There is no ${levels[d].toLowerCase()} here yet — make one`}>
              {options.map((o) => <MenuItem key={o.id} value={String(o.id)}>{o.name}{o.status === 'inactive' ? ' (inactive)' : ''}</MenuItem>)}
              <MenuItem value={NEW}>+ New {levels[d].toLowerCase()}…</MenuItem>
            </TextField>
          )}
          {isNew && (
            <>
              <TextField size="small" required label={`New ${levels[d].toLowerCase()} code`} value={draft.code} onChange={(e) => setLevel(d, { code: e.target.value })}
                inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText="Generated codes are built from it" />
              <TextField size="small" required label={`New ${levels[d].toLowerCase()} name`} value={draft.name} onChange={(e) => setLevel(d, { name: e.target.value })}
                helperText={forced ? `Under the new ${(levels[d - 1] ?? '').toLowerCase()}` : ' '} />
            </>
          )}
        </Box>
      ))}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 2 }}>
        <TextField size="small" required label={`${levels[depth] ?? 'Variant'} code`} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
          inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} helperText='Letters, digits, "_", "-" or "." — no spaces' />
        <TextField size="small" required autoFocus label={`${levels[depth] ?? 'Variant'} name`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <TextField size="small" label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} sx={{ gridColumn: '1 / -1' }} />
      </Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
        It is made for items and definitions alike; specification rules can be set on it at any time afterwards.
      </Typography>
    </FormDialog>
  );
}

/* ── Picking one ──────────────────────────────────────────────────────────── */

/** The synthetic last option that opens the creator. */
interface CreateOption { create: true; id: number; label: string }
type Option = FlatNode | CreateOption;
const isCreate = (o: Option): o is CreateOption => 'create' in o;
const filterNodes = createFilterOptions<Option>();

/**
 * Picks a classification node. `leafOnly` limits it to Variants (where items
 * and definitions sit); `scope` hides nodes scoped to the other kind — a
 * picker filter only, never a rule (decision Q6). Machine families are a rule:
 * they show only with scope 'machine', and only they do.
 *
 * `allowCreate` adds the missing node from the list itself, so a half-filled
 * item form is never abandoned to go and make a Variant. It is opt-in: a
 * read-only or filter picker offers nothing to create.
 */
export function ClassificationPicker({
  tree, value, onChange, label = 'Variant', leafOnly = true, scope, disabled, helperText, error, required, autoFocus,
  allowCreate = false, onTreeChanged,
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
  /** Offer "create the one I need" in the list. Needs the catalog grant, and never for machines. */
  allowCreate?: boolean;
  /** A node was created here — the screen that owns the tree should read it again. */
  onTreeChanged?: () => void;
}) {
  const isPermitted = useIsPermitted();
  // A machine family is not made here: that route refuses it, and the Machines
  // screen has its own machine-type dialog.
  const canCreate = allowCreate && scope !== 'machine' && !disabled && isPermitted('cf_erp_catalog_manage');
  const [made, setMade] = useState<FlatNode[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [input, setInput] = useState('');

  const options = useMemo(() => {
    const fromTree = flattenTree(tree);
    const known = new Set(fromTree.map((n) => n.id));
    const all = [...fromTree, ...made.filter((m) => !known.has(m.id))];
    const offered = all.filter((n) => {
      if ((leafOnly && !n.isLeaf) || n.status !== 'active') return false;
      if (scope === 'machine') return n.scope === 'machine';
      return n.scope !== 'machine' && (!scope || n.scope === 'both' || n.scope === scope);
    });
    // The list is grouped by family, and a node made a moment ago is appended
    // rather than in tree order — keep each family together so it does not get
    // a second heading of its own until the tree is read again.
    const familyOrder = new Map<string, number>();
    offered.forEach((n) => { if (!familyOrder.has(n.family)) familyOrder.set(n.family, familyOrder.size); });
    offered.sort((a, b) => (familyOrder.get(a.family) ?? 0) - (familyOrder.get(b.family) ?? 0));
    // The node already on the record stays on the list even when the filters
    // would drop it (it went inactive, say) — otherwise the picker reads empty
    // and looks as if nothing is set.
    const current = value != null && !offered.some((o) => o.id === value) ? all.find((n) => n.id === value) : null;
    return current ? [current, ...offered] : offered;
  }, [tree, made, leafOnly, scope, value]);
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <>
      <Autocomplete<Option>
        options={options}
        value={selected}
        disabled={disabled}
        groupBy={(o) => (isCreate(o) ? 'New' : o.family)}
        getOptionLabel={(o) => (isCreate(o) ? o.label : o.path)}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        inputValue={input}
        onInputChange={(_, v) => setInput(v)}
        filterOptions={(opts, state) => {
          const shown = filterNodes(opts, state);
          if (!canCreate) return shown;
          const typed = state.inputValue.trim();
          return [...shown, { create: true, id: -1, label: typed ? `Create “${typed}”…` : `New ${label.toLowerCase()}…` }];
        }}
        onChange={(_, o) => {
          if (o && isCreate(o)) setCreating(input.trim());
          else onChange(o?.id ?? null);
        }}
        renderInput={(params) => <TextField {...params} label={label} helperText={helperText} error={error} required={required} autoFocus={autoFocus} />}
        size="small"
        fullWidth
      />
      {canCreate && (
        <CreateClassificationDialog open={creating != null} tree={tree} initialName={creating ?? ''} fixedDepth={leafOnly ? (tree?.leafDepth ?? null) : null}
          onClose={() => setCreating(null)}
          onCreated={(node) => {
            // Selectable at once: the caller's tree has not been read again yet.
            setMade((m) => [...m, node]);
            setInput(node.path);
            onChange(node.id);
            onTreeChanged?.();
          }} />
      )}
    </>
  );
}
