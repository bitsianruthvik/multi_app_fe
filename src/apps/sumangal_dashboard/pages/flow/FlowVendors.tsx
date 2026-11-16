import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
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
type Axis = 'family' | 'component';
interface GroupRow extends Stats { key: string; group: string; vendor: string; process: string; partNames: number }
interface Report {
  asOf: string; mode: Mode; from: string; to: string; months: number; axis: Axis;
  kpis: Stats & { vendors: number; parts: number; groups: number };
  topVendors: string[];
  monthly: { mo: string; tonnes: Record<string, number> }[];
  vendors: VendorRow[];
  groupRows: GroupRow[];
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

const GROUP_COLS = (axisLabel: string): DataColumn<GroupRow>[] => [
  { key: 'group', header: axisLabel, alwaysVisible: true, sortValue: (r) => r.group, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 240 }} title={r.group}>{r.group}</Typography> },
  { key: 'vendor', header: 'Vendor', sortValue: (r) => r.vendor, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', maxWidth: 220 }} title={r.vendor}>{r.vendor}</Typography> },
  { key: 'process', header: 'Process', sortValue: (r) => r.process, render: (r) => r.process },
  { key: 'partNames', header: 'Part names', numeric: true, align: 'right', sortValue: (r) => r.partNames, render: (r) => fmtN(r.partNames) },
  { key: 'tonnes', header: 'Tonnes', numeric: true, align: 'right', sortValue: (r) => r.tonnes, render: (r) => fmtT(r.tonnes) },
  { key: 'perMonth', header: 'Tonnes a month', numeric: true, align: 'right', sortValue: (r) => r.perMonth, render: (r) => fmtT(r.perMonth) },
  { key: 'medianTat', header: 'Turnaround, median', numeric: true, align: 'right', sortValue: (r) => r.medianTat, render: (r) => fmtDays(r.medianTat) },
  { key: 'p90Tat', header: 'Turnaround, 9 in 10', numeric: true, align: 'right', sortValue: (r) => r.p90Tat, render: (r) => fmtDays(r.p90Tat) },
  { key: 'outT', header: 'Still out', numeric: true, align: 'right', sortValue: (r) => r.outT, render: (r) => fmtT(r.outT) },
  { key: 'lines', header: 'Lines', numeric: true, align: 'right', sortValue: (r) => r.lines, render: (r) => fmtN(r.lines) },
];

const AXIS_LABEL: Record<Axis, string> = { family: 'Product line', component: 'Casting' };

const VENDOR_NOTE = 'Castings sent out to job-work vendors, from the outward slips. Part types are grouped on two axes, chosen with the switch: the casting (body, bonnet, cage and so on) and the product line (ball valve, pump and so on). The groups come from a reviewed list of part names, and a name not yet on the list shows as Unclassified. “Unclear” means the part name does not say which product line it belongs to. Turnaround is the days from sent to fully back, counted only on lines that have come fully back, so lines still out are not in it. Still out is the weight not yet back on the last data day. Tonnes a month is over the calendar months in the window. As-is is the last six calendar months; Historic is the chosen dates. Vendors named “Fettling (ERP code …)” are contract fettling, recorded in the ERP only by code.';

export default function FlowVendors({ mode }: { mode: Mode }) {
  const f = useFilters();
  const historic = mode === 'historic';
  const [axis, setAxis] = useState<Axis>('family');
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/flow/vendors${f.query({ mode, group: axis })}` : null);

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
            <KpiTile label={`Part groups, by ${AXIS_LABEL[axis].toLowerCase()}`} info="Groups of part names sent out in the window, on the axis chosen below." display={fmtN(d.kpis.groups)} footer={`${fmtN(d.kpis.parts)} part names`} />
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
            <Typography sx={{ fontSize: 'inherit', fontWeight: 600 }}>Group part names by</Typography>
            <ToggleButtonGroup size="small" exclusive value={axis} onChange={(_, v: Axis | null) => { if (v) setAxis(v); }}>
              <ToggleButton value="family">Product line</ToggleButton>
              <ToggleButton value="component">Casting</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <SectionCard flush title={`Which vendor makes which ${axis === 'family' ? 'product line' : 'casting'}`} subtitle="Largest first" info={`One row per ${axis === 'family' ? 'product line' : 'casting type'}, vendor and process in the window. A group can go to more than one vendor or process; each combination has its own row. “Unclear” means the part names do not say which ${axis === 'family' ? 'product line' : 'casting'} they are.`}>
            <ReportTable rows={d.groupRows} columns={GROUP_COLS(AXIS_LABEL[axis])} getRowId={(r) => r.key} bare pageSize={15} defaultSortKey="tonnes" defaultSortDir="desc" empty="No part groups in this window." />
          </SectionCard>
        </>
      )}
    </Page>
  );
}
