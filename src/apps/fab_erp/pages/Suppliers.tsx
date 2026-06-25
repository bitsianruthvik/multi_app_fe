import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon        from '@mui/icons-material/Add';
import EditIcon       from '@mui/icons-material/Edit';
import DeleteIcon     from '@mui/icons-material/Delete';
import HandshakeIcon  from '@mui/icons-material/Handshake';

import { fabQuery, fabMutate } from '../api/client';
import type { FabSupplier }    from '../types';
import { usePermission }       from '@core/hooks/usePermission';

interface Draft { name: string; code: string; contact_name: string; phone: string; email: string; address: string; notes: string; }
const blank = (): Draft => ({ name: '', code: '', contact_name: '', phone: '', email: '', address: '', notes: '' });

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

  const set = (k: keyof Draft, v: string) => setDraft(d => ({ ...d, [k]: v }));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and Code are required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: draft.name.trim(), code: draft.code.trim(),
        contact_name: draft.contact_name || null, phone: draft.phone || null,
        email: draft.email || null, address: draft.address || null, notes: draft.notes || null,
      };
      if (isNew) await fabMutate('fabErpSupplier', 'insert', payload);
      else       await fabMutate('fabErpSupplier', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e: any) { setErr(e.response?.data?.error ?? e.message); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Supplier' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField label="Name" value={draft.name} size="small" fullWidth required onChange={e => set('name', e.target.value)} />
          <TextField label="Code" value={draft.code} size="small" fullWidth required onChange={e => set('code', e.target.value)} />
          <TextField label="Contact Name" value={draft.contact_name} size="small" fullWidth onChange={e => set('contact_name', e.target.value)} />
          <TextField label="Phone" value={draft.phone} size="small" fullWidth onChange={e => set('phone', e.target.value)} />
          <TextField label="Email" value={draft.email} size="small" fullWidth sx={{ gridColumn: 'span 2' }} onChange={e => set('email', e.target.value)} />
          <TextField label="Address" value={draft.address} size="small" fullWidth multiline rows={2} sx={{ gridColumn: 'span 2' }} onChange={e => set('address', e.target.value)} />
          <TextField label="Notes" value={draft.notes} size="small" fullWidth multiline rows={2} sx={{ gridColumn: 'span 2' }} onChange={e => set('notes', e.target.value)} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !draft.name.trim() || !draft.code.trim()}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Suppliers() {
  const { company } = useParams<{ company: string }>();
  const navigate    = useNavigate();
  const canManage   = usePermission('fab_erp_grn_manage');

  const [suppliers, setSuppliers] = useState<FabSupplier[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [toast,     setToast]     = useState('');
  const [dialog,    setDialog]    = useState<{ open: boolean; item: FabSupplier | null }>({ open: false, item: null });
  const [delTarget, setDelTarget] = useState<FabSupplier | null>(null);
  const [delBusy,   setDelBusy]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabSupplier[] }>('fabErpSupplier', {
        orderBy: [{ field: 'name', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setSuppliers(res.data ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteSupplier() {
    if (!delTarget) return;
    setDelBusy(true);
    try {
      await fabMutate('fabErpSupplier', 'delete', { id: delTarget.id });
      setDelTarget(null); setToast('Supplier deleted.'); load();
    } catch (e: any) { setError(e.response?.data?.error ?? e.message); }
    finally { setDelBusy(false); }
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Suppliers</Typography>
          <Typography variant="body2" color="text.secondary">Manage suppliers and their catalog item records</Typography>
        </Box>
        {canManage && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, item: null })}>
            New Supplier
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : suppliers.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <HandshakeIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No suppliers yet.{canManage && ' Click "New Supplier" to add your first one.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {suppliers.map(s => (
            <Paper
              key={s.id}
              variant="outlined"
              onClick={() => navigate(`/${company}/fab_erp/suppliers/${s.id}`)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 2, p: 2,
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                transition: 'border-color 0.15s',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography fontWeight={700} noWrap>{s.name}</Typography>
                  <Chip label={s.code} size="small" variant="outlined" sx={{ fontFamily: 'monospace', flexShrink: 0 }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {[s.contactName, s.phone, s.email].filter(Boolean).join(' · ') || 'No contact info'}
                </Typography>
              </Box>
              {canManage && (
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <Tooltip title="Edit supplier">
                    <IconButton size="small" onClick={() => setDialog({ open: true, item: s })}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete supplier">
                    <IconButton size="small" color="error" onClick={() => setDelTarget(s)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      )}

      <SupplierDialog
        open={dialog.open} initial={dialog.item}
        onClose={() => setDialog({ open: false, item: null })}
        onSaved={() => { setDialog({ open: false, item: null }); setToast('Supplier saved.'); load(); }}
      />

      <Dialog open={!!delTarget} onClose={() => setDelTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Supplier</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{delTarget?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={deleteSupplier} disabled={delBusy}>
            {delBusy ? <CircularProgress size={16} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
