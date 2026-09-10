import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AlertTitle, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, List, ListItemButton,
  ListItemText, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BuildCircleRounded from '@mui/icons-material/BuildCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';

import { fabQuery } from '../api/client';
import type { FilterValue } from '../api/client';
import { Surface, EmptyState } from '../components';
import { MaterializeOutcome, type MaterializeResponse } from './OrderTaskDag';
import type { OrderReadiness } from '../api/readiness';
import StructureEditor from './StructureEditor';

/**
 * An order line, as the structure editor and the line picker need it.
 *
 * `templateItemId` is what the line was sold AS — the catalog item whose BOM is
 * this structure. It is why the editor no longer opens on a template picker:
 * the line answered that question when it was added.
 */
interface OrderLineRef {
  id: number;
  code?: string | null;
  description?: string | null;
  lineType?: string | null;
  templateItemId?: number | null;
  catalogItemId?: number | null;
}
import api, { API_HOST } from '@core/utils/axiosConfig';

// Tree can be 1000+ rows across hundreds of top-level branches — everything
// here is lazy: top-level items load one page at a time, and a node's
const TOP_LEVEL_PAGE_SIZE = 200;

// ─── Types ──────────────────────────────────────────────────────────────────

interface FabItemRow {
  id: number;
  companyId?: number;
  orderId: number;
  flowId: number | null;
  parentItemId: number | null;
  catalogItemId: number | null;
  name: string;
  /** Generated identity code — server-issued and frozen, never edited here. */
  code?: string | null;
  unit: string | null;
  qty: number;
  /** Cut dimensions — meaningful on the bottom rows, blank once parts are joined. */
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimUnit?: string | null;
  /** Weight of ONE, typed by a human. Null when nobody has entered it. */
  unitWeight?: number | null;
  /** Σ(child qty × child effective weight). Server-owned — never written from here. */
  computedUnitWeight?: number | null;
  /** (unitWeight ?? computedUnitWeight) × qty. Server-owned. */
  totalWeight?: number | null;
  weightUnit?: string | null;
  createdAt?: string;
  updatedAt?: string;
  orderNumber?: string;
  catalogItemCode?: string | null;
  catalogItemUnit?: string | null;
  /** 'make' | 'buy'. Null on rows created before the column existed — read it
   *  through procurementOf(), which treats absent as 'make'. */
  procurementType?: string | null;
}

interface ItemsSummary {
  totalWeight: number | null;
  itemCount: number;
  unweighedLeaves: number;
  uncodedItems: number;
  /** Shared `CUSTOMER-SONUMBER` head of every code in this order. */
  codePrefix: string | null;
}



function errMsg(e: unknown, fallback = 'Something went wrong'): string {
  const ax = e as { response?: { status?: number; data?: { message?: string; error?: string } }; message?: string };
  if (ax.response?.status === 404) return 'Not found — row may have been deleted by someone else.';
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? fallback;
}


/*
 * ItemNode and AddItemRow lived here — a second tree for a structure that had
 * already been built, showing name and unit with the sizes a click away behind
 * a dialog. Two views of one thing that disagreed about what a row is, and one
 * of them saved on blur while the other batched.
 *
 * StructureEditor is both cases now. See the render below.
 */


// ─── Root component ─────────────────────────────────────────────────────────

export interface OrderItemsTreeProps {
  orderId: number;
  canManage: boolean;
  /** The order's stage readiness — supplies the Build tasks warning its counts. */
  readiness?: OrderReadiness | null;
  /**
   * Tell the order page a stage moved, so the strip above follows along.
   * Pass the readiness an endpoint already returned to save a round-trip.
   */
  onStageChanged?: (next?: OrderReadiness | null) => void;
}

