import { useState } from 'react';
import { Box } from '@mui/material';
import { DetailTabs, FacetChip, FilterBar, KpiGrid, KpiTile, SectionCard, ToneBadge, type DataColumn } from '@shared/ui';
import { ReportTable } from '../components/ReportTable';
import { useReport, type OpenDoc, type OpenDocs, type PendingLine, type SalesOrdersReport } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { RankBars } from '../components/Charts';
import { useFilters } from '../filters';
import { inr, inrShort, qty } from '../format';

const late = (l: boolean) => <ToneBadge label={l ? 'Past due' : 'On time'} tone={l ? 'warning' : 'info'} />;

/** Pending sales orders: what is still to ship, against the stock in hand. */
export function SalesOrders() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<SalesOrdersReport>(`/sales-orders${f.query(false)}`);
  const [tab, setTab] = useState('items');
  const [search, setSearch] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlyShort, setOnlyShort] = useState(false);
  const s = search.trim().toLowerCase();
  const match = (...t: (string | number | null | undefined)[]) => !s || t.some((x) => String(x ?? '').toLowerCase().includes(s));

  type ByItem = SalesOrdersReport['byItem'][number];
  type ByCust = SalesOrdersReport['byCustomer'][number];
  const itemCols: DataColumn<ByItem>[] = [
    { key: 'itemCode', header: 'Item', render: (r) => r.itemCode, sortValue: (r) => r.itemCode },
    { key: 'itemName', header: 'Description', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'open', header: 'Pending', numeric: true, align: 'right', render: (r) => `${qty(r.open)} ${r.uom || ''}`, sortValue: (r) => r.open },
    { key: 'stock', header: 'In stock', numeric: true, align: 'right', render: (r) => qty(r.stock), sortValue: (r) => r.stock },
    { key: 'short', header: 'Short by', numeric: true, align: 'right', render: (r) => (r.short ? <b style={{ color: 'var(--c-danger-600)' }}>{qty(r.short)}</b> : '—'), sortValue: (r) => r.short, exportValue: (r) => r.short },
    { key: 'value', header: 'Pending value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
    { key: 'lines', header: 'Order lines', numeric: true, align: 'right', render: (r) => r.lines, sortValue: (r) => r.lines },
    { key: 'late', header: 'Past due', numeric: true, align: 'right', render: (r) => r.late || '—', sortValue: (r) => r.late },
  ];
  const custCols: DataColumn<ByCust>[] = [
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'lines', header: 'Order lines', numeric: true, align: 'right', render: (r) => r.lines, sortValue: (r) => r.lines },
    { key: 'open', header: 'Pending qty', numeric: true, align: 'right', render: (r) => qty(r.open), sortValue: (r) => r.open },
    { key: 'value', header: 'Pending value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
    { key: 'late', header: 'Past due lines', numeric: true, align: 'right', render: (r) => r.late || '—', sortValue: (r) => r.late },
  ];
  const lineCols: DataColumn<PendingLine>[] = [
    { key: 'docNum', header: 'SO', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'itemName', header: 'Item', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'ordered', header: 'Ordered', numeric: true, align: 'right', render: (r) => qty(r.ordered), sortValue: (r) => r.ordered },
    { key: 'open', header: 'Pending', numeric: true, align: 'right', render: (r) => `${qty(r.open)} ${r.uom || ''}`, sortValue: (r) => r.open },
    { key: 'value', header: 'Value', numeric: true, align: 'right', render: (r) => inr(r.value), sortValue: (r) => r.value },
    { key: 'shipDate', header: 'Due', render: (r) => r.shipDate || '—', sortValue: (r) => r.shipDate || '' },
    { key: 'late', header: 'Status', render: (r) => late(r.late), sortValue: (r) => (r.late ? 1 : 0) },
  ];
  const orderCols: DataColumn<OpenDoc>[] = [
    { key: 'docNum', header: 'SO', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'cardName', header: 'Customer', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'salesPersonName', header: 'Sales employee', render: (r) => r.salesPersonName ?? '—', sortValue: (r) => r.salesPersonName ?? '' },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate ?? '—', sortValue: (r) => r.dueDate ?? '' },
    { key: 'status', header: 'Status', render: (r) => late(r.late), sortValue: (r) => (r.late ? 1 : 0) },
    { key: 'daysOld', header: 'Age (days)', numeric: true, align: 'right', render: (r) => r.daysOld ?? '—', sortValue: (r) => r.daysOld ?? 0 },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (r) => inr(r.total), sortValue: (r) => r.total },
  ];

  return (
    <ReportPage title="Sales orders" subtitle="Open orders and what is still to ship" filters={f} range={false}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid min={190}>
            <KpiTile label="Open orders" display={`${d.count}`} tone="primary" footer={inrShort(d.value)} />
            <KpiTile label="Pending to ship" display={inrShort(d.pendingValue)} footer={`${d.pendingLines} order lines`} />
            <KpiTile label="Past due lines" display={`${d.lateLines}`} tone={d.lateLines ? 'danger' : 'success'} onClick={() => { setTab('lines'); setOnlyLate(true); }} />
            <KpiTile label="Items short of stock" display={`${d.itemsShort}`} tone={d.itemsShort ? 'warning' : 'success'} onClick={() => { setTab('items'); setOnlyShort(true); }}
              footer="Pending more than stock in hand" />
          </KpiGrid>
          <CardGrid cols="1fr 1fr">
            <SectionCard title="Biggest pending customers" subtitle="Value still to ship">
              <RankBars rows={d.byCustomer.map((c) => ({ key: c.cardCode, label: c.cardName, value: c.value, sub: `${c.lines} lines${c.late ? ` · ${c.late} past due` : ''}` }))} format={inrShort} limit={8} />
            </SectionCard>
            <SectionCard title="Shortest items" subtitle="Pending quantity not covered by stock">
              <RankBars colorIndex={2} rows={d.byItem.filter((i) => i.short > 0).sort((a, b) => b.short - a.short).map((i) => ({ key: i.itemCode, label: i.itemName, value: i.short, sub: `pending ${qty(i.open)} · in stock ${qty(i.stock)}` }))} format={qty} limit={8} />
            </SectionCard>
          </CardGrid>
          <SectionCard flush>
            <Box sx={{ px: 2, pt: 1 }}>
              <DetailTabs active={tab} onTab={setTab} tabs={[
                { value: 'items', label: 'By item', count: d.byItem.length },
                { value: 'customers', label: 'By customer', count: d.byCustomer.length },
                { value: 'lines', label: 'Pending lines', count: d.pending.length },
                { value: 'orders', label: 'Open orders', count: d.count },
              ]} />
            </Box>
            <FilterBar search={search} onSearch={setSearch} placeholder="Search customer, item or number">
              {(tab === 'lines' || tab === 'orders') && <FacetChip label="Past due only" active={onlyLate} onClick={() => setOnlyLate((v) => !v)} />}
              {tab === 'items' && <FacetChip label="Short only" active={onlyShort} onClick={() => setOnlyShort((v) => !v)} count={d.itemsShort} />}
            </FilterBar>
            {tab === 'items' && <ReportTable bare rows={d.byItem.filter((r) => (!onlyShort || r.short > 0) && match(r.itemCode, r.itemName))} columns={itemCols} getRowId={(r) => r.itemCode} storageKey="kd-so-items" exportName="pending-so-by-item" />}
            {tab === 'customers' && <ReportTable bare rows={d.byCustomer.filter((r) => match(r.cardName))} columns={custCols} getRowId={(r) => r.cardCode} exportName="pending-so-by-customer" />}
            {tab === 'lines' && <ReportTable bare rows={d.pending.filter((r) => (!onlyLate || r.late) && match(r.cardName, r.itemName, r.docNum))} columns={lineCols} getRowId={(r) => `${r.docEntry}-${r.lineNum}`} storageKey="kd-so-lines" exportName="pending-so-lines" />}
            {tab === 'orders' && <ReportTable bare rows={d.rows.filter((r) => (!onlyLate || r.late) && match(r.cardName, r.docNum))} columns={orderCols} getRowId={(r) => r.docEntry} storageKey="kd-so-orders" exportName="open-sales-orders" />}
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}

