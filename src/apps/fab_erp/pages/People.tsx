/**
 * People.tsx — the floor roster.
 *
 * This is where you come to REVIEW the roster, not where you're forced to come
 * to record it. Adding someone and moving them between machines both happen
 * inline on the Machine Board and the Shift Log (see CrewPanel), because a
 * settings screen is where roster data goes to get stale — and stale crew data
 * is worse than none, since `no_operator` attribution is computed from it.
 *
 * What this screen deliberately does NOT show: hours worked, time away totals,
 * attendance percentages. It answers "who works here and where are they",
 * which is what traceability and capacity planning need. It does not measure
 * people. See FAB_ERP_PEOPLE_PLAN.md §0 for why that boundary is load-bearing
 * rather than squeamish.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip, Typography } from '@mui/material';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import {
  getRoster, updateWorker, workerStatus, WORKER_TYPE_LABELS, type Worker, type WorkerType,
} from '../api/workers';
import { fabQuery } from '../api/client';
import {
  PageHeader, DataTable, StatStrip, ListSkeleton, EmptyState, Mono, useToast,
  FormDialog, backendMessage, PersonSheet, AddPeopleDialog, shiftSpan,
  LeaveDialog, ExitWorkerDialog,
  type Stat, type ShiftOption, type MachineOption,
} from '../components';

const TYPE_TONE: Record<WorkerType, { bg: string; fg: string }> = {
  employee: { bg: 'var(--c-surface-2)', fg: 'var(--c-text-2)' },
  contractor: { bg: 'var(--c-info-50)', fg: 'var(--c-info-800)' },
  vendor: { bg: 'var(--c-warning-50)', fg: 'var(--c-warning-800)' },
};

export default function People() {
  const { toast } = useToast();
  const { user } = useAuth();
  const hasTag = usePermission('fab_erp_machine_state_manage');
  const canManage = isAdminRole(user?.role) || hasTag;

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Worker | null>(null);
  const [creating, setCreating] = useState(false);
  // Clicking a row opens the person; editing is a deliberate second step from
  // inside the sheet, so a mis-click never lands you in a form.
  const [peeking, setPeeking] = useState<Worker | null>(null);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [leaveFor, setLeaveFor] = useState<Worker | null>(null);
  const [exitFor, setExitFor] = useState<Worker | null>(null);
  const [draft, setDraft] = useState({
    name: '', code: '', workerType: 'employee' as WorkerType, vendorName: '', phone: '', active: true,
  });

  // Load the dialog from whichever row opened it — or blank for a new person.
  useEffect(() => {
    if (editing) {
      setDraft({
        name: editing.name, code: editing.code ?? '', workerType: editing.workerType,
        vendorName: editing.vendorName ?? '', phone: editing.phone ?? '', active: !!editing.active,
      });
    }
  }, [editing]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getRoster();
      setWorkers(res.workers ?? []);
    } catch (e) {
      setError(backendMessage(e, 'Failed to load the roster.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Shifts and machines back the pickers in the add grid and the person sheet.
  // Advisory: a failure leaves the pickers empty rather than blocking the roster.
  const loadOptions = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        fabQuery<{ data: ShiftOption[] }>('fabErpShift', {
          orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 200 },
        }),
        fabQuery<{ data: MachineOption[] }>('fabErpResource', {
          orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 },
        }),
      ]);
      setShifts(s.data ?? []);
      setMachines(m.data ?? []);
    } catch { /* pickers degrade to empty */ }
  }, []);

  useEffect(() => { load(); loadOptions(); }, [load, loadOptions]);

  const stats: Stat[] = useMemo(() => {
    const active = workers.filter((w) => w.active);
    return [
      { label: 'On the roster', value: active.length },
      { label: 'On a machine now', value: active.filter((w) => w.currentResourceId).length },
      { label: 'Contract / vendor', value: active.filter((w) => w.workerType !== 'employee').length },
      { label: 'No login', value: active.filter((w) => w.userId == null).length },
    ];
  }, [workers]);

  // Only edits an existing person now — creation moved to AddPeopleDialog, which
  // handles one or forty through the same path.
  async function save() {
    if (!editing) return;
    try {
      await updateWorker(editing.id, {
        name: draft.name.trim(), code: draft.code.trim() || null,
        workerType: draft.workerType, vendorName: draft.vendorName.trim() || null,
        phone: draft.phone.trim() || null, active: draft.active ? 1 : 0,
      } as Partial<Worker>);
      toast('Saved.', 'success');
      setEditing(null);
      await load();
    } catch (e) {
      toast(backendMessage(e, 'Failed to save.'), 'error');
    }
  }

  if (loading) return <Box sx={{ maxWidth: 1200, mx: 'auto' }}><PageHeader title="People" /><ListSkeleton rows={6} /></Box>;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader
        title="People"
        subtitle="Everyone who works the floor — including contract and vendor staff, who need no login"
        actions={canManage ? (
          <Button size="small" variant="contained" startIcon={<PersonAddAlt1Rounded fontSize="small" />} onClick={() => setCreating(true)}>
            Add people
          </Button>
        ) : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <StatStrip stats={stats} />

      {workers.length === 0 ? (
        <EmptyState
          title="Nobody on the roster yet"
          hint="Add people here — type a few in, or upload a spreadsheet. A contract welder just needs a name. Machines with no crew cannot be scheduled, so this is worth filling in."
        />
      ) : (
        <DataTable
          rows={workers}
          getRowId={(w) => w.id}
          storageKey="fab-people"
          exportName="people"
          defaultSortKey="name"
          columns={[
            { key: 'name', header: 'Name', render: (w) => (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 13.5, color: w.active ? 'var(--c-text)' : 'var(--c-text-3)' }}>{w.name}</Typography>
                {!w.active && <Chip size="small" label="Inactive" sx={{ height: 18, fontSize: 10.5 }} />}
              </Box>
            ), sortValue: (w) => w.name },
            { key: 'code', header: 'Badge', width: 120, render: (w) => (w.code ? <Mono chip>{w.code}</Mono> : '—'), sortValue: (w) => w.code ?? '' },
            {
              key: 'workerType', header: 'Type', width: 150,
              render: (w) => (
                <Box>
                  <Chip
                    size="small"
                    icon={w.workerType !== 'employee' ? <BadgeRounded sx={{ fontSize: 14 }} /> : undefined}
                    label={WORKER_TYPE_LABELS[w.workerType]}
                    sx={{ height: 20, fontSize: 11, ...TYPE_TONE[w.workerType], border: 'none' }}
                  />
                  {w.vendorName && (
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.25 }}>{w.vendorName}</Typography>
                  )}
                </Box>
              ),
              sortValue: (w) => w.workerType,
            },
            {
              // A person with no shift contributes no working time to any machine
              // they're on, so an empty cell here is a real gap, not a cosmetic one.
              key: 'currentShiftName', header: 'Shift', width: 170,
              render: (w) => (w.currentShiftName ? (
                <Box>
                  <Typography sx={{ fontSize: 13 }}>{w.currentShiftName}</Typography>
                  <Typography sx={{ fontSize: 11, color: 'var(--c-text-3)' }}>
                    {shiftSpan(w.currentShiftStart, w.currentShiftEnd)}
                  </Typography>
                </Box>
              ) : (
                <Tooltip title="No shift set — this person adds no working time to their machine">
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>Not set</Typography>
                </Tooltip>
              )),
              sortValue: (w) => w.currentShiftName ?? '',
            },
            {
              // The current truth, in one cell. Exit wins over away — you cannot
              // be on leave from a job you have left.
              key: 'status', header: 'Status', width: 165,
              render: (w) => {
                const st = workerStatus(w);
                if (st.kind === 'exited') {
                  return (
                    <Tooltip title={st.since ? `Left ${new Date(st.since).toLocaleDateString()}` : 'No longer on the roster'}>
                      <Chip size="small" label="Inactive" sx={{ height: 20, fontSize: 11, bgcolor: 'var(--c-surface-2)', color: 'var(--c-text-3)' }} />
                    </Tooltip>
                  );
                }
                if (st.kind === 'away') {
                  const until = st.until ? new Date(st.until) : null;
                  const sameDay = until && until.toDateString() === new Date().toDateString();
                  return (
                    <Tooltip title={until ? `Back ${until.toLocaleString()}` : 'No end time recorded'}>
                      <Chip
                        size="small"
                        label={st.reason === 'sick' ? 'Sick' : sameDay ? `Away till ${until!.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'On leave'}
                        sx={{ height: 20, fontSize: 11, bgcolor: 'var(--c-warning-50)', color: 'var(--c-warning-800)' }}
                      />
                    </Tooltip>
                  );
                }
                return <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>Working</Typography>;
              },
              sortValue: (w) => workerStatus(w).kind,
            },
            {
              key: 'currentResourceName', header: 'On machine', width: 190,
              render: (w) => (w.currentResourceName
                ? <Typography sx={{ fontSize: 13 }}>{w.currentResourceName}</Typography>
                : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>—</Typography>),
              sortValue: (w) => w.currentResourceName ?? '',
            },
            {
              key: 'userId', header: 'Login', width: 100,
              render: (w) => (
                <Tooltip title={w.userId ? 'Has a system login' : 'No login — floor-only. This is normal for contract staff.'}>
                  <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{w.userId ? 'Yes' : 'No'}</Typography>
                </Tooltip>
              ),
              sortValue: (w) => (w.userId ? 1 : 0),
            },
          ]}
          onRowClick={(w) => setPeeking(w)}
          // Two acts, two buttons — they are different kinds of fact and must not
          // be reachable from one control. Leave is bounded and about a day;
          // Inactive is open-ended and about the person. Every handler stops
          // propagation, or the row's own click opens the peek sheet behind the
          // dialog.
          rowActions={canManage ? (w) => {
            const st = workerStatus(w);
            const gone = st.kind === 'exited';
            return (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {!gone && (
                  <Tooltip title="Full day, half day, or a few hours">
                    <Button size="small" variant="text"
                      startIcon={<EventBusyRounded fontSize="small" />}
                      onClick={(e) => { e.stopPropagation(); setLeaveFor(w); }}>
                      Leave
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title={gone ? 'They rejoined — put them back on the roster' : 'They have left the firm'}>
                  <Button size="small" variant="text" color={gone ? 'primary' : 'inherit'}
                    startIcon={gone ? <PersonAddAlt1Rounded fontSize="small" /> : <PersonOffRounded fontSize="small" />}
                    onClick={(e) => { e.stopPropagation(); setExitFor(w); }}>
                    {gone ? 'Reactivate' : 'Inactivate'}
                  </Button>
                </Tooltip>
                <Tooltip title="Edit details">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditing(w); }}>
                    <EditRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            );
          } : undefined}
        />
      )}

      <PersonSheet
        worker={peeking}
        shifts={shifts}
        open={!!peeking}
        canManage={canManage}
        onClose={() => setPeeking(null)}
        onEdit={() => { if (peeking) { setEditing(peeking); setPeeking(null); } }}
        onChanged={load}
      />

      <AddPeopleDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={load}
        shifts={shifts}
        machines={machines}
      />

      <LeaveDialog
        worker={leaveFor}
        open={!!leaveFor}
        onClose={() => setLeaveFor(null)}
        onSaved={load}
      />

      <ExitWorkerDialog
        worker={exitFor}
        open={!!exitFor}
        onClose={() => setExitFor(null)}
        onSaved={load}
      />

      <FormDialog
        open={!!editing}
        title={editing ? `Edit ${editing.name}` : ''}
        subtitle="Contract and vendor staff need no login — a name is enough."
        onClose={() => setEditing(null)}
        onSubmit={save}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
          <TextField label="Name" size="small" fullWidth required autoFocus
            value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          <TextField label="Badge / ID" size="small" fullWidth
            value={draft.code} onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            helperText="Whatever is written on paper for this person" />
          <TextField select label="Type" size="small" fullWidth value={draft.workerType}
            onChange={(e) => setDraft((d) => ({ ...d, workerType: e.target.value as WorkerType }))}>
            {(Object.keys(WORKER_TYPE_LABELS) as WorkerType[]).map((k) => (
              <MenuItem key={k} value={k}>{WORKER_TYPE_LABELS[k]}</MenuItem>
            ))}
          </TextField>
          {draft.workerType !== 'employee' && (
            <TextField label="Agency / supplier" size="small" fullWidth
              value={draft.vendorName} onChange={(e) => setDraft((d) => ({ ...d, vendorName: e.target.value }))} />
          )}
          <TextField label="Phone" size="small" fullWidth
            value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
          {editing && (
            <FormControlLabel
              control={<Switch checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />}
              label={draft.active ? 'Active' : 'Inactive — keeps their history, hides them from crew pickers'}
            />
          )}
        </Box>
      </FormDialog>
    </Box>
  );
}
