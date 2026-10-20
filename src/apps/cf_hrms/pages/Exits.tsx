/**
 * People › Exits (payroll P3b) — people serving notice or who left this tax year or the last, each with
 * their full and final settlement: none yet, a draft, approved (pays with a payroll), or paid.
 * "Full and final" opens the person's settlement page (exits/:employeeId).
 *
 * The leaving itself (notice date, last working day, closing it) is done on the person's own page; this
 * screen settles the money. Amounts need payroll view and the named pay view.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import ExitToAppRounded from '@mui/icons-material/ExitToAppRounded';
import {
  DetailSkeleton, EmptyState, ErrorNotice, ListSkeleton, PageHeader, StatStrip, Surface, ToneBadge,
} from '@shared/ui';
import { useCan } from '../access/can';
import { settlementApi, type LeavingPerson, type SettlementList } from '../api/payrollExit';
import { NeedPayView } from '../components/payroll/PayParts';
import { SETTLEMENT_TONE, rupees } from '../components/payroll/payWords';
import { longDay } from '../components/jobDates';

export default function Exits() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Exits" /><NeedPayView what="Full and final settlements" /></> : <DetailSkeleton />;
  return <ExitsPage />;
}

function ExitsPage() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<SettlementList | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    settlementApi.list(q.trim() || undefined).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <PageHeader title="Exits" subtitle="People leaving or who left, and their full and final settlement." />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <ListSkeleton rows={4} />}
      {data && (
        <Stack spacing={2}>
          <StatStrip stats={[
            { label: 'Serving notice', value: data.counts.leaving },
            { label: 'Drafts', value: data.counts.drafts },
            { label: 'Approved, not paid', value: data.counts.approved },
          ]} />
          <TextField size="small" label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: '100%', maxWidth: 320 }} />
          {data.people.length === 0 ? (
            <EmptyState
              icon={<ExitToAppRounded />}
              title={q ? 'Nobody by that name' : 'Nobody is leaving'}
              hint="A person shows here once their leaving is started on their own page (notice date and last working day)."
            />
          ) : (
            <Surface e={1} sx={{ overflow: 'hidden' }} data-exits-list={data.people.length}>
              {data.people.map((p) => <ExitRow key={p.employee.id} p={p} />)}
            </Surface>
          )}
        </Stack>
      )}
    </Box>
  );
}

function ExitRow({ p }: { p: LeavingPerson }) {
  const { company = '' } = useParams<{ company: string }>();
  const s = p.settlement;
  const lastDay = p.exit?.lastWorkingDay;
  return (
    <Box
      data-exit-row={p.employee.id}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, flexWrap: 'wrap',
        borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {p.employee.name} <Box component="span" sx={{ fontWeight: 400, fontSize: 12.5, color: 'var(--c-text-3)' }}>{p.employee.code}</Box>
        </Typography>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
          {p.exit?.statusLine
            || [p.exit?.typeLabel, lastDay ? `last day ${longDay(lastDay)}` : null, p.exit?.reasonLabel].filter(Boolean).join(' · ')
            || (p.employee.status === 'NOTICE' ? 'Serving notice' : 'Left')}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75, ml: 'auto' }}>
        {s ? (
          <>
            <ToneBadge tone={SETTLEMENT_TONE[s.status] ?? 'neutral'} label={s.status === 'APPROVED' && s.payMonthLabel ? `Approved · ${s.payMonthLabel}` : s.statusWords} noIcon />
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rupees(s.netAmount)}</Typography>
          </>
        ) : <ToneBadge tone="neutral" label="Not started" noIcon />}
        <Button size="small" variant={s?.status === 'DRAFT' || !s ? 'contained' : 'outlined'} component={RouterLink} to={`/${company}/cf_hrms/exits/${p.employee.id}`} data-action="open-fnf">
          Full and final
        </Button>
      </Stack>
    </Box>
  );
}
