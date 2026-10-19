/**
 * Tax › Profiles (CF_HRMS_HIRING_SPEC.md §25.4) — everybody's tax year: regime, PAN, age band, city.
 * Counts by regime and the people without a valid PAN (TDS at the higher rate). HR changes a
 * regime (after the cut-off once, with a reason), the city / metro, or re-opens the declaration
 * window for one person.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { EmptyState, ErrorNotice, FormDialog, PageHeader, StatStrip, ToneBadge, ListSkeleton, useToast } from '@shared/ui';
import { taxApi, type ProfileRow, type Profiles, type Regime } from '../api/tax';
import { TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { REGIME_WORD, useTaxYears } from '../components/tax/taxWords';
import { useCan } from '../access/can';

type Draft = { p: ProfileRow; regime: Regime; reason: string; city: string; metro: 'AUTO' | 'YES' | 'NO'; reopen: string };

export default function TaxProfiles() {
  const { company } = useParams<{ company: string }>();
  const can = useCan();
  const toast = useToast();
  const { years, year, setYear, error: yErr } = useTaxYears();
  const [q, setQ] = useState('');
  const [onlyNoPan, setOnlyNoPan] = useState(false);
  const [data, setData] = useState<Profiles | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const load = useCallback(() => {
    if (!year) return;
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (onlyNoPan) params.set('pan', 'missing');
    taxApi.profiles(year, params.toString() ? `?${params}` : '').then((d) => { setData(d); setError(null); }).catch(setError);
  }, [year, q, onlyNoPan]);
  useEffect(load, [load]);
  const edit = can.payroll.edit;

  return (
    <Box>
      <PageHeader title="Tax profiles" subtitle="Regime, PAN, age band and city of everybody in the year." actions={<YearSelect value={year} years={years} onChange={setYear} />} />
      <TaxBanner review={data?.review} />
      <ErrorNotice error={yErr ?? error} onRetry={load} sx={{ mb: 2 }} />
      {data && (
        <StatStrip stats={[
          { label: 'People', value: data.counts.people },
          { label: 'New regime', value: data.counts.NEW },
          { label: 'Old regime', value: data.counts.OLD },
          { label: 'No valid PAN', value: data.counts.noPan, tone: data.counts.noPan ? 'danger' : undefined },
          { label: 'No date of birth', value: data.counts.noDateOfBirth },
        ]} />
      )}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', my: 2 }}>
        <TextField size="small" label="Search" value={q} onChange={(e) => setQ(e.target.value)} sx={{ flex: '1 1 200px' }} />
        <FormControlLabel control={<Checkbox checked={onlyNoPan} onChange={(e) => setOnlyNoPan(e.target.checked)} />} label="Only without a valid PAN" />
      </Box>
      {!data && !error && <ListSkeleton />}
      {data && data.people.length === 0 && <EmptyState title="Nobody here" />}
      <Stack spacing={1}>
        {data?.people.map((p) => (
          <Box key={p.employee.id} data-person={p.employee.id} sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', alignItems: 'center', p: 1.25, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
            <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{p.employee.name}</Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                {p.employee.code} · {p.ageBand === 'BELOW_60' ? 'below 60' : p.ageBand === 'AGE_60_TO_80' ? '60–80' : '80+'}{p.dateOfBirth ? '' : ' (no date of birth)'} · {p.city ?? 'city not known'}{p.metro ? ' (50% city)' : ''}
                {p.declarationOpenUntil ? ` · declarations re-opened to ${p.declarationOpenUntil}` : ''}
              </Typography>
            </Box>
            <ToneBadge tone={p.regime === 'OLD' ? 'info' : 'neutral'} label={`${REGIME_WORD[p.regime]}${p.regimeSetHow === 'DEFAULT' ? ' (default)' : ''}`} noIcon />
            {p.panStatus !== 'VALID' && <ToneBadge tone="danger" label={p.panStatus === 'NONE' ? 'No PAN' : 'PAN not valid'} noIcon />}
            {p.proofsWaiting > 0 && <ToneBadge tone="warning" label={`${p.proofsWaiting} proof${p.proofsWaiting === 1 ? '' : 's'} waiting`} noIcon />}
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
              {can.named.payView && <Button size="small" component={RouterLink} to={`/${company}/cf_hrms/tax-declarations/${p.employee.id}?year=${year}`}>Declarations ({p.declarations})</Button>}
              {can.named.payView && <Button size="small" component={RouterLink} to={`/${company}/cf_hrms/tax-sheet/${p.employee.id}?year=${year}`}>Tax sheet</Button>}
              {edit && <Button size="small" variant="outlined" onClick={() => setDraft({ p, regime: p.regime, reason: '', city: p.city ?? '', metro: p.metroFrom === 'HR' ? (p.metro ? 'YES' : 'NO') : 'AUTO', reopen: p.declarationOpenUntil ?? '' })}>Change</Button>}
            </Stack>
          </Box>
        ))}
      </Stack>
      <FormDialog
        open={!!draft}
        title={draft ? draft.p.employee.name : ''}
        subtitle={`Tax year ${year}${data ? ` · regime cut-off ${data.settings.regimeCutoff}` : ''}`}
        onClose={() => setDraft(null)}
        onSubmit={async () => {
          if (!draft) return;
          if (draft.regime !== draft.p.regime) await taxApi.setRegime(year, draft.p.employee.id, { regime: draft.regime, reason: draft.reason || undefined });
          await taxApi.putProfile(year, draft.p.employee.id, { city: draft.city || null, metro: draft.metro === 'AUTO' ? null : draft.metro === 'YES', declarationOpenUntil: draft.reopen || null });
          toast.success('Saved.');
          load();
        }}
      >
        {draft && (
          <Stack spacing={1.5}>
            <TextField select size="small" label="Regime" value={draft.regime} onChange={(e) => setDraft({ ...draft, regime: e.target.value as Regime })}>
              <MenuItem value="NEW">New regime (the default)</MenuItem>
              <MenuItem value="OLD">Old regime</MenuItem>
            </TextField>
            {draft.regime !== draft.p.regime && data && !data.settings.regimeOpen && (
              <TextField size="small" label="Reason (after the cut-off: one change, kept with it)" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} inputProps={{ maxLength: 500 }} />
            )}
            <TextField size="small" label="City (for HRA)" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} helperText="Empty: from the location or the place of posting." />
            <TextField select size="small" label="50% city (metro) for HRA" value={draft.metro} onChange={(e) => setDraft({ ...draft, metro: e.target.value as Draft['metro'] })}>
              <MenuItem value="AUTO">From the city (the year’s rule)</MenuItem>
              <MenuItem value="YES">Yes</MenuItem>
              <MenuItem value="NO">No</MenuItem>
            </TextField>
            <TextField size="small" type="date" label="Re-open declarations and proofs until" InputLabelProps={{ shrink: true }} value={draft.reopen} onChange={(e) => setDraft({ ...draft, reopen: e.target.value })} helperText="For this person only. Empty: the company’s windows." />
          </Stack>
        )}
      </FormDialog>
    </Box>
  );
}
