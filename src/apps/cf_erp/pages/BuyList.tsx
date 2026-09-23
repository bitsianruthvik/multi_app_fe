import { useMemo, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import ShoppingCartRounded from '@mui/icons-material/ShoppingCartRounded';
import PlaylistAddCheckRounded from '@mui/icons-material/PlaylistAddCheckRounded';
import { cfApi, qs } from '../api/client';
import type { BuyRow, SuggestResult } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { qtyText } from '../lib/inventory';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { useToast } from '../components/toastContext';

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
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useLoad(() => cfApi.get<BuyRow[]>(`/buy-list${qs({ show })}`), [show]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => (term
    ? all.filter((r) => [r.item.code, r.item.name, ...r.orders.map((o) => o.code)].some((t) => t && String(t).toLowerCase().includes(term)))
    : all), [all, term]);

  const short = all.filter((r) => r.toBuy > 0);
  const stats = [
    { label: 'Items short', value: short.length, tone: short.length ? ('danger' as const) : ('success' as const) },
    { label: 'On order', value: all.filter((r) => r.onOrder > 0).length, hint: 'Items with steel already coming' },
    { label: 'Covered', value: all.filter((r) => r.toBuy === 0).length, tone: 'success' as const, hint: 'Held or free in stock' },
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
        subtitle="What the released jobs need that nobody has: wanted, less what is held for them, free on the shelf and already on order. Suggesting writes one draft purchase order and rewrites it each time — it never buys twice."
        actions={canManage && <Button variant="contained" startIcon={<PlaylistAddCheckRounded />} onClick={suggest} disabled={busy || !short.length}>
          {busy ? 'Working…' : 'Suggest a purchase order'}</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search item or order">
        <FacetChip label="Short" active={show === 'short'} count={short.length} onClick={() => setShow('short')} />
        <FacetChip label="Everything wanted" active={show === 'all'} onClick={() => setShow('all')} />
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.item.id} loading={list.loading && !list.data} storageKey="buy-list" exportName="to-buy"
        empty={<EmptyState icon={<ShoppingCartRounded />} title={show === 'short' ? 'Nothing is short' : 'Nothing is wanted yet'}
          hint={show === 'short' ? 'Every released job has its material held, free in stock, or on order.' : 'Release a line to production and its material appears here.'} />} />
    </Box>
  );
}
