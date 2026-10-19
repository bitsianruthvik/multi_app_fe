/**
 * One person's salary (CF_HRMS_HIRING_SPEC.md §25.2): the salary today with its
 * breakdown, every revision before it, and — with payroll edit — "Revise
 * salary". A salary is never overwritten: a revision ends the one before it the
 * day before. A row no locked payroll paid on may be corrected; the latest such
 * row may be removed (the one before it runs on again).
 *
 * The route id is the EMPLOYEE id. Amounts need the named pay view; the server
 * audits the read.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import {
  Callout, ConfirmDialog, DetailSkeleton, ErrorNotice, Mono, PageHeader, SectionCard, Surface, ToneBadge,
  useDetailTitle, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type PayStructure, type SalaryDetail as Detail, type SalaryRow } from '../api/payroll';
import { BreakdownTable, Fact, NeedPayView, ProblemList } from '../components/payroll/PayParts';
import { SalaryDialog } from '../components/payroll/SalaryDialog';
import { PF_MODE_WORD, rupees } from '../components/payroll/payWords';
import { RowActions } from '../components/list/RowActions';
import { longDay } from '../components/jobDates';

export default function SalaryDetail() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Salary" /><NeedPayView what="Salaries" /></> : <DetailSkeleton />;
  return <SalaryPage />;
}

function SalaryCard({ s }: { s: SalaryRow }) {
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.5 }}>
        <Fact label="CTC a year">{rupees(s.annualCtc)}</Fact>
        <Fact label="CTC a month">{rupees(s.monthlyCtc)}</Fact>
        <Fact label="Structure">{s.structure?.name ?? '—'}</Fact>
        <Fact label="From">{longDay(s.effectiveFrom)}{s.effectiveTo ? ` to ${longDay(s.effectiveTo)}` : ''}</Fact>
        <Fact label="PF">{PF_MODE_WORD[s.pfMode] ?? s.pfMode}</Fact>
      </Box>
      <ProblemList problems={s.breakdown.problems} warnings={s.breakdown.warnings} />
      {s.breakdown.ok && <BreakdownTable lines={s.breakdown.lines} totals={s.breakdown.totals} monthlyCtc={s.monthlyCtc} annualCtc={s.annualCtc} />}
    </Stack>
  );
}

function SalaryPage() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const employeeId = Number(id);
  const can = useCan();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [structures, setStructures] = useState<PayStructure[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<{ mode: 'revise' | 'correct'; row: SalaryRow | null } | null>(null);
  const [removing, setRemoving] = useState<SalaryRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    payrollApi.salary(employeeId).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [employeeId]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!can.payroll.edit) return;
    payrollApi.structures().then((r) => setStructures(r.structures)).catch(() => setStructures([]));
  }, [can.payroll.edit]);
  useDetailTitle(data?.employee.name ?? null);

  if (!data) return error ? <ErrorNotice error={error} fallback="That salary could not be loaded." onRetry={load} /> : <DetailSkeleton />;

  const e = data.employee;
  const latest = data.history[0] ?? null;
  const shown = data.current ?? data.history.find((h) => h.future) ?? null;
  const base = data.current ?? latest;

  return (
    <Box sx={{ maxWidth: 1100, pb: 6 }}>
      <Button component={RouterLink} to={`/${company}/cf_hrms/salaries`} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>
        Salaries
      </Button>

      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
            <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600, overflowWrap: 'anywhere' }}>{e.name}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              <Mono sx={{ fontSize: 13, mr: 1 }}>{e.code}</Mono>
              {[e.positionTitle, e.departmentName].filter(Boolean).join(' · ')}
              {e.joiningDate ? ` · joined ${longDay(e.joiningDate)}` : ''}
              {e.exitDate ? ` · left ${longDay(e.exitDate)}` : ''}
            </Typography>
          </Box>
          {can.payroll.edit && (
            <Button variant="contained" startIcon={<TrendingUpRounded />} onClick={() => setDialog({ mode: 'revise', row: base })} data-action="revise-salary">
              {base ? 'Revise salary' : 'Add a salary'}
            </Button>
          )}
        </Box>
      </Surface>

      <Stack spacing={2}>
        {note && (
          <Callout tone="info" title="Arrears">
            {note}
            <Box><Button size="small" onClick={() => setNote(null)} sx={{ ml: -0.75, mt: 0.5 }}>Got it</Button></Box>
          </Callout>
        )}

        <SectionCard
          title={data.current ? 'Salary today' : shown ? 'Next salary' : 'Salary'}
          subtitle={!data.current && shown ? `No salary today: this one starts ${longDay(shown.effectiveFrom)}.` : undefined}
        >
          {shown ? <SalaryCard s={shown} /> : (
            <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
              No salary is on file yet.{can.payroll.edit ? ' Add one with “Add a salary”.' : ''}
            </Typography>
          )}
        </SectionCard>

        <SectionCard title="History" subtitle="Every salary, newest first.">
          {data.history.length === 0 ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Nothing yet.</Typography> : (
            <Box>
              {data.history.map((h) => {
                const isLatest = h.id === latest?.id;
                return (
                  <Box key={h.id} data-salary={h.id} sx={{
                    display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'flex-start', py: 1.25,
                    borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
                  }}>
                    <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rupees(h.annualCtc)} a year</Typography>
                        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>({rupees(h.monthlyCtc)} a month)</Typography>
                        {h.current && <ToneBadge tone="success" label="Today" noIcon />}
                        {h.future && <ToneBadge tone="info" label="Future" noIcon />}
                        {h.paidInLockedRun && <ToneBadge tone="neutral" label="Paid in a locked run" title="Kept as it was: revise it, do not correct it." noIcon />}
                      </Box>
                      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                        {longDay(h.effectiveFrom)} – {h.effectiveTo ? longDay(h.effectiveTo) : 'onwards'}
                        {h.structure ? ` · ${h.structure.name}` : ''}
                        {h.overrides.length ? ` · ${h.overrides.length} fixed amount${h.overrides.length === 1 ? '' : 's'}` : ''}
                      </Typography>
                      {h.reason && <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{h.reason}</Typography>}
                    </Box>
                    <RowActions
                      name={`salary from ${longDay(h.effectiveFrom)}`}
                      editLabel="Correct"
                      onEdit={can.payroll.edit && !h.paidInLockedRun ? () => setDialog({ mode: 'correct', row: h }) : undefined}
                      onRemove={can.payroll.remove && isLatest && !h.paidInLockedRun ? () => setRemoving(h) : undefined}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </SectionCard>
      </Stack>

      <SalaryDialog
        open={!!dialog}
        mode={dialog?.mode ?? 'revise'}
        employee={{ id: e.id, name: e.name }}
        row={dialog?.row ?? null}
        structures={structures}
        onClose={() => setDialog(null)}
        onSaved={(n) => {
          toast.success(dialog?.mode === 'correct' ? 'Salary corrected.' : 'Salary saved.');
          setNote(n);
          load();
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove this salary?"
        entityName={removing ? `${rupees(removing.annualCtc)} a year from ${longDay(removing.effectiveFrom)}` : undefined}
        body="The salary before it runs on again, with no end date."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await payrollApi.removeSalary(removing.id);
          toast.success('Salary removed.');
          load();
        }}
      />
    </Box>
  );
}
