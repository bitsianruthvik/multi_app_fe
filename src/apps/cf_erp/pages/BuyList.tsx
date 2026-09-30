import { useMemo, useState } from 'react';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import { cfApi, qs } from '../api/client';
import type { BuyRow, SuggestResult } from '../api/types';
import type { BuyListTotal } from '../api/money';
import { dayText, priceText, rupeeText } from '../lib/money';
import { Money } from '../components/Money';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { buyRowId, byKind, isPlanned, type BuyKind } from '../lib/buyList';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { useToast } from '../components/toastContext';
import { PlannedChip } from '../components/PlannedChip';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * What the released jobs need and nobody has (Phase 6). Not a plan: every
 * figure here is something already committed — wanted by a release, held for
 * it, free on the shelf, or on a purchase order.
 */
export default function BuyList() {
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [show, setShow] = useUrlParam('show', 'short');
  const [kindParam, setKind] = useUrlParam('kind', 'all');
  const kind: BuyKind = kindParam === 'released' || kindParam === 'planned' ? kindParam : 'all';
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  // Everything wanted is fetched once and the two views are filtered here, so
  // the chip counts and the figures above them are true in both.
  const list = useLoad(() => cfApi.get<{ rows: BuyRow[]; total: BuyListTotal }>(`/buy-list${qs({ show: 'all', summary: 1 })}`), []);
  const all = useMemo(() => list.data?.rows ?? [], [list.data]);
  const short = useMemo(() => all.filter((r) => r.toBuy > 0), [all]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const base = byKind(show === 'short' ? short : all, kind);
    return term
      ? base.filter((r) => [r.item.code, r.item.name, ...r.orders.map((o) => o.code)].some((t) => t && String(t).toLowerCase().includes(term)))
      : base;
  }, [all, short, show, term, kind]);

  // The footer adds what is shown: the server's total when nothing is searched away, else the visible rows.
  const total = useMemo(() => {
    if (!term && show === 'short' && kind === 'all' && list.data) return list.data.total;
    const shown = rows.filter((r) => r.toBuy > 0);
    return { estCost: Math.round(shown.reduce((t, r) => t + (r.estCost ?? 0), 0) * 100) / 100, items: shown.length, unpricedItems: shown.filter((r) => r.estCost == null).length };
  }, [list.data, rows, show, term, kind]);
  const stats = [
    { label: 'Items short', value: short.length, tone: short.length ? ('danger' as const) : ('success' as const), hint: 'Wanted by released work and nobody has it', onClick: () => setShow('short') },
    ...(list.data ? [{ label: 'Est. cost to buy', value: list.data.total.estCost, display: rupeeText(list.data.total.estCost), hint: list.data.total.unpricedItems ? `${list.data.total.unpricedItems} item${list.data.total.unpricedItems === 1 ? ' has' : 's have'} no price and ${list.data.total.unpricedItems === 1 ? 'is' : 'are'} left out` : 'At the last price paid, else the list price' }] : []),
    { label: 'On order', value: all.filter((r) => r.onOrder > 0).length, tone: 'info' as const, hint: 'Items with steel already coming' },
    { label: 'Covered', value: all.length - short.length, tone: 'success' as const, hint: 'Held for the job, free in stock, or on order' },
  ];

  const suggest = async () => {
    setBusy(true);
    try {
      const r = await cfApi.post<SuggestResult>('/buy-list/suggest', {});
      invalidateNavCounts();
      list.reload();
      if (r.order) toast.success(`${r.order.code}: ${r.lines} ${r.lines === 1 ? 'line' : 'lines'} to buy. Name the supplier and send it.`);
      else toast.info(r.message ?? 'Nothing is short.');
    } catch (e) {
      toast.error((e as Error).message ?? 'The suggestion could not be made.');
    } finally { setBusy(false); }
  };

  const columns: DataColumn<BuyRow>[] = [
    {
      key: 'item', header: 'Item', alwaysVisible: true, sortValue: (r) => r.item.code ?? r.item.name,
      render: (r) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${r.item.id}`)} sx={linkSx}>{r.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{r.item.name}</Typography>
          {isPlanned(r) && <PlannedChip row={r} />}
        </Box>
      ),
    },
    { key: 'wanted', header: 'Wanted', numeric: true, alwaysVisible: true, sortValue: (r) => r.wanted, render: (r) => <>{qtyText(r.wanted)} <Mono muted>{r.item.uom}</Mono></> },
    { key: 'reserved', header: 'Held', numeric: true, sortValue: (r) => r.reserved, render: (r) => <Mono muted={!r.reserved}>{qtyText(r.reserved)}</Mono> },
    { key: 'free', header: 'Free stock', numeric: true, sortValue: (r) => r.free, render: (r) => <Mono muted={!r.free}>{qtyText(r.free)}</Mono> },
    {
      key: 'onOrder', header: 'On order', numeric: true, sortValue: (r) => r.onOrder,
      render: (r) => (r.onOrder
        ? <Box sx={{ textAlign: 'right' }}><Mono>{qtyText(r.onOrder)}</Mono>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{r.purchaseOrders.map((p) => p.code).join(', ')}</Typography></Box>
        : <Mono muted>—</Mono>),
    },
    {
      key: 'toBuy', header: 'To buy', numeric: true, alwaysVisible: true, sortValue: (r) => r.toBuy,
      render: (r) => (r.toBuy > 0
        ? <Box sx={{ fontWeight: 600, color: 'var(--c-danger-700)' }}>{qtyText(r.toBuy)} <Mono muted>{r.item.uom}</Mono></Box>
        : <Mono muted>—</Mono>),
    },
    {
      key: 'estPrice', header: 'Est. price', numeric: true, sortValue: (r) => r.estUnitPrice, exportValue: (r) => r.estUnitPrice ?? '',
      render: (r) => (r.estUnitPrice == null ? <Money value={null} missing="no price" /> : (
        <Tooltip title={r.estSource === 'last_paid' ? `Last paid${r.estFrom ? ` on ${r.estFrom.code}${r.estFrom.date ? `, ${dayText(r.estFrom.date)}` : ''}` : ''}` : 'From the list price'}>
          <Box sx={{ textAlign: 'right' }}><Mono>{priceText(r.estUnitPrice)}</Mono>
            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{r.estSource === 'last_paid' ? 'last paid' : 'list price'}</Typography></Box>
        </Tooltip>
      )),
    },
    {
      key: 'estCost', header: 'Est. cost', numeric: true, alwaysVisible: true, sortValue: (r) => (r.toBuy > 0 ? r.estCost : null), exportValue: (r) => r.estCost ?? '',
      render: (r) => (r.toBuy > 0 ? <Money value={r.estCost} missing="no price" /> : <Mono muted>—</Mono>),
    },
    {
      key: 'orders', header: 'Wanted by', sortValue: (r) => r.orders.length, exportValue: (r) => r.orders.map((o) => o.code).join(' '),
      render: (r) => (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {r.orders.map((o) => <Mono key={o.id} chip><Box component={Link} to={appPath(company, `orders/${o.id}?tab=production`)} sx={linkSx}>{o.code}</Box></Mono>)}
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader title="To buy"
        subtitle="What released jobs need — and, marked planned, what confirmed, frozen lines will need — that nobody has: wanted, less what is held for them, free on the shelf and already on order. Suggesting writes one draft purchase order and rewrites it each time — it never buys twice."
        actions={canManage && (
          <Tooltip title={short.length ? 'Writes one draft purchase order for everything short' : 'Nothing is short, so there is nothing to raise'}>
            <span>
              <Button variant="contained" startIcon={<PlaylistAddCheckRounded />} onClick={suggest} disabled={busy || !short.length}>
                {busy ? 'Working…' : 'Suggest a purchase order'}
              </Button>
            </span>
          </Tooltip>
        )} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search item or order">
        <FacetChip label="Short" active={show === 'short'} count={short.length} onClick={() => setShow('short')} />
        <FacetChip label="Everything wanted" active={show === 'all'} count={all.length} onClick={() => setShow('all')} />
        <FacetChip label="All" active={kind === 'all'} count={(show === 'short' ? short : all).length} onClick={() => setKind('all')} />
        <FacetChip label="Released" active={kind === 'released'} count={byKind(show === 'short' ? short : all, 'released').length} onClick={() => setKind('released')} />
        <FacetChip label="Planned" active={kind === 'planned'} count={byKind(show === 'short' ? short : all, 'planned').length} onClick={() => setKind('planned')} />
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={buyRowId} loading={list.loading && !list.data} storageKey="buy-list" exportName="to-buy"
        defaultSortKey="toBuy" defaultSortDir="desc"
        empty={<EmptyState icon={<ShoppingCartRounded />}
          title={term ? 'Nothing matches' : show === 'short' ? 'Nothing is short' : 'Nothing is wanted yet'}
          hint={term ? 'Clear the search, or look at everything wanted.'
            : show === 'short' ? 'Every released job has its material held, free in stock, or on order.'
              : 'Release a line to production and its material appears here.'}
          action={term ? <Button onClick={() => setSearch('')}>Clear search</Button>
            : show === 'short' && all.length ? <Button onClick={() => setShow('all')}>See everything wanted</Button> : undefined} />} />
      {rows.length > 0 && (
        <Box data-testid="buy-total" sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap', mt: 1.5, px: 1 }}>
          {total.unpricedItems > 0 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{total.unpricedItems} item{total.unpricedItems === 1 ? '' : 's'} with no price left out</Typography>}
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Estimated total to buy</Typography>
          <Money value={total.estCost} strong />
        </Box>
      )}
    </Box>
  );
}
