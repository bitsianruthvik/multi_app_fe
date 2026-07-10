/**
 * ItemBatches — item-level stock summary view (live-aggregated from
 * fab_stock_pieces via the /stock/summary route), with a "Segment by"
 * dimension per item (batch, heat, or individual stock piece) that expands
 * the row in place into sub-rows, and a drill-down into the stock ledger for
 * a clicked sub-row. Stock Piece segments additionally show every
 * stock-piece-level custom field (e.g. Width, Length) inline.
 */

import { Fragment, useCallback, useEffect, useState, type MouseEvent } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle,
  Link, Menu, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow,
  Typography,
} from '@mui/material';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';

import { fabQuery, fabGet, type FilterValue } from '../api/client';
import type { FabPlant, FabStockLedger, FabStockLocation } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, EmptyState, ListSkeleton, FilterBar } from '../components';

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

// ---------------------------------------------------------------------------
// /stock/summary response shape (see multi_app_be/apps/fab_erp/routes/stock.js)
// ---------------------------------------------------------------------------

interface StockSummaryCustomField { fieldKey: string; fieldValue: string | null }
interface StockSummarySegment {
  value: string | number | null;
  qty: number;
  pieceId?: number;
  batchNo?: string | null;
  heatNo?: string | null;
  serialNo?: string | null;
  markNo?: string | null;
  status?: string | null;
  customFields?: StockSummaryCustomField[];
}
interface StockSummaryItem {
  catalogItemId: number;
  name: string;
  code: string;
  unit: string | null;
  qty: number;
  segments?: StockSummarySegment[];
}
interface StockSummaryResponse { ok: boolean; data: { items: StockSummaryItem[] } }

// Segmentation options — value is the exact `groupBy` query param the
// backend accepts.
const BASE_SEGMENT_OPTIONS: { key: string; label: string }[] = [
  { key: 'batchNo', label: 'Batch' },
  { key: 'heatNo', label: 'Heat' },
  { key: 'piece', label: 'Stock Piece' },
];

// groupBy keys that map onto a fab_stock_ledger column we can filter on for
// the drill-down dialog.
const LEDGER_FILTER_FIELD: Record<string, string> = {
  batchNo: 'batchNo',
  heatNo: 'heatNo',
  piece: 'pieceId',
};

interface DrillTarget {
  catalogItemId: number;
  groupByKey: string;
  segmentLabel: string;
  value: string | number | null;
  displayValue: string | number | null;
}

interface ExpandedState {
  groupByKey: string;
  optionLabel: string;
  loading: boolean;
  error?: string;
  segments: StockSummarySegment[];
}

