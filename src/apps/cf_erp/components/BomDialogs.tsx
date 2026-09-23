import { useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, TextField, Typography } from '@mui/material';
import { cfApi, CfApiError } from '../api/client';
import type { Kind, MasterRecord } from '../api/types';
import { ErrorNotice, Mono } from './ui';
import { RecordPicker } from './RecordPicker';
import { FlowPicker } from './FlowPicker';
import { DialogHeader } from './FormDialog';

const KIND_WORD: Record<Kind, string> = { catalog: 'catalog item', temporary: 'temporary item', template: 'template', selection: 'selection' };

/**
 * Adds a child to a record's BOM. On a Custom BOM, a template becomes a new
 * temporary item the moment it is added (with its own Template BOM copied under
 * it), and a selection starts with its default catalog item.
 */
export function AddChildDialog({
  open, parentId, parentLabel, allowedKinds, custom, onClose, onDone,
}: {
  open: boolean;
  parentId: number;
  parentLabel: string;
  allowedKinds: Kind[];
  custom: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [child, setChild] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [role, setRole] = useState('');
  const [flowId, setFlowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setChild(null); setQuantity('1'); setRole(''); setFlowId(null); setError(null); } }, [open]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await cfApi.post(`/records/${parentId}/bom/lines`, { childId: child?.id ?? null, quantity, role: role || null, operationFlowId: child?.kind === 'selection' ? null : flowId });
      setBusy(false); onDone(); onClose();
    } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  const hint = !child ? `A ${allowedKinds.map((k) => KIND_WORD[k]).join(', ')}.`
    : custom && child.kind === 'template' ? `Creates a new temporary item from ${child.code ?? child.name}, with its Template BOM copied beneath it.`
      : custom && child.kind === 'selection' ? 'Starts with the selection’s default catalog item, if it has one — you can change it after.'
        : undefined;

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>Add to <Mono sx={{ fontSize: 'inherit' }}>{parentLabel}</Mono></>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <RecordPicker kinds={allowedKinds} value={child} onChange={setChild} label="What to add" excludeIds={[parentId]} autoFocus helperText={hint} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, gap: 2 }}>
            <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
              helperText="Per one parent" />
            <TextField label="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Top flange" helperText="What it is for in this parent" />
          </Box>
          {child && child.kind !== 'selection' && (
            <FlowPicker value={flowId} onChange={setFlowId} label="Made by, in this parent (optional)" helperText="Empty: the way it is usually made" />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !child} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Changes a BOM line's quantity, role and — unless it is a selection — the flow
 * its child is made by in this parent. What a line holds cannot change.
 */
export function EditLineDialog({
  open, lineId, label, quantity, role, flowId = null, canHaveFlow = false, onClose, onDone,
}: {
  open: boolean;
  lineId: number | null;
  label: string;
  quantity: number;
  role: string | null;
  flowId?: number | null;
  canHaveFlow?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [f, setF] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setQ(String(quantity)); setR(role ?? ''); setF(flowId); setError(null); } }, [open, quantity, role, flowId]);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      await cfApi.put(`/bom-lines/${lineId}`, { quantity: q, role: r || null, ...(canHaveFlow ? { operationFlowId: f } : {}) });
      setBusy(false); onDone(); onClose();
    } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogHeader title={<>Change <Mono sx={{ fontSize: 'inherit' }}>{label}</Mono></>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField label="Quantity per parent" value={q} onChange={(e) => setQ(e.target.value)} autoFocus inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
          <TextField label="Role" value={r} onChange={(e) => setR(e.target.value)} />
          {canHaveFlow && <FlowPicker value={f} onChange={setF} label="Made by, in this parent" helperText="Empty: the way it is usually made" />}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Roll-ups above it are worked out again when you save.</Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
