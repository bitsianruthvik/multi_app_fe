/**
 * GrnDetail — read-only summary of a Goods Receipt Note and its line items.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { fabQuery } from '../api/client';
import type { FabGrn, FabGrnLine } from '../types';
import { usePermission } from '@core/hooks/usePermission';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={500}>{value}</Typography>
    </Box>
  );
}

export default function GrnDetail() {
  const canView = usePermission('fab_erp_grn_view');
  const { company } = useParams<{ company: string }>();
  const [searchParams] = useSearchParams();
  const grnId = searchParams.get('grnId');

  const [grn,   setGrn]   = useState<FabGrn | null>(null);
  const [lines, setLines] = useState<FabGrnLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchAll = useCallback(async () => {
    if (!grnId) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [grnRes, linesRes] = await Promise.all([
        fabQuery<{ data: FabGrn[] }>('fabErpGrn', { filters: { id: Number(grnId) } }),
        fabQuery<{ data: FabGrnLine[] }>('fabErpGrnLine', { filters: { grnId: Number(grnId) } }),
      ]);
      setGrn(grnRes.data?.[0] ?? null);
      setLines(linesRes.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [grnId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
        <Typography variant="h5" fontWeight={700}>GRN Detail</Typography>
        <Typography variant="body2" color="text.secondary">
          Goods Receipt Note summary and line items
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : !grn ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">GRN not found.</Typography>
        </Paper>
      ) : (
        <>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Field label="GRN Number" value={grn.grnNumber} />
              <Field label="Date" value={grn.grnDate} />
              <Field label="Plant" value={grn.plantName ?? '—'} />
              <Field label="Stock Location" value={grn.stockLocationName ?? '—'} />
              <Field label="Supplier" value={grn.supplierName ?? '—'} />
              <Field label="Supplier Ref" value={grn.supplierRef ?? '—'} />
              <Field label="Notes" value={grn.notes ?? '—'} />
              <Field label="Status" value={grn.status} />
            </Box>
          </Paper>

          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Line Items</Typography>
          {lines.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No line items found.</Typography>
            </Paper>
          ) : (
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Item</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Batch Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Unit Cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id} hover>
                      <TableCell>
                        {line.catalogItemName ?? '—'}
                        {line.catalogItemCode ? ` (${line.catalogItemCode})` : ''}
                      </TableCell>
                      <TableCell>
                        <Link component={RouterLink} to={`/${company}/fab_erp/item-batches?itemId=${line.catalogItemId}`}>
                          {line.batchCode}
                        </Link>
                      </TableCell>
                      <TableCell>{line.qty}</TableCell>
                      <TableCell>{line.unitCost ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
