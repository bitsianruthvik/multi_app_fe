/**
 * A claim waiting for the manager's first look (payroll P3b), in a side sheet over Approvals: the amount, the
 * type, what it was for, the journeys of a leave-travel claim, the bills (each a download through the
 * approver's own door), and how much of the type's yearly limit is used. Approve (optional note) sends it to
 * HR, who approves the amount and pays it; Reject needs a note.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Stack, TextField } from '@mui/material';
import { DetailSkeleton, ErrorNotice, SideSheet, errorMessage, useToast } from '@shared/ui';
import { claimApprovalsApi, type Claim, type ClaimContext } from '../../api/payrollExit';
import { ClaimFacts } from '../payroll/ClaimParts';
import { rupees } from '../payroll/payWords';

export function ClaimApprovalSheet({ id, onClose, onChanged }: { id: number | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ request: Claim; context: ClaimContext } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id == null) return undefined;
    let live = true;
    setData(null); setError(null); setNote('');
    claimApprovalsApi.get(id).then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [id]);

  const c = data?.request;
  const pending = c?.status === 'PENDING';
  const act = async (verdict: 'approve' | 'reject') => {
    if (!c) return;
    if (verdict === 'reject' && !note.trim()) { toast.error('Write why it is rejected.'); return; }
    setBusy(true);
    try {
      if (verdict === 'approve') await claimApprovalsApi.approve(c.id, note.trim() || undefined);
      else await claimApprovalsApi.reject(c.id, note.trim());
      toast.success(verdict === 'approve' ? 'Sent to HR to approve and pay.' : 'Rejected.');
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
      actions={pending ? (
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <Button color="error" variant="outlined" disabled={busy} onClick={() => void act('reject')} data-action="reject-claim">Reject</Button>
          <Box sx={{ flex: 1 }} />
          <Button variant="contained" disabled={busy} onClick={() => void act('approve')} data-action="approve-claim">Approve</Button>
        </Box>
      ) : undefined}
    >
      <ErrorNotice error={error} />
      {!data && !error && <DetailSkeleton />}
      {c && data && (
        <Stack spacing={2}>
          <ClaimFacts
            claim={pending ? { ...c, statusWords: 'Waiting for you' } : c}
            context={data.context}
            loadBill={(fileId) => claimApprovalsApi.bill(c.id, fileId)}
          />
          {pending && <TextField label="Note (needed to reject)" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} data-field="decision-note" />}
        </Stack>
      )}
    </SideSheet>
  );
}
