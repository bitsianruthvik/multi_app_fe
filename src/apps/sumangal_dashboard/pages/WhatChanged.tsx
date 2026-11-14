import { useState } from 'react';
import { Box, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import { SectionCard } from '@shared/ui';
import { useReport } from '../api';
import { useFilters } from '../filters';
import { crore, dayCount, monthLabel, num, perKg, pct, tonnes } from '../format';
import { Grid } from '../components/Charts';
import { Page } from '../components/Page';
import { CustomerSheet, LineSheet } from '../components/Sheets';

interface Mover { id: string | number; name: string; prev: number; now: number; change: number }
interface Movers { up: Mover[]; down: Mover[] }
interface Metric { key: string; label: string; unit: 'money' | 't' | 'perKg' | 'pct' | 'days'; better: 'up' | 'down'; prev: number | null; now: number | null; changePct: number | null }
interface Span { first: string; last: string }
interface Report { months: number; now: Span; prev: Span; prevPartial: boolean; from: string; summary: Metric[]; customerSales: Movers; customerOnTime: Movers; reasons: Movers; vendors: Movers; stages: { stage: string; prev: number | null; now: number | null }[] }

const show = (m: Metric, v: number | null) => ({ money: crore, t: (x: number | null) => tonnes(x), perKg, pct: (x: number | null) => pct(x, 1), days: dayCount }[m.unit](v));
const span = (s: Span) => `${monthLabel(s.first)} to ${monthLabel(s.last)}`;

/** One list of biggest moves: what rose on one side, what fell on the other. */
function MoverCard({ title, subtitle, info, data, format, changeFormat = format, goodWhen = 'up', onPick }: { title: string; subtitle: string; info?: string; data: Movers; format: (v: number) => string; changeFormat?: (v: number) => string; goodWhen?: 'up' | 'down'; onPick?: (id: number) => void }) {
  const side = (rows: Mover[], up: boolean) => {
    const good = up === (goodWhen === 'up'); const color = good ? 'var(--c-success-600)' : 'var(--c-danger-600)';
    return (
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.75, color }}>
          {up ? <ArrowUpwardRounded sx={{ fontSize: 16 }} /> : <ArrowDownwardRounded sx={{ fontSize: 16 }} />}
          <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>{up ? 'Up' : 'Down'}</Typography>
        </Stack>
        {rows.length ? rows.map((r) => (
          <Box key={r.id} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} onClick={onPick ? () => onPick(r.id as number) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter') onPick(r.id as number); } : undefined}
            sx={{ py: 0.6, px: 0.75, borderRadius: 1, cursor: onPick ? 'pointer' : 'default', '&:hover': onPick ? { background: 'var(--c-surface-2)' } : undefined }}>
            <Typography noWrap title={r.name} sx={{ fontSize: 13, fontWeight: 600 }}>{r.name}</Typography>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{format(r.prev)} → {format(r.now)}</Typography>
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color, flexShrink: 0 }}>{r.change > 0 ? '+' : '−'}{changeFormat(Math.abs(r.change))}</Typography>
            </Stack>
          </Box>
        )) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>None</Typography>}
      </Box>
    );
  };
  return (
    <SectionCard title={title} subtitle={subtitle} info={info}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2, minmax(0,1fr))' } }}>{side(data.up, true)}{side(data.down, false)}</Box>
    </SectionCard>
  );
}

