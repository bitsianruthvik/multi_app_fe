import { Fragment, useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { cfApi } from '../../api/client';
import { qtyText } from '../../api/storesDesk';
import { useLoad } from '../../hooks/useLoad';
import { useDebounced, usePagedList } from '../../hooks/usePagedList';
import { Badge, EmptyState, ErrorNotice, Mono, SectionCard, SkeletonRows, StatStrip } from '../ui';
import { FacetChip, FilterBar } from '../FilterBar';

/**
 * One sales order's stock, as the Stores ledger shows the store (user, 2026-11-23: "make it easier to see the current stock
 * inside the sales order … more like the ledger screen as a lot of entries will come into this … track the WIPs too").
 * Backend: GET /stores-desk/orders/:id/stock and /stock/entries (orderStockService).
 */
type Item = { id: number; code: string | null; name: string; uom: string | null };
type Lot = { kind: 'customer' | 'held'; id: number | null; code: string | null; heat: string | null; brand: string | null; receivedOn: string | null; status: string | null; area: string | null; onMr?: boolean; quantity: number };
type StockRow = { item: Item; customer: number; held: number; reserved: number; issued: number; lastIssued: string | null; lots: Lot[] };
type Piece = { item: Item | null; lotId: number; lotCode: string; pieceCode: string; lineNo: number | null; depth: number; area: { id: number; name: string; purpose: string }; quantity: number; since: string | null };
type OrderStock = {
  order: { id: number; code: string; customer: { id: number; name: string } | null };
  tiles: { items: number; customerLots: number; heldLots: number; reservedItems: number; issuedItems: number; wipPieces: number; finishedPieces: number };
  items: StockRow[];
  wip: { pieces: Piece[]; byArea: { id: number; name: string; purpose: string; pieces: number; quantity: number }[] };
};
type Entry = {
  id: number; date: string; quantity: number; notes: string | null; by: string | null;
  movement: { id: number; code: string; type: string; reference: string | null; reason: string | null; reversed: boolean; reversal: boolean };
  item: Item; lot: { id: number; code: string; heat: string | null; piece: string | null; kind: 'piece' | 'customer' | 'ours' } | null;
  area: { name: string; purpose: string };
};
type EntryMeta = { types: Record<string, number> };

const TYPE_WORDS: Record<string, string> = { receipt: 'Received', issue: 'Given out', transfer: 'Moved', adjustment: 'Audit / correction', scrap: 'Scrapped', return: 'Returned', transform: 'Production' };
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;
const th = { fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', textAlign: 'left', p: '8px 12px', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' } as const;
const td = { p: '9px 12px', borderBottom: '1px solid var(--c-divider)', fontSize: 13.5, verticalAlign: 'middle' } as const;
const dash = (n: number) => (n ? qtyText(n) : '—');
const PERIODS = [['', 'All time'], ['30', 'Last 30 days'], ['7', 'Last 7 days']] as const;
const back = (days: string) => { if (!days) return undefined; const d = new Date(); d.setDate(d.getDate() - Number(days)); return d.toISOString().slice(0, 10); };

export function OrderStockPanel({ orderId }: { orderId: number }) {
  const data = useLoad(() => cfApi.get<OrderStock>(`/stores-desk/orders/${orderId}/stock`), [orderId]);
  const [view, setView] = useState<'stock' | 'entries' | 'wip'>('stock');
  const t = data.data?.tiles;
  return (
    <Box sx={{ minWidth: 0 }} data-testid="order-stock">
      {data.error && <ErrorNotice error={data.error} onRetry={data.reload} />}
      {!data.data && !data.error && <SkeletonRows rows={6} />}
      {data.data && <>
        <StatStrip stats={[
          { label: 'Items', value: t!.items, hint: 'Items this order has any stock of: the customer\'s, held for it, reserved for its production or given out to it.', onClick: () => setView('stock') },
          { label: "Customer's lots", value: t!.customerLots, tone: 'info', hint: 'Lots the customer supplied for this order, still in the store. Only this order uses them.', onClick: () => setView('stock') },
          { label: 'Lots held for it', value: t!.heldLots, tone: 'primary', hint: 'Our stock held for this order: an MR on it takes these first.', onClick: () => setView('stock') },
          { label: 'Given out', value: t!.issuedItems, hint: 'Items given out to this order (less what came back).', onClick: () => setView('entries') },
          { label: 'Pieces in WIP', value: t!.wipPieces, tone: 'warning', hint: 'This order\'s pieces being made, in the production WIP area.', onClick: () => setView('wip') },
          { label: 'Made, not dispatched', value: t!.finishedPieces, tone: 'success', hint: 'Finished pieces of this order in the dispatch yard.', onClick: () => setView('wip') },
        ]} />
        <Box role="group" aria-label="View" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1.5 }}>
          <FacetChip label="Stock now" active={view === 'stock'} onClick={() => setView('stock')} />
          <FacetChip label="Entries" active={view === 'entries'} onClick={() => setView('entries')} />
          <FacetChip label="Work in progress" count={t!.wipPieces + t!.finishedPieces} active={view === 'wip'} onClick={() => setView('wip')} />
        </Box>
        {view === 'stock' && <StockNow rows={data.data.items} customer={data.data.order.customer?.name ?? null} />}
        {view === 'entries' && <Entries orderId={orderId} />}
        {view === 'wip' && <Wip wip={data.data.wip} />}
      </>}
    </Box>
  );
}

