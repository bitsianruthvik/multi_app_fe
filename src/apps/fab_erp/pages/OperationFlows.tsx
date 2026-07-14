/**
 * OperationFlows — flat, table-based replacement for the visual routing builder.
 *
 * LEFT: list of operation flows (fabErpOperationFlow). Click to select. Inline
 * create (name + code), catching 409 duplicates and re-resolving to the
 * existing row (ItemCatalog.tsx pattern).
 *
 * DETAIL: an editable, ordered row-grid of the selected flow's steps
 * (fabErpOperationFlowStep, filtered by camelCase `flowId`, ordered by
 * `seqNo`). Each step picks an Operation, a seq number, which earlier steps
 * it depends on (stored as a CSV string of seq numbers), an optional
 * resource-type override, and free-text notes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import ListAltRounded from '@mui/icons-material/ListAltRounded';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type { FabOperationFlow, FabOperationFlowStep, FabOperation, FabResourceType } from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';
import {
  Surface, PageHeader, Mono, StatusBadge, EmptyState, ListSkeleton, useToast, EntityList, EntityRow,
} from '../components';

interface QueryResult<T> { data: T[]; total?: number }

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)', verticalAlign: 'top' } as const;

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong';
}

function parseDependsOn(v: string | null): number[] {
  if (!v) return [];
  return v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

// ── Flow create form (inline, above the flow list) ───────────────────────────

interface NewFlowDraft { name: string; code: string }
const BLANK_FLOW = (): NewFlowDraft => ({ name: '', code: '' });

function AddFlowForm({ onCancel, onCreated }: {
  onCancel: () => void;
  onCreated: (flow: FabOperationFlow, wasExisting: boolean) => void;
}) {
  const [draft, setDraft] = useState<NewFlowDraft>(BLANK_FLOW());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    const code = draft.code.trim().toUpperCase();
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpOperationFlow', 'insert', {
        name: draft.name.trim(), code, active: 1,
      });
      onCreated({ id: res.id, companyId: 0, name: draft.name.trim(), code, active: 1, createdAt: '', updatedAt: '' }, false);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        try {
          const existing = await fabQuery<QueryResult<FabOperationFlow>>('fabErpOperationFlow', {
            filters: { code }, pagination: { limit: 1 },
          });
          const match = existing.data?.[0];
          if (match) { onCreated(match, true); return; }
        } catch { /* fall through to showing the original error */ }
      }
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1, mb: 1.5 }}>
      {err && <Alert severity="error" sx={{ py: 0 }}>{err}</Alert>}
      <Typography variant="subtitle2" color="text.secondary">New operation flow</Typography>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField label="Name" value={draft.name} size="small" sx={{ flex: 2 }} autoFocus
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <TextField label="Code" value={draft.code} size="small" sx={{ flex: 1 }}
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving}>
          {saving ? <CircularProgress size={14} /> : 'Create'}
        </Button>
      </Box>
    </Box>
  );
}

// ── Step add/edit dialog ──────────────────────────────────────────────────────

interface StepDraft {
  operationId: number | null;
  seqNo: number | '';
  dependsOn: number[];
  resourceTypeId: number | null;
  notes: string;
}

function blankStepDraft(nextSeq: number): StepDraft {
  return { operationId: null, seqNo: nextSeq, dependsOn: [], resourceTypeId: null, notes: '' };
}

