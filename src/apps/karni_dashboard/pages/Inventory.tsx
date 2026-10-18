import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { DataTable, DetailTabs, FacetChip, FilterBar, KpiGrid, KpiTile, SectionCard, SideSheet, ToneBadge, type DataColumn } from '@shared/ui';
import { useReport, type InventoryItem, type InventoryItemDetail, type InventoryReport } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { Donut, RankBars } from '../components/Charts';
import { useFilters } from '../filters';
import { inr, inrShort, qty, qtyShort } from '../format';

type Whs = InventoryReport['byWarehouse'][number];
type Grp = InventoryReport['byGroup'][number];
type Tr = InventoryReport['transfers'][number];

/** Stock in hand by warehouse, group and unit, with value; consumption and open transfers. */
export default function Inventory() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<InventoryReport>(`/inventory${f.query(false)}`);
  const [tab, setTab] = useState('items');
  const [search, setSearch] = useState('');
  const [onlyShort, setOnlyShort] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(null);
  const s = search.trim().toLowerCase();
  const items = d ? d.items.filter((i) => (!onlyShort || i.short) && (!group || i.group === group) && (!s || i.itemCode.toLowerCase().includes(s) || i.itemName.toLowerCase().includes(s))) : [];

  const itemCols: DataColumn<InventoryItem>[] = [
    { key: 'itemCode', header: 'Item', render: (r) => r.itemCode, sortValue: (r) => r.itemCode },
    { key: 'itemName', header: 'Description', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'group', header: 'Group', render: (r) => r.group, sortValue: (r) => r.group },
    { key: 'onHand', header: 'In stock', numeric: true, align: 'right', render: (r) => `${qty(r.onHand)} ${r.uom || ''}`, sortValue: (r) => r.onHand },
    { key: 'committed', header: 'Committed', numeric: true, align: 'right', render: (r) => qty(r.committed), sortValue: (r) => r.committed },
    { key: 'onOrder', header: 'On order', numeric: true, align: 'right', render: (r) => qty(r.onOrder), sortValue: (r) => r.onOrder },
    { key: 'available', header: 'Available', numeric: true, align: 'right', render: (r) => qty(r.available), sortValue: (r) => r.available },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
    { key: 'warehouses', header: 'Warehouses', numeric: true, align: 'right', render: (r) => r.warehouses, sortValue: (r) => r.warehouses, defaultHidden: true },
    { key: 'short', header: '', render: (r) => (r.short ? <ToneBadge label="Short" tone="danger" /> : null), sortValue: (r) => (r.short ? 1 : 0), exportValue: (r) => (r.short ? 'Short' : '') },
  ];
  const whsCols: DataColumn<Whs>[] = [
    { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse, sortValue: (r) => r.warehouse },
    { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'items', header: 'Items', numeric: true, align: 'right', render: (r) => r.items, sortValue: (r) => r.items },
    { key: 'onHand', header: 'Quantity', numeric: true, align: 'right', render: (r) => qty(r.onHand), sortValue: (r) => r.onHand },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
  ];
  const grpCols: DataColumn<Grp>[] = [
    { key: 'group', header: 'Item group', render: (r) => r.group, sortValue: (r) => r.group },
    { key: 'lines', header: 'Stock lines', numeric: true, align: 'right', render: (r) => r.lines, sortValue: (r) => r.lines },
    { key: 'onHand', header: 'Quantity', numeric: true, align: 'right', render: (r) => qty(r.onHand), sortValue: (r) => r.onHand },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
  ];
  const trCols: DataColumn<Tr>[] = [
    { key: 'docNum', header: 'Request', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'from', header: 'From', render: (r) => r.from, sortValue: (r) => r.from },
    { key: 'to', header: 'To', render: (r) => r.to, sortValue: (r) => r.to },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate || '—', sortValue: (r) => r.dueDate || '' },
    { key: 'late', header: 'Status', render: (r) => <ToneBadge label={r.late ? 'Late' : 'Open'} tone={r.late ? 'warning' : 'info'} />, sortValue: (r) => (r.late ? 1 : 0) },
  ];

  return (
    <ReportPage title="Inventory" subtitle="Stock in hand by warehouse, refreshed hourly" filters={f} range={false}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid min={190}>
            <KpiTile label="Stock value" display={inrShort(d.value)} tone="primary" hint="Quantity × average cost per warehouse" />
            <KpiTile label="Items in stock" display={`${d.itemCount}`} footer={`${qtyShort(d.qty)} total quantity`} />
            <KpiTile label="Items short" display={`${d.shortCount}`} tone={d.shortCount ? 'warning' : 'success'} hint="Committed to customers beyond stock + on order"
              onClick={() => { setTab('items'); setOnlyShort(true); }} />
            <KpiTile label="Open transfer requests" display={`${d.transfers.length}`} footer={`${d.transfers.filter((t) => t.late).length} past due`} onClick={() => setTab('transfers')} />
          </KpiGrid>
          <CardGrid cols="1fr 1fr 1fr">
            <SectionCard title="Value by item group">
              <RankBars limit={8} rows={d.byGroup.map((g) => ({ key: g.group, label: g.group, value: g.value }))} format={inrShort}
                onClick={(g) => { setTab('items'); setGroup(group === g ? null : g); }} />
            </SectionCard>
            <SectionCard title="Value by unit"><Donut height={180} data={d.byUnit.map((u) => ({ label: u.unit, value: u.value }))} format={inrShort} /></SectionCard>
            <SectionCard title="Consumed in production" subtitle="Last 30 days, by item group">
              <RankBars colorIndex={3} limit={8} rows={d.consumption.map((g) => ({ key: g.group, label: g.group, value: g.qty, sub: inrShort(g.value) }))} format={qtyShort} />
            </SectionCard>
          </CardGrid>
          <SectionCard flush>
            <Box sx={{ px: 2, pt: 1 }}>
              <DetailTabs active={tab} onTab={setTab} tabs={[
                { value: 'items', label: 'Items', count: d.items.length },
                { value: 'warehouses', label: 'Warehouses', count: d.byWarehouse.length },
                { value: 'groups', label: 'Item groups', count: d.byGroup.length },
                { value: 'transfers', label: 'Transfer requests', count: d.transfers.length },
              ]} />
            </Box>
            {tab === 'items' && (
              <FilterBar search={search} onSearch={setSearch} placeholder="Search item code or description">
                <FacetChip label="Short only" active={onlyShort} onClick={() => setOnlyShort((v) => !v)} count={d.shortCount} />
                {group && <FacetChip label={group} active onClick={() => setGroup(null)} />}
              </FilterBar>
            )}
            {tab === 'items' && <DataTable bare rows={items} columns={itemCols} getRowId={(r) => r.itemCode} onRowClick={(r) => setItem(r.itemCode)} storageKey="kd-inv-items" exportName="stock-by-item" />}
            {tab === 'warehouses' && <DataTable bare rows={d.byWarehouse} columns={whsCols} getRowId={(r) => r.warehouse} exportName="stock-by-warehouse" />}
            {tab === 'groups' && <DataTable bare rows={d.byGroup} columns={grpCols} getRowId={(r) => r.group} exportName="stock-by-group" />}
            {tab === 'transfers' && <DataTable bare rows={d.transfers} columns={trCols} getRowId={(r) => r.docEntry} exportName="transfer-requests" />}
          </SectionCard>
          <ItemSheet itemCode={item} onClose={() => setItem(null)} />
        </>
      )}
    </ReportPage>
  );
}

function ItemSheet({ itemCode, onClose }: { itemCode: string | null; onClose: () => void }) {
  const { data } = useReport<InventoryItemDetail>(itemCode ? `/inventory/item/${encodeURIComponent(itemCode)}` : null, false);
  const it = itemCode && data?.itemCode === itemCode ? data : null;
  return (
    <SideSheet open={!!itemCode} onClose={onClose} title={it?.itemName || 'Item'} subtitle={it ? `${it.itemCode} · ${it.group}` : undefined}>
      {it && (
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Stock by warehouse</Typography>
          {it.warehouses.map((w) => (
            <Box key={w.warehouse} sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{w.warehouse} · {w.name}</Typography>
                <Typography sx={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{qty(w.onHand)} {it.uom}</Typography>
              </Stack>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                {w.unit || '—'} · committed {qty(w.committed)} · on order {qty(w.onOrder)} · {inr(w.value)}
              </Typography>
            </Box>
          ))}
        </Stack>
      )}
    </SideSheet>
  );
}
