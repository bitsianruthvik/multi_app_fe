import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import LayersRounded from '@mui/icons-material/LayersRounded';
import { Surface } from './Surface';
import { Mono } from './Mono';
import { formatElapsed } from '../utils/formatElapsed';
import { formatMinutes } from '../utils/formatMinutes';
import {
  BATCH_MODE_LABELS, getBatch,
  type BatchDetail, type BatchMember, type CompleteOutcome,
} from '../api/batches';

/**
 * A batch that is running right now, above the queue rows it owns.
 *
 * Batched tasks are still individual rows in the queue — they have their own
 * marks, their own quantities and their own outcomes — but they share one
 * clock. This card is that clock, and the one place the whole run can be
 * finished from, so the operator is never asked to complete eight rows that
 * physically ended at the same instant.
 */
export function RunningBatchCard({
  batchId,
  mode,
  startedAt,
  operationName,
  taskCount,
  now,
  onComplete,
  busy,
}: {
  batchId: number;
  /** Omitted where the caller only knows the batch id (e.g. the queue payload). */
  mode?: keyof typeof BATCH_MODE_LABELS;
  startedAt: string | null;
  operationName: string | null;
  taskCount: number;
  now: number;
  onComplete: () => void;
  busy: boolean;
}) {
  const elapsed = formatElapsed(startedAt, now);
  return (
    <Surface
      e={2}
      sx={{
        p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
        borderColor: 'var(--c-primary-200)', background: 'var(--c-primary-50)',
      }}
    >
      <Box
        sx={{
          width: 34, height: 34, borderRadius: 'var(--r-sm)', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: 'var(--c-surface)', color: 'var(--c-primary-600)',
        }}
      >
        <LayersRounded fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
            {taskCount} parts running together
          </Typography>
          {mode && (
            <Chip
              size="small"
              label={BATCH_MODE_LABELS[mode] ?? mode}
              sx={{ height: 20, fontSize: 11.5, background: 'var(--c-surface)', border: '1px solid var(--c-primary-200)', color: 'var(--c-primary-800)' }}
            />
          )}
          <Mono chip>Batch {batchId}</Mono>
        </Box>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.25 }}>
          {operationName ?? 'Operation'} · running {elapsed ?? '—'}
        </Typography>
      </Box>
      <Button size="small" variant="contained" color="success" onClick={onComplete} disabled={busy}>
        Complete batch
      </Button>
    </Surface>
  );
}

type Draft = { producedQty: string; scrapQty: string; qcPassed: boolean };

/**
 * Finish a whole batch in one dialog.
 *
 * Defaults to every part passing at its planned quantity, because that is what
 * usually happened and because a form that demands eight identical
 * confirmations is a form people learn to click through without reading. The
 * per-part fields are right there for the run where one piece came out wrong —
 * which is the only case where per-part data is worth anything.
 */
