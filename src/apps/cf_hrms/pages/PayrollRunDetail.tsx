/**
 * One payroll run (CF_HRMS_HIRING_SPEC.md §25.2).
 *
 *   Draft ─calculate─▶ Calculated ─lock─▶ Locked ─release─▶ Payslips released ─paid─▶ Paid
 *                       (calculate again any number of times)   re-open: the Owner only, with a reason
 *
 * The header carries the month, its status and the actions the server allows
 * (`can`) and the login's rights allow. Under it: what changed since the
 * calculation ("calculate again"), the totals with every statutory amount, a
 * note when an unverified statutory setting was used, the warnings by kind, and
 * the people. A person opens in a side sheet with their lines, items and TDS.
 * Released payslips are listed at the end, each as a PDF.
 *
 * NOTHING IS PAID TWICE (the server refuses, in words shown as they come): months are
 * calculated and locked in order; a month is re-opened from the latest month backwards; after a
 * re-open the bank file pays only the DIFFERENCE from what was paid, and a person now due less
 * is recovered in the next run (shown on both runs); a run once paid or re-opened is removed by
 * the Owner only.
 *
 * Nothing is calculated here: every number is the run's, as the server stored it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import SendOutlined from '@mui/icons-material/SendOutlined';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import LockOpenOutlined from '@mui/icons-material/LockOpenOutlined';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import {
  Callout, ConfirmDialog, DataTable, DetailSkeleton, EmptyState, ErrorNotice, Mono, PageHeader, PromptDialog, SectionCard,
  Surface, ToneBadge, errorMessage, useDetailTitle, useToast, type DataColumn,
} from '@shared/ui';
import { runAttendanceApi, type RunAttendance } from '../api/payrollExit';
import { useCan } from '../access/can';
import {
  payrollApi, type BankFile, type PayComponent, type RunDetail, type RunPayslip, type RunPerson,
} from '../api/payroll';
import { saveBase64File } from '../api/excel';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { Amount, Fact, NeedPayView, RunStatusBadge, WarningChips } from '../components/payroll/PayParts';
import { RunPersonSheet } from '../components/payroll/RunPersonSheet';
import { RUN_STATUS, monthWord, rupees, stampDay, warningWord } from '../components/payroll/payWords';
import { useUnitKinds } from '../components/orgUnits';

export default function PayrollRunDetail() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Payroll run" /><NeedPayView what="Payroll runs" /></> : <DetailSkeleton />;
  return <RunPage />;
}

type Busy = null | 'calculate' | 'lock' | 'bank';

function RunPage() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const runId = Number(id);
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const filters = useListFilters(['warnings']);

  const [data, setData] = useState<RunDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [components, setComponents] = useState<PayComponent[]>([]);
  const [personId, setPersonId] = useState<number | null>(null);
  const [needsRecalc, setNeedsRecalc] = useState(false);
  const [ask, setAsk] = useState<null | 'release' | 'paid' | 'reopen' | 'remove' | 'override'>(null);
  const [bank, setBank] = useState<BankFile | null>(null);
  const [payslips, setPayslips] = useState<RunPayslip[] | null>(null);
  const [slipBusy, setSlipBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    payrollApi.run(runId).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [runId]);
  useEffect(load, [load]);
  useEffect(() => { payrollApi.components().then((c) => setComponents(c.components)).catch(() => setComponents([])); }, []);
  const released = (data?.payslips ?? 0) > 0;
  const loadSlips = useCallback(() => {
    payrollApi.payslips(runId).then((r) => setPayslips(r.payslips)).catch(() => setPayslips([]));
  }, [runId]);
  useEffect(() => { if (released) loadSlips(); }, [released, loadSlips]);
  useDetailTitle(data?.run.label ?? null);

  const adopt = (d: RunDetail) => { setData(d); setNeedsRecalc(false); setActionError(null); };
  const act = async (what: Busy, fn: () => Promise<RunDetail>, done: string) => {
    setBusy(what);
    setActionError(null);
    try {
      adopt(await fn());
      toast.success(done);
    } catch (e) {
      // Attendance of the month is still open: the Callout above offers paying without it.
      if ((e as { code?: string })?.code === 'ATTENDANCE_OPEN') { toast.error(errorMessage(e)); load(); } else setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const downloadBank = async () => {
    setBusy('bank');
    setActionError(null);
    try {
      const f = await payrollApi.bankFile(runId);
      saveBase64File(f);
      setBank(f);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const downloadSlip = async (s: RunPayslip) => {
    setSlipBusy(s.id);
    try {
      saveBase64File(await payrollApi.payslipFile(s.id));
    } catch (e) {
      setActionError(e);
    } finally {
      setSlipBusy(null);
    }
  };

  const people = useMemo(() => data?.people ?? [], [data]);
  const q = filters.q.trim().toLowerCase();
  const onlyWarnings = filters.values.warnings === '1';
  const shown = useMemo(() => people.filter((p) => (!onlyWarnings || p.warnings.length > 0)
    && (!q || p.employee.name.toLowerCase().includes(q) || p.employee.code.toLowerCase().includes(q) || (p.employee.departmentName ?? '').toLowerCase().includes(q))), [people, q, onlyWarnings]);
  const defs: FilterDef[] = useMemo(() => [{ key: 'warnings', label: 'With warnings only', kind: 'toggle' }], []);

  const withKind = useUnitKinds();
  const columns: DataColumn<RunPerson>[] = useMemo(() => [
    {
      key: 'person', header: 'Person', alwaysVisible: true,
      render: (p) => (
        <Stack spacing={0.25} sx={{ opacity: p.included ? 1 : 0.65 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.employee.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 0.75 }}>{p.employee.code}</Mono>
            {p.included ? '' : 'Not paid'}
          </Typography>
        </Stack>
      ),
      sortValue: (p) => p.employee.name,
      exportValue: (p) => `${p.employee.name} (${p.employee.code})`,
    },
    { key: 'department', header: 'Org unit', render: (p) => withKind(p.employee.departmentName) || '—', sortValue: (p) => p.employee.departmentName ?? '' },
    {
      key: 'days', header: 'Days paid', numeric: true,
      render: (p) => (
        <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
          {p.payableDays}/{p.daysInMonth}
          {p.lopDays > 0 && <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-warning-600)' }}> · {p.lopDays} LOP</Typography>}
        </Box>
      ),
      sortValue: (p) => p.payableDays, exportValue: (p) => p.payableDays,
    },
    { key: 'gross', header: 'Gross', numeric: true, render: (p) => <Amount value={p.gross} muted={!p.included} />, sortValue: (p) => p.gross },
    { key: 'deductions', header: 'Deductions', numeric: true, render: (p) => <Amount value={p.deductions} muted={!p.included} />, sortValue: (p) => p.deductions },
    { key: 'net', header: 'Net pay', numeric: true, render: (p) => <Amount value={p.net} strong={p.included} muted={!p.included} />, sortValue: (p) => p.net },
    { key: 'employer', header: 'Employer cost', numeric: true, defaultHidden: true, render: (p) => <Amount value={p.employer} />, sortValue: (p) => p.employer },
    { key: 'tds', header: 'TDS', numeric: true, render: (p) => <Amount value={p.tds} />, sortValue: (p) => p.tds },
    {
      key: 'warnings', header: 'Warnings',
      render: (p) => <WarningChips warnings={p.warnings} />,
      sortValue: (p) => p.warnings.length, exportValue: (p) => p.warnings.map((w) => w.text).join(' | '),
    },
  ], [withKind]);

  if (!data) return error ? <ErrorNotice error={error} fallback="That payroll run could not be loaded." onRetry={load} /> : <DetailSkeleton />;

  const { run, can: rc } = data;
  const t = run.totals;
  const edit = can.payroll.edit;
  const canItems = rc.items && edit;
  const stale = data.stale.length > 0 || needsRecalc;
  const warningCodes = Object.entries(t?.warnings ?? {}).filter(([, n]) => n > 0);
  const pay = data.payments;

  return (
    <Box sx={{ pb: 6 }}>
      <Button component={RouterLink} to={`/${company}/cf_hrms/payroll-runs`} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>
        Payroll runs
      </Button>

      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600 }}>{run.label} payroll</Typography>
          <RunStatusBadge status={run.status} />
        </Box>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
          {RUN_STATUS[run.status]?.hint}
          {run.calculatedAt ? ` Calculated ${stampDay(run.calculatedAt)}.` : ''}
          {run.lockedAt ? ` Locked ${stampDay(run.lockedAt)}.` : ''}
          {run.releasedAt ? ` Payslips released ${stampDay(run.releasedAt)}.` : ''}
          {run.paidAt ? ` Paid ${stampDay(run.paidAt)}${run.paidNote ? ` — “${run.paidNote}”` : ''}.` : ''}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} data-run-actions="">
          {rc.calculate && edit && (
            <Button variant={run.calculatedAt && !stale ? 'outlined' : 'contained'} disabled={!!busy}
              startIcon={busy === 'calculate' ? <CircularProgress size={14} color="inherit" /> : <CalculateOutlined />}
              onClick={() => void act('calculate', () => payrollApi.calculate(runId), 'Calculated.')} data-action="calculate">
              {busy === 'calculate' ? 'Calculating…' : run.calculatedAt ? 'Calculate again' : 'Calculate'}
            </Button>
          )}
          {run.status === 'CALCULATED' && edit && (
            <Button variant={stale ? 'outlined' : 'contained'} disabled={!!busy || !rc.lock}
              title={!rc.lock && stale ? 'Something changed since the calculation: calculate again first.' : undefined}
              startIcon={busy === 'lock' ? <CircularProgress size={14} color="inherit" /> : <LockOutlined />}
              onClick={() => void act('lock', () => payrollApi.lock(runId), 'Locked. Download the bank file, then release the payslips.')} data-action="lock">
              Lock
            </Button>
          )}
          {rc.bankFile && (
            <Button variant="outlined" disabled={!!busy} onClick={() => void downloadBank()} data-action="bank-file"
              startIcon={busy === 'bank' ? <CircularProgress size={14} color="inherit" /> : <AccountBalanceOutlined />}>
              Download bank file
            </Button>
          )}
          {rc.release && edit && <Button variant="contained" startIcon={<SendOutlined />} disabled={!!busy} onClick={() => setAsk('release')} data-action="release">Release payslips</Button>}
          {rc.paid && edit && <Button variant="contained" startIcon={<DoneAllRounded />} disabled={!!busy} onClick={() => setAsk('paid')} data-action="mark-paid">Mark paid</Button>}
          {rc.reopen && <Button color="inherit" startIcon={<LockOpenOutlined />} disabled={!!busy} onClick={() => setAsk('reopen')} data-action="reopen">Re-open</Button>}
          {rc.remove && can.payroll.remove && <Button color="inherit" startIcon={<DeleteOutlineRounded />} disabled={!!busy} onClick={() => setAsk('remove')} data-action="remove-run">Remove run</Button>}
          <Box sx={{ flex: 1 }} />
          <ExcelButtons
            entity="pay-items"
            noun={['one-time item', 'one-time items']}
            query={{ runId: String(runId) }}
            count={data.items.count}
            canDownload={can.payroll.view}
            canUpload={canItems && can.payroll.upload}
            onApplied={() => { setNeedsRecalc(run.status === 'CALCULATED'); load(); }}
          />
        </Box>
      </Surface>

      <Stack spacing={2}>
        <ErrorNotice error={actionError} />

        {stale && (
          <Callout tone="warning" title="Calculate again">
            {data.stale.length
              ? `Changed since the calculation: ${data.stale.join(', ')}. Calculate again, review, then lock.`
              : 'An item or the TDS changed since the calculation. Calculate again to include it.'}
          </Callout>
        )}
        {data.attendance && (
          <AttendanceCallout
            att={data.attendance}
            canOverride={!!rc.attendanceOverride && edit}
            onOverride={() => setAsk('override')}
            onClear={async () => {
              try { await runAttendanceApi.clear(runId); toast.success('Attendance is used again. Calculate again.'); setNeedsRecalc(!!run.calculatedAt); load(); } catch (e) { toast.error(errorMessage(e)); }
            }}
          />
        )}
        {!!(t?.claimsPaid || t?.settlementsPaid || t?.claimsWaiting) && (
          <Callout title="Claims and full and final in this run">
            {[
              t?.claimsPaid ? `${t.claimsPaid} approved claim${t.claimsPaid === 1 ? ' is' : 's are'} paid in this run.` : '',
              t?.settlementsPaid ? `${t.settlementsPaid} full and final settlement${t.settlementsPaid === 1 ? ' is' : 's are'} paid in this run.` : '',
              t?.claimsWaiting ? `${t.claimsWaiting} approved claim${t.claimsWaiting === 1 ? ' is' : 's are'} not paid here (the person is not in this run).` : '',
            ].filter(Boolean).join(' ')}
          </Callout>
        )}
        {run.reopenNote && run.reopenCount > 0 && (
          <Callout title={`Re-opened by the Owner${run.reopenCount > 1 ? ` (${run.reopenCount} times)` : ''}`}>“{run.reopenNote}” Its payslips were withdrawn.</Callout>
        )}
        {bank && (
          <Callout tone={bank.skipped.length || bank.recover?.length ? 'warning' : 'success'}
            title={`${bank.difference ? 'Bank file of the difference' : 'Bank file'}: ${bank.rows} ${bank.rows === 1 ? 'person' : 'people'}, ${rupees(bank.total)}`}>
            {bank.difference && (
              <Box sx={{ mb: 0.5 }}>
                {run.label} was paid before. This file pays each person only what is still due after the re-open — not the full net pay again.
              </Box>
            )}
            {!!bank.recover?.length && (
              <>
                Paid more than now due — not in the file; recovered as a deduction in the next run when this payroll is marked paid:
                <Box component="ul" sx={{ m: 0, mt: 0.5, mb: 0.5, pl: 2.5 }}>
                  {bank.recover.map((r, i) => <li key={i}>{r.name}{r.code ? ` (${r.code})` : ''}: {rupees(r.amount)}</li>)}
                </Box>
              </>
            )}
            {bank.skipped.filter((s) => !bank.recover?.some((r) => r.code === s.code)).length ? (
              <>
                Left out — {bank.difference ? 'nothing more to pay, or ' : ''}pay these another way or add their bank details:
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {bank.skipped.filter((s) => !bank.recover?.some((r) => r.code === s.code)).map((s, i) => <li key={i}>{s.name}{s.code ? ` (${s.code})` : ''}: {s.why}</li>)}
                </Box>
              </>
            ) : bank.recover?.length ? null : 'Everyone paid is in the file.'}
            <Box><Button size="small" onClick={() => setBank(null)} sx={{ ml: -0.75, mt: 0.5 }}>Close</Button></Box>
          </Callout>
        )}
        {pay && pay.paid > 0 && (
          <Callout title={`Paid for ${run.label}: ${rupees(pay.paid)} to ${pay.paidPeople} ${pay.paidPeople === 1 ? 'person' : 'people'}`}>
            {run.status === 'PAID' ? 'Recorded when the payroll was marked paid.' : 'Recorded when the payroll was marked paid. After the re-open, the bank file pays only the difference.'}
            {pay.recoveries.length > 0 && (
              <>
                {' '}Paid more than the corrected pay — recovered in a later run:
                <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                  {pay.recoveries.map((r, i) => (
                    <li key={i}>{r.employee.name} ({r.employee.code}): {rupees(r.amount)} — {r.inMonth ? `a deduction in the ${monthWord(r.inMonth)} payroll` : 'waiting for the next payroll run'}</li>
                  ))}
                </Box>
              </>
            )}
          </Callout>
        )}
        {pay && pay.recoveriesIn.length > 0 && (
          <Callout title="Recoveries of earlier months">
            This payroll deducts what a re-opened month paid over the corrected pay (made by the payroll; the items cannot be removed):
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {pay.recoveriesIn.map((r, i) => <li key={i}>{r.employee.name} ({r.employee.code}): {rupees(r.amount)} for {monthWord(r.forMonth)}</li>)}
            </Box>
          </Callout>
        )}
        {!!t?.unverifiedSettings?.length && (
          <Callout tone="warning" title="Not verified statutory settings were used">
            {t.unverifiedSettings.join(', ')} of this month come from a row marked “Not verified”. Check it on Payroll › Statutory settings.
          </Callout>
        )}
        {!!t?.missingSettings?.length && (
          <Callout tone="warning" title="Statutory settings missing">
            No {t.missingSettings.join(', ')} settings were in force on the 1st of the month: nothing was worked out for {t.missingSettings.length === 1 ? 'it' : 'them'}.
          </Callout>
        )}
        {!!t?.strayItems && (
          <Callout tone="warning" title="Items for people not in this run">
            {t.strayItems} one-time item{t.strayItems === 1 ? ' is' : 's are'} for somebody not employed this month. They are not paid.
          </Callout>
        )}

        {run.calculatedAt && t ? (
          <SectionCard title="Totals" subtitle={`${t.people} ${t.people === 1 ? 'person' : 'people'} paid`}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5, mb: 2 }}>
              <Fact label="Gross">{rupees(t.gross)}</Fact>
              <Fact label="Deductions">{rupees(t.deductions)}</Fact>
              <Fact label="Net pay">{rupees(t.net)}</Fact>
              <Fact label="Employer cost">{rupees(t.employer)}</Fact>
              {!!t.reimbursements && <Fact label="Reimbursements">{rupees(t.reimbursements)}</Fact>}
              <Fact label="One-time items">{data.items.count ? `${data.items.count} · ${rupees(data.items.total)}` : 'None'}</Fact>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5 }}>
              <Fact label="PF, employee">{rupees(t.pfEmployee)}</Fact>
              <Fact label="PF, employer">{rupees(t.pfEmployer)}{t.eps ? <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}> (pension {rupees(t.eps)})</Typography> : null}</Fact>
              <Fact label="PF admin">{rupees(t.pfAdmin)}</Fact>
              <Fact label="EDLI">{rupees(t.edli)}</Fact>
              <Fact label="ESI, employee">{rupees(t.esiEmployee)}</Fact>
              <Fact label="ESI, employer">{rupees(t.esiEmployer)}</Fact>
              <Fact label="Professional tax">{rupees(t.pt)}</Fact>
              <Fact label="LWF">{rupees(t.lwfEmployee)} + {rupees(t.lwfEmployer)}</Fact>
              <Fact label="TDS">{rupees(t.tds)}</Fact>
            </Box>
            {warningCodes.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.75 }}>Warnings</Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {warningCodes.map(([code, n]) => (
                    <ToneBadge key={code} tone={warningWord(code).tone} label={`${warningWord(code).label} · ${n}`} noIcon />
                  ))}
                </Box>
              </Box>
            )}
          </SectionCard>
        ) : (
          <Callout title="Not calculated yet">
            Calculate reads everyone employed in the month, their salaries, approved leave without pay, the one-time items, TDS and the statutory settings in force on the 1st.
            {canItems ? ' Add one-time items first if you have them (by Excel, or on a person after calculating).' : ''}
          </Callout>
        )}

        {people.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, mb: 1 }}>People</Typography>
            <ListToolbar filters={filters} defs={defs} shown={shown.length} total={people.length} noun={['person', 'people']} searchPlaceholder="Search by name, code or org unit" />
            <DataTable
              rows={shown}
              columns={columns}
              getRowId={(p) => p.id}
              onRowClick={(p) => setPersonId(p.id)}
              storageKey="cf_hrms.payroll-run-people"
              exportName={`payroll-${run.month}`}
              empty={<EmptyState title="Nobody matches" hint="Clear the search or the filter." />}
            />
          </Box>
        )}

        {released && (
          <SectionCard title="Payslips" subtitle="Each person sees their own on My pay.">
            {!payslips ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Loading…</Typography> : payslips.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No payslips.</Typography>
            ) : (
              <Box>
                {payslips.map((s) => (
                  <Box key={s.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', py: 0.75, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{s.employee.name}</Typography>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                        {s.employee.code}{s.version > 1 ? ` · version ${s.version}` : ''}{s.releasedAt ? ` · ${stampDay(s.releasedAt)}` : ''}
                      </Typography>
                    </Box>
                    {s.status !== 'RELEASED' && <ToneBadge tone="neutral" label="Withdrawn" noIcon />}
                    <Amount value={s.net} />
                    <Button size="small" startIcon={slipBusy === s.id ? <CircularProgress size={12} color="inherit" /> : <PictureAsPdfOutlined fontSize="small" />}
                      disabled={slipBusy != null} onClick={() => void downloadSlip(s)}>
                      PDF
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </SectionCard>
        )}
      </Stack>

      {personId != null && (
        <RunPersonSheet
          key={personId}
          runId={runId}
          personId={personId}
          canChange={canItems}
          canRemove={can.payroll.remove}
          components={components}
          onClose={() => setPersonId(null)}
          onChanged={(r) => { if (r) setNeedsRecalc(true); load(); }}
        />
      )}

      <ConfirmDialog
        open={ask === 'release'}
        title="Release the payslips?"
        body="Everyone paid gets a payslip they can see on My pay. The run stays locked."
        confirmLabel="Release payslips"
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          const d = await payrollApi.release(runId);
          adopt(d);
          toast.success(`${d.released ?? 0} payslip${d.released === 1 ? '' : 's'} released.`);
        }}
      />
      {ask === 'paid' && (
        <PromptDialog
          open
          title="Mark this payroll paid?"
          body="Once the bank has paid the bank file."
          label="Note (optional)"
          required={false}
          confirmLabel="Mark paid"
          onClose={() => setAsk(null)}
          onConfirm={async (note) => { adopt(await payrollApi.markPaid(runId, note.trim() || null)); toast.success('Marked paid.'); }}
        />
      )}
      {ask === 'override' && (
        <PromptDialog
          open
          title="Pay this month without attendance?"
          body={`${data.attendance?.label ?? run.label}: LOP comes from approved unpaid leave only — no absences, overtime or penalties from attendance. The reason is kept with the run.`}
          label="Reason"
          required
          multiline
          confirmLabel="Pay without attendance"
          onClose={() => setAsk(null)}
          onConfirm={async (reason) => {
            await runAttendanceApi.override(runId, reason.trim());
            toast.success('This month is paid without attendance. Calculate now.');
            setNeedsRecalc(!!run.calculatedAt);
            load();
          }}
        />
      )}
      {ask === 'reopen' && (
        <PromptDialog
          open
          title="Re-open this payroll?"
          body={`It goes back to calculated, and its payslips are withdrawn. The reason is kept with the run.${run.everPaid ? ' It was paid: after it is locked again, the bank file pays only the difference, and anyone now due less is recovered in the next run.' : ''} Later months that paid arrears for it are re-opened first.`}
          label="Reason"
          required
          multiline
          danger
          confirmLabel="Re-open"
          onClose={() => setAsk(null)}
          onConfirm={async (reason) => { adopt(await payrollApi.reopen(runId, reason.trim())); setPayslips(null); toast.success('Re-opened.'); }}
        />
      )}
      <ConfirmDialog
        open={ask === 'remove'}
        title="Remove this run?"
        entityName={`${run.label} payroll`}
        body={`Its calculation and its one-time items go with it.${run.everPaid ? ' What was paid for the month stays recorded: a new run of the month pays only the difference.' : ''}`}
        confirmLabel="Remove run"
        danger
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          await payrollApi.removeRun(runId);
          toast.success('Run removed.');
          navigate(`/${company}/cf_hrms/payroll-runs`);
        }}
      />
    </Box>
  );
}

/** How the month's days are taken (P3b): from leave, from closed attendance, paid without it (with the reason), or refused. */
function AttendanceCallout({ att, canOverride, onOverride, onClear }: {
  att: RunAttendance; canOverride: boolean; onOverride: () => void; onClear: () => void;
}) {
  if (att.mode === 'LEAVE') return null;
  if (att.mode === 'ATTENDANCE') {
    return (
      <Callout tone="info" title={`Attendance of ${att.label ?? 'the month'} is closed`}>
        <Box data-run-attendance="ATTENDANCE">{att.message}{att.closedAt ? ` Closed ${stampDay(att.closedAt)}.` : ''}</Box>
      </Callout>
    );
  }
  if (att.mode === 'OVERRIDE') {
    return (
      <Callout tone="warning" title="Paid without attendance">
        <Box data-run-attendance="OVERRIDE">
          {att.message}
          {att.override?.by || att.override?.at ? ` Decided${att.override.by ? ` by ${att.override.by}` : ''}${att.override.at ? ` on ${stampDay(att.override.at)}` : ''}.` : ''}
        </Box>
        {canOverride && <Button size="small" onClick={onClear} sx={{ ml: -0.75, mt: 0.5 }} data-action="attendance-use-again">Use attendance again</Button>}
      </Callout>
    );
  }
  return (
    <Callout tone="warning" title={`Attendance of ${att.label ?? 'the month'} is still open`}>
      <Box data-run-attendance="REFUSE">{att.message}</Box>
      {canOverride && <Button size="small" variant="outlined" onClick={onOverride} sx={{ mt: 1 }} data-action="attendance-override">Pay without attendance…</Button>}
    </Callout>
  );
}
