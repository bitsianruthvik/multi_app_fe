/**
 * GrnDetail — read-only summary of a Goods Receipt Note and its line items.
 */

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, CircularProgress, Collapse, IconButton, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowRightRounded from '@mui/icons-material/KeyboardArrowRightRounded';

import { fabQuery } from '../api/client';
import type { FabCustomField, FabGrn, FabItemCatalog } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, FactItem, StatusBadge, Mono, EmptyState } from '../components';
import { statusFamily } from '../statusMap';

interface QueryResult<T> { data: T[]; total?: number }

/** fab_stock_pieces row, as returned (camelCase) by the fabErpStockPiece query resource. */
interface FabStockPiece {
  id: number;
  companyId: number;
  catalogItemId: number;
  plantId: number;
  stockLocationId: number;
  batchNo: string | null;
  heatNo: string | null;
  serialNo: string | null;
  markNo: string | null;
  qty: number;
  uom: string | null;
  unitCost: number | null;
  status: string;
  grnId: number | null;
  grnLineId: number | null;
  receivedDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function GrnDetail() {
  const canView = usePermission('fab_erp_grn_view');
  const { company } = useParams<{ company: string }>();
  const [searchParams] = useSearchParams();
  const grnId = searchParams.get('grnId');

  const [grn, setGrn] = useState<FabGrn | null>(null);
  const [pieces, setPieces] = useState<FabStockPiece[]>([]);
  const [catalogById, setCatalogById] = useState<Map<number, FabItemCatalog>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [customFieldsByPiece, setCustomFieldsByPiece] = useState<Map<number, FabCustomField[]>>(new Map());
  const [loadingCustomFor, setLoadingCustomFor] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!grnId) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [grnRes, piecesRes, catalogRes] = await Promise.all([
        fabQuery<QueryResult<FabGrn>>('fabErpGrn', { filters: { id: Number(grnId) } }),
        fabQuery<QueryResult<FabStockPiece>>('fabErpStockPiece', { filters: { grnId: Number(grnId) } }),
        fabQuery<QueryResult<FabItemCatalog>>('fabErpItemCatalog', { pagination: { limit: 1000 } }),
      ]);
      setGrn(grnRes.data?.[0] ?? null);
      setPieces(piecesRes.data ?? []);
      setCatalogById(new Map((catalogRes.data ?? []).map((c) => [c.id, c])));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [grnId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function toggleExpand(pieceId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pieceId)) next.delete(pieceId); else next.add(pieceId);
      return next;
    });
    if (!customFieldsByPiece.has(pieceId)) {
      setLoadingCustomFor(pieceId);
      try {
        const res = await fabQuery<QueryResult<FabCustomField>>('fabErpCustomField', {
          filters: { level: 'stock_piece', levelId: pieceId },
          orderBy: [{ field: 'sortOrder', direction: 'asc' }],
        });
        setCustomFieldsByPiece((prev) => new Map(prev).set(pieceId, res.data ?? []));
      } catch { /* ignore — expansion just shows the empty state */ }
      finally { setLoadingCustomFor(null); }
    }
  }

  if (!canView) {
    return <Alert severity="warning" sx={{ maxWidth: 960, mx: 'auto' }}>You don't have permission to view this page.</Alert>;
  }

  const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
  const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto' }}>
      <PageHeader title="GRN Detail" subtitle="Goods receipt note summary and line items" />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Surface e={1} sx={{ p: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Surface>
      ) : !grn ? (
        <EmptyState icon={<LocalShippingRounded />} title="GRN not found" />
      ) : (
        <>
          <Surface e={1} sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
              <Mono sx={{ fontSize: 16, fontWeight: 500, color: 'var(--c-text)' }}>{grn.grnNumber}</Mono>
              <StatusBadge status={grn.status} family={statusFamily(grn.status)} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 2 }}>
              <FactItem label="Date" value={grn.grnDate} />
              <FactItem label="Plant" value={grn.plantName ?? '—'} />
              <FactItem label="Stock location" value={grn.stockLocationName ?? '—'} />
              <FactItem label="Supplier" value={grn.supplierName ?? '—'} />
              <FactItem label="Supplier ref" value={grn.supplierRef ?? '—'} />
              <FactItem label="Notes" value={grn.notes ?? '—'} />
            </Box>
          </Surface>

          {pieces.length === 0 ? (
            <EmptyState title="No pieces found" />
          ) : (
            <Surface e={1} sx={{ overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                    <TableCell sx={{ ...th, width: 40 }} />
                    <TableCell sx={th}>Item</TableCell>
                    <TableCell sx={th}>Batch no.</TableCell>
                    <TableCell sx={th}>Heat no.</TableCell>
                    <TableCell sx={th}>Serial no.</TableCell>
                    <TableCell sx={th}>Mark no.</TableCell>
                    <TableCell sx={th} align="right">Qty</TableCell>
                    <TableCell sx={th} align="right">Unit cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pieces.map((piece) => {
                    const item = catalogById.get(piece.catalogItemId);
                    const isOpen = expanded.has(piece.id);
                    const customFields = customFieldsByPiece.get(piece.id) ?? [];
                    return (
                      <Fragment key={piece.id}>
                        <TableRow hover>
                          <TableCell sx={td}>
                            <IconButton size="small" onClick={() => toggleExpand(piece.id)}>
                              {isOpen ? <KeyboardArrowDownRounded fontSize="small" /> : <KeyboardArrowRightRounded fontSize="small" />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={td}>
                            <Link component={RouterLink} to={`/${company}/fab_erp/item-batches?itemId=${piece.catalogItemId}`} sx={{ color: 'var(--c-primary-700)', textDecorationColor: 'var(--c-primary-200)' }}>
                              {item?.name ?? '—'}{item?.code ? ` (${item.code})` : ''}
                            </Link>
                          </TableCell>
                          <TableCell sx={td}><Mono>{piece.batchNo ?? '—'}</Mono></TableCell>
                          <TableCell sx={td}><Mono>{piece.heatNo ?? '—'}</Mono></TableCell>
                          <TableCell sx={td}><Mono>{piece.serialNo ?? '—'}</Mono></TableCell>
                          <TableCell sx={td}><Mono>{piece.markNo ?? '—'}</Mono></TableCell>
                          <TableCell sx={td} align="right"><Mono tabular>{piece.qty}</Mono></TableCell>
                          <TableCell sx={td} align="right">{piece.unitCost ?? '—'}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={8} sx={{ p: 0, borderColor: 'var(--c-divider)' }}>
                            <Collapse in={isOpen} unmountOnExit>
                              <Box sx={{ p: 2, background: 'var(--c-surface-2)' }}>
                                {loadingCustomFor === piece.id ? (
                                  <CircularProgress size={16} />
                                ) : customFields.length === 0 ? (
                                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>No custom field values for this piece.</Typography>
                                ) : (
                                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1.5 }}>
                                    {customFields.map((f) => (
                                      <FactItem key={f.id} label={f.fieldKey} value={f.fieldValue ?? '—'} />
                                    ))}
                                  </Box>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Surface>
          )}
        </>
      )}
    </Box>
  );
}
