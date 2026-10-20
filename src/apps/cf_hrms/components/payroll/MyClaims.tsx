/**
 * My pay › Claims (payroll P3b) — what I may claim against bills this tax year (each type's limit, what is
 * used and what is left), a new claim with its bills, and my claims: where each one is, its bills, a bill
 * added while it waits, withdrawing it before a decision.
 *
 * Self only: myClaimsApi, no employee id anywhere. Bills are PDF, JPG or PNG, at most 10 MB each, read in the
 * browser as base64 (like My tax's proofs).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import AttachFileRounded from '@mui/icons-material/AttachFileRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import {
  ConfirmDialog, EmptyState, ErrorNotice, FormDialog, ListSkeleton, SectionCard, SideSheet, Surface, errorMessage, useToast,
} from '@shared/ui';
import { myClaimsApi, type Claim, type Journey, type MyClaimType } from '../../api/payrollExit';
import { readFileBase64 } from '../../api/excel';
import { longDay } from '../jobDates';
import { ClaimFacts, ClaimStatusBadge } from './ClaimParts';
import { parseAmount, rupees, sizeWord } from './payWords';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const OPEN = ['SUBMITTED', 'RECOMMENDED'];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Picked files → bills, refusing anything not a PDF / JPG / PNG or over 10 MB, in words. */
async function readBills(files: File[]): Promise<{ fileName: string; contentBase64: string; size: number }[]> {
  const out = [];
  for (const f of files) {
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) throw new Error(`${f.name}: only PDF, JPG or PNG.`);
    if (f.size > MAX_BYTES) throw new Error(`${f.name} is over 10 MB. Reduce it or split it.`);
    out.push({ fileName: f.name, contentBase64: await readFileBase64(f), size: f.size });
  }
  return out;
}

export function MyClaims() {
  const [data, setData] = useState<{ year: string; types: MyClaimType[]; claims: Claim[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    myClaimsApi.list().then((d) => { setData(d); setError(null); }).catch(setError);
  }, []);
  useEffect(load, [load]);

  const active = (data?.types ?? []).filter((t) => t.status === 'ACTIVE');
  const claim = data?.claims.find((c) => c.id === open) ?? null;

  if (!data) return error ? <ErrorNotice error={error} onRetry={load} /> : <ListSkeleton rows={3} />;

  return (
    <Stack spacing={2} data-my-claims="">
      <ErrorNotice error={error} onRetry={load} />
      {active.length === 0 ? (
        <EmptyState icon={<ReceiptLongOutlined sx={{ fontSize: 34 }} />} title="Nothing to claim" hint="Your company has no claim types yet. Ask HR." />
      ) : (
        <SectionCard
          title={`What you may claim in ${data.year}`}
          actions={<Button variant="contained" size="small" startIcon={<AddRounded />} onClick={() => setAdding(true)} data-action="new-claim">New claim</Button>}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 1.5 }}>
            {active.map((t) => (
              <Box key={t.id} sx={{ p: 1.5, border: '1px solid var(--c-divider)', borderRadius: 1.5, minWidth: 0 }} data-claim-type={t.code}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t.name}</Typography>
                <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                  {t.yearlyLimit != null ? `${rupees(t.used.left)} left of ${rupees(t.yearlyLimit)}` : 'No yearly limit'}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  Approved {rupees(t.used.approved)}{t.used.pending ? ` · waiting ${rupees(t.used.pending)}` : ''}
                </Typography>
                {t.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5, overflowWrap: 'anywhere' }}>{t.description}</Typography>}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}

      {data.claims.length === 0 ? (
        active.length > 0 && <EmptyState icon={<ReceiptLongOutlined sx={{ fontSize: 34 }} />} title="No claims yet" hint="Claim a bill with “New claim”. An approved claim is paid with your salary." />
      ) : (
        <SectionCard title="Your claims" subtitle="Newest first." flush>
          <Surface e={0}>
            {data.claims.map((c) => (
              <Box
                key={c.id}
                component="button"
                type="button"
                onClick={() => setOpen(c.id)}
                data-my-claim={c.id}
                sx={{
                  all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
                  display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', px: 2.5, py: 1.25,
                  borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
                  '&:hover, &:focus-visible': { background: 'var(--c-surface-2)' },
                }}
              >
                <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{c.type.name}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    Bill of {longDay(c.billDate)}{c.payMonthLabel ? ` · ${c.status === 'PAID' ? 'paid in' : 'pays in'} ${c.payMonthLabel}` : ''}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{rupees(c.approvedAmount ?? c.amount)}</Typography>
                <ClaimStatusBadge claim={c} />
              </Box>
            ))}
          </Surface>
        </SectionCard>
      )}

      {adding && <NewClaimDialog types={active} onClose={() => setAdding(false)} onSaved={load} />}
      <MyClaimSheet claim={claim} onClose={() => setOpen(null)} onChanged={load} />
    </Stack>
  );
}

