import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Tooltip, Typography } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';

import api, { API_HOST } from '@core/utils/axiosConfig';
import { Surface, EmptyState } from '../components';

/**
 * Nesting — each raw material on the order, and every part cut from it.
 *
 * The item tree reads downward (assembly → part → material), which is the wrong
 * way round for the two questions actually asked on a shop floor: what am I
 * cutting out of this plate, and what is this order waiting on. Both are the
 * material's view, so this screen groups by material.
 *
 * The stock column is not decoration. Receiving material already releases every
 * task gated on it — stockInService re-checks them on each receipt and a
 * background sweep catches the rest — but until now nothing showed which
 * material an order was sitting on. That is what the "waiting" rows are.
 */

interface NestedPart {
  linkId: number;
  partId: number;
  partCode: string | null;
  partName: string;
  partQty: number;
  qtyPerPart: number | null;
}
/** One physical plate, and the parts laid out on it. */
interface Nest {
  key: string;
  nestNo: string | null;
  /** How much material this ONE plate is — drawn once, not once per part. */
  qty: number | null;
  /** True once the plate has gone to the floor. */
  issued: boolean;
  parts: NestedPart[];
}
interface NestedMaterial {
  catalogItemId: number;
  materialCode: string;
  materialName: string;
  unit: string | null;
  onHand: number;
  pieces: number;
  inStock: boolean;
  /** One plate per nest — never the sum of the per-part figures. */
  required: number | null;
  /** What is still to be drawn: plates already cut no longer count. */
  stillRequired: number | null;
  nestsIssued: number;
  short: boolean;
  nests: Nest[];
  parts: NestedPart[];
}
interface NestingResponse {
  materials: NestedMaterial[];
  nests: number;
  waitingOnStock: number;
  nestsBlocked: number;
  partsBlocked: number;
}

export default function OrderNesting({ orderId }: { orderId: number }) {
  const [data, setData] = useState<NestingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get<NestingResponse>(
        `${API_HOST}/api/${companySlug}/fab_erp/orders/${orderId}/items/nesting`,
      );
      setData(res.data);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Failed to load nesting');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Surface e={1} sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Surface>
    );
  }
  if (error) return <Alert severity="error" onClose={() => setError('')}>{error}</Alert>;

  if (!data || data.materials.length === 0) {
    return (
      <EmptyState
        icon={<Inventory2Rounded />}
        title="Nothing nested yet"
        hint="Fill in the Nesting sheet of the Excel template — one raw material per row, and the codes of the parts cut from it."
      />
    );
  }

  return (
    <Box>
      {data.waitingOnStock > 0 ? (
        <Alert severity="warning" icon={<HourglassEmptyRounded fontSize="inherit" />} sx={{ mb: 2 }}>
          Waiting on <strong>{data.waitingOnStock}</strong> material
          {data.waitingOnStock === 1 ? '' : 's'} — <strong>{data.nestsBlocked}</strong> nest
          {data.nestsBlocked === 1 ? '' : 's'}, <strong>{data.partsBlocked}</strong> part
          {data.partsBlocked === 1 ? '' : 's'}. Work starts by itself the moment the material is
          received into stock — nothing here needs to be clicked.
        </Alert>
      ) : (
        <Alert severity="success" icon={<CheckCircleRounded fontSize="inherit" />} sx={{ mb: 2 }}>
          Every material on this order is in stock.
        </Alert>
      )}

      {data.materials.map((m) => (
        <Surface key={m.catalogItemId} e={1} sx={{ mb: 1.5, overflow: 'hidden' }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
            px: 2, py: 1.25, borderBottom: '0.5px solid var(--c-divider)',
            bgcolor: m.inStock ? 'transparent' : 'var(--c-surface-2)',
          }}>
            <Typography sx={{ fontFamily: 'monospace', fontSize: 13.5, color: 'var(--c-text)' }}>
              {m.materialCode}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: 1, minWidth: 160 }}>
              {m.materialName}
            </Typography>

            {/* Needed is one plate per nest. Showing it beside what is on hand
                is the whole point — "in stock" alone can be true while still
                not covering the plates this order has left to cut. */}
            {m.stillRequired != null && (
              <Tooltip title={`One plate per nest: ${m.nests.length} nest(s)${m.nestsIssued ? `, ${m.nestsIssued} already drawn` : ''}. Never the sum of the per-part figures.`}>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontFamily: 'monospace' }}>
                  need {Number(m.stillRequired.toFixed(3))} / have {Number(m.onHand.toFixed(3))} {m.unit ?? ''}
                </Typography>
              </Tooltip>
            )}

            <Chip
              size="small"
              icon={m.short ? <HourglassEmptyRounded /> : <CheckCircleRounded />}
              color={m.short ? 'warning' : 'success'}
              variant={m.short ? 'outlined' : 'filled'}
              label={m.short
                ? (m.inStock ? 'Short' : 'Not in stock')
                : `Covered — ${Number(m.onHand.toFixed(3))} ${m.unit ?? ''}`.trim()}
            />
            <Tooltip title="Physical pieces of this material, and the parts laid out on them">
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                {m.nests.length} nest{m.nests.length === 1 ? '' : 's'} · {m.parts.length} part{m.parts.length === 1 ? '' : 's'}
              </Typography>
            </Tooltip>
          </Box>

          {/* Grouped by nest — one block per physical plate. A flat list of
              ninety parts against a material cannot answer "what comes off
              this plate", which is the question actually asked at the table. */}
          <Box sx={{ px: 2, py: 0.5 }}>
            {m.nests.map((nest) => (
              <Box key={nest.key} sx={{ py: 0.75, borderBottom: '0.5px solid var(--c-divider)', '&:last-child': { borderBottom: 'none' } }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>
                    {nest.nestNo ?? 'un-nested'}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                    {nest.nestNo
                      ? `${nest.parts.length} part${nest.parts.length === 1 ? '' : 's'} off this piece`
                      : 'not assigned to a nest'}
                    {nest.qty != null ? ` · ${Number(nest.qty.toFixed(3))} ${m.unit ?? ''}` : ''}
                  </Typography>
                  {nest.issued && (
                    <Tooltip title="This plate has already been drawn from stock. The other parts on it start without drawing anything more.">
                      <Typography sx={{ fontSize: 11, color: 'var(--c-success-700, #1a7f37)', fontWeight: 600 }}>
                        drawn
                      </Typography>
                    </Tooltip>
                  )}
                </Box>
                {nest.parts.map((p) => (
                  <Box key={p.linkId} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.4, pl: 1.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text)', flex: 1, minWidth: 140 }}>
                      {p.partName}
                    </Typography>
                    {p.partCode && (
                      <Tooltip title={p.partCode}>
                        <Typography sx={{
                          fontFamily: 'monospace', fontSize: 11.5, color: 'var(--c-text-3)',
                          maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {p.partCode}
                        </Typography>
                      </Tooltip>
                    )}
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 88, textAlign: 'right' }}>
                      {p.partQty} off
                    </Typography>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Surface>
      ))}
    </Box>
  );
}
