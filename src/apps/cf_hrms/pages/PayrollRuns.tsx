/**
 * Payroll › Runs (CF_HRMS_HIRING_SPEC.md §25.2) — one run per month, newest
 * first: its status, the people paid, gross, deductions, net, and how many
 * people carry a warning. "New run" opens the month after the latest one.
 *
 *   Draft → Calculated → Locked → Payslips released → Paid
 *
 * Amounts: payroll view AND the named pay view. A company with no pay
 * components yet sees "Set up payroll" first.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EventNoteOutlined from '@mui/icons-material/EventNoteOutlined';
import {
  DataTable, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PageHeader, ToneBadge, useToast, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type PayRun, type RunList } from '../api/payroll';
import { Amount, NeedPayView, RunStatusBadge } from '../components/payroll/PayParts';
import { SetupPayrollCard } from '../components/payroll/SetupPayrollCard';
import { monthWord } from '../components/payroll/payWords';

export default function PayrollRuns() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Payroll runs" /><NeedPayView what="Payroll runs" /></> : <ListSkeleton rows={6} />;
  return <RunsList />;
}

function RunsList() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const [data, setData] = useState<RunList | null>(null);
  const [setUp, setSetUp] = useState<boolean | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState<{ month: string; note: string } | null>(null);

  const load = useCallback(() => {
    payrollApi.runs().then((d) => { setData(d); setError(null); }).catch(setError);
    payrollApi.components().then((c) => setSetUp(c.components.length > 0)).catch(() => setSetUp(null));
  }, []);
  useEffect(load, [load]);

  const columns: DataColumn<PayRun>[] = useMemo(() => [
    {
      key: 'month', header: 'Month', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.label || monthWord(r.month)}</Typography>
          {r.reopenCount > 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Re-opened {r.reopenCount === 1 ? 'once' : `${r.reopenCount} times`}</Typography>}
        </Stack>
      ),
      sortValue: (r) => r.month,
    },
    { key: 'status', header: 'Status', render: (r) => <RunStatusBadge status={r.status} />, sortValue: (r) => r.status },
    { key: 'people', header: 'People', numeric: true, render: (r) => (r.calculatedAt ? r.peopleCount : '—'), sortValue: (r) => r.peopleCount },
    { key: 'gross', header: 'Gross', numeric: true, render: (r) => (r.calculatedAt ? <Amount value={r.gross} /> : '—'), sortValue: (r) => r.gross },
    { key: 'deductions', header: 'Deductions', numeric: true, render: (r) => (r.calculatedAt ? <Amount value={r.deductions} /> : '—'), sortValue: (r) => r.deductions },
    { key: 'net', header: 'Net pay', numeric: true, render: (r) => (r.calculatedAt ? <Amount value={r.net} strong /> : '—'), sortValue: (r) => r.net },
    {
      key: 'warnings', header: 'With warnings', numeric: true,
      render: (r) => (r.peopleWithWarnings ? <ToneBadge tone="warning" label={`${r.peopleWithWarnings} ${r.peopleWithWarnings === 1 ? 'person' : 'people'}`} noIcon /> : r.calculatedAt ? '0' : '—'),
      sortValue: (r) => r.peopleWithWarnings ?? 0,
    },
  ], []);

  const runs = data?.runs ?? [];
  const startNew = () => setCreating({ month: data?.suggestedMonth ?? '', note: '' });

  return (
    <>
      <PageHeader
        title="Payroll runs"
        subtitle="One run a month: calculate, review, lock, pay, release the payslips"
        actions={can.payroll.edit && setUp !== false ? (
          <Button variant="contained" startIcon={<AddRounded />} onClick={startNew} disabled={!data} data-action="new-run">New run</Button>
        ) : undefined}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {setUp === false && <SetupPayrollCard canEdit={can.payroll.edit} onDone={load} />}
      {!data && !error ? <ListSkeleton rows={6} /> : (
        <DataTable
          rows={runs}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/${company}/cf_hrms/payroll-runs/${r.id}`)}
          storageKey="cf_hrms.payroll-runs"
          exportName="payroll-runs"
          defaultSortKey="month"
          defaultSortDir="desc"
          empty={
            <EmptyState
              icon={<EventNoteOutlined />}
              title="No payroll runs yet"
              hint={setUp === false ? 'Set up payroll first.' : `Start with ${monthWord(data?.suggestedMonth)}.`}
              action={can.payroll.edit && setUp !== false ? <Button variant="outlined" onClick={startNew}>New run</Button> : undefined}
            />
          }
        />
      )}

      <FormDialog
        open={!!creating}
        title="New payroll run"
        subtitle="It starts as a draft. Nothing is worked out until you calculate it."
        onClose={() => setCreating(null)}
        submitLabel="Create run"
        submitDisabled={!/^\d{4}-\d{2}$/.test(creating?.month ?? '')}
        maxWidth="xs"
        onSubmit={async () => {
          if (!creating) return;
          const { run } = await payrollApi.createRun({ month: creating.month, note: creating.note.trim() || null });
          toast.success(`${run.label} payroll created.`);
          navigate(`/${company}/cf_hrms/payroll-runs/${run.id}`);
        }}
      >
        {creating && (
          <Stack spacing={1.5}>
            <TextField size="small" type="month" label="Month" required value={creating.month}
              onChange={(e) => setCreating({ ...creating, month: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText={creating.month ? monthWord(creating.month) : 'The month being paid.'} inputProps={{ 'data-field': 'run-month' }} />
            <TextField size="small" label="Note (optional)" value={creating.note} onChange={(e) => setCreating({ ...creating, note: e.target.value })} inputProps={{ maxLength: 500 }} />
          </Stack>
        )}
      </FormDialog>
    </>
  );
}
