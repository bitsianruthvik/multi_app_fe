import { useCallback, useMemo, useState } from 'react';
import { Box, Button, FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import BedtimeRounded from '@mui/icons-material/BedtimeRounded';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorNotice,
  FormDialog,
  ListSkeleton,
  Mono,
  PageHeader,
  StatSkeleton,
  StatStrip,
  StatusBadge,
  ToneBadge,
  useIsPermitted,
  useToast,
  type DataColumn,
  type Stat,
} from '@shared/ui';
import { orgApi, ORG_MANAGE, type Shift } from '../api/organisation';
import { ORG_STATUS_LABELS, ORG_STATUS_TONES, useOrgLoad } from '../components/OrgData';
import { OrgNote } from '../components/OrgNote';

/**
 * Shifts — the working patterns positions, assignments, rosters and attendance
 * all point at.
 *
 * THE ONE THING THIS SCREEN MUST GET RIGHT: a shift with no start and no end
 * time is FLEXIBLE, by design (init.sql §1e), not broken and not half-entered.
 * The seeded General shift is exactly that — an SME's office staff are expected
 * during the working day, and writing 09:00–18:00 against them would turn every
 * late arrival into a fabricated exception. So the table says "Flexible" in
 * words, the form says so in its helper text, and the backend refuses a shift
 * with only one of the two times, because THAT is the broken state.
 */

interface DraftState {
  id: number | null;
  code: string;
  name: string;
  flexible: boolean;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  graceInMinutes: string;
  graceOutMinutes: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const emptyDraft = (): DraftState => ({
  id: null,
  code: '',
  name: '',
  flexible: false,
  startTime: '09:00',
  endTime: '18:00',
  crossesMidnight: false,
  graceInMinutes: '0',
  graceOutMinutes: '0',
  status: 'ACTIVE',
});

export default function Shifts() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const load = useCallback(() => orgApi.shifts.list(), []);
  const { data, error, loading, reload } = useOrgLoad(load);
  const rows = useMemo(() => data ?? [], [data]);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Shift | null>(null);

  const stats: Stat[] = useMemo(() => {
    const flexible = rows.filter((r) => r.isFlexible).length;
    const inactive = rows.filter((r) => r.status === 'INACTIVE').length;
    const noGrace = rows.filter((r) => !r.isFlexible && !r.graceInMinutes).length;
    return [
      { label: 'Shifts', value: rows.length },
      {
        label: 'Flexible',
        value: flexible,
        tone: 'info',
        hint: 'No fixed hours, on purpose. Attendance treats presence during the working day as on time.',
      },
      {
        label: 'No grace period',
        value: noGrace,
        tone: 'warning',
        hint: 'A timed shift with zero grace marks someone late at one minute past. Set a few minutes unless that is the policy.',
      },
      { label: 'Inactive', value: inactive, tone: 'warning', hint: 'Kept for history; hidden from new pickers.' },
    ];
  }, [rows]);

  const openEdit = (row: Shift) =>
    setDraft({
      id: row.id,
      code: row.code,
      name: row.name,
      flexible: row.isFlexible,
      startTime: row.startTime ?? '09:00',
      endTime: row.endTime ?? '18:00',
      crossesMidnight: row.crossesMidnight,
      graceInMinutes: String(row.graceInMinutes),
      graceOutMinutes: String(row.graceOutMinutes),
      status: row.status,
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      code: draft.code,
      name: draft.name,
      // Flexible sends both times as null — that is the shape the model means
      // by "no fixed hours", and the backend rejects sending only one.
      startTime: draft.flexible ? null : draft.startTime,
      endTime: draft.flexible ? null : draft.endTime,
      crossesMidnight: draft.flexible ? false : draft.crossesMidnight,
      graceInMinutes: Number(draft.graceInMinutes) || 0,
      graceOutMinutes: Number(draft.graceOutMinutes) || 0,
      status: draft.status,
    };
    if (draft.id) await orgApi.shifts.update(draft.id, body);
    else await orgApi.shifts.create(body);
    success(draft.id ? 'Shift saved.' : 'Shift added.');
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.shifts.remove(doomed.id);
    success(`${doomed.name} deleted.`);
    reload();
  };

