import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import CalculateRounded from '@mui/icons-material/CalculateRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabConstant } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, EmptyState, ListSkeleton, useToast } from '../components';

interface Draft { constKey: string; constValue: number | ''; label: string }
const BLANK = (): Draft => ({ constKey: '', constValue: '', label: '' });

function ConstantDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabConstant | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) setDraft({ constKey: initial.constKey, constValue: initial.constValue, label: initial.label ?? '' });
    else setDraft(BLANK());
    setErr('');
  }, [open, initial]);

  const set = (k: keyof Draft, v: string | number | '') => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      const numericValue = draft.constValue === '' ? 0 : Number(draft.constValue);
      const payload = { const_key: draft.constKey, const_value: numericValue, label: draft.label || null };
      if (isNew) await fabMutate('fabErpConstant', 'insert', payload);
      else await fabMutate('fabErpConstant', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const canSave = !!draft.constKey.trim() && draft.constValue !== '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New constant' : `Edit — ${initial?.constKey}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Constant key" value={draft.constKey} onChange={(e) => set('constKey', e.target.value)} size="small" fullWidth required helperText="Snake-case identifier, e.g. steel_density_kg_m3" />
        <TextField label="Value" type="number" value={draft.constValue} onChange={(e) => set('constValue', e.target.value === '' ? '' : e.target.value)} size="small" fullWidth required slotProps={{ input: { inputProps: { step: 'any' } } }} helperText="Numeric value used in formula calculations" />
        <TextField label="Label" value={draft.label} onChange={(e) => set('label', e.target.value)} size="small" fullWidth helperText="Optional human-readable description" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !canSave}>
          {saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, item, onClose, onDeleted }: {
  open: boolean; item: FabConstant | null; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) setErr(''); }, [open]);

  async function confirm() {
    if (!item) return;
    setDeleting(true); setErr('');
    try { await fabMutate('fabErpConstant', 'delete', { id: item.id }); onDeleted(); }
    catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Delete failed');
    } finally { setDeleting(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Delete constant</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        <Typography>Delete <strong>{item?.constKey}</strong>? This cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={confirm} disabled={deleting}>
          {deleting ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Constants() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();

  const [rows, setRows] = useState<FabConstant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item: FabConstant | null }>({ open: false, item: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: FabConstant | null }>({ open: false, item: null });

  const fetchRows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabConstant[] }>('fabErpConstant', { orderBy: [{ field: 'constKey', direction: 'asc' }], pagination: { limit: 500 } });
      setRows(res.data ?? []);
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Failed to load constants');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function onSaved() { fetchRows(); setEditDialog({ open: false, item: null }); toast('Constant saved'); }
  function onDeleted() { fetchRows(); setDeleteDialog({ open: false, item: null }); toast('Constant deleted'); }

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditDialog({ open: true, item: null })}>Add constant</Button>
  ) : null;

  const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
  const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Constants" subtitle="Named numeric constants used in formula calculations (e.g. material densities, conversion factors)" actions={newBtn} />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalculateRounded />} title="No constants defined" action={newBtn ?? undefined} />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Constant key</TableCell>
                <TableCell sx={th} align="right">Value</TableCell>
                <TableCell sx={th}>Label</TableCell>
                {canManage && <TableCell sx={{ ...th, width: 96 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={td}><Mono>{row.constKey}</Mono></TableCell>
                  <TableCell sx={td} align="right"><Mono tabular>{row.constValue}</Mono></TableCell>
                  <TableCell sx={td}>{row.label ?? '—'}</TableCell>
                  {canManage && (
                    <TableCell sx={td}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditDialog({ open: true, item: row })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteDialog({ open: true, item: row })}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}

      <ConstantDialog open={editDialog.open} initial={editDialog.item} onClose={() => setEditDialog({ open: false, item: null })} onSaved={onSaved} />
      <DeleteDialog open={deleteDialog.open} item={deleteDialog.item} onClose={() => setDeleteDialog({ open: false, item: null })} onDeleted={onDeleted} />
    </Box>
  );
}
