/**
 * Roles — the reusable kinds of work (DESIGN_SYSTEM §4.2 Collection).
 *
 * The readiness numbers at the top are the point of this screen being more than
 * a list. A role is what a JD is generated from: without a purpose the document
 * opens with a blank line, and without a KRA it lists duties under no outcome at
 * all. Both are fixable in a minute and invisible until someone tries to
 * generate — so they are named here, and each is a filter that jumps straight to
 * the roles concerned.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  PageHeader, FilterBar, FacetChip, DataTable, EmptyState, StatStrip, StatusBadge, ToneBadge,
  Mono, ErrorNotice, ListSkeleton, useIsPermitted, useCompanySlug,
  type DataColumn, type Stat,
} from '@shared/ui';
import { listRoles, pretty, type Role } from '../api/roles';
import { RoleFormDialog } from '../components/RoleFormDialog';

type Gap = 'purpose' | 'kras';

export default function Roles() {
  const navigate = useNavigate();
  const company = useCompanySlug();
  const can = useIsPermitted();
  const mayManage = can('cf_hrms_roles_manage');
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [gap, setGap] = useState<Gap | null>(null);
  // The shell's quick-create sends ?new=1 here.
  const [creating, setCreating] = useState(params.get('new') === '1');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await listRoles()).items);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (gap === 'purpose' && r.hasPurpose) return false;
      if (gap === 'kras' && r.kraCount > 0) return false;
      if (!q) return true;
      return [r.title, r.roleCode, r.departmentName, r.rolePurpose]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, status, gap]);

  const stats = useMemo<Stat[]>(() => {
    const noPurpose = filtered.filter((r) => !r.hasPurpose).length;
    const noKras = filtered.filter((r) => r.kraCount === 0).length;
    return [
      { label: 'Roles', value: filtered.length, hint: 'In this list' },
      { label: 'Active', value: filtered.filter((r) => r.status === 'ACTIVE').length, tone: 'primary' },
      {
        label: 'No purpose',
        value: noPurpose,
        tone: 'warning',
        hint: 'A JD opens with the purpose. Click to see them.',
        onClick: () => setGap(gap === 'purpose' ? null : 'purpose'),
      },
      {
        label: 'No KRAs',
        value: noKras,
        tone: 'warning',
        hint: 'Duties with no outcome area to sit under. Click to see them.',
        onClick: () => setGap(gap === 'kras' ? null : 'kras'),
      },
    ];
  }, [filtered, gap]);

  const columns = useMemo<DataColumn<Role>[]>(
    () => [
      {
        key: 'roleCode',
        header: 'Code',
        width: 120,
        render: (r) => (r.roleCode ? <Mono>{r.roleCode}</Mono> : <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>),
        sortValue: (r) => r.roleCode ?? null,
      },
      {
        key: 'title',
        header: 'Title',
        width: '28%',
        render: (r) => (
          <Box>
            <Box sx={{ fontWeight: 500 }}>{r.title}</Box>
            {r.rolePurpose && (
              <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                {r.rolePurpose}
              </Box>
            )}
          </Box>
        ),
        sortValue: (r) => r.title,
        exportValue: (r) => r.title,
      },
      {
        key: 'department',
        header: 'Department',
        render: (r) =>
          r.departmentName ? (
            <Box
              component="button"
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                navigate(`/${company}/cf_hrms/departments`);
              }}
              sx={{
                border: 0, background: 'none', p: 0, font: 'inherit', fontSize: 13,
                color: 'var(--c-primary-700)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {r.departmentName}
            </Box>
          ) : (
            <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>
          ),
        sortValue: (r) => r.departmentName ?? null,
      },
      { key: 'kraCount', header: 'KRAs', numeric: true, render: (r) => r.kraCount, sortValue: (r) => r.kraCount },
      { key: 'responsibilityCount', header: 'Responsibilities', numeric: true, render: (r) => r.responsibilityCount, sortValue: (r) => r.responsibilityCount },
      { key: 'kpiCount', header: 'KPIs', numeric: true, render: (r) => r.kpiCount, sortValue: (r) => r.kpiCount },
      { key: 'positionCount', header: 'Positions', numeric: true, defaultHidden: true, render: (r) => r.positionCount, sortValue: (r) => r.positionCount },
      {
        key: 'readiness',
        header: 'JD',
        render: (r) =>
          r.jdReady ? (
            <ToneBadge tone="success" label="Ready" />
          ) : (
            <ToneBadge tone="warning" label={!r.hasPurpose ? 'No purpose' : 'No KRAs'} />
          ),
        sortValue: (r) => (r.jdReady ? 1 : 0),
        exportValue: (r) => (r.jdReady ? 'ready' : !r.hasPurpose ? 'no purpose' : 'no KRAs'),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <StatusBadge status={r.status} label={pretty(r.status)} />,
        sortValue: (r) => r.status,
      },
    ],
    [company, navigate],
  );

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="reusable kinds of work — what a JD is generated from"
        actions={
          mayManage ? (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
              New role
            </Button>
          ) : null
        }
      />

      {error ? (
        <ErrorNotice error={error} onRetry={() => void load()} />
      ) : loading ? (
        <ListSkeleton rows={7} />
      ) : (
        <>
          <StatStrip stats={stats} />

          <Box sx={{ mt: 2, mb: 2 }}>
            <FilterBar search={search} onSearch={setSearch} placeholder="Search roles, codes, purpose…">
              <FacetChip label="All" active={!status && !gap} onClick={() => { setStatus(null); setGap(null); }} count={rows.length} />
              {['ACTIVE', 'DRAFT', 'RETIRED'].map((s) => (
                <FacetChip
                  key={s}
                  label={pretty(s)}
                  active={status === s}
                  onClick={() => setStatus(status === s ? null : s)}
                  count={rows.filter((r) => r.status === s).length}
                />
              ))}
              {gap && (
                <FacetChip
                  label={gap === 'purpose' ? 'No purpose' : 'No KRAs'}
                  active
                  onClick={() => setGap(null)}
                  count={filtered.length}
                />
              )}
            </FilterBar>
          </Box>

          <DataTable
            rows={filtered}
            columns={columns}
            getRowId={(r) => r.id}
            storageKey="cf_hrms:roles"
            exportName="cf_hrms-roles"
            defaultSortKey="title"
            onRowClick={(r) => navigate(`/${company}/cf_hrms/roles/${r.id}`)}
            empty={
              <EmptyState
                icon={<BadgeRounded />}
                title={rows.length ? 'Nothing matches those filters' : 'No roles yet'}
                hint={
                  rows.length
                    ? 'Clear the search or the chips to see every role.'
                    : 'A role is a kind of work — "Printing Operator". Create one, give it a purpose, then assign KRAs, responsibilities and KPIs from the masters.'
                }
                action={
                  mayManage && !rows.length ? (
                    <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
                      New role
                    </Button>
                  ) : undefined
                }
              />
            }
          />

          <Stack sx={{ mt: 2, fontSize: 12.5, color: 'var(--c-text-3)', maxWidth: 760, lineHeight: 1.6 }}>
            A role says what the work is. Where it sits is a Position, and who does it is a Work
            Assignment — one person can hold several at once.
          </Stack>
        </>
      )}

      <RoleFormDialog
        open={creating}
        role={null}
        onClose={() => {
          setCreating(false);
          if (params.get('new')) {
            params.delete('new');
            setParams(params, { replace: true });
          }
        }}
        onSaved={(role) => {
          setCreating(false);
          navigate(`/${company}/cf_hrms/roles/${role.id}`);
        }}
      />
    </>
  );
}