function StepDialog({ open, initial, flowId, steps, operations, resourceTypes, onClose, onSaved }: {
  open: boolean;
  initial: FabOperationFlowStep | null;
  flowId: number;
  steps: FabOperationFlowStep[];
  operations: FabOperation[];
  resourceTypes: FabResourceType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !initial;
  const nextSeq = steps.length > 0 ? Math.max(...steps.map((s) => s.seqNo)) + 1 : 1;
  const [draft, setDraft] = useState<StepDraft>(blankStepDraft(nextSeq));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (initial) {
      setDraft({
        operationId: initial.operationId,
        seqNo: initial.seqNo,
        dependsOn: parseDependsOn(initial.dependsOn),
        resourceTypeId: initial.resourceTypeId,
        notes: initial.notes ?? '',
      });
    } else {
      setDraft(blankStepDraft(nextSeq));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // Only earlier steps (lower seqNo than this row's own seqNo) can be a dependency.
  const earlierSeqNos = useMemo(() => {
    const cur = draft.seqNo === '' ? Infinity : Number(draft.seqNo);
    const excludeId = initial?.id;
    return Array.from(new Set(
      steps.filter((s) => s.id !== excludeId && s.seqNo < cur).map((s) => s.seqNo),
    )).sort((a, b) => a - b);
  }, [steps, draft.seqNo, initial]);

  // Drop any selected dependsOn values that are no longer valid earlier steps
  // (e.g. the user lowered the seq number after picking dependencies).
  useEffect(() => {
    setDraft((d) => {
      const filtered = d.dependsOn.filter((n) => earlierSeqNos.includes(n));
      return filtered.length === d.dependsOn.length ? d : { ...d, dependsOn: filtered };
    });
  }, [earlierSeqNos]);

  const selectedOperation = operations.find((o) => o.id === draft.operationId);
  const defaultRt = selectedOperation?.defaultResourceTypeId != null
    ? resourceTypes.find((rt) => rt.id === selectedOperation.defaultResourceTypeId)
    : undefined;

  const operationOptions = operations.map((o) => ({ id: o.id, label: `${o.code} — ${o.name}` }));
  const resourceTypeOptions = resourceTypes.map((rt) => ({ id: rt.id, label: `${rt.code} — ${rt.name}` }));

  async function save() {
    if (!draft.operationId) { setErr('Operation is required.'); return; }
    if (draft.seqNo === '' || Number(draft.seqNo) < 1) { setErr('Seq. no must be a positive number.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        flow_id: flowId,
        operation_id: draft.operationId,
        seq_no: Number(draft.seqNo),
        depends_on: draft.dependsOn.length > 0 ? draft.dependsOn.slice().sort((a, b) => a - b).join(',') : null,
        resource_type_id: draft.resourceTypeId,
        notes: draft.notes.trim() || null,
      };
      if (isNew) await fabMutate('fabErpOperationFlowStep', 'insert', payload);
      else await fabMutate('fabErpOperationFlowStep', 'update', { id: initial!.id, ...payload });
      onSaved();
    } catch (e) {
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'Add step' : `Edit step — seq ${initial?.seqNo}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}

        <Autocomplete
          options={operationOptions}
          value={operationOptions.find((o) => o.id === draft.operationId) ?? null}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => setDraft((d) => ({ ...d, operationId: value ? value.id : null }))}
          renderInput={(params) => <TextField {...params} label="Operation *" size="small" />}
        />

        <TextField
          label="Seq. no *" type="number" size="small" value={draft.seqNo}
          onChange={(e) => setDraft((d) => ({ ...d, seqNo: e.target.value === '' ? '' : Number(e.target.value) }))}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
        />

        <Autocomplete
          multiple
          options={earlierSeqNos}
          value={draft.dependsOn}
          getOptionLabel={(n) => `Step ${n}`}
          onChange={(_, value) => setDraft((d) => ({ ...d, dependsOn: value }))}
          renderValue={(value, getItemProps) =>
            value.map((n, i) => <Chip size="small" label={`Step ${n}`} {...getItemProps({ index: i })} key={n} />)
          }
          disabled={earlierSeqNos.length === 0}
          renderInput={(params) => (
            <TextField {...params} label="Depends on" size="small"
              helperText={earlierSeqNos.length === 0 ? 'No earlier steps to depend on — runs first.' : 'Blank = runs after the previous step.'} />
          )}
        />

        <Autocomplete
          options={resourceTypeOptions}
          value={resourceTypeOptions.find((rt) => rt.id === draft.resourceTypeId) ?? null}
          getOptionLabel={(o) => o.label}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, value) => setDraft((d) => ({ ...d, resourceTypeId: value ? value.id : null }))}
          renderInput={(params) => (
            <TextField {...params} label="Resource type override" size="small"
              placeholder={defaultRt ? `Default: ${defaultRt.code} — ${defaultRt.name}` : 'No default set on operation'}
              helperText={defaultRt ? `Inherits "${defaultRt.code} — ${defaultRt.name}" from the operation when left blank.` : 'Optional — overrides the operation\'s default resource type.'} />
          )}
        />

        <TextField
          label="Notes" size="small" fullWidth multiline minRows={2} value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? <CircularProgress size={16} color="inherit" /> : (isNew ? 'Add step' : 'Save changes')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, label, onClose, onConfirm }: { open: boolean; label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Confirm delete</DialogTitle>
      <DialogContent><Typography>Delete <strong>{label}</strong>? This cannot be undone.</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Steps grid for the selected flow ──────────────────────────────────────────

function StepsGrid({ flow, canManage, operations, resourceTypes }: {
  flow: FabOperationFlow; canManage: boolean; operations: FabOperation[]; resourceTypes: FabResourceType[];
}) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<FabOperationFlowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [stepDlg, setStepDlg] = useState<{ open: boolean; item: FabOperationFlowStep | null }>({ open: false, item: null });
  const [delTarget, setDelTarget] = useState<FabOperationFlowStep | null>(null);
  const [reordering, setReordering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      // Filter key MUST be camelCase (flowId) — snake_case is silently ignored
      // by the generic query API and would leak every flow's steps into this grid.
      const res = await fabQuery<QueryResult<FabOperationFlowStep>>('fabErpOperationFlowStep', {
        filters: { flowId: flow.id },
        orderBy: [{ field: 'seqNo', direction: 'asc' }],
        pagination: { limit: 500 },
      });
      setSteps(res.data ?? []);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, [flow.id]);

  useEffect(() => { load(); }, [load]);

  function onStepSaved() { setStepDlg({ open: false, item: null }); load(); toast('Step saved'); }

  async function handleDelete() {
    if (!delTarget) return;
    try {
      await fabMutate('fabErpOperationFlowStep', 'delete', { id: delTarget.id });
      setDelTarget(null); load(); toast('Step removed');
    } catch (e) { setErr(errMsg(e)); setDelTarget(null); }
  }

  async function move(step: FabOperationFlowStep, dir: -1 | 1) {
    const sorted = steps.slice().sort((a, b) => a.seqNo - b.seqNo);
    const idx = sorted.findIndex((s) => s.id === step.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    setReordering(true);
    try {
      // Rewrite seq_no on both rows to swap their order.
      await fabMutate('fabErpOperationFlowStep', 'update', {
        id: step.id, flow_id: flow.id, operation_id: step.operationId, seq_no: other.seqNo,
        depends_on: step.dependsOn, resource_type_id: step.resourceTypeId, notes: step.notes,
      });
      await fabMutate('fabErpOperationFlowStep', 'update', {
        id: other.id, flow_id: flow.id, operation_id: other.operationId, seq_no: step.seqNo,
        depends_on: other.dependsOn, resource_type_id: other.resourceTypeId, notes: other.notes,
      });
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setReordering(false); }
  }

  const sortedSteps = steps.slice().sort((a, b) => a.seqNo - b.seqNo);
  const opMap = new Map(operations.map((o) => [o.id, o]));

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {canManage && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setStepDlg({ open: true, item: null })}>
            Add step
          </Button>
        </Box>
      )}
      {loading ? <ListSkeleton rows={3} /> : sortedSteps.length === 0 ? (
        <EmptyState icon={<ListAltRounded />} title="No steps in this flow yet" hint='Click "Add step" to build the sequence.' />
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={{ ...th, width: 60 }}>Seq</TableCell>
                <TableCell sx={th}>Operation</TableCell>
                <TableCell sx={th}>Depends on</TableCell>
                <TableCell sx={th}>Resource type</TableCell>
                <TableCell sx={th}>Notes</TableCell>
                {canManage && <TableCell sx={{ ...th, width: 150 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedSteps.map((s, i) => {
                const dependsOnList = parseDependsOn(s.dependsOn);
                const op = opMap.get(s.operationId);
                const defaultRt = op?.defaultResourceTypeId != null
                  ? resourceTypes.find((rt) => rt.id === op.defaultResourceTypeId) : undefined;
                return (
                  <TableRow key={s.id} hover>
                    <TableCell sx={td}><Mono tabular chip>{s.seqNo}</Mono></TableCell>
                    <TableCell sx={td}>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{s.operationName ?? op?.name ?? `#${s.operationId}`}</Typography>
                      {(s.operationCode ?? op?.code) && <Mono sx={{ display: 'block', mt: 0.25 }}>{s.operationCode ?? op?.code}</Mono>}
                    </TableCell>
                    <TableCell sx={td}>
                      {dependsOnList.length === 0 ? (
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{i === 0 ? '— first step' : 'previous step'}</Typography>
                      ) : (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {dependsOnList.map((n) => <Mono key={n} chip>Step {n}</Mono>)}
                        </Stack>
                      )}
                    </TableCell>
                    <TableCell sx={td}>
                      {s.resourceTypeName ? (
                        <Mono chip>{s.resourceTypeName}</Mono>
                      ) : defaultRt ? (
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>default: {defaultRt.code} — {defaultRt.name}</Typography>
                      ) : (
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={td}>
                      <Typography sx={{ fontSize: 13, color: s.notes ? 'var(--c-text)' : 'var(--c-text-3)', maxWidth: 240 }}>
                        {s.notes || '—'}
                      </Typography>
                    </TableCell>
                    {canManage && (
                      <TableCell sx={td}>
                        <Stack direction="row" spacing={0.25}>
                          <Tooltip title="Move up"><span>
                            <IconButton size="small" disabled={i === 0 || reordering} onClick={() => move(s, -1)}><ArrowUpwardRounded fontSize="small" /></IconButton>
                          </span></Tooltip>
                          <Tooltip title="Move down"><span>
                            <IconButton size="small" disabled={i === sortedSteps.length - 1 || reordering} onClick={() => move(s, 1)}><ArrowDownwardRounded fontSize="small" /></IconButton>
                          </span></Tooltip>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => setStepDlg({ open: true, item: s })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(s)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                        </Stack>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Surface>
      )}

      <StepDialog
        open={stepDlg.open}
        initial={stepDlg.item}
        flowId={flow.id}
        steps={steps}
        operations={operations}
        resourceTypes={resourceTypes}
        onClose={() => setStepDlg({ open: false, item: null })}
        onSaved={onStepSaved}
      />
      <DeleteDialog
        open={!!delTarget}
        label={delTarget ? `Step ${delTarget.seqNo} — ${delTarget.operationName ?? ''}` : ''}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function OperationFlows() {
  const canManage = usePermission('fab_erp_flows_manage');
  const { toast } = useToast();

  const [flows, setFlows] = useState<FabOperationFlow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingFlow, setAddingFlow] = useState(false);
  const [delTarget, setDelTarget] = useState<FabOperationFlow | null>(null);

  const [operations, setOperations] = useState<FabOperation[]>([]);
  const [resourceTypes, setResourceTypes] = useState<FabResourceType[]>([]);

  const fetchFlows = useCallback(async (selectId?: number) => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<QueryResult<FabOperationFlow>>('fabErpOperationFlow', {
        orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 },
      });
      const list = res.data ?? [];
      setFlows(list);
      if (selectId !== undefined) {
        setSelectedId(list.some((f) => f.id === selectId) ? selectId : null);
      } else {
        setSelectedId((prev) => (prev != null && list.some((f) => f.id === prev) ? prev : prev));
      }
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, []);

  const fetchLookups = useCallback(async () => {
    try {
      const [opsRes, rtRes] = await Promise.all([
        fabQuery<QueryResult<FabOperation>>('fabErpOperation', {
          filters: { active: 1 }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 },
        }),
        fabQuery<QueryResult<FabResourceType>>('fabErpResourceType', {
          orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 },
        }),
      ]);
      setOperations(opsRes.data ?? []);
      setResourceTypes(rtRes.data ?? []);
    } catch (e) { setError(errMsg(e)); }
  }, []);

  useEffect(() => { fetchFlows(); fetchLookups(); }, [fetchFlows, fetchLookups]);

  const selectedFlow = flows.find((f) => f.id === selectedId) ?? null;

  function handleFlowCreated(flow: FabOperationFlow, wasExisting: boolean) {
    setAddingFlow(false);
    fetchFlows(flow.id);
    toast(wasExisting ? 'A flow with that code already existed — selected it.' : 'Flow created', wasExisting ? 'info' : 'success');
  }

  async function toggleActive(flow: FabOperationFlow) {
    try {
      await fabMutate('fabErpOperationFlow', 'update', { id: flow.id, name: flow.name, code: flow.code, active: flow.active ? 0 : 1 });
      fetchFlows(flow.id);
    } catch (e) { setError(errMsg(e)); }
  }

  async function handleDeleteFlow() {
    if (!delTarget) return;
    try {
      await fabMutate('fabErpOperationFlow', 'delete', { id: delTarget.id });
      if (selectedId === delTarget.id) setSelectedId(null);
      setDelTarget(null);
      fetchFlows();
      toast('Flow deleted');
    } catch (e) { setError(errMsg(e)); setDelTarget(null); }
  }

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAddingFlow(true)}>New flow</Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      <PageHeader
        title="Operation Flows"
        subtitle="Ordered sequences of operations — a flat table replacement for the visual routing builder. Each step picks an operation, its order, dependencies, and an optional resource-type override."
        actions={newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 340px', minWidth: 300, maxWidth: 420 }}>
          {addingFlow && <AddFlowForm onCancel={() => setAddingFlow(false)} onCreated={handleFlowCreated} />}

          {loading ? <ListSkeleton rows={4} /> : flows.length === 0 ? (
            !addingFlow && <EmptyState icon={<AccountTreeRounded />} title="No operation flows yet" hint='Click "New flow" to create one.' action={newBtn ?? undefined} />
          ) : (
            <EntityList>
              {flows.map((f) => {
                const isSelected = f.id === selectedId;
                return (
                  <EntityRow
                    key={f.id}
                    code={<Mono chip>{f.code}</Mono>}
                    primary={f.name}
                    trailing={<StatusBadge status={f.active ? 'Active' : 'Inactive'} family={f.active ? 'success' : 'neutral'} />}
                    onClick={() => setSelectedId(isSelected ? null : f.id)}
                    actions={canManage ? (
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(f)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                    ) : undefined}
                  />
                );
              })}
            </EntityList>
          )}
        </Box>

        <Box sx={{ flex: '2 1 560px', minWidth: 320 }}>
          {!selectedFlow ? (
            <EmptyState icon={<ListAltRounded />} title="Select a flow" hint="Choose an operation flow on the left to view and edit its steps." />
          ) : (
            <>
              <Surface e={2} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)' }}>{selectedFlow.name}</Typography>
                  <Mono chip>{selectedFlow.code}</Mono>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Active</Typography>
                  <Switch size="small" checked={!!selectedFlow.active} disabled={!canManage} onChange={() => toggleActive(selectedFlow)} />
                </Box>
              </Surface>

              <StepsGrid flow={selectedFlow} canManage={canManage} operations={operations} resourceTypes={resourceTypes} />
            </>
          )}
        </Box>
      </Box>

      <DeleteDialog
        open={!!delTarget}
        label={delTarget ? `${delTarget.code} — ${delTarget.name}` : ''}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDeleteFlow}
      />
    </Box>
  );
}
