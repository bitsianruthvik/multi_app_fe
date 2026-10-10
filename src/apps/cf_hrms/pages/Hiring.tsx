import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import {
  DataTable, DateCell, EmptyState, ErrorNotice, FacetChip, FilterBar, ListSkeleton, Mono, PageHeader,
  type DataColumn,
} from '@shared/ui';
import { CLOSE_REASON_LABEL, hiringApi, type CloseReason, type HiringSummary } from '../api/hiring';

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

type Tab = 'open' | 'done' | 'closed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
];

export default function Hiring() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<HiringSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    hiringApi
      .list({ status: tab })
      .then((r) => {
        setRows(r.hirings ?? []);
        setError(null);
      })
      .catch((e) => {
        setError(e);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.candidateName, r.roleTitle, r.positionCode, r.departmentName, r.refNo, r.employee?.employeeCode]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

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
            {r.stage === 'CLOSED' && r.closeReason
              ? `${r.statusLine}${r.statusLine.toLowerCase().includes(r.closeReason.toLowerCase()) ? '' : ` — ${CLOSE_REASON_LABEL[r.closeReason as CloseReason] ?? r.closeReason}`}`
              : r.statusLine}
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
        header: 'Department',
        render: (r) => r.departmentName ?? '—',
        sortValue: (r) => r.departmentName ?? '',
        exportValue: (r) => r.departmentName ?? '',
      },
      {
        key: 'shift',
        header: 'Shift',
        width: 110,
        render: (r) => r.shift?.name ?? '—',
        sortValue: (r) => r.shift?.name ?? '',
        exportValue: (r) => r.shift?.name ?? '',
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
    ],
    [],
  );

  const emptyTitle =
    tab === 'open' ? 'No hiring in progress' : tab === 'done' ? 'Nobody has been hired through here yet' : 'No closed hirings';
  const emptyHint =
    tab === 'open'
      ? 'A hiring starts from a position. Open a vacant position and choose Hire a new person.'
      : tab === 'done'
        ? 'A hiring is done when the appointment letter is generated and the employee is created.'
        : 'A hiring that ended without an employee — declined, lapsed or cancelled — is listed here.';

  return (
    <>
      <PageHeader
        title="Hiring"
        subtitle="one hiring per vacant position — job description, offer, appointment, and then the employee"
        actions={
          <Button size="small" variant="outlined" onClick={() => navigate(`/${company}/cf_hrms/positions`)}>
            Find a vacant position
          </Button>
        }
      />

      <FilterBar search={search} onSearch={setSearch} placeholder="Search candidate, role or position…">
        {TABS.map((t) => (
          <FacetChip
            key={t.key}
            label={t.label}
            active={tab === t.key}
            onClick={() => setTab(t.key)}
            count={tab === t.key && rows ? rows.length : undefined}
          />
        ))}
      </FilterBar>

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
                title={search ? 'No hiring matches this search' : emptyTitle}
                hint={search ? 'Clear the search to see every hiring in this list.' : emptyHint}
                action={
                  !search && tab === 'open' ? (
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
    </>
  );
}
