/**
 * OrderProcurement.tsx — what this order has to buy, and whether we have it.
 *
 * One row per bought-in catalog item. The number that matters is SHORT:
 * required minus what is actually free, which is not the same as what is on the
 * shelf. Stock another order has already earmarked is not available to this
 * one, and a shortfall computed without that is how two orders both get told
 * the same plate is theirs.
 *
 * Deliberately a preview and then a commit, like Dispatch. The shortfall moves
 * — stock arrives, other orders reserve, the BOM changes — so what gets ordered
 * is the list somebody looked at and approved, not whatever the number happened
 * to be at the moment of pressing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import InventoryRounded from '@mui/icons-material/Inventory2Rounded';

import { fabQuery } from '../api/client';
import { Surface, EmptyState, ListSkeleton, useToast, backendMessage, Mono } from '../components';
import {
  fetchProcurement, raiseProcurement, receiveAgainstLine,
  type ProcurementView, type ShortfallLine, type PurchaseOrderRow,
} from '../api/procurementOrders';

interface SupplierOption { id: number; code: string; name: string; leadTimeDays?: number | null }
interface LocationOption { id: number; name: string; plantId: number | null }

const num = (v: unknown) => Number(v ?? 0);

export default function OrderProcurement({ orderId, canManage, onChanged }: {
  orderId: number;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [view, setView] = useState<ProcurementView | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Chosen supplier per catalog item. Nothing is guessed — see the raise guard. */
  const [supplierFor, setSupplierFor] = useState<Record<number, number | ''>>({});
  const [receiving, setReceiving] = useState<{ poId: number; lineId: number; code: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [v, sup] = await Promise.all([
        fetchProcurement(orderId),
        fabQuery<{ data: SupplierOption[] }>('fabErpSupplier', {
          filters: { active: 1 },
          orderBy: [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 500 },
        }).then((r) => r.data ?? []).catch(() => []),
      ]);
      setView(v); setSuppliers(sup);
    } catch (e) {
      setError(backendMessage(e, 'Could not work out what this order needs.'));
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  /**
   * How much to buy of each line.
   *
   * Defaults to the computed shortfall, but is editable — including on lines
   * the system thinks are fully covered. "Covered by stock" was previously
   * inert text with no control beside it, so an operator who knew the match was
   * wrong (the right thickness but the wrong size plate, material earmarked for
   * a job the system does not know about, stock that has been scrapped but not
   * written off) had no way to buy it anyway short of leaving the app.
   */
  const [buyQty, setBuyQty] = useState<Record<number, string>>({});
  const qtyFor = useCallback(
    (l: { catalogItemId: number; short: number }) => {
      const typed = buyQty[l.catalogItemId];
      if (typed === undefined || typed.trim() === '') return l.short;
      const n = Number(typed);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    [buyQty],
  );

  /** Anything with a supplier chosen and a quantity above zero. */
  const ready = useMemo(
    () => (view?.lines ?? []).filter(
      (l) => supplierFor[l.catalogItemId] && qtyFor(l) > 0,
    ),
    [view, supplierFor, qtyFor],
  );

  /** Genuinely short, and nobody picked to buy it from — the case worth naming. */
  const shortWithoutSupplier = useMemo(
    () => (view?.lines ?? []).filter((l) => l.short > 0 && !supplierFor[l.catalogItemId]).length,
    [view, supplierFor],
  );

  async function raise() {
    if (!ready.length) return;
    setBusy(true); setError('');
    try {
      const res = await raiseProcurement(orderId, ready.map((l) => ({
        catalogItemId: l.catalogItemId,
        qty: qtyFor(l),
        supplierId: Number(supplierFor[l.catalogItemId]),
      })));
      const made = res.orders.length;
      toast(made
        ? `${made} purchase order(s) raised${res.skipped.length ? `, ${res.skipped.length} line(s) skipped` : ''}`
        : 'Nothing ordered', made ? 'success' : 'info');
      if (res.skipped.length) {
        setError(`Not ordered: ${res.skipped.map((s) => s.reason).join('; ')}`);
      }
      await load(); onChanged?.();
    } catch (e) {
      setError(backendMessage(e, 'Could not raise the purchase orders.'));
    } finally { setBusy(false); }
  }

  if (loading) return <ListSkeleton rows={5} />;

  const lines = view?.lines ?? [];

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {view && view.unmatched.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {view.unmatched.length} bought-in row(s) name no catalog item, so they cannot be checked
          against stock or purchased. Bind them to a catalog item on the BOM tab.
        </Alert>
      )}

      {lines.length === 0 ? (
        <EmptyState
          icon={<InventoryRounded />}
          title="Nothing to buy"
          hint="Every row in this order's BOM is made here. There is no procurement step to complete."
        />
      ) : (
        <Surface e={1} sx={{ p: 0, mb: 2, overflowX: 'auto' }}>
          <Box component="table" sx={{
            width: '100%', borderCollapse: 'collapse', fontSize: 13,
            '& th': {
              textAlign: 'left', px: 1.5, py: 1, fontSize: 10.5, fontWeight: 600,
              letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)',
              borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
            },
            '& td': { px: 1.5, py: 1, borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' },
            '& td.n': { textAlign: 'right', fontFamily: 'monospace' },
          }}>
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: 'right' }}>Required</th>
                <th style={{ textAlign: 'right' }}>On hand</th>
                <th style={{ textAlign: 'right' }}>Reserved</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th style={{ textAlign: 'right' }}>Short</th>
                <th>Buy from</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: ShortfallLine) => (
                <tr key={l.catalogItemId}>
                  <td>
                    <Mono chip>{l.code ?? '—'}</Mono>
                    <Typography component="span" sx={{ ml: 1, fontSize: 12.5, color: 'var(--c-text-2)' }}>
                      {l.name}
                    </Typography>
                    {/* The sizes nesting actually asked for. Without this the
                        row is one number for "20mm plate" and there is no way
                        to see that the pieces on the shelf are the wrong size
                        for the nest that needs them. */}
                    {(l.sizes ?? []).filter((s) => s.sized).length > 0 && (
                      <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(l.sizes ?? []).filter((s) => s.sized).map((s, i) => (
                          <Tooltip
                            key={i}
                            title={(s.short ?? 0) > 0
                              ? `Need ${num(s.required)} at this size, ${num(s.onHand)} in stock at exactly this size`
                              : `Covered: ${num(s.onHand)} in stock at exactly this size`}
                          >
                            <Box
                              component="span"
                              sx={{
                                fontSize: 11, fontFamily: 'var(--font-mono)', px: 0.75, py: 0.25,
                                borderRadius: '4px', border: '1px solid var(--c-border)',
                                color: (s.short ?? 0) > 0 ? 'var(--c-warn-fg, #8a5a00)' : 'var(--c-text-3)',
                              }}
                            >
                              {[s.thick, s.length, s.width].map((v) => (v ?? '?')).join('×')}
                              {' · '}{num(s.onHand)}/{num(s.required)}
                            </Box>
                          </Tooltip>
                        ))}
                      </Box>
                    )}
                    {(l.unsizedOnHand ?? 0) > 0 && (
                      <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.25 }}>
                        {num(l.unsizedOnHand ?? 0)} in stock with no size recorded — not counted as a match
                      </Typography>
                    )}
                  </td>
                  <td className="n">{num(l.required)}</td>
                  <td className="n">{num(l.onHand)}</td>
                  <td className="n">
                    <Tooltip title="Held by other orders. This order's own holding is not counted here.">
                      <span>{num(l.reserved)}</span>
                    </Tooltip>
                  </td>
                  <td className="n">{num(l.available)}</td>
                  <td className="n">
                    {l.short > 0
                      ? <Box component="span" sx={{ color: 'var(--c-warn-fg, #8a5a00)', fontWeight: 600 }}>{num(l.short)}</Box>
                      : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>}
                  </td>
                  {/* Buy from — offered on EVERY line, not only short ones.
                      A covered line still gets a supplier and a quantity so an
                      operator who knows the match is wrong can order anyway. */}
                  <td>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
                      <TextField
                        size="small" type="number" label="Qty" sx={{ width: 92 }}
                        slotProps={{ inputLabel: { shrink: true } }}
                        inputProps={{ min: 0, step: 'any' }}
                        placeholder={String(l.short)}
                        value={buyQty[l.catalogItemId] ?? ''}
                        disabled={!canManage}
                        onChange={(e) => setBuyQty((q) => ({ ...q, [l.catalogItemId]: e.target.value }))}
                      />
                      <TextField
                        select size="small" sx={{ minWidth: 190 }}
                        value={supplierFor[l.catalogItemId] ?? ''}
                        disabled={!canManage}
                        helperText={l.short > 0 ? ' ' : 'Covered by stock — order anyway if you need to'}
                        onChange={(e) => setSupplierFor((s) => ({
                          ...s, [l.catalogItemId]: e.target.value === '' ? '' : Number(e.target.value),
                        }))}
                      >
                        <MenuItem value="">— choose a supplier —</MenuItem>
                        {suppliers.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.name}{s.leadTimeDays ? `  (${s.leadTimeDays}d)` : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Surface>
      )}

      {/* Shown whenever there is anything to buy from, not only when something
          is short — a covered line can now be ordered deliberately. */}
      {lines.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Button
            variant="contained" size="small"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <ShoppingCartRounded />}
            disabled={!canManage || busy || ready.length === 0}
            onClick={raise}
          >
            Reserve stock and raise {ready.length || ''} purchase order{ready.length === 1 ? '' : 's'}
          </Button>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', maxWidth: 560 }}>
            {shortWithoutSupplier > 0
              ? `${shortWithoutSupplier} short item(s) still have no supplier — those are left alone rather than ordered from nobody.`
              : 'Stock that can cover this order is earmarked for it at the same time, so another order cannot take it.'}
          </Typography>
        </Box>
      )}

      {(view?.purchaseOrders?.length ?? 0) > 0 && (
        <>
          <Typography sx={{
            fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
            textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 1,
          }}>
            Purchase orders raised
          </Typography>
          {view!.purchaseOrders.map((po: PurchaseOrderRow) => (
            <Surface key={po.id} e={1} sx={{
              p: 1.5, mb: 1, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <Mono chip>{po.order_number}</Mono>
              <Typography sx={{ fontSize: 13 }}>{po.supplier_name ?? '—'}</Typography>
              <Chip
                size="small"
                label={String(po.status).replace(/_/g, ' ')}
                color={po.status === 'received' ? 'success' : po.status === 'cancelled' ? 'default' : 'warning'}
                variant="outlined"
              />
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontFamily: 'monospace' }}>
                {num(po.qty_received)} / {num(po.qty_ordered)} received
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small" disabled={!canManage || po.status === 'received'}
                onClick={() => setReceiving({ poId: po.id, lineId: 0, code: po.order_number })}
              >
                Receive
              </Button>
            </Surface>
          ))}
        </>
      )}

      {receiving && (
        <ReceiveDialog
          po={receiving}
          onClose={() => setReceiving(null)}
          onDone={async () => { setReceiving(null); await load(); onChanged?.(); toast('Stock received'); }}
          onError={(m) => setError(m)}
        />
      )}
    </Box>
  );
}

