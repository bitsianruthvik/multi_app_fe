import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import {
  PageHeader, FilterBar, FacetChip, DataTable, StatStrip, StatusBadge, ToneBadge,
  EmptyState, ErrorNotice, ListSkeleton, StatSkeleton, Mono, DateCell,
  useIsPermitted, useToast,
  type DataColumn, type Stat,
} from '@shared/ui';
import {
  peopleApi, EMPLOYMENT_STATUS_TONE, EMPLOYMENT_STATUS_LABEL, EMPLOYMENT_TYPE_LABEL,
  type EmployeeRow, type PeoplePickers,
} from '../api/people';
import { EmployeeFormDialog } from '../components/EmployeeFormDialog';

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

type StatusFilter = 'ALL' | 'ACTIVE' | 'NOTICE' | 'INACTIVE' | 'EXITED';
type TypeFilter = 'ALL' | 'EMPLOYEE' | 'CONTRACT' | 'TRAINEE' | 'CONSULTANT' | 'OTHER';

export default function Employees() {
  const navigate = useNavigate();
  const { company } = useParams<{ company: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const can = useIsPermitted();
  const toast = useToast();
  const canManage = can('cf_hrms_people_manage');

  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [pickers, setPickers] = useState<PeoplePickers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [type, setType] = useState<TypeFilter>('ALL');
  const [contractorId, setContractorId] = useState<number | 'ALL'>('ALL');

  // The shell's quick-create sends people here with ?new=1 (see CfHrmsShell).
  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, picks] = await Promise.all([peopleApi.list(), peopleApi.pickers()]);
      setRows(list.items);
      setPickers(picks);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setCreateOpen(true);
    if (searchParams.get('new')) {
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  };

  // Filtering is client-side because the whole workforce is a few hundred rows
  // and a round trip per chip makes the facets feel broken. The endpoint takes
  // the same filters for when a company outgrows that.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'ALL' && r.employmentStatus !== status) return false;
      if (type !== 'ALL' && r.employmentType !== type) return false;
      if (contractorId !== 'ALL' && r.contractorId !== contractorId) return false;
      if (!q) return true;
      return [r.employeeCode, r.fullName, r.phone, r.email, r.departmentName, r.primaryRoleTitle]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rows, search, status, type, contractorId]);

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
      { label: 'No active assignment', value: noWork, tone: 'warning', hint: 'Employed, but doing no recorded work' },
      { label: 'Expired documents', value: expiredDocs, tone: 'danger', hint: 'People with at least one expired document' },
    ];
  }, [filtered]);

  const contractorFacets = useMemo(() => {
    const seen = new Map<number, { name: string; count: number }>();
    for (const r of rows) {
      if (!r.contractorId) continue;
      const cur = seen.get(r.contractorId);
      if (cur) cur.count += 1;
      else seen.set(r.contractorId, { name: r.contractorName ?? `Contractor ${r.contractorId}`, count: 1 });
    }
    return [...seen.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows]);

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
        : <ToneBadge tone="warning" label="No assignment" noIcon title="This person holds no active work assignment" />),
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
  ], []);

  const header = (
    <PageHeader
      title="Employees"
      subtitle="One record per person — what they do lives in their work assignments"
      actions={canManage && (
        <Button
          variant="contained"
          size="small"
          startIcon={<AddRounded />}
          onClick={openCreate}
        >
          New employee
        </Button>
      )}
    />
  );

  if (loading) {
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

  if (error) {
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
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search name, code, phone, email, department…"
        >
          {(['ALL', 'ACTIVE', 'NOTICE', 'INACTIVE', 'EXITED'] as StatusFilter[]).map((s) => (
            <FacetChip
              key={s}
              label={s === 'ALL' ? 'All statuses' : EMPLOYMENT_STATUS_LABEL[s]}
              active={status === s}
              onClick={() => setStatus(s)}
              count={s === 'ALL' ? undefined : rows.filter((r) => r.employmentStatus === s).length}
            />
          ))}

          <Box sx={{ width: 1, alignSelf: 'stretch', background: 'var(--c-border)', mx: 0.5 }} />

          {(['ALL', 'EMPLOYEE', 'CONTRACT', 'TRAINEE', 'CONSULTANT', 'OTHER'] as TypeFilter[]).map((t) => (
            <FacetChip
              key={t}
              label={t === 'ALL' ? 'All types' : EMPLOYMENT_TYPE_LABEL[t]}
              active={type === t}
              onClick={() => setType(t)}
              count={t === 'ALL' ? undefined : rows.filter((r) => r.employmentType === t).length}
            />
          ))}

          {/* Contractor facets only exist where contract labour does. */}
          {contractorFacets.length > 0 && (
            <>
              <Box sx={{ width: 1, alignSelf: 'stretch', background: 'var(--c-border)', mx: 0.5 }} />
              <FacetChip
                label="Any contractor"
                active={contractorId === 'ALL'}
                onClick={() => setContractorId('ALL')}
              />
              {contractorFacets.map(([cid, info]) => (
                <FacetChip
                  key={cid}
                  label={info.name}
                  count={info.count}
                  active={contractorId === cid}
                  onClick={() => setContractorId(cid)}
                />
              ))}
            </>
          )}
        </FilterBar>

        <DataTable
          rows={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/${company}/cf_hrms/employees/${r.id}`)}
          storageKey="cf_hrms.employees"
          exportName="employees"
          defaultSortKey="fullName"
          empty={rows.length === 0 ? (
            <EmptyState
              icon={<PeopleAltRounded />}
              title="No employees yet"
              body="An employee is one record per person, however many jobs they do. Add the person first; their work assignments come next."
              action={canManage && (
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
              action={(
                <Button
                  size="small"
                  onClick={() => { setSearch(''); setStatus('ALL'); setType('ALL'); setContractorId('ALL'); }}
                >
                  Clear filters
                </Button>
              )}
            />
          )}
        />
      </Box>

      {canManage && (
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
    </>
  );
}