/** The first screen: two equal periods, and the biggest moves between them. */
export default function WhatChanged() {
  const f = useFilters();
  const [months, setMonths] = useState('6');
  const { data: d, error, loading, reload } = useReport<Report>(f.ready ? `/what-changed${f.query({ months })}` : null);
  const [customer, setCustomer] = useState<number | null>(null);
  const [line, setLine] = useState<number | null>(null);
  return (
    <Page title="What changed" question={d ? `${span(d.now)}, against ${span(d.prev)}` : 'The biggest moves between two periods.'} filters={f} loading={loading} error={error} reload={reload} hasData={!!d}
      footnote={d ? `Complete calendar months only. On-time changes cover customers with at least 10 lines due in both periods; vendor changes cover vendors with at least 10 returned lines and 5 t sent in both.${d.prevPartial ? ` Data starts on ${d.from}, so the earlier period is a little short.` : ''}` : undefined}>
      {d && (
        <>
          {f.rangeSet ? (
            <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>The date range against the same number of days just before it.</Typography>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>Compare the last</Typography>
              <ToggleButtonGroup size="small" exclusive value={months} onChange={(_, v) => v && setMonths(v)}>
                {['3', '6', '12'].map((m) => <ToggleButton key={m} value={m} sx={{ textTransform: 'none', py: 0.3, px: 1.5 }}>{m} months</ToggleButton>)}
              </ToggleButtonGroup>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>with the {d.months} before</Typography>
            </Stack>
          )}
          <SectionCard title="The business" flush info="Each summary figure for the two periods, with the change between them as a percent of the earlier period. Green is better and red worse, given the figure’s direction. Periods are complete calendar months.">
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell /><TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{span(d.prev)}</TableCell><TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{span(d.now)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Change</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.summary.map((m) => {
                    const up = (m.now ?? 0) >= (m.prev ?? 0); const good = up === (m.better === 'up'); const same = m.now === m.prev;
                    return (
                      <TableRow key={m.key}>
                        <TableCell sx={{ fontWeight: 600 }}>{m.label}</TableCell>
                        <TableCell align="right" sx={{ color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{show(m, m.prev)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{show(m, m.now)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: same ? 'var(--c-text-3)' : good ? 'var(--c-success-600)' : 'var(--c-danger-600)' }}>{m.changePct == null ? '—' : `${m.changePct > 0 ? '+' : ''}${m.changePct}%`}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
          <Grid>
            <MoverCard title="Customer sales" subtitle="Select a customer for more" info="The five customers whose sales rose most and the five whose sales fell most, comparing the two periods. Change is in rupees." data={d.customerSales} format={crore} onPick={setCustomer} />
            <MoverCard title="Customer on-time delivery" subtitle="Customers with at least 10 lines due in both periods" info="Customers with at least 10 order lines due in both periods, ranked by the change in their share of lines shipped on time. On time means fully shipped by the delivery date. Change is in percentage points." data={d.customerOnTime} format={(v) => `${Math.round(v)}%`} changeFormat={(v) => `${Math.round(v)} pts`} onPick={setCustomer} />
            <MoverCard title="Rejection reasons" subtitle="Rejected kg" info="Rejection reasons with at least 100 kg rejected in either period, ranked by the change in rejected kg. A rise is shown in red, since fewer rejected kg is better." data={d.reasons} format={(v) => `${num(v)} kg`} goodWhen="down" />
            <MoverCard title="Outside vendors" subtitle="Median days away" info="Vendor and process pairs with at least 10 returned lines and 5 t sent in both periods, ranked by the change in median days away. A fall is shown in green, since fewer days away is better." data={d.vendors} format={(v) => `${Math.round(v)}d`} goodWhen="down" />
          </Grid>
          <SectionCard title="Kg per working day, by stage" flush info="Kilograms passing each production stage per working day, for the two periods. Working days are the days logged at that stage. The change is the percent change between the periods.">
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell sx={{ fontWeight: 700 }}>Stage</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{span(d.prev)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{span(d.now)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>Change</TableCell></TableRow></TableHead>
                <TableBody>{d.stages.map((s) => { const c = s.prev && s.now != null ? Math.round(((s.now - s.prev) / s.prev) * 100) : null; return <TableRow key={s.stage}><TableCell sx={{ fontWeight: 600 }}>{s.stage}</TableCell><TableCell align="right" sx={{ color: 'var(--c-text-2)' }}>{num(s.prev)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{num(s.now)}</TableCell><TableCell align="right" sx={{ fontWeight: 700 }}>{c == null ? '—' : `${c > 0 ? '+' : ''}${c}%`}</TableCell></TableRow>; })}</TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
          {customer != null && <CustomerSheet id={customer} filters={f} onClose={() => setCustomer(null)} onLine={setLine} />}
          {line != null && <LineSheet id={line} onClose={() => setLine(null)} />}
        </>
      )}
    </Page>
  );
}
