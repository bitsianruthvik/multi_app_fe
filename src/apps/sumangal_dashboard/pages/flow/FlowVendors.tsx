import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../../api';
import { useFilters } from '../../filters';
import { monthLabel } from '../../format';
import { ReportTable } from '../../components/Charts';
import { StackedBars } from '../../components/FlowParts';
import { fmtDays, fmtN, fmtT } from '../../components/flowFormat';
import { Page } from '../../components/Page';

type Mode = 'asis' | 'historic';
/** What a line can be grouped by. Product line (family) and casting (component) come from the reviewed part-name groups. */
type Dim = 'vendor' | 'family' | 'component' | 'process';
type Drill = Dim | 'none';

const DIM_LABEL: Record<Dim, string> = { vendor: 'Vendor', family: 'Product line', component: 'Casting', process: 'Process' };
const ALL_DIMS: Dim[] = ['vendor', 'family', 'component', 'process'];

/** Volume and turnaround for a group of outward lines. Tonnes are slip weight. */
interface Stats {
  lines: number;
  tonnes: number;
  perMonth: number;
  backLines: number;
  medianTat: number | null;
  p90Tat: number | null;
  outT: number;
}
type PivotRow = Stats & { key: string; partNames: number } & Partial<Record<Dim, string>>;
interface Report {
  asOf: string; mode: Mode; from: string; to: string; months: number;
  kpis: Stats & { vendors: number; parts: number };
  topVendors: string[];
  monthly: { mo: string; tonnes: Record<string, number> }[];
}
interface PivotReport { dims: Dim[]; pivot: PivotRow[] }

const pivotColumns = (dims: Dim[]): DataColumn<PivotRow>[] => [
  ...dims.map((dim, i): DataColumn<PivotRow> => ({
    key: dim,
    header: DIM_LABEL[dim],
    alwaysVisible: i === 0,
    sortValue: (r) => r[dim] ?? '',
    render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: i === 0 ? 600 : 400, maxWidth: 240 }} title={r[dim] ?? ''}>{r[dim] ?? ''}</Typography>,
  })),
  { key: 'partNames', header: 'Part names', numeric: true, align: 'right', sortValue: (r) => r.partNames, render: (r) => fmtN(r.partNames) },
  { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => fmtT(r.tonnes) },
  { key: 'perMonth', header: 'Tonnes a month', numeric: true, align: 'right', sortValue: (r) => r.perMonth, render: (r) => fmtT(r.perMonth) },
  { key: 'medianTat', header: 'Turnaround, median', numeric: true, align: 'right', sortValue: (r) => r.medianTat, render: (r) => fmtDays(r.medianTat) },
  { key: 'p90Tat', header: 'Turnaround, 9 in 10', numeric: true, align: 'right', sortValue: (r) => r.p90Tat, render: (r) => fmtDays(r.p90Tat) },
  { key: 'outT', header: 'Still out', numeric: true, align: 'right', sortValue: (r) => r.outT, render: (r) => fmtT(r.outT) },
  { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => fmtN(r.lines) },
];

/**
 * One card: rows are the primary grouping, and "Split by" and "then by" expand each row into the next level(s).
 * Each combination is its own row, sorted by tonnes. The server groups the lines for the chosen levels.
 */
