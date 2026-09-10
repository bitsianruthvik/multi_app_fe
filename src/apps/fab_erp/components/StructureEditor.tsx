import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { fabQuery } from '../api/client';
import { backendMessage, Surface } from '../components';
import { DialogCloseButton } from './FormDialog';
import DrawingsPanel from './DrawingsPanel';
import {
  getDraftTree, getCurrentTree, buildStructure, applyStructure, type DraftNode,
} from '../api/templates';

/**
 * The structure, edited directly.
 *
 * ── WHY THIS REPLACED A WIZARD ────────────────────────────────────────────
 * A wizard asks questions in an order somebody chose in advance. Building a
 * span is not that: you look at what the BOM says, change the numbers that are
 * wrong for this job, delete the bits this bridge does not have, add the bit
 * nobody catalogued, and copy the span you just described because the second
 * one is nearly the same. None of that is a question with an answer; all of it
 * is editing a tree.
 *
 * COPYING A ROW IS THE SPLIT CONTROL. The wizard had a grouping grid to say
 * "these four differ from those two", which is a second concept for something
 * the tree already expresses: copy the row and change the copy. One gesture,
 * and it works the same whether you are changing a quantity or adding a part.
 *
 * ── ONE ROW PER THING, QUANTITY ON THE ROW ────────────────────────────────
 * Six diaphragms are one row reading 6. That is what the BOM says, what the
 * editor shows, and what gets written — the composite girder is 32 rows here
 * where expanding it produced 1,276 for the same 669 tonnes. It is also what
 * the rest of the system already assumes: weights multiply unit by quantity, a
 * task covers `task_qty` pieces, and a mark names a design rather than a piece.
 *
 * NOTHING IS WRITTEN UNTIL CREATE. The tree lives here until then, so a wrong
 * turn costs an undo rather than a half-built order.
 */

interface CatalogOption {
  id: number;
  name: string;
  code: string | null;
  categoryName?: string | null;
  groupName?: string | null;
  subgroupName?: string | null;
}

export interface StructureEditorLine {
  id: number;
  code: string | null;
  /** The catalog item this line was sold as — its BOM opens here. */
  itemId?: number | null;
  /** What it is called, for the heading. */
  description?: string | null;
}

let localSeq = 0;
const localKey = () => `local${++localSeq}`;

/** Deep copy with fresh keys, so a copied subtree is addressable on its own. */
function cloneSubtree(node: DraftNode): DraftNode {
  return { ...node, key: localKey(), children: node.children.map(cloneSubtree) };
}

/** Replace one node anywhere in the tree, returning a new tree. */
function mapNode(node: DraftNode, key: string, fn: (n: DraftNode) => DraftNode): DraftNode {
  if (node.key === key) return fn(node);
  return { ...node, children: node.children.map((c) => mapNode(c, key, fn)) };
}

/** Remove one node, and its subtree, from anywhere below the root. */
function dropNode(node: DraftNode, key: string): DraftNode {
  return {
    ...node,
    children: node.children.filter((c) => c.key !== key).map((c) => dropNode(c, key)),
  };
}

/** Insert a copy of a node, with its subtree, directly after it among its siblings. */
/**
 * Move `dragKey` so it sits where `overKey` is, AMONG THE SAME SIBLINGS.
 *
 * Reordering only — a row cannot be dropped into a different parent this way.
 * Dragging a Top Flange out of a Segment and into a Diaphragm is a different
 * operation with different consequences (its quantity is per-parent, its flow
 * came from a BOM line that no longer applies), and doing it by accident while
 * aiming two rows further down is exactly how that would happen. Add and remove
 * already exist for a genuine move.
 */
