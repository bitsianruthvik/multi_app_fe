import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { fabQuery } from '../api/client';
import { backendMessage, Surface } from '../components';
import { DialogCloseButton } from './FormDialog';
import { getDraftTree, buildStructure, type DraftNode } from '../api/templates';

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

function countRows(node: DraftNode): number {
  return 1 + node.children.reduce((s, c) => s + countRows(c), 0);
}

export default function StructureEditor({
  open, orderId, orderLine, onClose, onDone,
}: {
  open: boolean;
  orderId: number;
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

  const [catalog, setCatalog] = useState<CatalogOption[]>([]);

  // ── open on the line's own item ───────────────────────────────────────────
  useEffect(() => {
    if (!open || orderLine?.itemId == null) { setTree(null); return; }
    setLoading(true); setError(''); setExisting(null);
    getDraftTree(Number(orderLine.itemId))
      .then((r) => setTree(r.tree))
      .catch((e) => setError(backendMessage(e, 'Could not read that structure.')))
      .finally(() => setLoading(false));
  }, [open, orderLine?.itemId]);

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

  const setQty = useCallback((key: string, raw: string) => {
    setTree((t) => (t ? mapNode(t, key, (n) => ({ ...n, qty: raw === '' ? 0 : Number(raw) })) : t));
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
        children: [],
      }],
    })) : t));
    setAddUnder(null);
  }, []);

  async function create(replace = false) {
    if (!tree) return;
    setBusy(true); setError(''); setExisting(null);
    try {
      await buildStructure(orderId, {
        tree,
        orderLineId: orderLine?.id ?? null,
        ...(replace ? { replace: true } : {}),
      });
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

  const renderNode = (node: DraftNode, depth: number) => {
    const isCollapsed = !!collapsed[node.key];
    const hasKids = node.children.length > 0;
    return (
      <Box key={node.key}>
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          pl: `${depth * 20}px`, py: 0.4,
          borderBottom: '1px solid var(--c-divider)',
          '&:hover .rowActions': { opacity: 1 },
        }}>
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
              size="small" type="number" value={node.qty}
              onChange={(e) => setQty(node.key, e.target.value)}
              sx={{ width: 88 }}
              inputProps={{ min: 0, step: 1, style: { fontSize: 12, textAlign: 'right' } }}
            />
          )}

          {/* A fixed slot, so the quantity column does not shift as rows differ. */}
          <Box className="rowActions" sx={{
            display: 'flex', width: 76, flexShrink: 0, justifyContent: 'flex-end',
            opacity: 0, transition: 'opacity .12s',
          }}>
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

        {!isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </Box>
    );
  };

  return (
    <Dialog
      open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { height: '84vh' } }}
    >
      <DialogCloseButton absolute onClose={onClose} disabled={busy} />
      <DialogTitle sx={{ fontWeight: 600 }}>
        Structure
        <Typography variant="body2" color="text.secondary">
          This is the BOM. Change the numbers, remove what this job does not have, add what it
          does. Nothing is saved until you press Create.
        </Typography>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {existing != null && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This line already has <b>{existing}</b> item(s). Building again would add a second copy
            of everything. Replace what is there, or close and pick a different line.
          </Alert>
        )}

        {orderLine?.itemId == null && (
          <Alert severity="info">
            This line does not say what it is. Set its item on the Line items step and the BOM
            will open here.
          </Alert>
        )}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
            <CircularProgress size={16} />
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Reading the BOM…</Typography>
          </Box>
        )}

        {tree && !loading && (
          <>
            {/* The only thing on this screen that scrolls. */}
            <Surface e={1} sx={{ p: 0, overflowY: 'auto', flex: 1, minHeight: 0, mb: 2 }}>
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
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        {existing != null ? (
          <Button
            variant="contained" color="warning" disabled={busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
            onClick={() => void create(true)}
          >
            Replace the {existing} item(s)
          </Button>
        ) : (
          <Button
            variant="contained" disabled={!tree || busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckRoundedIcon />}
            onClick={() => void create(false)}
          >
            {tree ? `Create ${rows} row(s)` : 'Create'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
