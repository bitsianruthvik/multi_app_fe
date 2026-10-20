/**
 * Payroll › Claims (payroll P3b) — reimbursements and flexible benefits people asked for with bills.
 *
 *   Waiting   with the manager or with HR: HR may approve (an amount that may be lower, with a note) or reject
 *   Approved  pays in the next payroll run as a reimbursement line; may be taken back until that run is locked
 *   Paid      the run that took it was marked paid
 *   All       everything, rejected and withdrawn too
 *
 * A claim opens in a side sheet with its bills (each a download), the type's yearly limit and what is used of
 * it. HR never decides their own claim — the server refuses it in words. Amounts need the named pay view.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import {
  DetailSkeleton, EmptyState, ErrorNotice, ListSkeleton, PageHeader, SideSheet, Surface, errorMessage, useToast,
} from '@shared/ui';
import { useCan } from '../access/can';
import { claimsApi, type Claim, type ClaimContext } from '../api/payrollExit';
import { ClaimFacts, ClaimStatusBadge } from '../components/payroll/ClaimParts';
import { NeedPayView } from '../components/payroll/PayParts';
import { parseAmount, rupees } from '../components/payroll/payWords';
import { longDay } from '../components/jobDates';

type TabKey = 'WAITING' | 'APPROVED' | 'PAID' | 'ALL';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'WAITING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PAID', label: 'Paid' },
  { key: 'ALL', label: 'All' },
];

export default function PayrollClaims() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Claims" /><NeedPayView what="Claims" /></> : <DetailSkeleton />;
  return <ClaimsPage />;
}

function ClaimsPage() {
  const { company = '' } = useParams<{ company: string }>();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const raw = (params.get('tab') ?? 'waiting').toUpperCase();
  const tab: TabKey = (TABS.some((t) => t.key === raw) ? raw : 'WAITING') as TabKey;
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ claims: Claim[]; counts: Record<string, number> } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    claimsApi.list({ status: tab, q: q.trim() || undefined })
      .then((d) => { setData(d); setError(null); })
      .catch(setError);
  }, [tab, q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const c = data?.counts ?? {};
  const waiting = (c.SUBMITTED ?? 0) + (c.RECOMMENDED ?? 0);
  const countOf = (k: TabKey) => (k === 'WAITING' ? waiting : k === 'ALL' ? null : c[k] ?? 0);

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <PageHeader
        title="Claims"
        subtitle="Bills people asked to be paid back. An approved claim pays in the next payroll run."
        actions={can.payroll.view ? <Button component={RouterLink} to={`/${company}/cf_hrms/payroll-claim-types`} variant="outlined">Claim types and policy</Button> : undefined}
      />
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => {
          setData(null);
          setParams((prev) => {
            const next = new URLSearchParams(prev);
            if (v === 'WAITING') next.delete('tab'); else next.set('tab', v.toLowerCase());
            return next;
          }, { replace: true });
        }}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }}
      >
        {TABS.map((t) => {
          const n = countOf(t.key);
          return <Tab key={t.key} value={t.key} label={n ? `${t.label} (${n})` : t.label} />;
        })}
      </Tabs>
      <TextField size="small" label="Find a person" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2, width: '100%', maxWidth: 320 }} />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!data && !error && <ListSkeleton rows={4} />}
      {data && data.claims.length === 0 && (
        <EmptyState
          icon={<ReceiptLongOutlined />}
          title={tab === 'WAITING' ? 'No claims waiting' : 'No claims here'}
          hint={tab === 'WAITING' ? 'People claim from My pay › Claims, with their bills. Their claims show up here.' : 'Try another tab, or clear the search.'}
        />
      )}
      {data && data.claims.length > 0 && (
        <Surface e={1} sx={{ overflow: 'hidden' }} data-claims-list={tab}>
          {data.claims.map((cl) => <ClaimRow key={cl.id} claim={cl} onOpen={() => setOpen(cl.id)} />)}
        </Surface>
      )}
      <ClaimSheet id={open} canDecide={can.payroll.edit} onClose={() => setOpen(null)} onChanged={load} />
    </Box>
  );
}

function ClaimRow({ claim: c, onOpen }: { claim: Claim; onOpen: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onOpen}
      data-claim-row={c.id}
      sx={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer', width: '100%',
        display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 2, py: 1.5, flexWrap: 'wrap',
        borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
        '&:hover, &:focus-visible': { background: 'var(--c-surface-2)' },
      }}
    >
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.employee.name} <Box component="span" sx={{ fontWeight: 400, fontSize: 12.5, color: 'var(--c-text-3)' }}>{c.employee.code}</Box></Typography>
        <Typography sx={{ fontSize: 13.5, overflowWrap: 'anywhere' }}>
          {c.type.name} · bill of {longDay(c.billDate)}{c.bills.length ? ` · ${c.bills.length} bill${c.bills.length === 1 ? '' : 's'}` : ''}
        </Typography>
      </Box>
      <Stack spacing={0.5} sx={{ alignItems: 'flex-end', flexShrink: 0, ml: 'auto' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {rupees(c.approvedAmount ?? c.amount)}
        </Typography>
        <ClaimStatusBadge claim={c} />
      </Stack>
    </Box>
  );
}

const OPEN_STATUSES = ['SUBMITTED', 'RECOMMENDED'];

function ClaimSheet({ id, canDecide, onClose, onChanged }: { id: number | null; canDecide: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ claim: Claim; context: ClaimContext } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id == null) return undefined;
    let live = true;
    setData(null); setError(null); setNote(''); setAmount('');
    claimsApi.get(id).then((d) => { if (live) { setData(d); setAmount(String(d.claim.amount)); } }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [id]);

  const c = data?.claim;
  const decidable = !!c && canDecide && OPEN_STATUSES.includes(c.status);
  const reopenable = !!c && canDecide && c.status === 'APPROVED';
  const typed = parseAmount(amount);
  const lower = c != null && typed != null && Number.isFinite(typed) && typed < c.amount;

  const act = async (verdict: 'approve' | 'reject' | 'reopen') => {
    if (!c) return;
    if (verdict === 'reject' && !note.trim()) { toast.error('Write why it is rejected.'); return; }
    if (verdict === 'approve') {
      if (typed == null || !Number.isFinite(typed) || typed <= 0) { toast.error('Type the amount to approve.'); return; }
      if (typed > c.amount) { toast.error(`At most what was claimed (${rupees(c.amount)}).`); return; }
      if (lower && !note.trim()) { toast.error('Write why less is approved than was claimed.'); return; }
    }
    setBusy(true);
    try {
      if (verdict === 'approve') {
        const r = await claimsApi.approve(c.id, { amount: typed ?? undefined, note: note.trim() || undefined });
        toast.success(`Approved ${rupees(r.claim.approvedAmount ?? typed)}${r.claim.payMonthLabel ? ` — pays in the ${r.claim.payMonthLabel} payroll` : ''}.`);
      } else if (verdict === 'reject') {
        await claimsApi.reject(c.id, note.trim());
        toast.success('Rejected.');
      } else {
        await claimsApi.reopen(c.id, note.trim() || undefined);
        toast.success('Approval taken back. The claim is waiting again.');
      }
      onChanged();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideSheet
      open={id != null}
      onClose={onClose}
      width={520}
      title={c ? `${c.type.name} — ${rupees(c.amount)}` : 'Claim'}
      subtitle={c ? `${c.employee.name} · ${c.employee.code}` : undefined}
      actions={decidable ? (
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Button color="error" variant="outlined" disabled={busy} onClick={() => void act('reject')} data-action="reject-claim">Reject</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" disabled={busy} onClick={() => void act('approve')} data-action="approve-claim">
            {lower ? `Approve ${rupees(typed)}` : 'Approve'}
          </Button>
        </Box>
      ) : reopenable ? (
        <Button variant="outlined" disabled={busy} onClick={() => void act('reopen')} data-action="reopen-claim">Take approval back</Button>
      ) : undefined}
    >
      <ErrorNotice error={error} />
      {!data && !error && <DetailSkeleton />}
      {c && data && (
        <Stack spacing={2}>
          <ClaimFacts claim={c} context={data.context} loadBill={(fileId) => claimsApi.bill(c.id, fileId)} />
          {c.type.taxRule && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>Tax: {c.type.taxRule}</Typography>}
          {decidable && (
            <Stack spacing={1.5}>
              {c.withManager && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>The manager has not looked at it yet. You may still decide.</Typography>}
              <TextField
                size="small"
                label="Amount to approve"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[₹,\s]/g, ''))}
                inputProps={{ inputMode: 'decimal' }}
                helperText={`Claimed ${rupees(c.amount)}. Approve less if part of it is not allowed — then say why.`}
                data-field="claim-amount"
              />
              <TextField label={lower ? 'Note (needed: why less)' : 'Note (needed to reject)'} multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} data-field="claim-note" />
            </Stack>
          )}
          {reopenable && (
            <TextField label="Why take it back (optional)" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} helperText="Possible until the payroll that pays it is locked." />
          )}
        </Stack>
      )}
    </SideSheet>
  );
}
