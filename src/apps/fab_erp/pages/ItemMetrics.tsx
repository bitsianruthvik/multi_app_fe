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
  MenuItem,
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
import type { FabItemMetricDef } from '../types';
import { usePermission } from '@core/hooks/usePermission';

// ── constants ─────────────────────────────────────────────────────────────────

const DATA_TYPES = ['number', 'string', 'boolean'] as const;
type DataType = (typeof DATA_TYPES)[number];

// ── draft ─────────────────────────────────────────────────────────────────────

interface Draft {
  metricKey:   string;
  metricLabel: string;
  dataType:    DataType;
  unit:        string;
}

const BLANK = (): Draft => ({ metricKey: '', metricLabel: '', dataType: 'number', unit: '' });

// ── dialog ────────────────────────────────────────────────────────────────────

function ItemMetricDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open:    boolean;
  initial: FabItemMetricDef | null;
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
        metricKey:   initial.metricKey,
        metricLabel: initial.metricLabel,
        dataType:    (initial.dataType as DataType) ?? 'number',
        unit:        initial.unit ?? '',
      });
    } else {
      setDraft(BLANK());
    }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true);
    setErr('');
    try {
      if (isNew) {
        await fabMutate('fabErpItemMetricDef', 'insert', {
          metric_key:   draft.metricKey,
          metric_label: draft.metricLabel,
          data_type:    draft.dataType,
          unit:         draft.unit || null,
        });
      } else {
        await fabMutate('fabErpItemMetricDef', 'update', {
          id:           initial!.id,
          metric_key:   draft.metricKey,
          metric_label: draft.metricLabel,
          data_type:    draft.dataType,
          unit:         draft.unit || null,
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!draft.metricKey.trim() && !!draft.metricLabel.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Item Metric Definition' : `Edit — ${initial?.metricKey}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField
          label="Metric Key"
          value={draft.metricKey}
          onChange={(e) => set('metricKey', e.target.value)}
          size="small"
          fullWidth
          required
          helperText="Snake-case identifier, e.g. weld_length_mm"
        />
        <TextField
          label="Metric Label"
          value={draft.metricLabel}
          onChange={(e) => set('metricLabel', e.target.value)}
          size="small"
          fullWidth
          required
          helperText="Human-readable name shown in the UI"
        />
        <TextField
          select
          label="Data Type"
          value={draft.dataType}
          onChange={(e) => set('dataType', e.target.value)}
          size="small"
          fullWidth
        >
          {DATA_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Unit"
          value={draft.unit}
          onChange={(e) => set('unit', e.target.value)}
          size="small"
          fullWidth
          helperText="Optional — e.g. mm, kg, m²"
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
  item:      FabItemMetricDef | null;
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
      await fabMutate('fabErpItemMetricDef', 'delete', { id: item.id });
      onDeleted();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Metric Definition</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        <Typography>
          Delete <strong>{item?.metricKey}</strong>? This cannot be undone.
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

export default function ItemMetrics() {
  const canManage = usePermission('fab_erp_items_meta_manage');

  const [rows,    setRows]    = useState<FabItemMetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const [editDialog,   setEditDialog]   = useState<{ open: boolean; item: FabItemMetricDef | null }>({ open: false, item: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: FabItemMetricDef | null }>({ open: false, item: null });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fabQuery<{ data: FabItemMetricDef[] }>('fabErpItemMetricDef', {
        orderBy: [{ field: 'metricKey', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setRows(res.data ?? []);
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? 'Failed to load metric definitions');
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
          <Typography variant="h5" fontWeight={700}>Item Metric Definitions</Typography>
          <Typography variant="body2" color="text.secondary">
            Define measurable metrics that can be captured on fabrication items
          </Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setEditDialog({ open: true, item: null })}
          >
            Add Metric
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
              <TableCell sx={{ fontWeight: 700 }}>Metric Key</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Data Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Unit</TableCell>
              {canManage && <TableCell sx={{ fontWeight: 700, width: 96 }}>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No metric definitions found.
                </TableCell>
              </TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{row.metricKey}</TableCell>
                <TableCell>{row.metricLabel}</TableCell>
                <TableCell>{row.dataType}</TableCell>
                <TableCell>{row.unit ?? '—'}</TableCell>
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

      <ItemMetricDialog
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
