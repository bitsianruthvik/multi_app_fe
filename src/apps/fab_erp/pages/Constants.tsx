import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon   from '@mui/icons-material/Edit';

import { fabQuery, fabMutate } from '../api/client';
import type { FabConstant } from '../types';
import { usePermission } from '@core/hooks/usePermission';

// ── draft ─────────────────────────────────────────────────────────────────────

interface Draft {
  constKey:   string;
  constValue: number | '';
  label:      string;
}

const BLANK = (): Draft => ({ constKey: '', constValue: '', label: '' });

// ── dialog ────────────────────────────────────────────────────────────────────

function ConstantDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open:    boolean;
  initial: FabConstant | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft,  setDraft]  = useState<Draft>(BLANK());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        constKey:   initial.constKey,
        constValue: initial.constValue,
        label:      initial.label ?? '',
      });
    } else {
      setDraft(BLANK());
    }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof Draft, v: string | number | '') =>
    setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const numericValue = draft.constValue === '' ? 0 : Number(draft.constValue);
      if (isNew) {
        await fabMutate('fabErpConstant', 'insert', {
          const_key:   draft.constKey,
          const_value: numericValue,
          label:       draft.label || null,
        });
      } else {
        await fabMutate('fabErpConstant', 'update', {
          id:          initial!.id,
          const_key:   draft.constKey,
          const_value: numericValue,
          label:       draft.label || null,
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!draft.constKey.trim() && draft.constValue !== '';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Constant' : `Edit — ${initial?.constKey}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField
          label="Constant Key"
          value={draft.constKey}
          onChange={(e) => set('constKey', e.target.value)}
          size="small"
          fullWidth
          required
          helperText="Snake-case identifier, e.g. steel_density_kg_m3"
        />
        <TextField
          label="Value"
          type="number"
          value={draft.constValue}
          onChange={(e) =>
            set('constValue', e.target.value === '' ? '' : e.target.value)
          }
          size="small"
          fullWidth
          required
          inputProps={{ step: 'any' }}
          helperText="Numeric value used in formula calculations"
        />
        <TextField
          label="Label"
          value={draft.label}
          onChange={(e) => set('label', e.target.value)}
          size="small"
          fullWidth
          helperText="Optional human-readable description"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !canSave}>
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── delete confirm dialog ─────────────────────────────────────────────────────

function DeleteDialog({
  open,
  item,
  onClose,
  onDeleted,
}: {
  open:      boolean;
  item:      FabConstant | null;
  onClose:   () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err,      setErr]      = useState('');

  useEffect(() => { if (open) setErr(''); }, [open]);

  async function confirm() {
    if (!item) return;
    setDeleting(true);
    setErr('');
    try {
      await fabMutate('fabErpConstant', 'delete', { id: item.id });
      onDeleted();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Constant</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        <Typography>
          Delete <strong>{item?.constKey}</strong>? This cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={confirm} disabled={deleting}>
          {deleting ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Constants() {
  const canManage = usePermission('fab_erp_items_meta_manage');

  const [rows,    setRows]    = useState<FabConstant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [editDialog,   setEditDialog]   = useState<{ open: boolean; item: FabConstant | null }>({ open: false, item: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: FabConstant | null }>({ open: false, item: null });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fabQuery<{ data: FabConstant[] }>('fabErpConstant', {
        orderBy: [{ field: 'constKey', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setRows(res.data ?? []);
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? 'Failed to load constants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function onSaved() {
    fetchRows();
    setEditDialog({ open: false, item: null });
  }

  function onDeleted() {
    fetchRows();
    setDeleteDialog({ open: false, item: null });
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Constants</Typography>
          <Typography variant="body2" color="text.secondary">
            Named numeric constants used in formula calculations (e.g. material densities, conversion factors)
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditDialog({ open: true, item: null })}
          >
            Add Constant
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Constant Key</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Value</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
              {canManage && <TableCell sx={{ fontWeight: 700, width: 96 }}>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No constants defined.
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{row.constKey}</TableCell>
                <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{row.constValue}</TableCell>
                <TableCell>{row.label ?? '—'}</TableCell>
                {canManage && (
                  <TableCell>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setEditDialog({ open: true, item: row })}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setDeleteDialog({ open: true, item: row })}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConstantDialog
        open={editDialog.open}
        initial={editDialog.item}
        onClose={() => setEditDialog({ open: false, item: null })}
        onSaved={onSaved}
      />
      <DeleteDialog
        open={deleteDialog.open}
        item={deleteDialog.item}
        onClose={() => setDeleteDialog({ open: false, item: null })}
        onDeleted={onDeleted}
      />
    </Box>
  );
}