function moveWithinSiblings(node: DraftNode, dragKey: string, overKey: string): DraftNode {
  const kids = node.children;
  const from = kids.findIndex((c) => c.key === dragKey);
  const to = kids.findIndex((c) => c.key === overKey);

  if (from >= 0 && to >= 0 && from !== to) {
    const next = [...kids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return { ...node, children: next };
  }
  // Not this level's business — ask the children.
  return { ...node, children: kids.map((c) => moveWithinSiblings(c, dragKey, overKey)) };
}

function duplicateNode(node: DraftNode, key: string): DraftNode {
  const children: DraftNode[] = [];
  for (const c of node.children) {
    if (c.key === key) children.push(c, cloneSubtree(c));
    else children.push(duplicateNode(c, key));
  }
  return { ...node, children };
}

/** Every piece this tree would produce, quantities multiplied down. */
function countPieces(node: DraftNode, carried = 1): number {
  const here = carried * (Number(node.qty) || 0);
  return node.children.reduce((sum, c) => sum + countPieces(c, here), here);
}

/** Rows still waiting for a number. The recipe no longer guesses on their behalf. */
function unanswered(node: DraftNode, out: string[] = []): string[] {
  if (node.qty == null) out.push(node.name);
  node.children.forEach((c) => unanswered(c, out));
  return out;
}

function countRows(node: DraftNode): number {
  return 1 + node.children.reduce((s, c) => s + countRows(c), 0);
}

export default function StructureEditor({
  open, orderId, orderLine, onClose, onDone, variant = 'dialog', source = 'bom',
}: {
  open: boolean;
  orderId: number;
  /** `inline` renders it as the step itself; `dialog` for rebuilding over one. */
  variant?: 'inline' | 'dialog';
  /**
   * Where the tree comes from. 'bom' takes the catalogue's recipe — a rebuild.
   * 'current' takes what this order settled on — an edit, saved as a diff.
   */
  source?: 'bom' | 'current';
  orderLine: StructureEditorLine | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tree, setTree] = useState<DraftNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addUnder, setAddUnder] = useState<string | null>(null);
  const [showDrawings, setShowDrawings] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<CatalogOption[]>([]);

  /**
   * TWO SOURCES, AND THEY ARE DIFFERENT QUESTIONS.
   *
   *   'bom'      what does the catalogue say this is made of
   *   'current'  what did we settle on
   *
   * They stop being the same answer the moment somebody changes a quantity, and
   * offering only the first meant the only way to alter one row was to throw
   * away all of them and take the recipe again.
   */
  useEffect(() => {
    if (!open) { setTree(null); return; }
    setLoading(true); setError(''); setExisting(null);
    const read = source === 'current'
      ? getCurrentTree(orderId, orderLine?.id ?? null).then((r) => r.tree)
      : (orderLine?.itemId == null
        ? Promise.resolve(null)
        : getDraftTree(Number(orderLine.itemId)).then((r) => r.tree));
    read
      .then(setTree)
      .catch((e) => setError(backendMessage(e, 'Could not read that structure.')))
      .finally(() => setLoading(false));
  }, [open, source, orderId, orderLine?.id, orderLine?.itemId]);

  // Anything addable, for the "add a row" picker. Raw materials excluded for
  // the same reason as the line picker: they are stock, not structure.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const cats = await fabQuery<{ data: { id: number; name: string }[] }>('fabErpItemCategory', {
          pagination: { limit: 200 },
        });
        /*
         * WIDER THAN THE LINE PICKER, and deliberately so: a structure holds
         * bought-in components as well as fabricated ones — a composite girder
         * span carries 7,212 headed shear studs, which live under Fasteners &
         * Hardware. What it never holds is a machine or a machine spare.
         */
        const ADDABLE = new Set(['Fabricated', 'Fasteners & Hardware', 'Consumables']);
        const wanted = (cats.data ?? []).filter((c) => ADDABLE.has(c.name)).map((c) => c.id);
        const r = await fabQuery<{ data: CatalogOption[] }>('fabErpItemCatalog', {
          filters: wanted.length ? { categoryId: wanted } : {},
          orderBy: [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 1000 },
        });
        setCatalog(r.data ?? []);
      } catch { setCatalog([]); }
    })();
  }, [open]);

  /**
   * A CLEARED QUANTITY IS null, NOT ZERO.
   *
   * It used to become 0, and the writers turned 0 into 1 — so emptying the box
   * on "16 splices" silently built one. A blank has to survive as a blank all
   * the way to the server, which refuses it, because 1 reads as a decision in a
   * way that an empty box never does.
   */
  const setQty = useCallback((key: string, raw: string) => {
    setTree((t) => (t ? mapNode(t, key, (n) => ({ ...n, qty: raw === '' ? null : Number(raw) })) : t));
  }, []);

  /**
   * A size, on the row it belongs to.
   *
   * Kept as the STRING that was typed rather than a number, so a half-entered
   * "12." survives the next keystroke and a cleared box stays cleared instead of
   * springing back to 0. It is parsed once, on save.
   */
  /** The flow on one row. Null is a real answer, not a missing one. */
  const [flows, setFlows] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fabQuery<{ data: { id: number; name: string }[] }>('fabErpOperationFlow', {
      filters: { active: 1 },
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 200 },
    }).then((r) => setFlows(r.data ?? [])).catch(() => setFlows([]));
  }, []);

  /**
   * WHAT IS BEING DRAGGED, and what it is currently over.
   *
   * `overKey` is held so the drop target can show a line where the row would
   * land. Without it a drag is a guess: you let go and find out.
   */
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const dropOn = useCallback((targetKey: string) => {
    setTree((t) => (t && dragKey && dragKey !== targetKey
      ? moveWithinSiblings(t, dragKey, targetKey)
      : t));
    setDragKey(null);
    setOverKey(null);
  }, [dragKey]);

  const setFlow = useCallback((key: string, flowId: number | null) => {
    setTree((t) => (t ? mapNode(t, key, (n) => ({ ...n, defaultFlowId: flowId })) : t));
  }, []);

  const setDim = useCallback((key: string, field: string, raw: string) => {
    setTree((t) => (t ? mapNode(t, key, (n) => ({
      ...n, dims: { ...(n.dims ?? {}), [field]: raw },
    })) : t));
  }, []);

  const remove = useCallback((key: string) => {
    setTree((t) => (t ? dropNode(t, key) : t));
  }, []);

  const copy = useCallback((key: string) => {
    setTree((t) => (t ? duplicateNode(t, key) : t));
  }, []);

  const addChild = useCallback((parentKey: string, picked: CatalogOption) => {
    setTree((t) => (t ? mapNode(t, parentKey, (n) => ({
      ...n,
      children: [...n.children, {
        key: localKey(),
        catalogItemId: picked.id,
        name: picked.name,
        unit: null,
        qty: 1,
        // The BOM's own abbreviation for this rung. A hand-added row has none,
        // and nothing here needs one: the BOM step writes no codes at all.
        // These ride along for the code pass at production-order time.
        codeSegment: null,
        codeJoin: 'dash',
        defaultFlowId: null,
        bomLineId: null,
        qtyParam: null,
        dims: {},
        children: [],
      }],
    })) : t));
    setAddUnder(null);
  }, []);

  async function create(replace = false) {
    if (!tree) return;
    setBusy(true); setError(''); setExisting(null);
    try {
      if (source === 'current') {
        // A DIFF: rows that survived keep their ids, and with them the
        // dimensions typed on them and the plate they were nested onto.
        await applyStructure(orderId, { tree, orderLineId: orderLine?.id ?? null });
      } else {
        await buildStructure(orderId, {
          tree,
          orderLineId: orderLine?.id ?? null,
          ...(replace ? { replace: true } : {}),
        });
      }
      onDone();
      onClose();
    } catch (e) {
      const res = (e as { response?: { status?: number; data?: { code?: string; existing?: number } } }).response;
      if (res?.status === 409 && res.data?.code === 'ALREADY_BUILT') setExisting(res.data.existing ?? 0);
      // Stay open on any other failure. The edits took effort and losing them
      // is the fastest way to make somebody stop using this.
      else setError(backendMessage(e, 'Could not create that structure.'));
    } finally { setBusy(false); }
  }

  const rows = useMemo(() => (tree ? countRows(tree) : 0), [tree]);
  const pieces = useMemo(() => (tree ? countPieces(tree) : 0), [tree]);
  const missing = useMemo(() => (tree ? unanswered(tree) : []), [tree]);

  const renderNode = (node: DraftNode, depth: number) => {
    const isCollapsed = !!collapsed[node.key];
    const hasKids = node.children.length > 0;
    return (
      <Box key={node.key}>
        <Box
          draggable={depth > 0}
          onDragStart={(e) => { setDragKey(node.key); e.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { setDragKey(null); setOverKey(null); }}
          onDragOver={(e) => {
            // Only a sibling can land here, so only a sibling gets a drop cue.
            if (!dragKey || dragKey === node.key) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (overKey !== node.key) setOverKey(node.key);
          }}
          onDragLeave={() => setOverKey((k) => (k === node.key ? null : k))}
          onDrop={(e) => { e.preventDefault(); dropOn(node.key); }}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            pl: `${depth * 20}px`, py: 0.4,
            borderBottom: '1px solid var(--c-divider)',
            '&:hover .rowActions': { opacity: 1 },
            '&:hover .dragHandle': { opacity: depth > 0 ? 0.55 : 0 },
            cursor: depth > 0 && dragKey === node.key ? 'grabbing' : undefined,
            opacity: dragKey === node.key ? 0.4 : 1,
            // Where it would land, shown before you let go.
            boxShadow: overKey === node.key && dragKey && dragKey !== node.key
              ? 'inset 0 2px 0 0 var(--c-primary-500)' : undefined,
          }}
        >
          {/*
            The handle is a grip, not a button. The whole row is draggable — the
            handle exists so it is DISCOVERABLE, since nothing else on the row
            says it can be moved.
          */}
          <Box
            className="dragHandle"
            aria-hidden
            sx={{
              width: 10, flexShrink: 0, opacity: 0, transition: 'opacity .12s',
              cursor: depth > 0 ? 'grab' : 'default', color: 'var(--c-text-3)',
              fontSize: 13, lineHeight: 1, userSelect: 'none',
            }}
          >
            {depth > 0 ? '⣿' : ''}
          </Box>
          <IconButton
            size="small"
            sx={{ p: 0.25, visibility: hasKids ? 'visible' : 'hidden' }}
            onClick={() => setCollapsed((c) => ({ ...c, [node.key]: !c[node.key] }))}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
          >
            {isCollapsed ? <ChevronRightRounded fontSize="small" /> : <ExpandMoreRounded fontSize="small" />}
          </IconButton>

          {/*
            The BOM's own parameter name for this quantity — `segmentsPerLine` —
            used to sit here. It is the name of a variable, and the number it
            drives is now in the box to the right where anyone can change it, so
            it was jargon standing next to its own answer.
          */}
          <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>{node.name}</Typography>

          {/* The root is the line itself and there is exactly one of it. */}
          {depth > 0 && (
            <TextField
              size="small" type="number"
              value={node.qty ?? ''}
              onChange={(e) => setQty(node.key, e.target.value)}
              placeholder={node.qtyParam ?? 'how many'}
              error={node.qty == null}
              sx={{ width: 76 }}
              inputProps={{ min: 0, step: 1, style: { fontSize: 12, textAlign: 'right' } }}
            />
          )}

          {/*
            THE SIZE, ON THE LEAF ONLY.

            An assembly has no rectangle — a Segment's weight and area are its
            parts summed, not a shape of its own — so three empty boxes beside it
            would be three questions with no answer, and somebody would
            eventually fill them in.

            Here rather than only on the Dimensions step because this is where a
            person is looking at the part. The grid is still better for typing
            three hundred in a row; this is better for the one in front of you.
            They are the same values either way.
          */}
          {hasKids ? (
            <Box sx={{ width: 234, flexShrink: 0 }} />
          ) : (
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              {(['thickness_mm', 'width_mm', 'length_mm'] as const).map((f) => (
                <TextField
                  key={f}
                  size="small" type="number"
                  placeholder={f === 'thickness_mm' ? 'thk' : f === 'width_mm' ? 'wid' : 'len'}
                  value={node.dims?.[f] ?? ''}
                  onChange={(e) => setDim(node.key, f, e.target.value)}
                  sx={{ width: 74 }}
                  inputProps={{ min: 0, style: { fontSize: 11.5, textAlign: 'right' } }}
                />
              ))}
            </Box>
          )}

          {/*
            HOW IT IS MADE, on the row.

            This had a step of its own — a per-depth summary you could not edit
            and a list of rows whose flow was missing, one screen after the
            screen where you could actually say so. The BOM line is where the
            answer comes from, so the BOM row is where it belongs.

            NOT leaf-only: an assembly is welded and carries a flow like anything
            else. Blank is a real answer for a level that only groups its
            children — a Span is not made, it is what the made things add up to.
          */}
          <TextField
            select size="small"
            value={node.defaultFlowId ?? ''}
            onChange={(e) => setFlow(node.key, e.target.value === '' ? null : Number(e.target.value))}
            sx={{ width: 150, flexShrink: 0 }}
            SelectProps={{ displayEmpty: true }}
            inputProps={{ style: { fontSize: 11.5 } }}
          >
            <MenuItem value=""><em>No flow</em></MenuItem>
            {flows.map((f) => (
              <MenuItem key={f.id} value={f.id} sx={{ fontSize: 12.5 }}>{f.name}</MenuItem>
            ))}
          </TextField>

          {/* A fixed slot, so the quantity column does not shift as rows differ. */}
          <Box className="rowActions" sx={{
            display: 'flex', width: 76, flexShrink: 0, justifyContent: 'flex-end',
            opacity: 0, transition: 'opacity .12s',
          }}>
            {/*
              DRAWINGS, but only on a row that EXISTS.
              A drawing is a file attached to an item id; a row somebody just
              added has none until Save, so offering it there would be a button
              that could only fail. Attached to a girder it is inherited by every
              part beneath it, which is why the general arrangement is not
              attached two hundred times.
            */}
            {node.itemId != null && (
              <Tooltip title="Drawings">
                <IconButton
                  size="small" sx={{ p: 0.25 }}
                  onClick={() => setShowDrawings((d) => (d === node.key ? null : node.key))}
                >
                  <DescriptionRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Add something under this">
              <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setAddUnder(node.key)}>
                <AddRounded sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            {depth > 0 && (
              <>
                <Tooltip title="Copy this and everything under it">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={() => copy(node.key)}>
                    <ContentCopyRounded sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove this and everything under it">
                  <IconButton size="small" sx={{ p: 0.25 }} onClick={() => remove(node.key)}>
                    <DeleteOutlineRounded sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>

        {addUnder === node.key && (
          <Box sx={{ pl: `${(depth + 1) * 20}px`, py: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
            <Autocomplete
              options={catalog}
              sx={{ flex: '1 1 300px' }}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, v) => { if (v) addChild(node.key, v); }}
              filterOptions={(opts, { inputValue }) => {
                const q = inputValue.trim().toLowerCase();
                if (!q) return opts.slice(0, 50);
                return opts.filter((o) => [o.name, o.code, o.categoryName, o.groupName, o.subgroupName]
                  .filter(Boolean).join(' ').toLowerCase().includes(q));
              }}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box>
                    <Typography sx={{ fontSize: 13 }}>{o.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                      {[o.categoryName, o.groupName, o.subgroupName].filter(Boolean).join(' › ')}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(p) => <TextField {...p} size="small" label={`Add under ${node.name}`} autoFocus />}
            />
            <Button size="small" onClick={() => setAddUnder(null)}>Cancel</Button>
          </Box>
        )}

        {showDrawings === node.key && node.itemId != null && (
          <Box sx={{ pl: `${(depth + 1) * 20}px`, pr: 1.5, py: 1 }}>
            <DrawingsPanel itemId={node.itemId} canManage dense />
          </Box>
        )}

        {!isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </Box>
    );
  };

  const noItem = orderLine?.itemId == null;

  const body = (
    <>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {existing != null && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This line already has <b>{existing}</b> row(s). Building again would add a second copy of
          everything. Replace what is there, or leave it as it is.
        </Alert>
      )}

      {noItem && (
        <Alert severity="info">
          This line does not say what it is. Set its item on the Line items step and its bill of
          materials will open here.
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={16} />
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading the bill of materials…</Typography>
        </Box>
      )}

      {missing.length > 0 && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {missing.length === 1
            ? <><b>{missing[0]}</b> needs a quantity.</>
            : <><b>{missing.length} rows</b> need a quantity: {missing.slice(0, 4).join(', ')}
              {missing.length > 4 ? `, and ${missing.length - 4} more` : ''}.</>}
          {' '}These change from job to job, so the recipe does not guess.
        </Alert>
      )}

      {tree && !loading && (
        <>
          {/* The only thing on this screen that scrolls. */}
          <Surface
            e={1}
            sx={{ p: 0, overflowY: 'auto', flex: 1, minHeight: 0, maxHeight: variant === 'inline' ? '58vh' : undefined, mb: 2 }}
          >
            {renderNode(tree, 0)}
          </Surface>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box>
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Rows</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{rows}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pieces</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{pieces.toLocaleString('en-IN')}</Typography>
            </Box>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', alignSelf: 'flex-end', pb: 0.5 }}>
              One row per design, its quantity says how many exist.
            </Typography>
          </Box>
        </>
      )}
    </>
  );

  const isEdit = source === 'current';

  const createButton = isEdit ? (
    <Button
      variant="contained" disabled={!tree || busy || missing.length > 0}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
      onClick={() => void create(false)}
    >
      Save changes
    </Button>
  ) : existing != null ? (
    <Button
      variant="contained" color="warning" disabled={busy}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
      onClick={() => void create(true)}
    >
      Replace the {existing} row(s)
    </Button>
  ) : (
    <Button
      variant="contained" disabled={!tree || busy || missing.length > 0}
      startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
      onClick={() => void create(false)}
    >
      {tree ? `Create ${rows} row(s)` : 'Create'}
    </Button>
  );

  /**
   * INLINE IS THE REAL HOME OF THIS SCREEN.
   *
   * It began as a dialog opened from a button, which meant the Structure step
   * itself showed an empty box and an invitation to open something else. The
   * bill of materials IS the structure — putting it behind one more click made
   * the step look like it had nothing to say.
   *
   * The dialog shape is kept for the one case that still needs it: rebuilding a
   * line that already has rows, where the screen behind is showing the thing
   * being replaced.
   */
  if (variant === 'inline') {
    if (!open) return null;
    return (
      <Surface e={1} sx={{ p: 2, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {orderLine?.description ? `${orderLine.description} — bill of materials` : 'Bill of materials'}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            This is what the catalogue says this is made of. Change the numbers, remove what this
            job does not have, add what it does. Nothing is saved until you press Create.
          </Typography>
        </Box>
        {body}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>{createButton}</Box>
      </Surface>
    );
  }

  return (
    <Dialog
      open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { height: '84vh' } }}
    >
      <DialogCloseButton absolute onClose={onClose} disabled={busy} />
      <DialogTitle sx={{ fontWeight: 600 }}>
        {isEdit ? 'Edit the structure' : 'Rebuild from the bill of materials'}
        <Typography variant="body2" color="text.secondary">
          {isEdit
            ? 'This is what this order settled on. Change the numbers, remove what it does not have, add what it does. Rows you keep stay the same rows — their sizes and their plate come with them.'
            : 'This takes the catalogue’s recipe again and REPLACES what is here. Anything typed on the current rows goes with them.'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {body}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {createButton}
      </DialogActions>
    </Dialog>
  );
}
