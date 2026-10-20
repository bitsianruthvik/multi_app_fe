/**
 * Approvals (CF_HRMS_HIRING_SPEC.md §22.6) — everything waiting for me to
 * decide, and what I have decided.
 *
 * Tabs Waiting / Decided over one list of ApprovalItems. A row opens the sheet
 * for its kind; today the only kind is leave, and its sheet carries the full
 * context and Approve / Reject. Another kind joins by adding a row icon
 * (`ApprovalRow`'s KIND_META) and a case in `KindSheet` below.
 *
 * Read through `/user/me/approvals` for every login: a manager sees what their
 * team asked for; HR and the Owner (leave edit) see everything in their scope.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import TaskAltRounded from '@mui/icons-material/TaskAltRounded';
import { EmptyState, ErrorNotice, ListSkeleton, PageHeader, Surface } from '@shared/ui';
import {
  approvalsApi, refreshPendingApprovals, setPendingApprovals,
  type ApprovalItem, type ApprovalList,
} from '../api/approvals';
import { ApprovalRow } from '../components/approvals/ApprovalRow';
import { LeaveRequestSheet, type SheetActions } from '../components/leave/LeaveRequestSheet';
import { AttendanceRequestSheet, type AttSheetActions } from '../components/attendance/AttendanceRequestSheet';
import { ClaimApprovalSheet } from '../components/approvals/ClaimApprovalSheet';

type TabKey = 'PENDING' | 'DECIDED';

/** The approver's door to a leave request. Module-level so the sheet sees a stable object. */
const LEAVE_ACTIONS: SheetActions = {
  load: approvalsApi.leave,
  approve: approvalsApi.approveLeave,
  reject: approvalsApi.rejectLeave,
};

/** The approver's door to an attendance request (spec §28.5). */
const ATTENDANCE_ACTIONS: AttSheetActions = {
  load: approvalsApi.attendance,
  approve: approvalsApi.approveAttendance,
  reject: approvalsApi.rejectAttendance,
};

/** The sheet for an item's kind. */
function KindSheet({ open, onClose, onChanged }: { open: { kind: string; id: number } | null; onClose: () => void; onChanged: () => void }) {
  // One sheet per kind; a new kind adds its own here.
  return (
    <>
      <LeaveRequestSheet
        id={open?.kind === 'LEAVE' ? open.id : null}
        onClose={onClose}
        actions={LEAVE_ACTIONS}
        onChanged={onChanged}
      />
      <AttendanceRequestSheet
        id={open?.kind === 'ATTENDANCE' ? open.id : null}
        onClose={onClose}
        actions={ATTENDANCE_ACTIONS}
        onChanged={onChanged}
      />
      <ClaimApprovalSheet id={open?.kind === 'CLAIM' ? open.id : null} onClose={onClose} onChanged={onChanged} />
    </>
  );
}

export default function Approvals() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'decided' ? 'DECIDED' : 'PENDING';
  const [data, setData] = useState<ApprovalList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<{ kind: string; id: number } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    approvalsApi.list(tab)
      .then((d) => {
        setData(d);
        setError(null);
        if (d.counts) setPendingApprovals(d.counts.pending);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [tab]);
  useEffect(load, [load]);

  const items: ApprovalItem[] = data?.items ?? [];
  const pending = data?.counts?.pending;

  return (
    <Box sx={{ maxWidth: 1000 }}>
      <PageHeader title="Approvals" subtitle="What is waiting for you to decide." />
      <Tabs
        value={tab}
        onChange={(_, v: TabKey) => {
          setData(null);
          setParams((prev) => {
            const next = new URLSearchParams(prev);
            if (v === 'DECIDED') next.set('tab', 'decided');
            else next.delete('tab');
            return next;
          }, { replace: true });
        }}
        sx={{ mb: 2, borderBottom: '1px solid var(--c-divider)' }}
      >
        <Tab value="PENDING" label={pending ? `Waiting (${pending})` : 'Waiting'} />
        <Tab value="DECIDED" label="Decided" />
      </Tabs>

      <ErrorNotice error={error} onRetry={load} />

      {loading && !data ? (
        <ListSkeleton rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<TaskAltRounded />}
          title={tab === 'PENDING' ? 'Nothing is waiting for you' : 'Nothing decided yet'}
          hint={tab === 'PENDING'
            ? 'When someone in your team asks for leave, to correct a day or to be paid back a bill, it shows up here.'
            : 'Requests you approve or reject show up here.'}
        />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }} data-approvals-list={tab}>
          {items.map((it) => (
            <ApprovalRow key={`${it.kind}-${it.id}`} item={it} onOpen={(x) => setOpen({ kind: x.kind, id: x.id })} />
          ))}
        </Surface>
      )}

      <KindSheet
        open={open}
        onClose={() => setOpen(null)}
        onChanged={() => {
          load();
          void refreshPendingApprovals();
        }}
      />
    </Box>
  );
}
