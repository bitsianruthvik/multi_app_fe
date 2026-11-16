import { Typography } from '@mui/material';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { dateLabel, monthLabel } from '../../format';
import { ReportTable } from '../../components/Charts';
import { StackedBars } from '../../components/FlowParts';
import { fmtDays, fmtN, fmtT } from '../../components/flowFormat';
import { Page } from '../../components/Page';

type Mode = 'asis' | 'historic';

/** Volume and turnaround for one vendor, or one vendor, process and part type. Tonnes are slip weight. */
interface Stats {
  lines: number;
  tonnes: number;
  perMonth: number;
  backLines: number;
  medianTat: number | null;
  p90Tat: number | null;
  outT: number;
  lastSent: string;
}
interface VendorRow extends Stats { vendor: string; processes: string[]; parts: number }
interface PartRow extends Stats { key: string; vendor: string; process: string; part: string }
interface Report {
  asOf: string; mode: Mode; from: string; to: string; months: number;
  kpis: Stats & { vendors: number; parts: number };
  topVendors: string[];
  monthly: { mo: string; tonnes: Record<string, number> }[];
  vendors: VendorRow[];
  rows: PartRow[];
}

const VENDOR_COLS: DataColumn<VendorRow>[] = [
  { key: 'vendor', header: 'Vendor', alwaysVisible: true, sortValue: (r) => r.vendor, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 240 }} title={r.vendor}>{r.vendor}</Typography> },
  { key: 'processes', header: 'Processes', sortValue: (r) => r.processes.join(', '), render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 220 }} title={r.processes.join(', ')}>{r.processes.join(', ')}</Typography> },
  { key: 'parts', header: 'Part types', numeric: true, align: 'right', sortValue: (r) => r.parts, render: (r) => fmtN(r.parts) },
  { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => fmtT(r.tonnes) },
  { key: 'perMonth', header: 'Tonnes a month', numeric: true, align: 'right', sortValue: (r) => r.perMonth, render: (r) => fmtT(r.perMonth) },
  { key: 'medianTat', header: 'Turnaround, median', numeric: true, align: 'right', sortValue: (r) => r.medianTat, render: (r) => fmtDays(r.medianTat) },
  { key: 'p90Tat', header: 'Turnaround, 9 in 10', numeric: true, align: 'right', sortValue: (r) => r.p90Tat, render: (r) => fmtDays(r.p90Tat) },
  { key: 'outT', header: 'Still out', numeric: true, align: 'right', sortValue: (r) => r.outT, render: (r) => fmtT(r.outT) },
  { key: 'lastSent', header: 'Last sent', sortValue: (r) => r.lastSent, render: (r) => dateLabel(r.lastSent) },
];

const PART_COLS: DataColumn<PartRow>[] = [
  { key: 'part', header: 'Part type', alwaysVisible: true, sortValue: (r) => r.part, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 300 }} title={r.part}>{r.part}</Typography> },
  { key: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 220 }} title={r.vendor}>{r.vendor}</Typography> },
  { key: 'process', header: 'Process', sortValue: (r) => r.process, render: (r) => r.process },
  { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => fmtT(r.tonnes) },
  { key: 'perMonth', header: 'Tonnes a month', numeric: true, align: 'right', sortValue: (r) => r.perMonth, render: (r) => fmtT(r.perMonth) },
  { key: 'medianTat', header: 'Turnaround, median', numeric: true, align: 'right', sortValue: (r) => r.medianTat, render: (r) => fmtDays(r.medianTat) },
  { key: 'p90Tat', header: 'Turnaround, 9 in 10', numeric: true, align: 'right', sortValue: (r) => r.p90Tat, render: (r) => fmtDays(r.p90Tat) },
  { key: 'outT', header: 'Still out', numeric: true, align: 'right', sortValue: (r) => r.outT, render: (r) => fmtT(r.outT) },
  { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => fmtN(r.lines) },
];

const VENDOR_NOTE = 'Castings sent out to job-work vendors, from the outward slips. A part type is the part name, as on the Customer screen. Turnaround is the days from sent to fully back, counted only on lines that have come fully back, so lines still out are not in it. Still out is the weight not yet back on the last data day. Tonnes a month is over the calendar months in the window. As-is is the last six calendar months; Historic is the chosen dates. Vendors named “Fettling (ERP code …)” are contract fettling, recorded in the ERP only by code.';

export default function FlowVendors({ mode }: { mode: Mode }) {
  const f = useFilters();
  const historic = mode === 'historic';
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/vendors${f.query({ mode })}` : null);

  return (
    <Page
      title={historic ? 'Vendors · Historic' : 'Vendors · As-is'}
      question={historic
        ? 'Which vendor does which part type, how much a month, and how long the castings take to come back, over the chosen dates.'
        : 'Which vendor does which part type, how much a month over the last six months, and how long the castings take to come back.'}
      filters={f}
      filterKeys={[]}
      period={historic}
      loading={loading}
      error={error}
      reload={reload}
      hasData={!!d}
      footnote={VENDOR_NOTE}
    >
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Vendors" info="Job-work vendors that had castings sent out in the window." display={fmtN(d.kpis.vendors)} />
            <KpiTile label="Part types" info="Part names sent out to a vendor in the window." display={fmtN(d.kpis.parts)} />
            <KpiTile label="Tonnes a month" info="Tonnes sent out, averaged over the calendar months in the window." display={fmtT(d.kpis.perMonth)} footer={`${fmtT(d.kpis.tonnes)} in ${d.months} month${d.months === 1 ? '' : 's'}`} />
            <KpiTile label="Turnaround, median" info="Median days from sent to fully back, over lines that have come fully back in the window." display={fmtDays(d.kpis.medianTat)} footer={`9 in 10 within ${fmtDays(d.kpis.p90Tat)}`} />
            <KpiTile label="Still out" info="Tonnes not yet back on the last data day, for lines sent in the window." display={fmtT(d.kpis.outT)} />
          </KpiGrid>

          <SectionCard title="Tonnes sent each month, by vendor" info={`Tonnes sent out each calendar month. The ${d.topVendors.length} largest vendors in the window are shown separately; the rest are grouped as Other.`}>
            <StackedBars
              labels={d.monthly.map((m) => monthLabel(m.mo))}
              series={[...d.topVendors, 'Other'].map((v) => ({ label: v, data: d.monthly.map((m) => m.tonnes[v] ?? 0) }))}
              format={fmtT}
              height={300}
            />
          </SectionCard>

          <SectionCard flush title="Vendors" subtitle="Largest first" info="One row per vendor in the window. Turnaround and still-out figures follow the same rules as the footnote.">
            <ReportTable rows={d.vendors} columns={VENDOR_COLS} getRowId={(r) => r.vendor} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" empty="No vendor castings in this window." />
          </SectionCard>

          <SectionCard flush title="Which vendor makes which part type" subtitle="Largest first" info="One row per vendor, process and part type in the window. A part can go to more than one vendor or process; each combination has its own row.">
            <ReportTable rows={d.rows} columns={PART_COLS} getRowId={(r) => r.key} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" empty="No part types in this window." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
