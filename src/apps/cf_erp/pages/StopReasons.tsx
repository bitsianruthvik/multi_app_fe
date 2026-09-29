import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded';
import { deleteReason, listReasonRows, saveReason } from '../api/floor';
import type { StopReasonRow } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FormDialog } from '../components/FormDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';

/** Add or edit one reason. The order here is the order the chips appear at the machine. */
function ReasonDialog({ open, existing, nextOrder, onClose, onSaved }: { open: boolean; existing: StopReasonRow | null; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ label: '', code: '', sortOrder: 0, needsNote: false, status: 'active' });
  useEffect(() => {
    if (open) setForm(existing
      ? { label: existing.label, code: existing.code, sortOrder: existing.sortOrder, needsNote: existing.needsNote, status: existing.status }
      : { label: '', code: '', sortOrder: nextOrder, needsNote: false, status: 'active' });
  }, [open, existing, nextOrder]);
  return (
    <FormDialog open={open} title={existing ? `Edit ${existing.label}` : 'New reason'} onClose={onClose} submitDisabled={!form.label.trim()}
      onSubmit={async () => { await saveReason(existing?.id ?? null, { ...form, label: form.label.trim(), code: form.code.trim() }); onSaved(); }}>
      <TextField label="Reason" required autoFocus value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} helperText="The words on the button at the machine." />
      <TextField label="Position in the list" helperText="Smaller numbers come first." type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })} />
      <FormControlLabel control={<Checkbox checked={form.needsNote} onChange={(e) => setForm({ ...form, needsNote: e.target.checked })} />} label="Ask for a few words when it is chosen" />
      {existing && (
        <TextField select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} helperText="Inactive reasons are not offered at the machine">
          <MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
        </TextField>
      )}
    </FormDialog>
  );
}

/** Setup: the list of reasons a machine can stand still, chosen from at the machine. */
export default function StopReasons() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_production_manage');
  const list = useLoad(() => listReasonRows(), []);
  const [editing, setEditing] = useState<{ open: boolean; row: StopReasonRow | null }>({ open: false, row: null });
  const [deleting, setDeleting] = useState<StopReasonRow | null>(null);
  const nextOrder = Math.max(0, ...(list.data ?? []).map((r) => r.sortOrder)) + 10;

  const columns: DataColumn<StopReasonRow>[] = [
    { key: 'order', header: 'Order', numeric: true, render: (r) => <Mono>{r.sortOrder}</Mono>, sortValue: (r) => r.sortOrder, width: 90 },
    { key: 'label', header: 'Reason', render: (r) => <Box sx={{ fontWeight: 500 }}>{r.label}</Box>, sortValue: (r) => r.label, alwaysVisible: true },
    { key: 'code', header: 'Code', render: (r) => <Mono muted={!r.code}>{r.code || '—'}</Mono>, sortValue: (r) => r.code, defaultHidden: true },
    { key: 'note', header: 'Asks for a note', render: (r) => (r.needsNote ? 'Yes' : '—'), sortValue: (r) => (r.needsNote ? 1 : 0) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
  ];
  return (
    <Box>
      <PageHeader title="Stop reasons" subtitle="Why a machine stood still — the buttons operators tap. Keep the list short."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({ open: true, row: null })}>New reason</Button>} />
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.data ?? []} columns={columns} getRowId={(r) => r.id} loading={list.loading && !list.data} storageKey="stop-reasons" exportName="stop-reasons" defaultSortKey="order"
        onRowClick={canManage ? (r) => setEditing({ open: true, row: r }) : undefined}
        rowActions={canManage ? (r) => (
          <>
            <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${r.label}`} onClick={() => setEditing({ open: true, row: r })}><EditRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${r.label}`} onClick={() => setDeleting(r)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </>
        ) : undefined}
        empty={<EmptyState icon={<PauseCircleOutlineRounded />} title="No reasons yet" hint="Add the reasons a machine may stop."
          action={canManage && <Button variant="contained" onClick={() => setEditing({ open: true, row: null })}>New reason</Button>} />} />
      <ReasonDialog open={editing.open} existing={editing.row} nextOrder={nextOrder} onClose={() => setEditing({ open: false, row: null })}
        onSaved={() => { toast.success('Saved.'); list.reload(); }} />
      <ConfirmDialog open={!!deleting} danger confirmLabel="Delete" title="Delete this reason?" entityName={deleting?.label}
        body="Stops already recorded keep it. To just hide it from the machine, mark it inactive instead."
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await deleteReason(deleting?.id as number); toast.success('Deleted.'); list.reload(); }} />
    </Box>
  );
}
