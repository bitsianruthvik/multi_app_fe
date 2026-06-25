import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AutoGraphRounded from '@mui/icons-material/AutoGraphRounded';

import { fabQuery, fabMutate } from '../api/client';
import type { FabItemMetricDef } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, EmptyState, ListSkeleton, useToast } from '../components';

const DATA_TYPES = ['number', 'string', 'boolean'] as const;
type DataType = (typeof DATA_TYPES)[number];

interface Draft { metricKey: string; metricLabel: string; dataType: DataType; unit: string }
const BLANK = (): Draft => ({ metricKey: '', metricLabel: '', dataType: 'number', unit: '' });

function ItemMetricDialog({ open, initial, onClose, onSaved }: {
  open: boolean; initial: FabItemMetricDef | null; onClose: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(BLANK());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        metricKey: initial.metricKey, metricLabel: initial.metricLabel,
        dataType: (initial.dataType as DataType) ?? 'number', unit: initial.unit ?? '',
      });
    } else { setDraft(BLANK()); }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      const payload = { metric_key: draft.metricKey, metric_label: draft.metricLabel, data_type: draft.dataType, unit: draft.unit || null };
      if (isNew) await fabMutate('fabErpItemMetricDef', 'insert', payload);
      else await fabMutate('fabErpItemMetricDef', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  const canSave = !!draft.metricKey.trim() && !!draft.metricLabel.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New item metric definition' : `Edit — ${initial?.metricKey}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Metric key" value={draft.metricKey} onChange={(e) => set('metricKey', e.target.value)} size="small" fullWidth required helperText="Snake-case identifier, e.g. weld_length_mm" />
        <TextField label="Metric label" value={draft.metricLabel} onChange={(e) => set('metricLabel', e.target.value)} size="small" fullWidth required helperText="Human-readable name shown in the UI" />
        <TextField select label="Data type" value={draft.dataType} onChange={(e) => set('dataType', e.target.value)} size="small" fullWidth>
          {DATA_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <TextField label="Unit" value={draft.unit} onChange={(e) => set('unit', e.target.value)} size="small" fullWidth helperText="Optional — e.g. mm, kg, m²" />
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
  open: boolean; item: FabItemMetricDef | null; onClose: () => void; onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) setErr(''); }, [open]);

  async function confirm() {
    if (!item) return;
    setDeleting(true); setErr('');
    try { await fabMutate('fabErpItemMetricDef', 'delete', { id: item.id }); onDeleted(); }
    catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setErr(ax.response?.data?.error ?? ax.message ?? 'Delete failed');
    } finally { setDeleting(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Delete metric definition</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
        <Typography>Delete <strong>{item?.metricKey}</strong>? This cannot be undone.</Typography>
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

export default function ItemMetrics() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();

  const [rows, setRows] = useState<FabItemMetricDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editDialog, setEditDialog] = useState<{ open: boolean; item: FabItemMetricDef | null }>({ open: false, item: null });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: FabItemMetricDef | null }>({ open: false, item: null });

  const fetchRows = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<{ data: FabItemMetricDef[] }>('fabErpItemMetricDef', {
        orderBy: [{ field: 'metricKey', direction: 'asc' }], pagination: { limit: 500 },
      });
      setRows(res.data ?? []);
    } catch (e) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string };
      setError(ax.response?.data?.error ?? ax.message ?? 'Failed to load metric definitions');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function onSaved() { fetchRows(); setEditDialog({ open: false, item: null }); toast('Metric saved'); }
  function onDeleted() { fetchRows(); setDeleteDialog({ open: false, item: null }); toast('Metric deleted'); }

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditDialog({ open: true, item: null })}>Add metric</Button>
  ) : null;

  const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
  const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader title="Item Metric Definitions" subtitle="Measurable metrics that can be captured on fabrication items" actions={newBtn} />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <ListSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<AutoGraphRounded />} title="No metric definitions found" action={newBtn ?? undefined} />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Metric key</TableCell>
                <TableCell sx={th}>Label</TableCell>
                <TableCell sx={th}>Data type</TableCell>
                <TableCell sx={th}>Unit</TableCell>
                {canManage && <TableCell sx={{ ...th, width: 96 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell sx={td}><Mono>{row.metricKey}</Mono></TableCell>
                  <TableCell sx={td}>{row.metricLabel}</TableCell>
                  <TableCell sx={td}>{row.dataType}</TableCell>
                  <TableCell sx={td}>{row.unit ?? '—'}</TableCell>
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

      <ItemMetricDialog open={editDialog.open} initial={editDialog.item} onClose={() => setEditDialog({ open: false, item: null })} onSaved={onSaved} />
      <DeleteDialog open={deleteDialog.open} item={deleteDialog.item} onClose={() => setDeleteDialog({ open: false, item: null })} onDeleted={onDeleted} />
    </Box>
  );
}
