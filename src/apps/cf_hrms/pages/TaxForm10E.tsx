/**
 * Tax › Form 10E (CF_HRMS_HIRING_SPEC.md §25.5 "Arrears and relief") — relief when arrears of salary for
 * earlier years were paid this year: section 89(1) and Form 10E to 2025-26, section 157(1) and Form No. 39
 * from 2026-27. The people paid such arrears (the payroll's arrears lines), each one's worksheet: the year of
 * receipt with and without the arrears, and each earlier year with its own rules — or, for a year this app
 * has no rules for, the figures HR or the person types. The PDF goes to the person (My tax › Forms).
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Callout, ConfirmDialog, EmptyState, ErrorNotice, ListSkeleton, PageHeader, SectionCard, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { extrasApi, type EarlierInput, type KeptRelief, type ReliefList, type ReliefSnapshot } from '../api/payrollExtras';
import { YearSelect } from '../components/tax/TaxParts';
import { useTaxYears } from '../components/tax/taxWords';
import { rupees } from '../components/payroll/payWords';
import { saveBase64File } from '../api/excel';
import { useCan } from '../access/can';

export default function TaxForm10E() {
  const toast = useToast();
  const can = useCan();
  const { years, year, setYear } = useTaxYears();
  const [data, setData] = useState<ReliefList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => {
    if (!year) return;
    extrasApi.reliefList(year).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [year]);
  useEffect(load, [load]);

  return (
    <Box>
      <PageHeader
        title={data?.law ? data.law.formLabel : 'Form 10E'}
        subtitle={data?.law ? `Relief for arrears of earlier years — ${data.law.section}, ${data.law.rule}.` : 'Relief for arrears of salary of earlier years.'}
        actions={<YearSelect value={year} years={years} onChange={(y) => { setYear(y); setOpen(null); }} />}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <ListSkeleton />}
      {data && data.people.length === 0 && <EmptyState title="Nobody to relieve" hint={`No arrears for an earlier year were paid in a locked run of ${year}.`} />}
      {data && data.people.length > 0 && (
        <Stack spacing={1}>
          {data.law && <Callout tone="info" title="The person files it">{data.law.employerNote}</Callout>}
          {data.people.map((p) => (
            <Box key={p.employee.id} sx={{ p: 1.25, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{p.employee.name}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    {p.employee.code}{p.arrears ? ` · arrears ${p.arrears.years.map((y) => `${rupees(y.amount)} for ${y.year}`).join(', ')}` : ' · no arrears now'}
                  </Typography>
                </Box>
                {p.worksheet ? <ToneBadge tone={p.worksheet.status === 'READY' ? 'success' : 'warning'} label={p.worksheet.status === 'READY' ? `Relief ${rupees(p.worksheet.relief)}` : `Needs ${p.worksheet.missing.join(', ')}`} noIcon /> : <ToneBadge tone="neutral" label="Not made" noIcon />}
                <Button size="small" variant="outlined" onClick={() => setOpen(open === p.employee.id ? null : p.employee.id)}>{open === p.employee.id ? 'Close' : p.worksheet ? 'Open' : 'Work it out'}</Button>
              </Box>
              {open === p.employee.id && <Worksheet year={year} employeeId={p.employee.id} canEdit={can.payroll.edit} canRemove={can.payroll.remove} onChanged={load} toast={toast} />}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function Worksheet({ year, employeeId, canEdit, canRemove, onChanged, toast }: {
  year: string; employeeId: number; canEdit: boolean; canRemove: boolean; onChanged: () => void; toast: ReturnType<typeof useToast>;
}) {
  const [kept, setKept] = useState<KeptRelief | null>(null);
  const [fresh, setFresh] = useState<ReliefSnapshot | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [receipt, setReceipt] = useState('');
  const [earlier, setEarlier] = useState<Record<string, EarlierInput>>({});
  const [busy, setBusy] = useState(false);
  const [remove, setRemove] = useState(false);
  const load = useCallback(() => {
    extrasApi.relief(year, employeeId).then((d) => {
      setKept(d.kept); setFresh(d.fresh); setError(null);
      setReceipt(d.kept?.inputs.receipt?.totalIncome != null ? String(d.kept.inputs.receipt.totalIncome) : '');
      setEarlier(Object.fromEntries((d.fresh?.earlier ?? []).map((e) => [e.year, { regime: d.kept?.inputs.earlier?.[e.year]?.regime ?? e.regime ?? 'NEW', totalIncome: d.kept?.inputs.earlier?.[e.year]?.totalIncome ?? '', taxWithout: d.kept?.inputs.earlier?.[e.year]?.taxWithout ?? '', taxWith: d.kept?.inputs.earlier?.[e.year]?.taxWith ?? '' }])));
    }).catch(setError);
  }, [year, employeeId]);
  useEffect(load, [load]);
  const s = kept?.result ?? fresh;
  const save = async () => {
    setBusy(true);
    try {
      const r = await extrasApi.generateRelief(year, employeeId, { receipt: { totalIncome: receipt.trim() === '' ? null : receipt }, earlier });
      toast.success(r.worksheet.status === 'READY' ? `Worked out: relief ${rupees(r.worksheet.relief)}.` : 'Saved. Some figures are still missing.');
      load(); onChanged();
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const upd = (y: string, k: keyof EarlierInput, v: string) => setEarlier((x) => ({ ...x, [y]: { ...x[y], [k]: v } }));

  if (error) return <ErrorNotice error={error} onRetry={load} sx={{ mt: 1 }} />;
  if (!s) return <ListSkeleton />;
  const w = s.worksheet;
  return (
    <Stack spacing={1.5} sx={{ mt: 1.5 }}>
      <Callout tone={w.complete ? (w.relief > 0 ? 'success' : 'neutral') : 'warning'} title={w.complete ? `Relief ${rupees(w.relief)}` : 'Not finished'}>{w.sentence}</Callout>
      {s.notes.map((n, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{n}</Typography>)}
      <SectionCard title={`${s.year}, the year of receipt (${s.regime === 'OLD' ? 'old' : 'new'} regime)`}>
        <Row label="Total income including the arrears" value={w.rows.totalIncomeIncluding} note={s.receipt.how === 'TYPED' ? 'typed' : 'from the payroll'} />
        <Row label="Arrears of earlier years" value={w.rows.arrears} />
        <Row label="Total income without them" value={w.rows.totalIncomeExcluding} />
        <Row label="Tax with / without them" text={`${rupees(w.rows.taxOnIncluding)} / ${rupees(w.rows.taxOnExcluding)}`} />
        <Row label="Tax on the arrears this year (A)" value={w.a} strong />
        {canEdit && <TextField size="small" label="Type the total income of the year instead (empty: from the payroll)" value={receipt} onChange={(e) => setReceipt(e.target.value.replace(/[₹,\s]/g, ''))} sx={{ mt: 1, maxWidth: 420 }} inputProps={{ inputMode: 'decimal' }} />}
      </SectionCard>
      {s.earlier.map((e) => {
        const t = w.table.find((x) => x.year === e.year);
        const inp = earlier[e.year] ?? {};
        return (
          <SectionCard key={e.year} title={`${e.year} — ${rupees(e.arrears)} of arrears`} subtitle={e.rules ? 'Worked with that year’s rules.' : 'No tax rules for that year here: type its figures (from its return or Form 16).'}>
            {t?.difference != null ? (
              <>
                <Row label="Total income of the year" value={t.totalIncome} note={e.how === 'ENGINE' ? 'from the payroll' : 'typed'} />
                <Row label="Tax on it / with the arrears added" text={`${rupees(t.taxWithout ?? 0)} / ${rupees(t.taxWith ?? 0)}`} />
                <Row label="Extra tax had they been paid then" value={t.difference} strong />
              </>
            ) : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Missing: {(e.need ?? []).map((x) => ({ totalIncome: 'total income', taxWithout: 'tax on it', taxWith: 'tax with the arrears' }[x] ?? x)).join(', ')}.</Typography>}
            {canEdit && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 1, mt: 1 }}>
                <TextField select size="small" label="Regime" value={String(inp.regime ?? 'NEW')} onChange={(ev) => upd(e.year, 'regime', ev.target.value)}>
                  <MenuItem value="NEW">New</MenuItem><MenuItem value="OLD">Old</MenuItem>
                </TextField>
                <TextField size="small" label="Total income" value={String(inp.totalIncome ?? '')} onChange={(ev) => upd(e.year, 'totalIncome', ev.target.value.replace(/[₹,\s]/g, ''))} inputProps={{ inputMode: 'decimal' }} />
                {!e.rules && <TextField size="small" label="Tax on it" value={String(inp.taxWithout ?? '')} onChange={(ev) => upd(e.year, 'taxWithout', ev.target.value.replace(/[₹,\s]/g, ''))} inputProps={{ inputMode: 'decimal' }} />}
                {!e.rules && <TextField size="small" label="Tax with the arrears" value={String(inp.taxWith ?? '')} onChange={(ev) => upd(e.year, 'taxWith', ev.target.value.replace(/[₹,\s]/g, ''))} inputProps={{ inputMode: 'decimal' }} />}
              </Box>
            )}
          </SectionCard>
        );
      })}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        {canEdit && <Button variant="contained" disabled={busy} onClick={() => void save()} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{kept ? 'Work it out again' : 'Work it out and keep'}</Button>}
        {kept && <Button variant="outlined" onClick={async () => { try { saveBase64File(await extrasApi.reliefFile(year, employeeId)); } catch (e) { toast.error(errorMessage(e)); } }}>Download PDF</Button>}
        {kept && canRemove && <Button color="error" onClick={() => setRemove(true)}>Remove</Button>}
      </Stack>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{s.law.source}</Typography>
      <ConfirmDialog open={remove} title="Remove this worksheet?" body="The person no longer sees it in My tax." confirmLabel="Remove" danger onClose={() => setRemove(false)}
        onConfirm={async () => { try { await extrasApi.removeRelief(year, employeeId); setRemove(false); toast.success('Removed.'); load(); onChanged(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </Stack>
  );
}

function Row({ label, value, text, note, strong }: { label: string; value?: number | null; text?: string; note?: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.5, borderBottom: '1px solid var(--c-divider)', alignItems: 'baseline', '&:last-of-type': { borderBottom: 0 } }}>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: strong ? 600 : 400 }}>{label}{note ? <Box component="span" sx={{ color: 'var(--c-text-2)' }}> ({note})</Box> : null}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: strong ? 600 : 400, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{text ?? (value == null ? '—' : rupees(value))}</Typography>
    </Box>
  );
}