export default function OrderItemsTree({ orderId, canManage, readiness, onStageChanged }: OrderItemsTreeProps) {
  const [topItems, setTopItems] = useState<FabItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [sheetBusy, setSheetBusy] = useState(false);
  const sheetFileRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<OrderLineRef[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  /**
   * The line whose structure is being edited.
   *
   * A structure belongs to ONE line — an order with three lines is three
   * structures, and the codes below each are prefixed by its own code. The old
   * dialog carried a line selector inside itself; this asks first, because with
   * a single line there is nothing to ask and the question should not appear.
   */
  const [editorLine, setEditorLine] = useState<OrderLineRef | null>(null);
  const [linePickerOpen, setLinePickerOpen] = useState(false);

  /** Which question the editor opens on — see the buttons for the difference. */
  const [editorSource, setEditorSource] = useState<'bom' | 'current'>('bom');

  const openStructureEditor = useCallback((src: 'bom' | 'current' = 'bom') => {
    setEditorSource(src);
    if (lines.length === 1) { setEditorLine(lines[0]); setEditorOpen(true); return; }
    if (lines.length === 0) { setError('Add an order line first — the structure hangs off one.'); return; }
    setLinePickerOpen(true);
  }, [lines]);
  /** Structure types on this order's lines — shown as a hint in the editor. */

  const [summary, setSummary] = useState<ItemsSummary | null>(null);
  const [procCounts, setProcCounts] = useState<{ make: number; buy: number } | null>(null);
  // Incremented after every recompute or code run; every node watches it and
  // re-reads its server-owned fields, so editing a plate at the bottom updates
  // the girder at the top without remounting the tree.
  const [treeVersion, setTreeVersion] = useState(0);

  // An item tree on its own produces no work: until tasks are materialized the
  // order has no schedule, no critical chain, and is invisible to Dispatch and
  // the Task Queue. That button used to live only on the Task DAG tab, so a
  // planner could import 400 rows here, walk away, and never learn the order
  // was inert. `taskCount === null` means the count could not be read — that is
  // not the same as zero, so it must never trigger the prompt on its own.
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [itemsChanged, setItemsChanged] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [materializeResult, setMaterializeResult] = useState<MaterializeResponse | null>(null);

  // Lazy: only top-level items (parentItemId === null) are fetched here —
  // never the whole order's item list. Filter keys are camelCase for reads
  // (orderId / parentItemId), matching fabErpItem's exposed field names —
  // a snake_case key here would silently return unfiltered rows.
  const loadTop = useCallback(async (afterId?: number) => {
    const filters: Record<string, FilterValue> = { orderId, parentItemId: null };
    if (afterId) filters['id.GT'] = afterId;
    const res = await fabQuery<{ data: FabItemRow[] }>('fabErpItem', {
      filters,
      orderBy: [{ field: 'id', direction: 'asc' }],
      pagination: { limit: TOP_LEVEL_PAGE_SIZE },
    });
    return res.data ?? [];
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    Promise.all([
      loadTop(),
      // Cheap "are there tasks yet?" probe — a true COUNT over the same secured
      // WHERE, never rows.length, and one row fetched only because the query API
      // always returns a page. Failure resolves to null (unknown), not 0, so a
      // hiccup here can never invent a "no tasks" warning.
      fabQuery<{ total?: number | null }>('fabErpProjectTask', {
        fields: ['id'],
        filters: { orderId },
        pagination: { limit: 1 },
        includeTotal: true,
      }).then((r) => r.total ?? null).catch(() => null),
    ]).then(([rows, tasks]) => {
      if (cancelled) return;
      setTopItems(rows);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
      setTaskCount(tasks);
    }).catch((e) => { if (!cancelled) setError(errMsg(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadTop, orderId]);

  const apiBase = useCallback(
    () => `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}/items`,
    [orderId],
  );

  const loadSummary = useCallback(async () => {
    try {
      const res = await api.get<ItemsSummary>(`${apiBase()}/weight-summary`);
      setSummary(res.data);
    } catch { /* the strip is informational — never block the tree on it */ }
  }, [apiBase]);

  /**
   * How much of this order is bought in, counted across the WHOLE tree.
   *
   * Counted by the server rather than from the rows on screen: the tree loads
   * children a page at a time and only where somebody has expanded, so
   * anything counted in the browser would be a count of what has been looked
   * at. Two `total`s off the query API cost less than a new endpoint.
   */
  const loadProcurementCounts = useCallback(async () => {
    try {
      const ask = (procurementType: string) => fabQuery<{ total?: number | null }>('fabErpItem', {
        // `total` is opt-in on this API and is a real COUNT over the same
        // secured WHERE — asking without the flag returns no total at all, and
        // reading data.length would report the page size instead.
        fields: ['id'],
        filters: { orderId, procurementType },
        pagination: { limit: 1 },
        includeTotal: true,
      }).then((r) => r.total ?? 0);
      const [make, buy] = await Promise.all([ask('make'), ask('buy')]);
      setProcCounts({ make, buy });
    } catch { /* informational, same as the strip it sits in */ }
  }, [orderId]);

  useEffect(() => { loadSummary(); loadProcurementCounts(); }, [loadSummary, loadProcurementCounts]);

  // The editor needs the lines themselves, not just their distinct types: the
  // chosen line supplies the span code, and its type supplies the default parts.
  useEffect(() => {
    fabQuery<{ data: OrderLineRef[] }>('fabErpOrderLine', {
      filters: { orderId },
      orderBy: [{ field: 'lineNo', direction: 'asc' }],
      pagination: { limit: 200 },
    })
      .then((r) => setLines(r.data ?? []))
      .catch(() => setLines([]));
  }, [orderId]);


  async function loadMore() {
    if (topItems.length === 0) return;
    setLoadingMore(true);
    try {
      const lastId = topItems[topItems.length - 1].id;
      const rows = await loadTop(lastId);
      setTopItems((prev) => [...prev, ...rows]);
      setHasMore(rows.length === TOP_LEVEL_PAGE_SIZE);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // New rows always arrive with flow_id NULL and no tasks behind them, so any
  // add re-opens the prompt — including one the user dismissed earlier, and
  // including an order that already had tasks (the new rows still have none).
  // The previous run's outcome is cleared because it no longer describes the tree.
  function markItemsChanged(next?: OrderReadiness | null) {
    setItemsChanged(true);
    setCtaDismissed(false);
    setMaterializeResult(null);
    // Every tree change can move a stage — a new part is a part with no
    // material and no flow, and the strip has to say so immediately. Endpoints
    // that already computed readiness hand it over rather than making the page
    // ask for it again.
    onStageChanged?.(next);
  }

  // Same endpoint the Task DAG tab's "Materialize tasks" button calls — the
  // point of the prompt is that acting on it must not require finding another tab.
  // buildTasks() REMOVED 2026-08-15. Raising the production order already builds
  // the tree in the same transaction (ensureProductionOrder → materializeOrderTasks),
  // so this created it before the order that owns it existed and before the
  // Parameters step had been done — freezing every estimate against values
  // nobody had entered. The prompt below stays and now points at that step.


  if (loading) {
    return (
      <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Surface>
    );
  }

  // Only prompt when there is genuinely something to build: rows exist, and
  // either the order has no tasks at all or rows were added since the last run.
  // An order whose tasks are already current shows nothing.
  /**
   * Lines this step can build something from — ones that name a catalog item,
   * because that item's BOM is the structure. A free-text line names nothing and
   * has nothing to expand.
   */
  const buildable = lines.filter((l) => (l.templateItemId ?? l.catalogItemId) != null);

  const blockersHere = (readiness?.blockers ?? []).filter((b) => b.stage !== 'nesting');

  async function downloadStructureSheet() {
    setSheetBusy(true); setError('');
    try {
      const res = await api.get(
        `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}/structure/export`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Structure.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errMsg(e, 'Could not download the sheet'));
    } finally { setSheetBusy(false); }
  }

  /**
   * A sheet REPLACES the structure when one is already there.
   *
   * Adding to it would be the other reading, and it is the wrong one: the sheet
   * is the whole structure, exported and edited, so importing it as an addition
   * would double every row somebody did not delete. The server refuses without
   * `replace`, so a first import into an empty order is unaffected.
   */
  async function uploadStructureSheet(file: File) {
    setSheetBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('excel_file', file);
      if (topItems.length > 0) form.append('replace', 'true');
      const line = lines.find((l) => (l.templateItemId ?? l.catalogItemId) != null) ?? lines[0];
      if (line) form.append('orderLineId', String(line.id));
      await api.post(
        `${API_HOST}/api/${localStorage.getItem('companySlug')}/fab_erp/orders/${orderId}/structure/import`,
        form, { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      markItemsChanged();
      setTreeVersion((v) => v + 1);
      await Promise.all([loadSummary(), loadProcurementCounts()]);
      setTopItems(await loadTop());
    } catch (e) {
      setError(errMsg(e, 'That sheet could not be imported'));
    } finally { setSheetBusy(false); }
  }

  const showBuildPrompt = canManage
    && topItems.length > 0
    && !ctaDismissed
    && !materializeResult
    && (taskCount === 0 || itemsChanged);

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/*
        WHAT THIS STEP COUNTS, and what it no longer does.

        Total weight used to sit here. It was rolled up from length, width and
        thickness typed onto each row — and those fields have gone, because a
        blank's size belongs to the blank, not to the row that happens to want
        one. Until dimensions come back on the catalog item, a weight here could
        only read "—", and a statistic that never has a value is worse than no
        statistic at all.
      */}
      {summary && summary.itemCount > 0 && (
        <Surface e={1} sx={{ px: 2, py: 1.25, mb: 1.5, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
              Items
            </Typography>
            <Typography sx={{ fontSize: 18, fontFamily: 'monospace', color: 'var(--c-text)' }}>{summary.itemCount}</Typography>
          </Box>
          {/* What this order has to be bought in for, against what it builds.
              The number the purchasing step will act on, so it reads here
              rather than only by scanning several hundred rows for badges. */}
          {procCounts && (procCounts.make > 0 || procCounts.buy > 0) && (
            <Box>
              <Typography sx={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)' }}>
                Make / Buy
              </Typography>
              <Tooltip title={`${procCounts.make} made here, ${procCounts.buy} bought in. A row is bought in when the catalog item it is bound to says so; everything else is made here.`}>
                <Typography sx={{ fontSize: 18, fontFamily: 'monospace', color: 'var(--c-text)' }}>
                  {procCounts.make}
                  <Box component="span" sx={{ color: 'var(--c-text-3)', px: 0.5 }}>/</Box>
                  <Box component="span" sx={{ color: procCounts.buy > 0 ? 'var(--c-warn-fg, #8a5a00)' : 'var(--c-text-3)' }}>
                    {procCounts.buy}
                  </Box>
                </Typography>
              </Tooltip>
            </Box>
          )}
        </Surface>
      )}

      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          {/*
            ONLY ONCE SOMETHING IS BUILT. With no structure the bill of materials
            is already on the page, editable, so a button offering to open it is
            a second door to the room you are standing in. What it is for is the
            other case: throwing away what was built and taking the recipe again.
          */}
          {/*
            EDIT AND REBUILD ARE DIFFERENT ACTS, so they are different buttons.

            Edit opens what this order SETTLED ON and saves a diff: a row you
            keep is the same row, so the dimensions typed on it and the plate it
            was nested onto come with it. Rebuild takes the catalogue's recipe
            again and replaces everything, which loses all of that — right when
            the recipe has changed, wrong for changing one quantity.
          */}
          {topItems.length > 0 && (
            <>
              <Tooltip title="Take the bill of materials again and REPLACE what is here. Anything typed on the current rows goes with them.">
                <Button variant="outlined" size="small" onClick={() => openStructureEditor('bom')}>
                  Rebuild from the BOM
                </Button>
              </Tooltip>
            </>
          )}

          {/*
            THE SHEET, for the times a keyboard beats three hundred clicks.
            Not the old BOQ sheet — that one's four code columns WERE the
            structure, and neither codes nor one-row-per-piece survive. A level
            column carries the shape now, and the dimensions ride along because
            this is the one place somebody can fill in three hundred of them.
          */}
          <Tooltip title="The structure as a spreadsheet — levels, quantities and sizes.">
            <Button
              variant="outlined" size="small" disabled={sheetBusy}
              startIcon={sheetBusy ? <CircularProgress size={14} color="inherit" /> : <DownloadRounded />}
              onClick={downloadStructureSheet}
            >
              Download Excel
            </Button>
          </Tooltip>
          <Tooltip title="Read a filled sheet back. Nothing is written unless the whole sheet parses.">
            <Button
              variant="outlined" size="small" disabled={sheetBusy}
              startIcon={sheetBusy ? <CircularProgress size={14} color="inherit" /> : <UploadFileRounded />}
              onClick={() => sheetFileRef.current?.click()}
            >
              Upload Excel
            </Button>
          </Tooltip>
          <input
            ref={sheetFileRef} type="file" accept=".xlsx" hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadStructureSheet(f);
              e.target.value = '';
            }}
          />
          {/*
            THE EXCEL IS GONE FROM THIS STEP, and so is code generation.

            The BOQ sheet's four code columns WERE the structure — span, girder,
            segment, part — with tree position baked into every code. That is the
            model the BOM step stopped using: a row is a design, the quantity
            lives on the row, and codes are issued at production-order time. An
            importer that still writes positional codes and per-piece rows would
            undo all of that on the first upload.

            An Excel route back in wants to speak the new language — blanks,
            lots, quantities — so it is a rewrite, not a button to re-enable.
          */}
        </Box>
      )}


      {/*
        * Which line, when there is more than one. A structure belongs to a line
        * and takes its code, so this cannot be guessed.
        */}
      <Dialog open={linePickerOpen} onClose={() => setLinePickerOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Which line?</DialogTitle>
        <DialogContent>
          <List dense>
            {lines.map((l) => (
              <ListItemButton
                key={l.id}
                onClick={() => { setEditorLine(l); setLinePickerOpen(false); setEditorOpen(true); }}
              >
                <ListItemText
                  primary={l.description || l.code || `Line ${l.id}`}
                  secondary={l.code ? `code ${l.code}` : undefined}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinePickerOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <StructureEditor
        open={editorOpen}
        source={editorSource}
        orderId={orderId}
        orderLine={editorLine ? {
          id: editorLine.id,
          code: editorLine.code ?? null,
          // What this line is — so the editor opens on it rather than asking again.
          itemId: editorLine.templateItemId ?? editorLine.catalogItemId ?? null,
        } : null}
        onClose={() => { setEditorOpen(false); setEditorLine(null); }}
        onDone={() => { markItemsChanged(); loadSummary(); loadProcurementCounts(); setTreeVersion((v) => v + 1); loadTop().then(setTopItems).catch(() => {}); }}
      />

      {showBuildPrompt && (
        <Alert
          severity="warning"
          icon={<BuildCircleRounded fontSize="inherit" />}
          sx={{ mb: 1.5 }}
          action={(
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* The "Build tasks" button is gone — see buildTasks() above. The
                  prompt itself is still worth having: knowing the tree is not
                  built is useful, and the text now names the step that builds it. */}
              <Tooltip title="Dismiss">
                <IconButton size="small" aria-label="Dismiss" onClick={() => setCtaDismissed(true)}>
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        >
          <AlertTitle sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-text)' }}>
            {taskCount === 0 ? 'No tasks have been built for this order' : 'Items added — their tasks are not built yet'}
          </AlertTitle>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
            An item tree produces no work on its own. Until tasks are built, this order has no
            schedule, no critical chain, and never reaches Dispatch or the Task Queue.
            Finish <strong>Flows</strong> and <strong>Parameters</strong>, then raise the
            production order on the <strong>Production</strong> tab — that is what builds them,
            and it is also what freezes every estimate, so the values want to be right first.
          </Typography>

          {/* The old copy said items with no flow "are skipped" and left the
              reader to go and count them. These are the actual numbers, from the
              same readiness the strip above renders — and they are a warning,
              not a gate: building tasks for a half-nested order is a legitimate
              thing to do when you want the shop cutting while the rest of the
              BOQ is still being drawn. */}
          {/*
              NESTING BLOCKERS ARE NOT SHOWN HERE. "26 of 26 parts have no raw
              material" is a true sentence about the nesting step, and it was
              being read on the structure step, where raw material is not a
              question that has been asked yet. It still reads on Nesting.
          */}
          {blockersHere.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.25, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
              {blockersHere.map((b, i) => (
                <Typography key={i} component="li" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {b.message}
                </Typography>
              ))}
            </Box>
          )}
        </Alert>
      )}

      {materializeResult && (
        <MaterializeOutcome result={materializeResult} onClose={() => setMaterializeResult(null)} />
      )}

      {/*
        THE BILL OF MATERIALS IS THE STEP, not something a button opens.

        This used to be an empty box with "Add top-level item" and a button that
        opened the BOM in a dialog — so the step that is ABOUT the structure
        showed none of it, and the one thing worth looking at was one click away
        behind a modal.

        Now: nothing built yet and a line that names an item, and the BOM is
        simply here, editable, with Create at the bottom. Nothing is written
        until that is pressed, which is what makes it safe to be the page.

        "Add top-level item" is gone. A structure is what the order SELLS, taken
        apart — hand-typing a root beside it produced a branch belonging to no
        line, which nesting, procurement and the production order all then had
        to have an opinion about. Rows are still added, copied and removed
        inside the tree, where they hang off something.
      */}
      {topItems.length === 0 ? (
        buildable.length === 1 ? (
          <StructureEditor
            variant="inline"
            open
            orderId={orderId}
            orderLine={{
              id: buildable[0].id,
              code: buildable[0].code ?? null,
              description: buildable[0].description ?? null,
              itemId: buildable[0].templateItemId ?? buildable[0].catalogItemId ?? null,
            }}
            onClose={() => {}}
            onDone={() => {
              markItemsChanged(); loadSummary(); loadProcurementCounts();
              setTreeVersion((v) => v + 1);
              loadTop().then(setTopItems).catch(() => {});
            }}
          />
        ) : buildable.length > 1 ? (
          <Surface e={1} sx={{ p: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 0.5 }}>
              This order sells {buildable.length} things
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', maxWidth: 460, mx: 'auto', mb: 2 }}>
              Each has its own bill of materials. Build them one at a time — nothing is written
              until you accept it.
            </Typography>
            <Button variant="contained" startIcon={<AccountTreeRounded />} onClick={() => setLinePickerOpen(true)}>
              Build a structure
            </Button>
          </Surface>
        ) : (
          <EmptyState
            icon={<AddIcon />}
            title="Nothing to build from yet"
            hint="Add a line item first — what this order sells is what the structure is built from."
          />
        )
      ) : (
        /*
         * BUILT OR NOT, THE STRUCTURE IS THE SAME SCREEN.
         *
         * A built order used to fall back to a different tree — one that showed
         * name and unit and nothing else, with the sizes a click away behind
         * "Edit the structure". So the step that owns the dimensions did not
         * show them, and two views of one thing disagreed about what a row is.
         *
         * The editor is now both cases. It batches: nothing is written until
         * Save, which is the same promise it makes on an empty order, rather
         * than the old tree's save-on-blur — one mental model instead of two on
         * one screen.
         */
        <StructureEditor
          key={`built-${treeVersion}`}
          variant="inline"
          source="current"
          open
          orderId={orderId}
          orderLine={buildable[0] ? {
            id: buildable[0].id,
            code: buildable[0].code ?? null,
            description: buildable[0].description ?? null,
            itemId: buildable[0].templateItemId ?? buildable[0].catalogItemId ?? null,
          } : null}
          onClose={() => {}}
          onDone={() => {
            markItemsChanged(); loadSummary(); loadProcurementCounts();
            setTreeVersion((v) => v + 1);
            loadTop().then(setTopItems).catch(() => {});
          }}
        />
      )}

      {hasMore && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
          <Button size="small" onClick={loadMore} disabled={loadingMore}
            startIcon={loadingMore ? <CircularProgress size={12} /> : undefined}>
            Load more top-level items
          </Button>
        </Box>
      )}
    </Box>
  );
}
