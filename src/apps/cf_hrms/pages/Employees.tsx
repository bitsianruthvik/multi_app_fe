import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import {
  PageHeader, DataTable, StatStrip, StatusBadge, ToneBadge,
  EmptyState, ErrorNotice, ListSkeleton, StatSkeleton, Mono, DateCell,
  useToast,
  type DataColumn, type Stat,
} from '@shared/ui';
import {
  peopleApi, EMPLOYMENT_STATUS_TONE, EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_TYPE_LABEL,
  type Employee, type EmployeeRow, type PeoplePickers,
} from '../api/people';
import { orgApi, type Department } from '../api/organisation';
import { positionsApi, type PositionOptions } from '../api/positions';
import { shiftsApi } from '../api/shifts';
import { EmployeeFormDialog } from '../components/EmployeeFormDialog';
import { StartLeavingDialog } from '../components/Leaving';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { RowActions } from '../components/list/RowActions';
import { useListFilters, YES_NO_OPTIONS } from '../components/list/useListFilters';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { useCan } from '../access/can';

/**
 * Employees — the people (DESIGN_SYSTEM.md §4.2 Collection).
 *
 * ONE ROW PER PERSON, whatever they do. There is no "manager" column and no
 * "position" column, because an employee has neither: what somebody does is
 * their work assignments, and a person doing three jobs would need three values
 * in any such column. Department and location are shown as DERIVED from the
 * primary active assignment and labelled that way, so a blank cell reads as
 * "no assignment", which is a real gap, and not as "missing data".
 *
 * The StatStrip names things somebody can fix rather than restating the row
 * count: who is on notice, who is doing no recorded work, and whose documents
 * have expired. All three are computed from the rows already loaded, so they
 * always agree with the filtered list underneath.
 */

/**
 * Working and on notice are who is here today, and that is what the list opens
 * on. People who have left are kept — an employee is never deleted — and are
 * one choice away in the Status filter. (CF_HRMS_HIRING_SPEC.md §4.6)
 *
 * The default is EXPLICIT: with no `status` in the address, the list request and
 * the Excel download both send `status=ACTIVE,NOTICE`, so the file holds exactly
 * the people the screen shows.
 */
const HERE = 'ACTIVE,NOTICE';
const DEFAULTS = { status: HERE };
// `employmentType` and `contractorId` are the names the people route has always
// taken; the download reads the same ones.
const FILTER_KEYS = [
  'status', 'department', 'role', 'shift', 'location', 'joinedFrom', 'joinedTo', 'hasLogin',
  'employmentType', 'contractorId',
] as const;

