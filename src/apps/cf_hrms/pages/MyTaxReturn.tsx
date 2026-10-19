/**
 * My tax › File my return (CF_HRMS_HIRING_SPEC.md §25.6 — P4, the ITR helper, option A).
 *
 * Five steps for the person's OWN income-tax return of a year:
 *   1. Which form (ITR-1 or ITR-2, each condition with its answer; the person may pick)
 *   2. From your employer (released payslips, read-only — or the Form 16 / 130 figures typed)
 *   3. Other income and deductions (interest, dividends, house property, capital gains,
 *      deductions, taxes paid with challans, other TDS / TCS)
 *   4. Both regimes on the same figures, tax payable or refund, the interest estimate
 *   5. Your return: the PDF summary, the JSON (ITR-1 of a year whose official schema is in the
 *      app), the "where to type each number" guide, the refund account, finalise.
 *
 * Self-contained on purpose: P2 builds the rest of "My tax" around it later. It reads and
 * writes /user/me/itr/* only — no employee id anywhere; nobody but the person can open it.
 * NOTHING IS FILED: the page says so on every step.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Checkbox, Chip, FormControlLabel, IconButton, MenuItem, Radio, RadioGroup,
  Step, StepButton, Stepper, TextField, Typography, useMediaQuery,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CancelRounded from '@mui/icons-material/CancelRounded';
import {
  Callout, ConfirmDialog, DetailSkeleton, ErrorNotice, PageHeader, SectionCard, errorMessage, useToast,
} from '@shared/ui';
import {
  STATE_CODES, inr, itrApi,
  type Challan, type DeductionsPart, type EmployerPart, type HouseProperty, type IncomePart, type ItrParts, type ItrReturn, type ItrYear,
  type FormCode, type OtherTds, type PersonalPart, type Regime, type ScheduleRow, type TaxesPart,
  type DonationCategory, type Loan80E, type Policy80D,
} from '../api/itr';
import { saveBase64File } from '../api/excel';

const STEPS = ['Which form', 'From your employer', 'Other income and deductions', 'Both regimes', 'Your return'];
const OTHER_EXEMPT = [['10(10)', 'Gratuity'], ['10(10AA)', 'Leave encashment'], ['10(10A)', 'Commuted pension'], ['10(10C)', 'Voluntary retirement']];

/* ── small fields ──────────────────────────────────────────────────────── */
type Num = number | null | undefined;
const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s.replace(/[,\s₹]/g, '')));
function Money({ label, value, onChange, help, disabled }: { label: string; value: Num; onChange: (v: number | null) => void; help?: ReactNode; disabled?: boolean }) {
  return (
    <TextField
      size="small" fullWidth label={label} disabled={disabled}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(toNum(e.target.value))}
      inputProps={{ inputMode: 'decimal' }}
      helperText={help}
    />
  );
}
function Text({ label, value, onChange, help, type = 'text' }: { label: string; value: string | null | undefined; onChange: (v: string) => void; help?: ReactNode; type?: string }) {
  return <TextField size="small" fullWidth label={label} type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} helperText={help} InputLabelProps={type === 'date' ? { shrink: true } : undefined} />;
}
const Grid = ({ children, min = 220 }: { children: ReactNode; min?: number }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: 1.5 }}>{children}</Box>
);
const SourceChip = ({ source }: { source: 'EMPLOYER' | 'TYPED' }) => (
  <Chip size="small" variant="outlined" color={source === 'EMPLOYER' ? 'success' : 'default'} label={source === 'EMPLOYER' ? 'from your employer' : 'typed by you'} sx={{ height: 20, fontSize: 11 }} />
);
function Rows({ rows }: { rows: { label: ReactNode; amount: number | null; strong?: boolean; extra?: ReactNode }[] }) {
  return (
    <Box>
      {rows.map((r, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'baseline', py: 0.5, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
          <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: r.strong ? 600 : 400, minWidth: 0, overflowWrap: 'anywhere' }}>{r.label}</Typography>
          {r.extra}
          <Typography sx={{ fontSize: 13.5, fontWeight: r.strong ? 600 : 400, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.amount == null ? '' : inr(r.amount)}</Typography>
        </Box>
      ))}
    </Box>
  );
}
/** A list of details behind a claim (the ITR's schedules), folded away until used. */
function Detail({ title, help, total, children }: { title: string; help: ReactNode; total?: number | null; children: ReactNode }) {
  return (
    <Accordion disableGutters elevation={0} sx={{ border: '1px solid var(--c-divider)', mt: 1.5 }}>
      <AccordionSummary expandIcon={<ExpandMoreRounded />}>
        <Typography sx={{ fontSize: 14, flex: 1 }}>{title}</Typography>
        {total != null && <Typography sx={{ fontSize: 13.5, fontVariantNumeric: 'tabular-nums', mr: 1 }}>{inr(total)}</Typography>}
      </AccordionSummary>
      <AccordionDetails sx={{ display: 'grid', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{help}</Typography>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <Box sx={{ border: '1px solid var(--c-divider)', borderRadius: 1, p: 1.5 }}>
      <Grid min={180}>{children}</Grid>
      <Button size="small" color="inherit" sx={{ mt: 1 }} onClick={onRemove}>Remove</Button>
    </Box>
  );
}
const upd = <T,>(list: T[], i: number, v: Partial<T>): T[] => list.map((x, j) => (j === i ? { ...x, ...v } : x));
const sumOf = <T,>(list: T[], f: (x: T) => number | null | undefined) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const DONATION_KINDS: [DonationCategory, string][] = [
  ['NO_LIMIT_100', '100%, no qualifying limit (PM relief funds …)'], ['NO_LIMIT_50', '50%, no qualifying limit'],
  ['LIMIT_100', '100%, subject to the qualifying limit'], ['LIMIT_50', '50%, subject to the qualifying limit (most trusts)'],
];
const scheduleRows = (list: ScheduleRow[]) => list.map((x) => ({ label: x.label, amount: x.amount, strong: /^(Gross total|Total income|Tax on total|Tax payable|Refund)/.test(x.label) }));

/* ── the page ──────────────────────────────────────────────────────────── */
export default function MyTaxReturn() {
  const toast = useToast();
  const narrow = useMediaQuery('(max-width:700px)');
  const [years, setYears] = useState<ItrYear[] | null>(null);
  const [year, setYear] = useState<string>('');
  const [data, setData] = useState<ItrReturn | null>(null);
  const [draft, setDraft] = useState<ItrParts>({});
  const [bankAccount, setBankAccount] = useState('');
  const [step, setStep] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const take = useCallback((r: ItrReturn) => {
    setData(r);
    const { bank, ...rest } = r.draft;
    setDraft({ ...rest, bank: { bankName: bank.bankName, ifsc: bank.ifsc, type: bank.type } });
    setBankAccount('');
  }, []);

  useEffect(() => {
    itrApi.years().then((r) => {
      setYears(r.years);
      // The year most people file now: the latest whose return can be filed already, else the newest.
      const fileable = r.years.find((y) => r.today >= y.filedFrom);
      setYear((fileable ?? r.years[0])?.year ?? '');
    }).catch(setError);
  }, []);
  useEffect(() => {
    if (!year) return;
    setData(null);
    setError(null);
    setProblems([]);
    itrApi.get(year).then(take).catch(setError);
  }, [year, take]);

  const save = async (parts: ItrParts, next?: number) => {
    setSaving(true);
    setProblems([]);
    try {
      take(await itrApi.save(year, parts));
      if (next != null) setStep(next);
      toast.success('Saved.');
    } catch (e) {
      const p = (e as { problems?: string[] }).problems ?? [];
      setProblems(p.length ? p : [errorMessage(e)]);
    } finally { setSaving(false); }
  };
  const set = <K extends keyof ItrParts>(k: K, v: ItrParts[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const personal = draft.personal ?? {};
  const employer = draft.employer ?? {};
  const income = draft.income ?? {};
  const deductions = draft.deductions ?? {};
  const taxes = draft.taxes ?? {};
  const choices = draft.choices ?? {};
  const setP = (v: Partial<PersonalPart>) => set('personal', { ...personal, ...v });
  const setE = (v: Partial<EmployerPart>) => set('employer', { ...employer, ...v });
  const setI = (v: Partial<IncomePart>) => set('income', { ...income, ...v });
  const setD = (v: Partial<DeductionsPart>) => set('deductions', { ...deductions, ...v });
  const setT = (v: Partial<TaxesPart>) => set('taxes', { ...taxes, ...v });
  const d80 = deductions['80D'] ?? {};
  const setD80 = (v: Partial<NonNullable<DeductionsPart['80D']>>) => setD({ '80D': { ...d80, ...v } });
  const c80 = deductions['80CItems'] ?? [];
  const pol = d80.policies ?? [];
  const polSelf = pol.filter((x) => x.for !== 'PARENTS');
  const polParents = pol.filter((x) => x.for === 'PARENTS');
  const loans = deductions['80ELoans'] ?? [];
  const gifts = deductions['80GDonations'] ?? [];
  const hra = deductions.hra ?? {};

  // A new step or a new list of problems: back to the top of the page, where they show.
  useEffect(() => {
    document.querySelector('[data-page="my-tax-return"]')?.scrollIntoView({ block: 'start' });
  }, [step, problems]);
  const yearInfo = useMemo(() => years?.find((y) => y.year === year) ?? null, [years, year]);
  const download = async (kind: 'pdf' | 'json') => {
    try {
      const f = kind === 'pdf' ? await itrApi.summaryPdf(year) : await itrApi.returnJson(year);
      saveBase64File(f);
    } catch (e) {
      const p = (e as { problems?: string[] }).problems ?? [];
      setProblems(p.length ? p : [errorMessage(e)]);
    }
  };

  if (error && !data) return <Box sx={{ p: 2 }}><ErrorNotice error={error} /></Box>;
  if (!years || (year && !data)) return <Box sx={{ p: 2 }}><DetailSkeleton /></Box>;
  if (!years.length || !data) return <Box sx={{ p: 2 }}><Callout title="No tax year is set up yet">Ask HR to load the tax rules.</Callout></Box>;

  const r = data.result;
  const c = r.computation;
  const cert = r.forms.certificate.label;
  const readOnlyEmployer = r.salary.fromPayroll;
  const saveBar = (parts: ItrParts, next: number, label = 'Save and continue') => (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', mt: 2 }}>
      {step > 0 && <Button color="inherit" onClick={() => setStep(step - 1)}>Back</Button>}
      <Button variant="contained" disabled={saving} onClick={() => save(parts, next)} data-action={`itr-save-${step + 1}`}>{label}</Button>
    </Box>
  );

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 1100, mx: 'auto', display: 'grid', gap: 2 }} data-page="my-tax-return">
      <PageHeader
        title="File my return"
        subtitle={`Your income-tax return for ${r.year} (assessment year ${r.assessmentYear}, ${r.act}). Due ${yearInfo?.dueDate ?? r.interest.dueDate}.`}
        actions={(
          <TextField select size="small" label="Tax year" value={year} onChange={(e) => { setYear(e.target.value); setStep(0); }} sx={{ minWidth: 150 }} data-field="itr-year">
            {years.map((y) => <MenuItem key={y.year} value={y.year}>{y.year}{y.draft ? ` · ${y.draft.status === 'FINALISED' ? 'finalised' : 'draft'}` : ''}</MenuItem>)}
          </TextField>
        )}
      />
      <Callout tone="warning" title="This app does not file your return.">
        Upload or type this on incometax.gov.in, then e-verify within the time allowed. Nothing you enter here is sent anywhere, and only you can see it — not HR, not the company. The figures are worked out by the rules kept in the app and are not reviewed by a chartered accountant.
      </Callout>
      {!r.form.published && <Callout tone="info" title={`The forms for ${r.year} are not published yet`}>{r.form.formsNote}</Callout>}
      {data.employer.provisional && <Callout title="Provisional">{data.employer.note}</Callout>}

      <Stepper nonLinear activeStep={step} alternativeLabel={!narrow} orientation="horizontal" sx={{ overflowX: 'auto', overflowY: 'hidden', py: 1, '& .MuiStepConnector-root': { minWidth: 8 } }}>
        {STEPS.map((label, i) => (
          <Step key={label} completed={false}>
            <StepButton onClick={() => setStep(i)} data-step={i + 1}>{narrow ? (i === step ? label : '') : label}</StepButton>
          </Step>
        ))}
      </Stepper>
      {narrow && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: -1.5 }}>Step {step + 1} of 5 — {STEPS[step]}</Typography>}

      {problems.length > 0 && (
        <Callout tone="danger" title="Please check">
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>{problems.map((p) => <li key={p}>{p}</li>)}</Box>
        </Callout>
      )}

      {/* ── 1. Which form ─────────────────────────────────────────────── */}
      {step === 0 && (
        <SectionCard title="1. Which form" subtitle={r.form.reason}>
          <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
            <Box>
              {r.form.checks.map((x) => (
                <Box key={x.key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.4 }}>
                  {x.ok ? <CheckCircleRounded sx={{ fontSize: 18, color: 'var(--c-success-600)' }} /> : <CancelRounded sx={{ fontSize: 18, color: 'var(--c-danger-600)' }} />}
                  <Typography sx={{ fontSize: 13.5 }}>{x.text}</Typography>
                </Box>
              ))}
            </Box>
            <Grid>
              <TextField select size="small" label="Residential status" value={personal.residentialStatus ?? 'RESIDENT'} onChange={(e) => setP({ residentialStatus: e.target.value as PersonalPart['residentialStatus'] })}>
                <MenuItem value="RESIDENT">Resident (ordinarily resident)</MenuItem>
                <MenuItem value="RNOR">Resident but not ordinarily resident</MenuItem>
                <MenuItem value="NON_RESIDENT">Non-resident</MenuItem>
              </TextField>
              <Text label="Date of birth" type="date" value={personal.dateOfBirth} onChange={(v) => setP({ dateOfBirth: v || null })} help="Decides the senior-citizen slabs (old regime)." />
              <Money label="Agricultural income" value={personal.agriculturalIncome} onChange={(v) => setP({ agriculturalIncome: v })} />
            </Grid>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
              {([['isDirector', 'I was a director of a company'], ['unlistedShares', 'I held unlisted equity shares'], ['foreignAssetsOrIncome', 'I have foreign assets or income'], ['broughtForwardLosses', 'I have losses from earlier years']] as const).map(([k, label]) => (
                <FormControlLabel key={k} control={<Checkbox size="small" checked={Boolean(personal[k])} onChange={(e) => setP({ [k]: e.target.checked })} />} label={<Typography sx={{ fontSize: 13.5 }}>{label}</Typography>} />
              ))}
            </Box>
            <RadioGroup row value={choices.form ?? ''} onChange={(e) => set('choices', { ...choices, form: (e.target.value || null) as FormCode | null })}>
              <FormControlLabel value="" control={<Radio size="small" />} label={`Use the suggestion (${r.form.suggested === 'ITR1' ? 'ITR-1' : 'ITR-2'})`} />
              <FormControlLabel value="ITR1" control={<Radio size="small" />} label="ITR-1 (Sahaj)" />
              <FormControlLabel value="ITR2" control={<Radio size="small" />} label="ITR-2" />
            </RadioGroup>
            {r.form.note && <Callout tone="warning" title="ITR-1 cannot be used">{r.form.note}</Callout>}
            {saveBar({ personal, choices }, 1)}
          </Box>
        </SectionCard>
      )}

      {/* ── 2. From your employer ─────────────────────────────────────── */}
      {step === 1 && (
        <SectionCard title="2. From your employer" subtitle={readOnlyEmployer ? `From your released payslips (${data.employer.note})` : data.employer.note}>
          <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
            <Rows rows={[
              { label: `Gross salary — ${r.salary.employerName ?? 'your employer'}`, amount: r.salary.grossSalary.value, extra: <SourceChip source={r.salary.grossSalary.source} /> },
              { label: 'Professional tax', amount: r.salary.professionalTax.value, extra: <SourceChip source={r.salary.professionalTax.source} /> },
              { label: 'TDS on salary', amount: r.salary.tds.value, extra: <SourceChip source={r.salary.tds.source} /> },
              ...(data.employer.months ? [{ label: 'PF (your share) — counts under 80C in the old regime', amount: data.employer.pfEmployee }, { label: 'HRA received — its exemption needs your rent (type it below)', amount: data.employer.hraReceived }] : []),
            ]} />
            {readOnlyEmployer && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
                <FormControlLabel control={<Checkbox size="small" checked={Boolean(employer.matchesCertificate)} onChange={(e) => setE({ matchesCertificate: e.target.checked })} />} label={<Typography sx={{ fontSize: 13.5 }}>This matches my {cert}</Typography>} />
                <FormControlLabel control={<Checkbox size="small" checked={Boolean(employer.useTyped)} onChange={(e) => setE({ useTyped: e.target.checked })} />} label={<Typography sx={{ fontSize: 13.5 }}>It does not — I will type the figures from my {cert}</Typography>} />
              </Box>
            )}
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              {readOnlyEmployer && !employer.useTyped ? `Add what your ${cert} shows that payroll does not: the TAN, the exempt allowances (HRA, leave travel) and the employer's NPS.` : `Type these from your ${cert} (Part B).`}
            </Typography>
            <Grid>
              <Text label="Employer's name" value={employer.employerName ?? r.salary.employerName} onChange={(v) => setE({ employerName: v })} />
              <Text label="Employer's TAN" value={employer.tan} onChange={(v) => setE({ tan: v.toUpperCase() })} help="e.g. HYDK12345A" />
              {(!readOnlyEmployer || employer.useTyped) && <Money label="Gross salary (section 17(1))" value={employer.grossSalary} onChange={(v) => setE({ grossSalary: v })} />}
              <Money label="Perquisites (section 17(2))" value={employer.perquisites} onChange={(v) => setE({ perquisites: v })} />
              <Money label="HRA exempt" value={employer.exemptHra} onChange={(v) => setE({ exemptHra: v })} help="Old regime only." />
              <Money label="Leave travel exempt" value={employer.exemptLta} onChange={(v) => setE({ exemptLta: v })} help="Old regime only." />
              <Money label="Other exempt allowance" value={employer.exemptOther} onChange={(v) => setE({ exemptOther: v })} />
              <TextField select size="small" label="Which" value={employer.exemptOtherSection ?? '10(10)'} onChange={(e) => setE({ exemptOtherSection: e.target.value })}>
                {OTHER_EXEMPT.map(([k, l]) => <MenuItem key={k} value={k}>{l} ({k})</MenuItem>)}
              </TextField>
              {(!readOnlyEmployer || employer.useTyped) && <Money label="Professional tax" value={employer.professionalTax} onChange={(v) => setE({ professionalTax: v })} />}
              {(!readOnlyEmployer || employer.useTyped) && <Money label="TDS on salary" value={employer.tds} onChange={(v) => setE({ tds: v })} />}
              <Money label="Employer's NPS contribution (80CCD(2))" value={employer.employerNps} onChange={(v) => setE({ employerNps: v })} />
              <Money
                label="Basic for the year" value={employer.basic} onChange={(v) => setE({ basic: v })}
                help={data.employer.basic ? `Empty = from your payslips: ${inr(data.employer.basic)}` : 'Needed for the employer\'s NPS limit and the HRA working.'}
              />
              <Money
                label="Dearness allowance (DA) for the year" value={employer.da} onChange={(v) => setE({ da: v })}
                help={data.employer.da ? `Empty = from your payslips: ${inr(data.employer.da)}` : 'Leave empty if you get none.'}
              />
            </Grid>
            {Boolean(employer.employerNps) && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                The employer&apos;s NPS counts up to 14% (new regime) or 10% (old regime; 14% for a government employer) of Basic + DA — now {inr(r.salary.basicDa.value)} ({r.salary.basicDa.source === 'EMPLOYER' ? 'from your payslips' : 'typed by you'}), not of the gross salary.
              </Typography>
            )}
            <Accordion disableGutters elevation={0} sx={{ border: '1px solid var(--c-divider)' }} defaultExpanded={Boolean(employer.previous)}>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography sx={{ fontSize: 14 }}>A previous employer this year</Typography></AccordionSummary>
              <AccordionDetails>
                <Grid>
                  <Text label="Name" value={employer.previous?.name} onChange={(v) => setE({ previous: { ...employer.previous, name: v } })} />
                  <Text label="TAN" value={employer.previous?.tan} onChange={(v) => setE({ previous: { ...employer.previous, tan: v.toUpperCase() } })} />
                  <Money label="Salary (after its exemptions)" value={employer.previous?.salary} onChange={(v) => setE({ previous: { ...employer.previous, salary: v } })} />
                  <Money label="Professional tax" value={employer.previous?.professionalTax} onChange={(v) => setE({ previous: { ...employer.previous, professionalTax: v } })} />
                  <Money label="TDS" value={employer.previous?.tds} onChange={(v) => setE({ previous: { ...employer.previous, tds: v } })} />
                </Grid>
              </AccordionDetails>
            </Accordion>
            {saveBar({ employer: { ...employer, previous: employer.previous && Object.values(employer.previous).some((x) => x != null && x !== '') ? employer.previous : null } }, 2)}
          </Box>
        </SectionCard>
      )}

      {/* ── 3. Other income and deductions ────────────────────────────── */}
      {step === 2 && (
        <SectionCard title="3. Add your other income and deductions" subtitle={`What your employer does not know. Check it against your ${r.forms.annualStatement.label}.`}>
          <Box sx={{ p: 2, display: 'grid', gap: 2.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>Interest, dividends, other income</Typography>
              <Grid>
                <Money label="Savings-account interest" value={income.savingsInterest} onChange={(v) => setI({ savingsInterest: v })} />
                <Money label="FD / deposit interest" value={income.depositInterest} onChange={(v) => setI({ depositInterest: v })} />
                <Money label="Dividends" value={income.dividends} onChange={(v) => setI({ dividends: v })} />
              </Grid>
              {(income.other ?? []).map((o, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'center' }}>
                  <Text label="Other income — what" value={o.description} onChange={(v) => setI({ other: (income.other ?? []).map((x, j) => (j === i ? { ...x, description: v } : x)) })} />
                  <Money label="Amount" value={o.amount} onChange={(v) => setI({ other: (income.other ?? []).map((x, j) => (j === i ? { ...x, amount: v } : x)) })} />
                  <IconButton aria-label="Remove" onClick={() => setI({ other: (income.other ?? []).filter((_, j) => j !== i) })}><DeleteOutlineRounded /></IconButton>
                </Box>
              ))}
              <Button size="small" sx={{ mt: 1 }} onClick={() => setI({ other: [...(income.other ?? []), { description: '', amount: null }] })}>Add other income</Button>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>House property</Typography>
              {(income.houseProperties ?? []).map((h, i) => {
                const upd = (v: Partial<HouseProperty>) => setI({ houseProperties: (income.houseProperties ?? []).map((x, j) => (j === i ? { ...x, ...v } : x)) });
                return (
                  <Box key={i} sx={{ border: '1px solid var(--c-divider)', borderRadius: 1, p: 1.5, mb: 1.5 }} data-house={i + 1}>
                    <Grid>
                      <TextField select size="small" label="This house is" value={h.kind} onChange={(e) => upd({ kind: e.target.value as HouseProperty['kind'] })}>
                        <MenuItem value="LET_OUT">Let out</MenuItem>
                        <MenuItem value="SELF_OCCUPIED">Lived in by me (self-occupied)</MenuItem>
                      </TextField>
                      <Text label="Address or name" value={h.name} onChange={(v) => upd({ name: v })} />
                      {h.kind === 'LET_OUT' && <Money label="Rent received in the year" value={h.rentReceived} onChange={(v) => upd({ rentReceived: v })} />}
                      {h.kind === 'LET_OUT' && <Money label="Municipal tax paid" value={h.municipalTaxPaid} onChange={(v) => upd({ municipalTaxPaid: v })} />}
                      <Money label="Home-loan interest for the year" value={h.interest} onChange={(v) => upd({ interest: v })} />
                    </Grid>
                    <Button size="small" color="inherit" sx={{ mt: 1 }} onClick={() => setI({ houseProperties: (income.houseProperties ?? []).filter((_, j) => j !== i) })}>Remove this house</Button>
                  </Box>
                );
              })}
              <Button size="small" onClick={() => setI({ houseProperties: [...(income.houseProperties ?? []), { kind: 'LET_OUT' }] })} data-action="itr-add-house">Add a house</Button>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.5 }}>Capital gains (net gain of each kind for the year; 0 if a loss)</Typography>
              <Grid>
                <Money label="Long-term gains, listed shares / equity funds (112A)" value={income.capitalGains?.ltcg112A} onChange={(v) => setI({ capitalGains: { ...income.capitalGains, ltcg112A: v } })} help="₹1,25,000 of these is not taxed." />
                <Money label="…their total sale value" value={income.capitalGains?.ltcg112ASale} onChange={(v) => setI({ capitalGains: { ...income.capitalGains, ltcg112ASale: v } })} />
                <Money label="…their total cost" value={income.capitalGains?.ltcg112ACost} onChange={(v) => setI({ capitalGains: { ...income.capitalGains, ltcg112ACost: v } })} />
                <Money label="Short-term gains, listed shares / equity funds (111A)" value={income.capitalGains?.stcg111A} onChange={(v) => setI({ capitalGains: { ...income.capitalGains, stcg111A: v } })} help="Taxed at 20%; needs ITR-2." />
                <Money label="Other long-term gains (112)" value={income.capitalGains?.ltcg112} onChange={(v) => setI({ capitalGains: { ...income.capitalGains, ltcg112: v } })} help="Taxed at 12.5%; needs ITR-2." />
                <Money label="Other short-term gains" value={income.capitalGains?.stcgOther} onChange={(v) => setI({ capitalGains: { ...income.capitalGains, stcgOther: v } })} help="At your slab rates; needs ITR-2." />
              </Grid>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 0.5 }}>Deductions for the whole year (include what you gave your employer)</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1 }}>They count only in the old regime (the new regime allows only the employer&apos;s NPS). Savings interest (80TTA / 80TTB) is worked out from the interest above.</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1 }}>
                If you file in the old regime, the return needs the details behind each claim (its schedules 80C, 80D, 80E, 80G and 10(13A)) — the portal does not accept it without them. Add them below; a list, once added, is your claim.
              </Typography>
              <Grid>
                {!c80.length && <Money label="80C — PF, PPF, ELSS, LIC, tuition …" value={deductions['80C']} onChange={(v) => setD({ '80C': v })} help={data.employer.pfEmployee ? `Your PF from payslips: ${inr(data.employer.pfEmployee)}` : 'At most ₹1,50,000.'} />}
                <Money label="80CCD(1B) — your own NPS" value={deductions['80CCD1B']} onChange={(v) => setD({ '80CCD1B': v })} />
                {!polSelf.length && <Money label="80D — health insurance, self and family" value={d80.selfFamily} onChange={(v) => setD80({ selfFamily: v })} />}
                {!polParents.length && <Money label="80D — health insurance, parents" value={d80.parents} onChange={(v) => setD80({ parents: v })} />}
                <Money label="80D — preventive check-up" value={d80.preventive} onChange={(v) => setD80({ preventive: v })} />
                {!loans.length && <Money label="80E — education-loan interest" value={deductions['80E']} onChange={(v) => setD({ '80E': v })} />}
                {!gifts.length && <Money label="80G — donations (the qualifying amount)" value={deductions['80G']} onChange={(v) => setD({ '80G': v })} />}
              </Grid>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
                <FormControlLabel control={<Checkbox size="small" checked={Boolean(d80.selfFamilySenior)} onChange={(e) => setD80({ selfFamilySenior: e.target.checked || null })} />} label={<Typography sx={{ fontSize: 13.5 }}>I or someone in my family (not parents) is a senior citizen</Typography>} />
                <FormControlLabel control={<Checkbox size="small" checked={Boolean(d80.parentsSenior)} onChange={(e) => setD80({ parentsSenior: e.target.checked })} />} label={<Typography sx={{ fontSize: 13.5 }}>A parent is a senior citizen</Typography>} />
              </Box>

              <Detail title="80C payments, one by one" total={c80.length ? sumOf(c80, (x) => x.amount) : null} help="What it is, the policy / document number (PPF account, LIC policy, ELSS folio, PF / UAN …) and the amount.">
                {c80.map((x, i) => (
                  <Row key={i} onRemove={() => setD({ '80CItems': c80.filter((_, j) => j !== i) })}>
                    <Text label="What" value={x.description} onChange={(v) => setD({ '80CItems': upd(c80, i, { description: v }) })} />
                    <Text label="Policy / document number" value={x.documentNo} onChange={(v) => setD({ '80CItems': upd(c80, i, { documentNo: v }) })} />
                    <Money label="Amount" value={x.amount} onChange={(v) => setD({ '80CItems': upd(c80, i, { amount: v }) })} />
                  </Row>
                ))}
                <Button size="small" onClick={() => setD({ '80CItems': [...c80, { description: '', documentNo: '', amount: null }] })} data-action="itr-add-80c">Add an 80C payment</Button>
              </Detail>

              <Detail title="80D health-insurance policies" total={pol.length ? sumOf(pol, (x) => x.amount) : null} help="The insurer, the policy number and the premium you paid in the year, for yourself and family or for your parents.">
                {pol.map((x, i) => (
                  <Row key={i} onRemove={() => setD80({ policies: pol.filter((_, j) => j !== i) })}>
                    <TextField select size="small" label="For" value={x.for} onChange={(e) => setD80({ policies: upd(pol, i, { for: e.target.value as Policy80D['for'] }) })}>
                      <MenuItem value="SELF_FAMILY">Me and my family</MenuItem>
                      <MenuItem value="PARENTS">My parents</MenuItem>
                    </TextField>
                    <Text label="Insurer" value={x.insurer} onChange={(v) => setD80({ policies: upd(pol, i, { insurer: v }) })} />
                    <Text label="Policy number" value={x.policyNo} onChange={(v) => setD80({ policies: upd(pol, i, { policyNo: v }) })} />
                    <Money label="Premium paid" value={x.amount} onChange={(v) => setD80({ policies: upd(pol, i, { amount: v }) })} />
                  </Row>
                ))}
                <Button size="small" onClick={() => setD80({ policies: [...pol, { for: 'SELF_FAMILY' }] })} data-action="itr-add-80d">Add a policy</Button>
              </Detail>

              <Detail title="80E education loans" total={loans.length ? sumOf(loans, (x) => x.interest) : null} help="The bank or approved institution, the loan account, when it was taken, and the interest paid in the year.">
                {loans.map((x, i) => (
                  <Row key={i} onRemove={() => setD({ '80ELoans': loans.filter((_, j) => j !== i) })}>
                    <TextField select size="small" label="From" value={x.lenderType} onChange={(e) => setD({ '80ELoans': upd(loans, i, { lenderType: e.target.value as Loan80E['lenderType'] }) })}>
                      <MenuItem value="B">A bank</MenuItem>
                      <MenuItem value="I">An approved institution</MenuItem>
                    </TextField>
                    <Text label="Bank or institution" value={x.lender} onChange={(v) => setD({ '80ELoans': upd(loans, i, { lender: v }) })} />
                    <Text label="Loan account number" value={x.loanAccount} onChange={(v) => setD({ '80ELoans': upd(loans, i, { loanAccount: v }) })} />
                    <Text label="Date of the loan" type="date" value={x.loanDate} onChange={(v) => setD({ '80ELoans': upd(loans, i, { loanDate: v || null }) })} />
                    <Money label="Loan amount" value={x.loanAmount} onChange={(v) => setD({ '80ELoans': upd(loans, i, { loanAmount: v }) })} />
                    <Money label="Outstanding at the year end" value={x.outstanding} onChange={(v) => setD({ '80ELoans': upd(loans, i, { outstanding: v }) })} />
                    <Money label="Interest paid in the year" value={x.interest} onChange={(v) => setD({ '80ELoans': upd(loans, i, { interest: v }) })} />
                  </Row>
                ))}
                <Button size="small" onClick={() => setD({ '80ELoans': [...loans, { lenderType: 'B' }] })} data-action="itr-add-80e">Add an education loan</Button>
              </Detail>

              <Detail title="80G donations" help="The donee's name, PAN and address, and the kind of donation (on the receipt). Cash above ₹2,000 to one donee does not count; for a payment by UPI, cheque or transfer give the IFSC and the reference.">
                {gifts.map((x, i) => (
                  <Row key={i} onRemove={() => setD({ '80GDonations': gifts.filter((_, j) => j !== i) })}>
                    <Text label="Donee's name" value={x.name} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { name: v }) })} />
                    <Text label="Donee's PAN" value={x.pan} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { pan: v.toUpperCase() }) })} />
                    <Text label="Address" value={x.address} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { address: v }) })} />
                    <Text label="City" value={x.city} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { city: v }) })} />
                    <TextField select size="small" label="State" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={x.stateCode ?? ''} onChange={(e) => setD({ '80GDonations': upd(gifts, i, { stateCode: e.target.value }) })}>
                      <MenuItem value="" disabled>Pick the state</MenuItem>
                      {STATE_CODES.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
                    </TextField>
                    <Text label="PIN code" value={x.pinCode} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { pinCode: v }) })} />
                    <TextField select size="small" label="Kind" value={x.category} onChange={(e) => setD({ '80GDonations': upd(gifts, i, { category: e.target.value as DonationCategory }) })}>
                      {DONATION_KINDS.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
                    </TextField>
                    <Money label="In cash" value={x.cash} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { cash: v }) })} />
                    <Money label="By UPI / cheque / transfer" value={x.otherMode} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { otherMode: v }) })} />
                    {Boolean(x.otherMode) && <Text label="IFSC of your bank" value={x.ifsc} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { ifsc: v.toUpperCase() }) })} />}
                    {Boolean(x.otherMode) && <Text label="Transaction reference" value={x.transactionRef} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { transactionRef: v }) })} />}
                    {x.category.startsWith('LIMIT') && <Money label="Eligible amount (after the 10% limit)" value={x.eligible} onChange={(v) => setD({ '80GDonations': upd(gifts, i, { eligible: v }) })} help="Empty = the share of the donation; the 10%-of-income limit is not worked out here." />}
                  </Row>
                ))}
                <Button size="small" onClick={() => setD({ '80GDonations': [...gifts, { category: 'LIMIT_50' }] })} data-action="itr-add-80g">Add a donation</Button>
              </Detail>

              <Detail title="Rent you paid (HRA exemption, old regime)" help="The return works the HRA exemption out from your rent (its Schedule 10(13A)), on your Basic + DA from step 2.">
                <Grid>
                  <Text label="City where you work" value={hra.placeOfWork} onChange={(v) => setD({ hra: { ...hra, placeOfWork: v } })} help="The city decides whether 50% or 40% of Basic + DA counts (the rules of the year)." />
                  <Money label="Rent paid in the year" value={hra.rentPaid} onChange={(v) => setD({ hra: { ...hra, rentPaid: v } })} />
                  <Money label="HRA received in the year" value={hra.received} onChange={(v) => setD({ hra: { ...hra, received: v } })} help={data.employer.hraReceived ? `Empty = from your payslips: ${inr(data.employer.hraReceived)}` : undefined} />
                </Grid>
              </Detail>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>Tax you paid yourself (challans)</Typography>
              {(taxes.paid ?? []).map((t, i) => {
                const upd = (v: Partial<Challan>) => setT({ paid: (taxes.paid ?? []).map((x, j) => (j === i ? { ...x, ...v } : x)) });
                return (
                  <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1.3fr 1fr 1fr 0.8fr 1fr auto' }, gap: 1, mb: 1, alignItems: 'start' }}>
                    <TextField select size="small" label="Kind" value={t.kind} onChange={(e) => upd({ kind: e.target.value as Challan['kind'] })}>
                      <MenuItem value="ADVANCE">Advance tax</MenuItem>
                      <MenuItem value="SELF_ASSESSMENT">Self-assessment tax</MenuItem>
                    </TextField>
                    <Text label="Date paid" type="date" value={t.date} onChange={(v) => upd({ date: v || null })} />
                    <Text label="BSR code" value={t.bsrCode} onChange={(v) => upd({ bsrCode: v })} />
                    <Text label="Challan no." value={t.challanNo} onChange={(v) => upd({ challanNo: v })} />
                    <Money label="Amount" value={t.amount} onChange={(v) => upd({ amount: v })} />
                    <IconButton aria-label="Remove" onClick={() => setT({ paid: (taxes.paid ?? []).filter((_, j) => j !== i) })}><DeleteOutlineRounded /></IconButton>
                  </Box>
                );
              })}
              <Button size="small" onClick={() => setT({ paid: [...(taxes.paid ?? []), { kind: 'SELF_ASSESSMENT' }] })}>Add a challan</Button>
            </Box>

            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>Other TDS / TCS (as in your {r.forms.annualStatement.label})</Typography>
              {(taxes.otherTds ?? []).map((t, i) => {
                const upd = (v: Partial<OtherTds>) => setT({ otherTds: (taxes.otherTds ?? []).map((x, j) => (j === i ? { ...x, ...v } : x)) });
                return (
                  <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '0.7fr 1.4fr 1fr 0.8fr 1fr 1fr auto' }, gap: 1, mb: 1, alignItems: 'start' }}>
                    <TextField select size="small" label="Kind" value={t.kind} onChange={(e) => upd({ kind: e.target.value as OtherTds['kind'] })}>
                      <MenuItem value="TDS">TDS</MenuItem>
                      <MenuItem value="TCS">TCS</MenuItem>
                    </TextField>
                    <Text label="Deducted by" value={t.deductor} onChange={(v) => upd({ deductor: v })} />
                    <Text label="TAN" value={t.tan} onChange={(v) => upd({ tan: v.toUpperCase() })} />
                    <Text label="Section" value={t.section} onChange={(v) => upd({ section: v })} help="e.g. 194A" />
                    <Money label="Income" value={t.income} onChange={(v) => upd({ income: v })} />
                    <Money label="Tax deducted" value={t.amount} onChange={(v) => upd({ amount: v })} />
                    <IconButton aria-label="Remove" onClick={() => setT({ otherTds: (taxes.otherTds ?? []).filter((_, j) => j !== i) })}><DeleteOutlineRounded /></IconButton>
                  </Box>
                );
              })}
              <Button size="small" onClick={() => setT({ otherTds: [...(taxes.otherTds ?? []), { kind: 'TDS' }] })}>Add TDS / TCS</Button>
            </Box>
            {saveBar({ income, deductions, taxes }, 3)}
          </Box>
        </SectionCard>
      )}

      {/* ── 4. Both regimes ───────────────────────────────────────────── */}
      {step === 3 && (
        <SectionCard title="4. Both regimes on the same figures" subtitle={r.compare.sentence}>
          <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: { xs: 1.25, sm: 3 }, rowGap: 0.75, alignItems: 'baseline', fontSize: { xs: 13, sm: 14 } }} data-table="regimes">
              <span /><Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)', textAlign: 'right' }}>OLD</Typography><Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-3)', textAlign: 'right' }}>NEW</Typography>
              {([
                ['Income from salary', 'incomeFromSalary'], ['House property', 'houseProperty'], ['Other income', 'otherIncome'], ['Gross total income', 'grossTotalIncome'],
                ['Deductions', 'totalDeductions'], ['Total income', 'taxableIncome'], ['Tax at the slab rates', 'slabTax'], ['Tax at special rates', 'specialRateTax'],
                ['Rebate', 'rebate'], ['Surcharge', 'surcharge'], ['Cess', 'cess'], ['Tax on total income', 'totalTax'],
              ] as const).map(([label, k]) => [
                <Box key={'l-' + k} sx={{ fontWeight: k === 'totalTax' ? 600 : 400, minWidth: 0 }}>{label}</Box>,
                <Box key={'o-' + k} sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: k === 'totalTax' ? 600 : 400, whiteSpace: 'nowrap' }}>{inr(r.old[k])}</Box>,
                <Box key={'n-' + k} sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: k === 'totalTax' ? 600 : 400, whiteSpace: 'nowrap' }}>{inr(r.new[k])}</Box>,
              ])}
            </Box>
            {r.new.refused.length > 0 && (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Not counted in the new regime: {r.new.refused.map((x) => `${x.what} ${inr(x.amount)}`).join(', ')}.</Typography>
            )}
            <Grid>
              <TextField select size="small" label="File in" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={choices.regime ?? ''} onChange={(e) => set('choices', { ...choices, regime: (e.target.value || null) as Regime | null })} data-field="itr-regime">
                <MenuItem value="">The cheaper ({r.compare.cheaper === 'OLD' ? 'old' : 'new'} regime)</MenuItem>
                <MenuItem value="NEW">New regime (the default)</MenuItem>
                <MenuItem value="OLD">Old regime</MenuItem>
              </TextField>
              <Text label="I will file on" type="date" value={choices.filingDate ?? r.filingDate} onChange={(v) => set('choices', { ...choices, filingDate: v || null })} help={`Due ${r.interest.dueDate}. Interest is counted to this date.`} />
            </Grid>
            <Rows rows={[
              { label: `Tax on total income (${r.regime === 'OLD' ? 'old' : 'new'} regime)`, amount: c.totalTax },
              ...(r.interest.c ? [{ label: 'Interest 234C (instalments of advance tax) — estimate', amount: r.interest.c }] : []),
              ...(r.interest.b ? [{ label: 'Interest 234B (advance tax short) — estimate', amount: r.interest.b }] : []),
              ...(r.interest.a ? [{ label: 'Interest 234A (filed late) — estimate', amount: r.interest.a }] : []),
              ...(r.interest.fee ? [{ label: 'Late fee', amount: r.interest.fee }] : []),
              { label: 'Taxes already paid (TDS, TCS, advance, self-assessment)', amount: -r.prepaid.total },
              { label: r.payable ? 'Still to pay' : 'Refund', amount: r.payable || r.refund, strong: true },
            ]} />
            <Callout tone={r.payable ? 'warning' : 'success'} title={r.payable ? `${inr(r.payable)} to pay` : r.refund ? `${inr(r.refund)} refund` : 'Nothing to pay'}>{r.sentence}</Callout>
            {[...r.warnings, ...r.interest.notes].map((w) => <Typography key={w} sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>• {w}</Typography>)}
            <Accordion disableGutters elevation={0} sx={{ border: '1px solid var(--c-divider)' }}>
              <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography sx={{ fontSize: 14 }}>The working, line by line ({r.regime === 'OLD' ? 'old' : 'new'} regime)</Typography></AccordionSummary>
              <AccordionDetails><Rows rows={c.lines.map((l) => ({ label: l.label, amount: l.amount }))} /></AccordionDetails>
            </Accordion>
            {saveBar({ choices }, 4)}
          </Box>
        </SectionCard>
      )}

      {/* ── 5. Your return ────────────────────────────────────────────── */}
      {step === 4 && (
        <>
          <SectionCard title="5. Your return" subtitle={`${r.form.form === 'ITR1' ? 'ITR-1 (Sahaj)' : 'ITR-2'} · ${r.regime === 'OLD' ? 'old' : 'new'} regime · ${r.payable ? `${inr(r.payable)} to pay` : `${inr(r.refund)} refund`}${data.status === 'FINALISED' ? ' · finalised' : ''}`}>
            <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
              <Callout tone="warning" title="This app does not file your return.">Upload the JSON or type the figures on incometax.gov.in yourself, then e-verify within the time allowed.</Callout>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" onClick={() => download('pdf')} data-action="itr-pdf">Download the summary (PDF)</Button>
                {data.json.available
                  ? <Button variant="outlined" onClick={() => download('json')} data-action="itr-json">Download the JSON ({data.json.form === 'ITR1' ? 'ITR-1' : r.form.form}, schema {data.json.version})</Button>
                  : <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', alignSelf: 'center' }}>{data.json.note}</Typography>}
              </Box>
              {data.json.available && (
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                  The JSON is checked against the official {r.form.form === 'ITR1' ? 'ITR-1' : 'ITR-2'} schema before it is given to you. This app is not a registered e-filing utility: if the portal does not take the file, type the figures using the guide below.
                </Typography>
              )}
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>Part B-TI — total income</Typography>
                <Rows rows={scheduleRows(r.schedules.BTI)} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: 14, mb: 1 }}>Part B-TTI — tax</Typography>
                <Rows rows={scheduleRows(r.schedules.BTTI)} />
              </Box>
            </Box>
          </SectionCard>

          <SectionCard title="Your details for the return" subtitle="The JSON and the portal need them. Your PAN comes from your record with HR.">
            <Box sx={{ p: 2, display: 'grid', gap: 2 }}>
              <Typography sx={{ fontSize: 13.5 }}>PAN: {data.person.panMasked ?? 'not on your record — ask HR to add it'}</Typography>
              <Grid>
                <Text label="Father's name" value={personal.fatherName} onChange={(v) => setP({ fatherName: v })} />
                <Text label="Mobile" value={personal.mobile} onChange={(v) => setP({ mobile: v })} />
                <Text label="Email" value={personal.email} onChange={(v) => setP({ email: v })} />
                <TextField select size="small" label="Employer category" value={personal.employerCategory ?? 'OTH'} onChange={(e) => setP({ employerCategory: e.target.value })}>
                  <MenuItem value="OTH">Others (a private company)</MenuItem>
                  <MenuItem value="CGOV">Central Government</MenuItem>
                  <MenuItem value="SGOV">State Government</MenuItem>
                  <MenuItem value="PSU">Public sector undertaking</MenuItem>
                  <MenuItem value="NA">Not applicable</MenuItem>
                </TextField>
                <Text label="Flat / door" value={personal.address?.flat} onChange={(v) => setP({ address: { ...personal.address, flat: v } })} />
                <Text label="Building" value={personal.address?.premises} onChange={(v) => setP({ address: { ...personal.address, premises: v } })} />
                <Text label="Road" value={personal.address?.road} onChange={(v) => setP({ address: { ...personal.address, road: v } })} />
                <Text label="Area" value={personal.address?.area} onChange={(v) => setP({ address: { ...personal.address, area: v } })} />
                <Text label="City" value={personal.address?.city} onChange={(v) => setP({ address: { ...personal.address, city: v } })} />
                <TextField select size="small" label="State" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={personal.address?.stateCode ?? ''} onChange={(e) => setP({ address: { ...personal.address, stateCode: e.target.value } })}>
                  <MenuItem value="" disabled>Pick your state</MenuItem>
                  {STATE_CODES.map(([k, l]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
                </TextField>
                <Text label="PIN code" value={personal.address?.pinCode} onChange={(v) => setP({ address: { ...personal.address, pinCode: v } })} />
              </Grid>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>Bank account for the refund</Typography>
              <Grid>
                <Text label="Bank" value={draft.bank?.bankName} onChange={(v) => set('bank', { ...draft.bank, bankName: v })} />
                <Text label="IFSC" value={draft.bank?.ifsc} onChange={(v) => set('bank', { ...draft.bank, ifsc: v.toUpperCase() })} />
                <Text label="Account number" value={bankAccount} onChange={setBankAccount} help={data.draft.bank.accountMasked ? `Saved: ${data.draft.bank.accountMasked}. Leave empty to keep it.` : 'Shown masked once saved.'} />
                <TextField select size="small" label="Type" value={draft.bank?.type ?? 'SAVINGS'} onChange={(e) => set('bank', { ...draft.bank, type: e.target.value as 'SAVINGS' | 'CURRENT' })}>
                  <MenuItem value="SAVINGS">Savings</MenuItem>
                  <MenuItem value="CURRENT">Current</MenuItem>
                </TextField>
              </Grid>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button color="inherit" onClick={() => setStep(3)}>Back</Button>
                <Button variant="outlined" disabled={saving} onClick={() => save({ personal, bank: { ...draft.bank, account: bankAccount || null } })} data-action="itr-save-details">Save details</Button>
                <Button
                  variant="contained" disabled={saving || !data.saved} data-action="itr-finalise"
                  onClick={async () => { try { take(await itrApi.finalise(year)); toast.success('Finalised. The employer figures are kept as they are now.'); } catch (e) { setProblems([errorMessage(e)]); } }}
                >
                  {data.status === 'FINALISED' ? 'Finalised' : 'Finalise'}
                </Button>
              </Box>
            </Box>
          </SectionCard>

          <SectionCard title="Where to type each number" subtitle={data.guide.intro}>
            <Box sx={{ p: 1 }}>
              {data.guide.screens.map((s) => (
                <Accordion key={s.screen} disableGutters elevation={0} sx={{ borderBottom: '1px solid var(--c-divider)' }}>
                  <AccordionSummary expandIcon={<ExpandMoreRounded />}><Typography sx={{ fontSize: 14, fontWeight: 500 }}>{s.screen}</Typography></AccordionSummary>
                  <AccordionDetails>
                    {s.items.map((it, i) => (
                      <Box key={i} sx={{ py: 0.5, borderBottom: '1px dashed var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                          <Typography sx={{ flex: 1, fontSize: 13.5, minWidth: 0, overflowWrap: 'anywhere' }}>{it.field}</Typography>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', maxWidth: '55%', overflowWrap: 'anywhere' }}>{typeof it.value === 'number' ? inr(it.value) : it.value}</Typography>
                        </Box>
                        {it.note && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{it.note}</Typography>}
                      </Box>
                    ))}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          </SectionCard>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button color="error" disabled={!data.saved} onClick={() => setConfirmDelete(true)} data-action="itr-start-again">Start again (delete this return)</Button>
          </Box>
          <ConfirmDialog
            open={confirmDelete}
            title={`Delete your return for ${year}?`}
            body="Everything you typed for this year is deleted. The figures from payroll stay where they are."
            confirmLabel="Delete"
            danger
            onClose={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setConfirmDelete(false);
              try { await itrApi.remove(year); take(await itrApi.get(year)); setStep(0); toast.success('Deleted.'); } catch (e) { setProblems([errorMessage(e)]); }
            }}
          />
        </>
      )}
    </Box>
  );
}
