import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EventSeatRounded from '@mui/icons-material/EventSeatRounded';
import {
  DataTable, EmptyState, ErrorNotice, FilterBar, ListSkeleton, Mono, PageHeader,
  StatStrip, StatusBadge, useIsPermitted,
} from '@shared/ui';
import type { DataColumn, Stat, StatusTone } from '@shared/ui';
import type { PositionListResult, PositionOptions, PositionRow } from '../api/positions';
import { positionsApi } from '../api/positions';
import { PositionFormDialog } from '../components/PositionDialogs';

/**
 * Positions — the sanctioned seats (DESIGN_SYSTEM.md §4.2 Collection).
 *
 * The StatStrip answers the only question a headcount screen is really asked:
 * how many seats, how many filled, how many empty. All three are computed over
 * the SAME filtered rows the table shows, so they can never disagree with it.
 *
 * VACANCY IS NOT COLOURED AS A FAILURE. 156 of Karni's 169 seats are vacant and
 * that is the truth this system exists to show, not an alarm. Only an
 * over-filled seat — more people than the company sanctioned — gets a warning
 * tone, because that one is an inconsistency somebody has to resolve.
 */

const STATUS_TONES: Record<string, StatusTone> = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  FROZEN: 'info',
  CLOSED: 'neutral',
};

export default function Positions() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState<PositionListResult | null>(null);
  const [options, setOptions] = useState<PositionOptions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    positionsApi.list({ search, status, departmentId })
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [search, status, departmentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { positionsApi.options().then(setOptions).catch(() => setOptions(null)); }, []);

  // The shell's quick-create sends people here with ?new=1.
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
      { label: 'Sanctioned seats', value: t?.sanctioned ?? 0, hint: 'Headcount the company has approved, across the rows below.' },
      { label: 'Filled', value: t?.filled ?? 0, tone: 'success', hint: 'Active work assignments against these positions today.' },
      // Deliberately toneless: a vacancy is a fact, not an error.
      { label: 'Vacant', value: t?.vacant ?? 0, hint: 'Sanctioned minus filled. A fact to plan against, not a failure.' },
      { label: 'Over-filled seats', value: t?.overFilled ?? 0, tone: 'warning', hint: 'More people assigned than the seat sanctions — worth resolving.' },
    ];
  }, [data]);

  const columns: DataColumn<PositionRow>[] = useMemo(() => [
    {
      key: 'code', header: 'Code', width: 150, alwaysVisible: true,
      render: (p) => <Mono sx={{ fontSize: 12.5 }}>{p.positionCode ?? '—'}</Mono>,
      sortValue: (p) => p.positionCode ?? '',
      exportValue: (p) => p.positionCode ?? '',
    },
    {
      key: 'title', header: 'Role / title',
      render: (p) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{p.displayTitle}</Typography>
          {p.positionTitle && p.roleTitle && p.positionTitle !== p.roleTitle && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Role: {p.roleTitle}</Typography>
          )}
        </Stack>
      ),
      sortValue: (p) => p.displayTitle,
      exportValue: (p) => p.displayTitle,
    },
    { key: 'department', header: 'Department', render: (p) => p.departmentName ?? '—', sortValue: (p) => p.departmentName ?? '' },
    { key: 'location', header: 'Location', render: (p) => p.locationName ?? '—', sortValue: (p) => p.locationName ?? '' },
    { key: 'shift', header: 'Shift', width: 110, defaultHidden: true, render: (p) => p.shiftCode ?? '—', sortValue: (p) => p.shiftCode ?? '' },
    {
      key: 'sanctioned', header: 'Sanctioned', numeric: true, align: 'right', width: 110,
      render: (p) => <Mono sx={{ fontSize: 13 }}>{p.sanctionedHeadcount}</Mono>,
      sortValue: (p) => p.sanctionedHeadcount,
    },
    {
      key: 'filled', header: 'Filled', numeric: true, align: 'right', width: 90,
      render: (p) => <Mono sx={{ fontSize: 13 }}>{p.filledCount}</Mono>,
      sortValue: (p) => p.filledCount,
    },
    {
      key: 'vacant', header: 'Vacant', numeric: true, align: 'right', width: 90,
      render: (p) => (
        <Mono sx={{ fontSize: 13, color: p.overFilled ? 'var(--c-warning-700)' : 'var(--c-text-1)' }}>
          {p.overFilled ? `+${p.filledCount - p.sanctionedHeadcount} over` : p.vacancyCount}
        </Mono>
      ),
      sortValue: (p) => p.vacancyCount,
      exportValue: (p) => p.vacancyCount,
    },
    {
      key: 'status', header: 'Status', width: 130,
      render: (p) => <StatusBadge status={p.status} map={STATUS_TONES} />,
      sortValue: (p) => p.status,
    },
  ], []);

  if (error && !data) return <ErrorNotice error={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Positions"
        subtitle="sanctioned seats — the organisation's design, independent of who fills it"
        actions={
          canManage && (
            <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
              New position
            </Button>
          )
        }
      />

      <StatStrip stats={stats} />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, title or role…">
        <TextField
          select size="small" value={status} onChange={(e) => setStatus(e.target.value)}
          sx={{ minWidth: 150 }} label="Status" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
        >
          <MenuItem value="">Any status</MenuItem>
          {(options?.positionStatuses ?? []).map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}
          sx={{ minWidth: 180 }} label="Department" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }}
        >
          <MenuItem value="">Any department</MenuItem>
          {(options?.departments ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
        </TextField>
      </FilterBar>

      {error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <DataTable
          rows={data?.items ?? []}
          columns={columns}
          getRowId={(p) => p.id}
          onRowClick={(p) => navigate(`/${company}/cf_hrms/positions/${p.id}`)}
          loading={loading}
          storageKey="cf_hrms.positions"
          exportName="positions"
          defaultSortKey="title"
          empty={
            <EmptyState
              icon={<EventSeatRounded />}
              title={search || status || departmentId ? 'No positions match this filter' : 'No positions yet'}
              hint={
                search || status || departmentId
                  ? 'Clear the filter to see every sanctioned seat.'
                  : 'A position is a sanctioned seat. It is optional — people can hold work assignments without one — but it is what makes vacancies countable.'
              }
              action={canManage && !search ? <Button variant="contained" size="small" onClick={() => setCreating(true)}>New position</Button> : undefined}
            />
          }
        />
      )}

      <PositionFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onDone={(id) => { setCreating(false); navigate(`/${company}/cf_hrms/positions/${id}`); }}
        options={options}
        position={null}
      />
    </>
  );
}
