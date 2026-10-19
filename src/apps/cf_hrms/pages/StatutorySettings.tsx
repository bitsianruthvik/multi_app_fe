/**
 * Payroll › Statutory settings (CF_HRMS_HIRING_SPEC.md §25.2) — the company's
 * payroll settings (state, the bank account salaries are paid from) and every
 * dated row of PF, ESI, professional tax and labour welfare fund, newest first,
 * each with its source.
 *
 * Nothing in the run knows a rate: it reads the row in force on the 1st of its
 * month. A row nobody has checked on an official page is UNVERIFIED and says so
 * in the warning tone; a run that used one says so too.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  Callout, ConfirmDialog, ErrorNotice, ListSkeleton, PageHeader, SectionCard, ToneBadge, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type PaySettings, type StatutoryKind, type StatutoryList, type StatutoryRow } from '../api/payroll';
import { RowActions } from '../components/list/RowActions';
import { StatutoryDialog } from '../components/payroll/StatutoryDialog';
import { MiniTable } from '../components/payroll/PayParts';
import { STATUTORY_KIND_WORD, rupees } from '../components/payroll/payWords';
import { longDay } from '../components/jobDates';

const KINDS: StatutoryKind[] = ['PF', 'ESI', 'PT', 'LWF'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const pct = (v: unknown) => (num(v) == null ? '—' : `${num(v)}%`);
const ROUND: Record<string, string> = { NEAREST: 'rounded to the nearest rupee', UP: 'rounded up to the next rupee', DOWN: 'rounded down' };

function periodWord(p: { from: string; to: string }) {
  const m = (s: string) => MONTH_SHORT[Number(s.slice(0, 2)) - 1] ?? s;
  return `${Number(p.from.slice(3))} ${m(p.from)} – ${Number(p.to.slice(3))} ${m(p.to)}`;
}

/** The values of a row, in words. */
function Values({ row }: { row: StatutoryRow }) {
  const s = row.settings;
  const line = (parts: (string | null | false)[]) => (
    <Typography sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{parts.filter(Boolean).join(' · ')}</Typography>
  );
  if (row.kind === 'PF') {
    return line([
      `Employee ${pct(s.employeeRate)}`,
      `employer ${pct(s.employerRate)} (pension ${pct(s.epsRate)})`,
      `on wages up to ${rupees(num(s.wageCeiling))} a month`,
      `EDLI ${pct(s.edliRate)}`,
      `admin ${pct(s.adminRate)}${num(s.adminMinimum) ? `, at least ${rupees(num(s.adminMinimum))} a month` : ''}`,
      typeof s.rounding === 'string' && ROUND[s.rounding],
    ]);
  }
  if (row.kind === 'ESI') {
    const periods = Array.isArray(s.periods) ? (s.periods as { from: string; to: string }[]) : [];
    return line([
      `Employee ${pct(s.employeeRate)}`,
      `employer ${pct(s.employerRate)}`,
      `covers wages up to ${rupees(num(s.wageCeiling))} a month${num(s.wageCeilingDisabled) ? ` (${rupees(num(s.wageCeilingDisabled))} with a disability)` : ''}`,
      num(s.exemptDailyWage) != null && `no employee share at a daily wage up to ${rupees(num(s.exemptDailyWage))}`,
      periods.length > 0 && `periods ${periods.map(periodWord).join(' and ')}`,
      typeof s.rounding === 'string' && ROUND[s.rounding],
    ]);
  }
  if (row.kind === 'PT') {
    const slabs = Array.isArray(s.slabs) ? (s.slabs as { upTo: number | null; amount: number }[]) : [];
    return (
      <Stack spacing={0.75}>
        <MiniTable
          cols="minmax(160px, 1fr) 120px"
          minWidth={280}
          head={['Gross a month', 'Tax a month']}
          rows={slabs.map((x, i) => {
            const from = i > 0 ? Number(slabs[i - 1].upTo ?? 0) : 0;
            const label = x.upTo == null ? `Above ${rupees(from)}` : `${from ? `${rupees(from + 1)} to` : 'Up to'} ${rupees(x.upTo)}`;
            return { key: i, cells: [label, Number(x.amount) ? rupees(x.amount) : 'Nil'] };
          })}
        />
        {num(s.yearlyMaximum) != null && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>At most {rupees(num(s.yearlyMaximum))} a year.</Typography>}
      </Stack>
    );
  }
  const months = Array.isArray(s.months) ? (s.months as number[]) : [];
  return line([
    `Employee ${rupees(num(s.employee))}`,
    `employer ${rupees(num(s.employer))}`,
    months.length ? `deducted in ${months.map((m) => MONTH_SHORT[m - 1]).join(', ')}` : 'no month set',
  ]);
}

