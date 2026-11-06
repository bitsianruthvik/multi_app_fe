import { useState } from 'react';
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import RecyclingRounded from '@mui/icons-material/RecyclingRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import WhatshotRounded from '@mui/icons-material/WhatshotRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { monthLabel, num, pct, tonnes } from '../format';
import { Bars, Grid, ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';
import { YieldMatrix } from '../components/YieldMatrix';

interface Row { key: string | number; name: string; pouredTonnes: number | null; rejectedKg: number; pct: number | null }
interface Dept { department: string; rejectedKg: number; pct: number | null; control: number | null }
interface Report {
  kpis: { rejectedKg: number; pieces: number; pouredTonnes: number | null; pct: number | null };
  stages: { stage: string; inputTonnes: number | null; rejectedKg: number; pct: number | null }[]; reasons: { reason: string; kg: number; pieces: number; share: number | null }[];
  customers: Row[]; parts: Row[]; metals: Row[]; departments: Dept[]; months: { mo: string; pct: number | null }[];
}
const VIEWS = [['parts', 'Part'], ['customers', 'Customer'], ['metals', 'Metal']] as const;

/** Rejection by stage, reason, part, customer and metal. */
export default function Quality() {
  const f = useFilters();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('parts');
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/quality${f.query()}` : null);
  const cols: DataColumn<Row>[] = [
    { key: 'name', header: VIEWS.find((v) => v[0] === view)?.[1] ?? '', sortValue: (r) => r.name, render: (r) => <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600, maxWidth: 320 }} title={r.name}>{r.name}</Typography> },
    { key: 'poured', header: 'Poured', numeric: true, align: 'right', sortValue: (r) => r.pouredTonnes, render: (r) => tonnes(r.pouredTonnes, 1) },
    { key: 'rejected', header: 'Rejected kg', numeric: true, align: 'right', sortValue: (r) => r.rejectedKg, render: (r) => num(r.rejectedKg) },
    { key: 'pct', header: 'Rejected %', numeric: true, align: 'right', sortValue: (r) => r.pct, render: (r) => <b>{pct(r.pct, 1)}</b> },
  ];
  const deptCols: DataColumn<Dept>[] = [
    { key: 'department', header: 'Department on the rejection reason', sortValue: (r) => r.department, render: (r) => <b>{r.department}</b> },
    { key: 'rejected', header: 'Rejected kg', numeric: true, align: 'right', sortValue: (r) => r.rejectedKg, render: (r) => num(r.rejectedKg) },
    { key: 'pct', header: '% of metal poured', numeric: true, align: 'right', sortValue: (r) => r.pct, render: (r) => pct(r.pct, 2) },
    { key: 'control', header: 'Control % in the ERP', numeric: true, align: 'right', sortValue: (r) => r.control, render: (r) => pct(r.control, 2) },
  ];
  return (
    <Page title="Rejection" question="How much is rejected, where, why and on what." filters={f} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Rejected weight is rejected pieces times raw casting weight. Stage % is rejected kg over kg entering that stage; other % are over metal poured in the same period.">
      {d && (
        <>
          <KpiGrid>
            <KpiTile label="Rejected, of metal poured" icon={<RecyclingRounded />} display={pct(d.kpis.pct, 1)} />
            <KpiTile label="Rejected weight" icon={<ScaleRounded />} display={tonnes(d.kpis.rejectedKg / 1000, 1)} footer={`${num(d.kpis.pieces)} pieces`} />
            <KpiTile label="Metal poured" icon={<WhatshotRounded />} display={tonnes(d.kpis.pouredTonnes)} />
          </KpiGrid>
          <Grid>
            <SectionCard title="By stage" subtitle="Rejected % of what entered the stage">
              <RowBars rows={d.stages.map((s) => ({ key: s.stage, label: s.stage, value: s.pct, sub: `${num(s.rejectedKg)} kg of ${tonnes(s.inputTonnes)}` }))} format={(v) => `${v.toFixed(2)}%`} />
            </SectionCard>
            <SectionCard title="By reason" subtitle="Top reasons by rejected weight">
              <RowBars rows={d.reasons.slice(0, 9).map((r) => ({ key: r.reason, label: r.reason, value: r.kg, sub: `${pct(r.share)} of rejected weight · ${num(r.pieces)} pieces` }))} format={(v) => `${num(v)} kg`} />
            </SectionCard>
          </Grid>
          <YieldMatrix filters={f} />
          <SectionCard title="Rejected by" flush actions={(
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              {VIEWS.map(([k, l]) => <ToggleButton key={k} value={k} sx={{ textTransform: 'none', py: 0.3 }}>{l}</ToggleButton>)}
            </ToggleButtonGroup>
          )}>
            <ReportTable key={view} rows={d[view]} columns={cols} getRowId={(r) => r.key} bare pageSize={12} defaultSortKey="rejected" defaultSortDir="desc" empty="Nothing for these filters." />
          </SectionCard>
          <Grid cols="3fr 2fr">
            <SectionCard title="By department" flush><Stack><ReportTable rows={d.departments} columns={deptCols} getRowId={(r) => r.department} bare pageSize={10} defaultSortKey="rejected" defaultSortDir="desc" /></Stack></SectionCard>
            <SectionCard title="By month" subtitle="Rejected in the month, over metal poured in the month"><Bars labels={d.months.map((m) => monthLabel(m.mo))} data={d.months.map((m) => m.pct)} format={(v) => `${v.toFixed(1)}%`} height={260} /></SectionCard>
          </Grid>
        </>
      )}
    </Page>
  );
}
