/**
 * Payroll › Bonus — the statutory bonus of an accounting year (Code on Wages, 2019, ss.26–41; the rules
 * from the law layer). HR prepares it from the year's locked runs (eligibility: wages up to the ceiling and
 * 30 days worked; the calculation wage is the higher of ₹7,000 and the minimum wage; the company's rate;
 * prorated for days worked; set-on / set-off from the allocable surplus), the Owner approves (not the
 * preparer), and it is paid through a chosen month's open run as BONUS lines — within 8 months of the
 * year's end (late is warned). The register downloads as Excel or PDF.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import RedeemOutlined from '@mui/icons-material/RedeemOutlined';
import {
  Callout, ConfirmDialog, DataTable, DetailSkeleton, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PageHeader, SectionCard, Surface, ToneBadge, useDetailTitle, useToast, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { complianceChecksApi, type BonusDetail, type BonusLine, type BonusRun } from '../api/complianceChecks';
import { payrollApi, type PayRun } from '../api/payroll';
import { saveBase64File } from '../api/excel';
import { Fact, NeedPayView } from '../components/payroll/PayParts';
import { rupees } from '../components/payroll/payWords';

const STATUS: Record<BonusRun['status'], { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
  DRAFT: { label: 'Prepared — waiting for the Owner', tone: 'warning' }, APPROVED: { label: 'Approved — choose the run', tone: 'info' }, SCHEDULED: { label: 'In a run', tone: 'success' },
};
const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const thisYear = () => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; };

export default function PayrollBonus() {
  const can = useCan();
  const { id } = useParams<{ id?: string }>();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Bonus" /><NeedPayView what="The bonus" /></> : <ListSkeleton rows={4} />;
  return id ? <BonusPage id={Number(id)} /> : <BonusList />;
}

function BonusList() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const [runs, setRuns] = useState<BonusRun[] | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<{ year: string; ratePct: string; surplus: string } | null>(null);
  const load = useCallback(() => { complianceChecksApi.bonusRuns().then((r) => { setRuns(r.runs); setRate(r.ratePct); setError(null); }).catch(setError); }, []);
  useEffect(load, [load]);
  const columns: DataColumn<BonusRun>[] = useMemo(() => [
    { key: 'year', header: 'Year', alwaysVisible: true, render: (r) => <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.year}</Typography>, sortValue: (r) => r.year },
    { key: 'status', header: 'Status', render: (r) => <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}><ToneBadge tone={STATUS[r.status].tone} label={r.paid ? 'Paid' : STATUS[r.status].label} />{r.late && <ToneBadge tone="danger" label="Late" />}</Stack>, sortValue: (r) => r.status },
    { key: 'rate', header: 'Rate', numeric: true, render: (r) => `${r.ratePct}%`, sortValue: (r) => r.ratePct },
    { key: 'eligible', header: 'Eligible', numeric: true, render: (r) => r.totals.eligible ?? 0, sortValue: (r) => r.totals.eligible ?? 0 },
    { key: 'amount', header: 'Bonus', numeric: true, render: (r) => rupees(r.totals.amount ?? 0), sortValue: (r) => r.totals.amount ?? 0 },
    { key: 'deadline', header: 'Pay by', render: (r) => day(r.deadline), sortValue: (r) => r.deadline ?? '' },
  ], []);
  return (
    <>
      <PageHeader title="Bonus" subtitle="The statutory bonus of each accounting year, from the locked payroll runs"
        actions={can.payroll.edit ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => setForm({ year: thisYear(), ratePct: rate != null ? String(rate) : '', surplus: '' })} data-action="prepare-bonus">Prepare a bonus</Button> : undefined} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!runs && !error ? <ListSkeleton rows={4} /> : (
        <DataTable rows={runs ?? []} columns={columns} getRowId={(r) => r.id} onRowClick={(r) => navigate(`/${company}/cf_hrms/payroll-bonus/${r.id}`)} storageKey="cf_hrms.payroll-bonus" exportName="bonus-runs"
          empty={<EmptyState icon={<RedeemOutlined />} title="No bonus prepared yet" hint="Prepare the year's statutory bonus once its payroll months are locked." />} />
      )}
      <FormDialog open={!!form} title="Prepare a bonus" subtitle="Worked out from the year's locked runs. Prepare again while it is a draft." onClose={() => setForm(null)} submitLabel="Prepare" maxWidth="xs"
        submitDisabled={!/^\d{4}-\d{2}$/.test(form?.year ?? '')}
        onSubmit={async () => {
          if (!form) return;
          const r = await complianceChecksApi.prepareBonus({ year: form.year, ratePct: form.ratePct.trim() || null, allocableSurplus: form.surplus.trim() || null });
          navigate(`/${company}/cf_hrms/payroll-bonus/${r.run.id}`);
        }}>
        {form && (
          <Stack spacing={1.5}>
            <TextField size="small" label="Accounting year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} helperText="1 April to 31 March, like 2026-27." inputProps={{ 'data-field': 'bonus-year' }} />
            <TextField size="small" label="Rate (%)" value={form.ratePct} onChange={(e) => setForm({ ...form, ratePct: e.target.value })} helperText={`Between 8.33% and 20%. ${rate != null ? `The company's choice: ${rate}%.` : 'Empty: the company’s choice, else 8.33%.'}`} inputProps={{ inputMode: 'decimal' }} />
            <TextField size="small" label="Allocable surplus (optional, ₹)" value={form.surplus} onChange={(e) => setForm({ ...form, surplus: e.target.value })} helperText="For set-on / set-off: above the 20% maximum is set on, below the 8.33% minimum set off." inputProps={{ inputMode: 'decimal' }} />
          </Stack>
        )}
      </FormDialog>
    </>
  );
}

function BonusPage({ id }: { id: number }) {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const [d, setD] = useState<BonusDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [runs, setRuns] = useState<PayRun[]>([]);
  const [runId, setRunId] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const load = useCallback(() => { complianceChecksApi.bonus(id).then((x) => { setD(x); setError(null); }).catch(setError); }, [id]);
  useEffect(load, [load]);
  useEffect(() => { payrollApi.runs().then((r) => setRuns(r.runs.filter((x) => x.status === 'DRAFT' || x.status === 'CALCULATED'))).catch(() => setRuns([])); }, []);
  useDetailTitle(d ? `Bonus ${d.run.year}` : null);
  const columns: DataColumn<BonusLine>[] = useMemo(() => [
    { key: 'name', header: 'Person', alwaysVisible: true, render: (l) => <Stack spacing={0.25}><Typography sx={{ fontSize: 14 }}>{l.employee.name}</Typography><Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{l.employee.code}</Typography></Stack>, sortValue: (l) => l.employee.name, exportValue: (l) => `${l.employee.name} (${l.employee.code})` },
    { key: 'eligible', header: 'Eligible', render: (l) => <ToneBadge tone={l.eligible ? 'success' : 'neutral'} label={l.eligible ? 'Yes' : 'No'} />, sortValue: (l) => (l.eligible ? 1 : 0) },
    { key: 'days', header: 'Days worked', numeric: true, render: (l) => l.daysWorked, sortValue: (l) => l.daysWorked },
    { key: 'ceiling', header: 'Ceiling a month', numeric: true, render: (l) => (l.ceiling != null ? rupees(l.ceiling) : '—'), sortValue: (l) => l.ceiling ?? 0 },
    { key: 'wages', header: 'Wages', numeric: true, defaultHidden: true, render: (l) => rupees(l.wagesTotal), sortValue: (l) => l.wagesTotal },
    { key: 'calc', header: 'Wages for bonus', numeric: true, render: (l) => rupees(l.calcWageTotal), sortValue: (l) => l.calcWageTotal },
    { key: 'amount', header: 'Bonus', numeric: true, render: (l) => <b>{rupees(l.amount)}</b>, sortValue: (l) => l.amount },
    { key: 'reason', header: 'Note', render: (l) => <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{l.reason ?? ''}</Typography>, sortValue: (l) => l.reason ?? '' },
  ], []);
  if (!d) return error ? <ErrorNotice error={error} fallback="That bonus could not be loaded." onRetry={load} /> : <DetailSkeleton />;
  const r = d.run;
  const act = async (fn: () => Promise<BonusDetail>, done: string) => {
    setBusy(true); setActionError(null);
    try { setD(await fn()); toast.success(done); } catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const download = async (format: 'xlsx' | 'pdf') => { try { saveBase64File(await complianceChecksApi.bonusRegister(id, format)); } catch (e) { setActionError(e); } };
  const so = r.totals.setOnOff;
  return (
    <Box sx={{ pb: 6 }}>
      <Button component={RouterLink} to={`/${company}/cf_hrms/payroll-bonus`} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>Bonus</Button>
      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600 }}>Bonus {r.year}</Typography>
          <ToneBadge tone={STATUS[r.status].tone} label={r.paid ? 'Paid' : STATUS[r.status].label} />
          {r.late && <ToneBadge tone="danger" label="Late" />}
        </Box>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
          {day(r.from)} to {day(r.to)} · at {r.ratePct}% · pay by {day(r.deadline)}
          {r.preparedBy ? ` · prepared by ${r.preparedBy.name ?? '—'}` : ''}{r.approvedBy ? ` · approved by ${r.approvedBy.name ?? '—'}` : ''}{r.payMonth ? ` · paid with the ${r.payMonth} payroll` : ''}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 1.5 }}>
          <Fact label="Eligible people">{r.totals.eligible ?? 0} of {r.totals.people ?? 0}</Fact>
          <Fact label="Bonus in all">{rupees(r.totals.amount ?? 0)}</Fact>
          <Fact label="Wages for bonus">{rupees(r.totals.calcWageTotal ?? 0)}</Fact>
          <Fact label="Months used">{(r.totals.monthsPaid ?? []).length}</Fact>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {d.can.prepare && can.payroll.edit && <Button variant="outlined" disabled={busy} onClick={() => void act(() => complianceChecksApi.prepareBonus({ year: r.year, ratePct: r.ratePct, allocableSurplus: r.allocableSurplus }), 'Prepared again.')}>Prepare again</Button>}
          {d.can.approve && <Button variant="contained" color="success" disabled={busy} onClick={() => void act(() => complianceChecksApi.approveBonus(id), 'Approved.')} data-action="approve-bonus">Approve</Button>}
          {r.status === 'DRAFT' && !d.can.approve && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{can.owner ? 'You prepared it: someone else approves.' : 'The Owner approves it.'}</Typography>}
          {d.can.schedule && can.payroll.edit && (
            <>
              <TextField select size="small" label="Pay with the run of" value={runId} onChange={(e) => setRunId(e.target.value)} sx={{ minWidth: 200 }} inputProps={{ 'data-field': 'bonus-run' }}>
                {runs.map((x) => <MenuItem key={x.id} value={String(x.id)}>{x.label}</MenuItem>)}
              </TextField>
              <Button variant="contained" disabled={busy || !runId} onClick={() => void act(() => complianceChecksApi.scheduleBonus(id, Number(runId)), 'Added to the run as BONUS lines. Calculate the run again.')} data-action="schedule-bonus">Pay in this run</Button>
            </>
          )}
          {d.can.unschedule && can.payroll.edit && <Button color="inherit" disabled={busy} onClick={() => void act(() => complianceChecksApi.unscheduleBonus(id), 'Taken out of the run.')}>Take out of the run</Button>}
          {r.status === 'DRAFT' && can.payroll.edit && <Button color="inherit" onClick={() => setRemoving(true)}>Remove</Button>}
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => void download('xlsx')} data-action="register-xlsx">Register (Excel)</Button>
          <Button size="small" onClick={() => void download('pdf')} data-action="register-pdf">Register (PDF)</Button>
        </Box>
      </Surface>
      <Stack spacing={2}>
        <ErrorNotice error={actionError} />
        {d.warnings.map((w) => <Callout key={w} tone="warning" title="Check this">{w}</Callout>)}
        {so && (
          <SectionCard title="Set-on and set-off" subtitle="From the allocable surplus entered (Code on Wages s.36; carried up to the 4th year).">
            <Typography sx={{ fontSize: 13 }}>Allocable surplus {rupees(so.allocableSurplus)} · minimum bonus {rupees(so.minBonus)} · maximum {rupees(so.maxBonus)} · set on {rupees(so.setOn)} · set off {rupees(so.setOff)}</Typography>
            {d.setOnOff.map((x) => <Typography key={`${x.year}${x.kind}`} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{x.year}: {x.kind === 'SET_ON' ? 'set on' : 'set off'} {rupees(x.amount)}, carried until {x.carryUntil}</Typography>)}
          </SectionCard>
        )}
        <DataTable rows={d.lines} columns={columns} getRowId={(l) => l.id} storageKey="cf_hrms.payroll-bonus-lines" exportName={`bonus-${r.year}`} defaultSortKey="amount" defaultSortDir="desc"
          empty={<EmptyState icon={<RedeemOutlined />} title="Nobody in this year's locked runs" hint="The bonus is worked out from locked payroll months." />} />
      </Stack>
      <ConfirmDialog open={removing} title="Remove this draft bonus?" entityName={`Bonus ${r.year}`} confirmLabel="Remove" danger onClose={() => setRemoving(false)}
        onConfirm={async () => { await complianceChecksApi.removeBonus(id); navigate(`/${company}/cf_hrms/payroll-bonus`); }} />
    </Box>
  );
}