function CompanyCard({ data, canEdit, onSaved }: { data: StatutoryList; canEdit: boolean; onSaved: (c: PaySettings) => void }) {
  const toast = useToast();
  const [d, setD] = useState(() => ({
    stateCode: data.company.stateCode, debitAccountNo: data.company.debitAccountNo ?? '', debitIfsc: data.company.debitIfsc ?? '', narration: data.company.narration ?? 'Salary',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const dirty = d.stateCode !== data.company.stateCode || d.debitAccountNo !== (data.company.debitAccountNo ?? '')
    || d.debitIfsc !== (data.company.debitIfsc ?? '') || d.narration !== (data.company.narration ?? 'Salary');

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { company } = await payrollApi.putSettings({
        stateCode: d.stateCode, debitAccountNo: d.debitAccountNo.trim() || null, debitIfsc: d.debitIfsc.trim().toUpperCase() || null, narration: d.narration.trim() || 'Salary',
      });
      toast.success('Payroll settings saved.');
      onSaved(company);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="The company’s payroll settings"
      subtitle="The state decides which professional tax and LWF apply. The bank account goes into the bank file."
      actions={canEdit ? <Button variant="contained" size="small" onClick={() => void save()} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save'}</Button> : undefined}
    >
      <ErrorNotice error={error} sx={{ mb: 1.5 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 1.5 }}>
        <TextField select size="small" label="State" value={d.stateCode} disabled={!canEdit} onChange={(e) => setD({ ...d, stateCode: e.target.value })}>
          {data.states.filter((s) => s.code !== 'IN').map((s) => <MenuItem key={s.code} value={s.code}>{s.name}</MenuItem>)}
          {!data.states.some((s) => s.code === d.stateCode) && <MenuItem value={d.stateCode}>{d.stateCode}</MenuItem>}
        </TextField>
        <TextField size="small" label="Paid from account" value={d.debitAccountNo} disabled={!canEdit} onChange={(e) => setD({ ...d, debitAccountNo: e.target.value })} inputProps={{ maxLength: 40 }} />
        <TextField size="small" label="IFSC of that account" value={d.debitIfsc} disabled={!canEdit} onChange={(e) => setD({ ...d, debitIfsc: e.target.value.toUpperCase() })} inputProps={{ maxLength: 11 }} placeholder="SBIN0001234" />
        <TextField size="small" label="Narration" value={d.narration} disabled={!canEdit} onChange={(e) => setD({ ...d, narration: e.target.value })} inputProps={{ maxLength: 60 }} helperText="The bank file adds the month." />
      </Box>
    </SectionCard>
  );
}

export default function StatutorySettings() {
  const can = useCan();
  const toast = useToast();
  const [data, setData] = useState<StatutoryList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<{ row: StatutoryRow | null; kind: StatutoryKind } | null>(null);
  const [removing, setRemoving] = useState<StatutoryRow | null>(null);

  const load = useCallback(() => {
    payrollApi.statutory().then((d) => { setData(d); setError(null); }).catch(setError);
  }, []);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const rows = data?.settings ?? [];
    return KINDS.map((kind) => {
      const ofKind = rows.filter((r) => r.kind === kind);
      const states = [...new Set(ofKind.map((r) => r.stateCode))];
      return { kind, states: states.map((st) => ({ st, rows: ofKind.filter((r) => r.stateCode === st).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)) })) };
    });
  }, [data]);
  const stateName = (code: string) => data?.states.find((s) => s.code === code)?.name ?? code;

  if (!data) {
    return (
      <>
        <PageHeader title="Statutory settings" />
        {error ? <ErrorNotice error={error} onRetry={load} /> : <ListSkeleton rows={8} />}
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader title="Statutory settings" subtitle="PF, ESI, professional tax and LWF — dated, each with its source" />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      <Stack spacing={2}>
        <CompanyCard key={data.company.updatedAt ?? 'new'} data={data} canEdit={can.payroll.edit} onSaved={(company) => setData({ ...data, company })} />

        {data.unverified > 0 && (
          <Callout tone="warning" title={`${data.unverified} row${data.unverified === 1 ? ' is' : 's are'} not verified`}>
            A value that could not be confirmed on an official page is marked “Not verified”. Check it (or ask the company’s CA), then mark it verified.
          </Callout>
        )}
        {data.settings.length === 0 && (
          <Callout title="No statutory settings yet">Set up payroll on Payroll › Runs or Components to add the usual rows, or add them here one by one.</Callout>
        )}

        {groups.map((g) => (
          <SectionCard
            key={g.kind}
            title={STATUTORY_KIND_WORD[g.kind]}
            subtitle={g.kind === 'PF' || g.kind === 'ESI' ? 'The same in every state.' : 'By state.'}
            actions={can.payroll.edit ? (
              <Button size="small" startIcon={<AddRounded />} onClick={() => setDialog({ row: null, kind: g.kind })} data-action={`add-statutory-${g.kind}`}>
                Add a dated row
              </Button>
            ) : undefined}
          >
            {g.states.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>No rows yet.</Typography>
            ) : (
              <Stack spacing={2}>
                {g.states.map(({ st, rows }) => (
                  <Box key={st}>
                    {(g.kind === 'PT' || g.kind === 'LWF') && (
                      <Typography sx={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', mb: 0.5 }}>{stateName(st)}</Typography>
                    )}
                    {rows.map((r) => {
                      const inForce = data.inForce[r.kind] === r.id;
                      return (
                        <Box key={r.id} data-statutory={r.id} sx={{
                          display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap', py: 1.25,
                          borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
                        }}>
                          <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
                            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>From {longDay(r.effectiveFrom)}</Typography>
                              {inForce && <ToneBadge tone="success" label="In force today" noIcon />}
                              <ToneBadge tone={r.verification === 'VERIFIED' ? 'success' : 'warning'} label={r.verification === 'VERIFIED' ? 'Verified' : 'Not verified'} noIcon />
                            </Box>
                            <Values row={r} />
                            {r.source && (
                              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75, overflowWrap: 'anywhere' }}>
                                Source: {r.source}
                                {r.sourceUrl && <> {' '}<Link href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Open the source</Link></>}
                              </Typography>
                            )}
                            {r.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5, overflowWrap: 'anywhere' }}>Note: {r.note}</Typography>}
                          </Box>
                          {(can.payroll.edit || can.payroll.remove) && (
                            <RowActions
                              name={`${r.kind} from ${longDay(r.effectiveFrom)}`}
                              onEdit={can.payroll.edit ? () => setDialog({ row: r, kind: r.kind }) : undefined}
                              onRemove={can.payroll.remove ? () => setRemoving(r) : undefined}
                            />
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </Stack>
            )}
          </SectionCard>
        ))}
      </Stack>

      <StatutoryDialog
        open={!!dialog}
        row={dialog?.row ?? null}
        kind={dialog?.kind ?? 'PF'}
        stateCode={data.company.stateCode}
        states={data.states}
        onClose={() => setDialog(null)}
        onSaved={() => { toast.success('Statutory settings saved.'); load(); }}
      />
      <ConfirmDialog
        open={!!removing}
        title="Remove this row?"
        entityName={removing ? `${STATUTORY_KIND_WORD[removing.kind]}, ${stateName(removing.stateCode)}, from ${longDay(removing.effectiveFrom)}` : undefined}
        body="A row a locked payroll used stays. The row before it applies again from its day."
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await payrollApi.removeStatutory(removing.id);
          toast.success('Row removed.');
          load();
        }}
      />
    </Box>
  );
}
