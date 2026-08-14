/**
 * OrderProduction.tsx — the make side of the order, as a document.
 *
 * ONE production order per sales order. The BOM already carries the detail of
 * every plate and stiffener; this tracks the job those add up to.
 *
 * It OWNS the task DAG through `production_order_id` on each task rather than
 * by the tasks being re-parented — `fab_project_tasks.order_id` still points at
 * the sales order, because critical chain, dispatch, buffers, the shift log and
 * a dozen other things reach order dates and priority through it. What that
 * means here: raising the order claims its tasks, and building more tasks later
 * leaves them unclaimed until it is pressed again. The step says so rather than
 * pretending the number is always right.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, LinearProgress, Typography,
} from '@mui/material';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';

import { Surface, EmptyState, ListSkeleton, useToast, backendMessage, Mono } from '../components';
import { fetchProduction, raiseProduction, type ProductionView } from '../api/procurementOrders';

export default function OrderProduction({ orderId, canManage, onChanged }: {
  orderId: number;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [view, setView] = useState<ProductionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      setView(await fetchProduction(orderId));
    } catch (e) {
      setError(backendMessage(e, 'Could not load the production order.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function raise() {
    setBusy(true); setError('');
    try {
      const res = await raiseProduction(orderId);
      toast(res.created
        ? `Production order ${res.orderNumber} raised — ${res.tasksClaimed} task(s)`
        : `${res.tasksClaimed} new task(s) added to ${res.orderNumber}`, 'success');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not raise the production order.'));
    } finally { setBusy(false); }
  }

  if (loading) return <ListSkeleton rows={3} />;

  const mo = view?.production ?? null;
  const makeItems = view?.makeItemCount ?? 0;

  if (makeItems === 0 && !mo) {
    return (
      <EmptyState
        icon={<PrecisionManufacturingRounded />}
        title="Nothing to make"
        hint="Every row in this order's BOM is bought in. There is no production order to raise."
      />
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {!mo ? (
        <Surface e={1} sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 14, mb: 0.5 }}>No production order yet</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 2 }}>
            {makeItems} item(s) in this order are made here. Raising the production order gives that
            work its own document and puts the task tree under it.
          </Typography>
          <Button
            variant="contained" size="small" disabled={!canManage || busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PrecisionManufacturingRounded />}
            onClick={raise}
          >
            Raise production order
          </Button>
        </Surface>
      ) : (
        <>
          <Surface e={1} sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
              <Mono chip>{mo.orderNumber}</Mono>
              <Chip
                size="small" variant="outlined"
                label={String(mo.status).replace(/_/g, ' ')}
                color={mo.status === 'completed' ? 'success'
                  : mo.status === 'in_production' ? 'warning' : 'default'}
              />
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontFamily: 'monospace' }}>
                {mo.tasks.done} / {mo.tasks.total} tasks done
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.max(0, Math.min(100, mo.progressPct))}
              sx={{ height: 6, borderRadius: 3 }}
            />
            <Box sx={{ display: 'flex', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
              {[
                ['In progress', mo.tasks.active],
                ['Blocked', mo.tasks.blocked],
                ['Remaining', Math.max(0, mo.tasks.total - mo.tasks.done)],
              ].map(([label, n]) => (
                <Box key={String(label)}>
                  <Typography sx={{
                    fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em',
                    textTransform: 'uppercase', color: 'var(--c-text-3)',
                  }}>
                    {label}
                  </Typography>
                  <Typography sx={{ fontSize: 16, fontFamily: 'monospace' }}>{n}</Typography>
                </Box>
              ))}
            </Box>
          </Surface>

          {/* Tasks built after the order was raised do not join it by themselves.
              Saying so beats a count that is quietly out of date. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button size="small" disabled={!canManage || busy} onClick={raise}
              startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Re-claim tasks
            </Button>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', maxWidth: 560 }}>
              Rebuilding the project tree adds tasks that this order does not know about yet.
              Re-claiming brings them in; it never creates a second production order.
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}
