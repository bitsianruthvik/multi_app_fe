import { useEffect, useState } from 'react';
import { Box, Button, LinearProgress, TextField, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import BlockRounded from '@mui/icons-material/BlockRounded';
import { getWorkOrder, patchWorkOrder, setWorkOrderStatus } from '../api/production';
import { CfApiError } from '../api/client';
import type { WorkOrderStatus } from '../api/types';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { appPath } from '../navMeta';
import { DetailSkeleton, ErrorNotice, Fact, Mono, SectionCard } from '../components/ui';
import { DetailHeader, DetailLayout } from '../components/DetailLayout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WorkOrderStatusBadge } from '../components/Production/workOrderUi';
import { useDetailTitle } from '../components/shell/detailTitle';
import { useToast } from '../components/toastContext';

/** The one forward step from each state, and what to call it. */
const NEXT: Partial<Record<WorkOrderStatus, { to: WorkOrderStatus; label: string; done: string }>> = {
  draft: { to: 'issued', label: 'Issue', done: 'issued to the contractor' },
  issued: { to: 'in_progress', label: 'Start', done: 'started' },
  in_progress: { to: 'done', label: 'Done', done: 'marked done' },
};

/** One work order: who, for what, when — and the operations it covers, by piece. */
export default function WorkOrderDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const company = useCompanySlug();
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const load = useLoad(() => getWorkOrder(id), [id]);
  const w = load.data;
  const [form, setForm] = useState({ startDate: '', dueDate: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => { if (w) setForm({ startDate: w.startDate ?? '', dueDate: w.dueDate ?? '', notes: w.notes ?? '' }); }, [w]);
  useDetailTitle(w?.code ?? null);
  if (load.error && !w) return <ErrorNotice error={load.error} onRetry={load.reload} />;
  if (!w) return <DetailSkeleton />;

  const open = w.status === 'draft' || w.status === 'issued' || w.status === 'in_progress';
  const dirty = form.startDate !== (w.startDate ?? '') || form.dueDate !== (w.dueDate ?? '') || form.notes !== (w.notes ?? '');
  const next = NEXT[w.status];
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(null);
    try { await fn(); load.reload(); toast.success(message); } catch (e) { setError(e instanceof CfApiError ? e : new CfApiError(0, 'Could not do that.')); } finally { setBusy(false); }
  };
  const pct = w.progress && w.progress.total > 0 ? Math.round((w.progress.done / w.progress.total) * 100) : 0;

  return (
    <DetailLayout
      header={
        <DetailHeader
          code={w.code} title={w.contractorName ?? 'No contractor'} badges={<WorkOrderStatusBadge status={w.status} />}
          actions={canManage && open && <>
            {next && <Button variant="contained" disabled={busy} onClick={() => run(() => setWorkOrderStatus(id, next.to), `${w.code} ${next.done}.`)}>{next.label}</Button>}
            <Button color="error" startIcon={<BlockRounded />} disabled={busy} onClick={() => setCancelling(true)}>Cancel</Button>
          </>}
          facts={<>
            <Fact label="Order">{w.orderId
              ? <Mono><Box component={Link} to={appPath(company, `orders/${w.orderId}?tab=production${w.lineId ? `&line=${w.lineId}` : ''}`)} style={{ color: 'inherit' }}>{w.orderCode}{w.lineNo != null ? ` · line ${w.lineNo}` : ''}</Box></Mono>
              : <Mono muted>—</Mono>}</Fact>
            <Fact label="Operations"><Mono>{w.cellCount}</Mono></Fact>
          </>}
        />
      }
    >
      <ErrorNotice error={error ?? (load.error && w ? load.error : null)} onRetry={load.reload} />
      <SectionCard title="Dates and notes">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '180px 180px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <TextField label="Start" type="date" size="small" value={form.startDate} disabled={!canManage || !open} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <TextField label="Due" type="date" size="small" value={form.dueDate} disabled={!canManage || !open} slotProps={{ inputLabel: { shrink: true } }}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <TextField label="Notes" size="small" multiline minRows={1} value={form.notes} disabled={!canManage || !open} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Box>
        {dirty && (
          <Box sx={{ mt: 1.5 }}>
            <Button variant="contained" disabled={busy} onClick={() => run(() => patchWorkOrder(id, {
              startDate: form.startDate || null, dueDate: form.dueDate || null, notes: form.notes.trim() || null,
            }), 'Saved.')}>Save</Button>
          </Box>
        )}
      </SectionCard>
      <SectionCard title="What it covers" subtitle="The operations handed to this contractor, by piece.">
        {w.scope.length === 0
          ? <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{open ? 'Nothing on it yet.' : 'Nothing is on it any more.'}</Typography>
          : <Box sx={{ display: 'grid', gap: 0.5 }}>
            {w.scope.map((s) => (
              <Box key={s.pieceCode} sx={{ display: 'flex', gap: 2, py: 0.5, borderTop: '1px solid var(--c-divider)', '&:first-of-type': { borderTop: 0 } }}>
                <Mono sx={{ minWidth: 140 }}>{s.pieceCode}</Mono>
                <Box sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>{s.operations.join(' · ')}</Box>
              </Box>
            ))}
          </Box>}
      </SectionCard>
      <SectionCard title="Progress">
        {w.progress && w.progress.total > 0
          ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <LinearProgress variant="determinate" value={pct} aria-label={`${pct}% of steps done`} sx={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--c-surface-2)', '& .MuiLinearProgress-bar': { background: 'var(--c-primary-500)' } }} />
            <Mono muted>{w.progress.done} of {w.progress.total} steps done</Mono>
          </Box>
          : <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>Progress shows once the line is released to production.</Typography>}
      </SectionCard>
      <ConfirmDialog open={cancelling} danger confirmLabel="Cancel work order" title="Cancel this work order?" entityName={`${w.code} — ${w.contractorName ?? ''}`}
        body="Its operations go back to us, in-house. Nothing is deleted."
        onClose={() => setCancelling(false)}
        onConfirm={async () => { await setWorkOrderStatus(id, 'cancelled'); load.reload(); toast.success(`${w.code} cancelled.`); }} />
    </DetailLayout>
  );
}
