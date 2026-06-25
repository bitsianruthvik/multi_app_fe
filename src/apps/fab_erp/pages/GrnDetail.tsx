/**
 * GrnDetail — read-only summary of a Goods Receipt Note and its line items.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, CircularProgress, Link, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';

import { fabQuery } from '../api/client';
import type { FabGrn, FabGrnLine } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, FactItem, StatusBadge, Mono, EmptyState } from '../components';
import { statusFamily } from '../statusMap';

export default function GrnDetail() {
  const canView = usePermission('fab_erp_grn_view');
  const { company } = useParams<{ company: string }>();
  const [searchParams] = useSearchParams();
  const grnId = searchParams.get('grnId');

  const [grn, setGrn] = useState<FabGrn | null>(null);
  const [lines, setLines] = useState<FabGrnLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [grnId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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

          {lines.length === 0 ? (
            <EmptyState title="No line items found" />
          ) : (
            <Surface e={1} sx={{ overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                    <TableCell sx={th}>Item</TableCell>
                    <TableCell sx={th}>Batch code</TableCell>
                    <TableCell sx={th} align="right">Qty</TableCell>
                    <TableCell sx={th} align="right">Unit cost</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id} hover>
                      <TableCell sx={td}>
                        {line.catalogItemName ?? '—'}{line.catalogItemCode ? ` (${line.catalogItemCode})` : ''}
                      </TableCell>
                      <TableCell sx={td}>
                        <Link component={RouterLink} to={`/${company}/fab_erp/item-batches?itemId=${line.catalogItemId}`} sx={{ color: 'var(--c-primary-700)', textDecorationColor: 'var(--c-primary-200)' }}>
                          <Mono>{line.batchCode}</Mono>
                        </Link>
                      </TableCell>
                      <TableCell sx={td} align="right"><Mono tabular>{line.qty}</Mono></TableCell>
                      <TableCell sx={td} align="right">{line.unitCost ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
          )}
        </>
      )}
    </Box>
  );
}
