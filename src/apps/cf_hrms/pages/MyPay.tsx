/**
 * My pay (CF_HRMS_HIRING_SPEC.md §25.2) — my own salary and my payslips.
 *
 *   Salary breakdown  CTC a year and a month, from when, the structure, each
 *                     component a month and a year, a revision coming up, and
 *                     every salary before.
 *   Payslips          each released month, its net pay, the PDF.
 *
 * Like My leave it stands alone: a shop-floor login may have only these
 * screens, so it imports `myPayApi` only — no employee id anywhere — and links
 * to no HR screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Tab, Tabs, Typography } from '@mui/material';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import {
  Callout, DetailSkeleton, EmptyState, ErrorNotice, PageHeader, SectionCard, errorMessage, useToast,
} from '@shared/ui';
import { myPayApi, type MyPay as MyPayData, type MyPayslip, type MySalary } from '../api/payroll';
import { saveBase64File } from '../api/excel';
import { BreakdownTable, Fact } from '../components/payroll/PayParts';
import { PF_MODE_WORD, rupees, stampDay } from '../components/payroll/payWords';
import { longDay } from '../components/jobDates';

function SalaryBlock({ s }: { s: MySalary }) {
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1.5 }}>
        <Fact label="CTC a year">{rupees(s.annualCtc)}</Fact>
        <Fact label="CTC a month">{rupees(s.monthlyCtc)}</Fact>
        <Fact label="From">{longDay(s.effectiveFrom)}</Fact>
        {s.structureName && <Fact label="Structure">{s.structureName}</Fact>}
        <Fact label="PF">{PF_MODE_WORD[s.pfMode] ?? s.pfMode}</Fact>
      </Box>
      <BreakdownTable lines={s.lines} totals={s.totals} monthlyCtc={s.monthlyCtc} annualCtc={s.annualCtc} />
      {s.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{s.note}</Typography>}
    </Stack>
  );
}

export default function MyPay() {
  const toast = useToast();
  const [tab, setTab] = useState<'salary' | 'payslips'>('salary');
  const [data, setData] = useState<MyPayData | null>(null);
  const [slips, setSlips] = useState<MyPayslip[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [slipError, setSlipError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    myPayApi.pay()
      .then((d) => { setData(d); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
    myPayApi.payslips()
      .then((r) => { setSlips(r.payslips); setSlipError(null); })
      .catch(setSlipError);
  }, []);
  useEffect(load, [load]);

  const download = async (p: MyPayslip) => {
    setDownloading(p.id);
    try {
      saveBase64File(await myPayApi.payslipFile(p.id));
    } catch (e) {
      toast.error(errorMessage(e, 'The payslip could not be downloaded. Try again.'));
    } finally {
      setDownloading(null);
    }
  };

  if (loading && !data) return <DetailSkeleton />;

  // Not an error: a login that was never linked to an employee (403 NOT_LINKED).
  const notLinked = (error as { code?: string } | null)?.code === 'NOT_LINKED';
  if (!data) {
    return (
      <>
        <PageHeader title="My pay" />
        {notLinked ? (
          <EmptyState
            icon={<BadgeRounded sx={{ fontSize: 34 }} />}
            title="This login is not connected to an employee record"
            hint={errorMessage(error) || 'An HR administrator can connect it on your employee record.'}
          />
        ) : <ErrorNotice error={error} fallback="Could not load your pay." onRetry={load} />}
      </>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <PageHeader title="My pay" subtitle={`${data.employee.name} · ${data.employee.code}`} />
      <Tabs value={tab} onChange={(_, v) => setTab(v as 'salary' | 'payslips')} sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }} variant="scrollable" allowScrollButtonsMobile>
        <Tab value="salary" label="Salary breakdown" />
        <Tab value="payslips" label={`Payslips${slips?.length ? ` (${slips.length})` : ''}`} />
      </Tabs>

      {tab === 'salary' && (
        <Stack spacing={2}>
          {data.upcoming && (
            <Callout tone="info" title={`A new salary starts ${longDay(data.upcoming.effectiveFrom)}`}>
              {rupees(data.upcoming.annualCtc)} a year ({rupees(data.upcoming.monthlyCtc)} a month).
            </Callout>
          )}
          {data.salary ? (
            <SectionCard title="Your salary today">
              <SalaryBlock s={data.salary} />
            </SectionCard>
          ) : data.upcoming ? (
            <SectionCard title="Your salary" subtitle={`It starts ${longDay(data.upcoming.effectiveFrom)}.`}>
              <SalaryBlock s={data.upcoming} />
            </SectionCard>
          ) : (
            <EmptyState icon={<PaymentsOutlined sx={{ fontSize: 34 }} />} title="No salary is on file yet — ask HR" />
          )}
          {data.salary && data.upcoming && (
            <SectionCard title="The new salary" subtitle={`From ${longDay(data.upcoming.effectiveFrom)}.`}>
              <SalaryBlock s={data.upcoming} />
            </SectionCard>
          )}
          {data.history.length > 1 && (
            <SectionCard title="History" subtitle="Every salary, newest first.">
              <Box>
                {data.history.map((h) => (
                  <Box key={h.effectiveFrom} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{rupees(h.annualCtc)} a year</Typography>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                        {longDay(h.effectiveFrom)} – {h.effectiveTo ? longDay(h.effectiveTo) : 'onwards'}{h.reason ? ` · ${h.reason}` : ''}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', fontVariantNumeric: 'tabular-nums' }}>{rupees(h.monthlyCtc)} a month</Typography>
                  </Box>
                ))}
              </Box>
            </SectionCard>
          )}
        </Stack>
      )}

      {tab === 'payslips' && (
        <>
          <ErrorNotice error={slipError} onRetry={load} sx={{ mb: 2 }} />
          {slips && slips.length === 0 && (
            <EmptyState icon={<ReceiptLongOutlined sx={{ fontSize: 34 }} />} title="No payslips yet" hint="A payslip shows here once HR releases the month’s payroll." />
          )}
          {slips && slips.length > 0 && (
            <SectionCard title="Your payslips" subtitle="Newest first.">
              <Box>
                {slips.map((p) => (
                  <Box key={p.id} data-payslip={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', py: 1, borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 } }}>
                    <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.label}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                        Net pay {rupees(p.net)}{p.releasedAt ? ` · released ${stampDay(p.releasedAt)}` : ''}
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small" disabled={downloading != null} onClick={() => void download(p)}
                      startIcon={downloading === p.id ? <CircularProgress size={14} color="inherit" /> : <PictureAsPdfOutlined fontSize="small" />}>
                      Download PDF
                    </Button>
                  </Box>
                ))}
              </Box>
            </SectionCard>
          )}
        </>
      )}
    </Box>
  );
}
