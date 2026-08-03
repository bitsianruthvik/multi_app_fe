import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, TextField, Typography,
} from '@mui/material';
import { fabMutate } from '../api/client';
import type { FabOperationResourceType } from '../types';
import { BATCH_MODE_OPTIONS, parseMatchKeys, type BatchMode } from '../utils/batchModes';

/**
 * Batching config for one operation × resource-type mapping (Issue 4).
 *
 * Lives here rather than on a page because `fab_operation_resource_types` is
 * edited from BOTH sides — Operations › Resource Types and Resource Types ›
 * Operations are the same junction row approached from either end. When this
 * only existed on the Operations page, someone configuring a machine class from
 * the other side couldn't see that an operation was batchable at all, let alone
 * change it.
 */

/** One-glance summary for a table cell — prose, not a database row. */
export function BatchingSummary({ row }: { row: FabOperationResourceType }) {
  const mode = row.batchMode ?? 'none';
  if (mode === 'none') {
    return <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>One at a time</Typography>;
  }
  const opt = BATCH_MODE_OPTIONS.find((o) => o.value === mode);
  const keys = parseMatchKeys(row.batchMatchKeys);
  return (
    <Box>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)' }}>{opt?.label ?? mode}</Typography>
      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
        {row.batchCapacity ? `up to ${row.batchCapacity}` : 'machine’s unit count'}
        {keys.length > 0 && ` · match ${keys.join(', ')}`}
      </Typography>
    </Box>
  );
}

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong';
}

export function BatchingDialog({ row, title, onClose, onSaved }: {
  row: FabOperationResourceType | null;
  /** What the operator is looking at from this side of the junction. */
  title: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<BatchMode>('none');
  const [capacity, setCapacity] = useState('');
  const [keys, setKeys] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!row) return;
    setMode(row.batchMode ?? 'none');
    setCapacity(row.batchCapacity != null ? String(row.batchCapacity) : '');
    setKeys(parseMatchKeys(row.batchMatchKeys).join(', '));
    setErr('');
  }, [row]);

  const capacityInvalid = capacity.trim() !== '' && !(Number(capacity) > 0 && Number.isInteger(Number(capacity)));

  async function save() {
    if (!row || capacityInvalid) return;
    setSaving(true); setErr('');
    try {
      const keyList = keys.split(',').map((k) => k.trim()).filter(Boolean);
      await fabMutate('fabErpOperationResourceType', 'update', {
        id: row.id,
        batch_mode: mode,
        batch_capacity: capacity.trim() === '' ? null : Number(capacity),
        // Stored as a JSON column; an empty list is written as NULL so "no
        // constraint" and "an empty constraint" can't drift apart.
        batch_match_keys: keyList.length ? JSON.stringify(keyList) : null,
      });
      await onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  const selected = BATCH_MODE_OPTIONS.find((o) => o.value === mode);

  return (
    <Dialog open={!!row} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Batching on {title}</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
          Whether several parts can go through this kind of machine in one run — and how that run’s time is charged.
        </Typography>
        <TextField
          select fullWidth size="small" label="Batch mode" value={mode}
          onChange={(e) => setMode(e.target.value as BatchMode)}
          sx={{ mb: 0.75 }}
        >
          {BATCH_MODE_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 2.5 }}>{selected?.help}</Typography>

        {mode !== 'none' && (
          <>
            <TextField
              label="Capacity (pieces per run)" type="number" fullWidth size="small"
              value={capacity} onChange={(e) => setCapacity(e.target.value)}
              error={capacityInvalid}
              helperText={capacityInvalid ? 'Must be a whole number greater than 0.' : 'Leave blank to use each machine’s own unit count.'}
              inputProps={{ min: 1, step: 1 }}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Must match" fullWidth size="small"
              value={keys} onChange={(e) => setKeys(e.target.value)}
              placeholder="thickness_mm, material_grade"
              helperText="Item metric keys that must be equal for parts to share a run. You can’t nest 20 mm and 6 mm plate on the same cut."
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} variant="contained" disabled={saving || capacityInvalid}>
          {saving ? <CircularProgress size={18} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
