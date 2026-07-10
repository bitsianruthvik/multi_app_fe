import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';

import { fabQuery, fabMutate, fabPost, fabGet } from '@apps/fab_erp/api/client';
import type { FabPlant, FabStockLocation, FabStockPolicy } from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, StatusBadge, EmptyState, ListSkeleton, useToast, EntityList, EntityRow, SortableTableHead, type SortableColumn } from '../components';
import { useSortableData } from '../hooks/useSortableData';
import FactoryRounded from '@mui/icons-material/FactoryRounded';

interface QueryResult<T> { data: T[]; total?: number }
interface PlantDraft { name: string; code: string }
const BLANK_PLANT = (): PlantDraft => ({ name: '', code: '' });
interface StockLocationDraft { name: string; code: string; description: string }
const BLANK_STOCK_LOCATION = (): StockLocationDraft => ({ name: '', code: '', description: '' });

interface StockLevelRow {
  catalogItemId: number; catalogItemName: string; catalogItemCode: string; unit: string;
  plantId: number; plantName: string; stockLocationId: number; stockLocationName: string;
  qtyAvailable: number; minQty: number;
}

// /stock/summary response shape (see multi_app_be/apps/fab_erp/routes/stock.js)
interface StockSummarySegment { value: string | number | null; qty: number }
interface StockSummaryItem {
  catalogItemId: number; name: string; code: string; unit: string | null; qty: number;
  segments?: StockSummarySegment[];
}
interface StockSummaryResponse { ok: boolean; data: { items: StockSummaryItem[] } }

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

// NOTE: "Ordered" (qtyOrdered) and "Earmarked" (qtyEarmarked) columns were
// sourced from the now-deleted fabErpStockBalance resource. "Earmarked" is
// dropped entirely per plan (confirmed dead — always hardcoded 0, no FE
// mutation existed). "Ordered" is also dropped: /stock/summary (the live
// fab_stock_pieces aggregate) has no concept of on-order qty — that data
// isn't exposed by any current endpoint, so re-adding this column is out of
// scope here (would require a new backend endpoint/field).
const STOCK_LEVEL_COLUMNS: SortableColumn<StockLevelRow>[] = [
  { key: 'catalogItemName',   label: 'Item',              sx: { ...th, minWidth: 200 } },
  { key: 'plantName',         label: 'Plant',             sx: { ...th, width: 140 } },
  { key: 'stockLocationName', label: 'Stock location',    sx: { ...th, width: 140 } },
  { key: 'qtyAvailable',      label: 'Available',         align: 'right', sx: { ...th, width: 100 } },
  { key: 'minQty',            label: 'Min qty',           align: 'right', sx: { ...th, width: 100 } },
];

function PlantDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabPlant | null; onClose: () => void; onSaved: (code?: string) => void;
}) {
  const [draft, setDraft] = useState<PlantDraft>(BLANK_PLANT());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? { name: initial.name, code: initial.code } : BLANK_PLANT());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof PlantDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      if (isNew) {
        let generatedCode: string;
        try {
          const res = await fabPost<{ code: string }>('codegen/next-code', { entityType: 'plant', context: {} });
          generatedCode = res.code;
        } catch {
          setErr('Failed to generate plant code. Please try again.');
          setSaving(false);
          return;
        }
        await fabMutate('fabErpPlant', 'insert', { name: draft.name, code: generatedCode });
        onSaved(generatedCode);
      } else {
        await fabMutate('fabErpPlant', 'update', { id: initial!.id, name: draft.name, code: draft.code });
        onSaved();
      }
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New plant' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          {!isNew && (
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField label="Code" value={draft.code} size="small" fullWidth
                slotProps={{ input: { readOnly: true } }} />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: isNew ? 12 : 7 }}>
            <TextField label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} size="small" fullWidth required />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StockLocationDialog({ open, initial, plantId, onClose, onSaved }: {
  open: boolean; initial: FabStockLocation | null; plantId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<StockLocationDraft>(BLANK_STOCK_LOCATION());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? { name: initial.name, code: initial.code, description: initial.description ?? '' } : BLANK_STOCK_LOCATION());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof StockLocationDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      const payload = { name: draft.name, code: draft.code, description: draft.description || null };
      if (isNew) await fabMutate('fabErpStockLocation', 'insert', { plant_id: plantId, ...payload });
      else await fabMutate('fabErpStockLocation', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New stock location' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 5 }}><TextField label="Code" value={draft.code} onChange={(e) => set('code', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs: 12, sm: 7 }}><TextField label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} size="small" fullWidth required /></Grid>
          <Grid size={{ xs: 12 }}><TextField label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} size="small" fullWidth multiline minRows={2} /></Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name || !draft.code}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, label, onClose, onConfirm }: { open: boolean; label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Confirm delete</DialogTitle>
      <DialogContent><Typography>Delete <strong>{label}</strong>? This action cannot be undone.</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Plants() {
  const canManage = usePermission('fab_erp_resources_manage');
  const canManageStockLocations = usePermission('fab_erp_stock_location_manage');
  const canViewInventory = usePermission('fab_erp_inventory_view');
  const { toast } = useToast();

  const [tab, setTab] = useState(0);
  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [plantDialog, setPlantDialog] = useState<{ open: boolean; item: FabPlant | null }>({ open: false, item: null });
  const [plantDelete, setPlantDelete] = useState<FabPlant | null>(null);
  const [plantDeleting, setPlantDeleting] = useState(false);

  const [slPlantId, setSlPlantId] = useState<number | null>(null);
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);
  const [slLoading, setSlLoading] = useState(false);
  const [slDialog, setSlDialog] = useState<{ open: boolean; item: FabStockLocation | null }>({ open: false, item: null });
  const [slDelete, setSlDelete] = useState<FabStockLocation | null>(null);
  const [slDeleting, setSlDeleting] = useState(false);

  const [stockLocationsAll, setStockLocationsAll] = useState<FabStockLocation[]>([]);
  const [slvPlantId, setSlvPlantId] = useState<number | null>(null);
  const [slvStockLocationId, setSlvStockLocationId] = useState<number | null>(null);
  const [stockLevels, setStockLevels] = useState<StockLevelRow[]>([]);
  const [stockLevelsLoading, setStockLevelsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<QueryResult<FabPlant>>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } });
      setPlants(res.data ?? []);
    } catch (e) { setError((e as Error).message ?? 'Failed to load data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { if (slPlantId === null && plants.length > 0) setSlPlantId(plants[0].id); }, [plants, slPlantId]);

  function onSaved(code?: string) { fetchAll(); setPlantDialog({ open: false, item: null }); toast(code ? `Plant created — code: ${code}` : 'Plant saved'); }

  async function handleDeletePlant() {
    if (!plantDelete) return;
    setPlantDeleting(true); setError('');
    try { await fabMutate('fabErpPlant', 'delete', { id: plantDelete.id }); setPlantDelete(null); fetchAll(); toast('Plant deleted'); }
    catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Delete failed'); setPlantDelete(null);
    } finally { setPlantDeleting(false); }
  }

  const loadStockLocations = useCallback(async (plantId: number | null) => {
    if (plantId == null) { setStockLocations([]); return; }
    setSlLoading(true);
    try {
      const res = await fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { filters: { plantId }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } });
      setStockLocations(res.data ?? []);
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load data');
    } finally { setSlLoading(false); }
  }, []);

  useEffect(() => { loadStockLocations(slPlantId); }, [slPlantId, loadStockLocations]);

  function onStockLocationSaved() { setSlDialog({ open: false, item: null }); loadStockLocations(slPlantId); toast('Stock location saved'); }

  async function handleDeleteStockLocation() {
    if (!slDelete) return;
    setSlDeleting(true); setError('');
    try { await fabMutate('fabErpStockLocation', 'delete', { id: slDelete.id }); setSlDelete(null); loadStockLocations(slPlantId); toast('Stock location deleted'); }
    catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Delete failed'); setSlDelete(null);
    } finally { setSlDeleting(false); }
  }

  useEffect(() => {
    if (!canViewInventory || tab !== 2) return;
    fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', { filters: slvPlantId != null ? { plantId: slvPlantId } : {}, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } })
      .then((res) => setStockLocationsAll(res.data ?? []))
      .catch(() => setStockLocationsAll([]));
  }, [canViewInventory, tab, slvPlantId]);

  useEffect(() => {
    if (slvStockLocationId == null) return;
    if (!stockLocationsAll.some((l) => l.id === slvStockLocationId)) setSlvStockLocationId(null);
  }, [stockLocationsAll, slvStockLocationId]);

  const { sortedRows: sortedStockLevels, sortKey, sortDirection, requestSort } = useSortableData(stockLevels, 'catalogItemName');

  useEffect(() => {
    if (!canViewInventory || tab !== 2) return;

    // On-hand qty now comes live from fab_stock_pieces via /stock/summary
    // (fabErpItemBatch / fabErpStockBalance were dropped along with
    // fab_item_batches / fab_stock_balances). groupBy=stockLocationId gives
    // per-location segments so this grid keeps its item x location grain.
    const summaryParams: Record<string, unknown> = { groupBy: 'stockLocationId' };
    if (slvPlantId != null) summaryParams.plantId = slvPlantId;
    if (slvStockLocationId != null) summaryParams.stockLocationId = slvStockLocationId;

    const policyFilters: Record<string, number> = {};
    if (slvPlantId != null) policyFilters.plantId = slvPlantId;
    if (slvStockLocationId != null) policyFilters.stockLocationId = slvStockLocationId;

    setStockLevelsLoading(true); setError('');

    Promise.all([
      fabGet<StockSummaryResponse>('stock/summary', summaryParams),
      fabQuery<QueryResult<FabStockPolicy>>('fabErpStockPolicy', { filters: policyFilters, pagination: { limit: 1000 } }),
    ]).then(([summaryRes, policiesRes]) => {
      const locationById = new Map(stockLocationsAll.map((l) => [l.id, l]));
      const rows = new Map<string, StockLevelRow>();
      const keyOf = (catalogItemId: number, stockLocationId: number) => `${catalogItemId}-${stockLocationId}`;
      const getRow = (catalogItemId: number, stockLocationId: number, catalogItemName?: string, catalogItemCode?: string, unit?: string): StockLevelRow => {
        const key = keyOf(catalogItemId, stockLocationId);
        let row = rows.get(key);
        if (!row) {
          const loc = locationById.get(stockLocationId);
          row = {
            catalogItemId, catalogItemName: catalogItemName ?? '', catalogItemCode: catalogItemCode ?? '', unit: unit ?? '',
            plantId: loc?.plantId ?? 0, plantName: loc?.plantName ?? '', stockLocationId, stockLocationName: loc?.name ?? '',
            qtyAvailable: 0, minQty: 0,
          };
          rows.set(key, row);
        } else {
          if (!row.catalogItemName && catalogItemName) row.catalogItemName = catalogItemName;
          if (!row.catalogItemCode && catalogItemCode) row.catalogItemCode = catalogItemCode;
          if (!row.unit && unit) row.unit = unit;
        }
        return row;
      };

      for (const item of summaryRes.data?.items ?? []) {
        for (const seg of item.segments ?? []) {
          const stockLocationId = Number(seg.value);
          if (!Number.isFinite(stockLocationId)) continue; // pieces with no stock_location_id
          const row = getRow(item.catalogItemId, stockLocationId, item.name, item.code, item.unit ?? undefined);
          row.qtyAvailable += Number(seg.qty) || 0;
        }
      }
      for (const sp of policiesRes.data ?? []) {
        const row = getRow(sp.catalogItemId, sp.stockLocationId, sp.catalogItemName);
        row.minQty = Number(sp.minQty) || 0;
      }
      setStockLevels(Array.from(rows.values()));
    }).catch((e) => {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load data');
      setStockLevels([]);
    }).finally(() => setStockLevelsLoading(false));
  }, [canViewInventory, tab, slvPlantId, slvStockLocationId, stockLocationsAll]);

  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      <PageHeader title="Plants" subtitle="Manufacturing plants / sites — stock locations and stock levels" />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Mono chip>{plants.length} plants</Mono>
      </Stack>

      <Box sx={{ borderBottom: '1px solid var(--c-divider)', mb: 2.5 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Plants" />
          <Tab label="Stock Locations" />
          {canViewInventory && <Tab label="Stock Levels" />}
        </Tabs>
      </Box>

      {loading ? <ListSkeleton rows={5} /> : (
        <>
          {tab === 0 && (
            <>
              {canManage && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPlantDialog({ open: true, item: null })}>New plant</Button>
                </Box>
              )}
              {plants.length === 0 ? (
                <EmptyState icon={<FactoryRounded />} title="No plants defined" />
              ) : (
                <EntityList>
                  {plants.map((p) => (
                    <EntityRow
                      key={p.id}
                      code={<Mono chip>{p.code}</Mono>}
                      primary={p.name}
                      onClick={() => { setSlPlantId(p.id); setTab(1); }}
                      actions={canManage ? (<>
                        <Tooltip title="Edit"><IconButton size="small" onClick={() => setPlantDialog({ open: true, item: p })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setPlantDelete(p)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                      </>) : undefined}
                    />
                  ))}
                </EntityList>
              )}
            </>
          )}

          {tab === 1 && (
            plants.length === 0 ? (
              <EmptyState title="No plants configured" hint="Add a plant first." />
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
                  <TextField select label="Plant" value={slPlantId ?? ''} onChange={(e) => setSlPlantId(e.target.value === '' ? null : Number(e.target.value))} size="small" sx={{ minWidth: 240 }}>
                    {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>)}
                  </TextField>
                  {canManageStockLocations && (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSlDialog({ open: true, item: null })}>New stock location</Button>
                  )}
                </Box>

                {slLoading ? <ListSkeleton rows={3} /> : stockLocations.length === 0 ? (
                  <EmptyState title="No stock locations for this plant" />
                ) : (
                  <EntityList>
                    {stockLocations.map((sl) => (
                      <EntityRow
                        key={sl.id}
                        code={<Mono chip>{sl.code}</Mono>}
                        primary={sl.name}
                        secondary={sl.description ?? undefined}
                        onClick={() => { setSlvPlantId(slPlantId); setSlvStockLocationId(sl.id); setTab(2); }}
                        actions={canManageStockLocations ? (<>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setSlDialog({ open: true, item: sl })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setSlDelete(sl)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                        </>) : undefined}
                      />
                    ))}
                  </EntityList>
                )}
              </>
            )
          )}

          {canViewInventory && tab === 2 && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <TextField select label="Plant" value={slvPlantId ?? ''} onChange={(e) => setSlvPlantId(e.target.value === '' ? null : Number(e.target.value))} size="small" sx={{ minWidth: 200 }}>
                  <MenuItem value="">All</MenuItem>
                  {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>)}
                </TextField>
                <TextField select label="Stock location" value={slvStockLocationId ?? ''} onChange={(e) => setSlvStockLocationId(e.target.value === '' ? null : Number(e.target.value))} size="small" sx={{ minWidth: 200 }}>
                  <MenuItem value="">All</MenuItem>
                  {stockLocationsAll.map((sl) => <MenuItem key={sl.id} value={sl.id}>{sl.name}</MenuItem>)}
                </TextField>
              </Box>

              {stockLevelsLoading ? <ListSkeleton rows={4} /> : stockLevels.length === 0 ? (
                <EmptyState title="No stock data for the selected filters" />
              ) : (
                <Surface e={1} sx={{ overflow: 'hidden' }}>
                  <Table size="small">
                    <SortableTableHead<StockLevelRow>
                      columns={STOCK_LEVEL_COLUMNS}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onRequestSort={requestSort}
                    />
                    <TableBody>
                      {sortedStockLevels.map((row) => {
                        const belowMin = row.minQty > 0 && row.qtyAvailable < row.minQty;
                        return (
                          <TableRow key={`${row.catalogItemId}-${row.plantId}-${row.stockLocationId}`} hover>
                            <TableCell sx={td}>{row.catalogItemName}{row.catalogItemCode && <Mono chip sx={{ ml: 1 }}>{row.catalogItemCode}</Mono>}</TableCell>
                            <TableCell sx={td}>{row.plantName}</TableCell>
                            <TableCell sx={td}>{row.stockLocationName}</TableCell>
                            <TableCell sx={td} align="right">
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                                <Mono tabular>{row.qtyAvailable}{row.unit ? ` ${row.unit}` : ''}</Mono>
                                {belowMin && <StatusBadge status="Below min" family="warning" />}
                              </Stack>
                            </TableCell>
                            <TableCell sx={td} align="right"><Mono tabular>{row.minQty}</Mono></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Surface>
              )}
            </>
          )}
        </>
      )}

      <PlantDialog open={plantDialog.open} initial={plantDialog.item} onClose={() => setPlantDialog({ open: false, item: null })} onSaved={onSaved} />
      <StockLocationDialog open={slDialog.open} initial={slDialog.item} plantId={slPlantId} onClose={() => setSlDialog({ open: false, item: null })} onSaved={onStockLocationSaved} />
      <DeleteDialog open={!!plantDelete} label={plantDelete ? `${plantDelete.code} — ${plantDelete.name}` : ''} onClose={() => setPlantDelete(null)} onConfirm={handleDeletePlant} />
      {plantDeleting && <CircularProgress size={20} sx={{ position: 'fixed', bottom: 24, right: 24 }} />}
      <DeleteDialog open={!!slDelete} label={slDelete ? `${slDelete.code} — ${slDelete.name}` : ''} onClose={() => setSlDelete(null)} onConfirm={handleDeleteStockLocation} />
      {slDeleting && <CircularProgress size={20} sx={{ position: 'fixed', bottom: 24, right: 24 }} />}
    </Box>
  );
}
