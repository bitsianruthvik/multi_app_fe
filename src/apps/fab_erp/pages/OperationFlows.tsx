/**
 * OperationFlows — flat, table-based replacement for the visual routing builder.
 *
 * LIST (default view): a table of flows — code, name, description, active —
 * with row actions to edit name/description, duplicate, or delete. Clicking a
 * row (not its actions) opens that flow's detail view.
 *
 * DETAIL: flow header (name/code/active toggle) plus an "excel styled",
 * always-editable step grid (FlowStepsSheet) that can also be bulk-edited via
 * Excel import/export.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Switch, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';

import { fabQuery, fabMutate } from '@apps/fab_erp/api/client';
import type { FabOperationFlow, FabOperationFlowStep, FabOperation, FabResourceType } from '@apps/fab_erp/types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, StatusBadge, EmptyState, ListSkeleton, useToast } from '../components';
import FlowStepsSheet from '../components/FlowStepsSheet';

interface QueryResult<T> { data: T[]; total?: number }

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)', verticalAlign: 'top' } as const;

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong';
}

function autoCode(name: string, maxLen = 20): string {
  const c = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, maxLen);
  return c || 'FLOW';
}

// ── Flow create dialog ────────────────────────────────────────────────────────

interface FlowDraft { name: string; code: string; description: string }
const BLANK_FLOW = (): FlowDraft => ({ name: '', code: '', description: '' });

function CreateFlowDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void;
  onCreated: (flow: FabOperationFlow, wasExisting: boolean) => void;
}) {
  const [draft, setDraft] = useState<FlowDraft>(BLANK_FLOW());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { if (open) { setDraft(BLANK_FLOW()); setErr(''); } }, [open]);

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    const code = draft.code.trim().toUpperCase();
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpOperationFlow', 'insert', {
        name: draft.name.trim(), code, description: draft.description.trim() || null, active: 1,
      });
      onCreated({
        id: res.id, companyId: 0, name: draft.name.trim(), code,
        description: draft.description.trim() || null, active: 1, createdAt: '', updatedAt: '',
      }, false);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        try {
          const existing = await fabQuery<QueryResult<FabOperationFlow>>('fabErpOperationFlow', { filters: { code }, pagination: { limit: 1 } });
          const match = existing.data?.[0];
          if (match) { onCreated(match, true); return; }
        } catch { /* fall through to showing the original error */ }
      }
      setErr(errMsg(e));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>New operation flow</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField label="Name *" value={draft.name} size="small" sx={{ flex: 2 }} autoFocus
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          <TextField label="Code *" value={draft.code} size="small" sx={{ flex: 1 }}
            onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))} />
        </Box>
        <TextField label="Description" value={draft.description} size="small" fullWidth multiline minRows={2}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          helperText="Shown in the flow list — helps you find this flow later." />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Flow edit dialog (name + description only — code is immutable) ──────────

