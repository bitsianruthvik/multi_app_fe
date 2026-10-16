/**
 * My leave (CF_HRMS_HIRING_SPEC.md §22.6) — what I have, asking for more, and
 * what I have asked for.
 *
 *   1. one card per leave type in my policy: the big "available" number, the
 *      why line, the rule on expand; a type I cannot use is dim, with why;
 *   2. Ask for leave: the form, and under it the server's live answer;
 *   3. My requests: status, the decision note, cancel where allowed.
 *
 * Like My place, it stands alone: a shop-floor login may have only these
 * screens, so every word is plain and nothing links to an HR screen. It reads
 * `/user/me/leave` only — no employee id anywhere.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  Callout, DetailSkeleton, EmptyState, ErrorNotice, PageHeader, PromptDialog, SectionCard, errorMessage, useToast,
} from '@shared/ui';
import {
  dateWord, myLeaveApi, personLine, requestLine,
  type LeaveRequest, type MyLeave as MyLeaveData,
} from '../api/leaveRequests';
import { AskLeaveForm } from '../components/leave/AskLeaveForm';
import { BalanceCards, LeaveStatusBadge } from '../components/leave/LeaveParts';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function RequestRow({ r, onCancel }: { r: LeaveRequest; onCancel: (r: LeaveRequest) => void }) {
  const note = r.status === 'CANCELLED' ? r.cancelNote : r.decisionNote;
  return (
    <Box
      data-my-request={r.id}
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap', py: 1.25,
        borderBottom: '1px solid var(--c-divider)', '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{requestLine(r)}</Typography>
        {r.reason && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {r.reason}
          </Typography>
        )}
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
          {r.submittedAt ? `Asked ${dateWord(r.submittedAt)}` : ''}
          {r.status === 'PENDING' ? (r.approver ? ` · with ${r.approver.name}` : ' · with HR') : ''}
          {r.decidedBy && r.status !== 'PENDING' ? ` · ${r.decidedBy}` : ''}
        </Typography>
        {note && (
          <Typography sx={{ fontSize: 13, mt: 0.5, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>“{note}”</Typography>
        )}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LeaveStatusBadge status={r.status} />
        {r.can.cancel && (
          <Button size="small" color="inherit" onClick={() => onCancel(r)} data-action="cancel-my-leave">
            Cancel
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default function MyLeave() {
  const toast = useToast();
  const [data, setData] = useState<MyLeaveData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null);
  // Re-mounts the form after a send, so it starts clean on the new balances.
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    myLeaveApi.get()
      .then((d) => { setData(d); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  if (loading && !data) return <DetailSkeleton />;

  // Not an error: an HR administrator's login was never imported as a person (403 NOT_LINKED).
  const notLinked = (error as { code?: string } | null)?.code === 'NOT_LINKED';
  if (!data && !notLinked) {
    return (
      <>
        <PageHeader title="My leave" />
        <ErrorNotice error={error} fallback="Could not load your leave." onRetry={load} />
      </>
    );
  }

  if (!data || data.linked === false) {
    return (
      <>
        <PageHeader title="My leave" />
        <EmptyState
          icon={<BadgeRounded sx={{ fontSize: 34 }} />}
          title="This login is not connected to an employee record"
          hint={data?.reason ?? (notLinked ? errorMessage(error) : undefined) ?? 'An HR administrator can connect it on your employee record.'}
        />
      </>
    );
  }

  const requests = data.requests.filter((r) => !status || r.status === status);
  const noPolicy = !data.policy?.policy;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="My leave"
        subtitle={`Leave year ${data.year.label}${data.policy?.policy ? ` · ${data.policy.policy.name}` : ''}`}
      />
      <ErrorNotice error={error} onRetry={load} />

      {noPolicy ? (
        <EmptyState
          icon={<EventAvailableRounded sx={{ fontSize: 34 }} />}
          title="No leave policy applies to you yet"
          hint="HR sets which policy applies to your role or location. Ask them to set it up."
        />
      ) : (
        <Stack spacing={2.5}>
          {data.calendarNote && <Callout title="Your working days" sx={{ mb: 0 }}>{data.calendarNote}</Callout>}

          <BalanceCards balances={data.balances} />

          <SectionCard
            title="Ask for leave"
            subtitle={data.approver ? `Your request goes to ${personLine(data.approver)}.` : 'Your request goes to HR.'}
          >
            <AskLeaveForm
              key={formKey}
              balances={data.balances}
              approver={data.approver}
              preview={myLeaveApi.preview}
              submit={myLeaveApi.submit}
              onSubmitted={() => {
                toast.success('Sent for approval.');
                setFormKey((k) => k + 1);
                load();
              }}
            />
          </SectionCard>
        </Stack>
      )}

      <SectionCard
        sx={{ mt: 2.5 }}
        title="My requests"
        subtitle={`This leave year, ${data.year.label}.`}
        actions={
          <TextField
            select size="small" value={status} onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 140 }} SelectProps={{ displayEmpty: true }} aria-label="Show"
          >
            {STATUS_FILTERS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </TextField>
        }
      >
        {requests.length === 0 ? (
          <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
            {status ? 'None with this status.' : 'You have not asked for leave this year.'}
          </Typography>
        ) : (
          <Box>{requests.map((r) => <RequestRow key={r.id} r={r} onCancel={setCancelling} />)}</Box>
        )}
      </SectionCard>

      {cancelling && (
        <PromptDialog
          open
          title="Cancel this leave?"
          body={`${requestLine(cancelling)}. The days go back to your balance.`}
          label="Note (optional)"
          required={false}
          confirmLabel="Cancel leave"
          danger
          onClose={() => setCancelling(null)}
          onConfirm={async (note) => {
            await myLeaveApi.cancel(cancelling.id, note);
            toast.success('Leave cancelled.');
            load();
          }}
        />
      )}
    </Box>
  );
}
