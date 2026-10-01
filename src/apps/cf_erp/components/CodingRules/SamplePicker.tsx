import { useEffect, useState } from 'react';
import { Autocomplete, Box, TextField } from '@mui/material';
import { cfApi, qs } from '../../api/client';
import type { Batch, Machine, Movement, OrderProductionFull, PurchaseOrderRow, RecordList, SalesOrder } from '../../api/types';
import { MOVEMENT_LABEL } from '../../lib/inventory';
import { useLoad } from '../../hooks/useLoad';

/** A record to try a rule on. */
export interface SampleRow { id: number; code: string | null; name: string }

/** Entities whose list takes a `search` on the server; the rest are short lists filtered here. */
const SEARCHED = new Set(['item', 'definition', 'machine', 'stock_batch', 'stock_lot', 'stock_movement', 'drawing']);

interface DrawingRow { id: number; code: string | null; number: string; revision: string; title: string | null }

/**
 * Where the records to try a rule on come from, per entity. Production pieces
 * live under an order, so they are listed one order at a time. An entity this
 * screen does not know yet simply has nothing to try the rule on.
 */
async function loadSamples(entityType: string, search: string, orderId: number | null): Promise<SampleRow[]> {
  const q = search.trim() || undefined;
  switch (entityType) {
    case 'item':
    case 'definition': {
      const list = await cfApi.get<RecordList>(`/records${qs({ recordKind: entityType, search: q, limit: 50 })}`);
      return list.rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
    }
    case 'sales_order':
      return (await cfApi.get<SalesOrder[]>(`/orders${qs({ limit: 200 })}`))
        .map((o) => ({ id: o.id, code: o.code, name: o.title ?? (o.orderType === 'stock' ? 'Stock order' : 'Customer order') }));
    case 'machine':
      return (await cfApi.get<Machine[]>(`/machines${qs({ search: q })}`)).map((m) => ({ id: m.id, code: m.code, name: m.name }));
    case 'stock_batch':
    case 'stock_lot':
      return (await cfApi.get<Batch[]>(`/batches${qs({ search: q })}`))
        .map((b) => ({ id: b.id, code: b.code, name: `${b.item.code ?? b.item.name}${b.supplierRef ? ` · lot ${b.supplierRef}` : ''}` }));
    case 'stock_movement':
      return (await cfApi.get<Movement[]>(`/movements${qs({ search: q, limit: 200 })}`))
        .map((m) => ({ id: m.id, code: m.code, name: `${MOVEMENT_LABEL[m.movementType]} · ${m.movementDate}` }));
    case 'purchase_order':
      return (await cfApi.get<PurchaseOrderRow[]>('/purchase-orders'))
        .map((p) => ({ id: p.id, code: p.code, name: p.supplier?.name ?? (p.suggested ? 'Suggested by the buy list' : 'No supplier yet') }));
    case 'drawing':
      return (await cfApi.get<{ rows: DrawingRow[] }>(`/drawings${qs({ search: q, limit: 100 })}`)).rows
        .map((d) => ({ id: d.id, code: d.code, name: `${d.number} rev ${d.revision}${d.title ? ` · ${d.title}` : ''}` }));
    case 'production_piece': {
      if (!orderId) return [];
      const prod = await cfApi.get<OrderProductionFull>(`/orders/${orderId}/production?full=1`);
      return prod.releases.flatMap((r) => r.items.map((it) => ({ id: it.id, code: it.code, name: it.label || it.item.name })));
    }
    default:
      return [];
  }
}

const label = (o: SampleRow) => `${o.code ?? '—'} · ${o.name}`;

/** Picks the real record every part of the builder is shown against. Nothing is saved and no number is taken. */
export function SamplePicker({ entityType, value, onChange }: { entityType: string; value: SampleRow | null; onChange: (row: SampleRow | null) => void }) {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [orderId, setOrderId] = useState<number | null>(null);
  const searched = SEARCHED.has(entityType);
  useEffect(() => { setTyped(''); setSearch(''); setOrderId(null); }, [entityType]);
  useEffect(() => {
    if (!searched) return undefined;
    const t = window.setTimeout(() => setSearch(typed), 300);
    return () => window.clearTimeout(t);
  }, [typed, searched]);

  const orders = useLoad(async () => (entityType === 'production_piece' ? cfApi.get<SalesOrder[]>(`/orders${qs({ limit: 200 })}`) : []), [entityType]);
  const rows = useLoad(() => loadSamples(entityType, searched ? search : '', orderId), [entityType, searched ? search : '', orderId]);
  const options = rows.data ?? [];
  // The chosen record stays an option while a new search runs, so the field keeps showing it.
  const withValue = value && !options.some((o) => o.id === value.id) ? [value, ...options] : options;
  const nothing = rows.error ? 'Could not load records to try this on'
    : entityType === 'production_piece' && !orderId ? 'Choose an order first'
      : rows.loading ? 'Loading…' : 'Nothing to try this on yet';

  return (
    <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: entityType === 'production_piece' ? { xs: '1fr', sm: '1fr 1fr' } : '1fr', minWidth: 0 }}>
      {entityType === 'production_piece' && (
        <Autocomplete size="small" options={orders.data ?? []} getOptionLabel={(o) => `${o.code} · ${o.title ?? ''}`}
          value={(orders.data ?? []).find((o) => o.id === orderId) ?? null}
          onChange={(_, o) => { setOrderId(o?.id ?? null); onChange(null); }}
          renderInput={(p) => <TextField {...p} label="Order" helperText="Pieces are listed per order" />} />
      )}
      {/* Only what the person types searches; picking an option fills the field and keeps the list. */}
      <Autocomplete key={entityType} size="small" options={withValue} getOptionLabel={label} value={value}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        filterOptions={searched ? (x) => x : undefined}
        onInputChange={searched ? (_, v, reason) => { if (reason === 'input' || reason === 'clear') setTyped(reason === 'clear' ? '' : v); } : undefined}
        onChange={(_, o) => onChange(o)}
        noOptionsText={nothing} loading={rows.loading}
        renderOption={(props, o) => <li {...props} key={o.id}>{label(o)}</li>}
        renderInput={(p) => <TextField {...p} label="Try it on a record" placeholder={searched ? 'Type to find a record' : 'Choose a record'}
          helperText={rows.error ? rows.error.message : 'Nothing is saved and no number is taken.'} error={!!rows.error} />} />
    </Box>
  );
}
