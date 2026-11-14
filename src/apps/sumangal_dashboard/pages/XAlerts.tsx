import { Box, Chip, Stack, Typography } from '@mui/material';
import { SectionCard } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { dateLabel, monthLabel, num } from '../format';
import { Page } from '../components/Page';
import { Fact, FactRow, Open, Spark } from '../components/Intent';

interface Row { a: string; b: string; c: string; d: string }
interface Item { title: string; value: string; detail: string; rule: string; to: string; rows: Row[] }
interface Check { key: string; label: string; value: string; usual: string; outside: 'low' | 'high' | null; worse: boolean; to: string; series: { mo: string; v: number | null }[] }
interface Report { asOf: string; groups: { group: string; items: Item[] }[]; month: string; checks: Check[]; counts: { alerts: number; outside: number; worse: number } }

const GROUP_INFO: Record<string, string> = {
  Orders: 'Open order lines that need action now. Past due means the delivery date is before the data date. Not poured means lines due within 30 days whose stage is ‘Not injected’ or ‘Injected, not poured’.',
  Production: 'Open order lines at the stage ‘Poured, not inspected’ whose last pour was 60 or more days before the data date.',
  Shipping: 'Customers whose usual next shipment date has already passed while their cleared castings wait, with the tonnes ready. Also the cleared castings on open lines already past their delivery date.',
  Vendors: 'Castings sent to job-work vendors and not fully returned, sent more than 60 days before the data date. Also machining order lines with pieces still to come past their planned completion date.',
  Materials: 'Items whose store stock covers fewer days of use than their purchase lead time, where days of use is stock divided by the average daily issue of the last 90 days. Also purchase lines dated in the last 90 days with a rate over 100 times the item’s usual rate.',
  Quality: 'Customer rejection entries dated in the last 90 days, counted in pieces and grouped by reason, with the pieces in the 90 days before for comparison.',
};

/** Is something going wrong: what needs attention now, and whether last month was unlike the year before it. */
export default function XAlerts() {
  const f = useFilters();
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? '/intent/alerts' : null);
  return (
    <Page title="Alerts" question="What needs attention now, and whether last month was unlike the twelve before it." filters={f} filterKeys={[]} period={false} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote="Each alert prints the rule that raised it. An alert is a count of ERP records that meet that rule on the data date; nothing is predicted. A month is marked only when it is lower or higher than every one of the twelve months before it.">
      {d && (
        <>
          <SectionCard info="The data date, and the number of alerts raised now. For the last complete month, it counts how many measures sit outside the range of the twelve months before it, and how many of those are on the wrong side, such as on-time lower or rejection higher." title={`As of ${dateLabel(d.asOf)}`}>
            <FactRow cols={3}>
              <Fact label="Alerts raised" value={num(d.counts.alerts)} sub="Things on the floor or in the books that meet an alert rule now" tone={d.counts.alerts ? 'bad' : 'good'} />
              <Fact label={`${monthLabel(d.month)}: measures outside their usual range`} value={`${d.counts.outside} of ${d.checks.length}`} sub="Lower or higher than all of the twelve months before" tone={d.counts.worse ? 'bad' : undefined} />
              <Fact label="Of those, on the wrong side" value={num(d.counts.worse)} sub="For example on-time lower, or rejection higher, than any of those months" tone={d.counts.worse ? 'bad' : 'good'} />
            </FactRow>
          </SectionCard>

          {d.groups.map((g) => (
            <SectionCard key={g.group} info={GROUP_INFO[g.group]} title={g.group}>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.min(2, g.items.length)}, minmax(0,1fr))` } }}>
                {g.items.map((it) => (
                  <Box key={it.title} sx={{ p: 2, borderRadius: 2, border: '1px solid var(--c-border)', borderLeft: '4px solid var(--c-danger-600)', display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{it.title}</Typography>
                      <Open to={it.to} />
                    </Stack>
                    <Stack direction="row" spacing={1.5} alignItems="baseline" useFlexGap flexWrap="wrap">
                      <Typography sx={{ fontSize: 26, fontWeight: 700, color: 'var(--c-danger-600)', fontVariantNumeric: 'tabular-nums' }}>{it.value}</Typography>
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{it.detail}</Typography>
                    </Stack>
                    {it.rows.length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        {it.rows.map((r, i) => (
                          <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.2fr) auto auto', gap: 1.5, py: 0.5, borderTop: '1px solid var(--c-border)', fontSize: 12.5 }}>
                            <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 600 }} title={r.a}>{r.a}</Typography>
                            <Typography noWrap sx={{ fontSize: 'inherit', color: 'var(--c-text-2)' }} title={r.b}>{r.b}</Typography>
                            <Typography sx={{ fontSize: 'inherit', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.c}</Typography>
                            <Typography sx={{ fontSize: 'inherit', whiteSpace: 'nowrap', color: 'var(--c-text-2)' }}>{r.d}</Typography>
                          </Box>
                        ))}
                      </Box>
                    )}
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mt: 0.5 }}>Rule: {it.rule}</Typography>
                  </Box>
                ))}
              </Box>
            </SectionCard>
          ))}

          <SectionCard info="The last complete month for each measure, against the twelve months before it. Usual is the median of those twelve months, with their lowest and highest. A measure is flagged only when the month is below all of them or above all of them, and is left out when fewer than six of those months have a value." title={`${monthLabel(d.month)} against the twelve months before it`} subtitle="The last complete month. The dot is that month.">
            <Box>
              {d.checks.map((c) => (
                <Box key={c.key} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'minmax(0,1.6fr) 130px minmax(0,1.6fr) 150px 130px auto' }, gap: 1.5, alignItems: 'center', py: 1, borderTop: '1px solid var(--c-border)' }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{c.label}</Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.worse ? 'var(--c-danger-600)' : 'var(--c-text)' }}>{c.value}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', display: { xs: 'none', md: 'block' } }}>{c.usual}</Typography>
                  <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                    <Chip size="small" label={c.outside === 'low' ? 'Lowest in 13 months' : c.outside === 'high' ? 'Highest in 13 months' : 'Within its range'} sx={{ fontWeight: 600, ...(c.worse ? { background: 'var(--c-danger-600)', color: '#fff' } : c.outside ? { background: 'var(--c-success-600)', color: '#fff' } : {}) }} />
                  </Box>
                  <Box sx={{ display: { xs: 'none', md: 'block' } }}><Spark values={c.series.map((s) => s.v)} color={c.worse ? 'var(--c-danger-600)' : 'var(--c-primary-500)'} /></Box>
                  <Open to={c.to} label="Details" />
                </Box>
              ))}
            </Box>
          </SectionCard>
        </>
      )}
    </Page>
  );
}
