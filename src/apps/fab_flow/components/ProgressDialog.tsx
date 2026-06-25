import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack,
  TextField, Typography,
} from '@mui/material';
import AddIcon    from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import api, { API_HOST } from '@core/utils/axiosConfig';

interface NodeOpt { id: number; nodeCode: string; displayName: string }
interface Batch   { id?: number; batchQty: string; completionPct: string; notes: string }

interface ProgressRow {
  id:            number;
  nodeId:        number;
  processStepId: number;
  snapshotDate:  string;
  batchQty:      number;
  completionPct: number;
  notes:         string | null;
}

interface Props {
  open:           boolean;
  planId:         number;
  processStepId:  number | null;     // null = pick any step in this plan
  initialNodeId?: number | null;     // pre-fill node (for clicks from Gantt)
  stepName?:     string;
  date?:         string;             // YYYY-MM-DD; defaults to today
  onClose:       () => void;
  onSaved?:      () => void;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function ProgressDialog({
  open, planId, processStepId, initialNodeId, stepName, date, onClose, onSaved,
}: Props) {
  const [snapshotDate, setSnapshotDate] = useState(date ?? today());
  const [nodeId, setNodeId]             = useState<number | null>(initialNodeId ?? null);
  const [nodeOpts, setNodeOpts]         = useState<NodeOpt[]>([]);
  const [existing, setExisting]         = useState<ProgressRow[]>([]);
  const [batches, setBatches]           = useState<Batch[]>([{ batchQty: '1', completionPct: '0', notes: '' }]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  // Load possible nodes for this step
  useEffect(() => {
    if (!open || !processStepId) return;
    (async () => {
      try {
        const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_process_step_node_map',
          fields: ['id','nodeId','nodeRole','nodeCode','nodeDisplayName'],
          filters: { processStepId },
          pagination: { limit: 200 },
        });
        const maps = (res.data?.data ?? []) as any[];
        const worked = maps.filter(m => !m.nodeRole || m.nodeRole === 'Worked-On' || maps.length === 1);
        const list   = (worked.length > 0 ? worked : maps).map(m => ({
          id: m.nodeId, nodeCode: m.nodeCode, displayName: m.nodeDisplayName ?? m.nodeCode,
        }));
        setNodeOpts(list);
        if (!nodeId && list.length === 1) setNodeId(list[0].id);
        if (initialNodeId && list.some(n => n.id === initialNodeId)) setNodeId(initialNodeId);
      } catch (e: any) {
        setError(e.response?.data?.error ?? e.message);
      }
    })();
  }, [open, processStepId, initialNodeId]);

  const loadExisting = useCallback(async () => {
    if (!open || !processStepId || !nodeId) return;
    setLoading(true);
    try {
      const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'query', resource: 'fab_node_process_progress',
        fields: ['id','nodeId','processStepId','snapshotDate','batchQty','completionPct','notes'],
        filters: { processStepId, nodeId, snapshotDate },
        orderBy: [{ field: 'id', direction: 'asc' }],
        pagination: { limit: 100 },
      });
      const rows = (res.data?.data ?? []) as ProgressRow[];
      setExisting(rows);
      if (rows.length > 0) {
        setBatches(rows.map(r => ({
          id: r.id,
          batchQty:      String(r.batchQty),
          completionPct: String(r.completionPct),
          notes:         r.notes ?? '',
        })));
      } else {
        setBatches([{ batchQty: '1', completionPct: '0', notes: '' }]);
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [open, processStepId, nodeId, snapshotDate]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  function setBatch(i: number, k: keyof Batch, v: string) {
    setBatches(bs => bs.map((b, idx) => idx === i ? { ...b, [k]: v } : b));
  }
  function addBatch()    { setBatches(bs => [...bs, { batchQty: '1', completionPct: '0', notes: '' }]); }
  function removeBatch(i: number) { setBatches(bs => bs.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!processStepId || !nodeId) { setError('Pick a step and a node.'); return; }
    setSaving(true); setError('');
    try {
      // Soft-delete existing snapshot rows for this (step, node, date), then insert fresh
      await Promise.all(existing.map(r =>
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'delete', resource: 'fab_node_process_progress', data: { id: r.id },
        }),
      ));
      await Promise.all(batches
        .filter(b => b.batchQty !== '' && b.completionPct !== '')
        .map(b =>
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'insert', resource: 'fab_node_process_progress',
            data: {
              plan_id:         planId,
              node_id:         nodeId,
              process_step_id: processStepId,
              snapshot_date:   snapshotDate,
              batch_qty:       Number(b.batchQty),
              completion_pct:  Number(b.completionPct),
              notes:           b.notes || null,
            },
          }),
        ),
      );
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  const overall = batches.length === 0 ? 0 :
    batches.reduce((s, b) => s + Number(b.batchQty || 0) * Number(b.completionPct || 0), 0) /
    Math.max(0.0001, batches.reduce((s, b) => s + Number(b.batchQty || 0), 0));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Log Progress
        {stepName && <Typography variant="caption" display="block" color="text.secondary">{stepName}</Typography>}
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        <Stack direction="row" spacing={1.5}>
          <TextField label="Date" type="date" size="small" sx={{ width: 170 }}
            value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)}
            InputLabelProps={{ shrink: true }} />
          <Autocomplete size="small" sx={{ flex: 1 }}
            options={nodeOpts}
            getOptionLabel={(o) => `${o.nodeCode} — ${o.displayName}`}
            value={nodeOpts.find(o => o.id === nodeId) ?? null}
            onChange={(_, v) => setNodeId(v?.id ?? null)}
            renderInput={(p) => <TextField {...p} label="Node" required />} />
        </Stack>

        {loading ? <CircularProgress size={20} /> : (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2">Batches on this date</Typography>
              <Chip size="small" color="primary" variant="outlined"
                label={`Weighted: ${overall.toFixed(1)} %`} />
            </Box>
            <Divider />
            <Stack spacing={1}>
              {batches.map((b, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField size="small" label="Qty" type="number" sx={{ width: 90 }}
                    value={b.batchQty}
                    onChange={(e) => setBatch(i, 'batchQty', e.target.value)}
                    inputProps={{ min: 0, step: 1 }} />
                  <TextField size="small" label="Done %" type="number" sx={{ width: 110 }}
                    value={b.completionPct}
                    onChange={(e) => setBatch(i, 'completionPct', e.target.value)}
                    inputProps={{ min: 0, max: 100, step: 0.5 }} />
                  <TextField size="small" label="Notes" sx={{ flex: 1 }}
                    value={b.notes}
                    onChange={(e) => setBatch(i, 'notes', e.target.value)} />
                  <IconButton size="small" onClick={() => removeBatch(i)} disabled={batches.length <= 1}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={addBatch} sx={{ alignSelf: 'flex-start' }}>
                Add batch
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Multiple batches let you split a single step into groups (e.g. 5 pieces at 50% + 10 pieces at 100%).
              Saving replaces previous entries for this date.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || !nodeId}>
          {saving ? <CircularProgress size={16} /> : 'Save Progress'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
