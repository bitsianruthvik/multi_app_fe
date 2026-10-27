/**
 * One person's month (CF_HRMS_HIRING_SPEC.md §28.7): the calendar, the chosen day, the month's
 * figures, penalties, requests and the policy in words. Shared by My attendance, HR's view of a
 * person and a manager's view of someone in their team; the page decides what may be done.
 */
import { useState, type ReactNode } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { SectionCard, StatusBadge } from '@shared/ui';
import { KIND_WORDS, dayLabel, hm, minutesWord, todayLocal, type MyRequest, type Penalty, type PersonDay, type PersonMonth } from '../../api/attendance';
import { DayDetail, MonthCalendar, MonthFigures, PenaltyRow, PolicySentences } from './AttendanceParts';

function requestWords(r: MyRequest): string {
  if (r.kind === 'SHORT_PERMISSION') return `${KIND_WORDS[r.kind]} · ${minutesWord(r.minutes)}`;
  if (r.kind === 'ON_DUTY') return KIND_WORDS[r.kind];
  const parts = [r.requestedStatus === 'HALF_DAY' ? 'half day' : r.requestedStatus === 'PRESENT' ? 'present' : null, r.inTime ? `in ${hm(r.inTime)}` : null, r.outTime ? `out ${hm(r.outTime)}` : null].filter(Boolean);
  return `${KIND_WORDS[r.kind]} · ${parts.join(', ')}`;
}

export function PersonMonthView({
  data, dayAction, onWaive, onCancelRequest, extraTop,
}: {
  data: PersonMonth;
  /** A button on the chosen day (e.g. "Ask about this day"). */
  dayAction?: (d: PersonDay) => ReactNode;
  onWaive?: (p: Penalty) => void;
  onCancelRequest?: (r: MyRequest) => void;
  extraTop?: ReactNode;
}) {
  const today = todayLocal();
  const initial = data.days.find((d) => d.date === today) ?? [...data.days].reverse().find((d) => !d.future) ?? data.days[0];
  const [sel, setSel] = useState<string | null>(initial?.date ?? null);
  const day = data.days.find((d) => d.date === sel) ?? null;
  return (
    <Stack spacing={2.5}>
      {extraTop}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.25fr) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
        <SectionCard title={data.label} subtitle={data.shift ? `Shift: ${data.shift.name}` : 'No shift recorded: Monday to Saturday, flexible hours'}>
          <MonthCalendar days={data.days} onDay={(d) => setSel(d.date)} selected={sel} />
        </SectionCard>
        <Stack spacing={2}>
          {day && <DayDetail d={day} action={dayAction?.(day)} />}
          <MonthFigures m={data.summary} />
          {data.lateWords && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{data.lateWords} this month.</Typography>}
          {data.compOff && (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }} data-comp-off>
              Comp-off earned this month: {data.compOff.days} day{data.compOff.days === 1 ? '' : 's'}. {data.compOff.note}
            </Typography>
          )}
        </Stack>
      </Box>
      <SectionCard title="Penalties" subtitle="What the attendance rules took this month, and anything waived or given back.">
        {data.penalties.length ? data.penalties.map((p) => <PenaltyRow key={p.id} p={p} onWaive={onWaive} />) : <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>None this month.</Typography>}
      </SectionCard>
      <SectionCard title="Requests" subtitle={data.approver ? `They go to ${data.approver.name}.` : 'They go to HR.'}>
        {data.requests.length ? data.requests.map((r) => (
          <Box key={r.id} data-att-request={r.id} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start', py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
            <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{dayLabel(r.date)} · {requestWords(r)}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{r.reason}</Typography>
              {r.decisionNote && <Typography sx={{ fontSize: 12.5 }}>“{r.decisionNote}”</Typography>}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <StatusBadge status={r.status} />
              {onCancelRequest && r.status === 'PENDING' && <Button size="small" color="inherit" onClick={() => onCancelRequest(r)}>Cancel</Button>}
            </Box>
          </Box>
        )) : <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>No requests this month.</Typography>}
      </SectionCard>
      <SectionCard title="The rules that apply">
        <PolicySentences line={data.policy.line} sentences={data.policy.sentences} />
      </SectionCard>
    </Stack>
  );
}