function EditFlowDialog({ open, flow, onClose, onSaved }: {
  open: boolean; flow: FabOperationFlow | null; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open && flow) { setName(flow.name); setDescription(flow.description ?? ''); setErr(''); }
  }, [open, flow]);

  async function save() {
    if (!flow) return;
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    try {
      await fabMutate('fabErpOperationFlow', 'update', { id: flow.id, name: name.trim(), description: description.trim() || null });
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Edit flow — {flow?.code}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Name *" value={name} size="small" fullWidth autoFocus onChange={(e) => setName(e.target.value)} />
        <TextField label="Description" value={description} size="small" fullWidth multiline minRows={2} onChange={(e) => setDescription(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Duplicate flow dialog ─────────────────────────────────────────────────────

function DuplicateFlowDialog({ open, source, onClose, onDuplicated }: {
  open: boolean; source: FabOperationFlow | null; onClose: () => void;
  onDuplicated: (flow: FabOperationFlow) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open && source) {
      setName(`Copy of ${source.name}`);
      setCode(autoCode(`${source.code}_COPY`));
      setErr('');
    }
  }, [open, source]);

  async function duplicate() {
    if (!source) return;
    if (!name.trim() || !code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpOperationFlow', 'insert', {
        name: name.trim(), code: code.trim().toUpperCase(), description: source.description, active: 1,
      });
      const stepsRes = await fabQuery<QueryResult<FabOperationFlowStep>>('fabErpOperationFlowStep', {
        filters: { flowId: source.id }, orderBy: [{ field: 'seqNo', direction: 'asc' }], pagination: { limit: 500 },
      });
      const steps = stepsRes.data ?? [];
      await Promise.all(steps.map((s) => fabMutate('fabErpOperationFlowStep', 'insert', {
        flow_id: res.id, operation_id: s.operationId, seq_no: s.seqNo, depends_on: s.dependsOn, resource_type_id: s.resourceTypeId, notes: s.notes,
      })));
      onDuplicated({
        id: res.id, companyId: source.companyId, name: name.trim(), code: code.trim().toUpperCase(),
        description: source.description, active: 1, createdAt: '', updatedAt: '',
      });
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Duplicate flow — {source?.code}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Creates a new flow with all of this flow's steps copied over.</Typography>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <TextField label="Name *" value={name} size="small" sx={{ flex: 2 }} autoFocus onChange={(e) => setName(e.target.value)} />
          <TextField label="Code *" value={code} size="small" sx={{ flex: 1 }} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={duplicate} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : 'Duplicate'}</Button>
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

// ── Page ───────────────────────────────────────────────────────────────────

export default function OperationFlows() {
  const canManage = usePermission('fab_erp_flows_manage');
  const { toast } = useToast();

  const [flows, setFlows] = useState<FabOperationFlow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatingFlow, setCreatingFlow] = useState(false);
  const [editTarget, setEditTarget] = useState<FabOperationFlow | null>(null);
  const [dupTarget, setDupTarget] = useState<FabOperationFlow | null>(null);
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
    setCreatingFlow(false);
    fetchFlows(flow.id);
    toast(wasExisting ? 'A flow with that code already existed — selected it.' : 'Flow created', wasExisting ? 'info' : 'success');
  }

  function handleFlowDuplicated(flow: FabOperationFlow) {
    setDupTarget(null);
    fetchFlows(flow.id);
    toast('Flow duplicated');
  }

  async function toggleActive(flow: FabOperationFlow) {
    try {
      await fabMutate('fabErpOperationFlow', 'update', { id: flow.id, active: flow.active ? 0 : 1 });
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
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreatingFlow(true)}>New flow</Button>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1300, mx: 'auto' }}>
      <PageHeader
        title="Operation Flows"
        subtitle="Ordered sequences of operations — a flat table replacement for the visual routing builder."
        actions={selectedFlow ? undefined : newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? <ListSkeleton rows={5} /> : !selectedFlow ? (
        flows.length === 0 ? (
          <EmptyState icon={<AccountTreeRounded />} title="No operation flows yet" hint='Click "New flow" to create one.' action={newBtn ?? undefined} />
        ) : (
          <Surface e={1} sx={{ overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                  <TableCell sx={{ ...th, width: 120 }}>Code</TableCell>
                  <TableCell sx={th}>Name</TableCell>
                  <TableCell sx={th}>Description</TableCell>
                  <TableCell sx={{ ...th, width: 110 }}>Status</TableCell>
                  {canManage && <TableCell sx={{ ...th, width: 150 }}>Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {flows.map((f) => (
                  <TableRow key={f.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedId(f.id)}>
                    <TableCell sx={td}><Mono chip>{f.code}</Mono></TableCell>
                    <TableCell sx={{ ...td, fontWeight: 500 }}>{f.name}</TableCell>
                    <TableCell sx={{ ...td, color: f.description ? 'var(--c-text)' : 'var(--c-text-3)', maxWidth: 360 }}>
                      {f.description || '—'}
                    </TableCell>
                    <TableCell sx={td}>
                      <StatusBadge status={f.active ? 'Active' : 'Inactive'} family={f.active ? 'success' : 'neutral'} />
                    </TableCell>
                    {canManage && (
                      <TableCell sx={td} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Edit name/description"><IconButton size="small" onClick={() => setEditTarget(f)}><EditRounded fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Duplicate"><IconButton size="small" onClick={() => setDupTarget(f)}><ContentCopyRounded fontSize="small" /></IconButton></Tooltip>
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(f)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Surface>
        )
      ) : (
        <>
          <Button size="small" startIcon={<ArrowBackRounded />} onClick={() => setSelectedId(null)} sx={{ mb: 1.5 }}>
            Back to flows
          </Button>
          <Surface e={2} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)' }}>{selectedFlow.name}</Typography>
                <Mono chip>{selectedFlow.code}</Mono>
              </Box>
              {selectedFlow.description && (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.5 }}>{selectedFlow.description}</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {canManage && (
                <Tooltip title="Edit name/description"><IconButton size="small" onClick={() => setEditTarget(selectedFlow)}><EditRounded fontSize="small" /></IconButton></Tooltip>
              )}
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>Active</Typography>
              <Switch size="small" checked={!!selectedFlow.active} disabled={!canManage} onChange={() => toggleActive(selectedFlow)} />
            </Box>
          </Surface>

          <FlowStepsSheet flow={selectedFlow} canManage={canManage} operations={operations} resourceTypes={resourceTypes} />
        </>
      )}

      <CreateFlowDialog open={creatingFlow} onClose={() => setCreatingFlow(false)} onCreated={handleFlowCreated} />
      <EditFlowDialog open={!!editTarget} flow={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); fetchFlows(selectedId ?? undefined); toast('Flow updated'); }} />
      <DuplicateFlowDialog open={!!dupTarget} source={dupTarget} onClose={() => setDupTarget(null)} onDuplicated={handleFlowDuplicated} />
      <DeleteDialog
        open={!!delTarget}
        label={delTarget ? `${delTarget.code} — ${delTarget.name}` : ''}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDeleteFlow}
      />
    </Box>
  );
}
