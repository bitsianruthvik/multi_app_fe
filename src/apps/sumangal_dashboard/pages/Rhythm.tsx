import { SectionCard } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { num } from '../format';
import { Grid, RowBars } from '../components/Charts';
import { Page } from '../components/Page';
import { GapRanges, Legend, RhythmStrips, type RhythmRow } from '../components/Timelines';
import { SKIP_LEGEND } from '../components/timelineStyle';

interface Row extends RhythmRow { shipments: number; tonnes: number; last: string; next: string }
interface Report { rows: Row[]; skipCounts: { why: string; slots: number }[]; from: string; asOf: string }

/** How often each customer gets a shipment, every shipment on a calendar, and the slots that were missed. */
export default function Rhythm() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/rhythm${f.query()}` : null);
  return (
    <Page title="Customer shipping rhythm" question="How often each customer gets a shipment, and when an expected shipment did not come." filters={f} filterKeys={['customer', 'market']} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="All two years of data. A shipment is a dispatch day of at least a quarter of that customer's usual dispatch day; dispatches within 3 days count once. The usual gap is the median days between shipments. A missed slot is a gap over 1.6 times the usual one (and at least two weeks longer), placed one usual gap after the last shipment; ready is cleared and not shipped, late is ordered and past its delivery date, on that day. Customers with at least 3 t shipped and 4 shipments.">
      {d && (
        <>
          <SectionCard title="Days between shipments" subtitle="Bar: the middle half of the gaps. Tick: the usual gap.">
            <GapRanges rows={d.rows} />
          </SectionCard>
          <SectionCard title="Every shipment, and the missed slots">
            <Legend items={SKIP_LEGEND} />
            <RhythmStrips rows={d.rows} from={d.from} to={d.asOf} onPick={(id) => f.setValue('customer', String(id))} />
          </SectionCard>
          <Grid>
            <SectionCard title="Missed slots, by what was there"><RowBars rows={d.skipCounts.map((s) => ({ key: s.why, label: s.why, value: s.slots }))} format={(v) => `${num(v)} slots`} /></SectionCard>
          </Grid>
        </>
      )}
    </Page>
  );
}
