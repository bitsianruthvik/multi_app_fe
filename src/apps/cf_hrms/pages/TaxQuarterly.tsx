/**
 * Tax › Quarterly returns (CF_HRMS_HIRING_SPEC.md §25.4) — the data of Form 24Q (to 2025-26) /
 * Form 138 (from 2026-27): the quarter's challans, Annexure I (a row a person a month), Annexure II
 * in Q4, and what would make the return fail. The workbook is laid out in the RPU's columns; the
 * FVU file itself comes from Protean's RPU — the screen says so.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Callout, ErrorNotice, ListSkeleton, PageHeader, SectionCard, StatStrip, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { taxApi, type Quarter } from '../api/tax';
import { TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { useTaxYears } from '../components/tax/taxWords';
import { rupees } from '../components/payroll/payWords';
import { saveBase64File } from '../api/excel';

const LEVEL_TONE = { ERROR: 'danger', WARNING: 'warning', INFO: 'info' } as const;

export default function TaxQuarterly() {
  const toast = useToast();
  const { years, year, setYear } = useTaxYears();
  const [quarter, setQuarter] = useState('Q1');
  const [data, setData] = useState<Quarter | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (year) { setData(null); taxApi.quarter(year, quarter).then((d) => { setData(d); setError(null); }).catch(setError); } }, [year, quarter]);
  useEffect(load, [load]);
  const download = async () => {
    setBusy(true);
    try { saveBase64File(await taxApi.quarterWorkbook(year, quarter)); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Box>
      <PageHeader
        title="Quarterly returns"
        subtitle={data?.form ? `${data.form} — ${year} ${quarter}${data.due ? `, due ${data.due}` : ''}` : 'The TDS return on salary, quarter by quarter.'}
        actions={(
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            <YearSelect value={year} years={years} onChange={setYear} />
            <TextField select size="small" label="Quarter" value={quarter} onChange={(e) => setQuarter(e.target.value)} sx={{ minWidth: 110 }}>
              {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <MenuItem key={q} value={q}>{q}</MenuItem>)}
            </TextField>
            <Button variant="contained" disabled={!data || busy} onClick={() => void download()}>Download for the RPU (Excel)</Button>
          </Stack>
        )}
      />
      <TaxBanner review={data?.review} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <ListSkeleton />}
      {data && (
        <Stack spacing={2}>
          <Callout tone="info" title="The return file comes from the RPU, not from here">
            {data.fvuNote} {data.rpu ? `Use ${data.rpu}.` : ''} {data.fileFormat ? `Layout: ${data.fileFormat}.` : ''}
          </Callout>
          <StatStrip stats={[
            { label: 'TDS in the quarter', value: data.totals.deducted, display: rupees(data.totals.deducted) },
            { label: 'Deposited', value: data.totals.deposited, display: rupees(data.totals.deposited) },
            { label: 'People', value: data.totals.people },
            { label: 'Errors', value: data.validation.filter((v) => v.level === 'ERROR').length, tone: 'danger' },
          ]} />
          <SectionCard title="Check before filing" subtitle={data.validation.length ? undefined : 'Nothing found.'}>
            {data.validation.map((v, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5 }}>
                <ToneBadge tone={LEVEL_TONE[v.level]} label={v.level.toLowerCase()} noIcon />
                <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{v.what}</Typography>
              </Box>
            ))}
          </SectionCard>
          <SectionCard title={`Challans (${data.challans.length})`}>
            {data.challans.length === 0 && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No deposit recorded for these months (Tax › Challans).</Typography>}
            {data.challans.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 0.5, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{c.no}. {c.month} · challan {c.challanSerial} · BSR {c.bsrCode} · {c.depositDate}</Typography>
                <Typography sx={{ fontSize: 13 }}>{rupees(c.total)} · {c.deductees} row{c.deductees === 1 ? '' : 's'}</Typography>
              </Box>
            ))}
          </SectionCard>
          <SectionCard title={`Annexure I — ${data.deductees.length} row${data.deductees.length === 1 ? '' : 's'}`}>
            {data.deductees.map((r, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 0.5, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{r.employee.name} · {r.pan}{r.remark ? ` · remark ${r.remark}` : ''}</Typography>
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{r.month} · paid {rupees(r.amountPaid)} · TDS {rupees(r.tds)} · challan {r.challanNo ?? '—'}</Typography>
              </Box>
            ))}
          </SectionCard>
          {data.annexureII && (
            <SectionCard title={`Annexure II — salary of the year (${data.annexureII.length})`}>
              {data.annexureII.map((a) => (
                <Box key={a.employee.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', py: 0.5, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                  <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{a.employee.name} · {a.pan} · opting out {a.optingOut}</Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>gross {rupees(a.grossSalary)} · taxable {rupees(a.taxableIncome)} · tax {rupees(a.netTax)} · TDS {rupees(a.tdsCurrent + a.tdsPrevious)}</Typography>
                </Box>
              ))}
            </SectionCard>
          )}
        </Stack>
      )}
    </Box>
  );
}
