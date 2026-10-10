import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  DataTable, EmptyState, ErrorNotice, FilterBar, ListSkeleton, Mono, PageHeader,
  StatStrip, StatusBadge, useIsPermitted,
} from '@shared/ui';
import type { DataColumn, Stat, StatusTone } from '@shared/ui';
import type { PositionListResult, PositionOptions, PositionRow } from '../api/positions';
import { positionsApi } from '../api/positions';
import { PositionFormDialog } from '../components/PositionDialogs';
import { usePositionRemoval } from '../components/usePositionRemoval';

/**
 * Positions — one chair for one person on one shift (DESIGN_SYSTEM.md §4.2 Collection).
 *
 * The StatStrip answers the only question a staffing screen is really asked:
 * how many positions, how many filled, how many empty. All three are computed
 * over the SAME filtered rows the table shows, so they can never disagree with it.
 *
 * VACANCY IS NOT COLOURED AS A FAILURE. Most of Karni's positions are vacant and
 * that is the truth this system exists to show, not an alarm.
 */

const shiftNameOf = (p: PositionRow) => p.shift?.name ?? p.shiftName;
const isVacantRow = (p: PositionRow) => p.occupant === null || (p.occupant === undefined && p.filledCount === 0);

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
  // Close or delete a position. The dialog reads what it would do to the team BEFORE it offers anything.
  const removal = usePositionRemoval({ onDone: () => load() });
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
    const items = data?.items ?? [];
    const vacant = items.filter(isVacantRow).length;
    return [
      { label: 'Positions', value: data?.total ?? items.length, hint: 'One person each, on one shift, across the rows below.' },
      { label: 'Filled', value: items.length - vacant, tone: 'success', hint: 'Positions with somebody in them today.' },
      // Deliberately toneless: a vacancy is a fact, not an error.
      { label: 'Vacant', value: vacant, hint: 'Positions with nobody in them. A fact to plan against, not a failure.' },
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
    {
      key: 'shift', header: 'Shift', width: 120,
      render: (p) => shiftNameOf(p) ?? '—',
      sortValue: (p) => shiftNameOf(p) ?? '',
      exportValue: (p) => shiftNameOf(p) ?? '',
    },
    {
      key: 'person', header: 'Person', width: 190,
      render: (p) => (isVacantRow(p)
        ? <Typography component="span" sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>Vacant</Typography>
        : <Typography component="span" sx={{ fontSize: 13.5 }}>{p.occupant?.name ?? 'Filled'}</Typography>),
      sortValue: (p) => (isVacantRow(p) ? '' : p.occupant?.name ?? ''),
      exportValue: (p) => (isVacantRow(p) ? 'Vacant' : p.occupant?.name ?? 'Filled'),
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
        subtitle="one chair for one person, on one shift — the organisation's design, independent of who fills it"
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
          rowActions={
            canManage
              ? (p) => (
                  <Tooltip title="Close or delete this position…">
                    {/* A disabled IconButton fires no events, so the tooltip needs a wrapper to hover. */}
                    <Box component="span">
                      <IconButton
                        size="small"
                        disabled={removal.busyId === p.id}
                        onClick={() => { void removal.start(p.id); }}
                        aria-label={`Close or delete ${p.displayTitle}`}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Box>
                  </Tooltip>
                )
              : undefined
          }
          loading={loading}
          storageKey="cf_hrms.positions"
          exportName="positions"
          defaultSortKey="title"
          empty={
            <EmptyState
              icon={<BadgeRounded />}
              title={search || status || departmentId ? 'No positions match this filter' : 'No positions yet'}
              hint={
                search || status || departmentId
                  ? 'Clear the filter to see every position.'
                  : 'A position is one chair for one person on one shift. It is optional — people can hold work assignments without one — but it is what makes vacancies countable.'
              }
              action={canManage && !search ? <Button variant="contained" size="small" onClick={() => setCreating(true)}>New position</Button> : undefined}
            />
          }
        />
      )}

      {removal.dialog}

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
