import { useState } from 'react';
import { Box } from '@mui/material';
import { DataTable, DetailTabs, KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import type { OpenItem, PartyAgeing, PartyBook } from '../api';
import { inr, inrShort, monthLabel } from '../format';
import { CardGrid } from './ReportPage';
import { RankBars, SplitBar, TrendBars } from './Charts';

type Pay = PartyBook['payments']['recent'][number];
type PayParty = PartyBook['payments']['byParty'][number];

/** Receivables or payables: ageing, what falls due this week, and the money that came in / went out. */
export function AgeingView({ report: r, partyLabel, kind }: { report: PartyBook; partyLabel: string; kind: 'receivables' | 'payables' }) {
  const [tab, setTab] = useState('parties');
  const t = r.totals;
  const overdue = t.total - t.notDue;
  const payWord = kind === 'receivables' ? 'Collections' : 'Payments';
  const money = (k: keyof PartyAgeing, header: string, hidden = false): DataColumn<PartyAgeing> => ({
    key: k, header, numeric: true, align: 'right', render: (x) => (x[k] ? inr(x[k] as number) : '—'), sortValue: (x) => x[k] as number, defaultHidden: hidden,
  });
  const partyCols: DataColumn<PartyAgeing>[] = [
    { key: 'cardName', header: partyLabel, render: (x) => x.cardName, sortValue: (x) => x.cardName, alwaysVisible: true },
    { key: 'cardCode', header: 'Code', render: (x) => x.cardCode, sortValue: (x) => x.cardCode, defaultHidden: true },
    money('notDue', 'Not due'), money('d0_30', '1–30 days'), money('d31_60', '31–60'), money('d61_90', '61–90'), money('d90plus', '90+'), money('total', 'Total'),
    { key: 'docs', header: 'Docs', numeric: true, align: 'right', render: (x) => x.docs, sortValue: (x) => x.docs },
    ...(kind === 'receivables' ? [money('creditLimit', 'Credit limit', true)] : []),
  ];
  const openCols: DataColumn<OpenItem>[] = [
    { key: 'docNum', header: 'Invoice', render: (x) => x.docNum, sortValue: (x) => x.docNum },
    { key: 'unit', header: 'Unit', render: (x) => x.unit || '—', sortValue: (x) => x.unit || '' },
    { key: 'cardName', header: partyLabel, render: (x) => x.cardName, sortValue: (x) => x.cardName },
    { key: 'docDate', header: 'Date', render: (x) => x.docDate, sortValue: (x) => x.docDate },
    { key: 'dueDate', header: 'Due', render: (x) => x.dueDate, sortValue: (x) => x.dueDate },
    { key: 'daysOverdue', header: 'Days overdue', numeric: true, align: 'right', render: (x) => x.daysOverdue || '—', sortValue: (x) => x.daysOverdue },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (x) => inr(x.total), sortValue: (x) => x.total },
    { key: 'balance', header: 'Balance', numeric: true, align: 'right', render: (x) => inr(x.balance), sortValue: (x) => x.balance },
  ];
  const payCols: DataColumn<Pay>[] = [
    { key: 'docDate', header: 'Date', render: (x) => x.docDate, sortValue: (x) => x.docDate },
    { key: 'docNum', header: 'No.', render: (x) => x.docNum, sortValue: (x) => x.docNum },
    { key: 'unit', header: 'Unit', render: (x) => x.unit || '—', sortValue: (x) => x.unit || '' },
    { key: 'cardName', header: partyLabel, render: (x) => x.cardName, sortValue: (x) => x.cardName },
    { key: 'amount', header: 'Amount', numeric: true, align: 'right', render: (x) => inr(x.amount), sortValue: (x) => x.amount },
  ];
  const payPartyCols: DataColumn<PayParty>[] = [
    { key: 'cardName', header: partyLabel, render: (x) => x.cardName, sortValue: (x) => x.cardName },
    { key: 'count', header: payWord, numeric: true, align: 'right', render: (x) => x.count, sortValue: (x) => x.count },
    { key: 'amount', header: 'Amount (this FY)', numeric: true, align: 'right', render: (x) => inr(x.amount), sortValue: (x) => x.amount },
  ];
  return (
    <>
      <KpiGrid min={190}>
        <KpiTile label="Outstanding" display={inrShort(t.total)} tone="primary" footer={`${r.parties.length} ${partyLabel.toLowerCase()}s`} />
        <KpiTile label="Overdue" display={inrShort(overdue)} tone={overdue > 0 ? 'warning' : 'success'} footer={`${t.total ? ((overdue / t.total) * 100).toFixed(0) : 0}% of outstanding`} />
        <KpiTile label="Over 90 days" display={inrShort(t.d90plus)} tone={t.d90plus > 0 ? 'danger' : 'success'} />
        <KpiTile label="Due in the next 7 days" display={inrShort(r.dueIn7.amount)} footer={`${r.dueIn7.count} invoices`} onClick={() => setTab('due')} />
        <KpiTile label={`${payWord} this month`} display={inrShort(r.payments.month)} spark={r.payments.monthly.map((m) => m.amount)} footer={`${inrShort(r.payments.fy)} this financial year`} />
      </KpiGrid>
      <CardGrid cols="1fr 1fr">
        <SectionCard title="By age" subtitle="Open invoices by days past due date">
          <SplitBar format={inrShort} parts={[
            { label: 'Not due', value: t.notDue, color: 'var(--c-success-600)' },
            { label: '1–30', value: t.d0_30, color: 'var(--c-info-600)' },
            { label: '31–60', value: t.d31_60, color: 'var(--c-warning-600)' },
            { label: '61–90', value: t.d61_90, color: 'var(--c-chart-7)' },
            { label: '90+', value: t.d90plus, color: 'var(--c-danger-600)' },
          ]} />
          <Box sx={{ mt: 3 }}>
            <RankBars colorIndex={2} limit={6} format={inrShort} rows={[...r.parties].sort((a, b) => (b.total - b.notDue) - (a.total - a.notDue))
              .map((p) => ({ key: p.cardCode, label: p.cardName, value: p.total - p.notDue, sub: `90+ ${inrShort(p.d90plus)}` }))} />
          </Box>
        </SectionCard>
        <SectionCard title={`${payWord} by month`} subtitle="Last 12 months">
          <TrendBars height={300} format={inrShort} labels={r.payments.monthly.map((m) => monthLabel(m.month))} series={[{ label: payWord, data: r.payments.monthly.map((m) => m.amount) }]} />
        </SectionCard>
      </CardGrid>
      <SectionCard flush>
        <Box sx={{ px: 2, pt: 1 }}>
          <DetailTabs active={tab} onTab={setTab} tabs={[
            { value: 'parties', label: `By ${partyLabel.toLowerCase()}`, count: r.parties.length },
            { value: 'open', label: 'Open invoices', count: r.open.length },
            { value: 'due', label: 'Due in 7 days', count: r.dueIn7.count },
            { value: 'paidBy', label: `${payWord} by ${partyLabel.toLowerCase()}`, count: r.payments.byParty.length },
            { value: 'recent', label: `Recent ${payWord.toLowerCase()}` },
          ]} />
        </Box>
        {tab === 'parties' && <DataTable bare rows={r.parties} columns={partyCols} getRowId={(x) => x.cardCode} storageKey={`kd-${kind}-parties`} exportName={`${kind}-by-party`} defaultSortKey="total" defaultSortDir="desc" />}
        {tab === 'open' && <DataTable bare rows={r.open} columns={openCols} getRowId={(x) => x.docEntry} storageKey={`kd-${kind}-open`} exportName={`${kind}-open`} />}
        {tab === 'due' && <DataTable bare rows={r.dueIn7.docs} columns={openCols} getRowId={(x) => x.docEntry} exportName={`${kind}-due-7-days`} />}
        {tab === 'paidBy' && <DataTable bare rows={r.payments.byParty} columns={payPartyCols} getRowId={(x) => x.cardCode} exportName={`${kind}-payments-by-party`} />}
        {tab === 'recent' && <DataTable bare rows={r.payments.recent} columns={payCols} getRowId={(x) => x.docEntry} exportName={`${kind}-payments`} />}
      </SectionCard>
    </>
  );
}
