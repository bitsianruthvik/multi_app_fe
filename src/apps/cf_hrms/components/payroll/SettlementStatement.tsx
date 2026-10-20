/**
 * A full and final statement, read as the server worked it out (payroll P3b): the last month's salary, the
 * gratuity working, leave encashment by type, the notice working, the settlement's items with how each was
 * worked out, claims paid with it, the TDS with the gratuity and leave exemptions, the totals and notes.
 * Shared by the HR page (Exits › Full and final) and My pay › Full and final. Nothing is calculated here.
 */
import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { Callout, SectionCard } from '@shared/ui';
import type { Statement } from '../../api/payrollExit';
import { longDay } from '../jobDates';
import { Amount, Fact, MiniTable } from './PayParts';
import { kindWord, rupees } from './payWords';

const HOW_WORD: Record<string, string> = {
  RUN: 'from the month’s payroll run',
  RUN_LOCKED: 'from the month’s locked payroll run',
  ESTIMATE: 'an estimate until the month’s payroll is calculated',
};
const NOTICE_SOURCE: Record<string, string> = {
  TYPED: 'typed by HR',
  APPOINTMENT: 'from the appointment terms',
  APPOINTMENT_PROBATION: 'from the appointment terms (on probation)',
};
const NOTICE_ACTION: Record<string, string> = {
  NONE: 'Nothing to recover or pay',
  RECOVER: 'Recovered for notice not served',
  PAY: 'Paid in place of notice',
  WAIVED: 'Waived',
};

function Row({ label, value, sub, strong }: { label: ReactNode; value: ReactNode; sub?: ReactNode; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 0.6, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 }, alignItems: 'baseline' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: strong ? 600 : 400, overflowWrap: 'anywhere' }}>{label}</Typography>
        {sub && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{sub}</Typography>}
      </Box>
      <Typography component="div" sx={{ fontSize: 13.5, fontWeight: strong ? 600 : 400 }}>{value}</Typography>
    </Box>
  );
}

function Lines({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <Box sx={{ mt: 0.75 }}>
      {lines.map((l, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l}</Typography>)}
    </Box>
  );
}

