import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import {
  DataTable, DateCell, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, useToast,
  type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  CLOSE_REASON_LABEL, hiringApi, niceDate,
  type CloseReason, type Hiring as HiringFull, type HiringSummary,
} from '../api/hiring';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { RowActions } from '../components/list/RowActions';
import { useListFilters } from '../components/list/useListFilters';
import { positionsApi, type PositionOptions } from '../api/positions';
import { HiringCloseDialog } from '../components/HiringCloseDialog';
import { labelFilterDefs, useLabels } from '../components/labels';
import { useUnitKinds } from '../components/orgUnits';

/**
 * Hiring — every hiring, open first (DESIGN_SYSTEM.md §4.2 Collection).
 *
 * A hiring belongs to a POSITION, and that is where one starts ("Hire a new
 * person" on a vacant position). This screen is where they are found again:
 * the ones in progress, the ones that ended with an employee, and the ones that
 * were closed without one.
 *
 * The status line on each row is the server's sentence, shown as written.
 */

// Without a `status` in the address the list is the hirings in progress, and says so
// to the server (and to the toolbar) rather than leaving it to be guessed.
const DEFAULTS = { status: 'open' };

const STAGES: { value: string; label: string }[] = [
  { value: 'JD', label: 'Job description' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'APPOINTMENT', label: 'Appointment' },
  { value: 'DONE', label: 'Done' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function Hiring() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  // `label`: the label of the position's department.
  const filters = useListFilters(['status', 'stage', 'department', 'label', 'role'], { defaults: DEFAULTS });
  const { labels: labelList } = useLabels(can.org.view || can.positions.view);
  const tab = filters.params.status ?? 'open';
  const [rows, setRows] = useState<HiringSummary[] | null>(null);
  const [counts, setCounts] = useState<{ total: number; count: number } | null>(null);
  const [options, setOptions] = useState<PositionOptions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState<HiringFull | null>(null);

  const openClose = (id: number) => {
    hiringApi
      .get(id)
      .then((r) => setClosing(r.hiring))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not open this hiring.'));
  };

  // The server filters (GET /hirings takes the same parameters as the list) and
  // answers `total` (the chosen status) and `count` (what is left).
  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    setLoading(true);
    hiringApi
      .list(JSON.parse(querySig) as Record<string, string>)
      .then((r) => {
        const list = r.hirings ?? [];
        setRows(list);
        setCounts({ total: r.total ?? list.length, count: r.count ?? list.length });
        setError(null);
      })
      .catch((e) => {
        setError(e);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [querySig]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    positionsApi.options().then(setOptions).catch(() => setOptions(null));
  }, []);

  const shown = rows ?? [];

  const defs: FilterDef[] = useMemo(() => {
    // The company's own lists when this login may read them, else what the rows carry.
    const depts = new Map<number, string>((options?.departments ?? []).map((d) => [d.id, d.name]));
    const roles = new Map<number, string>((options?.roles ?? []).map((x) => [x.id, x.name]));
    for (const r of rows ?? []) {
      if (r.departmentId != null && r.departmentName && !depts.has(r.departmentId)) depts.set(r.departmentId, r.departmentName);
      if (!roles.has(r.roleId)) roles.set(r.roleId, r.roleTitle);
    }
    const byName = (x: [number, string], y: [number, string]) => x[1].localeCompare(y[1]);
    const asOptions = (m: Map<number, string>) =>
      [...m.entries()].sort(byName).map(([id, t]) => ({ value: String(id), label: t }));
    return [
      {
        key: 'status',
        label: 'Show',
        defaultValue: 'open',
        options: [
          { value: 'open', label: 'Open (in progress)' },
          { value: 'done', label: 'Done' },
          { value: 'closed', label: 'Closed' },
          { value: 'all', label: 'All' },
        ],
      },
      { key: 'stage', label: 'Stage', options: STAGES },
      { key: 'department', label: 'Org unit (and below)', searchable: true, options: asOptions(depts) },
      ...labelFilterDefs(labelList),
      { key: 'role', label: 'Role', searchable: true, options: asOptions(roles) },
    ];
  }, [rows, options, labelList]);

  const withKind = useUnitKinds();
  const columns: DataColumn<HiringSummary>[] = useMemo(
    () => [
      {
        key: 'candidate',
        header: 'Candidate',
        alwaysVisible: true,
        render: (r) => (
          <Stack spacing={0.25} sx={{ minWidth: 0 }}>
            {r.candidateName?.trim() ? (
              <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.candidateName}</Typography>
            ) : (
              <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)', fontStyle: 'italic' }}>No candidate yet</Typography>
            )}
            {r.employee && (
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                Employee <Mono sx={{ fontSize: 12 }}>{r.employee.employeeCode}</Mono>
              </Typography>
            )}
          </Stack>
        ),
        sortValue: (r) => r.candidateName ?? '',
        exportValue: (r) => r.candidateName ?? '',
      },
      // Second, so it is on screen without scrolling the table sideways on a phone.
      {
        key: 'status',
        header: 'Where it stands',
        render: (r) => (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text)' }}>
            {r.statusLine}
            {/* Waiting between the yes and the first day: when they said yes, and when they are due. */}
            {r.stage === 'APPOINTMENT' && (r.offerAcceptedOn || r.proposedJoiningDate) && (
              <Box component="span" data-waiting="" sx={{ display: 'block', fontSize: 12, color: 'var(--c-text-2)' }}>
                {[
                  r.offerAcceptedOn ? `Accepted ${niceDate(r.offerAcceptedOn)}` : null,
                  r.proposedJoiningDate ? `joining ${niceDate(r.proposedJoiningDate)}` : null,
                ].filter(Boolean).join(' · ')}
              </Box>
            )}
          </Typography>
        ),
        sortValue: (r) => r.statusLine,
        exportValue: (r) => r.statusLine,
      },
      { key: 'role', header: 'Role', render: (r) => r.roleTitle, sortValue: (r) => r.roleTitle, exportValue: (r) => r.roleTitle },
      {
        key: 'position',
        header: 'Position',
        width: 120,
        render: (r) => <Mono sx={{ fontSize: 12.5 }}>{r.positionCode ?? '—'}</Mono>,
        sortValue: (r) => r.positionCode ?? '',
        exportValue: (r) => r.positionCode ?? '',
      },
      {
        key: 'department',
        header: 'Org unit',
        render: (r) => withKind(r.departmentName, r.departmentId) || '—',
        sortValue: (r) => r.departmentName ?? '',
        exportValue: (r) => withKind(r.departmentName, r.departmentId),
      },
      {
        key: 'shift',
        header: 'Shift',
        width: 110,
        render: (r) => r.shift?.name ?? '—',
        sortValue: (r) => r.shift?.name ?? '',
        exportValue: (r) => r.shift?.name ?? '',
      },
      // Why a hiring was closed, in the server's words (§3.4). Empty on the other two tabs.
      {
        key: 'reason',
        header: 'Why it closed',
        render: (r) => (r.stage === 'CLOSED' ? r.closeReasonLabel ?? CLOSE_REASON_LABEL[r.closeReason as CloseReason] ?? r.closeReason ?? '—' : '—'),
        sortValue: (r) => r.closeReasonLabel ?? r.closeReason ?? '',
        exportValue: (r) => r.closeReasonLabel ?? r.closeReason ?? '',
      },
      {
        key: 'ref',
        header: 'Letter reference',
        defaultHidden: true,
        render: (r) => (r.refNo ? <Mono sx={{ fontSize: 12.5 }}>{r.refNo}</Mono> : '—'),
        sortValue: (r) => r.refNo ?? '',
        exportValue: (r) => r.refNo ?? '',
      },
      {
        key: 'updated',
        header: 'Updated',
        width: 120,
        render: (r) => <DateCell value={r.updatedAt} />,
        sortValue: (r) => r.updatedAt,
        exportValue: (r) => r.updatedAt,
      },
      {
        key: 'actions',
        header: '',
        alwaysVisible: true,
        width: 110,
        align: 'right',
        render: (r) => {
          const inProgress = r.stage !== 'DONE' && r.stage !== 'CLOSED';
          const who = r.candidateName?.trim() || `${r.roleTitle} hiring`;
          return (
            <RowActions
              name={who}
              onEdit={() => navigate(`/${company}/cf_hrms/hiring/${r.id}`)}
              editLabel={inProgress ? 'Continue' : 'Open'}
              onRemove={can.hiring.edit && inProgress ? () => openClose(r.id) : undefined}
              removeLabel="Close"
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [can.hiring.edit, company, withKind],
  );

  const emptyTitle =
    tab === 'open' ? 'No hiring in progress' : tab === 'done' ? 'Nobody has been hired through here yet' : tab === 'closed' ? 'No closed hirings' : 'No hirings yet';
  const emptyHint =
    tab === 'open'
      ? 'A hiring starts from a position. Open a vacant position and choose Hire a new person.'
      : tab === 'done'
        ? 'A hiring is done when the appointment letter is generated and the employee is created.'
        : tab === 'closed'
          ? 'A hiring that ended without an employee — declined, lapsed or cancelled — is listed here.'
          : 'A hiring starts from a vacant position.';

  return (
    <>
      <PageHeader
        title="Hiring"
        subtitle="one hiring per vacant position — job description, offer, appointment, and then the employee"
      />

      <ListToolbar
        filters={filters}
        defs={defs}
        shown={counts?.count ?? shown.length}
        total={counts?.total}
        noun={['hiring', 'hirings']}
        searchPlaceholder="Search candidate, role, position or reference"
        extra={
          // A shortcut to another area's screen: only for someone who may open it.
          can.positions.view ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate(`/${company}/cf_hrms/positions`)}
              sx={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Find a vacant position
            </Button>
          ) : undefined
        }
      />
      <Typography sx={{ mt: -1, mb: 2, px: 0.5, fontSize: 13, color: 'var(--c-text-2)' }}>
        A hiring starts on a vacant position.
      </Typography>

      {!!error && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !rows ? (
        <ListSkeleton rows={5} />
      ) : (
        <Box data-hiringlist={tab}>
          <DataTable
            rows={shown}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={(r) => navigate(`/${company}/cf_hrms/hiring/${r.id}`)}
            loading={loading}
            storageKey="cf_hrms.hiring"
            exportName={`hiring-${tab}`}
            defaultSortKey="updated"
            empty={
              <EmptyState
                icon={<PersonSearchRounded />}
                title={filters.isFiltered ? 'No hiring matches these filters' : emptyTitle}
                hint={filters.isFiltered ? 'Clear the search and filters to see every hiring in this list.' : emptyHint}
                action={
                  filters.isFiltered ? (
                    <Button size="small" onClick={filters.clear}>Clear</Button>
                  ) : tab === 'open' && can.positions.view ? (
                    <Button size="small" variant="contained" onClick={() => navigate(`/${company}/cf_hrms/positions`)}>
                      Find a vacant position
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </Box>
      )}

      {closing && (
        <HiringCloseDialog
          open
          hiring={closing}
          onClose={() => setClosing(null)}
          onClosed={() => {
            setClosing(null);
            toast.success('Hiring closed. The position is vacant again.');
            load();
          }}
        />
      )}
    </>
  );
}
