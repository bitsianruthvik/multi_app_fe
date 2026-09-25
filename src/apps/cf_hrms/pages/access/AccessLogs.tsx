import { useCallback, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import ReportGmailerrorredRounded from '@mui/icons-material/ReportGmailerrorredRounded';
import {
  DataTable,
  EmptyState,
  ErrorNotice,
  Mono,
  PageHeader,
  StatusBadge,
  type DataColumn,
} from '@shared/ui';
import { accessApi, type ErrorLogRow } from '../../api/access';

/**
 * Error logs — recent server-side failures (DESIGN_SYSTEM.md §4.2).
 *
 * Read-only by nature, so it is a table and nothing else. What it replaces was
 * a hand-laid `<Table>` with no sort, no column control, no export and a
 * "Loading…" cell; on the kit's DataTable all of that arrives for free and the
 * screen matches every other list in the app.
 *
 * WHAT THE EMPTY STATE HAS TO SAY. `GET /admin/error-logs` is a real,
 * authenticated endpoint that currently answers `[]` unconditionally — no log
 * table is configured on this platform. An empty state reading "No errors" would
 * therefore be a lie of the most reassuring kind: an administrator would take
 * silence here as evidence that nothing is wrong. It says instead that nothing
 * is being recorded, and where the errors actually are.
 */

/** A log level is a status: icon, label and colour, never colour alone (§6-2). */
const LEVEL_TONE = {
  error: 'danger',
  fatal: 'danger',
  warn: 'warning',
  warning: 'warning',
  info: 'info',
  debug: 'neutral',
} as const;

const columns: DataColumn<ErrorLogRow>[] = [
  {
    key: 'level',
    header: 'Level',
    width: 110,
    sortValue: (r) => r.level ?? '',
    exportValue: (r) => r.level ?? '',
    render: (r) =>
      r.level ? (
        <StatusBadge
          status={r.level}
          tone={LEVEL_TONE[r.level.toLowerCase() as keyof typeof LEVEL_TONE] ?? 'neutral'}
        />
      ) : (
        <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>
      ),
  },
  {
    key: 'message',
    header: 'Message',
    sortValue: (r) => r.message ?? '',
    exportValue: (r) => r.message ?? '',
    render: (r) => <Box sx={{ fontSize: 'var(--row-fs)' }}>{r.message ?? '—'}</Box>,
  },
  {
    key: 'context',
    header: 'Context',
    sortValue: (r) => r.context ?? '',
    exportValue: (r) => r.context ?? '',
    render: (r) =>
      r.context ? <Mono sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{r.context}</Mono> : '—',
  },
  {
    key: 'created_at',
    header: 'When',
    width: 200,
    sortValue: (r) => r.created_at ?? '',
    exportValue: (r) => r.created_at ?? '',
    render: (r) =>
      r.created_at ? <Mono sx={{ fontSize: 12 }}>{r.created_at}</Mono> : '—',
  },
  {
    key: 'id',
    header: 'ID',
    width: 90,
    numeric: true,
    defaultHidden: true,
    sortValue: (r) => r.id,
    exportValue: (r) => r.id,
    render: (r) => <Mono sx={{ fontSize: 12 }}>{r.id}</Mono>,
  },
];

export default function AccessLogs() {
  const [logs, setLogs] = useState<ErrorLogRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await accessApi.errorLogs();
      setLogs(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err);
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Error logs"
        subtitle="Server-side failures recorded for this company"
      />

      {error ? <ErrorNotice error={error} onRetry={load} /> : null}

      <DataTable
        rows={logs ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        loading={logs === null}
        storageKey="cf_hrms:access-logs"
        exportName="error-logs"
        defaultSortKey="created_at"
        defaultSortDir="desc"
        empty={
          <EmptyState
            icon={<ReportGmailerrorredRounded />}
            title="Nothing is being recorded"
            body="This platform has no error-log table, so the endpoint behind this screen always answers with an empty list. It is not evidence that nothing has gone wrong."
            hint="Server errors are in the backend's own console output (locally) or the host's log stream (in production)."
          />
        }
      />
    </>
  );
}