/* ── one of my claims ─────────────────────────────────────────────────── */

function MyClaimSheet({ claim: c, onClose, onChanged }: { claim: Claim | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const waiting = !!c && OPEN.includes(c.status);

  const addBill = async (file: File | undefined) => {
    if (!c || !file) return;
    setBusy(true);
    try {
      const [b] = await readBills([file]);
      await myClaimsApi.addBill(c.id, { fileName: b.fileName, contentBase64: b.contentBase64 });
      toast.success('Bill added.');
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, 'The bill could not be added.'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <SideSheet
      open={!!c}
      onClose={onClose}
      width={500}
      title={c ? `${c.type.name} — ${rupees(c.amount)}` : 'Claim'}
      actions={waiting ? (
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Button color="error" disabled={busy} onClick={() => setWithdraw(true)} data-action="withdraw-claim">Withdraw</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined" disabled={busy} onClick={() => input.current?.click()} data-action="add-bill"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <AttachFileRounded />}>
            Add a bill
          </Button>
        </Box>
      ) : undefined}
    >
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => void addBill(e.target.files?.[0])} />
      {c && <ClaimFacts claim={c} loadBill={(fileId) => myClaimsApi.bill(c.id, fileId)} />}
      <ConfirmDialog
        open={withdraw}
        title="Withdraw this claim?"
        body="It is no longer looked at. You can claim the bill again later."
        confirmLabel="Withdraw"
        danger
        onClose={() => setWithdraw(false)}
        onConfirm={async () => {
          if (!c) return;
          await myClaimsApi.withdraw(c.id);
          toast.success('Withdrawn.');
          onChanged();
          onClose();
        }}
      />
    </SideSheet>
  );
}

/* ── a new claim ──────────────────────────────────────────────────────── */

function NewClaimDialog({ types, onClose, onSaved }: { types: MyClaimType[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [typeId, setTypeId] = useState<string>(types.length === 1 ? String(types[0].id) : '');
  const [billDate, setBillDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [journeys, setJourneys] = useState<Journey[]>([{ from: '', to: '', startDate: '', endDate: '', mode: '' }]);
  const [bills, setBills] = useState<{ fileName: string; contentBase64: string; size: number }[]>([]);
  const type = types.find((t) => String(t.id) === typeId) ?? null;
  const lta = type?.taxTreatment === 'LTA';

  const pick = async (files: FileList | null) => {
    try {
      const read = await readBills(Array.from(files ?? []));
      setBills((b) => [...b, ...read]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      if (input.current) input.current.value = '';
    }
  };
  const setJ = (i: number, patch: Partial<Journey>) => setJourneys((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j)));

  return (
    <FormDialog
      open
      title="New claim"
      subtitle="An approved claim is paid with your salary."
      submitLabel="Send claim"
      busyLabel="Sending…"
      maxWidth="sm"
      enterSubmits={false}
      submitDisabled={!type || !amount.trim() || !billDate}
      onClose={onClose}
      onSubmit={async () => {
        if (!type) throw new Error('Choose what you are claiming.');
        const n = parseAmount(amount);
        if (n == null || !Number.isFinite(n) || n <= 0) throw new Error('Type the amount of the bill.');
        if (type.billsNeeded && bills.length === 0) throw new Error('Attach the bill (PDF, JPG or PNG).');
        const js = lta
          ? journeys.filter((j) => j.from.trim() || j.to.trim() || j.startDate).map((j) => ({
            from: j.from.trim(), to: j.to.trim(), startDate: j.startDate, ...(j.endDate ? { endDate: j.endDate } : {}), ...(j.mode?.trim() ? { mode: j.mode.trim() } : {}),
          }))
          : undefined;
        if (lta && !js?.length) throw new Error('Add the journey: from, to and the date.');
        const r = await myClaimsApi.create({
          claimTypeId: type.id, billDate, amount: n, description: description.trim() || undefined, journeys: js,
          bills: bills.map((b) => ({ fileName: b.fileName, contentBase64: b.contentBase64 })),
        });
        toast.success(r.claim.withManager ? 'Sent — your manager looks at it first.' : 'Sent to HR.');
        onSaved();
      }}
    >
      <TextField select size="small" label="What for" value={typeId} onChange={(e) => setTypeId(e.target.value)} data-field="claim-type">
        {types.map((t) => (
          <MenuItem key={t.id} value={String(t.id)}>
            {t.name}{t.yearlyLimit != null ? ` — ${rupees(t.used.left)} left` : ''}
          </MenuItem>
        ))}
      </TextField>
      {type?.description && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: -1 }}>{type.description}</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
        <TextField size="small" type="date" label="Date of the bill" value={billDate} onChange={(e) => setBillDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" label="Amount" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[₹,\s]/g, ''))} inputProps={{ inputMode: 'decimal' }}
          helperText={type?.yearlyLimit != null ? `At most ${rupees(type.used.left)} left this year.` : undefined} data-field="claim-amount" />
      </Box>
      <TextField size="small" label="What it was for (optional)" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />

      {lta && (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>Journeys</Typography>
            <Button size="small" startIcon={<AddRounded />} onClick={() => setJourneys((js) => [...js, { from: '', to: '', startDate: '', endDate: '', mode: '' }])}>Add a journey</Button>
          </Box>
          <Stack spacing={1}>
            {journeys.map((j, i) => (
              <Box key={i} sx={{ p: 1, border: '1px solid var(--c-divider)', borderRadius: 1.5 }} data-journey={i}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 32px', gap: 0.75, alignItems: 'center', mb: 0.75 }}>
                  <TextField size="small" label="From" value={j.from} onChange={(e) => setJ(i, { from: e.target.value })} />
                  <TextField size="small" label="To" value={j.to} onChange={(e) => setJ(i, { to: e.target.value })} />
                  {journeys.length > 1 ? (
                    <Tooltip title="Remove"><IconButton size="small" onClick={() => setJourneys((js) => js.filter((_, k) => k !== i))}><CloseRounded fontSize="small" /></IconButton></Tooltip>
                  ) : <span />}
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 0.75 }}>
                  <TextField size="small" type="date" label="Going" value={j.startDate} onChange={(e) => setJ(i, { startDate: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" type="date" label="Back (optional)" value={j.endDate ?? ''} onChange={(e) => setJ(i, { endDate: e.target.value })} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" label="By (air, rail…)" value={j.mode ?? ''} onChange={(e) => setJ(i, { mode: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      <Box>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void pick(e.target.files)} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>Bills{type && !type.billsNeeded ? ' (optional)' : ''}</Typography>
          <Button size="small" variant="outlined" startIcon={<AttachFileRounded />} onClick={() => input.current?.click()} data-action="pick-bills">Attach</Button>
        </Box>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>PDF, JPG or PNG, at most 10 MB each.</Typography>
        {bills.map((b, i) => (
          <Box key={`${b.fileName}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}>{b.fileName} <Box component="span" sx={{ color: 'var(--c-text-3)' }}>· {sizeWord(b.size)}</Box></Typography>
            <Tooltip title="Remove"><IconButton size="small" onClick={() => setBills((bs) => bs.filter((_, k) => k !== i))}><CloseRounded fontSize="small" /></IconButton></Tooltip>
          </Box>
        ))}
      </Box>
    </FormDialog>
  );
}