/** Open purchase orders (header level). */
export function PurchaseOrders() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<OpenDocs>(`/purchase-orders${f.query(false)}`);
  const [search, setSearch] = useState('');
  const s = search.trim().toLowerCase();
  const cols: DataColumn<OpenDoc>[] = [
    { key: 'docNum', header: 'PO', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '' },
    { key: 'cardName', header: 'Vendor', render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate ?? '—', sortValue: (r) => r.dueDate ?? '' },
    { key: 'status', header: 'Status', render: (r) => late(r.late), sortValue: (r) => (r.late ? 1 : 0) },
    { key: 'daysOld', header: 'Age (days)', numeric: true, align: 'right', render: (r) => r.daysOld ?? '—', sortValue: (r) => r.daysOld ?? 0 },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (r) => inr(r.total), sortValue: (r) => r.total },
  ];
  return (
    <ReportPage title="Purchase orders" subtitle="Open purchase orders" filters={f} range={false}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Open purchase orders" display={`${d.count}`} tone="primary" />
            <KpiTile label="Open value" display={inrShort(d.value)} />
            <KpiTile label="Past due date" display={`${d.late}`} tone={d.late ? 'warning' : 'success'} />
            <KpiTile label="Vendors" display={`${new Set(d.rows.map((r) => r.cardCode)).size}`} />
          </KpiGrid>
          <SectionCard flush>
            <FilterBar search={search} onSearch={setSearch} placeholder="Search vendor or number" />
            <ReportTable bare rows={d.rows.filter((r) => !s || r.cardName.toLowerCase().includes(s) || String(r.docNum).includes(s))} columns={cols}
              getRowId={(r) => r.docEntry} storageKey="kd-po" exportName="open-purchase-orders" />
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}
