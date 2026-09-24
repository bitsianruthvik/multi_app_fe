import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  DataTable, EmptyState, ErrorNotice, FilterBar, ListSkeleton, Mono, PageHeader,
  StatStrip, StatusBadge, ToneBadge, useIsPermitted,
} from '@shared/ui';
import type { DataColumn, Stat, StatusTone } from '@shared/ui';
import type { AssignmentListResult, AssignmentOptions, AssignmentRow } from '../api/assignments';
import { assignmentsApi } from '../api/assignments';
import { AssignmentFormDialog } from '../components/AssignmentDialogs';

/**
 * Work assignments — who is actually doing what (§4.2 Collection).
 *
 * The list a person reads to answer "is this organisation described
 * correctly?". Its StatStrip therefore names things somebody can FIX rather
 * than restating the row count: assignments with nobody responsible for them,
 * people committed past 100%, work with no sanctioned seat behind it.
 *
 * "No position 7" is NOT a failure — position is optional by design. It is
 * reported because it is the gap between what people do and what the company
 * has formally sanctioned, which is the number an SME actually wants.
 */

const STATUS_TONES: Record<string, StatusTone> = {
  PLANNED: 'info', ACTIVE: 'success', SUSPENDED: 'warning', ENDED: 'neutral',
};

export default function Assignments() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useIsPermitted();
  const canManage = can('cf_hrms_assignments_manage');
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState<AssignmentListResult | null>(null);
  const [options, setOptions] = useState<AssignmentOptions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [roleId, setRoleId] = useState<number | ''>('');
  const [noPosition, setNoPosition] = useState(false);
  const [creating, setCreating] = useState(false);

  const positionId = params.get('positionId') ? Number(params.get('positionId')) : '';

  const load = useCallback(() => {
    setLoading(true);
    assignmentsApi.list({ search, status, employeeId, roleId, positionId, noPosition })
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [search, status, employeeId, roleId, positionId, noPosition]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { assignmentsApi.options().then(setOptions).catch(() => setOptions(null)); }, []);

  useEffect(() => {
    if (params.get('new') === '1' && canManage) {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, canManage]);

  const stats: Stat[] = useMemo(() => {
    const t = data?.totals;
    return [
      { label: 'Assignments', value: t?.assignments ?? 0, hint: 'Rows shown below. One person may hold several at once.' },
      { label: 'No manager', value: t?.noManager ?? 0, tone: 'danger', hint: 'Nobody has authority over this work — neither on the assignment nor inherited from a position.' },
      { label: 'People over 100%', value: t?.overAllocatedEmployees ?? 0, tone: 'warning', hint: 'Allocation across all their live assignments exceeds 100%. Advisory — recorded, never blocked.' },
      { label: 'No position', value: t?.noPosition ?? 0, hint: 'Real work with no sanctioned seat behind it. Normal in an SME; the gap worth knowing.' },
    ];
  }, [data]);

  const columns: DataColumn<AssignmentRow>[] = useMemo(() => [
    {
      key: 'employee', header: 'Person', alwaysVisible: true,
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{a.employeeName}</Typography>
          <Mono sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{a.employeeCode ?? ''}</Mono>
        </Stack>
      ),
      sortValue: (a) => a.employeeName,
      exportValue: (a) => a.employeeName,
    },
    {
      key: 'role', header: 'Role',
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 13.5 }}>{a.roleTitle ?? '—'}</Typography>
          {a.assignmentTitle && a.assignmentTitle !== a.roleTitle && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{a.assignmentTitle}</Typography>
          )}
        </Stack>
      ),
      sortValue: (a) => a.roleTitle ?? '',
    },
    {
      key: 'position', header: 'Position',
      render: (a) => a.positionId
        ? <Mono sx={{ fontSize: 12.5 }}>{a.positionCode ?? `#${a.positionId}`}</Mono>
        : (
          <Tooltip title="Position is optional. Real work exists before a company writes down sanctioned seats.">
            <span><ToneBadge tone="neutral" noIcon label="No position" /></span>
          </Tooltip>
        ),
      sortValue: (a) => a.positionCode ?? '',
      exportValue: (a) => a.positionCode ?? 'no position',
    },
    {
      key: 'allocation', header: 'Allocation', numeric: true, align: 'right', width: 130,
      render: (a) => (
        <Tooltip title={a.employeeOverAllocated ? `This person totals ${a.employeeAllocationTotal}% across ${a.employeeAssignmentCount} live assignments.` : ''}>
          <span>
            <Mono sx={{ fontSize: 13, color: a.employeeOverAllocated ? 'var(--c-warning-700)' : 'var(--c-text-1)' }}>
              {a.allocationPercent == null ? '—' : `${a.allocationPercent}%`}
            </Mono>
          </span>
        </Tooltip>
      ),
      sortValue: (a) => a.allocationPercent ?? -1,
      exportValue: (a) => a.allocationPercent ?? '',
    },
    { key: 'department', header: 'Department', render: (a) => a.departmentName ?? '—', sortValue: (a) => a.departmentName ?? '' },
    {
      key: 'managers', header: 'Managers', numeric: true, align: 'right', width: 110,
      render: (a) => (
        <Tooltip title={a.hasNoManager ? 'Nobody has authority over this work.' : `${a.actualManagerCount} on this assignment, ${a.inheritedManagerCount} inherited from the position.`}>
          <span>
            <Mono sx={{ fontSize: 13, color: a.hasNoManager ? 'var(--c-danger-600)' : 'var(--c-text-1)' }}>{a.managerCount}</Mono>
          </span>
        </Tooltip>
      ),
      sortValue: (a) => a.managerCount,
    },
    {
      key: 'primary', header: 'Primary', width: 100, defaultHidden: true,
      render: (a) => (a.isPrimary ? <ToneBadge tone="success" noIcon label="Primary" /> : '—'),
      sortValue: (a) => (a.isPrimary ? 1 : 0),
    },
    {
      key: 'status', header: 'Status', width: 120,
      render: (a) => <StatusBadge status={a.status} map={STATUS_TONES} />,
      sortValue: (a) => a.status,
    },
    {
      key: 'dates', header: 'Effective', width: 190, defaultHidden: true,
      render: (a) => <Mono sx={{ fontSize: 12 }}>{a.effectiveFrom ?? '—'}{a.effectiveTo ? ` → ${a.effectiveTo}` : ''}</Mono>,
      sortValue: (a) => a.effectiveFrom ?? '',
    },
  ], []);

  if (error && !data) return <ErrorNotice error={error} onRetry={load} />;

  const filtered = Boolean(search || status || employeeId || roleId || positionId || noPosition);

  return (
    <>
      <PageHeader
        title="Work assignments"
        subtitle="what each person is actually doing — one person may hold several at once"
        actions={
          canManage && (
            <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
              New assignment
            </Button>
          )
        }
      />

      <StatStrip stats={stats} />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search person, role or title…">
        <TextField
          select size="small" value={status} onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 140 }} label="Status" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">Any status</MenuItem>
          {(options?.assignmentStatuses ?? []).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ minWidth: 190 }} label="Person" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">Anyone</MenuItem>
          {(options?.employees ?? []).map((e) => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" value={roleId}
          onChange={(e) => setRoleId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ minWidth: 190 }} label="Role" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">Any role</MenuItem>
          {(options?.roles ?? []).map((r) => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" value={noPosition ? '1' : ''} onChange={(e) => setNoPosition(e.target.value === '1')}
          sx={{ minWidth: 160 }} label="Position" InputLabelProps={{ shrink: true }} SelectProps={{ displayEmpty: true }}
        >
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="1">No position only</MenuItem>
        </TextField>
        {positionId !== '' && (
          <Button size="small" onClick={() => { params.delete('positionId'); setParams(params, { replace: true }); }}>
            Clear position filter
          </Button>
        )}
      </FilterBar>

      {error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          getRowId={(a) => a.id}
          onRowClick={(a) => navigate(`/${company}/cf_hrms/assignments/${a.id}`)}
          loading={loading}
          storageKey="cf_hrms.assignments"
          exportName="work-assignments"
          defaultSortKey="employee"
          empty={
            <EmptyState
              icon={<BadgeRounded />}
              title={filtered ? 'No assignments match this filter' : 'No work assignments yet'}
              hint={
                filtered
                  ? 'Clear the filter to see everyone.'
                  : 'A work assignment is the record of what one person is actually doing. It needs a person and a role; a position is optional.'
              }
              action={canManage && !filtered ? <Button variant="contained" size="small" onClick={() => setCreating(true)}>New assignment</Button> : undefined}
            />
          }
        />
      )}

      <AssignmentFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={(id) => { setCreating(false); navigate(`/${company}/cf_hrms/assignments/${id}`); }}
        options={options}
        assignment={null}
      />
    </>
  );
}
