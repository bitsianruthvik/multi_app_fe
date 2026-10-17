import { useState } from 'react';
import { Box } from '@mui/material';
import { DataTable, FacetChip, FilterBar, SectionCard, StatStrip, ToneBadge, type DataColumn } from '@shared/ui';
import { useReport, type OpenDoc, type OpenDocs } from '../api';
import { ReportPage } from '../components/ReportPage';
import { inr, inrShort } from '../format';

function OpenOrders({ path, title, partyLabel, withPerson }: { path: string; title: string; partyLabel: string; withPerson?: boolean }) {
  const { data, error, loading, reload } = useReport<OpenDocs>(path);
  const [search, setSearch] = useState('');
  const [lateOnly, setLateOnly] = useState(false);
  const s = search.trim().toLowerCase();
  const rows = (data?.rows ?? []).filter((r) => (!lateOnly || r.late)
    && (!s || r.cardName.toLowerCase().includes(s) || String(r.docNum).includes(s)));

  const cols: DataColumn<OpenDoc>[] = [
    { key: 'docNum', header: 'No.', render: (r) => r.docNum, sortValue: (r) => r.docNum },
    { key: 'docDate', header: 'Date', render: (r) => r.docDate, sortValue: (r) => r.docDate },
    { key: 'cardName', header: partyLabel, render: (r) => r.cardName, sortValue: (r) => r.cardName },
    ...(withPerson ? [{ key: 'salesPersonName', header: 'Sales employee', render: (r: OpenDoc) => r.salesPersonName ?? '—', sortValue: (r: OpenDoc) => r.salesPersonName ?? '' }] : []),
    { key: 'dueDate', header: 'Due', render: (r) => r.dueDate ?? '—', sortValue: (r) => r.dueDate ?? '' },
    { key: 'status', header: 'Status', render: (r) => <ToneBadge label={r.late ? 'Past due' : 'Open'} tone={r.late ? 'warning' : 'info'} />,
      sortValue: (r) => (r.late ? 1 : 0) },
    { key: 'daysOld', header: 'Age (days)', numeric: true, align: 'right', render: (r) => r.daysOld ?? '—', sortValue: (r) => r.daysOld ?? 0 },
    { key: 'net', header: 'Excl. tax', numeric: true, align: 'right', render: (r) => inr(r.net), sortValue: (r) => r.net, defaultHidden: true },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (r) => inr(r.total), sortValue: (r) => r.total },
  ];

  return (
    <ReportPage title={title} asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <StatStrip stats={[
            { label: 'Open', value: data.count },
            { label: 'Open value', value: data.value, display: inrShort(data.value), tone: 'primary' },
            { label: 'Past due date', value: data.late, tone: data.late ? 'warning' : 'success', onClick: () => setLateOnly(true) },
            { label: `${partyLabel}s`, value: new Set(data.rows.map((r) => r.cardCode)).size },
          ]} />
          <SectionCard flush>
            <FilterBar search={search} onSearch={setSearch} placeholder={`Search ${partyLabel.toLowerCase()} or number`}>
              <FacetChip label="Past due only" active={lateOnly} onClick={() => setLateOnly((v) => !v)} count={data.late} />
            </FilterBar>
            <DataTable rows={rows} columns={cols} getRowId={(r) => r.docEntry}
              storageKey={`kd-${path}`} exportName={title.toLowerCase().replace(/ /g, '-')} bare />
          </SectionCard>
        </Box>
      )}
    </ReportPage>
  );
}

export const SalesOrders = () => <OpenOrders path="/sales-orders" title="Sales orders" partyLabel="Customer" withPerson />;
export const PurchaseOrders = () => <OpenOrders path="/purchase-orders" title="Purchase orders" partyLabel="Vendor" />;
