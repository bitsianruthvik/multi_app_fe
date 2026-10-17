import { useReport, type AgeingReport } from '../api';
import { ReportPage } from '../components/ReportPage';
import { AgeingView } from '../components/AgeingView';

export function Receivables() {
  const { data, error, loading, reload } = useReport<AgeingReport>('/receivables');
  return (
    <ReportPage title="Receivables" subtitle="Open A/R invoices by days past due"
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && <AgeingView report={data} partyLabel="Customer" kind="receivables" />}
    </ReportPage>
  );
}

export function Payables() {
  const { data, error, loading, reload } = useReport<AgeingReport>('/payables');
  return (
    <ReportPage title="Payables" subtitle="Open A/P invoices by days past due"
      asOf={data?.asOf} loading={loading} error={error} reload={reload} hasData={!!data}>
      {data && <AgeingView report={data} partyLabel="Vendor" kind="payables" />}
    </ReportPage>
  );
}
