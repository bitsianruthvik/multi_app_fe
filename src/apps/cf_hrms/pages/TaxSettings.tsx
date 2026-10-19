/**
 * Tax › Settings (CF_HRMS_HIRING_SPEC.md §25.4) — the year's windows (declarations, proofs), the
 * regime cut-off, the Owner's "Reviewed by our CA for <year>" tick, and the deductor (TAN, PAN,
 * address, the person responsible) that the quarterly return and Form 16 / 130 print.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, Checkbox, Stack, TextField, Typography } from '@mui/material';
import { Callout, DetailSkeleton, ErrorNotice, PageHeader, SectionCard, errorMessage, useToast } from '@shared/ui';
import { taxApi, type YearView } from '../api/tax';
import { TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { WINDOW_WORD, useTaxYears } from '../components/tax/taxWords';
import { useCan } from '../access/can';

const DATES = [['declarationFrom', 'Declarations from'], ['declarationTo', 'Declarations to'], ['proofFrom', 'Proofs from'], ['proofTo', 'Proofs to'], ['regimeCutoff', 'Regime cut-off']] as const;

export default function TaxSettings() {
  const toast = useToast();
  const can = useCan();
  const { years, year, setYear } = useTaxYears();
  const [data, setData] = useState<YearView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dates, setDates] = useState<Record<string, string>>({});
  const [ded, setDed] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const load = useCallback(() => {
    if (!year) return;
    taxApi.year(year).then((d) => {
      setData(d); setError(null);
      setDates(Object.fromEntries(DATES.map(([k]) => [k, d.settings[k]])));
      setDed({ tan: d.deductor.tan ?? '', pan: d.deductor.pan ?? '', name: d.deductor.name ?? '', branch: d.deductor.branch ?? '', line1: d.deductor.address.line1 ?? '', city: d.deductor.address.city ?? '', state: d.deductor.address.state ?? '', pin: d.deductor.address.pin ?? '', rname: d.deductor.responsible.name ?? '', rdes: d.deductor.responsible.designation ?? '' });
    }).catch(setError);
  }, [year]);
  useEffect(load, [load]);
  const save = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(errorMessage(e)); } };
  const edit = can.payroll.edit;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <PageHeader title="Tax settings" subtitle="Windows, the regime cut-off, the CA review and the deductor." actions={<YearSelect value={year} years={years} onChange={setYear} />} />
      <TaxBanner review={data?.review} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <DetailSkeleton />}
      {data && (
        <Stack spacing={2}>
          {data.rulesMissing && <Callout tone="danger" title={`No tax rules for ${year}`}>{data.rulesMissing}</Callout>}
          <SectionCard title={`The year ${year}`} subtitle={`${data.forms?.declaration ?? 'Declarations'} window ${WINDOW_WORD[data.settings.declarationWindow]}; proofs ${WINDOW_WORD[data.settings.proofWindow]}; regime ${data.settings.regimeOpen ? 'open' : 'past the cut-off'}.${data.settings.saved ? '' : ' (The defaults.)'}`}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1.5 }}>
              {DATES.map(([k, label]) => (
                <TextField key={k} type="date" size="small" label={label} InputLabelProps={{ shrink: true }} value={dates[k] ?? ''} disabled={!edit} onChange={(e) => setDates({ ...dates, [k]: e.target.value })} />
              ))}
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1 }}>After the proof window closes, the TDS counts only verified amounts. After the cut-off, a person’s regime is changed only by HR, once, with a reason. A person’s windows can be re-opened on Tax › Profiles.</Typography>
            {edit && <Button sx={{ mt: 1.5 }} variant="contained" onClick={() => void save(() => taxApi.putYear(year, dates), 'Saved.')}>Save the year</Button>}
          </SectionCard>
          <SectionCard title={`Reviewed by our CA for ${year}`} subtitle={data.settings.caReviewed ? `Ticked ${data.settings.caReviewedAt?.slice(0, 10) ?? ''}${data.settings.caNote ? ` — ${data.settings.caNote}` : ''}` : 'Until it is ticked, every tax screen says the figures are not reviewed.'}>
            {data.canTickReview ? (
              <Stack spacing={1}>
                <TextField size="small" label="Note (who reviewed, when)" value={note} onChange={(e) => setNote(e.target.value)} />
                <FormControlLabel control={<Checkbox checked={data.settings.caReviewed} onChange={(e) => void save(() => taxApi.caReview(year, { reviewed: e.target.checked, note }), e.target.checked ? 'Ticked.' : 'Unticked.')} />} label={`Our CA has reviewed the tax rules and figures for ${year}`} />
              </Stack>
            ) : <Typography sx={{ fontSize: 13 }}>Only the Owner ticks it.</Typography>}
          </SectionCard>
          <SectionCard title="The deductor" subtitle="Printed on Form 16 / 130 and the quarterly return.">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1.5 }}>
              {[['tan', 'TAN'], ['pan', 'PAN of the company'], ['name', 'Name'], ['branch', 'Branch / division'], ['line1', 'Address'], ['city', 'City'], ['state', 'State'], ['pin', 'PIN'], ['rname', 'Person responsible'], ['rdes', 'Their designation']].map(([k, label]) => (
                <TextField key={k} size="small" label={label} value={ded[k] ?? ''} disabled={!edit} onChange={(e) => setDed({ ...ded, [k]: e.target.value })} />
              ))}
            </Box>
            {edit && (
              <Button sx={{ mt: 1.5 }} variant="contained" onClick={() => void save(() => taxApi.putDeductor({
                tan: ded.tan || null, pan: ded.pan || null, name: ded.name, branch: ded.branch || null,
                address: { line1: ded.line1, city: ded.city, state: ded.state, pin: ded.pin }, responsible: { name: ded.rname, designation: ded.rdes },
              }), 'Saved.')}>Save the deductor</Button>
            )}
          </SectionCard>
        </Stack>
      )}
    </Box>
  );
}
