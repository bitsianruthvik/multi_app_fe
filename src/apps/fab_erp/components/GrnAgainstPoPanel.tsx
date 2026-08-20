/**
 * GrnAgainstPoPanel — the goods receipt half of the Stock in screen.
 *
 * Stock in was built as "no purchase order, no supplier, no receipt document":
 * material turns up, somebody types what and where. That is the right screen
 * for steel bought off the shelf, and the wrong one for a lorry arriving
 * against a PO — the person at the gate is holding a delivery note with an
 * order number on it and quantities per line, and retyping each item by hand
 * loses the one fact worth recording, which is WHICH LINE this closes.
 *
 * So: pick the order, and the lines come with it. Ordered and already-received
 * are shown per line so "how much of this has come" is answered against what is
 * actually outstanding, and outstanding is prefilled as the common case (the
 * whole line arrived) while staying editable for the common exception (part of
 * it did).
 *
 * A blank quantity means NOT RECEIVED, not zero. A delivery note routinely
 * covers part of an order, and leaving rows blank is how somebody says so.
 *
 * The whole note posts as ONE transaction — see receiveAgainstOrder. Booking
 * three of five lines and then failing would leave stock on the shelf with no
 * record of which lines it closed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, MenuItem, TextField, Typography,
} from '@mui/material';

import { fabQuery } from '../api/client';
import {
  fetchPurchaseOrders, fetchPurchaseOrderLines, receiveAgainstOrder,
  type OpenPurchaseOrder, type PurchaseOrderLine,
} from '../api/procurementOrders';
import {
  SectionCard, StickyActionBar, Surface, Mono, EmptyState, ListSkeleton, useToast, backendMessage,
} from '../components';

interface PlantRow { id: number; name: string; code: string | null }
interface LocationRow { id: number; name: string; code: string | null; plantId: number | null }
interface MachineRow { id: number; stockLocationId: number | null }

/** What the user typed against one line. Blank qty = not received. */
interface LineEntry { qty: string; heatNo: string }

