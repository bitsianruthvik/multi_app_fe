/**
 * Compliance › Calendar (CF_HRMS_HIRING_SPEC.md §36.4): what is due — TDS deposits, PF and ESI, PT,
 * quarterly TDS returns, Form 16 / 130, minimum-wage revision months, the tax year — with where each
 * is done. The dates come from the tax rules and the law layer (each says where from). Reminders go
 * 3 days and 1 day before; "Mark done" stops them.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, Tooltip, Typography } from '@mui/material';
import { DetailSkeleton, EmptyState, ErrorNotice, SectionCard, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { complianceApi, type Deadline } from '../../api/compliance';

const TONE: Record<Deadline['status'], 'success' | 'danger' | 'warning' | 'neutral'> = { DONE: 'success', OVERDUE: 'danger', DUE_SOON: 'warning', UPCOMING: 'neutral' };
const WORD: Record<Deadline['status'], string> = { DONE: 'Done', OVERDUE: 'Overdue', DUE_SOON: 'Due soon', UPCOMING: 'Upcoming' };
const SCREEN: Record<string, string> = { 'tax-challans': 'Challans', 'tax-quarterly': 'Quarterly returns', 'tax-forms': 'Forms 16 / 130', 'statutory-returns': 'Statutory returns', salaries: 'Salaries', 'tax-settings': 'Tax settings' };
const monthOf = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function CalendarPanel() {
  const toast = useToast();
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof complianceApi.calendar>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => { complianceApi.calendar().then((d) => { setData(d); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);
  const groups = useMemo(() => {
    const m = new Map<string, Deadline[]>();
    for (const d of data?.deadlines ?? []) { const k = monthOf(d.dueDate); if (!m.has(k)) m.set(k, []); m.get(k)!.push(d); }
    return [...m.entries()];
  }, [data]);
  const mark = async (d: Deadline, done: boolean) => {
    try { await complianceApi.markDone(d.key, done); toast.success(done ? 'Marked done.' : 'Marked not done.'); window.dispatchEvent(new Event('cf-hrms-compliance-changed')); load(); } catch (e) { toast.error(errorMessage(e)); }
  };
  const overdue = data?.deadlines.filter((d) => d.status === 'OVERDUE').length ?? 0;
  return (
    <Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 2 }}>
        {data ? `From ${day(data.from)} to ${day(data.to)}${data.states.length ? ` · states: ${data.states.join(', ')}` : ''}${overdue ? ` · ${overdue} overdue` : ''}. Reminders 3 days and 1 day before, to the Owner and HR.` : ''}
      </Typography>
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <DetailSkeleton />}
      {data && !data.deadlines.length && <EmptyState title="Nothing due" hint="No statutory deadline falls in this window." />}
      <Stack spacing={2}>
        {groups.map(([month, items]) => (
          <SectionCard key={month} title={month} flush>
            {items.map((d) => (
              <Box key={d.key} data-testid={`deadline-${d.key}`} sx={{ display: 'grid', gridTemplateColumns: { xs: '64px 1fr', sm: '72px 1fr auto' }, gap: 1.5, alignItems: 'center', px: 2, py: 1.25, borderTop: '1px solid var(--c-border)' }}>
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{day(d.dueDate)}</Typography>
                  <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{d.status === 'DONE' ? '' : d.daysLeft < 0 ? `${-d.daysLeft} d late` : d.daysLeft === 0 ? 'today' : `in ${d.daysLeft} d`}</Typography>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{d.title}</Typography>
                    <ToneBadge tone={TONE[d.status]} label={WORD[d.status]} />
                  </Stack>
                  <Tooltip title={d.source}><Typography noWrap sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>Date from: {d.source}</Typography></Tooltip>
                  {d.status === 'DONE' && <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>Done by {d.doneBy ?? '—'}{d.doneNote ? ` — ${d.doneNote}` : ''}</Typography>}
                </Box>
                <Stack direction="row" spacing={1} sx={{ gridColumn: { xs: '2', sm: 'auto' }, justifyContent: { sm: 'flex-end' } }}>
                  {d.link && <Button size="small" onClick={() => navigate(`/${company}/cf_hrms/${d.link}`)}>{SCREEN[d.link] ?? 'Open'}</Button>}
                  {data?.canMark && (d.status === 'DONE'
                    ? <Button size="small" color="inherit" onClick={() => void mark(d, false)}>Undo</Button>
                    : <Button size="small" variant="outlined" onClick={() => void mark(d, true)}>Mark done</Button>)}
                </Stack>
              </Box>
            ))}
          </SectionCard>
        ))}
      </Stack>
    </Box>
  );
}

export default CalendarPanel;
