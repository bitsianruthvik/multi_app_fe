/**
 * ProgressStagesSheet.tsx — Phase 2 of the Project Progress view.
 * Ordered stages for one progress template: each stage has a name, a seq_no, and
 * a set of operations that "club" into it. Operations are mapped via the junction
 * resource fabErpProgressStageOp (diffed on change). Mirrors FlowStepsSheet.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';

import { fabQuery, fabMutate } from '../api/client';
import { EmptyState, ListSkeleton } from './index';
import type { FabOperation } from '../types';

interface QueryResult<T> { data: T[] }
export interface FabProgressStage { id: number; companyId: number; templateId: number; name: string; seqNo: number }
interface FabProgressStageOp { id: number; stageId: number; operationId: number; operationName: string | null; operationCode: string | null }

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong.';
}

const gridHeader = { textAlign: 'left' as const, fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase' as const, letterSpacing: 0.4, p: 1, borderBottom: '1px solid var(--c-divider)' };
const gridCell = { p: 0.75, borderBottom: '1px solid var(--c-divider)', verticalAlign: 'middle' as const };

function StageRow({ stage, allStages, operations, stageOps, onChanged }: {
  stage: FabProgressStage;
  allStages: FabProgressStage[];
  operations: FabOperation[];
  stageOps: FabProgressStageOp[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(stage.name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { setName(stage.name); }, [stage.name]);

  const sorted = allStages.slice().sort((a, b) => a.seqNo - b.seqNo);
  const idx = sorted.findIndex((s) => s.id === stage.id);
  const isFirst = idx === 0;
  const isLast = idx === sorted.length - 1;

  const mappedOps = stageOps.filter((so) => so.stageId === stage.id);
  const opOptions = operations.map((o) => ({ id: o.id, label: `${o.code} — ${o.name}` }));
  const selectedOps = mappedOps
    .map((so) => opOptions.find((o) => o.id === so.operationId))
    .filter((o): o is { id: number; label: string } => !!o);

  async function commitName() {
    if (name.trim() === stage.name) return;
    setSaving(true); setErr('');
    try {
      await fabMutate('fabErpProgressStage', 'update', { id: stage.id, template_id: stage.templateId, name: name.trim(), seq_no: stage.seqNo });
      onChanged();
    } catch (e) { setErr(errMsg(e)); setName(stage.name); } finally { setSaving(false); }
  }

  async function changeOps(nextIds: number[]) {
    setSaving(true); setErr('');
    try {
      const curIds = mappedOps.map((so) => so.operationId);
      const added = nextIds.filter((id) => !curIds.includes(id));
      const removed = mappedOps.filter((so) => !nextIds.includes(so.operationId));
      for (const opId of added) await fabMutate('fabErpProgressStageOp', 'insert', { stage_id: stage.id, operation_id: opId });
      for (const so of removed) await fabMutate('fabErpProgressStageOp', 'delete', { id: so.id });
      onChanged();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  async function move(dir: -1 | 1) {
    const swap = sorted[idx + dir];
    if (!swap) return;
    setSaving(true); setErr('');
    try {
      await fabMutate('fabErpProgressStage', 'update', { id: stage.id, template_id: stage.templateId, name: stage.name, seq_no: swap.seqNo });
      await fabMutate('fabErpProgressStage', 'update', { id: swap.id, template_id: swap.templateId, name: swap.name, seq_no: stage.seqNo });
      onChanged();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  async function remove() {
    setSaving(true); setErr('');
    try {
      for (const so of mappedOps) await fabMutate('fabErpProgressStageOp', 'delete', { id: so.id });
      await fabMutate('fabErpProgressStage', 'delete', { id: stage.id });
      onChanged();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <Box component="tr">
      <Box component="td" sx={{ ...gridCell, width: 60, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)', color: 'var(--c-text-3)' }}>{stage.seqNo}</Typography>
      </Box>
      <Box component="td" sx={{ ...gridCell, minWidth: 160 }}>
        <TextField
          size="small" variant="standard" fullWidth value={name}
          slotProps={{ input: { disableUnderline: true } }}
          onChange={(e) => setName(e.target.value)} onBlur={commitName}
        />
      </Box>
      <Box component="td" sx={{ ...gridCell, minWidth: 300 }}>
        <Autocomplete
          multiple size="small"
          options={opOptions}
          value={selectedOps}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => changeOps(value.map((v) => v.id))}
          renderValue={(value, getItemProps) => value.map((o, i) => <Chip size="small" label={o.label} {...getItemProps({ index: i })} key={o.id} />)}
          renderInput={(params) => <TextField {...params} variant="standard" placeholder={selectedOps.length === 0 ? 'Map operations…' : ''} slotProps={{ input: { ...params.InputProps, disableUnderline: true } }} />}
        />
        {err && <Typography sx={{ fontSize: 11, color: 'var(--c-danger, #d32f2f)' }}>{err}</Typography>}
      </Box>
      <Box component="td" sx={{ ...gridCell, width: 120 }}>
        <Stack direction="row" spacing={0.25} alignItems="center">
          {saving && <CircularProgress size={13} sx={{ mr: 0.5 }} />}
          <Tooltip title="Move up"><span><IconButton size="small" disabled={isFirst || saving} onClick={() => move(-1)}><ArrowUpwardRounded fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="Move down"><span><IconButton size="small" disabled={isLast || saving} onClick={() => move(1)}><ArrowDownwardRounded fontSize="small" /></IconButton></span></Tooltip>
          <Tooltip title="Delete stage"><IconButton size="small" color="error" disabled={saving} onClick={remove}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
        </Stack>
      </Box>
    </Box>
  );
}

export default function ProgressStagesSheet({ templateId, operations }: { templateId: number; operations: FabOperation[] }) {
  const [stages, setStages] = useState<FabProgressStage[]>([]);
  const [stageOps, setStageOps] = useState<FabProgressStageOp[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const sres = await fabQuery<QueryResult<FabProgressStage>>('fabErpProgressStage', {
        filters: { templateId }, orderBy: [{ field: 'seqNo', direction: 'asc' }], pagination: { limit: 500 },
      });
      const st = sres.data ?? [];
      setStages(st);
      const opsPer = await Promise.all(st.map((s) =>
        fabQuery<QueryResult<FabProgressStageOp>>('fabErpProgressStageOp', { filters: { stageId: s.id }, pagination: { limit: 500 } })));
      setStageOps(opsPer.flatMap((r) => r.data ?? []));
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  const sorted = stages.slice().sort((a, b) => a.seqNo - b.seqNo);
  const nextSeq = sorted.length ? Math.max(...sorted.map((s) => s.seqNo)) + 10 : 10;

  async function addStage() {
    setAdding(true); setErr('');
    try {
      await fabMutate('fabErpProgressStage', 'insert', { template_id: templateId, name: 'New stage', seq_no: nextSeq });
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setAdding(false); }
  }

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErr('')}>{err}</Alert>}
      {sorted.length === 0 ? (
        <EmptyState title="No stages yet" hint="Add a stage, then map the operations that roll up into it." />
      ) : (
        <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm, 4px)' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                <Box component="th" sx={gridHeader}>Seq</Box>
                <Box component="th" sx={gridHeader}>Stage</Box>
                <Box component="th" sx={gridHeader}>Operations (clubbed)</Box>
                <Box component="th" sx={gridHeader}>Actions</Box>
              </Box>
            </Box>
            <Box component="tbody">
              {sorted.map((s) => (
                <StageRow key={s.id} stage={s} allStages={sorted} operations={operations} stageOps={stageOps} onChanged={load} />
              ))}
            </Box>
          </Box>
        </Box>
      )}
      <Button size="small" startIcon={adding ? <CircularProgress size={14} /> : <AddIcon />} disabled={adding} onClick={addStage} sx={{ mt: 1.5 }}>
        Add stage
      </Button>
    </Box>
  );
}
