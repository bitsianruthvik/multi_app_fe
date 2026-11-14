import { Box, Stack, Typography } from '@mui/material';
import CallSplitRounded from '@mui/icons-material/CallSplitRounded';
import ScaleRounded from '@mui/icons-material/ScaleRounded';
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import { KpiGrid, KpiTile, SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dayCount, monthLabel, num, pct } from '../format';
import { Big, Grid, Lines, ReportTable, RowBars } from '../components/Charts';
import { Page } from '../components/Page';
import { TL } from '../components/timelineStyle';

interface W { label: string; subBatches: number; pieces: number | null; kg: number | null }
interface Report {
  kpis: { batches: number; splitPct: number | null; subsMedian: number | null; subKg: number | null; evenPct: number | null; sib: number | null; after: number | null; sameDayPct: number | null; p2iSplit: number | null; p2iUnsplit: number | null };
  subsDist: { label: string; batches: number }[]; byWeight: W[]; months: { mo: string; sib: number | null; after: number | null }[];
}

/** How batches are split into sub-batches, and whether the sub-batches hold each other up. */
export default function Batches() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/batches${f.query()}` : null);
  const k = d?.kpis;
  const cols: DataColumn<W>[] = [
    { key: 'label', header: 'Piece weight', render: (r) => <b>{r.label}</b> },
    { key: 'n', header: 'Sub-batches', numeric: true, align: 'right', render: (r) => num(r.subBatches) },
    { key: 'pcs', header: 'Pieces in one (median)', numeric: true, align: 'right', render: (r) => num(r.pieces) },
    { key: 'kg', header: 'Kg in one (median)', numeric: true, align: 'right', render: (r) => num(r.kg) },
  ];
  return (
    <Page title="Batches and sub-batches" question="How each batch is split, and whether the sub-batches wait on each other." filters={f} filterKeys={['customer', 'market', 'finish', 'metal']} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Regular batches started in the period. Sub-batches are the lettered parts of a batch (A, B, C...) in the ERP. Waiting for the others is the days from a sub-batch's own last pour to the last pour of its batch; after that, the days until its first inspection. Averages per batch, medians across batches.">
      {d && k && (
        <>
          <KpiGrid>
            <KpiTile label="Batches split into sub-batches" icon={<CallSplitRounded />} display={pct(k.splitPct)} footer={`${num(k.batches)} batches · median ${k.subsMedian ?? '—'} sub-batches`} info="Share of regular batches started in the selected period that were split into more than one sub-batch. The footer gives the batch count and the median number of sub-batches in the split batches." />
            <KpiTile label="Metal in one sub-batch" icon={<ScaleRounded />} display={`${num(k.subKg)} kg`} footer="Median, about one furnace heat" info="Median kilograms in one sub-batch, across all sub-batches of regular batches started in the selected period. Kilograms are pieces times piece weight." />
            <KpiTile label="Split evenly" icon={<FactCheckRounded />} display={pct(k.evenPct)} footer="Equal sizes, smaller last one" info="Share of split batches where every sub-batch has the same number of pieces, except that the last one may be the same or smaller." />
            <KpiTile label="Waiting for the other sub-batches" icon={<HourglassBottomRounded />} display={dayCount(k.sib)} footer={`Then ${dayCount(k.after)} until inspection`} info="Median days a split batch’s sub-batch waits, from its own last pour until the last pour of its batch. The footer gives the median days from that point until the first inspection." />
          </KpiGrid>
          <Grid>
            <SectionCard title="Where a split batch's time goes after pouring" info="For split batches started in the selected period: median days waiting for the other sub-batches to be poured, and median days from the last pour to inspection. The text gives how often all sub-batches of a batch were first inspected on the same day, and median poured-to-inspected days for split and unsplit batches.">
              <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
                <Big size={26} value={dayCount(k.sib)} label="Waiting for the other sub-batches to be poured" />
                <Big size={26} value={dayCount(k.after)} label="After the last one is poured, until inspection" tone="warning" />
              </Stack>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>All sub-batches of a batch are first inspected on the same day in {pct(k.sameDayPct)} of split batches. Poured to inspected: {dayCount(k.p2iSplit)} for split batches, {dayCount(k.p2iUnsplit)} for batches not split.</Typography>
            </SectionCard>
            <SectionCard title="Sub-batches per batch" info="Regular batches started in the selected period, counted by how many sub-batches each was split into. Seven or more are grouped together."><RowBars rows={d.subsDist.map((s) => ({ key: s.label, label: s.label, value: s.batches }))} format={(v) => `${num(v)} batches`} /></SectionCard>
          </Grid>
          <SectionCard title="Size of a sub-batch, by piece weight" subtitle="Lighter parts get more pieces; the metal stays near one heat" flush info="Sub-batches of regular batches started in the selected period, grouped by the weight of one piece. For each group: the number of sub-batches, and the median pieces and kilograms in one sub-batch.">
            <ReportTable rows={d.byWeight} columns={cols} getRowId={(r) => r.label} bare pageSize={10} />
          </SectionCard>
          <SectionCard title="Split batches: days waiting, by month started" subtitle="Median" info="Median days by month started, for split batches that have an inspection date: days waiting for the other sub-batches, and days from the last pour to inspection.">
            <Box><Lines labels={d.months.map((m) => monthLabel(m.mo))} format={(v) => `${v}d`} height={260} series={[{ label: 'After the last sub-batch is poured, until inspection', data: d.months.map((m) => m.after), color: TL.post }, { label: 'Waiting for the other sub-batches', data: d.months.map((m) => m.sib), color: 'var(--c-primary-500)' }]} /></Box>
          </SectionCard>
        </>
      )}
    </Page>
  );
}
