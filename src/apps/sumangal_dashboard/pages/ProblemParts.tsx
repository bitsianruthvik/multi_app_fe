import { useState } from 'react';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { SectionCard, type DataColumn } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { monthLabel, num, pct, tonnes } from '../format';
import { Big, Grid, ReportTable, ValueBar } from '../components/Charts';
import { Page } from '../components/Page';
import { PartSheet } from '../components/Sheets';

interface Part { die: number; name: string; customer: string; pouredKg: number; rejectedKg: number; pct: number | null; prevPouredKg: number; prevRejectedKg: number; prevPct: number | null; topReason: string | null; changePts?: number | null }
interface Span { first: string; last: string }
interface Report { months: number; now: Span; prev: Span; minPouredT: number; rejectedKg: number; partsPoured: number; partsWithRejects: number; partsForHalf: number; ranked: Part[]; worse: Part[]; better: Part[] }
const span = (s: Span) => `${monthLabel(s.first)} to ${monthLabel(s.last)}`;
const VIEWS = [['ranked', 'Most rejected'], ['worse', 'Getting worse'], ['better', 'Getting better']] as const;

/** A few parts make most of the rejected weight: which ones, and which way they're going. */
export default function ProblemParts() {
  const f = useFilters();
  const [months, setMonths] = useState('6');
  const [view, setView] = useState<(typeof VIEWS)[number][0]>('ranked');
  const [part, setPart] = useState<number | null>(null);
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/problem-parts${f.query({ months })}` : null);
  const max = d ? Math.max(1, ...d.ranked.map((r) => r.rejectedKg)) : 1;
  const name = (r: Part) => <Box sx={{ maxWidth: 300 }}><Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600 }} title={r.name}>{r.name}</Typography><Typography noWrap sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.customer}</Typography></Box>;
  const base: DataColumn<Part>[] = [
    { key: 'name', header: 'Part', alwaysVisible: true, sortValue: (r) => r.name, render: name },
    { key: 'rejected', header: 'Rejected kg', sortValue: (r) => r.rejectedKg, render: (r) => <ValueBar value={r.rejectedKg} max={max} label={num(r.rejectedKg)} color="var(--c-danger-600)" /> },
    { key: 'poured', header: 'Poured', numeric: true, align: 'right', sortValue: (r) => r.pouredKg, render: (r) => tonnes(r.pouredKg / 1000, 1) },
    { key: 'pct', header: 'Rejected %', numeric: true, align: 'right', sortValue: (r) => r.pct, render: (r) => <b>{pct(r.pct, 1)}</b> },
    { key: 'prev', header: 'Period before', numeric: true, align: 'right', sortValue: (r) => r.prevPct, render: (r) => pct(r.prevPct, 1) },
  ];
  const change: DataColumn<Part> = { key: 'change', header: 'Change, points', numeric: true, align: 'right', sortValue: (r) => r.changePts, render: (r) => <Box component="span" sx={{ fontWeight: 800, color: (r.changePts ?? 0) > 0 ? 'var(--c-danger-600)' : 'var(--c-success-600)' }}>{(r.changePts ?? 0) > 0 ? '+' : ''}{r.changePts}</Box> };
  const reason: DataColumn<Part> = { key: 'reason', header: 'Top reason', sortValue: (r) => r.topReason, render: (r) => r.topReason ?? '—' };
  const cols = view === 'ranked' ? [...base, reason] : [...base, change, reason];
  return (
    <Page title="Problem parts" question={d ? `${span(d.now)}, against ${span(d.prev)}` : 'The parts behind most of the rejected weight.'} filters={f} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote={d ? `Rejected weight in the period over metal poured in the period, so a part’s % can include castings poured earlier. “Getting worse” and “Getting better” cover parts with at least ${d.minPouredT} t poured in both periods. Select a part for its reasons and stages.` : undefined}>
      {d && (
        <>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Compare the last</Typography>
            <ToggleButtonGroup size="small" exclusive value={months} onChange={(_, v) => v && setMonths(v)}>
              {['3', '6', '12'].map((m) => <ToggleButton key={m} value={m} sx={{ textTransform: 'none', py: 0.3, px: 1.5 }}>{m} months</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>with the {d.months} before</Typography>
          </Stack>
          <SectionCard info="Figures for the window set by Compare the last, the complete calendar months ending with the last data month. Parts make half counts the most-rejected parts needed to reach half of all rejected kg. Rejected is the total rejected weight in the window, and Parts with any rejection counts parts with some rejected kg.">
            <Grid cols="1fr 1fr 1fr">
              <Big value={num(d.partsForHalf)} label="Parts make half of rejected weight" help={`Out of ${num(d.partsPoured)} parts poured`} />
              <Big value={tonnes(d.rejectedKg / 1000, 1)} label="Rejected in this period" />
              <Big value={num(d.partsWithRejects)} label="Parts with any rejection" />
            </Grid>
          </SectionCard>
          <SectionCard title="Parts" flush info="Parts ranked by rejected kg in the window, or the parts whose rejected share rose or fell most against the window before. Getting worse and Getting better cover only parts with at least 2 t poured in both windows. Rejected % is rejected kg over metal poured for the part, and Top reason is the reason with the most rejected kg for that part." actions={(
            <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
              {VIEWS.map(([k, l]) => <ToggleButton key={k} value={k} sx={{ textTransform: 'none', py: 0.3 }}>{l}</ToggleButton>)}
            </ToggleButtonGroup>
          )}>
            <ReportTable key={view} rows={d[view]} columns={cols} getRowId={(r) => r.die} bare pageSize={15} onRowClick={(r) => setPart(r.die)} empty="No parts for these filters." />
          </SectionCard>
          {part != null && <PartSheet id={part} filters={f} onClose={() => setPart(null)} />}
        </>
      )}
    </Page>
  );
}
