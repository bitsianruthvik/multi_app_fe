import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabSupplier } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { PageHeader, FilterBar, EntityList, EntityRow, Mono, EmptyState, ListSkeleton, useToast, type SortableField } from '../components';

interface Draft { name: string; code: string; contact_name: string; phone: string; email: string; address: string; notes: string }
const blank = (): Draft => ({ name: '', code: '', contact_name: '', phone: '', email: '', address: '', notes: '' });

const SUPPLIER_SORT_FIELDS: SortableField<FabSupplier>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
  { key: 'contactName', label: 'Contact name' },
];

function SupplierDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabSupplier | null; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !initial;
  const [draft, setDraft] = useState<Draft>(blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name: initial.name, code: initial.code,
        contact_name: initial.contactName ?? '', phone: initial.phone ?? '',
        email: initial.email ?? '', address: initial.address ?? '', notes: initial.notes ?? '',
      });
    } else { setDraft(blank()); }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: draft.name.trim(), code: draft.code.trim(),
        contact_name: draft.contact_name || null, phone: draft.phone || null,
        email: draft.email || null, address: draft.address || null, notes: draft.notes || null,
      };
      if (isNew) await fabMutate('fabErpSupplier', 'insert', payload);
      else await fabMutate('fabErpSupplier', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New supplier' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Name" value={draft.name} size="small" fullWidth required onChange={(e) => set('name', e.target.value)} />
          <TextField label="Code" value={draft.code} size="small" fullWidth required onChange={(e) => set('code', e.target.value)} />
          <TextField label="Contact name" value={draft.contact_name} size="small" fullWidth onChange={(e) => set('contact_name', e.target.value)} />
          <TextField label="Phone" value={draft.phone} size="small" fullWidth onChange={(e) => set('phone', e.target.value)} />
          <TextField label="Email" value={draft.email} size="small" fullWidth sx={{ gridColumn: 'span 2' }} onChange={(e) => set('email', e.target.value)} />
          <TextField label="Address" value={draft.address} size="small" fullWidth multiline rows={2} sx={{ gridColumn: 'span 2' }} onChange={(e) => set('address', e.target.value)} />
          <TextField label="Notes" value={draft.notes} size="small" fullWidth multiline rows={2} sx={{ gridColumn: 'span 2' }} onChange={(e) => set('notes', e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || !draft.code.trim()}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Suppliers() {
  const { company } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const canManage = usePermission('fab_erp_grn_manage');
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [suppliers, setSuppliers] = useState<FabSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; item: FabSupplier | null }>({ open: false, item: null });
  const [delTarget, setDelTarget] = useState<FabSupplier | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabSupplier[] }>('fabErpSupplier', {
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setSuppliers(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) ||
      (s.contactName ?? '').toLowerCase().includes(q));
  }, [suppliers, search]);

  async function deleteSupplier() {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      await fabMutate('fabErpSupplier', 'delete', { id: delTarget.id });
      setDelTarget(null); toast('Supplier deleted'); load();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Delete failed');
    } finally { setDelBusy(false); }
  }

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, item: null })}>
      New supplier
    </Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Suppliers" subtitle="Suppliers and their catalog item records" actions={newBtn} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search name, code, contact…" />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<HandshakeRounded />}
          title={search ? 'No suppliers match your search' : 'No suppliers yet'}
          hint={!search && canManage ? 'Add your first supplier to start receiving goods.' : undefined}
          action={!search ? newBtn ?? undefined : undefined}
        />
      ) : (
        <EntityList
          rows={filtered}
          sortableFields={SUPPLIER_SORT_FIELDS}
          defaultSortKey="name"
          renderRow={(s) => (
            <EntityRow
              key={s.id}
              code={<Mono chip>{s.code}</Mono>}
              primary={s.name}
              secondary={[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact info'}
              onClick={() => navigate(`/${company}/fab_erp/suppliers/${s.id}`)}
              actions={canManage ? (<>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => setDialog({ open: true, item: s })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(s)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
              </>) : undefined}
            />
          )}
        />
      )}

      <SupplierDialog
        open={dialog.open} initial={dialog.item}
        onClose={() => setDialog({ open: false, item: null })}
        onSaved={() => { setDialog({ open: false, item: null }); toast('Supplier saved'); load(); }}
      />

      <Dialog open={!!delTarget} onClose={() => setDelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Delete supplier</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{delTarget?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteSupplier} disabled={delBusy}>
            {delBusy ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
