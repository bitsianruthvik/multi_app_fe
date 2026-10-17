import { Box } from '@mui/material';
import { DataTable, SectionCard, StatStrip, type DataColumn } from '@shared/ui';
import type { AgeingReport, OpenItem, PartyAgeing } from '../api';
import { inr, inrShort } from '../format';

/** Receivables and payables: totals by age, then by party, then the open documents. */
export function AgeingView({ report, partyLabel, kind }: { report: AgeingReport; partyLabel: string; kind: 'receivables' | 'payables' }) {
  const t = report.totals;
  const money = (k: keyof PartyAgeing, header: string): DataColumn<PartyAgeing> => ({
    key: k, header, numeric: true, align: 'right',
    render: (r) => (r[k] ? inr(r[k] as number) : '—'), sortValue: (r) => r[k] as number,
  });
  const partyCols: DataColumn<PartyAgeing>[] = [
    { key: 'cardName', header: partyLabel, render: (r) => r.cardName, sortValue: (r) => r.cardName, alwaysVisible: true },
    { key: 'cardCode', header: 'Code', render: (r) => r.cardCode, sortValue: (r) => r.cardCode, defaultHidden: true },
    money('notDue', 'Not due'), money('d0_30', '1–30 days'), money('d31_60', '31–60'), money('d61_90', '61–90'), money('d90plus', '90+'),
    money('total', 'Total'),
    { key: 'docs', header: 'Docs', numeric: true, align: 'right', render: (r) => r.docs, sortValue: (r) => r.docs },
    ...(kind === 'receivables'
      ? [money('creditLimit', 'Credit limit')].map((c) => ({ ...c, defaultHidden: true }))
      : []),
  ];
  const openCols: DataColumn<OpenItem>[] = [
    { key: 'docNum', header: kind === 'receivables' ? 'Invoice' : 'AP invoice', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'cardName', header: partyLabel, render: (r) => r.cardName, sortValue: (r) => r.cardName },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate, sortValue: (r) => r.dueDate },
    { key: 'daysOverdue', header: 'Days overdue', numeric: true, align: 'right', render: (r) => r.daysOverdue || '—', sortValue: (r) => r.daysOverdue },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (r) => inr(r.total), sortValue: (r) => r.total },
    { key: 'balance', header: 'Balance', numeric: true, align: 'right', render: (r) => inr(r.balance), sortValue: (r) => r.balance },
  ];
  const overdue = (t.total ?? 0) - (t.notDue ?? 0);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <StatStrip stats={[
        { label: 'Outstanding', value: t.total ?? 0, display: inrShort(t.total), tone: 'primary' },
        { label: 'Overdue', value: overdue, display: inrShort(overdue), tone: overdue > 0 ? 'warning' : 'success' },
        { label: 'Over 90 days', value: t.d90plus ?? 0, display: inrShort(t.d90plus), tone: (t.d90plus ?? 0) > 0 ? 'danger' : 'success' },
        { label: partyLabel === 'Customer' ? 'Customers owing' : 'Vendors owed', value: report.parties.length },
      ]} />
      <SectionCard title={`By ${partyLabel.toLowerCase()}`} flush>
        <DataTable rows={report.parties} columns={partyCols} getRowId={(r) => r.cardCode}
          storageKey={`kd-${kind}-parties`} exportName={`${kind}-by-${partyLabel.toLowerCase()}`}
          defaultSortKey="total" defaultSortDir="desc" bare />
      </SectionCard>
      <SectionCard title="Open documents" subtitle="Oldest due first" flush>
        <DataTable rows={report.open} columns={openCols} getRowId={(r) => r.docEntry}
          storageKey={`kd-${kind}-open`} exportName={`${kind}-open`} bare />
      </SectionCard>
    </Box>
  );
}
