/**
 * FlowStepsSheet — "excel styled" always-editable grid for an operation flow's
 * steps. Every cell is a live input (no add/edit dialog); each field commits
 * to the server as soon as it changes (Autocomplete/select cells) or on blur
 * (text/number cells). A trailing "add row" line inserts a new step as soon
 * as an Operation is picked.
 *
 * The Import/Export toolbar above the grid round-trips the exact same data
 * through an .xlsx file — either path (typing here, or edit-in-Excel-and-
 * reimport) converges on the same step list for this flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, List, ListItem, ListItemText, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';
import ListAltRounded from '@mui/icons-material/ListAltRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type { FabOperationFlow, FabOperationFlowStep, FabOperation, FabResourceType } from '@apps/fab_erp/types';
import api, { API_HOST } from '@core/utils/axiosConfig';
import { EmptyState, ListSkeleton, StatusBadge, useToast } from './index';

interface QueryResult<T> { data: T[]; total?: number }

interface ImportFlowStepsResult { stepsCreated: number; warnings: { row: number; message: string }[] }

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong';
}

function parseDependsOn(v: string | null): number[] {
  if (!v) return [];
  return v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

// Excel-style gridlines on every cell.
const gridCell = { border: '1px solid var(--c-divider)', padding: '2px 6px', verticalAlign: 'middle' } as const;
const gridHeader = {
  ...gridCell,
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--c-text-2)',
  textTransform: 'uppercase' as const, letterSpacing: '.05em', background: 'var(--c-surface-2)',
};

interface RowDraft {
  seqNo: number;
  operationId: number | null;
  dependsOn: number[];
  resourceTypeId: number | null;
  notes: string;
}

function fromStep(s: FabOperationFlowStep): RowDraft {
  return { seqNo: s.seqNo, operationId: s.operationId, dependsOn: parseDependsOn(s.dependsOn), resourceTypeId: s.resourceTypeId, notes: s.notes ?? '' };
}

function StepRow({ step, allSteps, flowId, operations, resourceTypes, canManage, isFirst, isLast, onChanged, onDeleted, onMove }: {
  step: FabOperationFlowStep; allSteps: FabOperationFlowStep[]; flowId: number;
  operations: FabOperation[]; resourceTypes: FabResourceType[]; canManage: boolean;
  isFirst: boolean; isLast: boolean;
  onChanged: () => void; onDeleted: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [draft, setDraft] = useState<RowDraft>(fromStep(step));
  const [notesDraft, setNotesDraft] = useState(step.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(fromStep(step)); setNotesDraft(step.notes ?? ''); }, [step]);

  const earlierSeqNos = useMemo(() => Array.from(new Set(
    allSteps.filter((s) => s.id !== step.id && s.seqNo < draft.seqNo).map((s) => s.seqNo),
  )).sort((a, b) => a - b), [allSteps, step.id, draft.seqNo]);

  async function commit(patch: Partial<RowDraft>) {
    const merged = { ...draft, ...patch };
    setDraft(merged);
    setSaving(true);
    try {
      await fabMutate('fabErpOperationFlowStep', 'update', {
        id: step.id,
        flow_id: flowId,
        operation_id: merged.operationId,
        seq_no: merged.seqNo,
        depends_on: merged.dependsOn.length > 0 ? merged.dependsOn.slice().sort((a, b) => a - b).join(',') : null,
        resource_type_id: merged.resourceTypeId,
        notes: merged.notes.trim() || null,
      });
      onChanged();
    } finally { setSaving(false); }
  }

  const operationOptions = operations.map((o) => ({ id: o.id, label: `${o.code} — ${o.name}` }));
  const resourceTypeOptions = resourceTypes.map((rt) => ({ id: rt.id, label: `${rt.code} — ${rt.name}` }));
  const op = operations.find((o) => o.id === draft.operationId);
  const defaultRt = op?.defaultResourceTypeId != null ? resourceTypes.find((rt) => rt.id === op.defaultResourceTypeId) : undefined;

  return (
    <Box component="tr">
      <Box component="td" sx={{ ...gridCell, width: 64 }}>
        <TextField
          type="number" size="small" variant="standard" value={draft.seqNo}
          slotProps={{ htmlInput: { min: 1, step: 1, style: { fontFamily: 'var(--font-mono, monospace)' } }, input: { disableUnderline: true } }}
          disabled={!canManage}
          onChange={(e) => setDraft((d) => ({ ...d, seqNo: e.target.value === '' ? d.seqNo : Number(e.target.value) }))}
          onBlur={() => { if (draft.seqNo !== step.seqNo) commit({}); }}
        />
      </Box>
      <Box component="td" sx={{ ...gridCell, minWidth: 220 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Autocomplete
            size="small" disabled={!canManage} fullWidth sx={{ flex: 1 }}
            options={operationOptions}
            value={operationOptions.find((o) => o.id === draft.operationId) ?? null}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, value) => commit({ operationId: value ? value.id : null })}
            renderInput={(params) => <TextField {...params} variant="standard" slotProps={{ input: { ...params.InputProps, disableUnderline: true } }} />}
          />
          {/* FEAT-09: flag operations with no time formula — their tasks get no duration/ETA. */}
          {op && !op.timeFormula?.trim() && (
            <Tooltip title="This operation has no time formula — its task will have no duration/ETA, which breaks scheduling. Add one in Operations.">
              <WarningAmberRounded fontSize="small" sx={{ color: 'var(--c-warning, #ed6c02)', flexShrink: 0 }} />
            </Tooltip>
          )}
        </Box>
      </Box>
      <Box component="td" sx={{ ...gridCell, minWidth: 160 }}>
        <Autocomplete
          multiple size="small" disabled={!canManage || earlierSeqNos.length === 0}
          options={earlierSeqNos}
          value={draft.dependsOn.filter((n) => earlierSeqNos.includes(n))}
          getOptionLabel={(n) => `Step ${n}`}
          onChange={(_, value) => commit({ dependsOn: value })}
          renderValue={(value, getItemProps) => value.map((n, i) => <Chip size="small" label={n} {...getItemProps({ index: i })} key={n} />)}
          renderInput={(params) => (
            <TextField {...params} variant="standard" placeholder={earlierSeqNos.length === 0 ? '— first step' : ''}
              slotProps={{ input: { ...params.InputProps, disableUnderline: true } }} />
          )}
        />
      </Box>
      <Box component="td" sx={{ ...gridCell, minWidth: 200 }}>
        <Autocomplete
          size="small" disabled={!canManage}
          options={resourceTypeOptions}
          value={resourceTypeOptions.find((rt) => rt.id === draft.resourceTypeId) ?? null}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => commit({ resourceTypeId: value ? value.id : null })}
          renderInput={(params) => (
            <TextField {...params} variant="standard" placeholder={defaultRt ? `Default: ${defaultRt.code}` : '—'}
              slotProps={{ input: { ...params.InputProps, disableUnderline: true } }} />
          )}
        />
      </Box>
      <Box component="td" sx={{ ...gridCell, minWidth: 200 }}>
        <TextField
          size="small" variant="standard" fullWidth disabled={!canManage} value={notesDraft}
          slotProps={{ input: { disableUnderline: true } }}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => { if (notesDraft !== (step.notes ?? '')) commit({ notes: notesDraft }); }}
        />
      </Box>
      {canManage && (
        <Box component="td" sx={{ ...gridCell, width: 132 }}>
          <Stack direction="row" spacing={0.25} alignItems="center">
            {saving && <CircularProgress size={14} sx={{ mr: 0.5 }} />}
            <Tooltip title="Move up"><span>
              <IconButton size="small" disabled={isFirst} onClick={() => onMove(-1)}><ArrowUpwardRounded fontSize="small" /></IconButton>
            </span></Tooltip>
            <Tooltip title="Move down"><span>
              <IconButton size="small" disabled={isLast} onClick={() => onMove(1)}><ArrowDownwardRounded fontSize="small" /></IconButton>
            </span></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" color="error" onClick={onDeleted}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

function AddRow({ flowId, nextSeq, operations, onAdded }: {
  flowId: number; nextSeq: number; operations: FabOperation[]; onAdded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const operationOptions = operations.map((o) => ({ id: o.id, label: `${o.code} — ${o.name}` }));

  async function add(operationId: number) {
    setAdding(true);
    try {
      await fabMutate('fabErpOperationFlowStep', 'insert', {
        flow_id: flowId, operation_id: operationId, seq_no: nextSeq, depends_on: null, resource_type_id: null, notes: null,
      });
      onAdded();
    } finally { setAdding(false); }
  }

  return (
    <Box component="tr">
      <Box component="td" sx={{ ...gridCell, width: 64, color: 'var(--c-text-3)', fontSize: 12 }}>{nextSeq}</Box>
      <Box component="td" colSpan={4} sx={{ ...gridCell }}>
        <Autocomplete
          size="small" disabled={adding}
          options={operationOptions}
          value={null}
          getOptionLabel={(o) => o.label}
          onChange={(_, value) => value && add(value.id)}
          renderInput={(params) => (
            <TextField {...params} variant="standard" placeholder="+ Pick an operation to add a step…"
              slotProps={{ input: { ...params.InputProps, disableUnderline: true, startAdornment: adding ? <CircularProgress size={14} /> : <AddIcon fontSize="small" sx={{ color: 'var(--c-text-3)', mr: 0.5 }} /> } }} />
          )}
        />
      </Box>
    </Box>
  );
}

export default function FlowStepsSheet({ flow, canManage, operations, resourceTypes }: {
  flow: FabOperationFlow; canManage: boolean; operations: FabOperation[]; resourceTypes: FabResourceType[];
}) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<FabOperationFlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const importFileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportFlowStepsResult | null>(null);
  const [importErr, setImportErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabOperationFlowStep>>('fabErpOperationFlowStep', {
        filters: { flowId: flow.id }, orderBy: [{ field: 'seqNo', direction: 'asc' }], pagination: { limit: 500 },
      });
      setSteps(res.data ?? []);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, [flow.id]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(step: FabOperationFlowStep) {
    try {
      await fabMutate('fabErpOperationFlowStep', 'delete', { id: step.id });
      await load();
      toast('Step removed');
    } catch (e) { setErr(errMsg(e)); }
  }

  async function handleMove(step: FabOperationFlowStep, dir: -1 | 1) {
    const sorted = steps.slice().sort((a, b) => a.seqNo - b.seqNo);
    const idx = sorted.findIndex((s) => s.id === step.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    try {
      await fabMutate('fabErpOperationFlowStep', 'update', {
        id: step.id, flow_id: flow.id, operation_id: step.operationId, seq_no: other.seqNo,
        depends_on: step.dependsOn, resource_type_id: step.resourceTypeId, notes: step.notes,
      });
      await fabMutate('fabErpOperationFlowStep', 'update', {
        id: other.id, flow_id: flow.id, operation_id: other.operationId, seq_no: step.seqNo,
        depends_on: other.dependsOn, resource_type_id: other.resourceTypeId, notes: other.notes,
      });
      await load();
    } catch (e) { setErr(errMsg(e)); }
  }

  async function downloadStepsTemplate() {
    setExporting(true);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get(`${API_HOST}/api/${companySlug}/fab_erp/flows/${flow.id}/export-template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${flow.code}_Steps.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportStepsFile(file: File) {
    setImporting(true); setImportErr(''); setImportResult(null);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportFlowStepsResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/flows/${flow.id}/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setImportResult(res.data);
      await load();
    } catch (e) {
      setImportErr(errMsg(e));
    } finally {
      setImporting(false);
    }
  }

  const sortedSteps = steps.slice().sort((a, b) => a.seqNo - b.seqNo);
  const nextSeq = sortedSteps.length > 0 ? Math.max(...sortedSteps.map((s) => s.seqNo)) + 1 : 1;

  // FEAT-09: operations referenced by this flow that have no time formula. Their
  // materialized tasks get NULL computed_hours (no duration), which silently
  // breaks scheduling/ETA — so warn before the flow is used.
  const opById = new Map(operations.map((o) => [o.id, o]));
  const formulalessOps = [...new Map(
    sortedSteps
      .map((s) => (s.operationId != null ? opById.get(s.operationId) : undefined))
      .filter((o): o is FabOperation => !!o && !o.timeFormula?.trim())
      .map((o) => [o.id, `${o.code} — ${o.name}`]),
  ).values()];

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {importErr && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportErr('')}>{importErr}</Alert>}

      {formulalessOps.length > 0 && (
        <Alert severity="warning" icon={<WarningAmberRounded fontSize="inherit" />} sx={{ mb: 2 }}>
          {formulalessOps.length} operation{formulalessOps.length > 1 ? 's' : ''} in this flow{' '}
          {formulalessOps.length > 1 ? 'have' : 'has'} no time formula — their tasks will have no
          duration/ETA, so scheduling can’t estimate them. Add a time formula in Operations for:{' '}
          {formulalessOps.join(', ')}.
        </Alert>
      )}

      {canManage && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1.5 }}>
          <Button
            size="small" variant="outlined" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
            onClick={downloadStepsTemplate} disabled={exporting}
          >
            Export steps
          </Button>
          <Button
            size="small" variant="outlined" startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
            onClick={() => importFileRef.current?.click()} disabled={importing}
          >
            Import steps
          </Button>
          <input
            ref={importFileRef} type="file" accept=".xlsx" hidden
            onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImportStepsFile(file); e.target.value = ''; }}
          />
        </Box>
      )}

      {loading ? <ListSkeleton rows={3} /> : sortedSteps.length === 0 && !canManage ? (
        <EmptyState icon={<ListAltRounded />} title="No steps in this flow yet" hint="Nothing to show." />
      ) : (
        <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-sm, 4px)' }}>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                <Box component="th" sx={gridHeader}>Seq</Box>
                <Box component="th" sx={gridHeader}>Operation</Box>
                <Box component="th" sx={gridHeader}>Depends on</Box>
                <Box component="th" sx={gridHeader}>Resource type</Box>
                <Box component="th" sx={gridHeader}>Notes</Box>
                {canManage && <Box component="th" sx={gridHeader}>Actions</Box>}
              </Box>
            </Box>
            <Box component="tbody">
              {sortedSteps.map((s, i) => (
                <StepRow
                  key={s.id}
                  step={s}
                  allSteps={sortedSteps}
                  flowId={flow.id}
                  operations={operations}
                  resourceTypes={resourceTypes}
                  canManage={canManage}
                  isFirst={i === 0}
                  isLast={i === sortedSteps.length - 1}
                  onChanged={load}
                  onDeleted={() => handleDelete(s)}
                  onMove={(dir) => handleMove(s, dir)}
                />
              ))}
              {canManage && <AddRow flowId={flow.id} nextSeq={nextSeq} operations={operations} onAdded={load} />}
            </Box>
          </Box>
        </Box>
      )}

      <Dialog open={importResult !== null} onClose={() => setImportResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          Import Complete
        </DialogTitle>
        <DialogContent dividers>
          {importResult && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <StatusBadge status={`${importResult.stepsCreated} step(s) created`} family="success" />
              </Box>
              {importResult.warnings.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Warnings</Typography>
                  <List dense disablePadding sx={{ maxHeight: 240, overflow: 'auto', bgcolor: 'background.default', borderRadius: 1 }}>
                    {importResult.warnings.map((w, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemText primaryTypographyProps={{ variant: 'caption' }} primary={`Row ${w.row}: ${w.message}`} />
                      </ListItem>
                    ))}
                  </List>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportResult(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
