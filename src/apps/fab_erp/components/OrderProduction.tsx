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
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';

import { fabQuery } from '../api/client';
import { Surface, EmptyState, ListSkeleton, useToast, backendMessage, Mono } from '../components';
import { fieldGapOf, type FieldGap } from '../api/fieldReadiness';
import {
  fetchProduction, raiseProduction, approveProduction, fetchNestingIntegrity,
  type ProductionView, type NestingIssue,
} from '../api/procurementOrders';

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
  /** A FIELDS_MISSING refusal, held so it can be shown as a list rather than a string. */
  const [fieldGap, setFieldGap] = useState<FieldGap | null>(null);
  /**
   * The nesting problems that refused this raise. Same shape and same source as
   * the list Procurement shows — see the guard in `raise`.
   */
  const [nestingGap, setNestingGap] = useState<NestingIssue[] | null>(null);
  /** Set once somebody has pressed "Raise anyway" past the nesting problems. */
  const [nestingOverride, setNestingOverride] = useState(false);
  /** True when the nesting could not be checked at all, so nothing is claimed about it. */
  const [nestingUnchecked, setNestingUnchecked] = useState(false);
  /**
   * How many BOM rows this order has AT ALL — the difference between "nothing
   * to make" and "nothing here yet". `null` means it could not be read.
   */
  const [itemTotal, setItemTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [v, total] = await Promise.all([
        fetchProduction(orderId),
        // includeTotal, not data.length: the page size is not the count.
        fabQuery<{ total?: number }>('fabErpItem', {
          fields: ['id'], filters: { orderId }, pagination: { limit: 1 }, includeTotal: true,
        }).then((r) => r.total ?? 0).catch(() => null),
      ]);
      setView(v); setItemTotal(total);
    } catch (e) {
      setError(backendMessage(e, 'Could not load the production order.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setNestingGap(null); setNestingOverride(false); setNestingUnchecked(false);
  }, [orderId]);

  async function approve() {
    if (!view?.production) return;
    setBusy(true); setError('');
    try {
      const st = await approveProduction(view.production.id);
      toast(st?.status === 'in_production'
        ? 'Approved — material is in stock, so it is in production'
        : 'Approved — waiting for material', 'success');
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not approve the production order.'));
    } finally { setBusy(false); }
  }

  /**
   * Raise (or re-claim onto) the production order.
   *
   * THE NESTING GATE. Procurement already refuses to buy against a nesting that
   * cannot be cut, and this step happily built 84 tasks against the identical
   * unresolved errors — same data, opposite answer. Putting work on the shop
   * floor for a part that cannot come off the plate it names is not cheaper
   * than buying the wrong steel for it; it is the same mistake one step later,
   * and by then it is on a cutting list.
   *
   * The answer comes from the SAME endpoint the procurement gate uses
   * (`/orders/:id/nesting/integrity`, documented server-side as "the same
   * answer the raise gate uses"), and from its `blocking` array rather than a
   * locally-chosen subset — a second opinion about which issues count is
   * exactly how the two steps came to disagree in the first place.
   *
   * Checked at press time, not at load: the list is only authoritative at the
   * moment of the act, and somebody may have fixed the nesting in another tab.
   *
   * Refused, not blocked — `Raise anyway` is a deliberate second act, the same
   * escape Procurement's "Order anyway" offers.
   */
  async function raise({ force = false, ignoreNesting = false } = {}) {
    if (!(ignoreNesting || nestingOverride)) {
      setBusy(true);
      try {
        const integrity = await fetchNestingIntegrity(orderId);
        setNestingUnchecked(false);
        const blocking = integrity.blocking ?? [];
        if (blocking.length > 0) {
          // `finally` clears busy on the way out of this return.
          setNestingGap(blocking); setFieldGap(null); setError('');
          return;
        }
      } catch {
        // Cannot check (no inventory permission, or the check itself failed).
        // Refusing on an answer we do not have would be worse than proceeding
        // and saying so, so the raise goes ahead and the note stays up.
        setNestingUnchecked(true);
      } finally { setBusy(false); }
    }
    setNestingGap(null);
    setBusy(true); setError(''); if (force) setFieldGap(null);
    try {
      // The nesting override must travel to the SERVER, not just past the
      // check above — the endpoint enforces the same gate, so a local-only
      // override left "Raise anyway" refused with nothing further to press.
      const res = await raiseProduction(orderId, force, ignoreNesting || nestingOverride);
      toast(res.created
        ? `${res.orderNumber} raised — ${res.tasksMaterialized} task(s) built`
        : `${res.tasksClaimed} new task(s) added to ${res.orderNumber}`, 'success');
      setFieldGap(null);
      await load(); onChanged?.();
    } catch (e) {
      /**
       * A 409 FIELDS_MISSING is an ANSWER, not a failure — the order can be
       * raised, it just should not be yet. Showing it as a red error string
       * would hide the one thing that makes it actionable: which parts, and
       * which values. Raising anyway stays available, because a shop that knows
       * its estimate is rough may still want the tasks.
       */
      const gap = fieldGapOf(e);
      if (gap) setFieldGap(gap);
      else setError(backendMessage(e, 'Could not raise the production order.'));
    } finally { setBusy(false); }
  }

  if (loading) return <ListSkeleton rows={3} />;

  const mo = view?.production ?? null;
  const makeItems = view?.makeItemCount ?? 0;

  /**
   * Why there is nothing to make, said accurately.
   *
   * "Every row in this order's BOM is bought in" was shown on orders with no
   * BOM at all — at the same moment Procurement was asserting the exact
   * opposite about the same order. Neither claim was true; there was simply
   * nothing there yet, which is a third thing and now says so.
   */
  if (makeItems === 0 && !mo) {
    return (
      <EmptyState
        icon={<PrecisionManufacturingRounded />}
        title={itemTotal === 0 ? 'Nothing in this order yet' : 'Nothing to make'}
        hint={itemTotal === 0
          ? 'This order has no BOM rows, so there is no work to plan. Build the structure on the '
            + 'Structure step and what has to be made will appear here.'
          : itemTotal == null
            ? 'No row in this order’s BOM is made here, so there is no production order to raise.'
            : `All ${itemTotal} row(s) in this order’s BOM are bought in, so there is nothing to make.`}
      />
    );
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Refused because the parts cannot physically be cut. Identical in
          shape and wording to the refusal Procurement shows, because it is the
          same list from the same check — the two steps disagreeing about the
          same order is the bug this closes. */}
      {nestingGap && nestingGap.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNestingGap(null)}>
          <Typography sx={{ fontWeight: 600, fontSize: 13.5, mb: 0.5 }}>
            {nestingGap.length} problem(s) would make this order’s nesting impossible to cut.
            Building tasks against it would put work on the floor for parts nobody can make.
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5 }}>
            {nestingGap.slice(0, 10).map((i, n) => <li key={n}>{i.message}</li>)}
          </Box>
          {nestingGap.length > 10 && (
            <Typography sx={{ fontSize: 12, mt: 0.5 }}>…and {nestingGap.length - 10} more.</Typography>
          )}
          <Button
            size="small" sx={{ mt: 1 }} disabled={!canManage || busy}
            onClick={() => { setNestingOverride(true); void raise({ ignoreNesting: true }); }}
          >
            Raise anyway
          </Button>
        </Alert>
      )}

      {nestingUnchecked && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNestingUnchecked(false)}>
          This order’s nesting could not be checked, so nothing here says whether its parts can
          actually be cut. Procurement runs the same check and will say if it can reach it.
        </Alert>
      )}

      {/* Not an error — a reason. Raising the order is what evaluates and
          FREEZES every formula onto its task, so a part missing a value gets a
          duration of zero and everything after inherits it: capacity, the
          critical chain, the buffer, the promised date. */}
      {fieldGap && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setFieldGap(null)}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>{fieldGap.message}</Typography>

          {fieldGap.detail?.missingValues?.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mb: 0.25 }}>
                Parts missing a value — fill these in on the Items / BOM tab:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5 }}>
                {fieldGap.detail.missingValues.slice(0, 12).map((v) => (
                  <li key={v.itemId}>
                    {v.itemCode ? <Mono>{v.itemCode}</Mono> : v.itemName}
                    {' — '}{v.missing.join(', ')}
                  </li>
                ))}
              </Box>
              {fieldGap.detail.missingValues.length > 12 && (
                <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  …and {fieldGap.detail.missingValues.length - 12} more
                </Typography>
              )}
            </Box>
          )}

          {/* Kept separate on purpose: no amount of filling in parts fixes a
              formula that names a field which does not exist. */}
          {fieldGap.detail?.unknownFields?.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', mb: 0.25 }}>
                Operations whose formula names a field that does not exist — fix these in Operations:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5 }}>
                {fieldGap.detail.unknownFields.map((u) => (
                  <li key={u.operationId}>{u.operationName} — <Mono>{u.keys.join(', ')}</Mono></li>
                ))}
              </Box>
            </Box>
          )}

          <Button size="small" disabled={busy} onClick={() => void raise({ force: true })} sx={{ mt: 0.5 }}>
            Raise anyway
          </Button>
        </Alert>
      )}

      {!mo ? (
        <Surface e={1} sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ fontSize: 14, mb: 0.5 }}>No production order yet</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 2 }}>
            {makeItems} item(s) in this order are made here. Raising the production order builds the
            task tree and puts it under that order — it starts as a draft, and stays one until
            somebody approves it.
          </Typography>
          <Button
            variant="contained" size="small" disabled={!canManage || busy}
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <PrecisionManufacturingRounded />}
            onClick={() => void raise()}
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

          {/* Approval is the one transition a person makes; everything after it
              follows from the shop floor. A draft says so plainly rather than
              looking like an order that is simply not moving. */}
          {mo.status === 'draft' && (
            <Alert severity="info" sx={{ mb: 2 }}
              action={(
                <Button size="small" variant="contained" disabled={!canManage || busy}
                  onClick={approve}
                  startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckCircleRounded />}>
                  Approve
                </Button>
              )}>
              This order is a draft — the work is planned but nobody has committed to it. Approving
              moves it to waiting, or straight into production if its material is already in stock.
            </Alert>
          )}
          {mo.status === 'waiting' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Approved, and waiting for material. Every task is still blocked; the moment the first
              raw material it needs is received, this moves to in production on its own.
            </Alert>
          )}

          {/* Tasks built after the order was raised do not join it by themselves.
              Saying so beats a count that is quietly out of date. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button size="small" disabled={!canManage || busy} onClick={() => void raise()}
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