function PivotCard({ mode, title, info, fixed, choices, defaultPrimary, defaultSplit }: {
  mode: Mode; title: string; info: string; fixed?: Dim; choices?: Dim[]; defaultPrimary: Dim; defaultSplit: [Drill, Drill];
}) {
  const f = useFilters();
  const [picked, setPicked] = useState<Dim>(defaultPrimary);
  const primary: Dim = fixed ?? picked;
  const [s1Raw, setS1] = useState<Drill>(defaultSplit[0]);
  const [s2Raw, setS2] = useState<Drill>(defaultSplit[1]);

  const drillOpts = ALL_DIMS.filter((x) => x !== primary);
  const s1: Drill = s1Raw !== 'none' && drillOpts.includes(s1Raw) ? s1Raw : 'none';
  const s2: Drill = s1 !== 'none' && s2Raw !== 'none' && drillOpts.includes(s2Raw) && s2Raw !== s1 ? s2Raw : 'none';
  const by = [primary, s1, s2].filter((x): x is Dim => x !== 'none');

  const { data, error, loading, reload } = useReport<PivotReport>(f.ready ? `/flow/vendors${f.query({ mode, by: by.join(',') })}` : null);

  return (
    <SectionCard
      flush
      title={title}
      subtitle={by.map((x) => DIM_LABEL[x]).join(' › ')}
      info={info}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, px: 2, pt: 1.5, pb: 1 }}>
        {choices && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 110 }}>Group rows by</Typography>
            <ToggleButtonGroup size="small" exclusive value={primary} onChange={(_, v: Dim | null) => { if (v) setPicked(v); }}>
              {choices.map((x) => <ToggleButton key={x} value={x}>{DIM_LABEL[x]}</ToggleButton>)}
            </ToggleButtonGroup>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 110 }}>Split by</Typography>
          <ToggleButtonGroup size="small" exclusive value={s1} onChange={(_, v: Drill | null) => { if (v) setS1(v); }}>
            <ToggleButton value="none">None</ToggleButton>
            {drillOpts.map((x) => <ToggleButton key={x} value={x}>{DIM_LABEL[x]}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 'inherit', fontWeight: 600, minWidth: 110, color: s1 === 'none' ? 'text.disabled' : undefined }}>Then split by</Typography>
          <ToggleButtonGroup size="small" exclusive disabled={s1 === 'none'} value={s2} onChange={(_, v: Drill | null) => { if (v) setS2(v); }}>
            <ToggleButton value="none">None</ToggleButton>
            {drillOpts.filter((x) => x !== s1).map((x) => <ToggleButton key={x} value={x}>{DIM_LABEL[x]}</ToggleButton>)}
          </ToggleButtonGroup>
        </Box>
      </Box>
      {error && <Typography sx={{ px: 2, pb: 2, color: 'error.main', fontSize: 'inherit' }} onClick={reload}>Could not load this split. Try again.</Typography>}
      {loading && !data && <Typography sx={{ px: 2, pb: 2, fontSize: 'inherit' }}>Loading…</Typography>}
      {data && (
        <ReportTable rows={data.pivot} columns={pivotColumns(data.dims)} getRowId={(r) => r.key} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" empty="No castings in this window." />
      )}
    </SectionCard>
  );
}

const FOOTNOTE = 'Castings sent out to job-work vendors, from the outward slips. Product line and casting come from a reviewed list of part names; a name not on the list shows as Unclassified, and “Unclear” means the part name does not say which product line it belongs to. Use the split controls to break each row down further; each combination is its own row. Turnaround is the days from sent to fully back, counted only on lines that have come fully back, so lines still out are not in it. Still out is the weight not yet back on the last data day. Tonnes a month is over the calendar months in the window. As-is is the last six calendar months; Historic is the chosen dates. Vendors named “Fettling (ERP code …)” are contract fettling, recorded in the ERP only by code.';

export default function FlowVendors({ mode }: { mode: Mode }) {
  const f = useFilters();
  const historic = mode === 'historic';
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/vendors${f.query({ mode, by: 'vendor' })}` : null);

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
      footnote={FOOTNOTE}
    >
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Vendors" info="Job-work vendors that had castings sent out in the window." display={fmtN(d.kpis.vendors)} />
            <KpiTile label="Part names" info="Part names sent out to a vendor in the window." display={fmtN(d.kpis.parts)} />
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

          <PivotCard
            mode={mode}
            title="By vendor"
            info="Each vendor's castings. Split by product line, casting or process to see what each vendor sends, then split further if needed."
            fixed="vendor"
            defaultPrimary="vendor"
            defaultSplit={['family', 'none']}
          />

          <PivotCard
            mode={mode}
            title="By product line or casting"
            info="Each product line, or each casting type, with the vendors and processes that make it. Switch which grouping the rows show, then split further."
            choices={['family', 'component']}
            defaultPrimary="family"
            defaultSplit={['vendor', 'none']}
          />
        </>
      )}
    </Page>
  );
}
