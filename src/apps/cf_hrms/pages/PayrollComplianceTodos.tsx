/**
 * Payroll › Compliance to-dos (CF_HRMS_HIRING_SPEC.md §36.3).
 *
 * LIST: what no longer complies with the law in force — one to-do per break of a law version — made when
 * the product team publishes a law version, on the nightly check and on "Check now". Deadline = the law's
 * effective date; a HARD minimum-wage to-do past it pays a statutory top-up line in each run until fixed.
 *
 * DETAIL: the rule (source, effective date, verified), who and which structures are affected, and the
 * ready fixes, each with BEFORE / AFTER per structure and per person (take-home, company cost, PF / ESI,
 * who loses take-home). HR chooses one; the Owner approves (never the one who chose); it is applied as
 * dated salary rows / a new structure version from the law's date, so the next run pays the arrears.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import {
  Callout, DataTable, DetailSkeleton, EmptyState, ErrorNotice, ListSkeleton, PageHeader, PromptDialog, SectionCard, Surface, ToneBadge, useDetailTitle, useToast, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { complianceChecksApi, SEVERITY_TONE, SEVERITY_WORD, type FixOption, type Todo, type TodoDetail, type TodoList, type TodoStatus } from '../api/complianceChecks';
import { NeedPayView } from '../components/payroll/PayParts';
import { RuleLine } from '../components/payroll/ComplianceChecks';
import { rupees } from '../components/payroll/payWords';

const STATUS: Record<TodoStatus, { label: string; tone: 'neutral' | 'warning' | 'success' | 'info' | 'danger' }> = {
  OPEN: { label: 'To fix', tone: 'warning' }, CHOSEN: { label: 'Waiting for the Owner', tone: 'info' }, APPLIED: { label: 'Fixed', tone: 'success' },
  RESOLVED: { label: 'No longer found', tone: 'neutral' }, DISMISSED: { label: 'Dismissed', tone: 'neutral' },
};
const day = (d: string | null | undefined) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const signed = (v: number | undefined | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${rupees(Math.abs(v))}`);

export default function PayrollComplianceTodos() {
  const can = useCan();
  const { id } = useParams<{ id?: string }>();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Compliance to-dos" /><NeedPayView what="Compliance to-dos" /></> : <ListSkeleton rows={5} />;
  return id ? <TodoPage id={Number(id)} /> : <TodosList />;
}

function TodosList() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('open');
  const [data, setData] = useState<TodoList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { complianceChecksApi.todos(status).then((d) => { setData(d); setError(null); }).catch(setError); }, [status]);
  useEffect(load, [load]);
  const checkNow = async () => {
    setBusy(true);
    try {
      const r = await complianceChecksApi.checkNow();
      toast.success(`Checked: ${r.sync.created.length} new, ${r.sync.updated.length} brought up to date, ${r.sync.resolved.length} no longer found.`);
      if (status === 'open') setData(r); else load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const columns: DataColumn<Todo>[] = useMemo(() => [
    {
      key: 'title', header: 'What', alwaysVisible: true,
      render: (t) => (
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{t.checkName}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{t.message}</Typography>
        </Stack>
      ),
      sortValue: (t) => t.title,
    },
    { key: 'severity', header: 'Kind', render: (t) => <ToneBadge tone={SEVERITY_TONE[t.severity]} label={SEVERITY_WORD[t.severity]} />, sortValue: (t) => t.severity },
    { key: 'people', header: 'People', numeric: true, render: (t) => t.peopleCount || '—', sortValue: (t) => t.peopleCount },
    { key: 'deadline', header: 'Deadline', render: (t) => <Box component="span" sx={{ color: t.overdue ? 'var(--c-danger-700)' : undefined, whiteSpace: 'nowrap' }}>{day(t.deadline)}{t.overdue ? ' · past' : ''}</Box>, sortValue: (t) => t.deadline ?? '' },
    { key: 'status', header: 'Status', render: (t) => <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}><ToneBadge tone={STATUS[t.status].tone} label={STATUS[t.status].label} />{t.topUpActive && <ToneBadge tone="danger" label="Top-up paid" />}</Stack>, sortValue: (t) => t.status },
  ], []);
  return (
    <>
      <PageHeader
        title="Compliance to-dos"
        subtitle="What no longer complies with the law in force, and a ready fix to choose and approve"
        actions={can.payroll.edit ? <Button variant="contained" startIcon={<FactCheckOutlined />} onClick={() => void checkNow()} disabled={busy} data-action="check-now">{busy ? 'Checking…' : 'Check now'}</Button> : undefined}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {data && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
          <TextField select size="small" label="Show" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} sx={{ minWidth: 160 }}>
            <MenuItem value="open">Open</MenuItem><MenuItem value="done">Done</MenuItem><MenuItem value="all">All</MenuItem>
          </TextField>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {data.counts.open} open · {data.counts.hard} breaking the law · {data.counts.waitingApproval} waiting for the Owner · {data.counts.overdue} past the deadline
          </Typography>
        </Box>
      )}
      {!data && !error ? <ListSkeleton rows={5} /> : (
        <DataTable
          rows={data?.todos ?? []}
          columns={columns}
          getRowId={(t) => t.id}
          onRowClick={(t) => navigate(`/${company}/cf_hrms/payroll-compliance/${t.id}`)}
          storageKey="cf_hrms.payroll-compliance"
          exportName="compliance-todos"
          empty={<EmptyState icon={<FactCheckOutlined />} title={status === 'open' ? 'Nothing to fix' : 'Nothing here'} hint="The law in force is checked every night, after each law change, and when you press Check now." />}
        />
      )}
    </>
  );
}

function PayCells({ before, after }: { before?: FixOption['perStructure'][number]['before'] | null; after?: FixOption['perStructure'][number]['after'] | null }) {
  const cell = (k: 'takeHome' | 'cost' | 'pfEe' | 'pfEr' | 'esiEe' | 'esiEr') => {
    const b = before?.[k] ?? 0; const a = after?.[k] ?? b;
    return <Typography sx={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{rupees(b)} → {rupees(a)} <Box component="span" sx={{ color: a < b ? 'var(--c-danger-700)' : a > b ? 'var(--c-success-700)' : 'var(--c-text-3)' }}>({signed(Math.round((a - b) * 100) / 100)})</Box></Typography>;
  };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 0.5 }}>
      <Box><Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Take-home a month</Typography>{cell('takeHome')}</Box>
      <Box><Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>Company cost a month</Typography>{cell('cost')}</Box>
      <Box><Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>PF employee / employer</Typography>{cell('pfEe')}{cell('pfEr')}</Box>
      <Box><Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>ESI employee / employer</Typography>{cell('esiEe')}{cell('esiEr')}</Box>
    </Box>
  );
}

function OptionCard({ o, chosen, selected, onSelect, canChoose }: { o: FixOption; chosen: boolean; selected: boolean; onSelect: () => void; canChoose: boolean }) {
  const [all, setAll] = useState(false);
  const people = all ? o.perPerson : o.perPerson.slice(0, 6);
  return (
    <Surface e={selected ? 2 : 1} sx={{ p: { xs: 1.5, sm: 2 }, border: selected ? '2px solid var(--c-primary-500, #3b6fd8)' : '1px solid var(--c-divider)' }} data-option={o.key}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{o.label}</Typography>
        {chosen && <ToneBadge tone="info" label="Chosen by HR" />}
        {!o.feasible && <ToneBadge tone={o.totals.feasible ? 'warning' : 'danger'} label={o.totals.feasible ? `Fits ${o.totals.feasible} of ${o.totals.people}` : 'Does not fit'} />}
        <Box sx={{ flex: 1 }} />
        {canChoose && o.totals.feasible > 0 && <Button size="small" variant={selected ? 'contained' : 'outlined'} onClick={onSelect} data-action={`pick-${o.key}`}>{selected ? 'Selected' : 'Select'}</Button>}
      </Box>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>{o.description}</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Typography sx={{ fontSize: 13 }}><b>Extra cost:</b> {signed(o.totals.extraCostMonthly)} a month · {signed(o.totals.extraCostAnnual)} a year</Typography>
        <Typography sx={{ fontSize: 13 }}><b>Take-home:</b> {signed(o.totals.takeHomeChangeMonthly)} a month in all</Typography>
        <Typography sx={{ fontSize: 13, color: o.totals.losers ? 'var(--c-danger-700)' : undefined }}><b>Lose take-home:</b> {o.totals.losers} of {o.totals.feasible}</Typography>
      </Box>
      {(o.structures ?? []).map((s) => <Typography key={s.code} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>New structure version {s.name}: Basic {s.basicFormula} (was in {s.fromName}).</Typography>)}
      {(o.components ?? []).map((c) => <Typography key={c.code} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{c.action === 'ACTIVATE' ? 'Make active' : 'Create'}: {c.name}.</Typography>)}
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mt: 1, mb: 0.5 }}>Per structure</Typography>
      <Stack spacing={1}>
        {o.perStructure.map((s) => (
          <Box key={s.structureId} sx={{ borderTop: '1px solid var(--c-divider)', pt: 0.75 }}>
            <Typography sx={{ fontSize: 13 }}>{s.name ?? `Structure #${s.structureId}`}{s.newStructure ? ` → ${s.newStructure}` : ''} · {s.people} {s.people === 1 ? 'person' : 'people'}{s.losers ? ` · ${s.losers} lose take-home` : ''}</Typography>
            <PayCells before={s.before} after={s.after} />
          </Box>
        ))}
      </Stack>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600, mt: 1.25, mb: 0.5 }}>Per person</Typography>
      <Stack spacing={1}>
        {people.map((p) => (
          <Box key={p.employeeId} sx={{ borderTop: '1px solid var(--c-divider)', pt: 0.75 }} data-person={p.code}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{p.name} <Typography component="span" sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.code}{p.effectiveFrom ? ` · from ${day(p.effectiveFrom)}` : ''}</Typography>
              {p.losesTakeHome && <Box component="span" sx={{ ml: 1, display: "inline-flex" }}><ToneBadge tone="danger" label="Loses take-home" /></Box>}
            </Typography>
            {p.feasible ? (
              <>
                {p.detail && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{p.detail}</Typography>}
                {p.after && <PayCells before={p.before} after={p.after} />}
              </>
            ) : <Typography sx={{ fontSize: 12.5, color: 'var(--c-danger-700)' }}>{p.note}</Typography>}
            {p.feasible && p.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{p.note}</Typography>}
          </Box>
        ))}
      </Stack>
      {o.perPerson.length > 6 && <Button size="small" onClick={() => setAll((v) => !v)} sx={{ mt: 0.5 }}>{all ? 'Show fewer' : `Show all ${o.perPerson.length}`}</Button>}
    </Surface>
  );
}

function TodoPage({ id }: { id: number }) {
  const { company = '' } = useParams<{ company: string }>();
  const can = useCan();
  const toast = useToast();
  const [d, setD] = useState<TodoDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [letters, setLetters] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const load = useCallback(() => { complianceChecksApi.todo(id).then((x) => { setD(x); setError(null); }).catch(setError); }, [id]);
  useEffect(load, [load]);
  useDetailTitle(d?.todo.checkName ?? null);
  if (!d) return error ? <ErrorNotice error={error} fallback="That to-do could not be loaded." onRetry={load} /> : <DetailSkeleton />;
  const t = d.todo;
  const run = async (fn: () => Promise<TodoDetail>, done: string) => {
    setBusy(true); setActionError(null);
    try { setD(await fn()); toast.success(done); } catch (e) { setActionError(e); } finally { setBusy(false); }
  };
  const options = d.options.length ? d.options : (d.chosen ? [d.chosen] : []);
  return (
    <Box sx={{ maxWidth: 1100, pb: 6 }}>
      <Button component={RouterLink} to={`/${company}/cf_hrms/payroll-compliance`} size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -0.75, mb: 0.5 }}>Compliance to-dos</Button>
      <Surface e={2} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600 }}>{t.checkName}</Typography>
          <ToneBadge tone={SEVERITY_TONE[t.severity]} label={SEVERITY_WORD[t.severity]} />
          <ToneBadge tone={STATUS[t.status].tone} label={STATUS[t.status].label} />
          {t.topUpActive && <ToneBadge tone="danger" label="Statutory top-up being paid" />}
        </Box>
        <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', mb: 0.75 }}>{t.message}</Typography>
        <RuleLine rule={t.rule} />
        <Typography sx={{ fontSize: 13, mt: 0.75 }}>
          Deadline: <b style={{ color: t.overdue ? 'var(--c-danger-700)' : undefined }}>{day(t.deadline)}</b> (the law's effective date){t.overdue ? ' — past.' : '.'}
          {t.reminders ? ` Reminded ${t.reminders} time${t.reminders === 1 ? '' : 's'}.` : ''}
          {t.lastCheckedAt ? ` Last checked ${new Date(t.lastCheckedAt).toLocaleString('en-IN')} (${(t.lastTrigger ?? '').toLowerCase().replace('_', ' ')}).` : ''}
        </Typography>
        {t.unverifiedNote && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)', mt: 0.5 }}>{t.unverifiedNote}</Typography>}
      </Surface>

      <Stack spacing={2}>
        <ErrorNotice error={actionError} />
        {t.topUpActive && (
          <Callout tone="danger" title="A statutory top-up is being paid">
            Past the deadline, each payroll run adds a "Statutory top-up (minimum wage)" line for the people below, so their pay stays at the legal minimum until a fix is applied. It shows on their payslips.{t.topUpFrom ? ` Paid since ${t.topUpFrom}.` : ''}
          </Callout>
        )}
        {t.status === 'APPLIED' && t.applied && (
          <Callout tone="success" title="Fixed">
            {`“${d.chosen?.label ?? t.chosenOption ?? ''}” chosen by ${t.chosenBy?.name ?? 'HR'}, approved by ${t.approvedBy?.name ?? 'the Owner'}. `}
            {(t.applied.salaries ?? []).length} salary row{(t.applied.salaries ?? []).length === 1 ? '' : 's'} dated from the law's date{(t.applied.structures ?? []).length ? `, ${(t.applied.structures ?? []).length} new structure version(s)` : ''}{(t.applied.components ?? []).length ? `, ${(t.applied.components ?? []).length} component(s)` : ''}.
            {(t.applied.salaries ?? []).some((s) => s.arrearsFor.length) ? ' The next run pays the arrears.' : ''}
          </Callout>
        )}
        {t.status === 'CHOSEN' && (
          <Callout tone="info" title="Waiting for the Owner">
            {t.chosenBy?.name ?? 'HR'} chose “{options.find((o) => o.key === t.chosenOption)?.label ?? t.chosenOption}”{t.chosenNote ? ` — “${t.chosenNote}”` : ''}. The Owner approves it (not the person who chose it); then it is applied, dated from the law's effective date.
          </Callout>
        )}

        <SectionCard title="Affected" subtitle={`${t.peopleCount} ${t.peopleCount === 1 ? 'person' : 'people'}${d.structures.length ? ` · ${d.structures.length} structure${d.structures.length === 1 ? '' : 's'}` : ''}${d.policies.length ? ` · ${d.policies.length} polic${d.policies.length === 1 ? 'y' : 'ies'}` : ''}`}>
          <Stack spacing={0.75} data-testid="todo-affected">
            {d.structures.map((s) => <Typography key={s.id} sx={{ fontSize: 13 }}><b>{s.name}</b> — {s.people} {s.people === 1 ? 'person' : 'people'}</Typography>)}
            {d.policies.map((p) => <Typography key={`${p.kind}${p.id}`} sx={{ fontSize: 13 }}><b>{p.name}</b> — {p.message}</Typography>)}
            {d.people.slice(0, 12).map((p) => <Typography key={p.employeeId} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{p.name} ({p.code}): {p.message}</Typography>)}
            {d.people.length > 12 && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>… and {d.people.length - 12} more.</Typography>}
          </Stack>
        </SectionCard>

        {options.length > 0 && (
          <SectionCard title="Fixes" subtitle="Each worked out on today's data: before and after, per structure and per person.">
            <Stack spacing={1.5}>
              {options.map((o) => (
                <OptionCard key={o.key} o={o} chosen={t.chosenOption === o.key} selected={pick === o.key} onSelect={() => setPick(o.key)} canChoose={d.can.choose && can.payroll.edit} />
              ))}
            </Stack>
            {d.can.choose && can.payroll.edit && (
              <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                <TextField size="small" label="Note for the Owner (optional)" value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 500 }} />
                <FormControlLabel control={<Checkbox checked={letters} onChange={(e) => setLetters(e.target.checked)} />} label="Revision letters wanted (Documents › letters)" />
                <Box><Button variant="contained" disabled={!pick || busy} onClick={() => void run(() => complianceChecksApi.choose(id, { option: pick as string, note: note.trim() || null, letters }), 'Chosen. The Owner approves it next.')} data-action="choose">Choose this fix</Button></Box>
              </Box>
            )}
          </SectionCard>
        )}
        {!options.length && t.status === 'OPEN' && <Callout title="No ready fix">This needs a change by hand (a policy, a location's zone, a role's skill). It closes by itself once the next check no longer finds it.</Callout>}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {d.can.approve && <Button variant="contained" color="success" disabled={busy} onClick={() => void run(() => complianceChecksApi.approve(id), 'Approved and applied.')} data-action="approve">Approve and apply</Button>}
          {t.status === 'CHOSEN' && !d.can.approve && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{t.chosenBy?.id && can.owner ? 'You chose this fix: someone else approves it.' : 'Only the Owner approves.'}</Typography>}
          {d.can.dismiss && can.payroll.edit && <Button color="inherit" onClick={() => setDismissing(true)} data-action="dismiss">Dismiss with a reason</Button>}
        </Box>
      </Stack>
      <PromptDialog open={dismissing} title="Dismiss this to-do" body="Only a warning or a note can be dismissed. The reason is kept with it." label="Why it is not a problem" required multiline confirmLabel="Dismiss"
        onClose={() => setDismissing(false)} onConfirm={async (reason) => { setD(await complianceChecksApi.dismiss(id, reason)); setDismissing(false); toast.success('Dismissed.'); }} />
    </Box>
  );
}
