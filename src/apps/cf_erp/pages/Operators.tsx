import { useEffect, useState } from 'react';
import { Autocomplete, Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EngineeringRounded from '@mui/icons-material/EngineeringRounded';
import { deleteOperator, listOperatorRows, saveOperator } from '../api/floor';
import type { Machine, OperatorRow } from '../api/types';
import { allMachines } from '../api/machines';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FormDialog } from '../components/FormDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';

/** Add or edit one operator: a name, and optionally the machines they usually work on. */
function OperatorDialog({ open, existing, machines, onClose, onSaved }: { open: boolean; existing: OperatorRow | null; machines: Machine[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', code: '', status: 'active', machineIds: [] as number[] });
  useEffect(() => {
    if (open) setForm(existing ? { name: existing.name, code: existing.code ?? '', status: existing.status, machineIds: existing.machineIds } : { name: '', code: '', status: 'active', machineIds: [] });
  }, [open, existing]);
  return (
    <FormDialog open={open} title={existing ? `Edit ${existing.name}` : 'New operator'} onClose={onClose} submitDisabled={!form.name.trim()}
      subtitle="Usual machines are listed first when this person picks their name at the machine."
      onSubmit={async () => { await saveOperator(existing?.id ?? null, { ...form, name: form.name.trim(), code: form.code.trim() }); onSaved(); }}>
      <TextField label="Name" required autoFocus helperText="As people know them — this is the button they tap." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Autocomplete multiple options={machines} value={machines.filter((m) => form.machineIds.includes(m.id))} getOptionLabel={(m) => m.name}
        onChange={(_, v) => setForm({ ...form, machineIds: v.map((m) => m.id) })} renderInput={(p) => <TextField {...p} label="Usual machines" />} />
      {existing && (
        <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} helperText="Inactive people are not offered at the machine">
          <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
        </TextField>
      )}
    </FormDialog>
  );
}

/** Setup: the people who pick their name on a shared machine tablet. */
export default function Operators() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const list = useLoad(() => listOperatorRows(), []);
  const machines = useLoad(() => allMachines(), []);
  const [editing, setEditing] = useState<{ open: boolean; row: OperatorRow | null }>({ open: false, row: null });
  const [deleting, setDeleting] = useState<OperatorRow | null>(null);
  const machineName = (id: number) => machines.data?.find((m) => m.id === id)?.name ?? `#${id}`;

  const columns: DataColumn<OperatorRow>[] = [
    { key: 'name', header: 'Name', render: (o) => <Box sx={{ fontWeight: 500 }}>{o.name}</Box>, sortValue: (o) => o.name, alwaysVisible: true },
    { key: 'code', header: 'Code', render: (o) => <Mono muted={!o.code}>{o.code ?? '—'}</Mono>, sortValue: (o) => o.code, defaultHidden: true },
    { key: 'machines', header: 'Usual machines', render: (o) => o.machineIds.map(machineName).join(', ') || '—', exportValue: (o) => o.machineIds.map(machineName).join(', ') },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} />, sortValue: (o) => o.status },
  ];
  return (
    <Box>
      <PageHeader title="Operators" subtitle="The people who pick their name on the machine tablet. No passwords — the tablet stays signed in."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({ open: true, row: null })}>New operator</Button>} />
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.data ?? []} columns={columns} getRowId={(o) => o.id} loading={list.loading && !list.data} storageKey="operators" exportName="operators" defaultSortKey="name"
        onRowClick={canManage ? (o) => setEditing({ open: true, row: o }) : undefined}
        rowActions={canManage ? (o) => (
          <>
            <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${o.name}`} onClick={() => setEditing({ open: true, row: o })}><EditRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${o.name}`} onClick={() => setDeleting(o)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </>
        ) : undefined}
        empty={<EmptyState icon={<EngineeringRounded />} title="No operators yet" hint="Add the people who work at the machines."
          action={canManage && <Button variant="contained" onClick={() => setEditing({ open: true, row: null })}>New operator</Button>} />} />
      <OperatorDialog open={editing.open} existing={editing.row} machines={machines.data ?? []} onClose={() => setEditing({ open: false, row: null })}
        onSaved={() => { toast.success('Saved.'); list.reload(); }} />
      <ConfirmDialog open={!!deleting} danger confirmLabel="Delete" title="Delete this operator?" entityName={deleting?.name}
        body="Past entries keep their name. If they only left the shop, mark them inactive instead."
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await deleteOperator(deleting?.id as number); toast.success('Deleted.'); list.reload(); }} />
    </Box>
  );
}
