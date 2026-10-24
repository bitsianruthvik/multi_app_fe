/**
 * The law layer's pieces (CF_HRMS_HIRING_SPEC.md §36.1): a rule's value in words, its source and
 * verified flag, its version history, and the company's CHOICES card (the one editable part).
 */
import { useState } from 'react';
import { Box, Button, Collapse, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { ErrorNotice, SectionCard, ToneBadge, useToast } from '@shared/ui';
import { lawApi, SKILL_WORD, type LawChoices, type LawHistoryItem, type LawRule, type SkillCategory } from '../../api/law';
import { MiniTable } from '../payroll/PayParts';
import { rupees } from '../payroll/payWords';
import { longDay } from '../jobDates';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const pct = (v: unknown) => (num(v) == null ? '—' : `${num(v)}%`);
const ROUND: Record<string, string> = { NEAREST: 'rounded to the nearest rupee', UP: 'rounded up to the next rupee', DOWN: 'rounded down' };

function periodWord(p: { from: string; to: string }) {
  const m = (s: string) => MONTH_SHORT[Number(s.slice(0, 2)) - 1] ?? s;
  return `${Number(p.from.slice(3))} ${m(p.from)} – ${Number(p.to.slice(3))} ${m(p.to)}`;
}
const line = (parts: (string | null | false | undefined)[]) => (
  <Typography sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>{parts.filter(Boolean).join(' · ')}</Typography>
);

/** PF / ESI / PT / LWF settings in words. */
export function StatutoryValues({ kind, s }: { kind: string; s: Record<string, unknown> }) {
  if (kind === 'PF') {
    return line([
      `Employee ${pct(s.employeeRate)}`, `employer ${pct(s.employerRate)} (pension ${pct(s.epsRate)})`, `on wages up to ${rupees(num(s.wageCeiling))} a month`,
      `EDLI ${pct(s.edliRate)}`, `admin ${pct(s.adminRate)}${num(s.adminMinimum) ? `, at least ${rupees(num(s.adminMinimum))} a month` : ''}`,
      typeof s.rounding === 'string' && ROUND[s.rounding],
    ]);
  }
  if (kind === 'ESI') {
    const periods = Array.isArray(s.periods) ? (s.periods as { from: string; to: string }[]) : [];
    return line([
      `Employee ${pct(s.employeeRate)}`, `employer ${pct(s.employerRate)}`,
      `covers wages up to ${rupees(num(s.wageCeiling))} a month${num(s.wageCeilingDisabled) ? ` (${rupees(num(s.wageCeilingDisabled))} with a disability)` : ''}`,
      num(s.exemptDailyWage) != null && `no employee share at a daily wage up to ${rupees(num(s.exemptDailyWage))}`,
      periods.length > 0 && `periods ${periods.map(periodWord).join(' and ')}`, typeof s.rounding === 'string' && ROUND[s.rounding],
    ]);
  }
  if (kind === 'PT') {
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
  return line([`Employee ${rupees(num(s.employee))}`, `employer ${rupees(num(s.employer))}`, months.length ? `deducted in ${months.map((m) => MONTH_SHORT[m - 1]).join(', ')}` : 'no month set']);
}

/** "wageCeilingMonthly" → "Wage ceiling monthly". */
const words = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
function plain(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  if (Array.isArray(v)) return v.map(plain).join(', ');
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${words(k)}: ${plain(x)}`).join('; ');
  return String(v);
}

/** Minimum wages: the rates by zone and skill. */
function MinWageValues({ v }: { v: Record<string, unknown> }) {
  const rates = (Array.isArray(v.rates) ? v.rates : []) as { zone: string; skill: SkillCategory; basic: number; vda: number | null }[];
  const zones = (v.zones ?? {}) as Record<string, string>;
  const skills: SkillCategory[] = ['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'];
  const zoneKeys = [...new Set(rates.map((r) => r.zone))];
  const vda = (v.vda ?? {}) as Record<string, unknown>;
  return (
    <Stack spacing={0.75}>
      <MiniTable
        cols="minmax(150px, 1.4fr) repeat(4, minmax(90px, 1fr))"
        minWidth={560}
        head={['Zone', ...skills.map((s) => SKILL_WORD[s])]}
        rows={zoneKeys.map((z) => ({
          key: z,
          cells: [`${z}${zones[z] ? ` — ${zones[z]}` : ''}`, ...skills.map((s) => { const r = rates.find((x) => x.zone === z && x.skill === s); return r ? `${rupees(r.basic)}${r.vda != null ? ` + ${rupees(r.vda)}` : ''}` : '—'; })],
        }))}
      />
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        Basic a month{rates.some((r) => r.vda == null) ? '; VDA not notified yet' : ' + VDA'}{vda.perPoint ? ` (VDA: ₹${vda.perPoint} a point above ${vda.basePoint}, revised ${vda.revised})` : ''}. Day rate = month ÷ {String(v.dailyDivisor ?? 26)}.
      </Typography>
    </Stack>
  );
}

/** Any rule's value in words. */
export function RuleValue({ rule }: { rule: Pick<LawRule, 'domain' | 'ruleKey' | 'value'> }) {
  const v = rule.value ?? {};
  if (['PF', 'ESI', 'PT', 'LWF'].includes(rule.domain) && rule.ruleKey === 'settings') return <StatutoryValues kind={rule.domain} s={v} />;
  if (rule.domain === 'MIN_WAGE') return <MinWageValues v={v} />;
  const entries = Object.entries(v).filter(([k]) => k !== 'examples');
  if (!entries.length || Array.isArray(v)) return line([plain(v)]);
  return (
    <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(160px, auto) 1fr' }, columnGap: 1.5, rowGap: 0.25 }}>
      {entries.map(([k, x]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Typography component="dt" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{words(k)}</Typography>
          <Typography component="dd" sx={{ m: 0, fontSize: 13.5, overflowWrap: 'anywhere' }}>{plain(x)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return <ToneBadge tone={verified ? 'success' : 'warning'} label={verified ? 'Verified' : 'Not verified'} noIcon />;
}

export function SourceLine({ note, url }: { note: string | null; url: string | null }) {
  if (!note && !url) return null;
  return (
    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.75, overflowWrap: 'anywhere' }}>
      {note ? <>Source: {note}</> : 'Source:'}
      {url && <> {' '}<Link href={url} target="_blank" rel="noopener noreferrer">Open the source</Link></>}
    </Typography>
  );
}

const STATUS_WORD: Record<string, string> = { PUBLISHED: 'Published', SUPERSEDED: 'Replaced', DRAFT: 'Draft' };
export function HistoryList({ items, currentId }: { items: LawHistoryItem[]; currentId: number | string }) {
  const [open, setOpen] = useState(false);
  if (items.length <= 1) return <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>Version 1 — no earlier versions.</Typography>;
  return (
    <Box sx={{ mt: 0.5 }}>
      <Button size="small" onClick={() => setOpen((x) => !x)} sx={{ ml: -0.75 }}>{open ? 'Hide the history' : `Version history (${items.length})`}</Button>
      <Collapse in={open}>
        <Stack spacing={0.25} sx={{ pl: 1, borderLeft: '2px solid var(--c-divider)' }}>
          {items.map((h) => (
            <Typography key={String(h.id)} sx={{ fontSize: 12.5, color: h.id === currentId ? 'var(--c-text-1)' : 'var(--c-text-2)' }}>
              From {longDay(h.effectiveFrom)}{h.effectiveTo ? ` to ${longDay(h.effectiveTo)}` : ''} · version {h.version} · {STATUS_WORD[h.status] ?? h.status}
              {h.verified ? ' · verified' : ' · not verified'}{h.publishedAt ? ` · published ${longDay(String(h.publishedAt).slice(0, 10))}` : ''}{h.id === currentId ? ' (in force)' : ''}
            </Typography>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

/** The company's choices within the law — the editable part of Statutory settings. */
export function LawChoicesCard({ choices, bonus, canEdit, onSaved }: {
  choices: LawChoices; bonus: LawRule | null; canEdit: boolean; onSaved: (c: LawChoices) => void;
}) {
  const toast = useToast();
  const init = () => ({
    pfWageBasis: choices.pfWageBasis, pfEstablishmentCode: choices.pfEstablishmentCode ?? '', esiEmployerCode: choices.esiEmployerCode ?? '',
    ptRegistrationNo: choices.ptRegistrationNo ?? '', ptEnrolmentNo: choices.ptEnrolmentNo ?? '', lwfRegistrationNo: choices.lwfRegistrationNo ?? '',
    bonusRate: choices.bonusRate == null ? '' : String(choices.bonusRate),
  });
  const [d, setD] = useState(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const start = init();
  const dirty = (Object.keys(d) as (keyof typeof d)[]).some((k) => d[k] !== start[k]);
  const minB = Number(bonus?.value?.minRatePct ?? 8.33);
  const maxB = Number(bonus?.value?.maxRatePct ?? 20);
  const b = d.bonusRate.trim() === '' ? null : Number(d.bonusRate);
  const bonusBad = b != null && (!Number.isFinite(b) || b < minB || b > maxB);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = (s: string) => s.trim() || null;
      const { choices: saved } = await lawApi.putChoices({
        pfWageBasis: d.pfWageBasis, pfEstablishmentCode: t(d.pfEstablishmentCode), esiEmployerCode: t(d.esiEmployerCode), ptRegistrationNo: t(d.ptRegistrationNo),
        ptEnrolmentNo: t(d.ptEnrolmentNo), lwfRegistrationNo: t(d.lwfRegistrationNo), bonusRate: b,
      });
      toast.success('Your choices are saved.');
      onSaved(saved);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const f = (key: keyof typeof d, label: string, helper?: string) => (
    <TextField size="small" label={label} value={d[key]} disabled={!canEdit} onChange={(e) => setD({ ...d, [key]: e.target.value })} inputProps={{ maxLength: 40, 'data-field': `choice-${key}` }} helperText={helper} />
  );
  return (
    <SectionCard
      title="Your choices"
      subtitle="What the law leaves to the company. The law itself, below, is kept by the product team for every company."
      actions={canEdit ? <Button variant="contained" size="small" onClick={() => void save()} disabled={!dirty || busy || bonusBad} data-action="save-law-choices">{busy ? 'Saving…' : 'Save'}</Button> : undefined}
    >
      <ErrorNotice error={error} sx={{ mb: 1.5 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
        <TextField select size="small" label="PF for a new salary" value={d.pfWageBasis} disabled={!canEdit} onChange={(e) => setD({ ...d, pfWageBasis: e.target.value as 'CEILING' | 'FULL' })}
          helperText="A salary can still choose otherwise.">
          <MenuItem value="CEILING">On the wage up to the ceiling</MenuItem>
          <MenuItem value="FULL">On the full wage</MenuItem>
        </TextField>
        <TextField size="small" label="Bonus rate (%)" value={d.bonusRate} disabled={!canEdit} onChange={(e) => setD({ ...d, bonusRate: e.target.value })} error={bonusBad}
          helperText={`Between ${minB}% and ${maxB}% (the law${bonus ? `, version ${bonus.version}` : ''}). Empty = not chosen.`} inputProps={{ inputMode: 'decimal', 'data-field': 'choice-bonusRate' }} />
        {f('pfEstablishmentCode', 'PF establishment code')}
        {f('esiEmployerCode', 'ESI employer code')}
        {f('ptRegistrationNo', 'PT registration number')}
        {f('ptEnrolmentNo', 'PT enrolment number')}
        {f('lwfRegistrationNo', 'LWF registration number')}
      </Box>
    </SectionCard>
  );
}
