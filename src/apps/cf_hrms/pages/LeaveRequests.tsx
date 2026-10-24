/**
 * Time and leave › Leave requests (CF_HRMS_HIRING_SPEC.md §22.6) — HR's list of
 * every request in their scope.
 *
 * The list pattern of §13.1: search, filters (status, leave type, department,
 * dates) kept in the address, the count line. A row opens the same side sheet
 * the approver sees, with the same context; HR (leave edit) may approve, reject
 * or cancel there, and "Ask on behalf" raises a request for somebody else.
 * `?open=<id>` opens a request's sheet, so a request has an address
 * (`/leave-requests/:id` lands here).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Stack, Typography } from '@mui/material';
import EventNoteRounded from '@mui/icons-material/EventNoteRounded';
import { DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, useToast, type DataColumn } from '@shared/ui';
import { useCan } from '../access/can';
import { leaveApi, type LeaveType } from '../api/leave';
import { orgApi, type Department } from '../api/organisation';
import {
  LEAVE_STATUS_LABEL, dateWord, daysWord, hrLeaveApi, rangeWord,
  type LeaveRequest,
} from '../api/leaveRequests';
import { refreshPendingApprovals } from '../api/approvals';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { LeaveStatusBadge } from '../components/leave/LeaveParts';
import { LeaveRequestSheet, type SheetActions } from '../components/leave/LeaveRequestSheet';
import { AskOnBehalfSheet } from '../components/leave/AskOnBehalfSheet';
import { unitLabel } from '../components/orgUnits';

const STATUS_OPTIONS = (Object.keys(LEAVE_STATUS_LABEL) as (keyof typeof LEAVE_STATUS_LABEL)[])
  .map((s) => ({ value: s, label: LEAVE_STATUS_LABEL[s] }));

/** HR's door to a request. Module-level so the sheet sees a stable object. */
const HR_ACTIONS: SheetActions = {
  load: hrLeaveApi.get,
  approve: hrLeaveApi.approve,
  reject: hrLeaveApi.reject,
  cancel: hrLeaveApi.cancel,
};

export default function LeaveRequests() {
  const can = useCan();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filters = useListFilters(['status', 'leaveTypeId', 'departmentId', 'from', 'to']);
  const [items, setItems] = useState<LeaveRequest[] | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [asking, setAsking] = useState(false);

  const openId = Number(params.get('open')) || null;
  const setOpen = (id: number | null) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (id) next.set('open', String(id));
    else next.delete('open');
    return next;
  }, { replace: true });

  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    setLoading(true);
    hrLeaveApi.list(JSON.parse(querySig) as Record<string, string>)
      .then((r) => { setItems(r.items ?? []); setTotal(r.total); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [querySig]);
  useEffect(load, [load]);
  useEffect(() => {
    leaveApi.types().then(setTypes).catch(() => setTypes([]));
    orgApi.departments.list().then(setDepartments).catch(() => setDepartments(null));
  }, []);

  const rows = useMemo(() => items ?? [], [items]);

  const defs: FilterDef[] = useMemo(() => {
    const deps = departments
      ? departments.map((d) => ({ value: String(d.id), label: unitLabel(d.path || d.name, d.type) }))
      : [];
    return [
      { key: 'status', label: 'Status', options: STATUS_OPTIONS },
      { key: 'leaveTypeId', label: 'Leave type', options: types.map((t) => ({ value: String(t.id), label: t.name })) },
      ...(deps.length ? [{ key: 'departmentId', label: 'Org unit (and below)', searchable: true, options: deps }] : []),
      { key: 'from', label: 'Off on or after', kind: 'date' as const },
      { key: 'to', label: 'Off on or before', kind: 'date' as const },
    ];
  }, [departments, types]);

  const columns: DataColumn<LeaveRequest>[] = useMemo(() => [
    {
      key: 'person', header: 'Person', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.person.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            {r.person.employeeCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 0.75 }}>{r.person.employeeCode}</Mono>}
            {r.person.departmentName ?? ''}
          </Typography>
        </Stack>
      ),
      sortValue: (r) => r.person.name,
      exportValue: (r) => `${r.person.name}${r.person.employeeCode ? ` (${r.person.employeeCode})` : ''}`,
    },
    { key: 'type', header: 'Leave', render: (r) => r.leaveType.name, sortValue: (r) => r.leaveType.name },
    {
      key: 'when', header: 'When', render: (r) => rangeWord(r.from, r.to, r.halfDay),
      sortValue: (r) => r.from, exportValue: (r) => `${r.from} – ${r.to}${r.halfDay ? ` (${r.halfDay.toLowerCase()} half)` : ''}`,
    },
    { key: 'days', header: 'Days', numeric: true, align: 'right', width: 90, render: (r) => daysWord(r.quantity), sortValue: (r) => r.quantity, exportValue: (r) => r.quantity },
    { key: 'status', header: 'Status', width: 130, render: (r) => <LeaveStatusBadge status={r.status} />, sortValue: (r) => r.status, exportValue: (r) => LEAVE_STATUS_LABEL[r.status] ?? r.status },
    {
      key: 'approver', header: 'Approver',
      render: (r) => r.approver?.name ?? <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>HR</Typography>,
      sortValue: (r) => r.approver?.name ?? '', exportValue: (r) => r.approver?.name ?? 'HR',
    },
    {
      key: 'asked', header: 'Asked', width: 130,
      render: (r) => (
        <Typography component="span" sx={{ fontSize: 13 }}>
          {dateWord(r.submittedAt)}{r.raisedByHr ? ' · by HR' : ''}
        </Typography>
      ),
      sortValue: (r) => r.submittedAt ?? '', exportValue: (r) => r.submittedAt ?? '',
    },
  ], []);

  return (
    <>
      <PageHeader title="Leave requests" subtitle="every request in your scope — open one to see the context and decide" />
      <ListToolbar
        filters={filters}
        defs={defs}
        shown={rows.length}
        total={total}
        noun={['request', 'requests']}
        searchPlaceholder="Search by person or code"
        add={can.leave.edit ? { label: 'Ask on behalf', onClick: () => setAsking(true) } : undefined}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {loading && !items ? <ListSkeleton rows={6} /> : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => setOpen(r.id)}
          loading={loading}
          storageKey="cf_hrms.leave-requests"
          exportName="leave-requests"
          defaultSortKey="asked"
          defaultSortDir="desc"
          empty={filters.isFiltered ? (
            <EmptyState icon={<EventNoteRounded />} title="No requests match these filters" hint="Clear the search or the filters to see every request."
              action={<Button size="small" onClick={filters.clear}>Clear the filters</Button>} />
          ) : (
            <EmptyState icon={<EventNoteRounded />} title="No leave requests yet"
              hint="People ask for leave from My leave. Requests show up here as soon as they are sent." />
          )}
        />
      )}

      <LeaveRequestSheet
        id={openId}
        onClose={() => setOpen(null)}
        actions={HR_ACTIONS}
        onChanged={() => { load(); void refreshPendingApprovals(); }}
      />
      {can.leave.edit && (
        <AskOnBehalfSheet
          open={asking}
          onClose={() => setAsking(false)}
          onSubmitted={(r) => {
            toast.success(`Sent for approval: ${r.person.name}'s leave.`);
            load();
            void refreshPendingApprovals();
          }}
        />
      )}
    </>
  );
}