export function SettlementStatement({ statement: s, showProblems = true }: { statement: Statement; showProblems?: boolean }) {
  const notApplied = Array.isArray(s.rule?.notApplied) ? s.rule.notApplied.join(' ') : s.rule?.notApplied;
  return (
    <Stack spacing={2} data-settlement-statement="">
      {showProblems && s.problems.length > 0 && (
        <Callout tone="danger" title="It cannot be approved yet" sx={{ mb: 0 }}>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }} data-settlement-problems={s.problems.length}>
            {s.problems.map((p, i) => <li key={i}>{p}</li>)}
          </Box>
        </Callout>
      )}
      {s.rule && !s.rule.verified && (
        <Callout tone="warning" title="These numbers are not yet confirmed from official texts — check with your CA" sx={{ mb: 0 }}>
          {s.rule.source ? <Typography sx={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{s.rule.source}</Typography> : null}
        </Callout>
      )}

      <SectionCard title="In short">
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 2 }}>
          <Fact label="Service">{s.service.text}</Fact>
          <Fact label="Joined">{longDay(s.employee.joiningDate) || '—'}</Fact>
          <Fact label="Last working day">{longDay(s.exit.lastWorkingDay) || '—'}</Fact>
          <Fact label="Leaving">{s.exit.type === 'RESIGNED' ? 'Resigned' : 'Removed'}{s.exit.status === 'OPEN' ? ' · not closed yet' : ''}</Fact>
          <Fact label="Pays in">{s.payMonthLabel ? `${s.payMonthLabel} payroll` : '—'}</Fact>
          <Fact label="Tax year">{s.year}</Fact>
        </Box>
        <Row label="Settlement earnings" value={<Amount value={s.totals.earnings} />} />
        <Row label="Settlement deductions" value={<Amount value={s.totals.deductions ? -s.totals.deductions : 0} />} />
        {s.totals.lastMonthNet ? <Row label="Last month’s net salary" value={<Amount value={s.totals.lastMonthNet} />} /> : null}
        {s.totals.claims ? <Row label="Approved claims paid with it" value={<Amount value={s.totals.claims} />} /> : null}
        {s.totals.tds ? <Row label="TDS (estimate)" value={<Amount value={-s.totals.tds} />} /> : null}
        <Row label="Net to pay" value={<Amount value={s.totals.net} strong />} strong />
      </SectionCard>

      {s.lastMonth && (
        <SectionCard title={`Last month — ${s.lastMonth.label}`} subtitle={HOW_WORD[s.lastMonth.how] ?? s.lastMonth.how}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>
            {s.lastMonth.payableDays} of {s.lastMonth.daysInMonth} days paid{s.lastMonth.lopDays ? ` · ${s.lastMonth.lopDays} without pay` : ''}
          </Typography>
          {s.lastMonth.lines.map((l, i) => (
            <Row key={`${l.code}-${i}`} label={l.name} sub={kindWord(l.kind)} value={<Amount value={l.kind === 'DEDUCTION' ? -l.amount : l.amount} muted={l.kind === 'EMPLOYER_CONTRIBUTION'} />} />
          ))}
          <Row label="Gross" value={<Amount value={s.lastMonth.gross} />} />
          <Row label="Net" value={<Amount value={s.lastMonth.net} strong />} strong />
          {s.lastMonth.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>{s.lastMonth.note}</Typography>}
        </SectionCard>
      )}

      <SectionCard
        title="Gratuity"
        subtitle={s.gratuity.eligible ? `${s.gratuity.years} year${s.gratuity.years === 1 ? '' : 's'} counted` : 'Not due'}
      >
        <Row label="Worked out" value={<Amount value={s.gratuity.formulaAmount} />} sub={s.gratuity.cappedAt != null ? `At most ${rupees(s.gratuity.cappedAt)} (the ceiling)` : `Wage ${rupees(s.gratuity.wage)} a month`} />
        <Row label={s.gratuity.typed ? 'Paid (typed by HR)' : 'Paid'} value={<Amount value={s.gratuity.paid} strong />} strong />
        <Lines lines={s.gratuity.lines} />
      </SectionCard>

      <SectionCard title="Leave encashment" subtitle={`${s.encashment.days} day${s.encashment.days === 1 ? '' : 's'} × ${rupees(s.encashment.rate)} = ${rupees(s.encashment.amount)}`}>
        {s.encashment.types.length > 0 ? (
          <MiniTable
            cols="minmax(130px, 1.6fr) 90px 90px 90px"
            minWidth={400}
            head={['Leave', 'Balance', 'At most', 'Encashed']}
            rows={s.encashment.types.map((t) => ({
              key: t.code,
              cells: [t.name, t.available, t.capDays ?? '—', t.days],
            }))}
          />
        ) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No leave type of the person’s policy is encashed.</Typography>}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>
          A day: <Box component="span" sx={{ fontFamily: 'var(--font-mono)' }}>{s.encashment.formula}</Box>{s.encashment.typed ? ' · the days were typed by HR' : ''}
        </Typography>
        {s.encashment.exempt && (
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Not taxed, at most {rupees(s.encashment.exempt.formulaAmount)}</Typography>
            <Lines lines={s.encashment.exempt.lines} />
          </Box>
        )}
      </SectionCard>

      <SectionCard title="Notice" subtitle={NOTICE_ACTION[s.notice.action] ?? s.notice.action}>
        <Row label="Notice period" value={s.notice.requiredDays != null ? `${s.notice.requiredDays} days` : 'Not known'} sub={s.notice.source ? NOTICE_SOURCE[s.notice.source] : 'Type it below'} />
        <Row label="Served" value={`${s.notice.servedDays} days`} />
        <Row label="Short" value={`${s.notice.shortDays} days`} />
        {s.notice.amount ? <Row label={s.notice.action === 'RECOVER' ? 'Recovered' : 'Paid'} value={<Amount value={s.notice.action === 'RECOVER' ? -s.notice.amount : s.notice.amount} strong />} sub={`${rupees(s.notice.dayRate)} a day (${s.notice.formula})`} strong /> : null}
        {s.notice.line && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75, overflowWrap: 'anywhere' }}>{s.notice.line}</Typography>}
      </SectionCard>

      <SectionCard title="What the settlement pays and recovers">
        {s.items.length === 0 ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nothing beyond the last month’s salary.</Typography> : s.items.map((it, i) => (
          <Row key={`${it.code}-${i}`} label={it.label || it.name} sub={[kindWord(it.kind), it.basis].filter(Boolean).join(' · ')} value={<Amount value={it.kind === 'DEDUCTION' ? -it.amount : it.amount} />} />
        ))}
        <Row label="Settlement" value={<Amount value={s.totals.settlement} strong />} strong />
      </SectionCard>

      {(s.claims.approved.length > 0 || s.claims.waiting.length > 0) && (
        <SectionCard title="Claims">
          {s.claims.approved.map((c) => <Row key={`a${c.id}`} label={c.name} sub="Approved — paid with the settlement" value={<Amount value={c.amount} />} />)}
          {s.claims.waiting.map((c) => <Row key={`w${c.id}`} label={c.name} sub="Still waiting for a decision — not in the settlement" value={<Amount value={c.amount} muted />} />)}
        </SectionCard>
      )}

      {s.tds && (
        <SectionCard title="Income tax (TDS)" subtitle={`${s.tds.regime === 'OLD' ? 'Old' : 'New'} regime`}>
          <Row label="Tax of the year" value={<Amount value={s.tds.yearTax} />} />
          <Row label="Deducted so far" value={<Amount value={s.tds.tdsSoFar} />} />
          <Row label="Deducted with the settlement" value={<Amount value={s.tds.amount} strong />} strong />
          {s.tds.exemptions.map((x, i) => (
            <Row key={i} label={x.label} sub={`${x.section} · received ${rupees(x.received)}`} value={<>not taxed <Amount value={x.exempt} /></>} />
          ))}
          {s.tds.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75 }}>{s.tds.note}</Typography>}
        </SectionCard>
      )}

      {(s.notes.length > 0 || notApplied) && (
        <Box>
          {s.notes.map((n, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{n}</Typography>)}
          {notApplied && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{notApplied}</Typography>}
        </Box>
      )}
    </Stack>
  );
}
