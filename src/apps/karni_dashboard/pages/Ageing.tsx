import { useReport, type PartyBook } from '../api';
import { ReportPage } from '../components/ReportPage';
import { AgeingView } from '../components/AgeingView';
import { useFilters } from '../filters';

export function Receivables() {
  const f = useFilters();
  const { data, error, loading, reload } = useReport<PartyBook>(`/receivables${f.query(false)}`);
  return (
    <ReportPage title="Receivables" subtitle="Customer dues and collections" filters={f} range={false}
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && <AgeingView report={data} partyLabel="Customer" kind="receivables" />}
    </ReportPage>
  );
}

export function Payables() {
  const f = useFilters();
  const { data, error, loading, reload } = useReport<PartyBook>(`/payables${f.query(false)}`);
  return (
    <ReportPage title="Payables" subtitle="Vendor dues and payments" filters={f} range={false}
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && <AgeingView report={data} partyLabel="Vendor" kind="payables" />}
    </ReportPage>
  );
}