export function CompleteBatchDialog({
  open,
  batchId,
  onClose,
  onCompleted,
}: {
  open: boolean;
  batchId: number | null;
  onClose: () => void;
  onCompleted: (outcomes: Record<number, CompleteOutcome>) => Promise<boolean>;
}) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !batchId) { setDetail(null); setDrafts({}); setErr(''); return; }
    let cancelled = false;
    setLoading(true);
    getBatch(batchId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res);
        const next: Record<number, Draft> = {};
        for (const m of res.members) {
          if (m.status !== 'in_progress') continue;
          next[m.taskId] = { producedQty: '', scrapQty: '0', qcPassed: true };
        }
        setDrafts(next);
      })
      .catch((e) => {
        if (!cancelled) setErr((e as Error).message || 'Failed to load the batch.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, batchId]);

  const members: BatchMember[] = (detail?.members ?? []).filter((m) => m.status === 'in_progress');
  const anyFailed = Object.values(drafts).some((d) => !d.qcPassed);

  const invalid = Object.values(drafts).some((d) => {
    const badProduced = d.producedQty.trim() !== '' && !(Number(d.producedQty) >= 0);
    const badScrap = d.scrapQty.trim() !== '' && !(Number(d.scrapQty) >= 0);
    return badProduced || badScrap;
  });

  const update = (taskId: number, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [taskId]: { ...prev[taskId], ...patch } }));

  async function submit() {
    if (invalid) return;
    setSubmitting(true);
    const outcomes: Record<number, CompleteOutcome> = {};
    for (const [taskId, d] of Object.entries(drafts)) {
      const o: CompleteOutcome = { qcResult: d.qcPassed ? 'pass' : 'fail' };
      if (d.producedQty.trim() !== '') o.producedQty = Number(d.producedQty);
      if (d.scrapQty.trim() !== '') o.scrapQty = Number(d.scrapQty);
      outcomes[Number(taskId)] = o;
    }
    const ok = await onCompleted(outcomes);
    setSubmitting(false);
    if (ok) onClose();
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Complete batch{batchId ? ` #${batchId}` : ''}</DialogTitle>
      <DialogContent>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={22} /></Box>}
        {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

        {!loading && detail && (
          <>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 2 }}>
              {members.length} parts finished together on {detail.batch.resourceName ?? 'this machine'}.
              {' '}Run time is split across them in proportion to their planned hours
              {detail.batch.setupMinutes ? `, with ${formatMinutes(detail.batch.setupMinutes)} of setup held against the batch` : ''}
              {' '}— so no part is charged for the whole run.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {members.map((m) => {
                const d = drafts[m.taskId] ?? { producedQty: '', scrapQty: '0', qcPassed: true };
                return (
                  <Surface key={m.taskId} e={1} sx={{ p: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      {m.itemMark && (
                        <Box
                          component="span"
                          sx={{
                            fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600,
                            color: 'var(--c-primary-900)', background: 'var(--c-primary-50)',
                            border: '1px solid var(--c-primary-200)', borderRadius: 'var(--r-sm)',
                            px: 0.75, py: 0.125,
                          }}
                        >
                          {m.itemMark}
                        </Box>
                      )}
                      <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)' }}>
                        {m.itemName ?? `Item #${m.itemId}`}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                        {m.orderNumber ?? ''}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
                      <TextField
                        label="Good qty" type="number" size="small" sx={{ width: 130 }}
                        value={d.producedQty}
                        onChange={(e) => update(m.taskId, { producedQty: e.target.value })}
                        placeholder={m.itemQty != null ? String(Number(m.itemQty)) : ''}
                        inputProps={{ min: 0, step: 'any' }}
                      />
                      <TextField
                        label="Scrap" type="number" size="small" sx={{ width: 110 }}
                        value={d.scrapQty}
                        onChange={(e) => update(m.taskId, { scrapQty: e.target.value })}
                        inputProps={{ min: 0, step: 'any' }}
                      />
                      <Tooltip title={d.qcPassed ? 'Passed QC' : 'A rework task will be queued for this part'}>
                        <FormControlLabel
                          control={
                            <Switch
                              size="small" color="success" checked={d.qcPassed}
                              onChange={(e) => update(m.taskId, { qcPassed: e.target.checked })}
                            />
                          }
                          label={<Typography sx={{ fontSize: 12.5 }}>{d.qcPassed ? 'QC pass' : 'QC fail'}</Typography>}
                        />
                      </Tooltip>
                    </Box>
                  </Surface>
                );
              })}
            </Box>

            {anyFailed && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Rework tasks will be queued for the failed parts. They book no finished stock until the rework passes QC —
                the rest of the batch completes normally.
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          onClick={submit}
          variant="contained"
          color={anyFailed ? 'warning' : 'success'}
          disabled={submitting || loading || invalid || members.length === 0}
        >
          {submitting ? <CircularProgress size={18} /> : `Complete ${members.length} parts`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
