import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon   from '@mui/icons-material/Edit';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type {
  FabPlant,
  FabStockLocation,
  FabItemBatch,
  FabStockBalance,
  FabStockPolicy,
} from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';

interface QueryResult<T> {
  data: T[];
  total?: number;
}

interface PlantDraft { name: string; code: string }
const BLANK_PLANT = (): PlantDraft => ({ name: '', code: '' });

interface StockLocationDraft { name: string; code: string; description: string }
const BLANK_STOCK_LOCATION = (): StockLocationDraft => ({ name: '', code: '', description: '' });

// ── Stock Levels row shape (merged from item batches, balances, policies) ─────
interface StockLevelRow {
  catalogItemId: number;
  catalogItemName: string;
  catalogItemCode: string;
  unit: string;
  plantId: number;
  plantName: string;
  stockLocationId: number;
  stockLocationName: string;
  qtyAvailable: number;
  qtyOrdered: number;
  qtyEarmarked: number;
  minQty: number;
}

// ── Plant Dialog ─────────────────────────────────────────────────────────────
function PlantDialog({
  open, initial, onClose, onSaved,
}: {
  open: boolean; initial: FabPlant | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft,  setDraft]  = useState<PlantDraft>(BLANK_PLANT());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
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
        await fabMutate('fabErpPlant', 'insert', { name: draft.name, code: draft.code });
      } else {
        await fabMutate('fabErpPlant', 'update', { id: initial!.id, name: draft.name, code: draft.code });
      }
      onSaved();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Plant' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField label="Code" value={draft.code} onChange={(e) => set('code', e.target.value)} size="small" fullWidth required />
          </Grid>
          <Grid size={{ xs: 12, sm: 7 }}>
            <TextField label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} size="small" fullWidth required />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name || !draft.code}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Stock Location Dialog ─────────────────────────────────────────────────────