  const columns: DataColumn<Shift>[] = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        width: 90,
        render: (r) => <Mono chip>{r.code}</Mono>,
        sortValue: (r) => r.code,
      },
      { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
      {
        key: 'hours',
        header: 'Hours',
        render: (r) =>
          r.isFlexible ? (
            <ToneBadge
              tone="info"
              label="Flexible"
              title="No fixed hours — presence during the working day counts as on time."
            />
          ) : (
            <Mono tabular>{`${r.startTime} – ${r.endTime}`}</Mono>
          ),
        sortValue: (r) => r.startTime ?? '',
        exportValue: (r) => (r.isFlexible ? 'Flexible' : `${r.startTime}-${r.endTime}`),
      },
      {
        key: 'crossesMidnight',
        header: 'Crosses midnight',
        render: (r) =>
          r.crossesMidnight ? (
            <ToneBadge tone="neutral" icon={<BedtimeRounded fontSize="small" />} label="Overnight" />
          ) : (
            <Box component="span" sx={{ color: 'var(--c-text-3)' }}>
              —
            </Box>
          ),
        sortValue: (r) => (r.crossesMidnight ? 1 : 0),
        exportValue: (r) => (r.crossesMidnight ? 'yes' : 'no'),
      },
      {
        key: 'graceIn',
        header: 'Grace in',
        numeric: true,
        render: (r) => (r.isFlexible ? '—' : `${r.graceInMinutes} min`),
        sortValue: (r) => r.graceInMinutes,
      },
      {
        key: 'graceOut',
        header: 'Grace out',
        numeric: true,
        render: (r) => (r.isFlexible ? '—' : `${r.graceOutMinutes} min`),
        sortValue: (r) => r.graceOutMinutes,
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => (
          <StatusBadge status={r.status} map={ORG_STATUS_TONES} labelMap={ORG_STATUS_LABELS} />
        ),
        sortValue: (r) => r.status,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Shifts"
        subtitle="The working patterns rosters, attendance and assignments point at"
        actions={
          canManage ? (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft())}>
              New shift
            </Button>
          ) : undefined
        }
      />

      <OrgNote label="Reading this table" title="A shift with no hours is flexible, not unfinished.">
        General has no start or end time on purpose: staff are expected during the working day, and
        writing fixed hours against them would turn every late arrival into an exception that never
        really happened. A shift either has both times or neither — one alone is the state that is
        actually wrong, and it is refused.
      </OrgNote>

      <ErrorNotice error={error} fallback="Could not load shifts." onRetry={reload} />

      {loading ? (
        <>
          <StatSkeleton count={4} />
          <Box sx={{ mt: 2 }}>
            <ListSkeleton rows={4} />
          </Box>
        </>
      ) : (
        <>
          <StatStrip stats={stats} />
          <Box sx={{ mt: 2 }}>
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={(r) => r.id}
              storageKey="cf_hrms_shifts"
              exportName="shifts"
              defaultSortKey="code"
              rowActions={
                canManage
                  ? (row) => (
                      <>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDoomed(row)} aria-label={`Delete ${row.name}`}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )
                  : undefined
              }
              empty={
                <EmptyState
                  icon={<ScheduleRounded />}
                  title="No shifts yet"
                  hint="Most plants need three: a flexible General for staff, a Day and a Night. A shift is what a roster allocates and what attendance is judged against."
                  action={
                    canManage ? (
                      <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft())}>
                        Add the first shift
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </Box>
        </>
      )}

      <FormDialog
        open={!!draft}
        title={draft?.id ? 'Edit shift' : 'New shift'}
        subtitle="Leave the hours off for a shift with no fixed timing."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.code.trim() || !draft?.name.trim()}
      >
        {draft && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                required
                autoFocus
                size="small"
                sx={{ flex: '1 1 120px' }}
                helperText="G, D, N — matched without case"
              />
              <TextField
                label="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                size="small"
                sx={{ flex: '2 1 220px' }}
              />
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={draft.flexible}
                  onChange={(e) => setDraft({ ...draft, flexible: e.target.checked })}
                />
              }
              label="Flexible — no fixed hours"
            />
            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: -1.5 }}>
              For staff expected during the working day rather than between two clock times.
              Attendance will not judge them late.
            </Box>

            {!draft.flexible && (
              <>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Start time"
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
                    size="small"
                    sx={{ flex: '1 1 150px' }}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField
                    label="End time"
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
                    size="small"
                    sx={{ flex: '1 1 150px' }}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={draft.crossesMidnight}
                      onChange={(e) => setDraft({ ...draft, crossesMidnight: e.target.checked })}
                    />
                  }
                  label="Crosses midnight"
                />
                <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: -1.5 }}>
                  Stored rather than guessed from the clock, so a night shift is never silently
                  treated as an eight-hour day. It must agree with the times.
                </Box>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Grace in (minutes)"
                    type="number"
                    value={draft.graceInMinutes}
                    onChange={(e) => setDraft({ ...draft, graceInMinutes: e.target.value })}
                    size="small"
                    sx={{ flex: '1 1 150px' }}
                  />
                  <TextField
                    label="Grace out (minutes)"
                    type="number"
                    value={draft.graceOutMinutes}
                    onChange={(e) => setDraft({ ...draft, graceOutMinutes: e.target.value })}
                    size="small"
                    sx={{ flex: '1 1 150px' }}
                  />
                </Box>
              </>
            )}

            <TextField
              select
              label="Status"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as DraftState['status'] })}
              size="small"
              fullWidth
            >
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
            </TextField>
          </>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Delete this shift?"
        entityName={doomed ? `${doomed.code} — ${doomed.name}` : undefined}
        body="Positions, assignments, rosters, attendance rows and manpower requirements that use it will block the delete and say how many. Set it inactive to retire it instead."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
