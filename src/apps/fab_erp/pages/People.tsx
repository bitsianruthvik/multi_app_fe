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
import { Alert, Box, Button, Chip, FormControlLabel, MenuItem, Switch, TextField, Tooltip, Typography } from '@mui/material';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import EditRounded from '@mui/icons-material/EditRounded';

import { usePermission } from '@core/hooks/usePermission';
import { useAuth } from '@core/contexts/AuthContext';
import { isAdminRole } from '@core/utils/roles';
import {
  getRoster, addWorker, updateWorker, WORKER_TYPE_LABELS, type Worker, type WorkerType,
} from '../api/workers';
import {
  PageHeader, DataTable, StatStrip, ListSkeleton, EmptyState, Mono, useToast,
  FormDialog, backendMessage, type Stat,
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
    } else if (creating) {
      setDraft({ name: '', code: '', workerType: 'employee', vendorName: '', phone: '', active: true });
    }
  }, [editing, creating]);

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

  useEffect(() => { load(); }, [load]);

  const stats: Stat[] = useMemo(() => {
    const active = workers.filter((w) => w.active);
    return [
      { label: 'On the roster', value: active.length },
      { label: 'On a machine now', value: active.filter((w) => w.currentResourceId).length },
      { label: 'Contract / vendor', value: active.filter((w) => w.workerType !== 'employee').length },
      { label: 'No login', value: active.filter((w) => w.userId == null).length },
    ];
  }, [workers]);

  async function save() {
    const values = {
      name: draft.name.trim(), code: draft.code.trim() || null,
      workerType: draft.workerType, vendorName: draft.vendorName.trim() || null,
      phone: draft.phone.trim() || null,
    };
    try {
      if (editing) {
        await updateWorker(editing.id, { ...values, active: draft.active ? 1 : 0 } as Partial<Worker>);
        toast('Saved.', 'success');
      } else {
        await addWorker(values as { name: string });
        toast('Added to the roster.', 'success');
      }
      setEditing(null); setCreating(false);
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
            Add person
          </Button>
        ) : undefined}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <StatStrip stats={stats} />

      {workers.length === 0 ? (
        <EmptyState
          title="Nobody on the roster yet"
          hint="Add people here, or straight onto a machine from the Machine Board — a contract welder just needs a name."
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
          rowActions={canManage ? (w) => (
            <Tooltip title="Edit">
              <Button size="small" variant="text" startIcon={<EditRounded fontSize="small" />} onClick={() => setEditing(w)}>Edit</Button>
            </Tooltip>
          ) : undefined}
        />
      )}

      <FormDialog
        open={creating || !!editing}
        title={editing ? `Edit ${editing.name}` : 'Add someone to the roster'}
        subtitle="Contract and vendor staff need no login — a name is enough."
        onClose={() => { setEditing(null); setCreating(false); }}
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
