/**
 * Payroll › Statutory returns (CF_HRMS_HIRING_SPEC.md §25.5) — the month's PF ECR text file, the ESIC
 * monthly contribution sheet and the Telangana professional tax return figures, all made from the month's
 * LOCKED run. Pick a month, read what to fix, download each file. NCP / ESI days come from the attendance
 * month once it is live and closed (§28.6). Without the named pay view the screen shows the counts and the
 * checks only; the files need it.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { Callout, ErrorNotice, ListSkeleton, PageHeader, SectionCard, StatStrip, ToneBadge, errorMessage, useToast } from '@shared/ui';
import { extrasApi, type MonthReturns } from '../api/payrollExtras';
import { rupees } from '../components/payroll/payWords';
import { saveBase64File } from '../api/excel';
import { useCan } from '../access/can';

const LEVEL_TONE = { ERROR: 'danger', WARNING: 'warning', INFO: 'info' } as const;
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const rowSx = { display: 'flex', gap: 1, flexWrap: 'wrap', py: 0.6, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } } as const;

export default function StatutoryReturns() {
  const toast = useToast();
  const can = useCan();
  const [month, setMonth] = useState(lastMonth());
  const [data, setData] = useState<MonthReturns | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<'ALL' | 'PF' | 'ESI' | 'PT'>('ALL');

  const load = useCallback(() => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setData(null);
    extrasApi.returns(month).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [month]);
  useEffect(load, [load]);

  const download = async (k: 'ECR' | 'ESI' | 'PT') => {
    setBusy(k);
    try { saveBase64File(await extrasApi.returnFile(month, k)); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };
  const pay = Boolean(can.named.payView) && !data?.amountsHidden;
  const checks = (data?.validation ?? []).filter((v) => kind === 'ALL' || v.kind === kind);
  const errors = (k: string) => (data?.validation ?? []).filter((v) => v.level === 'ERROR' && v.kind === k).length;

  return (
    <Box>
      <PageHeader
        title="Statutory returns"
        subtitle={data ? `${data.monthLabel}: PF ECR, ESI contribution and professional tax, from the locked run.` : 'PF ECR, ESI contribution and professional tax, from the month’s locked run.'}
        actions={<TextField type="month" size="small" label="Month" value={month} onChange={(e) => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ minWidth: 160 }} />}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <ListSkeleton />}
      {data && !data.ready && <Callout tone="warning" title="No files for this month yet">{data.reason}</Callout>}
      {data?.ready && data.pf && data.esi && data.pt && (
        <Stack spacing={2}>
          {!pay && <Callout tone="info" title="Amounts hidden">You can see the counts and what to fix. The amounts and the files need the right to see pay.</Callout>}
          {data.attendance?.used && <Callout tone="neutral" title="Days from attendance">NCP days and ESI days are taken from the closed attendance month.</Callout>}
          <StatStrip stats={[
            { label: `PF: in the file / members`, value: data.pf.members, display: `${data.pf.inFile} / ${data.pf.members}` },
            { label: `ESI: in the file / members`, value: data.esi.members, display: `${data.esi.inFile} / ${data.esi.members}` },
            { label: 'PT employees', value: data.pt.totals.employees },
            { label: 'To fix', value: data.validation.filter((v) => v.level === 'ERROR').length, tone: 'danger' },
          ]} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
            <FileCard title="PF — ECR" what={data.formats.ECR} errors={errors('PF')}
              lines={pay && data.pf.totals ? [`EPF wages ${rupees(data.pf.totals.epfWages)}`, `EE ${rupees(data.pf.totals.epfEe)} · EPS ${rupees(data.pf.totals.eps)} · ER ${rupees(data.pf.totals.epfDiff)}`, `NCP days ${data.pf.totals.ncpDays}`] : [`${data.pf.inFile} member(s) in the file`]}
              button="Download ECR (.txt)" busy={busy === 'ECR'} disabled={!pay || !data.pf.inFile || !!busy} onClick={() => void download('ECR')} />
            <FileCard title="ESI — monthly contribution" what={data.formats.ESI} errors={errors('ESI')}
              lines={pay && data.esi.totals ? [`Wages ${rupees(data.esi.totals.wages)}`, `Employee ${rupees(data.esi.totals.employeeShare)} · employer ${rupees(data.esi.totals.employerShare)}`] : [`${data.esi.inFile} person(s) in the file`]}
              button="Download ESI sheet" busy={busy === 'ESI'} disabled={!pay || !data.esi.inFile || !!busy} onClick={() => void download('ESI')} />
            <FileCard title={`Professional tax (${data.pt.state === 'TG' ? 'Telangana' : data.pt.state})`} what={data.formats.PT} errors={errors('PT')}
              lines={[...data.pt.slabs.map((s) => `${s.words}: ${s.employees} × ₹${s.rate}${s.deducted != null ? ` = ${rupees(s.deducted)}` : ''}`), `Due ${data.pt.dueDate}`]}
              button="Download PT return figures" busy={busy === 'PT'} disabled={!pay || !!busy} onClick={() => void download('PT')} />
          </Box>

          <SectionCard
            title={`Check before filing (${data.validation.length})`}
            subtitle={data.validation.length ? undefined : 'Nothing found.'}
            actions={(
              <TextField select size="small" label="Show" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} SelectProps={{ native: true }} sx={{ minWidth: 110 }}>
                {['ALL', 'PF', 'ESI', 'PT'].map((k) => <option key={k} value={k}>{k === 'ALL' ? 'All' : k}</option>)}
              </TextField>
            )}
          >
            {checks.map((v, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.5 }}>
                <ToneBadge tone={LEVEL_TONE[v.level]} label={`${v.kind} · ${v.level.toLowerCase()}`} noIcon />
                <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{v.what}</Typography>
              </Box>
            ))}
          </SectionCard>

          {pay && data.pf.rows.length > 0 && (
            <SectionCard title={`PF members (${data.pf.rows.length})`}>
              {data.pf.rows.map((r) => (
                <Box key={r.employee.id} sx={rowSx}>
                  <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{r.employee.name} · {r.uan ?? 'no UAN'}</Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>
                    gross {rupees(r.grossWages)} · EPF {rupees(r.epfWages)} · EE {rupees(r.epfEe)} · EPS {rupees(r.eps)} · ER {rupees(r.epfDiff)} · NCP {r.ncpDays}{r.ncpFrom === 'ATTENDANCE' ? ' (attendance)' : ''}
                  </Typography>
                </Box>
              ))}
            </SectionCard>
          )}
          {pay && data.esi.rows.length > 0 && (
            <SectionCard title={`ESI insured persons (${data.esi.rows.length})`}>
              {data.esi.rows.map((r) => (
                <Box key={r.employee.id} sx={rowSx}>
                  <Typography sx={{ flex: '1 1 200px', fontSize: 13 }}>{r.employee.name} · {r.ip ?? 'no IP number'}</Typography>
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.days} days · wages {rupees(r.wages)}{r.days === 0 ? ` · reason ${r.reason} (${r.reasonWords})` : ''}{r.lastWorkingDay ? ` · last day ${r.lastWorkingDay}` : ''}
                  </Typography>
                </Box>
              ))}
            </SectionCard>
          )}
        </Stack>
      )}
    </Box>
  );
}

function FileCard({ title, what, errors, lines, button, busy, disabled, onClick }: {
  title: string; what: { name: string; rules: string; source: string; verified?: boolean }; errors: number; lines: string[];
  button: string; busy: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <SectionCard title={title} subtitle={what.name}>
      <Stack spacing={0.75}>
        {errors > 0 && <ToneBadge tone="danger" label={`${errors} to fix`} noIcon />}
        {lines.map((l, i) => <Typography key={i} sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{l}</Typography>)}
        <Button variant="contained" size="small" disabled={disabled} onClick={onClick} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined} sx={{ alignSelf: 'flex-start' }}>{button}</Button>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{what.rules}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>Source: {what.source}{what.verified === false ? ' (not read on the official site — check)' : ''}</Typography>
      </Stack>
    </SectionCard>
  );
}