function ReceiptsDialog({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const [rows, setRows] = useState<FabStockLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { company } = useParams<{ company: string }>();

  const ledgerField = target ? LEDGER_FILTER_FIELD[target.groupByKey] : undefined;

  useEffect(() => {
    if (!target) return;
    setLoading(true); setError('');
    const filters: Record<string, FilterValue> = { catalogItemId: target.catalogItemId };
    if (ledgerField) filters[ledgerField] = target.value;
    fabQuery<{ data: FabStockLedger[] }>('fabErpStockLedger', { filters, orderBy: [{ field: 'txnDate', direction: 'desc' }] })
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <Dialog open={!!target} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        Ledger — <Mono>{target?.displayValue ?? '—'}</Mono>
      </DialogTitle>
      <DialogContent>
        {!ledgerField && target && (
          <Alert severity="info" sx={{ mb: 2 }}>
            The stock ledger doesn't track "{target.segmentLabel}" values directly — showing all
            ledger entries for this item instead.
          </Alert>
        )}
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
  const focusedItemId = itemIdParam ? Number(itemIdParam) : null;

  const [items, setItems] = useState<StockSummaryItem[]>([]);
  const [plants, setPlants] = useState<FabPlant[]>([]);
  const [locations, setLocations] = useState<FabStockLocation[]>([]);
  const [plantId, setPlantId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [expanded, setExpanded] = useState<Record<number, ExpandedState>>({});
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement; catalogItemId: number } | null>(null);
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null);

  useEffect(() => {
    fabQuery<{ data: FabPlant[] }>('fabErpPlant', { orderBy: [{ field: 'name', direction: 'asc' }] })
      .then((res) => setPlants(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    const params: { orderBy: { field: string; direction: 'asc' | 'desc' }[]; filters?: Record<string, FilterValue> } = { orderBy: [{ field: 'name', direction: 'asc' }] };
    if (plantId !== '') params.filters = { plantId };
    fabQuery<{ data: FabStockLocation[] }>('fabErpStockLocation', params)
      .then((res) => setLocations(res.data ?? []))
      .catch((e) => setError((e as Error).message));
  }, [plantId]);

  const fetchItems = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, unknown> = {};
      if (plantId !== '') params.plantId = plantId;
      if (locationId !== '') params.stockLocationId = locationId;
      const res = await fabGet<StockSummaryResponse>('stock/summary', params);
      let rows = res.data?.items ?? [];
      if (focusedItemId != null) rows = rows.filter((r) => r.catalogItemId === focusedItemId);
      setItems(rows);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [plantId, locationId, focusedItemId]);

  useEffect(() => { fetchItems(); setExpanded({}); }, [fetchItems]);

  function openSegmentMenu(e: MouseEvent<HTMLElement>, catalogItemId: number) {
    setMenuAnchor({ el: e.currentTarget, catalogItemId });
  }

  async function selectSegment(catalogItemId: number, groupByKey: string, optionLabel: string) {
    setMenuAnchor(null);

    const current = expanded[catalogItemId];
    if (current && current.groupByKey === groupByKey) {
      // Toggle off — collapse.
      setExpanded((prev) => { const next = { ...prev }; delete next[catalogItemId]; return next; });
      return;
    }

    setExpanded((prev) => ({ ...prev, [catalogItemId]: { groupByKey, optionLabel, loading: true, segments: [] } }));
    try {
      const params: Record<string, unknown> = { groupBy: groupByKey, catalogItemId };
      if (plantId !== '') params.plantId = plantId;
      if (locationId !== '') params.stockLocationId = locationId;
      const res = await fabGet<StockSummaryResponse>('stock/summary', params);
      // The backend's catalogItemId scoping is best-effort; filter client-side
      // to the item we asked about regardless of what came back.
      const match = (res.data?.items ?? []).find((it) => it.catalogItemId === catalogItemId);
      setExpanded((prev) => ({ ...prev, [catalogItemId]: { groupByKey, optionLabel, loading: false, segments: match?.segments ?? [] } }));
    } catch (e) {
      setExpanded((prev) => ({ ...prev, [catalogItemId]: { groupByKey, optionLabel, loading: false, segments: [], error: (e as Error).message } }));
    }
  }

  function segmentValueLabel(value: string | number | null): string {
    if (value === null || value === undefined || value === '') return '(none)';
    return String(value);
  }

  if (!canView) return <Alert severity="warning" sx={{ maxWidth: 960, mx: 'auto' }}>You don't have permission to view this page.</Alert>;

  const menuItemId = menuAnchor?.catalogItemId;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Item Batches" subtitle="Live stock on hand by item, segmentable by batch, heat, or individual stock piece" />

      {focusedItemId != null && (
        <Box sx={{ mb: 2 }}>
          <Link component={RouterLink} to={`/${company}/fab_erp/item-batches`} sx={{ color: 'var(--c-primary-700)' }}>
            Clear item filter — show all items
          </Link>
          {' · '}
          <Link component={RouterLink} to={`/${company}/fab_erp/item-catalog`} sx={{ color: 'var(--c-primary-700)' }}>
            Back to Item Catalog
          </Link>
        </Box>
      )}

      <FilterBar>
        <Select size="small" displayEmpty sx={{ minWidth: 180 }} value={plantId} onChange={(e) => { setPlantId(e.target.value as number | ''); setLocationId(''); }}>
          <MenuItem value="">All plants</MenuItem>
          {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty sx={{ minWidth: 200 }} value={locationId} onChange={(e) => setLocationId(e.target.value as number | '')}>
          <MenuItem value="">All stock locations</MenuItem>
          {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
        </Select>
      </FilterBar>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Inventory2Rounded />} title="No stock found" />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...th, minWidth: 200 }}>Item</TableCell>
                <TableCell sx={{ ...th, width: 120 }}>Code</TableCell>
                <TableCell sx={{ ...th, width: 90 }}>Unit</TableCell>
                <TableCell sx={{ ...th, width: 110 }} align="right">Qty</TableCell>
                <TableCell sx={{ ...th, width: 160 }} align="right">Segment by</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const exp = expanded[item.catalogItemId];
                return (
                  <Fragment key={item.catalogItemId}>
                    <TableRow hover>
                      <TableCell sx={td}>{item.name}</TableCell>
                      <TableCell sx={td}><Mono chip>{item.code}</Mono></TableCell>
                      <TableCell sx={td}>{item.unit ?? '—'}</TableCell>
                      <TableCell sx={td} align="right"><Mono tabular>{item.qty}</Mono></TableCell>
                      <TableCell sx={td} align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          endIcon={<KeyboardArrowDownRounded fontSize="small" />}
                          onClick={(e) => openSegmentMenu(e, item.catalogItemId)}
                        >
                          {exp ? exp.optionLabel : 'Segment by'}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {exp && (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ borderColor: 'var(--c-divider)', p: 0, background: 'var(--c-surface-2)' }}>
                          {exp.loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
                          ) : exp.error ? (
                            <Alert severity="error" sx={{ m: 1 }}>{exp.error}</Alert>
                          ) : exp.segments.length === 0 ? (
                            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', px: 3, py: 1.5 }}>
                              No {exp.optionLabel.toLowerCase()} segments found.
                            </Typography>
                          ) : (
                            <Table size="small">
                              <TableBody>
                                {exp.segments.map((seg, i) => {
                                  const isPiece = exp.groupByKey === 'piece';
                                  const customFieldsText = (seg.customFields ?? [])
                                    .map((cf) => `${cf.fieldKey}: ${cf.fieldValue ?? '—'}`)
                                    .join('  ·  ');
                                  return (
                                    <TableRow
                                      key={`${item.catalogItemId}-${exp.groupByKey}-${i}`}
                                      hover
                                      sx={{ cursor: 'pointer' }}
                                      onClick={() => setDrillTarget({
                                        catalogItemId: item.catalogItemId,
                                        groupByKey: exp.groupByKey,
                                        segmentLabel: exp.optionLabel,
                                        value: isPiece ? (seg.pieceId ?? null) : seg.value,
                                        displayValue: seg.value,
                                      })}
                                    >
                                      <TableCell sx={{ ...td, pl: 5, width: 200 }}>
                                        <ExpandMoreRounded fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5, color: 'var(--c-text-2)', transform: 'rotate(-90deg)' }} />
                                        {segmentValueLabel(seg.value)}
                                      </TableCell>
                                      <TableCell sx={td}>
                                        {isPiece ? (seg.heatNo ?? '—') : ''}
                                      </TableCell>
                                      <TableCell sx={{ ...td, color: 'var(--c-text-2)' }}>
                                        {isPiece ? (customFieldsText || '—') : ''}
                                      </TableCell>
                                      <TableCell sx={td} align="right"><Mono tabular>{seg.qty}</Mono></TableCell>
                                      <TableCell sx={td} align="right">
                                        <ReceiptLongRounded fontSize="small" sx={{ color: 'var(--c-text-2)' }} />
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Surface>
      )}

      <Menu anchorEl={menuAnchor?.el ?? null} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        {BASE_SEGMENT_OPTIONS.map((opt) => (
          <MenuItem key={opt.key} onClick={() => menuItemId != null && selectSegment(menuItemId, opt.key, opt.label)}>
            {opt.label}
          </MenuItem>
        ))}
      </Menu>

      <ReceiptsDialog target={drillTarget} onClose={() => setDrillTarget(null)} />
    </Box>
  );
}