/**
 * Receiving is per LINE, not per order: a delivery is a quantity of one item
 * arriving, and which line it closes is the whole point of ordering against a
 * document. The dialog therefore asks which line first.
 */
function ReceiveDialog({ po, onClose, onDone, onError }: {
  po: { poId: number; code: string };
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [lines, setLines] = useState<Array<{
    id: number; code: string | null; qty: number; qtyReceived: number;
  }>>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [lineId, setLineId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [qty, setQty] = useState('');
  const [heat, setHeat] = useState('');
  // The PIECE's size. Procurement matches a nest against stock of exactly this
  // size, so a receipt with no size recorded can never satisfy a sized nest —
  // it is optional, but leaving it blank is what makes stock unmatchable.
  const [lenMm, setLenMm] = useState('');
  const [widMm, setWidMm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fabQuery<{ data: Array<{ id: number; code: string | null; qty: number; qtyReceived: number }> }>(
      'fabErpOrderLine',
      { filters: { orderId: po.poId }, orderBy: [{ field: 'lineNo', direction: 'asc' }], pagination: { limit: 200 } },
    ).then((r) => {
      const rows = r.data ?? [];
      setLines(rows);
      const open = rows.find((l) => Number(l.qtyReceived) < Number(l.qty));
      if (open) setLineId(open.id);
    }).catch(() => setLines([]));

    fabQuery<{ data: LocationOption[] }>('fabErpStockLocation', {
      orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 },
    }).then((r) => {
      const rows = r.data ?? [];
      setLocations(rows);
      if (rows.length === 1) setLocationId(rows[0].id);
    }).catch(() => setLocations([]));
  }, [po.poId]);

  const chosen = lines.find((l) => l.id === lineId) ?? null;
  const location = locations.find((l) => l.id === locationId) ?? null;
  const outstanding = chosen ? Number(chosen.qty) - Number(chosen.qtyReceived) : 0;

  async function submit() {
    if (!chosen || !location || !(Number(qty) > 0)) return;
    setBusy(true);
    try {
      await receiveAgainstLine(chosen.id, {
        plant_id: Number(location.plantId),
        stock_location_id: Number(location.id),
        received_date: new Date().toISOString().slice(0, 10),
        pieces: [{
          qty: Number(qty),
          heat_no: heat.trim() || undefined,
          length_mm: lenMm.trim() ? Number(lenMm) : undefined,
          width_mm: widMm.trim() ? Number(widMm) : undefined,
        }],
      });
      onDone();
    } catch (e) {
      onError(backendMessage(e, 'Could not receive that delivery.'));
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Receive against {po.code}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <TextField select size="small" label="Line" value={lineId}
          onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}>
          {lines.map((l) => (
            <MenuItem key={l.id} value={l.id}>
              {l.code ?? `Line ${l.id}`} — {Number(l.qtyReceived)}/{Number(l.qty)} received
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Into stock area" value={locationId}
          onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}>
          {locations.map((l) => <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>)}
        </TextField>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField size="small" type="number" label="Quantity" value={qty} sx={{ width: 140 }}
            helperText={chosen ? `${outstanding} outstanding` : ' '}
            onChange={(e) => setQty(e.target.value)} />
          <TextField size="small" label="Heat / batch no" value={heat} sx={{ flex: 1 }}
            helperText="Kept per piece for traceability"
            onChange={(e) => setHeat(e.target.value)} />
        </Box>
        {/* Size is what makes this piece matchable. Procurement compares a nest
            against stock of exactly this size, so a plate received with no size
            can never satisfy a sized nest — it will keep showing as short. */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <TextField size="small" type="number" label="Length (mm)" value={lenMm} sx={{ width: 160 }}
            onChange={(e) => setLenMm(e.target.value)} />
          <TextField size="small" type="number" label="Width (mm)" value={widMm} sx={{ width: 160 }}
            onChange={(e) => setWidMm(e.target.value)} />
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', flex: 1, pt: 1 }}>
            The plate's own size. Thickness comes from the item itself. Leave blank only if
            you genuinely do not know — unsized stock cannot be matched to a nest.
          </Typography>
        </Box>
        {Number(qty) > outstanding && outstanding > 0 && (
          <Alert severity="info">
            That is more than the {outstanding} still outstanding. Over-receipt is allowed — suppliers
            really do send more than was ordered — and the line will simply close.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" disabled={busy || !chosen || !location || !(Number(qty) > 0)}
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
          onClick={submit}
        >
          Receive
        </Button>
      </DialogActions>
    </Dialog>
  );
}
