import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, TextField, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import { useAuth } from '@core/contexts/AuthContext';
import { CfApiError } from '../api/client';
import {
  decideApproval, listApprovals, type AcceptanceContext, type Approval, type ApprovalList, type ApprovalType, type PoContext,
} from '../api/approvals';
import { useCompanySlug } from '../hooks/useLoad';
import { useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { appPath } from '../navMeta';
import { rupeeText } from '../lib/money';
import { triggerWords } from '../lib/acceptance';
import { Badge, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, SectionCard } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DialogHeader } from '../components/FormDialog';
import { useToast } from '../components/toastContext';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };
const th = { px: 0.75, py: 0.5, fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--c-text-3)', textAlign: 'left', borderBottom: '1px solid var(--c-divider)' } as const;
const td = { px: 0.75, py: 0.5, fontSize: 13, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'top' } as const;
const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function Table({ head, rows, testId }: { head: string[]; rows: ReactNode[][]; testId: string }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box component="table" data-testid={testId} sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
        <thead><tr>{head.map((h) => <Box component="th" key={h} sx={th}>{h}</Box>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <Box component="td" key={k} sx={td}>{c ?? '—'}</Box>)}</tr>)}</tbody>
      </Box>
    </Box>
  );
}

/** A purchase order's context: the vendor, its lines and rates, and how each compares with the other quotes on its PR. */
function PoBody({ ctx, closeShort }: { ctx: PoContext; closeShort: boolean }) {
  const company = useCompanySlug();
  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography sx={{ fontSize: 13 }}>
        <Mono chip><Box component={Link} to={appPath(company, `purchase-orders/${ctx.purchaseOrder.id}`)} sx={linkSx}>{ctx.purchaseOrder.code}</Box></Mono>
        {' '}to <strong>{ctx.vendor?.name ?? '—'}</strong>{ctx.purchaseOrder.forOrder ? <> for <Mono>{ctx.purchaseOrder.forOrder.code}</Mono></> : null}
        {ctx.purchaseOrder.expectedDate ? ` · expected ${ctx.purchaseOrder.expectedDate}` : ''}
      </Typography>
      {closeShort && ctx.reason && <Typography sx={{ fontSize: 13 }}>Reason: <strong>{ctx.reason}</strong> · {rupeeText(ctx.pendingAmount)} would not come.</Typography>}
      <Table testId="approval-po-lines"
        head={closeShort ? ['Material', 'Ordered', 'Received', 'Pending', 'Rate'] : ['Material', 'Quantity', 'Rate', 'Amount', 'Other quotes on its PR', 'Compared']}
        rows={ctx.lines.map((l) => (closeShort
          ? [`${l.item.code ?? ''} ${l.item.name ?? ''}`, `${l.quantity} ${l.item.uom ?? ''}`, l.received, l.pending, l.rate == null ? '—' : rupeeText(l.rate, 2)]
          : [`${l.item.code ?? ''} ${l.item.name ?? ''}`, `${l.quantity} ${l.item.uom ?? ''}`, l.rate == null ? '—' : rupeeText(l.rate, 2), l.amount == null ? '—' : rupeeText(l.amount),
            l.quotes.filter((q) => !q.thisVendor).map((q) => `${q.supplier.name} ${rupeeText(q.rate, 2)}${q.deliveryDays != null ? ` · ${q.deliveryDays} d` : ''}`).join('; ') || 'none',
            l.comparison]))} />
    </Box>
  );
}

