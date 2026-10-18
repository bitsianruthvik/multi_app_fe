import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { DetailTabs, FacetChip, FilterBar, KpiGrid, KpiTile, SectionCard, ToneBadge, type DataColumn } from '@shared/ui';
import { ReportTable } from '../components/ReportTable';
import { useReport, type ProductionOrderRow, type ProductionReport } from '../api';
import { ReportPage, CardGrid } from '../components/ReportPage';
import { Donut, Meter, RankBars, TrendBars } from '../components/Charts';
import { useFilters } from '../filters';
import { dayLabel, inr, inrShort, pct, qty, qtyShort } from '../format';

type Machine = ProductionReport['machines'][number];
type Yield = ProductionReport['yieldOrders'][number];
type Operator = ProductionReport['operators'][number];

const STATUS_TONE: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = { Released: 'info', Planned: 'warning', Closed: 'success' };
const yieldTone = (y: number | null) => (y == null ? 'primary' : y >= 95 ? 'success' : y >= 85 ? 'warning' : 'danger') as 'primary' | 'success' | 'warning' | 'danger';

/** Production floor: output, machines, open orders, yield and material use. */
export default function Production() {
  const f = useFilters('30d');
  const { data: d, error, loading, reload } = useReport<ProductionReport>(`/production${f.query()}`);
  const [tab, setTab] = useState('machines');
  const [search, setSearch] = useState('');
  const [onlyLate, setOnlyLate] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const s = search.trim().toLowerCase();
  const match = (...t: (string | number | null | undefined)[]) => !s || t.some((x) => String(x ?? '').toLowerCase().includes(s));

  const machineCols: DataColumn<Machine>[] = [
    { key: 'machine', header: 'Machine', render: (r) => <b>{r.machine}</b>, sortValue: (r) => r.machine, exportValue: (r) => r.machine },
    { key: 'section', header: 'Section', render: (r) => r.section, sortValue: (r) => r.section },
    { key: 'output', header: 'Output', numeric: true, align: 'right', render: (r) => qty(r.output), sortValue: (r) => r.output },
    { key: 'outputValue', header: 'Output value', numeric: true, align: 'right', render: (r) => inr(r.outputValue), sortValue: (r) => r.outputValue, defaultHidden: true },
    { key: 'yield', header: 'Yield', render: (r) => (r.yield == null ? '—' : <Meter pct={r.yield} tone={yieldTone(r.yield)} />), sortValue: (r) => r.yield ?? 0, exportValue: (r) => r.yield ?? '' },
    { key: 'openOrders', header: 'Open orders', numeric: true, align: 'right', render: (r) => r.openOrders, sortValue: (r) => r.openOrders },
    { key: 'planned', header: 'Planned (open)', numeric: true, align: 'right', render: (r) => qty(r.planned), sortValue: (r) => r.planned },
    { key: 'progress', header: 'Done of open', render: (r) => <Meter pct={r.planned ? (r.completed / r.planned) * 100 : 0} />, sortValue: (r) => (r.planned ? r.completed / r.planned : 0), exportValue: (r) => (r.planned ? Math.round((r.completed / r.planned) * 100) : '') },
    { key: 'late', header: 'Late', numeric: true, align: 'right', render: (r) => r.late || '—', sortValue: (r) => r.late },
  ];
  const orderCols: DataColumn<ProductionOrderRow>[] = [
    { key: 'docNum', header: 'Order', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'status', header: 'Status', render: (r) => <ToneBadge label={r.late ? 'Late' : r.status} tone={r.late ? 'danger' : STATUS_TONE[r.status] || 'neutral'} />, sortValue: (r) => (r.late ? 'A' : r.status), exportValue: (r) => (r.late ? 'Late' : r.status) },
    { key: 'itemName', header: 'Product', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'customer', header: 'Customer', render: (r) => r.customer || '—', sortValue: (r) => r.customer || '' },
    { key: 'salesOrder', header: 'SO', render: (r) => r.salesOrder || '—', sortValue: (r) => r.salesOrder || 0, defaultHidden: true },
    { key: 'section', header: 'Section', render: (r) => r.section, sortValue: (r) => r.section },
    { key: 'machine', header: 'Machine', render: (r) => r.machine, sortValue: (r) => r.machine },
    { key: 'unit', header: 'Unit', render: (r) => r.unit || '—', sortValue: (r) => r.unit || '', defaultHidden: true },
    { key: 'planned', header: 'Planned', numeric: true, align: 'right', render: (r) => `${qty(r.planned)} ${r.uom || ''}`, sortValue: (r) => r.planned },
    { key: 'completed', header: 'Done', numeric: true, align: 'right', render: (r) => qty(r.completed), sortValue: (r) => r.completed },
    { key: 'progress', header: 'Progress', render: (r) => <Meter pct={r.progress} />, sortValue: (r) => r.progress, exportValue: (r) => r.progress },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate || '—', sortValue: (r) => r.dueDate || '' },
  ];
  const yieldCols: DataColumn<Yield>[] = [
    { key: 'docNum', header: 'Order', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'itemName', header: 'Product', render: (r) => r.itemName, sortValue: (r) => r.itemName },
    { key: 'machine', header: 'Machine', render: (r) => r.machine, sortValue: (r) => r.machine },
    { key: 'status', header: 'Status', render: (r) => r.status, sortValue: (r) => r.status },
    { key: 'input', header: 'Material issued', numeric: true, align: 'right', render: (r) => qty(r.input), sortValue: (r) => r.input },
    { key: 'output', header: 'Output', numeric: true, align: 'right', render: (r) => qty(r.output), sortValue: (r) => r.output },
    { key: 'loss', header: 'Difference', numeric: true, align: 'right', render: (r) => <span style={{ color: r.loss > 0 ? 'var(--c-danger-600)' : undefined }}>{qty(r.loss)}</span>, sortValue: (r) => r.loss, exportValue: (r) => r.loss },
    { key: 'yield', header: 'Yield', render: (r) => <Meter pct={r.yield} tone={yieldTone(r.yield)} />, sortValue: (r) => r.yield, exportValue: (r) => r.yield },
  ];
  const opCols: DataColumn<Operator>[] = [
    { key: 'operator', header: 'Operator', render: (r) => r.operator, sortValue: (r) => r.operator },
    { key: 'machine', header: 'Machine', render: (r) => r.machine, sortValue: (r) => r.machine },
    { key: 'receipts', header: 'Receipts', numeric: true, align: 'right', render: (r) => r.receipts, sortValue: (r) => r.receipts },
    { key: 'output', header: 'Output', numeric: true, align: 'right', render: (r) => qty(r.output), sortValue: (r) => r.output },
  ];

  const k = d?.kpis;
  const orders = d ? d.openOrders.filter((o) => (!onlyLate || o.late) && (!section || o.section === section) && match(o.docNum, o.itemName, o.customer, o.machine)) : [];
  return (
    <ReportPage title="Production" subtitle={d ? `${d.from} to ${d.to}` : undefined} filters={f}
      asOf={d?.asOf} loading={loading} error={error} reload={reload} hasData={!!d}>
      {d && k && (
        <>
          <KpiGrid min={180}>
            <KpiTile label="Output" display={qtyShort(k.output)} tone="primary" spark={d.daily.map((x) => d.sections.reduce((t, sct) => t + Number(x[sct] || 0), 0))} footer={`${inrShort(k.outputValue)} at cost`} />
            <KpiTile label="Output today" display={qtyShort(k.outputToday)} />
            <KpiTile label="Yield" display={pct(k.yield)} tone={yieldTone(k.yield)} hint="Output ÷ material issued for production in this period" footer={`${qtyShort(k.issued)} material issued`} />
            <KpiTile label="Open orders" display={`${k.openOrders}`} footer={`${k.released} released · ${k.planned} planned`} onClick={() => setTab('orders')} />
            <KpiTile label="Late orders" display={`${k.lateOrders}`} tone={k.lateOrders ? 'danger' : 'success'} onClick={() => { setTab('orders'); setOnlyLate(true); }} />
          </KpiGrid>
          <SectionCard title="Output by day" subtitle={`${d.from} to ${d.to} · production receipts by section`}>
            <TrendBars stacked format={qtyShort} labels={d.daily.map((x) => dayLabel(String(x.date)))}
              series={d.sections.map((sct) => ({ label: sct, data: d.daily.map((x) => Number(x[sct] || 0)) }))} />
          </SectionCard>
          <CardGrid cols="1fr 1fr 1fr">
            <SectionCard title="Open orders by section" subtitle="Done of planned quantity">
              <Stack spacing={1.5}>
                {d.bySection.map((sct) => (
                  <Box key={sct.section} onClick={() => { setTab('orders'); setSection(section === sct.section ? null : sct.section); }} sx={{ cursor: 'pointer' }}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{sct.section}</Typography>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{sct.openOrders} orders{sct.late ? ` · ${sct.late} late` : ''}</Typography>
                    </Stack>
                    <Meter pct={sct.progress} tone={sct.late ? 'warning' : 'primary'} />
                  </Box>
                ))}
              </Stack>
            </SectionCard>
            <SectionCard title="Output by shift"><Donut height={170} data={d.shifts.map((x) => ({ label: x.shift, value: x.output }))} format={qtyShort} /></SectionCard>
            <SectionCard title="Material consumed" subtitle="Issued for production, by item group">
              <RankBars colorIndex={3} limit={7} rows={d.consumptionByGroup.map((g) => ({ key: g.group, label: g.group, value: g.qty, sub: inrShort(g.value) }))} format={qtyShort} />
            </SectionCard>
          </CardGrid>
          <CardGrid cols="1fr 1fr">
            <SectionCard title="Top machines" subtitle="Output in this period">
              <RankBars rows={d.machines.map((m) => ({ key: m.machine, label: `${m.machine} · ${m.section}`, value: m.output, sub: m.yield != null ? `yield ${m.yield}%` : undefined }))} format={qtyShort} limit={8} />
            </SectionCard>
            <SectionCard title="Consumption by stage" subtitle="Routing stage of the issue">
              <Donut height={190} data={d.consumptionByStage.map((x) => ({ label: x.stage, value: x.qty }))} format={qtyShort} />
            </SectionCard>
          </CardGrid>
          <SectionCard flush>
            <Box sx={{ px: 2, pt: 1 }}>
              <DetailTabs active={tab} onTab={setTab} tabs={[
                { value: 'machines', label: 'Machines', count: d.machines.length },
                { value: 'orders', label: 'Open orders', count: d.openOrders.length },
                { value: 'yield', label: 'Yield by order', count: d.yieldOrders.length },
                { value: 'operators', label: 'Operators', count: d.operators.length },
              ]} />
            </Box>
            {tab === 'orders' && (
              <FilterBar search={search} onSearch={setSearch} placeholder="Search order, product, customer or machine">
                <FacetChip label="Late only" active={onlyLate} onClick={() => setOnlyLate((v) => !v)} count={k.lateOrders} />
                {section && <FacetChip label={section} active onClick={() => setSection(null)} />}
              </FilterBar>
            )}
            {tab === 'machines' && <ReportTable bare rows={d.machines} columns={machineCols} getRowId={(r) => r.machine} storageKey="kd-prod-machines" exportName="machine-wise-production" />}
            {tab === 'orders' && <ReportTable bare rows={orders} columns={orderCols} getRowId={(r) => r.id} storageKey="kd-prod-orders" exportName="open-production-orders" />}
            {tab === 'yield' && <ReportTable bare rows={d.yieldOrders} columns={yieldCols} getRowId={(r) => r.id} storageKey="kd-prod-yield" exportName="issue-vs-receipt" />}
            {tab === 'operators' && <ReportTable bare rows={d.operators} columns={opCols} getRowId={(r) => `${r.operator}-${r.machine}`} exportName="operator-output" />}
          </SectionCard>
        </>
      )}
    </ReportPage>
  );
}
