import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabCustomer } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { PageHeader, FilterBar, EntityList, EntityRow, Mono, EmptyState, ListSkeleton, useToast, type SortableField } from '../components';

interface Draft { name: string; contact_name: string; phone: string; email: string; address: string; notes: string }
const blank = (): Draft => ({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' });

const CUSTOMER_SORT_FIELDS: SortableField<FabCustomer>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
  { key: 'contactName', label: 'Contact name' },
];

function CustomerDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabCustomer | null; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !initial;
  const [draft, setDraft] = useState<Draft>(blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name: initial.name,
        contact_name: initial.contactName ?? '', phone: initial.phone ?? '',
        email: initial.email ?? '', address: initial.address ?? '', notes: initial.notes ?? '',
      });
    } else { setDraft(blank()); }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: draft.name.trim(),
        contact_name: draft.contact_name || null, phone: draft.phone || null,
        email: draft.email || null, address: draft.address || null, notes: draft.notes || null,
      };
      if (isNew) await fabMutate('fabErpCustomer', 'insert', payload);
      else await fabMutate('fabErpCustomer', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setErr(ax.response?.data?.message ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New customer' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Name" value={draft.name} size="small" fullWidth required onChange={(e) => set('name', e.target.value)} />
          {isNew ? (
            <TextField label="Code" value="(auto-generated on save)" size="small" fullWidth disabled />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.5 }}>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Code</Typography>
              <Mono chip>{initial!.code}</Mono>
            </Box>
          )}
          <TextField label="Contact name" value={draft.contact_name} size="small" fullWidth onChange={(e) => set('contact_name', e.target.value)} />
          <TextField label="Phone" value={draft.phone} size="small" fullWidth onChange={(e) => set('phone', e.target.value)} />
          <TextField label="Email" value={draft.email} size="small" fullWidth sx={{ gridColumn: 'span 2' }} onChange={(e) => set('email', e.target.value)} />
          <TextField label="Address" value={draft.address} size="small" fullWidth multiline rows={2} sx={{ gridColumn: 'span 2' }} onChange={(e) => set('address', e.target.value)} />
          <TextField label="Notes" value={draft.notes} size="small" fullWidth multiline rows={2} sx={{ gridColumn: 'span 2' }} onChange={(e) => set('notes', e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim()}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Customers() {
  const canManage = usePermission('fab_erp_projects_manage');
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<FabCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; item: FabCustomer | null }>({ open: false, item: null });
  const [delTarget, setDelTarget] = useState<FabCustomer | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabCustomer[] }>('fabErpCustomer', {
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setCustomers(res.data ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) ||
      (c.contactName ?? '').toLowerCase().includes(q));
  }, [customers, search]);

  async function deleteCustomer() {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      await fabMutate('fabErpCustomer', 'delete', { id: delTarget.id });
      setDelTarget(null); toast('Customer deleted'); load();
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Delete failed');
    } finally { setDelBusy(false); }
  }

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, item: null })}>
      New customer
    </Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Customers" subtitle="Customers placing sales orders" actions={newBtn} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search name, code, contact…" />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<PeopleAltRounded />}
          title={search ? 'No customers match your search' : 'No customers yet'}
          hint={!search && canManage ? 'Add your first customer to start raising sales orders.' : undefined}
          action={!search ? newBtn ?? undefined : undefined}
        />
      ) : (
        <EntityList
          rows={filtered}
          sortableFields={CUSTOMER_SORT_FIELDS}
          defaultSortKey="name"
          renderRow={(c) => (
            <EntityRow
              key={c.id}
              code={<Mono chip>{c.code}</Mono>}
              primary={c.name}
              secondary={[c.contactName, c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
              actions={canManage ? (<>
                <Tooltip title="Edit"><IconButton size="small" onClick={() => setDialog({ open: true, item: c })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(c)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
              </>) : undefined}
            />
          )}
        />
      )}

      <CustomerDialog
        open={dialog.open} initial={dialog.item}
        onClose={() => setDialog({ open: false, item: null })}
        onSaved={() => { setDialog({ open: false, item: null }); toast('Customer saved'); load(); }}
      />

      <Dialog open={!!delTarget} onClose={() => setDelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Delete customer</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{delTarget?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteCustomer} disabled={delBusy}>
            {delBusy ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
