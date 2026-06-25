/**
 * ItemBatches — read-only view of batch/lot stock for a catalog item,
 * filterable by plant and stock location, with drill-down into the
 * stock ledger (receipts/issues) for each batch.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import Inventory2Icon   from '@mui/icons-material/Inventory2';

import { fabQuery }      from '../api/client';
import type {
  FabItemBatch,
  FabItemCatalog,
  FabPlant,
  FabStockLedger,
  FabStockLocation,
} from '../types';
import { usePermission } from '@core/hooks/usePermission';

interface ItemOption { id: number; name: string; code: string; }

function ReceiptsDialog({ batch, company, onClose }: {
  batch:   FabItemBatch | null;
  company: string | undefined;
  onClose: () => void;
}) {
  const [rows,    setRows]    = useState<FabStockLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (!batch) return;
    setLoading(true); setError('');
    fabQuery<{ data: FabStockLedger[] }>('fabErpStockLedger', {
      filters: { batchId: batch.id },
      orderBy: [{ field: 'txnDate', direction: 'desc' }],
    })
      .then((res) => setRows(res.data ?? []))
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }, [batch]);

  return (
    <Dialog open={!!batch} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Receipts — {batch?.batchCode}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>No ledger entries found.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Txn Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Qty</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Unit Cost</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Supplier</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>GRN</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.txnDate}</TableCell>
                  <TableCell>{r.qty}</TableCell>
                  <TableCell>{r.unitCost ?? '—'}</TableCell>
                  <TableCell>{r.supplierName ?? '—'}</TableCell>
                  <TableCell>
                    {r.grnId != null ? (
                      <Link component={RouterLink} to={`/${company}/fab_erp/grn-detail?grnId=${r.grnId}`}>
                        View GRN
                      </Link>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ItemBatches() {
  const canView = usePermission('fab_erp_inventory_view');
  const { company } = useParams<{ company: string }>();
  const [searchParams] = useSearchParams();
  const itemIdParam = searchParams.get('itemId');

  const [item,     setItem]     = useState<FabItemCatalog | null>(null);
  const [allItems, setAllItems] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);

  const [plants,    setPlants]    = useState<FabPlant[]>([]);
  const [locations, setLocations] = useState<FabStockLocation[]>([]);
  const [plantId,    setPlantId]    = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');

  const [batches, setBatches] = useState<FabItemBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [receiptsBatch, setReceiptsBatch] = useState<FabItemBatch | null>(null);

  const catalogItemId = itemIdParam ? Number(itemIdParam) : selectedItem?.id;

  useEffect(() => {
    if (!itemIdParam) return;
    fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', { filters: { id: Number(itemIdParam) } })
      .then((res) => setItem(res.data?.[0] ?? null))
      .catch((e: any) => setError(e.message));
  }, [itemIdParam]);

  useEffect(() => {
    if (itemIdParam) return;
    fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', {
      orderBy: [{ field: 'name', direction: 'asc' }],
      pagination: { limit: 1000 },
    })
      .then((res) => setAllItems((res.data ?? []).map((it) => ({ id: it.id, name: it.name, code: it.code }))))
      .catch((e: any) => setError(e.message));
  }, [itemIdParam]);

  useEffect(() => {
    fabQuery<{ data: FabPlant[] }>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }] })
      .then((res) => setPlants(res.data ?? []))
      .catch((e: any) => setError(e.message));
  }, []);

  useEffect(() => {
    const params: any = { orderBy: [{ field: 'name', direction: 'asc' }] };
    if (plantId !== '') params.filters = { plantId };
    fabQuery<{ data: FabStockLocation[] }>('fabErpStockLocation', params)
      .then((res) => setLocations(res.data ?? []))
      .catch((e: any) => setError(e.message));
  }, [plantId]);

  const fetchBatches = useCallback(async () => {
    if (!catalogItemId) { setBatches([]); return; }
    setLoading(true); setError('');
    try {
      const filters: Record<string, unknown> = { catalogItemId };
      if (plantId !== '')    filters.plantId = plantId;
      if (locationId !== '') filters.stockLocationId = locationId;
      const res = await fabQuery<{ data: FabItemBatch[] }>('fabErpItemBatch', {
        filters,
        orderBy: [{ field: 'receivedDate', direction: 'desc' }],
      });
      setBatches(res.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [catalogItemId, plantId, locationId]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  if (!canView) {
    return (
      <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
        <Alert severity="warning">You don't have permission to view this page.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Item Batches</Typography>
        <Typography variant="body2" color="text.secondary">
          Batch/lot level stock on hand by plant and location
        </Typography>
      </Box>

      {itemIdParam ? (
        <Box sx={{ mb: 2 }}>
          {item && (
            <Typography variant="subtitle1" fontWeight={600}>
              {item.name} ({item.code}) {item.unit ? `— ${item.unit}` : ''}
            </Typography>
          )}
          <Link component={RouterLink} to={`/${company}/fab_erp/item-catalog`}>
            Back to Item Catalog
          </Link>
        </Box>
      ) : (
        <Autocomplete
          options={allItems}
          getOptionLabel={(o) => `${o.name} (${o.code})`}
          value={selectedItem}
          onChange={(_, v) => setSelectedItem(v)}
          sx={{ mb: 2, maxWidth: 400 }}
          renderInput={(params) => <TextField {...params} label="Select Item" size="small" />}
        />
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Select
          size="small" displayEmpty sx={{ minWidth: 180 }}
          value={plantId}
          onChange={(e) => { setPlantId(e.target.value as number | ''); setLocationId(''); }}
        >
          <MenuItem value="">All Plants</MenuItem>
          {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </Select>
        <Select
          size="small" displayEmpty sx={{ minWidth: 200 }}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value as number | '')}
        >
          <MenuItem value="">All Stock Locations</MenuItem>
          {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
        </Select>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!catalogItemId ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Inventory2Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">Select an item to view its batches.</Typography>
        </Paper>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : batches.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Inventory2Icon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No batches found.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Batch Code</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Plant</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Stock Location</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Qty on Hand</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Received Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Notes</TableCell>
                <TableCell sx={{ width: 60 }} align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id} hover>
                  <TableCell>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', bgcolor: 'action.selected', px: 0.75, py: 0.25, borderRadius: 0.5 }}>
                      {b.batchCode}
                    </Typography>
                  </TableCell>
                  <TableCell>{b.plantName ?? '—'}</TableCell>
                  <TableCell>{b.stockLocationName ?? '—'}</TableCell>
                  <TableCell>{b.qtyOnHand}</TableCell>
                  <TableCell>{b.receivedDate ?? '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 240 }}>
                      {b.notes ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Receipts">
                      <IconButton size="small" onClick={() => setReceiptsBatch(b)}>
                        <ReceiptLongIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <ReceiptsDialog batch={receiptsBatch} company={company} onClose={() => setReceiptsBatch(null)} />
    </Box>
  );
}