function StockNow({ rows, customer }: { rows: StockRow[]; customer: string | null }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!rows.length) return <EmptyState icon={<WarehouseRounded />} title="No stock for this order yet" body="Material the customer sends for it, stock held for it, and what is given out to it show here." />;
  return (
    <SectionCard flush title="Stock now" subtitle={`Click a line to see its lots.${customer ? ` "${customer}'s" is material ${customer} supplied for this order.` : ''}`}>
      <Box sx={{ overflowX: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <Box component="th" sx={{ ...th, width: 32 }} />
            <Box component="th" sx={th}>Item</Box>
            <Box component="th" sx={{ ...th, ...num }}>Customer's</Box>
            <Box component="th" sx={{ ...th, ...num }}>Held for it</Box>
            <Box component="th" sx={{ ...th, ...num }}>Reserved for production</Box>
            <Box component="th" sx={{ ...th, ...num }}>Given out</Box>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.item.id}>
                <Box component="tr" onClick={() => toggle(r.item.id)} sx={{ cursor: 'pointer', '&:hover': { background: 'var(--c-hover)' } }} data-testid="order-stock-row">
                  <Box component="td" sx={td}><IconButton size="small" aria-label={open.has(r.item.id) ? 'Hide lots' : 'Show lots'}>{open.has(r.item.id) ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton></Box>
                  <Box component="td" sx={td}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{r.item.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[r.item.code, r.item.uom, `${r.lots.length} lot${r.lots.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                  <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.customer}>{dash(r.customer)}</Mono></Box>
                  <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.held}>{dash(r.held)}</Mono></Box>
                  <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.reserved}>{dash(r.reserved)}</Mono></Box>
                  <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.issued}>{dash(r.issued)}</Mono>{r.lastIssued && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>last {r.lastIssued}</Typography>}</Box>
                </Box>
                {open.has(r.item.id) && (
                  <tr><Box component="td" colSpan={6} sx={{ ...td, background: 'var(--c-surface-2)', p: '8px 12px 12px 44px' }}>
                    {r.lots.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No lot of it is in the store for this order (only given out or reserved).</Typography> : (
                      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }} data-testid="order-stock-lots">
                        <thead><tr>{['Lot', 'Whose', 'Heat / supplier lot', 'Brand', 'Came in', 'Where', 'Quantity'].map((h) => <Box component="th" key={h} sx={{ ...th, ...(h === 'Quantity' ? num : {}) }}>{h}</Box>)}</tr></thead>
                        <tbody>{r.lots.map((l, i) => (
                          <tr key={`${l.kind}-${l.id}-${i}`}>
                            <Box component="td" sx={td}><Mono>{l.code ?? '—'}</Mono></Box>
                            <Box component="td" sx={td}>{l.kind === 'customer' ? <Badge family="info" noIcon label={`${customer ?? 'Customer'}'s`} /> : <Badge family="neutral" noIcon label={l.onMr ? 'Held — on an MR' : 'Ours, held for it'} />}</Box>
                            <Box component="td" sx={td}><Mono muted={!l.heat}>{l.heat ?? '—'}</Mono></Box>
                            <Box component="td" sx={td}>{l.brand ?? '—'}</Box>
                            <Box component="td" sx={td}>{l.receivedOn ?? '—'}</Box>
                            <Box component="td" sx={td}>{l.area ?? '—'}{l.status && l.status !== 'available' ? <Badge family="warning" noIcon label={l.status === 'on_hold' ? 'On hold' : l.status} /> : null}</Box>
                            <Box component="td" sx={{ ...td, ...num }}><Mono>{qtyText(l.quantity)}</Mono></Box>
                          </tr>
                        ))}</tbody>
                      </Box>
                    )}
                  </Box></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </Box>
      </Box>
    </SectionCard>
  );
}