export default function Employees() {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const can = useCan();
  const toast = useToast();
  // "New employee" outside hiring needs both the edit right and the named create right.
  const canCreate = can.employees.edit && can.named.employeeCreate;

  const filters = useListFilters(FILTER_KEYS, { defaults: DEFAULTS });

  const [rows, setRows] = useState<EmployeeRow[]>([]);
  // Rows the chosen status holds / rows the other filters leave — the server's `total` and `count`.
  const [counts, setCounts] = useState<{ total: number; count: number } | null>(null);
  const [pickers, setPickers] = useState<PeoplePickers | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [lookups, setLookups] = useState<{
    roles: { id: number; name: string }[];
    shifts: { id: number; name: string }[];
    locations: { id: number; name: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // The shell's quick-create sends people here with ?new=1 (see CfHrmsShell).
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [leaving, setLeaving] = useState<EmployeeRow | null>(null);

  // The server filters (GET /people/employees takes the same parameters the Excel
  // download does) and answers `total` and `count`. The address settles ~250 ms
  // after the last keystroke, so a search does not ask on every key.
  const querySig = JSON.stringify(filters.params);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await peopleApi.list(JSON.parse(querySig) as Record<string, string>);
      setRows(list.items);
      setCounts({ total: list.total, count: list.count ?? list.items.length });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [querySig]);

  useEffect(() => {
    void load();
  }, [load]);

  // The pickers behind the filters and the form: read once.
  useEffect(() => {
    void (async () => {
      const [picks, deps, options] = await Promise.all([
        peopleApi.pickers().catch(() => null),
        orgApi.departments.list().catch(() => [] as Department[]),
        positionsApi.options().catch(() => null as PositionOptions | null),
      ]);
      setPickers(picks);
      setDepartments(deps);
      if (options) {
        setLookups({ roles: options.roles, shifts: options.shifts, locations: options.locations });
      } else {
        const shifts = await shiftsApi.list().catch(() => []);
        setLookups({ roles: [], shifts: shifts.map((x) => ({ id: x.id, name: x.name })), locations: [] });
      }
    })();
  }, []);

  const openCreate = () => {
    setCreateOpen(true);
    if (searchParams.get('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  };

  const openEdit = (r: EmployeeRow) => {
    peopleApi
      .get(r.id)
      .then((d) => setEditing(d.employee))
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not open this person.'));
  };

  const filtered = rows;
  const total = counts?.total ?? rows.length;

  const defs: FilterDef[] = useMemo(() => {
    // Roles and locations fall back to what the loaded rows carry when the login
    // may not read the lists; the contractor list is the company's own.
    const roleOpts = new Map<number, string>(lookups?.roles.map((x) => [x.id, x.name]));
    const locOpts = new Map<number, string>(lookups?.locations.map((x) => [x.id, x.name]));
    for (const r of rows) {
      if (r.roleId != null && r.primaryRoleTitle && !roleOpts.has(r.roleId)) roleOpts.set(r.roleId, r.primaryRoleTitle);
      if (r.locationId != null && r.locationName && !locOpts.has(r.locationId)) locOpts.set(r.locationId, r.locationName);
    }
    const byName = (a: [number, string], b: [number, string]) => a[1].localeCompare(b[1]);
    const idOptions = (m: Map<number, string>) =>
      [...m.entries()].sort(byName).map(([id, n]) => ({ value: String(id), label: n }));
    const out: FilterDef[] = [
      {
        key: 'status',
        label: 'Status',
        defaultValue: HERE,
        options: [
          { value: HERE, label: 'Working and on notice' },
          { value: 'ACTIVE', label: EMPLOYMENT_STATUS_LABEL.ACTIVE },
          { value: 'NOTICE', label: EMPLOYMENT_STATUS_LABEL.NOTICE },
          { value: 'INACTIVE', label: EMPLOYMENT_STATUS_LABEL.INACTIVE },
          { value: 'EXITED', label: EMPLOYMENT_STATUS_LABEL.EXITED },
          { value: 'ALL', label: 'Everyone' },
        ],
      },
      {
        key: 'department',
        label: 'Department (and below)',
        searchable: true,
        options: departments.map((d) => ({ value: String(d.id), label: d.path || d.name })),
      },
      { key: 'role', label: 'Role', searchable: true, options: idOptions(roleOpts) },
      { key: 'shift', label: 'Shift', options: (lookups?.shifts ?? []).map((x) => ({ value: String(x.id), label: x.name })) },
      { key: 'location', label: 'Location', options: idOptions(locOpts) },
      { key: 'joinedFrom', label: 'Joined from', kind: 'date' },
      { key: 'joinedTo', label: 'Joined to', kind: 'date' },
      { key: 'hasLogin', label: 'Has a login', options: YES_NO_OPTIONS },
      {
        key: 'employmentType',
        label: 'Type',
        options: (['EMPLOYEE', 'CONTRACT', 'TRAINEE', 'CONSULTANT', 'OTHER'] as const)
          .map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABEL[t] })),
      },
    ];
    const cons = pickers?.contractors ?? [];
    if (cons.length > 0) {
      out.push({
        key: 'contractorId',
        label: 'Contractor',
        options: cons.map((c) => ({ value: String(c.id), label: c.name })),
      });
    }
    return out;
  }, [rows, departments, lookups, pickers]);

  const stats: Stat[] = useMemo(() => {
    const onNotice = filtered.filter((r) => r.employmentStatus === 'NOTICE').length;
    // Somebody employed and still here, with no assignment, is doing no recorded
    // work. That is the gap this screen exists to surface — it is invisible
    // anywhere else in the product.
    const noWork = filtered.filter(
      (r) => r.employmentStatus !== 'EXITED' && r.activeAssignmentCount === 0,
    ).length;
    const expiredDocs = filtered.filter((r) => r.expiredDocumentCount > 0).length;
    return [
      { label: 'People', value: filtered.length, hint: 'Matching the filters below' },
      { label: 'On notice', value: onNotice, tone: 'warning', hint: 'Leaving — their work needs rehoming' },
      { label: 'No position held', value: noWork, tone: 'warning', hint: 'Employed, but doing no recorded work' },
      { label: 'Expired documents', value: expiredDocs, tone: 'danger', hint: 'People with at least one expired document' },
    ];
  }, [filtered]);

  const columns: DataColumn<EmployeeRow>[] = useMemo(() => [
    {
      key: 'employeeCode',
      header: 'Code',
      alwaysVisible: true,
      width: 130,
      sortValue: (r) => r.employeeCode,
      exportValue: (r) => r.employeeCode,
      render: (r) => <Mono>{r.employeeCode}</Mono>,
    },
    {
      key: 'fullName',
      header: 'Name',
      alwaysVisible: true,
      sortValue: (r) => r.fullName,
      exportValue: (r) => r.fullName,
      render: (r) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)' }}>
            {r.fullName}
          </Typography>
          {r.primaryRoleTitle && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
              {r.primaryRoleTitle}
              {r.activeAssignmentCount > 1 && ` +${r.activeAssignmentCount - 1} more`}
            </Typography>
          )}
          {/* Leaving, in the server's words: "On notice · last day 10 Nov 2026" / "Left on … · resigned". */}
          {r.exit && r.employmentStatus !== 'ACTIVE' && (
            <Typography
              data-rowleaving=""
              sx={{ fontSize: 12, color: r.employmentStatus === 'NOTICE' ? 'var(--c-warning-800)' : 'var(--c-text-2)' }}
            >
              {r.exit.statusLine}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'employmentType',
      header: 'Type',
      width: 110,
      sortValue: (r) => r.employmentType,
      exportValue: (r) => EMPLOYMENT_TYPE_LABEL[r.employmentType] ?? r.employmentType,
      render: (r) => (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
          {EMPLOYMENT_TYPE_LABEL[r.employmentType] ?? r.employmentType}
        </Typography>
      ),
    },
    {
      key: 'contractor',
      header: 'Contractor',
      width: 180,
      sortValue: (r) => r.contractorName ?? '',
      exportValue: (r) => r.contractorName ?? '',
      // Blank for everybody who is not contract labour, and that is correct:
      // a contractor on a permanent employee would be a data error.
      render: (r) => (
        <Typography sx={{ fontSize: 13, color: r.contractorName ? 'var(--c-text-2)' : 'var(--c-text-3)' }}>
          {r.contractorName ?? '—'}
        </Typography>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      width: 170,
      sortValue: (r) => r.departmentName ?? '',
      exportValue: (r) => r.departmentName ?? '',
      render: (r) => (r.departmentName
        ? <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{r.departmentName}</Typography>
        : <ToneBadge tone="warning" label="No position" noIcon title="This person holds no active position" />),
    },
    {
      key: 'location',
      header: 'Location',
      width: 150,
      defaultHidden: true,
      sortValue: (r) => r.locationName ?? '',
      exportValue: (r) => r.locationName ?? '',
      render: (r) => (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{r.locationName ?? '—'}</Typography>
      ),
    },
    {
      key: 'employmentStatus',
      header: 'Status',
      width: 130,
      sortValue: (r) => r.employmentStatus,
      exportValue: (r) => EMPLOYMENT_STATUS_LABEL[r.employmentStatus],
      render: (r) => (
        <StatusBadge
          status={r.employmentStatus}
          map={EMPLOYMENT_STATUS_TONE}
          labelMap={EMPLOYMENT_STATUS_LABEL}
        />
      ),
    },
    {
      key: 'dateOfJoining',
      header: 'Joined',
      width: 120,
      numeric: true,
      align: 'right',
      sortValue: (r) => r.dateOfJoining,
      exportValue: (r) => r.dateOfJoining,
      render: (r) => <DateCell value={r.dateOfJoining} />,
    },
    {
      key: 'documents',
      header: 'Docs',
      width: 110,
      align: 'right',
      defaultHidden: true,
      sortValue: (r) => r.expiredDocumentCount * 1000 + r.documentCount,
      exportValue: (r) => `${r.documentCount} (${r.expiredDocumentCount} expired)`,
      render: (r) => (r.expiredDocumentCount
        ? <ToneBadge tone="danger" label={`${r.expiredDocumentCount} expired`} />
        : <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)', fontFamily: 'var(--font-mono)' }}>{r.documentCount}</Typography>),
    },
    {
      key: 'actions',
      header: '',
      alwaysVisible: true,
      width: 110,
      align: 'right',
      render: (r) => (
        <RowActions
          name={r.fullName}
          onEdit={can.employees.edit ? () => openEdit(r) : undefined}
          onRemove={can.named.employeeClose && r.employmentStatus === 'ACTIVE' ? () => setLeaving(r) : undefined}
          removeLabel="Start leaving"
        />
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [can.employees.edit, can.named.employeeClose]);

  const header = (
    <PageHeader
      title="Employees"
      subtitle="One record per person — what they do lives in the positions they hold"
    />
  );

  if (loading && counts === null) {
    return (
      <>
        {header}
        <StatSkeleton count={4} />
        <Box sx={{ mt: 2 }}>
          <ListSkeleton rows={8} />
        </Box>
      </>
    );
  }

  if (error && counts === null) {
    return (
      <>
        {header}
        <ErrorNotice error={error} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <>
      {header}

      <StatStrip stats={stats} />

      <Box sx={{ mt: 2 }}>
        <ListToolbar
          filters={filters}
          defs={defs}
          shown={counts?.count ?? filtered.length}
          total={total}
          noun={['person', 'people']}
          searchPlaceholder="Search by name or code"
          add={canCreate ? { label: 'New employee', onClick: openCreate } : undefined}
          excel={(
            <ExcelButtons
              entity="employees"
              noun={['employee', 'employees']}
              filters={filters.params}
              defaults={DEFAULTS}
              count={counts?.count ?? filtered.length}
              canDownload={can.employees.view}
              canUpload={can.employees.upload}
              canBulkAdd={can.named.employeeBulkAdd}
              onApplied={() => void load()}
            />
          )}
        />

        {!!error && <ErrorNotice error={error} onRetry={() => void load()} sx={{ mb: 2 }} />}

        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/${company}/cf_hrms/employees/${r.id}`)}
          storageKey="cf_hrms.employees"
          exportName="employees"
          defaultSortKey="fullName"
          empty={total === 0 ? (
            <EmptyState
              icon={<PeopleAltRounded />}
              title="No employees yet"
              body="An employee is one record per person, however many jobs they do. Add the person first; the positions they hold come next."
              action={canCreate && (
                <Button variant="contained" size="small" startIcon={<AddRounded />} onClick={openCreate}>
                  New employee
                </Button>
              )}
            />
          ) : (
            <EmptyState
              icon={<PeopleAltRounded />}
              title="Nothing matches these filters"
              hint="Clear the search or pick a different status."
              action={<Button size="small" onClick={filters.clear}>Clear</Button>}
            />
          )}
        />
        {!can.named.employeeClose && (
          <Typography sx={{ mt: 1, px: 0.5, fontSize: 13, color: 'var(--c-text-2)' }}>
            An employee is never deleted. When someone leaves, their record stays.
          </Typography>
        )}
      </Box>

      {canCreate && (
        <EmployeeFormDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          pickers={pickers}
          onSaved={(detail) => {
            toast.success(`${detail.employee.fullName} added.`);
            navigate(`/${company}/cf_hrms/employees/${detail.employee.id}`);
          }}
        />
      )}

      {can.employees.edit && editing && (
        <EmployeeFormDialog
          open
          onClose={() => setEditing(null)}
          employee={editing}
          pickers={pickers}
          onSaved={() => {
            setEditing(null);
            toast.success('Saved.');
            void load();
          }}
        />
      )}

      {can.named.employeeClose && leaving && (
        <StartLeavingDialog
          open
          person={{ id: leaving.id, fullName: leaving.fullName }}
          positionWords={leaving.primaryRoleTitle}
          onClose={() => setLeaving(null)}
          onDone={() => {
            setLeaving(null);
            void load();
          }}
        />
      )}
    </>
  );
}
