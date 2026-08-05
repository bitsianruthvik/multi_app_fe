/**
 * StockIn.tsx — add raw material straight into a stock area.
 *
 * Replaces GrnEntry (761 LOC) and GrnDetail. There is no purchase order, no
 * supplier and no delivery document to group under, so this is a single form
 * for one item rather than a header with line items.
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
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Collapse, IconButton, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import { fabQuery, fabPost } from '../api/client';
import {
  PageHeader, SectionCard, StickyActionBar, DataTable, Mono, QtyCell, DateCell,
  EmptyState, ListSkeleton, useToast, backendMessage, type DataColumn,
} from '../components';

interface QueryResult<T> { data: T[]; total?: number }

interface CatalogOption { id: number; name: string; code: string | null; unit: string | null }
interface PlantRow { id: number; name: string; code: string | null }
interface LocationRow { id: number; name: string; code: string | null; plantId: number | null }

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
}

const blankPiece = (key: number): PieceDraft => ({
  key, qty: '', batchNo: '', heatNo: '', serialNo: '', markNo: '',
});

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function StockIn() {
  const { company } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const hasManage = usePermission('fab_erp_inventory_manage');
  const canManage = isAdminRole(user?.role) || hasManage;

  // ── reference data ─────────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

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
        // ?itemId= from the Stock screen's "Add stock" action.
        const wanted = Number(search.get('itemId'));
        if (Number.isInteger(wanted)) {
          const hit = (cat.data ?? []).find((c) => c.id === wanted);
          if (hit) setItem(hit);
        }
      } finally {
        if (!cancelled) setLoadingRefs(false);
      }
    })();
    void loadRecent();
    return () => { cancelled = true; };
  }, [search, loadRecent]);

  const plantLocations = useMemo(
    () => locations.filter((l) => plantId === '' || l.plantId === plantId),
    [locations, plantId],
  );

  // Changing plant invalidates a location chosen under the old one.
  useEffect(() => {
    if (locationId !== '' && !plantLocations.some((l) => l.id === locationId)) setLocationId('');
    if (locationId === '' && plantLocations.length === 1) setLocationId(plantLocations[0].id);
  }, [plantLocations, locationId]);

  const totalQty = useMemo(
    () => pieces.reduce((s, p) => s + (Number(p.qty) > 0 ? Number(p.qty) : 0), 0),
    [pieces],
  );

  const setPiece = (key: number, patch: Partial<PieceDraft>) =>
    setPieces((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const addPiece = () =>
    setPieces((prev) => [...prev, blankPiece(Math.max(0, ...prev.map((p) => p.key)) + 1)]);

  const removePiece = (key: number) =>
    setPieces((prev) => (prev.length === 1 ? prev : prev.filter((p) => p.key !== key)));

  /** quantity × count — the common case for identical plate off one delivery. */
  const applySplit = () => {
    const q = Number(splitQty);
    const n = Number(splitCount);
    if (!(q > 0) || !Number.isInteger(n) || n < 1 || n > 200) {
      setErr('Split needs a quantity above zero and a count between 1 and 200.');
      return;
    }
    setPieces(Array.from({ length: n }, (_, i) => ({ ...blankPiece(i + 1), qty: String(q) })));
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
    return null;
  }

  async function save(addAnother: boolean) {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setSaving(true); setErr('');
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
          pieces: pieces
            .filter((p) => Number(p.qty) > 0)
            .map((p) => ({
              qty: Number(p.qty),
              batchNo: p.batchNo.trim() || null,
              heatNo: p.heatNo.trim() || null,
              serialNo: p.serialNo.trim() || null,
              markNo: p.markNo.trim() || null,
            })),
        },
      );

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
      if (addAnother) {
        // Keep the context (plant, area, date); clear what changes per receipt.
        setItem(null);
        setPieces([blankPiece(1)]);
        setUnitCost('');
        setNotes('');
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
        subtitle="Add raw material straight into a stock area. Tasks waiting on it become eligible as soon as it lands."
      />

      {!canManage && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can see what has been received, but adding stock needs the inventory permission.
        </Alert>
      )}

      {canManage && (
        <SectionCard title="Receive material">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 860 }}>
            {err && <Alert severity="error" onClose={() => setErr('')}>{err}</Alert>}

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
                helperText={plantId === '' ? 'Pick a plant first' : ' '}
              >
                {plantLocations.map((l) => <MenuItem key={l.id} value={l.id}>{l.code ? `${l.code} — ${l.name}` : l.name}</MenuItem>)}
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
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5, p: 1.5, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }}>
                  <TextField label="Qty each" type="number" size="small" sx={{ width: 130 }}
                    value={splitQty} onChange={(e) => setSplitQty(e.target.value)} />
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>×</Typography>
                  <TextField label="Pieces" type="number" size="small" sx={{ width: 110 }}
                    value={splitCount} onChange={(e) => setSplitCount(e.target.value)} />
                  <Button size="small" variant="outlined" onClick={applySplit}>Apply</Button>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                    Replaces the list below — add heat numbers per piece afterwards.
                  </Typography>
                </Box>
              </Collapse>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pieces.map((p) => (
                  <Box key={p.key} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField label="Qty *" type="number" size="small" sx={{ width: 110 }}
                      value={p.qty} onChange={(e) => setPiece(p.key, { qty: e.target.value })} />
                    <TextField label="Batch no." size="small" sx={{ width: 150 }}
                      value={p.batchNo} onChange={(e) => setPiece(p.key, { batchNo: e.target.value })} />
                    <TextField label="Heat no." size="small" sx={{ width: 150 }}
                      value={p.heatNo} onChange={(e) => setPiece(p.key, { heatNo: e.target.value })} />
                    <TextField label="Serial no." size="small" sx={{ width: 140 }}
                      value={p.serialNo} onChange={(e) => setPiece(p.key, { serialNo: e.target.value })} />
                    <TextField label="Mark no." size="small" sx={{ width: 130 }}
                      value={p.markNo} onChange={(e) => setPiece(p.key, { markNo: e.target.value })} />
                    <IconButton size="small" color="error" disabled={pieces.length === 1}
                      onClick={() => removePiece(p.key)} aria-label={`Remove piece ${p.key}`}>
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            </Box>
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
