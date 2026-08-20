/**
 * StockIn.tsx — material arriving, recorded two ways.
 *
 *   AGAINST A PURCHASE ORDER (GrnAgainstPoPanel) — a lorry turns up with a
 *   delivery note quoting a PO. Pick the order, say how much of each line came.
 *   The point is the LINKAGE: stock booked against the line that ordered it, so
 *   "what is still outstanding" is a fact rather than somebody's memory.
 *
 *   DIRECT — the original form below. Steel bought off the shelf with no
 *   purchase order, no supplier and no document to group under, so it is a
 *   single form for one item rather than a header with line items.
 *
 * Both were needed. This screen shipped with only the second, on the reasoning
 * that purchase orders had been removed from the system — they came back in
 * 2026-08 and the receiving screen never followed, so the only way to receive
 * against a PO was to find its sales order and use the Procurement tab's dialog
 * one line at a time.
 *
 * Writes through POST /stock/receive, never the generic /mutate path.
 * fabErpStockPiece is writable through the query API, but mutateController has
 * no post-insert hook — and the whole reason this route exists is the hook:
 * reevaluateStockGatedTasks() is the only thing that re-checks tasks blocked
 * waiting for material. A piece inserted any other way shows as on hand while
 * the tasks waiting for it stay blocked, silently.
 *
 * MULTI-PIECE. Collapsed by default, because most receipts are one line. It is
 * kept at all because consumeStock deducts piece by piece and stamps each
 * ledger row with that piece's batch, and the Stock screen segments by piece —
 * so plate arriving as six plates with six heat numbers has to be six rows, or
 * heat traceability is gone at the first cut.
 *
 * SIZE AND FIELD VALUES. This form used to capture only batch/heat/serial/mark,
 * while the goods-receipt dialog next to it captured Length and Width — and the
 * asymmetry did real damage: fifty plates entered here landed with NULL
 * length_mm/width_mm, so procurement reported "50 in stock with no size
 * recorded — not counted as a match" and invented twenty-five plates of
 * shortfall on a purchase order. An unsized plate is not evidence of the right
 * plate, which is exactly why the matcher discards it, so the fix is to ask.
 *
 * Sizes and field values are written through POST /fields/values (the field
 * registry), NOT the legacy fab_custom_fields table. `length_mm`/`width_mm`
 * project straight back into the fab_stock_pieces columns the matchers read, so
 * one write feeds both. They are written AFTER the receipt rather than inside
 * it, because /stock/receive drops the per-piece dimensions on the floor —
 * `receiveStock` accepts `length_mm`/`width_mm` and routes/stock.js does not
 * forward them. They are sent in the receive body anyway so that the day the
 * route stops dropping them this becomes a harmless duplicate upsert.
 *
 * DESTINATION. The stock-area picker hides the areas that belong to machines.
 * Those hold work in process; nothing arriving from a supplier belongs in one,
 * and `Assembler-1 WIP` used to be the FIRST option here — so the obvious click
 * dropped bought plate onto a cutter. Same rule and same fallbacks as
 * GrnAgainstPoPanel: the discriminator is `fab_resources.stock_location_id`,
 * never the area's name.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Collapse, FormControlLabel, IconButton, MenuItem,
  Select, Switch, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import { fabQuery, fabPost } from '../api/client';
import {
  getFieldValues, setFieldValues, type FieldDef, type ResolvedValue,
} from '../api/fields';
import {
  PageHeader, SectionCard, StickyActionBar, DataTable, Mono, QtyCell, DateCell,
  EmptyState, ListSkeleton, useToast, backendMessage, type DataColumn,
} from '../components';
import GrnAgainstPoPanel from '../components/GrnAgainstPoPanel';

interface QueryResult<T> { data: T[]; total?: number }

interface CatalogOption {
  id: number; name: string; code: string | null; unit: string | null;
  // Carried so the field list can be narrowed to this item's branch of the
  // taxonomy — a plate must not be offered a machine's depreciation fields.
  categoryId?: number | null; groupId?: number | null; subgroupId?: number | null;
}
interface PlantRow { id: number; name: string; code: string | null }
interface LocationRow { id: number; name: string; code: string | null; plantId: number | null }
/** Only the one column that matters: the machine's own stock area. */
interface MachineRow { id: number; stockLocationId: number | null }