function Entries({ orderId }: { orderId: number }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [kind, setKind] = useState<'' | '0' | '1'>('');
  const [period, setPeriod] = useState('');
  const term = useDebounced(search.trim());
  const list = usePagedList<Entry, EntryMeta>(`/stores-desk/orders/${orderId}/stock/entries`, { search: term || undefined, type: type || undefined, wip: kind || undefined, from: back(period) });
  const types = list.counts?.types ?? {};
  return (
    <SectionCard flush title="Entries" subtitle={`${list.total} entr${list.total === 1 ? 'y' : 'ies'} — newest first. Every movement of this order's stock: what it received, what was held, given out and moved, and its pieces through production.`}>
      <Box sx={{ p: 1.5, pb: 0 }}>
        <FilterBar search={search} onSearch={setSearch} placeholder="Search an item, lot, heat, entry or reference">
          {PERIODS.map(([k, label]) => <FacetChip key={k || 'all'} label={label} active={period === k} onClick={() => setPeriod(k)} />)}
          <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
          <FacetChip label="Material and pieces" active={!kind} onClick={() => setKind('')} />
          <FacetChip label="Material" active={kind === '0'} onClick={() => setKind('0')} />
          <FacetChip label="Pieces (WIP)" active={kind === '1'} onClick={() => setKind('1')} />
        </FilterBar>
        <Box role="group" aria-label="Kind of entry" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
          <FacetChip label="Every kind" active={!type} onClick={() => setType('')} />
          {Object.entries(types).map(([k, n]) => <FacetChip key={k} label={TYPE_WORDS[k] ?? k} count={n} active={type === k} onClick={() => setType(k)} />)}
        </Box>
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.loaded && !list.error && <SkeletonRows rows={6} />}
      {list.loaded && list.rows.length === 0 && <Box sx={{ p: 3 }}><Typography sx={{ color: 'var(--c-text-3)', fontSize: 13.5 }}>No entries match.</Typography></Box>}
      {list.rows.length > 0 && (
        <Box sx={{ overflowX: 'auto', opacity: list.refreshing ? 0.6 : 1 }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }} data-testid="order-stock-entries">
            <thead><tr>{['Date', 'Entry', 'Item', 'Lot / piece', 'Where', 'In', 'Out', 'Reference', 'By'].map((h) => <Box component="th" key={h} sx={{ ...th, ...(h === 'In' || h === 'Out' ? num : {}) }}>{h}</Box>)}</tr></thead>
            <tbody>{list.rows.map((e) => (
              <Box component="tr" key={e.id} sx={{ opacity: e.movement.reversed || e.movement.reversal ? 0.55 : 1 }}>
                <Box component="td" sx={{ ...td, whiteSpace: 'nowrap' }}>{e.date}</Box>
                <Box component="td" sx={td}>
                  <Typography sx={{ fontSize: 13.5 }}>{TYPE_WORDS[e.movement.type] ?? e.movement.type}{e.movement.reversal ? ' (reversal)' : e.movement.reversed ? ' (reversed)' : ''}</Typography>
                  <Mono muted>{e.movement.code}</Mono>
                </Box>
                <Box component="td" sx={td}><Typography sx={{ fontSize: 13.5 }}>{e.item.name}</Typography><Mono muted>{e.item.code ?? ''}</Mono></Box>
                <Box component="td" sx={td}>
                  {e.lot ? <><Mono>{e.lot.piece ?? e.lot.code}</Mono>{e.lot.heat && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>heat {e.lot.heat}</Typography>}
                    {e.lot.kind === 'customer' && <Badge family="info" noIcon label="Customer's" />}{e.lot.kind === 'piece' && <Badge family="warning" noIcon label="Piece" />}</> : <Mono muted>—</Mono>}
                </Box>
                <Box component="td" sx={td}>{e.area.name}</Box>
                <Box component="td" sx={{ ...td, ...num }}>{e.quantity > 0 ? <Mono>{qtyText(e.quantity)}</Mono> : ''}</Box>
                <Box component="td" sx={{ ...td, ...num }}>{e.quantity < 0 ? <Mono>{qtyText(-e.quantity)}</Mono> : ''}</Box>
                <Box component="td" sx={{ ...td, maxWidth: 260 }}><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{[e.movement.reference, e.movement.reason].filter(Boolean).join(' · ') || '—'}</Typography></Box>
                <Box component="td" sx={{ ...td, whiteSpace: 'nowrap' }}>{e.by ?? '—'}</Box>
              </Box>
            ))}</tbody>
          </Box>
          {list.hasMore && <Box sx={{ p: 1.5 }}><Button size="small" onClick={() => { void list.loadMore(); }} disabled={list.loadingMore}>{list.loadingMore ? 'Loading…' : `Load more (${list.rows.length} of ${list.total})`}</Button></Box>}
        </Box>
      )}
    </SectionCard>
  );
}

