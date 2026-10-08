import { codeOrName } from '../lib/displayCode';
import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, Link, TextField, Typography } from '@mui/material';
import { cfApi, CfApiError, LONG_WRITE_MS } from '../api/client';
import type { FlowSpecsResult, Kind, MasterRecord } from '../api/types';
import { useToast } from './toastContext';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { bomPermission } from '../lib/orders';
import { ErrorNotice, Mono } from './ui';
import { RecordPicker } from './RecordPicker';
import { FlowPicker } from './FlowPicker';
import { DialogHeader } from './FormDialog';
import { roleShown } from './Bom/bomModel';

const KIND_WORD: Record<Kind, string> = { catalog: 'catalog item', temporary: 'temporary item', template: 'template', selection: 'selection' };

/** Says so, rather than letting the save come back as a bare 403. */
function NoPermissionNotice({ what }: { what: string }) {
  return <Alert severity="info" sx={{ mb: 2 }}>You can see this, but your role cannot {what}. Ask an administrator for the matching permission.</Alert>;
}

/**
 * Adds a child to a record's BOM. On a Custom BOM, a template is laid out as
 * rows the moment it is added (its own Template BOM beneath it) — designs with
 * no code until the line is locked — and a selection starts with its default
 * catalog item.
 *
 * The same child may be added again (user, 2026-10-01): it is another row
 * referencing the same record, named by it, and told apart by the code its
 * position gives it — no name is asked for. A name for the use can still be
 * given in Edit.
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
  const allowed = useIsPermitted()(bomPermission(custom));
  const toast = useToast();
  const [child, setChild] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [flowId, setFlowId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setChild(null); setQuantity('1'); setFlowId(null); setError(null); } }, [open]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await cfApi.post<{ flowSpecs?: FlowSpecsResult }>(`/records/${parentId}/bom/lines`, { childId: child?.id ?? null, quantity, operationFlowId: child?.kind === 'selection' ? null : flowId }, { timeoutMs: LONG_WRITE_MS });
      if (res?.flowSpecs?.words) toast.info(res.flowSpecs.words);
      setBusy(false); onDone(); onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };
  const hint = !child ? `A ${allowedKinds.map((k) => KIND_WORD[k]).join(', ')}.`
    : custom && child.kind === 'template' ? `Lays ${codeOrName(child)} out as rows here, its Template BOM beneath it. Nothing is coded until the design is frozen.`
      : custom && child.kind === 'selection' ? 'Starts with the selection’s default catalog item, if it has one — you can change it after.'
        : undefined;

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>Add to <Mono sx={{ fontSize: 'inherit' }}>{parentLabel}</Mono></>} onClose={onClose} busy={busy} />
      <DialogContent>
        {!allowed && <NoPermissionNotice what={custom ? 'change an order’s structure' : 'change a catalog BOM'} />}
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <RecordPicker kinds={allowedKinds} value={child} onChange={setChild} label="What to add" excludeIds={[parentId]} autoFocus helperText={hint} />
          <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }}
            helperText="Per one parent" sx={{ maxWidth: 180 }} />
          {child && child.kind !== 'selection' && (
            <FlowPicker value={flowId} onChange={setFlowId} label="Made by, in this parent (optional)" helperText="Empty: the way it is usually made" />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !child || !allowed} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Changes a BOM line's quantity, name in this parent and — unless it is a selection — the flow
 * its child is made by in this parent. What a line holds cannot change.
 */
export function EditLineDialog({
  open, lineId, label, childName = '', repeats = false, quantity, role, flowId = null, canHaveFlow = false, custom = false, onClose, onDone,
}: {
  open: boolean;
  lineId: number | null;
  label: string;
  /** The child's own name — the line is shown by it; a role is shown only when it differs. */
  childName?: string;
  /** The same child is in this parent more than once — said, never asked: the rows' codes tell them apart. */
  repeats?: boolean;
  quantity: number;
  role: string | null;
  flowId?: number | null;
  canHaveFlow?: boolean;
  /** Whose BOM this line belongs to — it decides which grant the save needs. */
  custom?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const allowed = useIsPermitted()(bomPermission(custom));
  const toast = useToast();
  const [q, setQ] = useState('');
  const [r, setR] = useState('');
  const [f, setF] = useState<number | null>(null);
  const [named, setNamed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  useEffect(() => { if (open) { setQ(String(quantity)); setR(role ?? ''); setF(flowId); setNamed(false); setError(null); } }, [open, quantity, role, flowId]);
  const showName = named || !!roleShown(childName, role);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const res = await cfApi.put<{ flowSpecs?: FlowSpecsResult }>(`/bom-lines/${lineId}`, { quantity: q, role: r || null, ...(canHaveFlow ? { operationFlowId: f } : {}) });
      if (res?.flowSpecs?.words) toast.info(res.flowSpecs.words);
      setBusy(false); onDone(); onClose();
    } catch (e) { setBusy(false); setError(e as CfApiError); }
  };
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogHeader title={<>Change <Mono sx={{ fontSize: 'inherit' }}>{label}</Mono></>} onClose={onClose} busy={busy} />
      <DialogContent>
        {!allowed && <NoPermissionNotice what={custom ? 'change an order’s structure' : 'change a catalog BOM'} />}
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField label="Quantity per parent" value={q} onChange={(e) => setQ(e.target.value)} autoFocus inputProps={{ inputMode: 'decimal', style: { fontFamily: 'var(--font-mono)' } }} />
          {showName
            ? <TextField label="Name in this parent" value={r} onChange={(e) => setR(e.target.value)} placeholder={childName} inputProps={{ maxLength: 100 }}
                helperText={repeats ? 'Optional — this item is in this BOM more than once, and each row already has its own code' : 'Empty: shown by the item’s own name'} />
            : <Link component="button" type="button" underline="hover" onClick={() => setNamed(true)} sx={{ justifySelf: 'start', fontSize: 12 }}>Add a name for this use</Link>}
          {canHaveFlow && <FlowPicker value={f} onChange={setF} label="Made by, in this parent" helperText="Empty: the way it is usually made" />}
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>Roll-ups above it are worked out again when you save.</Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !allowed} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