const num = (v: unknown) => Number(v ?? 0);
const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))));

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function GrnAgainstPoPanel({ plants, locations, onReceived }: {
  plants: PlantRow[];
  locations: LocationRow[];
  /** Refresh the recent-receipts list on the page behind. */
  onReceived: () => void;
}) {
  const { toast } = useToast();

  const [orders, setOrders] = useState<OpenPurchaseOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [po, setPo] = useState<OpenPurchaseOrder | null>(null);

  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [entries, setEntries] = useState<Record<number, LineEntry>>({});

  const [plantId, setPlantId] = useState<number | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  /**
   * Stock areas that belong to a machine. `null` while unknown.
   *
   * A machine's own area is where its work in process sits — nothing bought
   * from a supplier lands there, and offering one on a goods receipt is how
   * purchased plate ends up recorded as WIP on a cutter.
   *
   * The discriminator is the LINK, not the name: `fab_resources.stock_location_id`
   * is a machine's area, and it is the same column `fab_resource_stock_areas`
   * (role 'wip') was backfilled from in the catalog-unification migration. No
   * string matching on "WIP" — a shop is free to call the area anything.
   */
  const [machineAreaIds, setMachineAreaIds] = useState<Set<number> | null>(null);
  const [receivedDate, setReceivedDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      setOrders(await fetchPurchaseOrders());
    } catch (e) {
      setErr(backendMessage(e, 'Could not load purchase orders.'));
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Preselect when there is no decision to make.
  useEffect(() => {
    if (plantId === '' && plants.length === 1) setPlantId(plants[0].id);
  }, [plants, plantId]);

  // Which areas belong to a machine. Failing to answer must not block a
  // delivery, so an error leaves the list exactly as it was before.
  useEffect(() => {
    let cancelled = false;
    fabQuery<{ data: MachineRow[] }>('fabErpResource', { pagination: { limit: 1000 } })
      .then((res) => {
        if (cancelled) return;
        setMachineAreaIds(new Set(
          (res.data ?? [])
            .map((r) => r.stockLocationId)
            .filter((id): id is number => typeof id === 'number'),
        ));
      })
      .catch(() => { if (!cancelled) setMachineAreaIds(new Set()); });
    return () => { cancelled = true; };
  }, []);

  const plantLocations = useMemo(
    () => locations.filter((l) => plantId === '' || l.plantId === plantId),
    [locations, plantId],
  );

  const hiddenMachineAreas = useMemo(
    () => (machineAreaIds ? plantLocations.filter((l) => machineAreaIds.has(l.id)) : []),
    [plantLocations, machineAreaIds],
  );

  /**
   * The areas a purchase receipt may actually go into.
   *
   * Falls back to the whole list if the rule would leave nothing to pick — a
   * shop whose every area is attached to a machine still has to be able to
   * book a delivery, and an empty required dropdown is a dead end.
   */
  const receivableLocations = useMemo(() => {
    if (!hiddenMachineAreas.length) return plantLocations;
    const kept = plantLocations.filter((l) => !machineAreaIds!.has(l.id));
    return kept.length ? kept : plantLocations;
  }, [plantLocations, hiddenMachineAreas, machineAreaIds]);

  // Changing plant invalidates a stock area chosen under the old one — as does
  // learning, a moment after mount, that the one showing is a machine's.
  useEffect(() => {
    if (locationId !== '' && !receivableLocations.some((l) => l.id === locationId)) setLocationId('');
    if (locationId === '' && receivableLocations.length === 1) setLocationId(receivableLocations[0].id);
  }, [receivableLocations, locationId]);

  /**
   * Load the chosen order's lines, prefilled with what is outstanding.
   *
   * Prefilled rather than blank because the whole line arriving is the ordinary
   * case, and a screen that makes the ordinary case the most typing is a screen
   * people stop using. A line with nothing outstanding starts blank: it is
   * already closed, and pre-filling zero would say it arrived again.
   */
  useEffect(() => {
    if (!po) { setLines([]); setEntries({}); return; }
    let cancelled = false;
    setLoadingLines(true); setErr('');
    fetchPurchaseOrderLines(po.id)
      .then((rows) => {
        if (cancelled) return;
        setLines(rows);
        setEntries(Object.fromEntries(rows.map((l) => [
          l.id,
          { qty: l.outstanding > 0 ? trim(l.outstanding) : '', heatNo: '' },
        ])));
      })
      .catch((e) => { if (!cancelled) setErr(backendMessage(e, 'Could not load that order’s lines.')); })
      .finally(() => { if (!cancelled) setLoadingLines(false); });
    return () => { cancelled = true; };
  }, [po]);

  const setEntry = (lineId: number, patch: Partial<LineEntry>) =>
    setEntries((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));

  /** Lines the user has actually put a quantity against. */
  const toReceive = useMemo(
    () => lines.filter((l) => num(entries[l.id]?.qty) > 0),
    [lines, entries],
  );
  const qtyTotal = useMemo(
    () => toReceive.reduce((a, l) => a + num(entries[l.id]?.qty), 0),
    [toReceive, entries],
  );
  /** Lines with no catalog item cannot go on a shelf — flagged, never silently skipped. */
  const unbookable = useMemo(
    () => toReceive.filter((l) => l.catalog_item_id == null),
    [toReceive],
  );

  function validate(): string | null {
    if (!po) return 'Pick the purchase order the delivery is against.';
    if (plantId === '') return 'Pick a plant.';
    if (locationId === '') return 'Pick the stock area it is going into.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)) return 'Received date is required.';
    if (!toReceive.length) return 'Enter a received quantity against at least one line.';
    if (unbookable.length) {
      return `${unbookable.length} line(s) name no catalog item, so they cannot be received. `
        + 'Clear their quantity, or bind them to an item first.';
    }
    if (lines.some((l) => entries[l.id]?.qty !== '' && !(num(entries[l.id]?.qty) >= 0))) {
      return 'Every received quantity must be a number — clear the ones that did not arrive.';
    }
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setSaving(true); setErr('');
    try {
      const res = await receiveAgainstOrder(po!.id, {
        plant_id: Number(plantId),
        stock_location_id: Number(locationId),
        received_date: receivedDate,
        notes: notes.trim() || null,
        lines: toReceive.map((l) => ({
          line_id: l.id,
          qty: num(entries[l.id]?.qty),
          heat_no: entries[l.id]?.heatNo.trim() || null,
        })),
      });

      // Say when work was actually unblocked — that is the point of recording
      // stock, and it is otherwise invisible until someone opens the queue.
      const freed = res.tasksCleared?.length ?? 0;
      toast(
        freed > 0
          ? `${res.orderNumber} received — ${freed} task${freed > 1 ? 's' : ''} unblocked.`
          : `${res.orderNumber} received.`,
        'success',
      );

      setNotes('');
      onReceived();
      await loadOrders();
      // Reload the lines so the outstanding figures reflect what just landed —
      // and so a partial delivery can be topped up without reselecting.
      if (res.poStatus === 'received') {
        setPo(null);
      } else {
        const rows = await fetchPurchaseOrderLines(po!.id);
        setLines(rows);
        setEntries(Object.fromEntries(rows.map((l) => [
          l.id, { qty: l.outstanding > 0 ? trim(l.outstanding) : '', heatNo: '' },
        ])));
      }
    } catch (e) {
      setErr(backendMessage(e, 'Could not record that delivery.'));
    } finally {
      setSaving(false);
    }
  }

  if (loadingOrders) return <ListSkeleton rows={4} />;

  if (orders.length === 0) {
    return (
      <SectionCard title="Receive against a purchase order">
        <EmptyState
          title="No open purchase orders"
          hint="Purchase orders are raised from a sales order's Procurement tab. Material bought without one goes in through Direct stock in."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Receive against a purchase order"
      subtitle="Pick the order on the delivery note, then say how much of each line arrived."
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {err && <Alert severity="error" onClose={() => setErr('')}>{err}</Alert>}

        <Autocomplete
          options={orders}
          value={po}
          onChange={(_, v) => setPo(v)}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          getOptionLabel={(o) => `${o.order_number} — ${o.supplier_name ?? 'no supplier'}`}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.id} sx={{ display: 'flex', gap: 1.5 }}>
              <Mono chip>{o.order_number}</Mono>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: 13.5 }}>{o.supplier_name ?? '— no supplier —'}</Box>
                <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                  {o.line_count} line{Number(o.line_count) === 1 ? '' : 's'} ·{' '}
                  {trim(num(o.qty_received))}/{trim(num(o.qty_ordered))} received
                  {o.source_order_number ? ` · for ${o.source_order_number}` : ''}
                </Box>
              </Box>
              <Chip size="small" variant="outlined" label={String(o.status).replace(/_/g, ' ')} />
            </Box>
          )}
          renderInput={(p) => <TextField {...p} label="Purchase order *" size="small" />}
          sx={{ maxWidth: 620 }}
        />

        {po && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                select label="Plant *" size="small" sx={{ flex: 1, minWidth: 200 }}
                value={plantId}
                onChange={(e) => setPlantId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {plants.map((p) => <MenuItem key={p.id} value={p.id}>{p.code ? `${p.code} — ${p.name}` : p.name}</MenuItem>)}
              </TextField>
              <TextField
                select label="Stock area *" size="small" sx={{ flex: 1, minWidth: 200 }}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
                disabled={plantId === ''}
                helperText={
                  plantId === ''
                    ? 'Pick a plant first'
                    : hiddenMachineAreas.length && receivableLocations.length < plantLocations.length
                      ? `${hiddenMachineAreas.length} machine work-in-progress area(s) not shown`
                      : ' '
                }
              >
                {receivableLocations.map((l) => <MenuItem key={l.id} value={l.id}>{l.code ? `${l.code} — ${l.name}` : l.name}</MenuItem>)}
              </TextField>
              <TextField
                label="Received *" type="date" size="small" sx={{ width: 180 }}
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                // Not cosmetic: this date orders FIFO consumption downstream.
                helperText="Drives FIFO"
              />
            </Box>

            <TextField
              label="Delivery note / notes" size="small" fullWidth
              value={notes} onChange={(e) => setNotes(e.target.value)}
            />

            {loadingLines ? (
              <ListSkeleton rows={3} />
            ) : lines.length === 0 ? (
              <Alert severity="warning">This purchase order has no lines.</Alert>
            ) : (
              <Surface e={1} sx={{ p: 0, overflowX: 'auto' }}>
                <Box component="table" sx={{
                  width: '100%', borderCollapse: 'collapse', fontSize: 13,
                  '& th': {
                    textAlign: 'left', px: 1.5, py: 1, fontSize: 10.5, fontWeight: 600,
                    letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--c-text-3)',
                    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  },
                  '& td': { px: 1.5, py: 0.75, borderBottom: '1px solid var(--c-border)', verticalAlign: 'middle' },
                  '& td.n': { textAlign: 'right', fontFamily: 'var(--font-mono)' },
                }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Ordered</th>
                      <th style={{ textAlign: 'right' }}>Already in</th>
                      <th style={{ textAlign: 'right' }}>Outstanding</th>
                      <th style={{ width: 130 }}>Received now</th>
                      <th style={{ width: 160 }}>Heat / batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const entry = entries[l.id] ?? { qty: '', heatNo: '' };
                      const over = num(entry.qty) > l.outstanding && l.outstanding >= 0 && num(entry.qty) > 0;
                      const noItem = l.catalog_item_id == null;
                      return (
                        <tr key={l.id}>
                          <td>
                            <Mono chip>{l.catalog_code ?? l.code ?? `#${l.line_no}`}</Mono>
                            <Typography component="span" sx={{ ml: 1, fontSize: 12.5, color: 'var(--c-text-2)' }}>
                              {l.catalog_name ?? l.description ?? '—'}
                            </Typography>
                            {noItem && (
                              <Typography sx={{ fontSize: 11.5, color: 'var(--c-danger-600)' }}>
                                No catalog item — cannot be received
                              </Typography>
                            )}
                          </td>
                          <td className="n">{trim(num(l.qty))} {l.unit ?? l.catalog_unit ?? ''}</td>
                          <td className="n">{trim(num(l.qty_received))}</td>
                          <td className="n">
                            {l.outstanding > 0
                              ? trim(l.outstanding)
                              : <Box component="span" sx={{ color: 'var(--c-success-600)' }}>closed</Box>}
                          </td>
                          <td>
                            <TextField
                              size="small" type="number" value={entry.qty} disabled={noItem}
                              sx={{ width: 110 }}
                              onChange={(e) => setEntry(l.id, { qty: e.target.value })}
                            />
                          </td>
                          <td>
                            <TextField
                              size="small" value={entry.heatNo} disabled={noItem}
                              sx={{ width: 150 }}
                              onChange={(e) => setEntry(l.id, { heatNo: e.target.value })}
                            />
                            {over && (
                              <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                                over-receipt — allowed
                              </Typography>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Box>
              </Surface>
            )}

            <StickyActionBar
              message={`${toReceive.length} line(s) · ${trim(qtyTotal)} total`}
            >
              <Button variant="contained" onClick={submit} disabled={saving || !toReceive.length}>
                {saving ? <CircularProgress size={16} color="inherit" /> : 'Receive delivery'}
              </Button>
            </StickyActionBar>
          </>
        )}
      </Box>
    </SectionCard>
  );
}