interface LedgerRow {
  id: number;
  txnDate: string | null;
  catalogItemName: string | null;
  stockLocationName: string | null;
  qty: number | string | null;
  batchCode: string | null;
  heatNo: string | null;
}

/** One physical piece being received. */
interface PieceDraft {
  key: number;
  qty: string;
  batchNo: string;
  heatNo: string;
  serialNo: string;
  markNo: string;
  /** The plate's own size in mm. Blank means genuinely unknown, not zero. */
  lengthMm: string;
  widthMm: string;
}

const blankPiece = (key: number): PieceDraft => ({
  key, qty: '', batchNo: '', heatNo: '', serialNo: '', markNo: '', lengthMm: '', widthMm: '',
});

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Fields with a dedicated control on this form already.
 *
 * `length_mm`/`width_mm` are per PIECE, so they get a box on each piece row
 * rather than one shared box. batch/heat/serial are columns on
 * fab_stock_pieces that `receiveStock` writes directly — offering them here as
 * well would create a second place the same fact is authored, which is the
 * drift the registry exists to remove.
 */
const FIELDS_WITH_OWN_CONTROL = new Set(['length_mm', 'width_mm', 'batch_no', 'heat_no', 'serial_no']);

/** A field carrying a taxonomy id is offered only under that branch. */
function inItemBranch(f: FieldDef, item: CatalogOption | null): boolean {
  if (f.categoryId != null && f.categoryId !== (item?.categoryId ?? null)) return false;
  if (f.groupId != null && f.groupId !== (item?.groupId ?? null)) return false;
  if (f.subgroupId != null && f.subgroupId !== (item?.subgroupId ?? null)) return false;
  return true;
}

function inheritedLabel(v: ResolvedValue | undefined): string {
  if (!v || v.value === null || v.value === undefined || v.value === '') return '';
  const text = typeof v.value === 'boolean' ? (v.value ? 'Yes' : 'No') : String(v.value);
  return v.unit ? `${text} ${v.unit}` : text;
}

