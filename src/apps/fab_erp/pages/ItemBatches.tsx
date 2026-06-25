/**
 * ItemBatches — read-only view of batch/lot stock for a catalog item,
 * filterable by plant and stock location, with drill-down into the
 * stock ledger (receipts/issues) for each batch.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, CircularProgress, Dialog, DialogContent, DialogTitle,
  IconButton, Link, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';

import { fabQuery } from '../api/client';
import type { FabItemBatch, FabItemCatalog, FabPlant, FabStockLedger, FabStockLocation } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, EmptyState, ListSkeleton } from '../components';

interface ItemOption { id: number; name: string; code: string }

function ReceiptsDialog({ batch, company, onClose }: {
  batch: FabItemBatch | null; company: string | undefined; onClose: () => void;
}) {
  const [rows, setRows] = useState<FabStockLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!batch) return;
    setLoading(true); setError('');
    fabQuery<{ data: FabStockLedger[] }>('fabErpStockLedger', { filters: { batchId: batch.id }, orderBy: [{ field: 'txnDate', direction: 'desc' }] })
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [batch]);

  const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
  const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Dialog open={!!batch} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Receipts — <Mono>{batch?.batchCode}</Mono></DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 2 }}>No ledger entries found.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Txn date</TableCell>
                <TableCell sx={th} align="right">Qty</TableCell>
                <TableCell sx={th} align="right">Unit cost</TableCell>
                <TableCell sx={th}>Supplier</TableCell>
                <TableCell sx={th}>GRN</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={td}><Mono>{r.txnDate}</Mono></TableCell>
                  <TableCell sx={td} align="right"><Mono tabular>{r.qty}</Mono></TableCell>
                  <TableCell sx={td} align="right">{r.unitCost ?? '—'}</TableCell>
                  <TableCell sx={td}>{r.supplierName ?? '—'}</TableCell>
                  <TableCell sx={td}>
                    {r.grnId != null ? (
                      <Link component={RouterLink} to={`/${company}/fab_erp/grn-detail?grnId=${r.grnId}`} sx={{ color: 'var(--c-primary-700)' }}>
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

  const [item, setItem] = useState<FabItemCatalog | null>(null);
  const [allItems, setAllItems] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [locations, setLocations] = useState<FabStockLocation[]>([]);
  const [plantId, setPlantId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [batches, setBatches] = useState<FabItemBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptsBatch, setReceiptsBatch] = useState<FabItemBatch | null>(null);

  const catalogItemId = itemIdParam ? Number(itemIdParam) : selectedItem?.id;

  useEffect(() => {
    if (!itemIdParam) return;
    fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', { filters: { id: Number(itemIdParam) } })
      .then((res) => setItem(res.data?.[0] ?? null))
      .catch((e) => setError((e as Error).message));
  }, [itemIdParam]);

  useEffect(() => {
    if (itemIdParam) return;
    fabQuery<{ data: FabItemCatalog[] }>('fabErpItemCatalog', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 1000 } })
      .then((res) => setAllItems((res.data ?? []).map((it) => ({ id: it.id, name: it.name, code: it.code }))))
      .catch((e) => setError((e as Error).message));
  }, [itemIdParam]);

  useEffect(() => {
    fabQuery<{ data: FabPlant[] }>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }] })
      .then((res) => setPlants(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    const params: { orderBy: { field: string; direction: 'asc' | 'desc' }[]; filters?: Record<string, unknown> } = { orderBy: [{ field: 'name', direction: 'asc' }] };
    if (plantId !== '') params.filters = { plantId };
    fabQuery<{ data: FabStockLocation[] }>('fabErpStockLocation', params)
      .then((res) => setLocations(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, [plantId]);

  const fetchBatches = useCallback(async () => {
    if (!catalogItemId) { setBatches([]); return; }
    setLoading(true); setError('');
    try {
      const filters: Record<string, unknown> = { catalogItemId };
      if (plantId !== '') filters.plantId = plantId;
      if (locationId !== '') filters.stockLocationId = locationId;
      const res = await fabQuery<{ data: FabItemBatch[] }>('fabErpItemBatch', { filters, orderBy: [{ field: 'receivedDate', direction: 'desc' }] });
      setBatches(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [catalogItemId, plantId, locationId]);

  useEffect(() => { fetchBatches(); }, [fetchBatches]);

  if (!canView) return <Alert severity="warning" sx={{ maxWidth: 960, mx: 'auto' }}>You don't have permission to view this page.</Alert>;

  const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
  const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      <PageHeader title="Item Batches" subtitle="Batch/lot level stock on hand by plant and location" />

      {itemIdParam ? (
        <Box sx={{ mb: 2 }}>
          {item && (
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
              {item.name} ({item.code}) {item.unit ? `— ${item.unit}` : ''}
            </Typography>
          )}
          <Link component={RouterLink} to={`/${company}/fab_erp/item-catalog`} sx={{ color: 'var(--c-primary-700)' }}>
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
          renderInput={(params) => <TextField {...params} label="Select item" size="small" />}
        />
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Select size="small" displayEmpty sx={{ minWidth: 180 }} value={plantId} onChange={(e) => { setPlantId(e.target.value as number | ''); setLocationId(''); }}>
          <MenuItem value="">All plants</MenuItem>
          {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty sx={{ minWidth: 200 }} value={locationId} onChange={(e) => setLocationId(e.target.value as number | '')}>
          <MenuItem value="">All stock locations</MenuItem>
          {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
        </Select>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!catalogItemId ? (
        <EmptyState icon={<Inventory2Rounded />} title="Select an item to view its batches" />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : batches.length === 0 ? (
        <EmptyState icon={<Inventory2Rounded />} title="No batches found" />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Batch code</TableCell>
                <TableCell sx={th}>Plant</TableCell>
                <TableCell sx={th}>Stock location</TableCell>
                <TableCell sx={th} align="right">Qty on hand</TableCell>
                <TableCell sx={th}>Received date</TableCell>
                <TableCell sx={th}>Notes</TableCell>
                <TableCell sx={{ ...th, width: 60 }} align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id} hover>
                  <TableCell sx={td}><Mono chip>{b.batchCode}</Mono></TableCell>
                  <TableCell sx={td}>{b.plantName ?? '—'}</TableCell>
                  <TableCell sx={td}>{b.stockLocationName ?? '—'}</TableCell>
                  <TableCell sx={td} align="right"><Mono tabular>{b.qtyOnHand}</Mono></TableCell>
                  <TableCell sx={td}>{b.receivedDate ?? '—'}</TableCell>
                  <TableCell sx={td}>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                      {b.notes ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={td} align="right">
                    <Tooltip title="Receipts"><IconButton size="small" onClick={() => setReceiptsBatch(b)}><ReceiptLongRounded fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}

      <ReceiptsDialog batch={receiptsBatch} company={company} onClose={() => setReceiptsBatch(null)} />
    </Box>
  );
}
