import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader,
  StatStrip, StatusBadge,
} from '@shared/ui';
import type { DataColumn, Stat, StatusTone } from '@shared/ui';
import type { PositionListResult, PositionOptions, PositionRow } from '../api/positions';
import { positionsApi } from '../api/positions';
import { PositionFormDialog } from '../components/PositionDialogs';
import { usePositionRemoval } from '../components/usePositionRemoval';
import { useCan } from '../access/can';
import { vacantLabel } from '../api/hiring';
import { NoticeChip } from '../components/Leaving';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { RowActions } from '../components/list/RowActions';
import { ExcelButtons } from '../components/excel/ExcelButtons';

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
  const can = useCan();
  const [params, setParams] = useSearchParams();

  const [data, setData] = useState<PositionListResult | null>(null);
  const [options, setOptions] = useState<PositionOptions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PositionRow | null>(null);
  const filters = useListFilters(['department', 'role', 'shift', 'state', 'status', 'location']);

  // The server does the filtering (GET /positions takes the same parameters the Excel
  // download does) and answers `total` (before the filters) and `count` (after), so
  // the count line, the table and the file can never disagree. The address settles
  // ~250 ms after the last keystroke, so a search does not ask on every key.
  const query = filters.params;
  const querySig = JSON.stringify(query);
  const load = useCallback(() => {
    setLoading(true);
    positionsApi.list(JSON.parse(querySig) as Record<string, string>)
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [querySig]);

  useEffect(() => { load(); }, [load]);
  // Close or delete a position. The dialog reads what it would do to the team BEFORE it offers anything.
  const removal = usePositionRemoval({ onDone: () => load() });
  useEffect(() => { positionsApi.options().then(setOptions).catch(() => setOptions(null)); }, []);

  // The shell's quick-create sends people here with ?new=1.
  useEffect(() => {
    if (params.get('new') === '1' && can.positions.edit) {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams, can.positions.edit]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const filterDefs: FilterDef[] = useMemo(() => [
    { key: 'department', label: 'Department (and below)', searchable: true, options: (options?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name })) },
    { key: 'role', label: 'Role', searchable: true, options: (options?.roles ?? []).map((r) => ({ value: String(r.id), label: r.name })) },
    { key: 'shift', label: 'Shift', options: (options?.shifts ?? []).map((s) => ({ value: String(s.id), label: s.name })) },
    {
      key: 'state', label: 'State',
      options: [
        { value: 'filled', label: 'Filled' },
        { value: 'vacant', label: 'Vacant' },
        { value: 'hiring', label: 'Hiring open' },
        { value: 'notice', label: 'On notice' },
      ],
    },
    { key: 'status', label: 'Status', options: (options?.positionStatuses ?? []).map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
    { key: 'location', label: 'Location', options: (options?.locations ?? []).map((l) => ({ value: String(l.id), label: l.name })) },
  ], [options]);

  const stats: Stat[] = useMemo(() => {
    const vacant = items.filter(isVacantRow).length;
    return [
      { label: 'Filled', value: items.length - vacant, tone: 'success', hint: 'Positions with somebody in them today.' },
      // Deliberately toneless: a vacancy is a fact, not an error.
      { label: 'Vacant', value: vacant, hint: 'Positions with nobody in them. A fact to plan against, not a failure.' },
    ];
  }, [items]);

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
      // A hiring in progress is still a vacancy: the same quiet colour, with the candidate named.
      render: (p) => (isVacantRow(p)
        ? <Typography component="span" sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>{vacantLabel(p) ?? 'Vacant'}</Typography>
        : (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography component="span" sx={{ fontSize: 13.5 }}>{p.occupant?.name ?? 'Filled'}</Typography>
            {p.occupant?.notice && <NoticeChip notice={p.occupant.notice} />}
          </Box>
        )),
      sortValue: (p) => (isVacantRow(p) ? '' : p.occupant?.name ?? ''),
      exportValue: (p) => (isVacantRow(p) ? (vacantLabel(p) ? `Vacant (${vacantLabel(p)})` : 'Vacant') : p.occupant?.name ?? 'Filled'),
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
      />

      <StatStrip stats={stats} />

      <Box sx={{ mt: 2 }}>
        <ListToolbar
          filters={filters}
          defs={filterDefs}
          shown={data?.count ?? items.length}
          total={data?.total ?? items.length}
          noun={['position', 'positions']}
          searchPlaceholder="Search by code, title, role or person"
          add={can.positions.edit ? { label: 'New position', onClick: () => setCreating(true) } : undefined}
          excel={
            <ExcelButtons
              entity="positions"
              noun={['position', 'positions']}
              filters={filters.params}
              count={data?.count ?? items.length}
              canDownload={can.positions.view}
              canUpload={can.positions.upload}
              onApplied={load}
            />
          }
        />
      </Box>

      {error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !data ? (
        <ListSkeleton rows={6} />
      ) : (
        <DataTable
          rows={items}
          columns={columns}
          getRowId={(p) => p.id}
          onRowClick={(p) => navigate(`/${company}/cf_hrms/positions/${p.id}`)}
          rowActions={
            can.positions.edit || can.positions.remove
              ? (p) => (
                  <RowActions
                    name={p.displayTitle}
                    onEdit={can.positions.edit ? () => setEditing(p) : undefined}
                    onRemove={can.positions.remove && removal.busyId !== p.id ? () => { void removal.start(p.id); } : undefined}
                    removeLabel="Close"
                  />
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
              title={(data?.total ?? 0) > 0 ? 'No positions match this filter' : 'No positions yet'}
              hint={
                (data?.total ?? 0) > 0
                  ? 'Clear the filter to see every position.'
                  : 'A position is one chair for one person on one shift. It is optional — people can do work without one — but it is what makes vacancies countable.'
              }
              action={
                (data?.total ?? 0) > 0
                  ? <Button size="small" onClick={filters.clear}>Clear the filters</Button>
                  : can.positions.edit ? <Button variant="contained" size="small" onClick={() => setCreating(true)}>New position</Button> : undefined
              }
            />
          }
        />
      )}

      {removal.dialog}

      <PositionFormDialog
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onDone={(id) => {
          if (editing) { setEditing(null); load(); return; }
          setCreating(false);
          navigate(`/${company}/cf_hrms/positions/${id}`);
        }}
        options={options}
        position={editing}
      />
    </>
  );
}