function StockLocationDialog({
  open, initial, plantId, onClose, onSaved,
}: {
  open: boolean; initial: FabStockLocation | null; plantId: number | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [draft,  setDraft]  = useState<StockLocationDraft>(BLANK_STOCK_LOCATION());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    setDraft(initial
      ? { name: initial.name, code: initial.code, description: initial.description ?? '' }
      : BLANK_STOCK_LOCATION());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof StockLocationDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      if (isNew) {
        await fabMutate('fabErpStockLocation', 'insert', {
          plant_id:    plantId,
          name:        draft.name,
          code:        draft.code,
          description: draft.description || null,
        });
      } else {
        await fabMutate('fabErpStockLocation', 'update', {
          id:          initial!.id,
          name:        draft.name,
          code:        draft.code,
          description: draft.description || null,
        });
      }
      onSaved();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(err.response?.data?.error ?? err.message ?? 'Unknown error');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Stock Location' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField label="Code" value={draft.code} onChange={(e) => set('code', e.target.value)} size="small" fullWidth required />
          </Grid>
          <Grid size={{ xs: 12, sm: 7 }}>
            <TextField label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} size="small" fullWidth required />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Description"
              value={draft.description}
              onChange={(e) => set('description', e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name || !draft.code}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Delete Confirm Dialog ──────────────────────────────────────────────────────
function DeleteDialog({
  open, label, onClose, onConfirm,
}: {
  open: boolean; label: string; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogContent>
        <Typography>Delete <strong>{label}</strong>? This action cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Plants() {
  const canManage = usePermission('fab_erp_resources_manage');
  const canManageStockLocations = usePermission('fab_erp_stock_location_manage');
  const canViewInventory = usePermission('fab_erp_inventory_view');

  const [tab, setTab] = useState(0);

  const [plants,  setPlants]  = useState<FabPlant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [plantDialog, setPlantDialog] = useState<{ open: boolean; item: FabPlant | null }>({ open: false, item: null });
  const [plantDelete, setPlantDelete] = useState<FabPlant | null>(null);
  const [plantDeleting, setPlantDeleting] = useState(false);

  // ── Stock Locations tab state ──────────────────────────────────────────────
  const [slPlantId, setSlPlantId] = useState<number | null>(null);
  const [stockLocations, setStockLocations] = useState<FabStockLocation[]>([]);
  const [slLoading, setSlLoading] = useState(false);
  const [slDialog, setSlDialog] = useState<{ open: boolean; item: FabStockLocation | null }>({ open: false, item: null });
  const [slDelete, setSlDelete] = useState<FabStockLocation | null>(null);
  const [slDeleting, setSlDeleting] = useState(false);

  // ── Stock Levels tab state ─────────────────────────────────────────────────
  const [stockLocationsAll, setStockLocationsAll] = useState<FabStockLocation[]>([]);
  const [slvPlantId, setSlvPlantId] = useState<number | null>(null);
  const [slvStockLocationId, setSlvStockLocationId] = useState<number | null>(null);
  const [stockLevels, setStockLevels] = useState<StockLevelRow[]>([]);
  const [stockLevelsLoading, setStockLevelsLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<QueryResult<FabPlant>>('fabErpPlant', {
        orderBy:    [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setPlants(res.data ?? []);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Default the Stock Locations plant selector to the first plant once plants load
  useEffect(() => {
    if (slPlantId === null && plants.length > 0) {
      setSlPlantId(plants[0].id);
    }
  }, [plants, slPlantId]);

  function onSaved() {
    fetchAll();
    setPlantDialog({ open: false, item: null });
  }

  async function handleDeletePlant() {
    if (!plantDelete) return;
    setPlantDeleting(true); setError('');
    try {
      await fabMutate('fabErpPlant', 'delete', { id: plantDelete.id });
      setPlantDelete(null);
      fetchAll();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Delete failed');
      setPlantDelete(null);
    } finally { setPlantDeleting(false); }
  }

  // ── Stock Locations: load for selected plant ─────────────────────────────
  const loadStockLocations = useCallback(async (plantId: number | null) => {
    if (plantId == null) { setStockLocations([]); return; }
    setSlLoading(true);
    try {
      const res = await fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', {
        filters:    { plantId },
        orderBy:    [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setStockLocations(res.data ?? []);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load data');
    } finally {
      setSlLoading(false);
    }
  }, []);

  useEffect(() => { loadStockLocations(slPlantId); }, [slPlantId, loadStockLocations]);

  function onStockLocationSaved() {
    setSlDialog({ open: false, item: null });
    loadStockLocations(slPlantId);
  }

  async function handleDeleteStockLocation() {
    if (!slDelete) return;
    setSlDeleting(true); setError('');
    try {
      await fabMutate('fabErpStockLocation', 'delete', { id: slDelete.id });
      setSlDelete(null);
      loadStockLocations(slPlantId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Delete failed');
      setSlDelete(null);
    } finally { setSlDeleting(false); }
  }

  // ── Stock Levels: load stock locations for filter dropdown ────────────────
  useEffect(() => {
    if (!canViewInventory || tab !== 2) return;
    fabQuery<QueryResult<FabStockLocation>>('fabErpStockLocation', {
      filters:    slvPlantId != null ? { plantId: slvPlantId } : {},
      orderBy:    [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 500 },
    }).then((res) => setStockLocationsAll(res.data ?? []))
      .catch(() => setStockLocationsAll([]));
  }, [canViewInventory, tab, slvPlantId]);

  // Reset stock-location filter if it no longer belongs to the selected plant
  useEffect(() => {
    if (slvStockLocationId == null) return;
    if (!stockLocationsAll.some((l) => l.id === slvStockLocationId)) {
      setSlvStockLocationId(null);
    }
  }, [stockLocationsAll, slvStockLocationId]);

  // ── Stock Levels: fetch batches/balances/policies and merge ───────────────
  useEffect(() => {
    if (!canViewInventory || tab !== 2) return;

    const filters: Record<string, number> = {};
    if (slvPlantId != null) filters.plantId = slvPlantId;
    if (slvStockLocationId != null) filters.stockLocationId = slvStockLocationId;

    setStockLevelsLoading(true);
    setError('');

    Promise.all([
      fabQuery<QueryResult<FabItemBatch>>('fabErpItemBatch', {
        filters,
        pagination: { limit: 1000 },
      }),
      fabQuery<QueryResult<FabStockBalance>>('fabErpStockBalance', {
        filters,
        pagination: { limit: 1000 },
      }),
      fabQuery<QueryResult<FabStockPolicy>>('fabErpStockPolicy', {
        filters,
        pagination: { limit: 1000 },
      }),
    ]).then(([batchesRes, balancesRes, policiesRes]) => {
      const rows = new Map<string, StockLevelRow>();

      const keyOf = (catalogItemId: number, plantId: number, stockLocationId: number) =>
        `${catalogItemId}-${plantId}-${stockLocationId}`;

      const getRow = (
        catalogItemId: number, plantId: number, stockLocationId: number,
        catalogItemName?: string, catalogItemCode?: string, unit?: string,
        plantName?: string, stockLocationName?: string,
      ): StockLevelRow => {
        const key = keyOf(catalogItemId, plantId, stockLocationId);
        let row = rows.get(key);
        if (!row) {
          row = {
            catalogItemId,
            catalogItemName:   catalogItemName ?? '',
            catalogItemCode:   catalogItemCode ?? '',
            unit:              unit ?? '',
            plantId,
            plantName:         plantName ?? '',
            stockLocationId,
            stockLocationName: stockLocationName ?? '',
            qtyAvailable: 0,
            qtyOrdered:   0,
            qtyEarmarked: 0,
            minQty:       0,
          };
          rows.set(key, row);
        } else {
          if (!row.catalogItemName && catalogItemName) row.catalogItemName = catalogItemName;
          if (!row.catalogItemCode && catalogItemCode) row.catalogItemCode = catalogItemCode;
          if (!row.unit && unit) row.unit = unit;
          if (!row.plantName && plantName) row.plantName = plantName;
          if (!row.stockLocationName && stockLocationName) row.stockLocationName = stockLocationName;
        }
        return row;
      };

      for (const b of batchesRes.data ?? []) {
        const row = getRow(
          b.catalogItemId, b.plantId, b.stockLocationId,
          b.catalogItemName, b.catalogItemCode, b.unit, b.plantName, b.stockLocationName,
        );
        row.qtyAvailable += Number(b.qtyOnHand) || 0;
      }

      for (const sb of balancesRes.data ?? []) {
        const row = getRow(
          sb.catalogItemId, sb.plantId, sb.stockLocationId,
          sb.catalogItemName, sb.catalogItemCode, sb.unit, sb.plantName, sb.stockLocationName,
        );
        row.qtyOrdered = Number(sb.qtyOrdered) || 0;
        row.qtyEarmarked = Number(sb.qtyEarmarked) || 0;
      }

      for (const sp of policiesRes.data ?? []) {
        const row = getRow(
          sp.catalogItemId, sp.plantId, sp.stockLocationId,
          sp.catalogItemName, undefined, undefined, sp.plantName, sp.stockLocationName,
        );
        row.minQty = Number(sp.minQty) || 0;
      }

      setStockLevels(Array.from(rows.values()));
    }).catch((e: unknown) => {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err.response?.data?.error ?? err.message ?? 'Failed to load data');
      setStockLevels([]);
    }).finally(() => setStockLevelsLoading(false));
  }, [canViewInventory, tab, slvPlantId, slvStockLocationId]);

  return (
    <Box sx={{ p: 3, maxWidth: 1300, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Plants</Typography>
        <Typography variant="body2" color="text.secondary">
          Manufacturing plants / sites — stock locations and stock levels
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Chip label={`${plants.length} Plants`} variant="outlined" />
      </Stack>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Plants" />
          <Tab label="Stock Locations" />
          {canViewInventory && <Tab label="Stock Levels" />}
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* ── Plants Tab ───────────────────────────────────────────────── */}
          {tab === 0 && (
            <>
              {canManage && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setPlantDialog({ open: true, item: null })}
                  >
                    New Plant
                  </Button>
                </Box>
              )}

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    {canManage && <TableCell sx={{ fontWeight: 700, width: 96 }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {plants.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 3 : 2} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No plants defined.
                      </TableCell>
                    </TableRow>
                  ) : plants.map((p) => (
                    <TableRow
                      key={p.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => { setSlPlantId(p.id); setTab(1); }}
                    >
                      <TableCell>
                        <Chip label={p.code} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{p.name}</TableCell>
                      {canManage && (
                        <TableCell>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setPlantDialog({ open: true, item: p }); }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setPlantDelete(p); }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}

          {/* ── Stock Locations Tab ─────────────────────────────────────── */}
          {tab === 1 && (
            <>
              {plants.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No plants configured. Add a plant first.
                </Typography>
              ) : (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
                    <TextField
                      select
                      label="Plant"
                      value={slPlantId ?? ''}
                      onChange={(e) => setSlPlantId(e.target.value === '' ? null : Number(e.target.value))}
                      size="small"
                      sx={{ minWidth: 240 }}
                    >
                      {plants.map((p) => (
                        <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>
                      ))}
                    </TextField>

                    {canManageStockLocations && (
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setSlDialog({ open: true, item: null })}
                      >
                        New Stock Location
                      </Button>
                    )}
                  </Box>

                  {slLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                          {canManageStockLocations && <TableCell sx={{ fontWeight: 700, width: 96 }}>Actions</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {stockLocations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={canManageStockLocations ? 4 : 3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                              No stock locations for this plant.
                            </TableCell>
                          </TableRow>
                        ) : stockLocations.map((sl) => (
                          <TableRow
                            key={sl.id}
                            hover
                            sx={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSlvPlantId(slPlantId);
                              setSlvStockLocationId(sl.id);
                              setTab(2);
                            }}
                          >
                            <TableCell>{sl.name}</TableCell>
                            <TableCell>
                              <Chip label={sl.code} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              {sl.description ?? <Typography variant="body2" color="text.disabled">—</Typography>}
                            </TableCell>
                            {canManageStockLocations && (
                              <TableCell>
                                <Tooltip title="Edit">
                                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); setSlDialog({ open: true, item: sl }); }}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setSlDelete(sl); }}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Stock Levels Tab ────────────────────────────────────────── */}
          {canViewInventory && tab === 2 && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                  select
                  label="Plant"
                  value={slvPlantId ?? ''}
                  onChange={(e) => setSlvPlantId(e.target.value === '' ? null : Number(e.target.value))}
                  size="small"
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">All</MenuItem>
                  {plants.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.code} — {p.name}</MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  label="Stock Location"
                  value={slvStockLocationId ?? ''}
                  onChange={(e) => setSlvStockLocationId(e.target.value === '' ? null : Number(e.target.value))}
                  size="small"
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">All</MenuItem>
                  {stockLocationsAll.map((sl) => (
                    <MenuItem key={sl.id} value={sl.id}>{sl.name}</MenuItem>
                  ))}
                </TextField>
              </Box>

              {stockLevelsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Plant</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Stock Location</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Available</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Ordered</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Earmarked</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Min Qty</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stockLevels.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No stock data for the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : stockLevels.map((row) => {
                      const belowMin = row.minQty > 0 && row.qtyAvailable < row.minQty;
                      return (
                        <TableRow key={`${row.catalogItemId}-${row.plantId}-${row.stockLocationId}`} hover>
                          <TableCell>
                            {row.catalogItemName}
                            {row.catalogItemCode && (
                              <Chip label={row.catalogItemCode} size="small" variant="outlined" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                          <TableCell>{row.plantName}</TableCell>
                          <TableCell>{row.stockLocationName}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <span>{row.qtyAvailable}{row.unit ? ` ${row.unit}` : ''}</span>
                              {belowMin && <Chip label="Below Min" color="warning" size="small" />}
                            </Stack>
                          </TableCell>
                          <TableCell>{row.qtyOrdered}</TableCell>
                          <TableCell>{row.qtyEarmarked}</TableCell>
                          <TableCell>{row.minQty}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </>
      )}

      <PlantDialog
        open={plantDialog.open}
        initial={plantDialog.item}
        onClose={() => setPlantDialog({ open: false, item: null })}
        onSaved={onSaved}
      />

      <StockLocationDialog
        open={slDialog.open}
        initial={slDialog.item}
        plantId={slPlantId}
        onClose={() => setSlDialog({ open: false, item: null })}
        onSaved={onStockLocationSaved}
      />

      <DeleteDialog
        open={!!plantDelete}
        label={plantDelete ? `${plantDelete.code} — ${plantDelete.name}` : ''}
        onClose={() => setPlantDelete(null)}
        onConfirm={handleDeletePlant}
      />
      {plantDeleting && <CircularProgress size={20} sx={{ position: 'fixed', bottom: 24, right: 24 }} />}

      <DeleteDialog
        open={!!slDelete}
        label={slDelete ? `${slDelete.code} — ${slDelete.name}` : ''}
        onClose={() => setSlDelete(null)}
        onConfirm={handleDeleteStockLocation}
      />
      {slDeleting && <CircularProgress size={20} sx={{ position: 'fixed', bottom: 24, right: 24 }} />}
    </Box>
  );
}
