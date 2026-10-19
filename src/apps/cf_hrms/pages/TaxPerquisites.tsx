/**
 * Tax › Perquisites (CF_HRMS_HIRING_SPEC.md §25.5) — the register of each person's perquisites for a tax
 * year. HR enters the FACTS (a car, accommodation, a loan, gifts, a credit card, a club, other); the VALUE
 * is worked out by the year's rules (rule 3 of the 1962 Rules to 2025-26, rule 15 of the 2026 Rules from
 * 2026-27) and previewed as you type. The values go on Form 12BA / Form 123 and, from P3b, into the TDS.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { Callout, ConfirmDialog, EmptyState, ErrorNotice, FormDialog, ListSkeleton, PageHeader, SectionCard, StatStrip, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { extrasApi, type Facts, type PerqEntry, type PerqInput, type PerqKind, type PerqRegister, type Valued } from '../api/payrollExtras';
import { taxApi, type Profiles } from '../api/tax';
import { YearSelect } from '../components/tax/TaxParts';
import { useTaxYears } from '../components/tax/taxWords';
import { rupees } from '../components/payroll/payWords';
import { useCan } from '../access/can';

const KIND_WORD: Record<PerqKind, string> = { CAR: 'Car', ACCOMMODATION: 'Accommodation', LOAN: 'Loan', GIFT: 'Gift or voucher', CREDIT_CARD: 'Credit card', CLUB: 'Club', OTHER: 'Other' };
type Field = { key: string; label: string; type: 'select' | 'amount' | 'bool' | 'text'; options?: [string, string][]; show?: (f: Facts) => boolean; help?: string };
const FIELDS: Record<PerqKind, Field[]> = {
  CAR: [
    { key: 'ownedBy', label: 'Whose car', type: 'select', options: [['EMPLOYER', 'The company’s (owned or hired)'], ['EMPLOYEE', 'The employee’s own']] },
    { key: 'use', label: 'Used for', type: 'select', options: [['MIXED', 'Work and personal'], ['PERSONAL', 'Personal only'], ['OFFICIAL', 'Work only']] },
    { key: 'engine', label: 'Engine', type: 'select', options: [['UP_TO_1600', 'Up to 1.6 litres'], ['ABOVE_1600', 'Above 1.6 litres'], ['ELECTRIC', 'Electric']] },
    { key: 'runningCostsBy', label: 'Running costs paid by', type: 'select', options: [['EMPLOYER', 'The company'], ['EMPLOYEE', 'The employee']], show: (f) => f.ownedBy !== 'EMPLOYEE' && f.use === 'MIXED' },
    { key: 'chauffeur', label: 'With a driver', type: 'bool' },
    { key: 'officialRecords', label: 'Journey records and the employer’s certificate are kept', type: 'bool', show: (f) => f.use === 'OFFICIAL' },
    { key: 'carCost', label: 'Cost of the car', type: 'amount', show: (f) => f.ownedBy !== 'EMPLOYEE' && f.use === 'PERSONAL', help: 'Wear and tear is a share of it' },
    { key: 'hirePerMonth', label: 'Hire a month (a hired car)', type: 'amount', show: (f) => f.ownedBy !== 'EMPLOYEE' && f.use === 'PERSONAL' },
    { key: 'actualCostPerMonth', label: 'Expenses paid by the company a month', type: 'amount', show: (f) => f.ownedBy === 'EMPLOYEE' || f.use === 'PERSONAL' },
    { key: 'recoveredPerMonth', label: 'Recovered from the employee a month', type: 'amount', show: (f) => f.use === 'PERSONAL' },
    { key: 'director', label: 'A director (taxable whatever the salary)', type: 'bool' },
  ],
  ACCOMMODATION: [
    { key: 'type', label: 'Accommodation', type: 'select', options: [['OWNED', 'Owned by the company'], ['LEASED', 'Leased by the company'], ['HOTEL', 'Hotel']] },
    { key: 'population', label: 'Population of the city (2011 census)', type: 'select', options: [['ABOVE_40L', 'More than 40 lakh'], ['15L_TO_40L', '15 to 40 lakh'], ['UP_TO_15L', 'Up to 15 lakh']], show: (f) => f.type === 'OWNED' },
    { key: 'leaseRentPerMonth', label: 'Lease rent a month', type: 'amount', show: (f) => f.type === 'LEASED' },
    { key: 'hotelChargesPerMonth', label: 'Hotel charges a month', type: 'amount', show: (f) => f.type === 'HOTEL' },
    { key: 'furnitureCost', label: 'Cost of the furniture', type: 'amount' },
    { key: 'furnitureHirePerMonth', label: 'Or furniture hire a month', type: 'amount' },
    { key: 'rentRecoveredPerMonth', label: 'Rent paid by the employee a month', type: 'amount' },
    { key: 'salaryPerMonth', label: 'Salary a month (empty: from payroll)', type: 'amount' },
  ],
  LOAN: [
    { key: 'purpose', label: 'Purpose', type: 'select', options: [['HOUSING', 'Housing'], ['CAR', 'Car'], ['PERSONAL', 'Personal'], ['EDUCATION', 'Education'], ['OTHER', 'Other']] },
    { key: 'amount', label: 'Loan amount', type: 'amount' },
    { key: 'ratePct', label: 'Interest charged, % a year', type: 'amount' },
    { key: 'principalPerMonth', label: 'Repaid each month', type: 'amount' },
    { key: 'sbiRatePct', label: 'SBI rate, % a year (empty: the rule’s)', type: 'amount' },
    { key: 'medical', label: 'For medical treatment of a listed disease', type: 'bool' },
  ],
  GIFT: [{ key: 'amount', label: 'Value', type: 'amount' }],
  CREDIT_CARD: [{ key: 'amount', label: 'Paid by the company', type: 'amount' }, { key: 'officialAmount', label: 'Of which official, with records', type: 'amount' }, { key: 'recovered', label: 'Recovered', type: 'amount' }],
  CLUB: [{ key: 'amount', label: 'Paid by the company', type: 'amount' }, { key: 'officialAmount', label: 'Of which official, with records', type: 'amount' }, { key: 'recovered', label: 'Recovered', type: 'amount' }],
  OTHER: [{ key: 'nature', label: 'What it is', type: 'text' }, { key: 'valuePerMonth', label: 'Value a month', type: 'amount' }, { key: 'amount', label: 'Or value for the year', type: 'amount' }, { key: 'recovered', label: 'Recovered', type: 'amount' }],
};
const DEFAULTS: Record<PerqKind, Facts> = {
  CAR: { ownedBy: 'EMPLOYER', use: 'MIXED', engine: 'UP_TO_1600', runningCostsBy: 'EMPLOYER', chauffeur: false },
  ACCOMMODATION: { type: 'OWNED', population: 'ABOVE_40L' },
  LOAN: { purpose: 'HOUSING', ratePct: 0 },
  GIFT: {}, CREDIT_CARD: {}, CLUB: {}, OTHER: {},
};
const startOf = (year: string) => `${year.slice(0, 4)}-04-01`;

export default function TaxPerquisites() {
  const toast = useToast();
  const can = useCan();
  const { years, year, setYear } = useTaxYears();
  const [data, setData] = useState<PerqRegister | null>(null);
  const [people, setPeople] = useState<Profiles | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ entry: PerqEntry | null; employeeId?: number } | null>(null);
  const [remove, setRemove] = useState<PerqEntry | null>(null);

  const load = useCallback(() => {
    if (!year) return;
    extrasApi.perquisites(year).then((d) => { setData(d); setError(null); }).catch(setError);
    taxApi.profiles(year).then(setPeople).catch(() => undefined);
  }, [year]);
  useEffect(load, [load]);
  const shown = useMemo(() => (data?.people ?? []).filter((p) => !q.trim() || `${p.employee.name} ${p.employee.code}`.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);

  return (
    <Box>
      <PageHeader
        title="Perquisites"
        subtitle={data?.rule ? `${String(data.rule.statement)} · ${String(data.rule.rule)}` : 'Cars, accommodation, loans and other benefits, valued by the year’s rules.'}
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <YearSelect value={year} years={years} onChange={setYear} />
            {can.payroll.edit && <Button variant="contained" startIcon={<AddRounded />} disabled={!data?.rule} onClick={() => setEdit({ entry: null })}>Add a perquisite</Button>}
          </Stack>
        )}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {data?.rulesMissing && <Callout tone="warning" title="No rules for this year" sx={{ mb: 2 }}>{data.rulesMissing}</Callout>}
      {data?.source && !data.source.verified && <Callout tone="warning" title={`The ${year} rules are not fully verified`} sx={{ mb: 2 }}>{data.source.note}</Callout>}
      {!data && !error && <ListSkeleton />}
      {data && (
        <Stack spacing={2}>
          <StatStrip stats={[
            { label: 'People', value: data.totals.people },
            { label: 'Perquisites', value: data.totals.entries },
            { label: 'Taxable value of the year', value: data.totals.value, display: rupees(data.totals.value) },
          ]} />
          <TextField size="small" label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 320 }} />
          {shown.length === 0 && <EmptyState title="No perquisites" hint={`Nobody has a perquisite in ${year}${q ? ' by that name' : ''}. Add one: the value is worked out from the facts.`} />}
          {shown.map((p) => (
            <SectionCard key={p.employee.id} title={`${p.employee.name} · ${p.employee.code}`} subtitle={`Taxable value of the year ${rupees(p.total)}${p.salaryKnown ? '' : ' · no salary in payroll this year'}`}
              actions={can.payroll.edit ? <Button size="small" startIcon={<AddRounded />} onClick={() => setEdit({ entry: null, employeeId: p.employee.id })}>Add</Button> : undefined}>
              {p.entries.map((e) => (
                <Box key={e.id} sx={{ py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography sx={{ flex: '1 1 200px', fontSize: 14, fontWeight: 600 }}>{KIND_WORD[e.kind]}{e.label ? ` — ${e.label}` : ''}</Typography>
                    <ToneBadge tone={e.valued?.taxable ? 'info' : 'neutral'} label={rupees(e.valued?.taxable ?? 0)} noIcon />
                    {can.payroll.edit && <Tooltip title="Change"><IconButton size="small" onClick={() => setEdit({ entry: e })}><EditOutlined fontSize="small" /></IconButton></Tooltip>}
                    {can.payroll.remove && <Tooltip title="Remove"><IconButton size="small" onClick={() => setRemove(e)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>}
                  </Box>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{e.fromDate} to {e.toDate ?? 'the end of the year'} · {e.valued?.nature} (row {e.valued?.row}){e.valued?.recovered ? ` · recovered ${rupees(e.valued.recovered)}` : ''}</Typography>
                  <Working valued={e.valued} />
                </Box>
              ))}
            </SectionCard>
          ))}
          {data.source && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>Source: {data.source.note}</Typography>}
        </Stack>
      )}
      {edit && year && (
        <PerquisiteDialog year={year} entry={edit.entry} employeeId={edit.employeeId} people={people} onClose={() => setEdit(null)}
          onSaved={(t) => { setEdit(null); toast.success(`Saved. Taxable value of the year: ${rupees(t)}.`); load(); }} />
      )}
      <ConfirmDialog open={!!remove} title="Remove this perquisite?" body={remove ? `${KIND_WORD[remove.kind]}${remove.label ? ` — ${remove.label}` : ''}. It stops counting for the year.` : ''} confirmLabel="Remove" danger
        onClose={() => setRemove(null)} onConfirm={async () => { if (!remove) return; try { await extrasApi.removePerquisite(remove.id); toast.success('Removed.'); setRemove(null); load(); } catch (e) { toast.error(errorMessage(e)); } }} />
    </Box>
  );
}

function Working({ valued }: { valued?: Valued | null }) {
  const [open, setOpen] = useState(false);
  if (!valued?.lines.length) return null;
  return (
    <Box>
      <Button size="small" onClick={() => setOpen(!open)} sx={{ px: 0, minWidth: 0 }}>{open ? 'Hide the working' : 'How it is worked out'}</Button>
      {open && valued.lines.map((l, i) => <Typography key={i} sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>{l}</Typography>)}
    </Box>
  );
}

function PerquisiteDialog({ year, entry, employeeId, people, onClose, onSaved }: {
  year: string; entry: PerqEntry | null; employeeId?: number; people: Profiles | null; onClose: () => void; onSaved: (total: number) => void;
}) {
  const [person, setPerson] = useState<string>(String(entry?.employeeId ?? employeeId ?? ''));
  const [kind, setKind] = useState<PerqKind>(entry?.kind ?? 'CAR');
  const [label, setLabel] = useState(entry?.label ?? '');
  const [from, setFrom] = useState(entry?.fromDate ?? startOf(year));
  const [to, setTo] = useState(entry?.toDate ?? '');
  const [facts, setFacts] = useState<Facts>(entry?.facts ?? DEFAULTS.CAR);
  const [preview, setPreview] = useState<{ valued: Valued; total: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const body = useCallback((): PerqInput => ({
    ...(entry ? { id: entry.id } : { employeeId: Number(person), kind }), label: label || null, fromDate: from, toDate: to || null, facts,
  }), [entry, person, kind, label, from, to, facts]);
  useEffect(() => {
    if (!entry && !person) { setPreview(null); return undefined; }
    const t = setTimeout(() => {
      extrasApi.previewPerquisite(year, body()).then((p) => { setPreview(p); setProblem(null); }).catch((e) => { setPreview(null); setProblem(errorMessage(e)); });
    }, 350);
    return () => clearTimeout(t);
  }, [year, body, entry, person]);
  const set = (k: string, v: Facts[string]) => setFacts((f) => ({ ...f, [k]: v }));

  return (
    <FormDialog open title={entry ? `${KIND_WORD[entry.kind]}${entry.label ? ` — ${entry.label}` : ''}` : 'Add a perquisite'} subtitle={`Tax year ${year}`} maxWidth="sm" onClose={onClose}
      submitDisabled={!entry && !person}
      onSubmit={async () => {
        const r = entry ? await extrasApi.updatePerquisite(entry.id, body()) : await extrasApi.addPerquisite(year, body());
        onSaved(r.total);
      }}>
      <Stack spacing={1.5} sx={{ pt: 0.5 }}>
        {!entry && (
          <>
            <TextField select size="small" label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
              {(people?.people ?? []).map((p) => <MenuItem key={p.employee.id} value={String(p.employee.id)}>{p.employee.name} ({p.employee.code})</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Kind" value={kind} onChange={(e) => { const k = e.target.value as PerqKind; setKind(k); setFacts(DEFAULTS[k]); }}>
              {(Object.keys(KIND_WORD) as PerqKind[]).map((k) => <MenuItem key={k} value={k}>{KIND_WORD[k]}</MenuItem>)}
            </TextField>
          </>
        )}
        <TextField size="small" label="Name it (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'CAR' ? 'Honda City, TS09 AB 1234' : ''} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <TextField size="small" type="date" label={['GIFT', 'CREDIT_CARD', 'CLUB'].includes(entry?.kind ?? kind) ? 'Date' : 'From'} value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
          {!['GIFT', 'CREDIT_CARD', 'CLUB'].includes(entry?.kind ?? kind) && <TextField size="small" type="date" label="To (empty: the year’s end)" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />}
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          {FIELDS[entry?.kind ?? kind].filter((fd) => !fd.show || fd.show(facts)).map((fd) => {
            const v = facts[fd.key];
            if (fd.type === 'bool') return <FormControlLabel key={fd.key} sx={{ gridColumn: '1 / -1' }} control={<Checkbox size="small" checked={Boolean(v)} onChange={(e) => set(fd.key, e.target.checked)} />} label={<Typography sx={{ fontSize: 13.5 }}>{fd.label}</Typography>} />;
            if (fd.type === 'select') {
              return (
                <TextField key={fd.key} select size="small" label={fd.label} value={String(v ?? '')} onChange={(e) => set(fd.key, e.target.value)}>
                  {fd.options!.map(([val, words]) => <MenuItem key={val} value={val}>{words}</MenuItem>)}
                </TextField>
              );
            }
            return <TextField key={fd.key} size="small" label={fd.label} helperText={fd.help} value={v == null ? '' : String(v)} onChange={(e) => set(fd.key, fd.type === 'amount' ? e.target.value.replace(/[₹,\s]/g, '') : e.target.value)} inputProps={fd.type === 'amount' ? { inputMode: 'decimal' } : undefined} />;
          })}
        </Box>
        {problem && <Callout tone="warning" title="Not yet">{problem}</Callout>}
        {preview && (
          <Callout tone="info" title={`Taxable value: ${rupees(preview.valued.taxable)} for the year`}>
            {preview.valued.lines.slice(0, 6).map((l, i) => <Typography key={i} sx={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{l}</Typography>)}
            {preview.valued.lines.length > 6 && <Typography sx={{ fontSize: 12.5 }}>… and {preview.valued.lines.length - 6} more lines.</Typography>}
            <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>The person’s perquisites of the year together: {rupees(preview.total)}.</Typography>
          </Callout>
        )}
      </Stack>
    </FormDialog>
  );
}
