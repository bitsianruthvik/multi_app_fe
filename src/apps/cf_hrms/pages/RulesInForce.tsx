/**
 * Payroll › Rules in force (CF_HRMS_HIRING_SPEC.md §36.1, §36.5) — every rule of the law layer that
 * applies to the company on a day: value, source link, effective date, version history, verified
 * flag; and the income-tax rules of a year (both regimes). READ-ONLY: the product team keeps the law
 * for every company; the company's own choices are on Statutory settings.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, Link, MenuItem, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { Callout, ErrorNotice, ListSkeleton, PageHeader, SectionCard, ToneBadge, useCompanySlug } from '@shared/ui';
import { lawApi, type LawRule, type RulesInForce as RulesData, type TaxRulesPage } from '../api/law';
import { HistoryList, RuleValue, SourceLine, VerifiedBadge } from '../components/law/LawParts';
import { longDay, todayIso } from '../components/jobDates';

const STATE_WORD: Record<string, string> = { IN: 'All India' };

function RuleCard({ r, stateName }: { r: LawRule; stateName: (c: string) => string }) {
  return (
    <Box data-rule={String(r.id)} sx={{ py: 1.5, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{r.title ?? r.ruleKey}</Typography>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{stateName(r.jurisdiction)} · from {longDay(r.effectiveFrom)}{r.effectiveTo ? ` to ${longDay(r.effectiveTo)}` : ''} · version {r.version}</Typography>
        <VerifiedBadge verified={r.verified} />
        {r.companyNote?.verification === 'VERIFIED' && <ToneBadge tone="info" label="Checked by your company" noIcon />}
      </Box>
      <RuleValue rule={r} />
      <SourceLine note={r.sourceNote} url={r.sourceUrl} />
      {r.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5, overflowWrap: 'anywhere' }}>Note: {r.note}</Typography>}
      {r.history && <HistoryList items={r.history} currentId={r.id} />}
    </Box>
  );
}

function LabourLaw() {
  const [on, setOn] = useState(todayIso());
  const [data, setData] = useState<RulesData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    lawApi.rulesInForce(on).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [on]);
  useEffect(load, [load]);
  const stateName = (c: string) => STATE_WORD[c] ?? data?.states.find((s) => s.code === c)?.name ?? c;
  if (!data) return error ? <ErrorNotice error={error} onRetry={load} /> : <ListSkeleton rows={8} />;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" type="date" label="In force on" value={on} onChange={(e) => setOn(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 180 }} inputProps={{ 'data-field': 'rules-on' }} />
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Your states: {data.states.map((s) => s.name).join(', ')} — from the company and its locations.</Typography>
      </Box>
      <ErrorNotice error={error} onRetry={load} />
      {data.unverified > 0 && (
        <Callout tone="warning" title={`${data.unverified} rule${data.unverified === 1 ? ' is' : 's are'} not verified`}>
          Not confirmed on an official page yet (the reason is in each source). Check them with your CA before you rely on them.
        </Callout>
      )}
      {data.domains.map((d) => (
        <SectionCard key={d.domain} title={d.name} subtitle={`${d.rules.length} rule${d.rules.length === 1 ? '' : 's'}`}>
          {d.rules.map((r) => <RuleCard key={String(r.id)} r={r} stateName={stateName} />)}
        </SectionCard>
      ))}
      {data.domains.length === 0 && <Callout title="No rules in force on this day">The law layer holds rules from April 2025.</Callout>}
    </Stack>
  );
}

function TaxRules() {
  const [year, setYear] = useState<string | undefined>(undefined);
  const [data, setData] = useState<TaxRulesPage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    lawApi.taxRules(year).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [year]);
  useEffect(load, [load]);
  const keys = useMemo(() => [...new Set((data?.rules ?? []).map((r) => r.ruleKey))].sort(), [data]);
  if (!data) return error ? <ErrorNotice error={error} onRetry={load} /> : <ListSkeleton rows={8} />;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField select size="small" label="Tax year" value={data.year} onChange={(e) => setYear(e.target.value)} sx={{ width: 160 }}>
          {data.years.map((y) => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </TextField>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{keys.length} rules, both regimes. Every rate, slab and limit the tax engine uses.</Typography>
      </Box>
      {data.unverified > 0 && <Callout tone="warning" title={`${data.unverified} not verified`}>Marked where an official text could not be read; the reason is in the source.</Callout>}
      <SectionCard title={`Income tax ${data.year}`}>
        {keys.map((k) => {
          const rs = data.rules.filter((r) => r.ruleKey === k);
          const same = rs.length === 2 && JSON.stringify(rs[0].value) === JSON.stringify(rs[1].value);
          return (
            <Box key={k} data-tax-rule={k} sx={{ py: 1.25, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
              <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{k.replace(/_/g, ' ')}</Typography>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{same ? 'both regimes' : rs.map((r) => `${r.regime === 'OLD' ? 'old' : 'new'} regime v${r.version}`).join(' · ')}</Typography>
                <VerifiedBadge verified={rs.every((r) => r.verified)} />
              </Box>
              {(same ? rs.slice(0, 1) : rs).map((r) => (
                <Box key={String(r.id)} sx={{ mt: 0.5 }}>
                  {!same && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{r.regime === 'OLD' ? 'Old regime' : 'New regime'}</Typography>}
                  <RuleValue rule={r} />
                </Box>
              ))}
              <SourceLine note={rs[0]?.sourceNote ?? null} url={rs[0]?.sourceUrl ?? null} />
            </Box>
          );
        })}
      </SectionCard>
    </Stack>
  );
}

export default function RulesInForce() {
  const slug = useCompanySlug();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'tax' ? 'tax' : 'labour';
  return (
    <Box sx={{ maxWidth: 1100 }}>
      <PageHeader title="Rules in force" subtitle="The law as it applies to you — kept by the product team, each rule with its source, date and versions" />
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1 }}>
        Read-only. Your own choices (PF basis, registration numbers, bonus rate) are on{' '}
        <Link component={RouterLink} to={`/${slug}/cf_hrms/statutory-settings`}>Statutory settings</Link>.
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setParams(v === 'tax' ? { tab: 'tax' } : {}, { replace: true })} sx={{ mb: 2 }}>
        <Tab value="labour" label="Labour law" data-tab="labour" />
        <Tab value="tax" label="Income tax" data-tab="tax" />
      </Tabs>
      {tab === 'labour' ? <LabourLaw /> : <TaxRules />}
    </Box>
  );
}