export default function StockIn() {
  const { company } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const hasManage = usePermission('fab_erp_inventory_manage');
  const canManage = isAdminRole(user?.role) || hasManage;
  /**
   * TWO WRITE PATHS, TWO PERMISSIONS — do not conflate them again.
   *
   * A piece's SIZE now rides along with the receipt itself, so it needs only
   * `fab_erp_inventory_manage` — the tag the `stores` role already holds. It
   * used to require `fab_erp_items_meta_manage`, because routes/stock.js
   * dropped the dimensions and the only way to record them was a second call
   * to /fields/values. That meant the one person actually doing goods-in could
   * not record the one fact that decides whether a plate is ever matchable.
   *
   * Arbitrary FIELD VALUES on a piece still go through /fields/values and still
   * need `fab_erp_items_meta_manage`, which is right: that is editing the
   * registry, not booking a delivery.
   */
  const hasMetaManage = usePermission('fab_erp_items_meta_manage');
  const canSetFields = isAdminRole(user?.role) || hasMetaManage;
  const canSetSize = canManage;

  // ── reference data ─────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  /**
   * Stock areas that belong to a machine. `null` while unknown.
   *
   * A machine's own area is where its work in process sits — nothing bought
   * from a supplier lands there, and offering one here is how purchased plate
   * ends up recorded as WIP on a cutter. `Assembler-1 WIP` was the FIRST option
   * in this dropdown, so the obvious click was the wrong one.
   *
   * The discriminator is the LINK, not the name: `fab_resources.stock_location_id`
   * is a machine's area, and it is the same column `fab_resource_stock_areas`
   * (role 'wip') was backfilled from in the catalog-unification migration. No
   * string matching on "WIP" — a shop is free to call the area anything.
   *
   * ADVISORY ONLY. /stock/receive validates nothing about the destination, so
   * this narrows what is easy to do, not what is possible.
   */
  const [machineAreaIds, setMachineAreaIds] = useState<Set<number> | null>(null);

  /**
   * Which way the material is arriving. Defaults to the purchase order, because
   * that is the one with a document behind it — direct stock-in is the
   * exception, and defaulting to it invites somebody holding a delivery note to
   * type its contents in by hand and lose the linkage.
   */
  const [mode, setMode] = useState<'po' | 'direct'>('po');

  // ── the form ───────────────────────────────────────────────────────────────
  const [item, setItem] = useState<CatalogOption | null>(null);
  const [plantId, setPlantId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [unitCost, setUnitCost] = useState('');
  const [notes, setNotes] = useState('');
  const [pieces, setPieces] = useState<PieceDraft[]>([blankPiece(1)]);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitQty, setSplitQty] = useState('');
  const [splitCount, setSplitCount] = useState('');
  const [splitLength, setSplitLength] = useState('');
  const [splitWidth, setSplitWidth] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  /**
   * The receipt succeeded but something after it did not — a size refused, the
   * field write forbidden. Separate from `err` on purpose: the stock IS on the
   * shelf, and showing a red "could not record the stock" over a receipt that
   * happened is how the same plate gets entered twice.
   */
  const [warn, setWarn] = useState('');

  // ── field values for the pieces being received ────────────────────────────
  const [pieceFields, setPieceFields] = useState<FieldDef[]>([]);
  const [inherited, setInherited] = useState<Record<string, ResolvedValue>>({});
  const [fieldDraft, setFieldDraft] = useState<Record<string, string>>({});
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);

  // ── recent stock-ins (replaces the GRN history tab) ───────────────────────
  const [recent, setRecent] = useState<LedgerRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const res = await fabQuery<QueryResult<LedgerRow>>('fabErpStockLedger', {
        filters: { txnType: 'stock_in' },
        orderBy: [{ field: 'txnDate', direction: 'desc' }, { field: 'id', direction: 'desc' }],
        pagination: { limit: 50 },
      });
      setRecent(res.data ?? []);
    } catch {
      setRecent([]);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingRefs(true);
      try {
        const [cat, pl, loc] = await Promise.all([
          fabQuery<QueryResult<CatalogOption>>('fabErpItemCatalog', { pagination: { limit: 1000 } }),
          fabQuery<QueryResult<PlantRow>>('fabErpPlant', { pagination: { limit: 200 } }),
          fabQuery<QueryResult<LocationRow>>('fabErpStockLocation', { pagination: { limit: 500 } }),
        ]);
        if (cancelled) return;
        setCatalog(cat.data ?? []);
        setPlants(pl.data ?? []);
        setLocations(loc.data ?? []);
        // Preselect when there is no decision to make.
        if ((pl.data ?? []).length === 1) setPlantId(pl.data[0].id);
        // ?itemId= from the Stock screen's "Add stock" action. That action names
        // an ITEM, not an order, so it means the direct form — landing on the
        // purchase-order tab with the item silently preselected behind it would
        // look like the link had done nothing.
        const wanted = Number(search.get('itemId'));
        if (Number.isInteger(wanted)) {
          const hit = (cat.data ?? []).find((c) => c.id === wanted);
          if (hit) { setItem(hit); setMode('direct'); }
        }
      } finally {
        if (!cancelled) setLoadingRefs(false);
      }
    })();
    void loadRecent();
    return () => { cancelled = true; };
  }, [search, loadRecent]);

  // Which areas belong to a machine. Failing to answer must not block a
  // receipt, so an error leaves the list exactly as it was before.
  useEffect(() => {
    let cancelled = false;
    fabQuery<QueryResult<MachineRow>>('fabErpResource', { pagination: { limit: 1000 } })
      .then((res) => {
        if (cancelled) return;
        setMachineAreaIds(new Set(
          (res.data ?? [])
            .map((r) => r.stockLocationId)
            .filter((id): id is number => typeof id === 'number'),
        ));
      })
      .catch(() => { if (!cancelled) setMachineAreaIds(new Set()); });
    return () => { cancelled = true; };
  }, []);

  const plantLocations = useMemo(
    () => locations.filter((l) => plantId === '' || l.plantId === plantId),
    [locations, plantId],
  );

  const hiddenMachineAreas = useMemo(
    () => (machineAreaIds ? plantLocations.filter((l) => machineAreaIds.has(l.id)) : []),
    [plantLocations, machineAreaIds],
  );

  /**
   * The areas a receipt may actually go into.
   *
   * Falls back to the whole list if the rule would leave nothing to pick — a
   * shop whose every area is attached to a machine still has to be able to
   * book material in, and an empty required dropdown is a dead end.
   */
  const receivableLocations = useMemo(() => {
    if (!hiddenMachineAreas.length) return plantLocations;
    const kept = plantLocations.filter((l) => !machineAreaIds!.has(l.id));
    return kept.length ? kept : plantLocations;
  }, [plantLocations, hiddenMachineAreas, machineAreaIds]);

  // Changing plant invalidates a location chosen under the old one — as does
  // learning, a moment after mount, that the one showing is a machine's.
  useEffect(() => {
    if (locationId !== '' && !receivableLocations.some((l) => l.id === locationId)) setLocationId('');
    if (locationId === '' && receivableLocations.length === 1) setLocationId(receivableLocations[0].id);
  }, [receivableLocations, locationId]);

  /**
   * What the pieces will inherit from the item, and which of those a piece may
   * override.
   *
   * Resolved at `catalog_item` rather than at a piece, because no piece exists
   * yet — and the item's resolved values ARE what each new piece will start
   * with, so they double as the placeholder for every box below.
   */
  useEffect(() => {
    if (!item) { setPieceFields([]); setInherited({}); setFieldDraft({}); return; }
    let cancelled = false;
    getFieldValues('catalog_item', item.id)
      .then((res) => {
        if (cancelled) return;
        // `appliesAt` is the NARROWEST rung a field may be set on, so only a
        // field declared down to `stock_piece` may differ per plate. Anything
        // broader is a property of the item and setFields would refuse it.
        setPieceFields((res.fields ?? []).filter(
          (f) => f.appliesAt === 'stock_piece' && !FIELDS_WITH_OWN_CONTROL.has(f.fieldKey),
        ));
        setInherited(res.values ?? {});
        setFieldDraft({});
      })
      .catch(() => { if (!cancelled) { setPieceFields([]); setInherited({}); } });
    return () => { cancelled = true; };
  }, [item]);

  /** The fields actually offered — this item's branch unless asked otherwise. */
  const visibleFields = useMemo(
    () => pieceFields.filter((f) => showAllFields || inItemBranch(f, item)),
    [pieceFields, showAllFields, item],
  );

  /** Field values the user typed, applied to every piece in this receipt. */
  const sharedFieldValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of visibleFields) {
      const v = (fieldDraft[f.fieldKey] ?? '').trim();
      if (v !== '') out[f.fieldKey] = v;
    }
    return out;
  }, [visibleFields, fieldDraft]);

  const totalQty = useMemo(
    () => pieces.reduce((s, p) => s + (Number(p.qty) > 0 ? Number(p.qty) : 0), 0),
    [pieces],
  );

  /** Pieces that will land with no size, and so cannot be matched to a nest. */
  const unsizedCount = useMemo(
    () => pieces.filter((p) => Number(p.qty) > 0 && !p.lengthMm.trim() && !p.widthMm.trim()).length,
    [pieces],
  );

  const setPiece = (key: number, patch: Partial<PieceDraft>) =>
    setPieces((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addPiece = () =>
    setPieces((prev) => [...prev, blankPiece(Math.max(0, ...prev.map((p) => p.key)) + 1)]);

  const removePiece = (key: number) =>
    setPieces((prev) => (prev.length === 1 ? prev : prev.filter((p) => p.key !== key)));

  /**
   * quantity × count — the common case for identical plate off one delivery.
   *
   * Size is part of the split because that case is exactly the one that caused
   * the damage: fifty identical plates entered in one go, all fifty with no
   * length or width, all fifty invisible to the nest matcher. Typing the size
   * fifty times is not a fix anybody performs.
   */
  const applySplit = () => {
    const q = Number(splitQty);
    const n = Number(splitCount);
    if (!(q > 0) || !Number.isInteger(n) || n < 1 || n > 200) {
      setErr('Split needs a quantity above zero and a count between 1 and 200.');
      return;
    }
    setPieces(Array.from({ length: n }, (_, i) => ({
      ...blankPiece(i + 1),
      qty: String(q),
      lengthMm: splitLength.trim(),
      widthMm: splitWidth.trim(),
    })));
    setSplitOpen(false);
    setErr('');
  };

  function validate(): string | null {
    if (!item) return 'Pick the item being received.';
    if (plantId === '') return 'Pick a plant.';
    if (locationId === '') return 'Pick the stock area it is going into.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return 'Received date is required.';
    if (!pieces.some((p) => Number(p.qty) > 0)) return 'Enter a quantity for at least one piece.';
    if (pieces.some((p) => p.qty !== '' && !(Number(p.qty) > 0))) {
      return 'Every piece needs a quantity above zero — remove any you do not need.';
    }
    // A size that is present must be a real size. Blank stays allowed — "we do
    // not know" is a true answer — but "0" or "12,000" is not.
    const badSize = pieces.find((p) => Number(p.qty) > 0 && [p.lengthMm, p.widthMm]
      .some((s) => s.trim() !== '' && !(Number(s) > 0)));
    if (badSize) return 'Length and width must be a number of millimetres above zero, or left blank.';
    return null;
  }

  /**
   * Record the sizes and field values on the pieces that were just created.
   *
   * Runs AFTER the receipt and cannot undo it — see the file header for why the
   * dimensions do not travel inside /stock/receive. Every failure is collected
   * and reported rather than thrown: the steel is on the shelf either way, and
   * an exception here that looked like a failed receipt would get the same
   * delivery booked twice.
   *
   * @returns human-readable problems, empty when everything landed
   */
  async function writePieceValues(pieceIds: number[], sent: PieceDraft[]): Promise<string[]> {
    const problems: string[] = [];
    for (let i = 0; i < pieceIds.length; i += 1) {
      const p = sent[i];
      const values: Record<string, string> = { ...sharedFieldValues };
      // Sent bare: length_mm and width_mm are declared in mm, so the server
      // stores the number against its own unit. A fused "12000 mm" string is
      // precisely what the typed value_num/unit_code columns exist to prevent.
      if (p?.lengthMm.trim()) values.length_mm = p.lengthMm.trim();
      if (p?.widthMm.trim()) values.width_mm = p.widthMm.trim();
      if (!Object.keys(values).length) continue;
      try {
        const res = await setFieldValues('stock_piece', pieceIds[i], values);
        for (const r of res.rejected ?? []) problems.push(`piece #${pieceIds[i]}: ${r.fieldKey} — ${r.why}`);
      } catch (e) {
        // A 403 or an outage fails identically for every remaining piece, so
        // reporting it once beats fifty copies of the same line.
        problems.push(backendMessage(e, 'the field values could not be saved'));
        break;
      }
    }
    return problems;
  }

  async function save(addAnother: boolean) {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setSaving(true); setErr(''); setWarn('');
    const sent = pieces.filter((p) => Number(p.qty) > 0);
    try {
      const res = await fabPost<{ ok: boolean; pieceIds: number[]; qtyTotal: number; tasksCleared: number[] }>(
        'stock/receive',
        {
          catalogItemId: item!.id,
          plantId,
          stockLocationId: locationId,
          receivedDate,
          uom: item!.unit ?? null,
          unitCost: unitCost === '' ? null : Number(unitCost),
          notes: notes.trim() || null,
          pieces: sent.map((p) => ({
            qty: Number(p.qty),
            batchNo: p.batchNo.trim() || null,
            heatNo: p.heatNo.trim() || null,
            serialNo: p.serialNo.trim() || null,
            markNo: p.markNo.trim() || null,
            // Dropped by routes/stock.js today; honoured by receiveStock the
            // moment the route stops dropping them. Harmless duplicate then.
            lengthMm: p.lengthMm.trim() ? Number(p.lengthMm) : null,
            widthMm: p.widthMm.trim() ? Number(p.widthMm) : null,
          })),
        },
      );

      const problems = await writePieceValues(res.pieceIds ?? [], sent);

      // Say when work was actually unblocked — that is the point of recording
      // stock, and it is otherwise invisible until someone opens the queue.
      const freed = res.tasksCleared?.length ?? 0;
      toast(
        freed > 0
          ? `Stock added — ${freed} task${freed > 1 ? 's' : ''} unblocked.`
          : 'Stock added.',
        'success',
      );

      await loadRecent();

      if (problems.length) {
        // Stay put. Navigating away over a size that did not land is how the
        // shortfall goes unnoticed until procurement invents phantom plates.
        setWarn(
          `The stock is recorded, but its size or field values were not: ${problems.join('; ')}. `
          + 'Set them on the piece from Item Batches → Segment by → Stock Piece.',
        );
        setPieces([blankPiece(1)]);
        return;
      }

      if (addAnother) {
        // Keep the context (plant, area, date); clear what changes per receipt.
        setItem(null);
        setPieces([blankPiece(1)]);
        setUnitCost('');
        setNotes('');
        setFieldDraft({});
      } else {
        navigate(`/${company}/fab_erp/item-batches?itemId=${item!.id}`);
      }
    } catch (e) {
      setErr(backendMessage(e, 'Could not record the stock.'));
    } finally {
      setSaving(false);
    }
  }

  const recentColumns: DataColumn<LedgerRow>[] = [
    { key: 'date', header: 'Date', render: (r) => <DateCell value={r.txnDate} />, sortValue: (r) => r.txnDate },
    { key: 'item', header: 'Item', render: (r) => r.catalogItemName ?? '—', sortValue: (r) => r.catalogItemName },
    { key: 'location', header: 'Stock area', render: (r) => r.stockLocationName ?? '—', sortValue: (r) => r.stockLocationName },
    { key: 'qty', header: 'Qty', render: (r) => <QtyCell value={r.qty} />, sortValue: (r) => Number(r.qty) },
    {
      key: 'trace', header: 'Batch / heat',
      render: (r) => (r.batchCode || r.heatNo ? <Mono chip>{[r.batchCode, r.heatNo].filter(Boolean).join(' · ')}</Mono> : '—'),
      sortValue: (r) => r.batchCode,
    },
  ];

  if (loadingRefs) return <ListSkeleton rows={6} />;

  return (
    <Box>
      <PageHeader
        title="Stock in"
        subtitle="Record material arriving. Tasks waiting on it become eligible as soon as it lands."
      />

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can see what has been received, but adding stock needs the inventory permission.
        </Alert>
      )}

      {canManage && (
        <Box sx={{ borderBottom: '1px solid var(--c-divider)', mb: 2 }}>
          <Tabs value={mode} onChange={(_, v) => setMode(v as 'po' | 'direct')}>
            <Tab value="po" label="Against a purchase order" sx={{ minHeight: 42 }} />
            <Tab value="direct" label="Direct stock in" sx={{ minHeight: 42 }} />
          </Tabs>
        </Box>
      )}

      {canManage && mode === 'po' && (
        <GrnAgainstPoPanel
          plants={plants}
          locations={locations}
          onReceived={loadRecent}
        />
      )}

      {canManage && mode === 'direct' && (
        <SectionCard
          title="Receive material"
          subtitle="Material bought without a purchase order — there is no line to close, so this records the stock only."
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 980 }}>
            {err && <Alert severity="error" onClose={() => setErr('')}>{err}</Alert>}
            {warn && <Alert severity="warning" onClose={() => setWarn('')}>{warn}</Alert>}

            <Autocomplete
              options={catalog}
              value={item}
              onChange={(_, v) => setItem(v)}
              getOptionLabel={(o) => (o.code ? `${o.name} (${o.code})` : o.name)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} label="Item *" size="small" />}
            />

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                select label="Plant *" size="small" sx={{ flex: 1, minWidth: 200 }}
                value={plantId}
                onChange={(e) => setPlantId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code ? `${p.code} — ${p.name}` : p.name}</MenuItem>)}
              </TextField>
              <TextField
                select label="Stock area *" size="small" sx={{ flex: 1, minWidth: 200 }}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={plantId === ''}
                helperText={
                  plantId === ''
                    ? 'Pick a plant first'
                    : hiddenMachineAreas.length && receivableLocations.length < plantLocations.length
                      ? `${hiddenMachineAreas.length} machine work-in-progress area(s) not shown`
                      : ' '
                }
              >
                {receivableLocations.map((l) => <MenuItem key={l.id} value={l.id}>{l.code ? `${l.code} — ${l.name}` : l.name}</MenuItem>)}
              </TextField>
              <TextField
                label="Received *" type="date" size="small" sx={{ width: 180 }}
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                // Not cosmetic: this date orders FIFO consumption downstream.
                helperText="Drives FIFO"
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Unit cost" type="number" size="small" sx={{ width: 180 }}
                value={unitCost} onChange={(e) => setUnitCost(e.target.value)}
                helperText={item?.unit ? `per ${item.unit}` : ' '}
              />
              <TextField
                label="Notes" size="small" sx={{ flex: 1, minWidth: 240 }}
                value={notes} onChange={(e) => setNotes(e.target.value)}
              />
            </Box>

            {/* ── pieces ───────────────────────────────────────────────────── */}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)' }}>
                  Pieces {pieces.length > 1 && `(${pieces.length})`}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Tooltip title="Split a quantity into several identical pieces">
                    <Button size="small" startIcon={<CallSplitRounded />} onClick={() => setSplitOpen((v) => !v)}>
                      Split
                    </Button>
                  </Tooltip>
                  <Button size="small" startIcon={<AddRounded />} onClick={addPiece}>Add piece</Button>
                </Box>
              </Box>

              <Collapse in={splitOpen}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5, p: 1.5, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }}>
                  <TextField label="Qty each" type="number" size="small" sx={{ width: 130 }}
                    value={splitQty} onChange={(e) => setSplitQty(e.target.value)} />
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>×</Typography>
                  <TextField label="Pieces" type="number" size="small" sx={{ width: 110 }}
                    value={splitCount} onChange={(e) => setSplitCount(e.target.value)} />
                  <TextField label="Length (mm)" type="number" size="small" sx={{ width: 140 }}
                    value={splitLength} onChange={(e) => setSplitLength(e.target.value)} />
                  <TextField label="Width (mm)" type="number" size="small" sx={{ width: 140 }}
                    value={splitWidth} onChange={(e) => setSplitWidth(e.target.value)} />
                  <Button size="small" variant="outlined" onClick={applySplit}>Apply</Button>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', flexBasis: '100%' }}>
                    Replaces the list below — add heat numbers per piece afterwards. Identical plates
                    off one delivery share a size, so filling it here fills every row.
                  </Typography>
                </Box>
              </Collapse>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pieces.map((p) => (
                  <Box key={p.key} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField label="Qty *" type="number" size="small" sx={{ width: 110 }}
                      value={p.qty} onChange={(e) => setPiece(p.key, { qty: e.target.value })} />
                    <TextField label="Batch no." size="small" sx={{ width: 140 }}
                      value={p.batchNo} onChange={(e) => setPiece(p.key, { batchNo: e.target.value })} />
                    <TextField label="Heat no." size="small" sx={{ width: 140 }}
                      value={p.heatNo} onChange={(e) => setPiece(p.key, { heatNo: e.target.value })} />
                    <TextField label="Serial no." size="small" sx={{ width: 130 }}
                      value={p.serialNo} onChange={(e) => setPiece(p.key, { serialNo: e.target.value })} />
                    <TextField label="Mark no." size="small" sx={{ width: 120 }}
                      value={p.markNo} onChange={(e) => setPiece(p.key, { markNo: e.target.value })} />
                    {/* Size is what makes this piece matchable. Procurement compares a
                        nest against stock of exactly this size, so a plate received
                        with no size can never satisfy a sized nest — it will keep
                        showing as short. Same semantics, same wording, as the goods
                        receipt dialog on the Procurement tab. */}
                    <TextField label="Length (mm)" type="number" size="small" sx={{ width: 130 }}
                      disabled={!canSetSize}
                      value={p.lengthMm} onChange={(e) => setPiece(p.key, { lengthMm: e.target.value })} />
                    <TextField label="Width (mm)" type="number" size="small" sx={{ width: 130 }}
                      disabled={!canSetSize}
                      value={p.widthMm} onChange={(e) => setPiece(p.key, { widthMm: e.target.value })} />
                    <IconButton size="small" color="error" disabled={pieces.length === 1}
                      onClick={() => removePiece(p.key)} aria-label={`Remove piece ${p.key}`}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>

              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 1 }}>
                The plate's own size. Thickness comes from the item itself. Leave blank only if
                you genuinely do not know — unsized stock cannot be matched to a nest.
              </Typography>

              {!canSetFields && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Recording extra field values on a piece needs the
                  {' '}<Mono>fab_erp_items_meta_manage</Mono>{' '} permission, which your role does
                  not have. Sizes above are unaffected — those are recorded with the receipt.
                </Alert>
              )}

              {canSetSize && unsizedCount > 0 && item && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  {unsizedCount} piece{unsizedCount > 1 ? 's have' : ' has'} no length or width.
                  {' '}They will be on hand but will not satisfy a sized nest.
                </Alert>
              )}
            </Box>

            {/* ── field values for these pieces ─────────────────────────────── */}
            {canSetFields && item && pieceFields.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)' }}>
                    Field values for these pieces
                    {Object.keys(sharedFieldValues).length > 0 && ` (${Object.keys(sharedFieldValues).length} set)`}
                  </Typography>
                  <Button size="small" onClick={() => setFieldsOpen((v) => !v)}>
                    {fieldsOpen ? 'Hide' : 'Show'}
                  </Button>
                </Box>

                <Collapse in={fieldsOpen}>
                  <Box sx={{ p: 1.5, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }}>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 1.5 }}>
                      Only fields the registry allows to differ per piece appear here; everything
                      else is a property of <strong>{item.name}</strong> and is changed on the item.
                      A box left empty keeps the item's value — what is shown greyed is what these
                      pieces will inherit. Whatever you type applies to every piece in this receipt;
                      one piece can be corrected afterwards from Item Batches.
                    </Typography>

                    <FormControlLabel
                      sx={{ mb: 1 }}
                      control={<Switch size="small" checked={showAllFields} onChange={(e) => setShowAllFields(e.target.checked)} />}
                      label={<Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Show fields from other categories</Typography>}
                    />

                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                      {visibleFields.map((f) => {
                        const placeholder = inheritedLabel(inherited[f.fieldKey]);
                        const value = fieldDraft[f.fieldKey] ?? '';
                        const set = (v: string) => setFieldDraft((prev) => ({ ...prev, [f.fieldKey]: v }));
                        if (f.dataType === 'enum') {
                          return (
                            <Box key={f.fieldKey} sx={{ width: 210 }}>
                              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.25 }}>{f.label}</Typography>
                              <Select size="small" fullWidth displayEmpty value={value}
                                onChange={(e) => set(String(e.target.value))}>
                                <MenuItem value="">{placeholder ? `${placeholder} (item)` : '— not set —'}</MenuItem>
                                {(f.allowedValues ?? []).map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                              </Select>
                            </Box>
                          );
                        }
                        if (f.dataType === 'bool') {
                          return (
                            <Box key={f.fieldKey} sx={{ width: 210 }}>
                              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.25 }}>{f.label}</Typography>
                              <Select size="small" fullWidth displayEmpty value={value}
                                onChange={(e) => set(String(e.target.value))}>
                                <MenuItem value="">{placeholder ? `${placeholder} (item)` : '— not set —'}</MenuItem>
                                <MenuItem value="true">Yes</MenuItem>
                                <MenuItem value="false">No</MenuItem>
                              </Select>
                            </Box>
                          );
                        }
                        return (
                          <TextField
                            key={f.fieldKey}
                            size="small"
                            sx={{ width: 210 }}
                            label={f.unit ? `${f.label} (${f.unit})` : f.label}
                            type={f.dataType === 'number' ? 'number' : f.dataType === 'date' ? 'date' : 'text'}
                            InputLabelProps={f.dataType === 'date' ? { shrink: true } : undefined}
                            placeholder={placeholder ? `${placeholder} (from the item)` : ''}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                          />
                        );
                      })}
                      {visibleFields.length === 0 && (
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                          No per-piece field applies to this item's category.
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            )}
          </Box>

          <StickyActionBar
            message={`${pieces.filter((p) => Number(p.qty) > 0).length} piece(s) · ${totalQty} ${item?.unit ?? ''} total`}
          >
            <Button onClick={() => save(true)} disabled={saving}>Save and add another</Button>
            <Button variant="contained" onClick={() => save(false)} disabled={saving}>
              {saving ? 'Saving…' : 'Add to stock'}
            </Button>
          </StickyActionBar>
        </SectionCard>
      )}

      <Box sx={{ mt: 3 }}>
        <SectionCard title="Recent stock-ins" subtitle="The last 50 receipts, newest first.">
          {loadingRecent ? (
            <ListSkeleton rows={4} />
          ) : recent.length === 0 ? (
            <EmptyState title="Nothing received yet" hint="Material added here will show up in this list." />
          ) : (
            <DataTable
              rows={recent}
              columns={recentColumns}
              getRowId={(r) => r.id}
              storageKey="fab_erp_stock_in_recent"
              exportName="stock-in"
              defaultSortKey="date"
              defaultSortDir="desc"
            />
          )}
        </SectionCard>
      </Box>
    </Box>
  );
}