function Wip({ wip }: { wip: OrderStock['wip'] }) {
  const [area, setArea] = useState<number | null>(null);
  const shown = area == null ? wip.pieces : wip.pieces.filter((p) => p.area.id === area);
  if (!wip.pieces.length) return <EmptyState icon={<WarehouseRounded />} title="No pieces in production yet" body="Once this order is released and its steps start, each piece shows here where it lies: in WIP while it is being made, in the dispatch yard when it is done." />;
  return (
    <SectionCard flush title="Work in progress" subtitle="This order's pieces where they lie now — a lot each, moved by the tracker as its steps start and finish.">
      <Box role="group" aria-label="Where" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', p: 1.5, pb: 1 }}>
        <FacetChip label="Everywhere" count={wip.pieces.length} active={area == null} onClick={() => setArea(null)} />
        {wip.byArea.map((a) => <FacetChip key={a.id} label={a.name} count={a.pieces} active={area === a.id} onClick={() => setArea(a.id)} />)}
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }} data-testid="order-stock-wip">
          <thead><tr>{['Line', 'Piece', 'What', 'Where', 'Since', 'Quantity'].map((h) => <Box component="th" key={h} sx={{ ...th, ...(h === 'Quantity' ? num : {}) }}>{h}</Box>)}</tr></thead>
          <tbody>{shown.map((p) => (
            <tr key={`${p.lotId}-${p.area.id}`}>
              <Box component="td" sx={td}>{p.lineNo ?? '—'}</Box>
              <Box component="td" sx={{ ...td, pl: `${12 + Math.min(p.depth, 6) * 10}px` }}><Mono>{p.pieceCode}</Mono></Box>
              <Box component="td" sx={td}>{p.item?.name ?? '—'}</Box>
              <Box component="td" sx={td}>{p.area.purpose === 'dispatch' ? <Badge family="success" noIcon label={p.area.name} /> : <Badge family="warning" noIcon label={p.area.name} />}</Box>
              <Box component="td" sx={{ ...td, whiteSpace: 'nowrap' }}>{p.since ?? '—'}</Box>
              <Box component="td" sx={{ ...td, ...num }}><Mono>{qtyText(p.quantity)}</Mono></Box>
            </tr>
          ))}</tbody>
        </Box>
      </Box>
    </SectionCard>
  );
}
