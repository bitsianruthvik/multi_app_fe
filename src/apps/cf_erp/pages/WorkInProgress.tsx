import { Fragment, useEffect, useState } from 'react';
import { Box, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import { Link } from 'react-router-dom';
import { cfApi } from '../api/client';
import { getWip } from '../api/wip';
import type { SalesOrder, WipLot, WipOrderGroup } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { kgText, rupeeText } from '../lib/money';
import { qtyText } from '../lib/inventory';
import { EmptyState, ErrorNotice, Mono, PageHeader, SectionCard, StatStrip, SkeletonRows } from '../components/ui';
import { FilterBar } from '../components/FilterBar';
import { OrderPicker } from '../components/ServerPicker';

const value = (v: number | null | undefined) => (v == null ? '—' : rupeeText(v));

/** One lot; a container (it holds something right now) opens to show what is inside. */
function LotRows({ lot, open, onToggle }: { lot: WipLot; open: boolean; onToggle: () => void }) {
  const container = lot.contains.length > 0;
  return (
    <Fragment>
      <TableRow data-testid="wip-lot" hover>
        <TableCell sx={{ width: 40, p: 0.5 }}>
          {container && (
            <IconButton size="small" aria-label={open ? 'Hide what is inside' : 'Show what is inside'} aria-expanded={open} data-testid="wip-expand" onClick={onToggle}>
              {open ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell><Mono chip>{lot.code}</Mono></TableCell>
        <TableCell>
          <Box sx={{ py: 0.5 }}>
            {lot.item.code && <Mono>{lot.item.code}</Mono>}
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{lot.item.name}</Typography>
          </Box>
        </TableCell>
        <TableCell>{lot.level}{container && <Mono muted sx={{ ml: 0.75 }}>holds {lot.contains.length}</Mono>}</TableCell>
        <TableCell align="right"><Mono>{qtyText(lot.quantity)}</Mono></TableCell>
        <TableCell align="right"><Mono>{value(lot.value)}</Mono></TableCell>
      </TableRow>
      {container && open && lot.contains.map((c, i) => (
        <TableRow key={`${lot.batchId}:${i}`} data-testid="wip-contained" sx={{ background: 'var(--c-surface-2)' }}>
          <TableCell />
          <TableCell sx={{ pl: 3 }}>{c.code ? <Mono>{c.code}</Mono> : <Mono muted>—</Mono>}</TableCell>
          <TableCell><Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{c.item.code ? `${c.item.code} · ` : ''}{c.item.name}</Typography></TableCell>
          <TableCell><Mono muted>inside</Mono></TableCell>
          <TableCell align="right"><Mono>{qtyText(c.quantity)}</Mono></TableCell>
          <TableCell align="right"><Mono>{value(c.value)}</Mono></TableCell>
        </TableRow>
      ))}
    </Fragment>
  );
}

function OrderLotsTable({ group, company }: { group: WipOrderGroup; company: string }) {
  const [openLots, setOpenLots] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setOpenLots((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = group.lots.reduce((s, l) => s + (l.value ?? 0), 0);
  return (
    <SectionCard flush sx={{ mb: 2 }}
      title={<><Link to={appPath(company, `orders/${group.orderId}`)} style={{ color: 'inherit' }}><Mono>{group.orderCode}</Mono></Link><Box component="span" sx={{ color: 'var(--c-text-3)', fontWeight: 400 }}>· line {group.lineNo}</Box></>}
      subtitle={`${group.lots.length} lot${group.lots.length === 1 ? '' : 's'} · ${rupeeText(total)} of material`}>
      <Box data-testid="wip-order" sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 40 }} />
              <TableCell>Lot</TableCell>
              <TableCell>Item</TableCell>
              <TableCell>Level</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {group.lots.map((l) => <LotRows key={l.batchId} lot={l} open={openLots.has(l.batchId)} onToggle={() => toggle(l.batchId)} />)}
          </TableBody>
        </Table>
      </Box>
    </SectionCard>
  );
}

/** Stock › Work in progress — the production ledger: every piece being made, as stock, at the level it has reached. */
export default function WorkInProgress() {
  const company = useCompanySlug();
  const [orderId, setOrderId] = useUrlParam('orderId', '');
  const [searchParam, setSearchParam] = useUrlParam('search', '');
  const [search, setSearch] = useState(searchParam);
  const debounced = useDebounced(search.trim());
  useEffect(() => { setSearchParam(debounced); }, [debounced, setSearchParam]);
  // The picker needs the order itself; the URL holds only its id.
  const [picked, setPicked] = useState<SalesOrder | null>(null);
  useEffect(() => {
    if (!orderId) { setPicked(null); return undefined; }
    if (picked?.id === Number(orderId)) return undefined;
    let alive = true;
    cfApi.get<SalesOrder>(`/orders/${orderId}`).then((o) => { if (alive) setPicked(o); }).catch(() => { /* the filter still applies by id */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const wip = useLoad(() => getWip({ orderId: orderId || undefined, search: debounced || undefined }), [orderId, debounced]);
  const d = wip.data;
  const t = d?.totals;
  const stats = [
    { label: 'Lots', value: t?.lots ?? 0, hint: 'Separate lots of production stock' },
    { label: 'Pieces', value: t?.pieces ?? 0, hint: 'Pieces being made, at every level' },
    { label: 'Value', value: t?.value ?? 0, display: t?.value == null ? '—' : rupeeText(t.value), hint: t?.unpricedLots ? `${t.unpricedLots} lot${t.unpricedLots === 1 ? '' : 's'} with no cost are left out. Material only.` : 'Material only' },
    { label: 'Offcuts', value: d?.offcuts.count ?? 0, hint: d ? `${kgText(d.offcuts.kg)}${d.offcuts.value != null ? ` · ${rupeeText(d.offcuts.value)}` : ''} — see Offcuts` : undefined },
  ];
  const filtered = !!orderId || !!debounced;

  return (
    <Box>
      <PageHeader title="Work in progress"
        subtitle="Every piece being made is stock here, at the level it has reached. It moves up when the next step starts and comes back down when it is taken apart." />
      <StatStrip stats={stats} />
      {d && d.offcuts.count > 0 && (
        <Box data-testid="wip-offcuts" sx={{ mt: -1.5, mb: 2, fontSize: 13, color: 'var(--c-text-2)' }}>
          Offcuts from cut plates: <b>{d.offcuts.count}</b> · {kgText(d.offcuts.kg)}{d.offcuts.value != null && <> · {rupeeText(d.offcuts.value)}</>} — <Link to={appPath(company, 'offcuts')}>see Offcuts</Link>
        </Box>
      )}
      {d && d.byLevel.length > 0 && (
        <Box data-testid="wip-by-level" sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.5, mb: 3 }}>
          {[...d.byLevel].sort((a, b) => a.depth - b.depth).map((l) => (
            <Box key={`${l.depth}:${l.level}`} data-testid="wip-level" sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', px: 1.5, py: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)' }}>{l.level}</Typography>
              <Typography sx={{ fontSize: 13 }}><Mono>{l.lots}</Mono> lot{l.lots === 1 ? '' : 's'} · <Mono>{qtyText(l.pieces)}</Mono> pc</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}><Mono>{value(l.value)}</Mono></Typography>
            </Box>
          ))}
        </Box>
      )}
      <FilterBar search={search} onSearch={setSearch} placeholder="Search lot, item or piece code">
        <OrderPicker openOnly={false} value={picked} onChange={(o) => { setPicked(o); setOrderId(o ? String(o.id) : ''); }} label="Order" sx={{ flex: '1 1 260px', maxWidth: 360, minWidth: 0 }} />
      </FilterBar>
      <ErrorNotice error={wip.error} onRetry={wip.reload} />
      {!d && !wip.error && <SkeletonRows rows={5} />}
      {d && d.orders.length === 0 && (
        <EmptyState icon={<PrecisionManufacturingRounded />} title={filtered ? 'Nothing matches' : 'Nothing is being made'}
          hint={filtered ? 'Clear the search or the order.' : 'Pieces appear here as soon as an order is released and its first step starts.'} />
      )}
      {d?.orders.map((g) => <OrderLotsTable key={`${g.orderId}:${g.lineId}:${g.releaseId}`} group={g} company={company} />)}
    </Box>
  );
}
