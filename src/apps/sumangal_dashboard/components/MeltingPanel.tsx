import { Typography } from '@mui/material';
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded';
import TodayRounded from '@mui/icons-material/TodayRounded';
import WhatshotRounded from '@mui/icons-material/WhatshotRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import { ErrorNotice, KpiGrid, KpiTile, ListSkeleton, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import type { Filters } from '../filters';
import { monthLabel, num, pct, tonnes } from '../format';
import { Bars, Grid, ReportTable, RowBars } from './Charts';

interface Energy { mo: string; main: number; furnace: number; solar: number; gas: number; meltedTonnes: number | null; mainPerTonne: number | null }
interface Report {
  kpis: { heats: number; heatsPerDay: number | null; workingDays: number; castTonnes: number | null; chargeTonnes: number | null; yieldPct: number | null };
  heatMonths: { mo: string; heats: number; days: number }[]; kinds: { kind: string; tonnes: number | null }[]; items: { item: string; kind: string; tonnes: number | null }[]; energy: Energy[]; skipped: Record<string, number>;
}

/** Heats, what goes into the furnace, and what the meters read. */
export function MeltingPanel({ filters: f }: { filters: Filters }) {
  const { data: d, error, reload } = useReport<Report>(f.ready ? `/melting${f.query()}` : null);
  const cols: DataColumn<Energy>[] = [
    { key: 'mo', header: 'Month', sortValue: (r) => r.mo, render: (r) => monthLabel(r.mo) },
    { key: 'main', header: 'Main meter', numeric: true, align: 'right', sortValue: (r) => r.main, render: (r) => num(r.main) },
    { key: 'furnace', header: 'Melting furnace meter', numeric: true, align: 'right', sortValue: (r) => r.furnace, render: (r) => num(r.furnace) },
    { key: 'solar', header: 'Solar meters', numeric: true, align: 'right', sortValue: (r) => r.solar, render: (r) => num(r.solar) },
    { key: 'gas', header: 'Gas meters', numeric: true, align: 'right', sortValue: (r) => r.gas, render: (r) => num(r.gas) },
    { key: 'melted', header: 'Poured', numeric: true, align: 'right', sortValue: (r) => r.meltedTonnes, render: (r) => tonnes(r.meltedTonnes, 1) },
    { key: 'perT', header: 'Main meter per tonne', numeric: true, align: 'right', sortValue: (r) => r.mainPerTonne, render: (r) => num(r.mainPerTonne) },
  ];
  const skipped = d ? Object.values(d.skipped).reduce((a, b) => a + b, 0) : 0;
  if (error) return <ErrorNotice error={error} onRetry={reload} />;
  if (!d) return <ListSkeleton rows={6} />;
  return (
    <>
          <KpiGrid>
            <KpiTile label="Heats" info="Number of heats in the selected date range, for the metal filter. The footer gives the melting days, the days with at least one heat."icon={<LocalFireDepartmentRounded />} display={num(d.kpis.heats)} footer={`${num(d.kpis.workingDays)} melting days`} />
            <KpiTile label="Heats per melting day" info="Median number of heats on each melting day in the selected date range."icon={<TodayRounded />} display={num(d.kpis.heatsPerDay)} footer="Median" />
            <KpiTile label="Total charge" info="Tonnes charged into the furnace in the selected date range’s months: scrap, alloy and returns, for the metal filter."icon={<ScaleRounded />} display={tonnes(d.kpis.chargeTonnes)} footer="Scrap, alloy and returns" />
            <KpiTile label="Castings, of charge" info="Tonnes poured (kg through the Melting stage) as a percentage of the total charge in the same months. The footer gives the tonnes of castings."icon={<WhatshotRounded />} display={pct(d.kpis.yieldPct)} footer={`${tonnes(d.kpis.castTonnes)} of castings`} />
          </KpiGrid>
          <Grid>
            <SectionCard title="Heats by month" info="Heats in each month of the selected date range, for the metal filter."><Bars labels={d.heatMonths.map((m) => monthLabel(m.mo))} data={d.heatMonths.map((m) => m.heats)} format={(v) => num(v)} height={250} /></SectionCard>
            <SectionCard title="Charge mix" subtitle="Tonnes put into the furnace" info="Tonnes charged in the selected date range by kind: scrap, alloy and returns.">
              <RowBars rows={d.kinds.map((k) => ({ key: k.kind, label: k.kind, value: k.tonnes }))} format={(v) => `${num(v)} t`} />
            </SectionCard>
          </Grid>
          <SectionCard title="Scrap and alloys used" subtitle="Top items, tonnes" info="The 12 largest scrap and alloy items charged in the selected date range, in tonnes, with each item’s kind under it. Returns are not included.">
            <RowBars rows={d.items.map((i) => ({ key: i.item, label: i.item, value: i.tonnes, sub: i.kind }))} format={(v) => `${v.toFixed(1)} t`} />
          </SectionCard>
          <SectionCard title="Main meter per tonne poured" subtitle="Meter units, by month" info="Main meter units used in each month divided by the tonnes poured that month. Meter readings are running totals, so the change between readings is used; a fall, or a jump over 10 times the usual day, is not counted."><Bars labels={d.energy.map((m) => monthLabel(m.mo))} data={d.energy.map((m) => m.mainPerTonne)} format={(v) => num(v)} height={220} /></SectionCard>
          <SectionCard title="Meter readings by month" subtitle="Meter units" flush info="Meter units used each month on the main, melting furnace, solar and gas meters (solar and gas are sums of their meters), with tonnes poured and main meter per tonne. Each change between readings is credited to the month of the later reading; falls and jumps over 10 times the usual day are not counted."><ReportTable rows={d.energy} columns={cols} getRowId={(r) => r.mo} bare pageSize={24} defaultSortKey="mo" defaultSortDir="desc" /></SectionCard>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Meter figures are in meter units, as entered. Readings that fall, or jump over 10 times the usual day, aren’t counted{skipped ? ` (${skipped} in this period)` : ''}. Energy covers the whole plant.</Typography>
    </>
  );
}
