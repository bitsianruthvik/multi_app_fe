/**
 * Tax › Challans (CF_HRMS_HIRING_SPEC.md §25.4) — month by month: the TDS the locked payroll
 * deducted, the deposits made for it (challan serial, BSR code, date, amounts), and a warning when
 * a month is not paid by its due date (the 7th of the next month; March by 30 April).
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Callout, ConfirmDialog, ErrorNotice, FormDialog, ListSkeleton, PageHeader, StatStrip, ToneBadge, useToast } from '@shared/ui';
import { taxApi, type Challan, type ChallanMonth, type Challans } from '../api/tax';
import { TaxBanner, YearSelect } from '../components/tax/TaxParts';
import { CHALLAN_STATUS, useTaxYears } from '../components/tax/taxWords';
import { rupees, parseAmount } from '../components/payroll/payWords';
import { useCan } from '../access/can';

type Draft = { id: number | null; month: string; challanSerial: string; bsrCode: string; depositDate: string; tax: string; interest: string; fee: string; others: string; minorHead: string; note: string };

export default function TaxChallans() {
  const toast = useToast();
  const can = useCan();
  const { years, year, setYear } = useTaxYears();
  const [data, setData] = useState<Challans | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Challan | null>(null);
  const load = useCallback(() => { if (year) taxApi.challans(year).then((d) => { setData(d); setError(null); }).catch(setError); }, [year]);
  useEffect(load, [load]);
  const today = new Date().toISOString().slice(0, 10);
  const newFor = (m: ChallanMonth): Draft => ({ id: null, month: m.month, challanSerial: '', bsrCode: '', depositDate: today, tax: String(Math.max(0, m.balance)), interest: '', fee: '', others: '', minorHead: '200', note: '' });

  return (
    <Box>
      <PageHeader title="Challans" subtitle="The TDS deducted each month and the deposits that paid it." actions={<YearSelect value={year} years={years} onChange={setYear} />} />
      <TaxBanner review={data?.review} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {data && (
        <>
          <StatStrip stats={[
            { label: 'TDS deducted', value: data.totals.deducted, display: rupees(data.totals.deducted) },
            { label: 'Deposited', value: data.totals.deposited, display: rupees(data.totals.deposited) },
            { label: 'Months not paid in time', value: data.months.filter((m) => m.overdue).length, tone: 'danger' },
          ]} />
          {data.warnings.length > 0 && <Callout tone="danger" title="To pay" sx={{ mt: 2 }}>{data.warnings.map((w, i) => <Typography key={i} sx={{ fontSize: 13 }}>{w}</Typography>)}</Callout>}
        </>
      )}
      {!data && !error && <ListSkeleton />}
      <Stack spacing={1} sx={{ mt: 2 }}>
        {data?.months.map((m) => (
          <Box key={m.month} data-month={m.month} sx={{ p: 1.25, border: '1px solid var(--c-divider)', borderRadius: 1.5, borderColor: m.overdue ? 'var(--c-danger, #d32f2f)' : 'var(--c-divider)' }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Typography sx={{ flex: '1 1 160px', fontSize: 14, fontWeight: 600 }}>{m.label}</Typography>
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>deducted {rupees(m.deducted)} · paid {rupees(m.deposited)} · due {m.due}</Typography>
              <ToneBadge tone={CHALLAN_STATUS[m.status].tone} label={CHALLAN_STATUS[m.status].label} noIcon />
              {can.payroll.edit && (m.deducted > 0 || m.challans.length > 0) && <Button size="small" variant="outlined" onClick={() => setDraft(newFor(m))}>Record a deposit</Button>}
            </Box>
            {m.challans.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mt: 0.75, pl: { xs: 0, sm: 2 } }}>
                <Typography sx={{ flex: '1 1 220px', fontSize: 12.5 }}>Challan {c.challanSerial} · BSR {c.bsrCode} · {c.depositDate}{c.depositDate > m.due ? ' (late)' : ''}</Typography>
                <Typography sx={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{rupees(c.total)}{c.interest ? ` (interest ${rupees(c.interest)})` : ''}</Typography>
                {can.payroll.edit && <Button size="small" onClick={() => setDraft({ id: c.id, month: c.month, challanSerial: c.challanSerial, bsrCode: c.bsrCode, depositDate: c.depositDate, tax: String(c.tax), interest: String(c.interest || ''), fee: String(c.fee || ''), others: String(c.others || ''), minorHead: c.minorHead, note: c.note ?? '' })}>Change</Button>}
                {can.payroll.remove && <Button size="small" color="error" onClick={() => setRemoving(c)}>Remove</Button>}
              </Box>
            ))}
          </Box>
        ))}
      </Stack>
      <FormDialog
        open={!!draft}
        title={draft?.id ? 'Change the deposit' : 'Record a deposit'}
        subtitle={draft ? `TDS of ${draft.month}` : undefined}
        onClose={() => setDraft(null)}
        onSubmit={async () => {
          if (!draft) return;
          const body = { month: draft.month, challanSerial: draft.challanSerial, bsrCode: draft.bsrCode, depositDate: draft.depositDate, tax: parseAmount(draft.tax) ?? draft.tax, interest: parseAmount(draft.interest) ?? 0, fee: parseAmount(draft.fee) ?? 0, others: parseAmount(draft.others) ?? 0, minorHead: draft.minorHead, note: draft.note || null };
          if (draft.id) await taxApi.updateChallan(draft.id, body); else await taxApi.addChallan(year, body);
          toast.success('Saved.');
          load();
        }}
      >
        {draft && (
          <Stack spacing={1.5}>
            <TextField size="small" label="Challan serial number" value={draft.challanSerial} onChange={(e) => setDraft({ ...draft, challanSerial: e.target.value })} inputProps={{ inputMode: 'numeric', maxLength: 5 }} />
            <TextField size="small" label="BSR code (7 digits)" value={draft.bsrCode} onChange={(e) => setDraft({ ...draft, bsrCode: e.target.value })} inputProps={{ inputMode: 'numeric', maxLength: 7 }} />
            <TextField size="small" type="date" label="Date of deposit" InputLabelProps={{ shrink: true }} value={draft.depositDate} onChange={(e) => setDraft({ ...draft, depositDate: e.target.value })} />
            <TextField size="small" label="Tax (₹)" value={draft.tax} onChange={(e) => setDraft({ ...draft, tax: e.target.value })} helperText="Filled with what is still to pay for the month." inputProps={{ inputMode: 'decimal' }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              <TextField size="small" label="Interest" value={draft.interest} onChange={(e) => setDraft({ ...draft, interest: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
              <TextField size="small" label="Fee" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
              <TextField size="small" label="Others" value={draft.others} onChange={(e) => setDraft({ ...draft, others: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
            </Box>
            <TextField select size="small" label="Minor head" value={draft.minorHead} onChange={(e) => setDraft({ ...draft, minorHead: e.target.value })}>
              <MenuItem value="200">200 — TDS payable by the deductor</MenuItem>
              <MenuItem value="400">400 — regular assessment</MenuItem>
            </TextField>
            <TextField size="small" label="Note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </Stack>
        )}
      </FormDialog>
      <ConfirmDialog open={!!removing} title="Remove this deposit?" body={removing ? `Challan ${removing.challanSerial}, ${rupees(removing.total)}.` : ''} confirmLabel="Remove" danger
        onClose={() => setRemoving(null)} onConfirm={async () => { if (removing) { await taxApi.removeChallan(removing.id); setRemoving(null); load(); } }} />
    </Box>
  );
}
