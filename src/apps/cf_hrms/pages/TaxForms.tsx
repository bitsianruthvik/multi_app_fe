/**
 * Tax › Forms 16 / 130 (CF_HRMS_HIRING_SPEC.md §25.4) — Part B generated from the year's locked
 * payroll (with Form 12BA / 123 when there are perquisites), Part A uploaded as the PDFs TRACES's
 * PDF Converter makes (one, several in a ZIP), matched by PAN; one download per person; released to
 * My tax › Forms when HR releases the year.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Callout, ErrorNotice, ListSkeleton, PageHeader, SectionCard, StatStrip, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { readFileBase64, taxApi, type FormsList, type Profiles } from '../api/tax';
import { TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { useTaxYears } from '../components/tax/taxWords';
import { rupees } from '../components/payroll/payWords';
import { saveBase64File } from '../api/excel';
import { useCan } from '../access/can';

export default function TaxForms() {
  const toast = useToast();
  const can = useCan();
  const { years, year, setYear } = useTaxYears();
  const [data, setData] = useState<FormsList | null>(null);
  const [people, setPeople] = useState<Profiles | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<number, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    if (!year) return;
    taxApi.forms(year).then((d) => { setData(d); setError(null); }).catch(setError);
    taxApi.profiles(year).then(setPeople).catch(() => undefined);
  }, [year]);
  useEffect(load, [load]);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); load(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const onZip = async (f?: File) => {
    if (!f) return;
    await run('partA', async () => {
      const r = await taxApi.uploadPartA(year, await readFileBase64(f));
      toast.success(`${r.files} file(s): ${r.matched.length} matched by PAN, ${r.unmatched.length} to match by hand.`);
    }, 'Part A uploaded.');
    if (input.current) input.current.value = '';
  };

  return (
    <Box>
      <PageHeader
        title={data?.form ? `${data.form}` : 'Forms 16 / 130'}
        subtitle={`The salary certificate of ${year}: Part B made here, Part A from TRACES.`}
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <YearSelect value={year} years={years} onChange={setYear} />
            {can.payroll.edit && <Button variant="contained" disabled={!!busy} onClick={() => void run('gen', () => taxApi.generate(year), 'Part B generated.')} startIcon={busy === 'gen' ? <CircularProgress size={14} color="inherit" /> : undefined}>Generate Part B</Button>}
            {can.payroll.upload && <Button variant="outlined" disabled={!!busy} onClick={() => input.current?.click()}>Upload Part A (PDF or ZIP)</Button>}
            {can.payroll.edit && data && <Button disabled={!!busy} onClick={() => void run('rel', () => taxApi.release(year, !data.released), data.released ? 'Withdrawn from My tax.' : 'Released to My tax › Forms.')}>{data.released ? 'Withdraw from My tax' : 'Release to My tax'}</Button>}
          </Stack>
        )}
      />
      <input ref={input} type="file" hidden accept="application/pdf,application/zip,.zip" onChange={(e) => void onZip(e.target.files?.[0])} />
      <TaxBanner review={data?.review} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      <Callout tone="info" title="Part A comes from TRACES" sx={{ mb: 2 }}>
        Download Form 16 / 130 from TRACES, open the ZIP with the TRACES PDF Converter (its password is your TAN in capitals), and upload the PDFs it makes — one, or all in a ZIP. Each is matched to a person by the PAN in its name or its text.
      </Callout>
      {!data && !error && <ListSkeleton />}
      {data && (
        <Stack spacing={2}>
          <StatStrip stats={[
            { label: 'Part B made', value: data.people.filter((p) => p.partB).length },
            { label: 'Part A matched', value: data.people.filter((p) => p.partA).length },
            { label: 'Part A to match', value: data.unmatched.length, tone: 'warning' },
            { label: data.released ? 'Released' : 'Not released', value: data.released ? 1 : 0, display: data.released ? 'Yes' : 'No' },
          ]} />
          {data.unmatched.length > 0 && (
            <SectionCard title="Part A files not matched" subtitle="No PAN of an employee was found in them. Choose the person.">
              {data.unmatched.map((u) => (
                <Box key={u.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', py: 0.75 }}>
                  <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{u.fileName}{u.panFound ? ` (PAN ${u.panFound})` : ''}</Typography>
                  <TextField select size="small" label="Person" value={assign[u.id] ?? ''} onChange={(e) => setAssign({ ...assign, [u.id]: e.target.value })} sx={{ minWidth: 220 }}>
                    {(people?.people ?? []).map((p) => <MenuItem key={p.employee.id} value={String(p.employee.id)}>{p.employee.name} ({p.employee.code})</MenuItem>)}
                  </TextField>
                  <Button size="small" variant="outlined" disabled={!assign[u.id] || !!busy} onClick={() => void run(`a${u.id}`, () => taxApi.assignPartA(year, u.id, Number(assign[u.id])), 'Matched.')}>Match</Button>
                </Box>
              ))}
            </SectionCard>
          )}
          <Stack spacing={1}>
            {data.people.map((p) => (
              <Box key={p.employee.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', p: 1.25, border: '1px solid var(--c-divider)', borderRadius: 1.5 }}>
                <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{p.employee.name}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{p.employee.code}{p.totalTax != null ? ` · tax ${rupees(p.totalTax)} · TDS ${rupees(p.tds ?? 0)}` : ''}</Typography>
                </Box>
                <ToneBadge tone={p.partB ? 'success' : 'neutral'} label={p.partB ? `Part B${p.provisional ? ' (provisional)' : ''}` : 'No Part B'} noIcon />
                <ToneBadge tone={p.partA ? 'success' : 'neutral'} label={p.partA ? 'Part A' : 'No Part A'} noIcon />
                <Button size="small" variant="outlined" disabled={!p.partA && !p.partB} onClick={async () => { try { saveBase64File(await taxApi.formFile(year, p.employee.id)); } catch (e) { toast.error(errorMessage(e)); } }}>Download</Button>
              </Box>
            ))}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