/** An acceptance's context: charges, milestones, stages, and the estimated value / margin; for a rate change, what changed. */
function AcceptanceBody({ ctx }: { ctx: AcceptanceContext }) {
  const company = useCompanySlug();
  const e = ctx.estimate;
  const stageName = (k: string) => ctx.terms.stages?.find((s) => s.key === k)?.name ?? null;
  const msName = (k: string) => ctx.terms.milestones?.find((m) => m.key === k)?.label ?? null;
  const opName = (id: number) => ctx.terms.charges.find((c) => c.operationId === id)?.operation ?? null;
  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      <Typography sx={{ fontSize: 13 }}>
        <Mono chip><Box component={Link} to={appPath(company, `orders/${ctx.order.id}?tab=acceptance`)} sx={linkSx}>{ctx.order.code}</Box></Mono>
        {ctx.order.customer ? ` · ${ctx.order.customer}` : ''}{ctx.order.committedDate ? ` · committed ${ctx.order.committedDate}` : ''} · version {ctx.version}
      </Typography>
      {ctx.changes.length > 0 && (
        <Box data-testid="approval-changes" sx={{ p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', fontSize: 13 }}>
          <strong>What changes:</strong> {ctx.changes.join(' ')}
        </Box>
      )}
      {e && (
        <Typography sx={{ fontSize: 13.5 }} data-testid="approval-estimate">
          Estimated value <strong>{rupeeText(e.value)}</strong>
          {e.marginOverMaterial != null ? <> · margin over material <strong>{rupeeText(e.marginOverMaterial)}</strong>{e.marginPct != null ? ` (${e.marginPct} %)` : ''}</> : ' · material cost not known yet'}
          {ctx.approvedBefore?.estimate ? ` · was ${rupeeText(ctx.approvedBefore.estimate.value)}` : ''} · {e.tonnes} t
        </Typography>
      )}
      <Table testId="approval-charges" head={['Charge', 'Operation', 'Basis', 'Rate', 'Billed', 'Amount']}
        rows={[
          ...ctx.terms.charges.map((c) => {
            const est = e?.charges.find((x) => x.key === c.key);
            return [c.label, c.operation, c.basis?.type === 'formula' ? `${c.basis.expression} (${c.basis.unit})` : c.basis?.weight === 'actual' ? 'Actual weight' : 'Weight as per drawing',
              c.rate == null ? '—' : `${rupeeText(c.rate, 2)} / ${c.basis?.type === 'formula' ? c.basis.unit : 't'}`, c.billing === 'pro_rata' ? 'Pro-rata' : 'On completion', est?.amount == null ? '—' : rupeeText(est.amount)];
          }),
          ...(ctx.terms.material ? [['Material', 'Lines we buy', ctx.terms.material.weight === 'actual' ? 'Actual weight' : 'Weight as per drawing', `${rupeeText(ctx.terms.material.rate ?? 0, 2)} / t`, '', e?.material ? rupeeText(e.material.amount) : '—']] : []),
          ...(ctx.terms.lumpSums ?? []).map((l) => [l.label, 'Lump sum', '', '', '', rupeeText(l.amount ?? 0)]),
        ]} />
      <Table testId="approval-milestones" head={['Milestone', 'Share', 'When', 'Credit days', 'Amount']}
        rows={(ctx.terms.milestones ?? []).map((m) => [m.label, m.kind === 'percent' ? `${m.value} %` : rupeeText(m.value ?? 0),
          `${triggerWords(m.trigger, { operation: opName, stage: stageName, milestone: msName })}${m.proRata ? ' (pro-rata)' : ''}`, m.creditDays,
          e?.milestones.find((x) => x.key === m.key)?.amount == null ? '—' : rupeeText(e?.milestones.find((x) => x.key === m.key)?.amount ?? 0)])} />
      {(ctx.terms.stages ?? []).length > 0 && (
        <Typography sx={{ fontSize: 13 }} data-testid="approval-stages">Post-production: {ctx.terms.stages.map((s, i) => `${i + 1}. ${s.name}`).join(' · ')}</Typography>
      )}
      {ctx.note && <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Note: {ctx.note}</Typography>}
    </Box>
  );
}

function ApprovalCard({ a, me, onDecide }: { a: Approval; me: number | null; onDecide: (a: Approval, d: 'approve' | 'reject') => void }) {
  const pending = a.status === 'pending';
  const mine = !!me && a.requestedBy?.id === me;
  return (
    <SectionCard title={a.title}
      subtitle={`${a.requestedBy?.name ?? 'Someone'} asked ${when(a.requestedAt)}${a.amount != null ? ` · ${rupeeText(a.amount)}` : ''}${a.requestNote ? ` · “${a.requestNote}”` : ''}`}
      actions={(
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge family="info" noIcon label={a.typeLabel} />
          {!pending && <Badge family={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'neutral'} noIcon label={a.status} />}
          {pending && <>
            <Button size="small" color="error" variant="outlined" onClick={() => onDecide(a, 'reject')} data-testid="approval-reject">Send back</Button>
            <Button size="small" variant="contained" onClick={() => onDecide(a, 'approve')} data-testid="approval-approve">Approve</Button>
          </>}
        </Box>
      )}>
      <Box data-testid="approval-card" data-type={a.type} sx={{ display: 'grid', gap: 1 }}>
        {mine && pending && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>You asked for this one — somebody else in Management decides it (an admin may decide their own).</Typography>}
        {a.context?.kind === 'purchase_order' && <PoBody ctx={a.context as PoContext} closeShort={a.type === 'po_close_short'} />}
        {a.context?.kind === 'order_acceptance' && <AcceptanceBody ctx={a.context as AcceptanceContext} />}
        {!a.context && a.summary && <Typography sx={{ fontSize: 13 }}>{a.summary}</Typography>}
        {!pending && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{a.status} {when(a.decidedAt)}{a.decidedBy?.name ? ` by ${a.decidedBy.name}` : ''}{a.decisionNote ? ` — ${a.decisionNote}` : ''}</Typography>}
      </Box>
    </SectionCard>
  );
}

/**
 * MANAGEMENT › APPROVALS (§73): ONE inbox of everything that waits for Management — customer acceptances, rate changes,
 * purchase orders, contractor POs, closing a PO short — each with what is asked, by whom, the amounts and what changes.
 * A person sees only the types they approve. Approve, or send back with a reason.
 */
export default function Approvals() {
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useUrlParam('status', 'pending');
  const [type, setType] = useUrlParam('type', '');
  const [data, setData] = useState<ApprovalList | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [asking, setAsking] = useState<{ a: Approval; d: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [decideError, setDecideError] = useState<CfApiError | null>(null);
  const want = status === 'decided' ? 'decided' : 'pending';
  const load = useCallback(() => {
    setError(null);
    listApprovals({ status: want, type: (type || '') as ApprovalType | '' }).then(setData).catch((e) => setError(e as CfApiError));
  }, [want, type]);
  useEffect(() => { setData(null); load(); }, [load]);
  const decide = async () => {
    if (!asking) return;
    setBusy(true); setDecideError(null);
    try {
      await decideApproval(asking.a.id, asking.d, note.trim() || undefined);
      toast.success(asking.d === 'approve' ? 'Approved.' : 'Sent back.');
      setAsking(null); setNote('');
      invalidateNavCounts();
      load();
    } catch (e) { setDecideError(e as CfApiError); } finally { setBusy(false); }
  };
  const total = data ? Object.values(data.counts).reduce((s, n) => s + (n ?? 0), 0) : undefined;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, minWidth: 0 }}>
      <PageHeader title="Approvals" subtitle="Everything that waits for Management. You see the kinds you approve." />
      <FilterBar>
        <FacetChip label="Waiting" active={want === 'pending'} onClick={() => setStatus('pending')} count={total} />
        <FacetChip label="Decided" active={want === 'decided'} onClick={() => setStatus('decided')} />
        <Box sx={{ width: 12 }} />
        <FacetChip label="All kinds" active={!type} onClick={() => setType('')} />
        {(data?.types ?? []).map((t) => <FacetChip key={t.key} label={t.label} active={type === t.key} onClick={() => setType(t.key)} count={want === 'pending' ? data?.counts[t.key] : undefined} />)}
      </FilterBar>
      <ErrorNotice error={error} onRetry={load} />
      {!data && !error && <ListSkeleton rows={4} />}
      {data && !data.rows.length && <EmptyState icon={<FactCheckRounded />} title={want === 'pending' ? 'Nothing waits for you.' : 'Nothing decided yet.'} />}
      {data && data.rows.length > 0 && (
        <Box data-testid="approvals-list" sx={{ display: 'grid', gap: 1.25, minWidth: 0 }}>
          {data.rows.map((a) => <ApprovalCard key={a.id} a={a} me={user?.id ?? null} onDecide={(x, d) => { setAsking({ a: x, d }); setNote(''); setDecideError(null); }} />)}
        </Box>
      )}
      <Dialog open={!!asking} onClose={() => !busy && setAsking(null)} maxWidth="sm" fullWidth>
        <DialogHeader title={asking?.d === 'approve' ? 'Approve?' : 'Send back?'} subtitle={asking?.a.title} onClose={() => setAsking(null)} busy={busy} />
        <DialogContent>
          <ErrorNotice error={decideError} />
          <TextField fullWidth multiline minRows={2} sx={{ mt: 1 }} label={asking?.d === 'approve' ? 'Note (optional)' : 'Why — the person who asked reads it'} value={note} onChange={(e) => setNote(e.target.value)}
            inputProps={{ 'data-testid': 'approval-note' }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsking(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color={asking?.d === 'reject' ? 'error' : 'primary'} disabled={busy || (asking?.d === 'reject' && !note.trim())} onClick={() => void decide()} data-testid="approval-confirm">
            {asking?.d === 'approve' ? 'Approve' : 'Send back'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** MANAGEMENT › OVERVIEW — room for the dashboards to come (§73: "an empty Overview section is fine"). */
export function ManagementOverview() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
      <PageHeader title="Overview" subtitle="Management's dashboards come here." />
      <EmptyState icon={<FactCheckRounded />} title="Nothing here yet." hint="Approvals are on the Approvals screen." />
    </Box>
  );
}
