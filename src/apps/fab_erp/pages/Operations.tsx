/**
 * Operations — master-data page for fab_erp manufacturing operations.
 *
 * LEFT: list of operations with inline "+ New operation" (name + code) create flow.
 * DETAIL (below list, on selection): tabbed panel —
 *   1. Details            — name, code, default resource type, time formula, time unit, active
 *   2. Variables           — operation-scoped formula variables (fab_erp_operation_variable)
 *   3. Resource Types      — operation ↔ resource-type mapping + "set as default"
 *
 * Modeled on ResourceTypes.tsx (inline create-new-type pattern, 409 re-resolve) and
 * ShiftCalendars.tsx (master EntityList + selected-row detail panel with sub-tabs).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, List, ListItem, ListItemText, MenuItem, Select, Switch, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DownloadIcon from '@mui/icons-material/Download';
import EditRounded from '@mui/icons-material/EditRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BuildCircleRounded from '@mui/icons-material/BuildCircleRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StarBorderRounded from '@mui/icons-material/StarBorderRounded';
import UploadFileIcon from '@mui/icons-material/UploadFile';

import { fabQuery, fabMutate, fabPost } from '../api/client';
import type { FabOperation, FabOperationVariable, FabOperationResourceType, FabResourceType } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import api, { API_HOST } from '@core/utils/axiosConfig';
import {
  Surface, PageHeader, Mono, StatusBadge, EmptyState, ListSkeleton, useToast, EntityList, EntityRow, type SortableField,
} from '../components';
import FormulaCodeEditor from '../components/FormulaCodeEditor';
import { useFormulaVariables } from '../hooks/useFormulaVariables';

interface QueryResult<T> { data: T[]; total?: number }

interface ImportOperationsResult {
  operationsCreated: number;
  operationsSkipped: number;
  mappingsCreated: number;
  warnings: { row: number; message: string }[];
}

const th = { fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.05em', borderColor: 'var(--c-divider)' } as const;
const td = { borderColor: 'var(--c-divider)', fontSize: 13, color: 'var(--c-text)' } as const;

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong';
}

const OPERATION_SORT_FIELDS: SortableField<FabOperation>[] = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code' },
];

const TIME_UNITS = [
  { value: 'min', label: 'Minutes' },
  { value: 'hr', label: 'Hours' },
  { value: 'sec', label: 'Seconds' },
] as const;

// ── Delete confirmation (shared shape) ────────────────────────────────────────

function DeleteDialog({ open, label, onClose, onConfirm, busy }: {
  open: boolean; label: string; onClose: () => void; onConfirm: () => void; busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Confirm delete</DialogTitle>
      <DialogContent><Typography>Delete <strong>{label}</strong>? This action cannot be undone.</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm} disabled={busy}>
          {busy ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Details tab ────────────────────────────────────────────────────────────────

interface DetailsDraft {
  name: string;
  code: string;
  defaultResourceTypeId: number | null;
  timeFormula: string;
  timeUnit: (typeof TIME_UNITS)[number]['value'];
  active: boolean;
}

function fromOp(op: FabOperation): DetailsDraft {
  return {
    name: op.name, code: op.code, defaultResourceTypeId: op.defaultResourceTypeId,
    timeFormula: op.timeFormula ?? '', timeUnit: op.timeUnit, active: op.active === 1,
  };
}

function DetailsPanel({ operation, resourceTypes, variableKeys, canManage, onSaved }: {
  operation: FabOperation; resourceTypes: FabResourceType[]; variableKeys: string[]; canManage: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DetailsDraft>(fromOp(operation));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { vars: formulaVars } = useFormulaVariables();

  useEffect(() => { setDraft(fromOp(operation)); setErr(''); }, [operation]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(fromOp(operation));

  async function save() {
    if (!draft.name.trim() || !draft.code.trim()) { setErr('Name and code are required.'); return; }
    setSaving(true); setErr('');
    try {
      await fabMutate('fabErpOperation', 'update', {
        id: operation.id,
        name: draft.name.trim(),
        code: draft.code.trim(),
        default_resource_type_id: draft.defaultResourceTypeId,
        time_formula: draft.timeFormula.trim() || null,
        time_unit: draft.timeUnit,
        active: draft.active ? 1 : 0,
      });
      onSaved();
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 720 }}>
      {err && <Alert severity="error">{err}</Alert>}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField label="Code *" size="small" sx={{ flex: 1 }} value={draft.code}
          onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} disabled={!canManage} />
        <TextField label="Name *" size="small" sx={{ flex: 2 }} value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} disabled={!canManage} />
      </Box>
      <TextField select label="Default resource type" size="small" fullWidth
        value={draft.defaultResourceTypeId ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, defaultResourceTypeId: e.target.value === '' ? null : Number(e.target.value) }))}
        disabled={!canManage} helperText="Used when a routing step doesn't specify a resource type explicitly">
        <MenuItem value="">— None —</MenuItem>
        {resourceTypes.map((rt) => <MenuItem key={rt.id} value={rt.id}>{rt.code} — {rt.name}</MenuItem>)}
      </TextField>

      <Box>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.5 }}>Time formula</Typography>
        <FormulaCodeEditor
          value={draft.timeFormula}
          onChange={(v) => setDraft((d) => ({ ...d, timeFormula: v }))}
          variables={formulaVars}
          opVars={variableKeys}
          readOnly={!canManage}
        />
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>
          Reference this operation's own variables as <Mono>op.&lt;var_key&gt;</Mono>, or use <Mono>machine.*</Mono> / <Mono>item.*</Mono>.
        </Typography>
      </Box>

      <TextField select label="Time unit" size="small" sx={{ width: 200 }} value={draft.timeUnit}
        onChange={(e) => setDraft((d) => ({ ...d, timeUnit: e.target.value as DetailsDraft['timeUnit'] }))} disabled={!canManage}>
        {TIME_UNITS.map((u) => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
      </TextField>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Switch checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} disabled={!canManage} />
        <Typography sx={{ fontSize: 13 }}>{draft.active ? 'Active' : 'Inactive'}</Typography>
      </Box>

      {canManage && (
        <Box>
          <Button variant="contained" onClick={save} disabled={saving || !dirty}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Save changes'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

// ── Variables tab ──────────────────────────────────────────────────────────────

interface VarDraft { varKey: string; label: string; unit: string; defaultValue: string; sortOrder: string }
const BLANK_VAR = (nextSort: number): VarDraft => ({ varKey: '', label: '', unit: '', defaultValue: '', sortOrder: String(nextSort) });

function VariableDialog({ open, initial, nextSort, onClose, onSave }: {
  open: boolean; initial: FabOperationVariable | null; nextSort: number;
  onClose: () => void; onSave: (draft: VarDraft, id?: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<VarDraft>(BLANK_VAR(nextSort));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        varKey: initial.varKey, label: initial.label, unit: initial.unit ?? '',
        defaultValue: initial.defaultValue != null ? String(initial.defaultValue) : '', sortOrder: String(initial.sortOrder),
      });
    } else { setDraft(BLANK_VAR(nextSort)); }
    setErr('');
  }, [open, initial, nextSort]);

  async function handleSave() {
    if (!draft.varKey.trim() || !draft.label.trim()) { setErr('Var key and label are required.'); return; }
    setSaving(true); setErr('');
    try { await onSave(draft, initial?.id); }
    catch (e) { setErr(errMsg(e)); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{isNew ? 'New variable' : `Edit — ${initial?.varKey}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField label="Var key *" size="small" fullWidth value={draft.varKey}
          onChange={(e) => setDraft((d) => ({ ...d, varKey: e.target.value.replace(/\s+/g, '_').toLowerCase() }))}
          helperText="Referenced in the time formula as op.<var_key>" />
        <TextField label="Label *" size="small" fullWidth value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="Unit" size="small" sx={{ flex: 1 }} value={draft.unit} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} />
          <TextField label="Default value" type="number" size="small" sx={{ flex: 1 }} value={draft.defaultValue}
            onChange={(e) => setDraft((d) => ({ ...d, defaultValue: e.target.value }))} slotProps={{ input: { inputProps: { step: 'any' } } }} />
          <TextField label="Sort order" type="number" size="small" sx={{ flex: 1 }} value={draft.sortOrder}
            onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? <CircularProgress size={16} color="inherit" /> : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function VariablesPanel({ operationId, canManage, onVarsChanged }: {
  operationId: number; canManage: boolean; onVarsChanged: (keys: string[]) => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<FabOperationVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [dlg, setDlg] = useState<{ open: boolean; item: FabOperationVariable | null }>({ open: false, item: null });
  const [delTarget, setDelTarget] = useState<FabOperationVariable | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabOperationVariable>>('fabErpOperationVariable', {
        filters: { operationId }, orderBy: [{ field: 'sortOrder', direction: 'asc' }], pagination: { limit: 200 },
      });
      const list = res.data ?? [];
      setRows(list);
      onVarsChanged(list.map((v) => v.varKey));
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationId]);

  useEffect(() => { load(); }, [load]);

  async function save(draft: VarDraft, id?: number) {
    const payload = {
      operation_id: operationId,
      var_key: draft.varKey.trim(),
      label: draft.label.trim(),
      unit: draft.unit.trim() || null,
      default_value: draft.defaultValue !== '' ? Number(draft.defaultValue) : null,
      sort_order: draft.sortOrder !== '' ? Number(draft.sortOrder) : rows.length,
    };
    if (id) await fabMutate('fabErpOperationVariable', 'update', { id, ...payload });
    else await fabMutate('fabErpOperationVariable', 'insert', payload);
    setDlg({ open: false, item: null });
    await load();
    toast('Variable saved');
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try {
      await fabMutate('fabErpOperationVariable', 'delete', { id: delTarget.id });
      setDelTarget(null); await load(); toast('Variable deleted');
    } catch (e) { setErr(errMsg(e)); setDelTarget(null); } finally { setDeleting(false); }
  }

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {canManage && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
          <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={() => setDlg({ open: true, item: null })}>Add variable</Button>
        </Box>
      )}
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No variables defined for this operation yet.</Typography>
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Var key</TableCell>
                <TableCell sx={th}>Label</TableCell>
                <TableCell sx={th}>Unit</TableCell>
                <TableCell sx={th}>Default</TableCell>
                <TableCell sx={{ ...th, width: 70 }}>Sort</TableCell>
                {canManage && <TableCell sx={{ ...th, width: 96 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={td}><Mono>op.{r.varKey}</Mono></TableCell>
                  <TableCell sx={td}>{r.label}</TableCell>
                  <TableCell sx={td}>{r.unit ?? '—'}</TableCell>
                  <TableCell sx={td}>{r.defaultValue ?? '—'}</TableCell>
                  <TableCell sx={td}>{r.sortOrder}</TableCell>
                  {canManage && (
                    <TableCell sx={td}>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => setDlg({ open: true, item: r })}><EditRounded fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(r)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
      <VariableDialog open={dlg.open} initial={dlg.item} nextSort={rows.length} onClose={() => setDlg({ open: false, item: null })} onSave={save} />
      <DeleteDialog open={!!delTarget} label={delTarget?.varKey ?? ''} busy={deleting} onClose={() => setDelTarget(null)} onConfirm={handleDelete} />
    </Box>
  );
}

// ── Resource Types tab ──────────────────────────────────────────────────────────

function ResourceTypesPanel({ operation, resourceTypes, canManage, onOperationSaved }: {
  operation: FabOperation; resourceTypes: FabResourceType[]; canManage: boolean; onOperationSaved: () => void;
}) {
  const { toast } = useToast();
  const [rows, setRows] = useState<FabOperationResourceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [addRtId, setAddRtId] = useState<number | ''>('');
  const [adding, setAdding] = useState(false);
  const [delTarget, setDelTarget] = useState<FabOperationResourceType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await fabQuery<QueryResult<FabOperationResourceType>>('fabErpOperationResourceType', {
        filters: { operationId: operation.id }, orderBy: [{ field: 'id', direction: 'asc' }], pagination: { limit: 200 },
      });
      setRows(res.data ?? []);
    } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operation.id]);

  useEffect(() => { load(); }, [load]);

  const mappedIds = new Set(rows.map((r) => r.resourceTypeId));
  const availableTypes = resourceTypes.filter((rt) => !mappedIds.has(rt.id));

  async function addMapping() {
    if (addRtId === '') return;
    setAdding(true); setErr('');
    try {
      await fabMutate('fabErpOperationResourceType', 'insert', { operation_id: operation.id, resource_type_id: addRtId });
      setAddRtId('');
      await load();
      toast('Resource type mapped');
    } catch (e) { setErr(errMsg(e)); } finally { setAdding(false); }
  }

  async function setDefault(resourceTypeId: number) {
    try {
      await fabMutate('fabErpOperation', 'update', { id: operation.id, default_resource_type_id: resourceTypeId });
      onOperationSaved();
      toast('Default resource type updated');
    } catch (e) { setErr(errMsg(e)); }
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try {
      await fabMutate('fabErpOperationResourceType', 'delete', { id: delTarget.id });
      // If the mapping being removed was the operation's default, clear the default.
      if (operation.defaultResourceTypeId === delTarget.resourceTypeId) {
        await fabMutate('fabErpOperation', 'update', { id: operation.id, default_resource_type_id: null });
        onOperationSaved();
      }
      setDelTarget(null); await load(); toast('Mapping removed');
    } catch (e) { setErr(errMsg(e)); setDelTarget(null); } finally { setDeleting(false); }
  }

  if (loading) return <ListSkeleton rows={3} />;

  return (
    <Box>
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {canManage && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1.5 }}>
          <Select size="small" displayEmpty value={addRtId} sx={{ minWidth: 260 }}
            onChange={(e) => setAddRtId(e.target.value === '' ? '' : Number(e.target.value))}>
            <MenuItem value="" disabled><em>Select a resource type to map…</em></MenuItem>
            {availableTypes.map((rt) => <MenuItem key={rt.id} value={rt.id}>{rt.code} — {rt.name}</MenuItem>)}
          </Select>
          <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={addRtId === '' || adding} onClick={addMapping}>
            {adding ? <CircularProgress size={14} /> : 'Add mapping'}
          </Button>
        </Box>
      )}
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No resource types mapped to this operation yet.</Typography>
      ) : (
        <Surface e={1} sx={{ overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ background: 'var(--c-surface-2)' }}>
                <TableCell sx={th}>Code</TableCell>
                <TableCell sx={th}>Resource type</TableCell>
                <TableCell sx={{ ...th, width: 100 }}>Default</TableCell>
                {canManage && <TableCell sx={{ ...th, width: 140 }}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const isDefault = operation.defaultResourceTypeId === r.resourceTypeId;
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={td}><Mono chip>{r.resourceTypeCode}</Mono></TableCell>
                    <TableCell sx={td}>{r.resourceTypeName}</TableCell>
                    <TableCell sx={td}>
                      {isDefault ? <StarRounded fontSize="small" sx={{ color: 'var(--c-warning-600, #b58900)' }} titleAccess="Default" /> : <StarBorderRounded fontSize="small" sx={{ color: 'var(--c-text-3)' }} />}
                    </TableCell>
                    {canManage && (
                      <TableCell sx={td}>
                        {!isDefault && (
                          <Tooltip title="Set as default"><IconButton size="small" onClick={() => setDefault(r.resourceTypeId)}><StarBorderRounded fontSize="small" /></IconButton></Tooltip>
                        )}
                        <Tooltip title="Remove mapping"><IconButton size="small" color="error" onClick={() => setDelTarget(r)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Surface>
      )}
      <DeleteDialog open={!!delTarget} label={delTarget ? `${delTarget.resourceTypeCode} — ${delTarget.resourceTypeName}` : ''} busy={deleting} onClose={() => setDelTarget(null)} onConfirm={handleDelete} />
    </Box>
  );
}

// ── Operation detail (tabs) ──────────────────────────────────────────────────────

function OperationDetail({ operation, resourceTypes, canManage, onSaved }: {
  operation: FabOperation; resourceTypes: FabResourceType[]; canManage: boolean; onSaved: () => void;
}) {
  const [subTab, setSubTab] = useState(0);
  const [variableKeys, setVariableKeys] = useState<string[]>([]);

  useEffect(() => { setSubTab(0); }, [operation.id]);

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ borderTop: '1px solid var(--c-divider)', pt: 2.5, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 600, color: 'var(--c-text)' }}>{operation.name}</Typography>
          <Mono chip>{operation.code}</Mono>
        </Box>
        <Box sx={{ borderBottom: '1px solid var(--c-divider)' }}>
          <Tabs value={subTab} onChange={(_, v) => setSubTab(v)}>
            <Tab label="Details" sx={{ minHeight: 40 }} />
            <Tab label="Variables" sx={{ minHeight: 40 }} />
            <Tab label="Resource Types" sx={{ minHeight: 40 }} />
          </Tabs>
        </Box>
      </Box>
      {subTab === 0 && (
        <DetailsPanel operation={operation} resourceTypes={resourceTypes} variableKeys={variableKeys} canManage={canManage} onSaved={onSaved} />
      )}
      {subTab === 1 && (
        <VariablesPanel operationId={operation.id} canManage={canManage} onVarsChanged={setVariableKeys} />
      )}
      {subTab === 2 && (
        <ResourceTypesPanel operation={operation} resourceTypes={resourceTypes} canManage={canManage} onOperationSaved={onSaved} />
      )}
    </Box>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Operations() {
  const canManage = usePermission('fab_erp_operations_manage');
  const { toast } = useToast();

  const [operations, setOperations] = useState<FabOperation[]>([]);
  const [resourceTypes, setResourceTypes] = useState<FabResourceType[]>([]);
  const [selected, setSelected] = useState<FabOperation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const [delTarget, setDelTarget] = useState<FabOperation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const importFileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportOperationsResult | null>(null);
  const [importErr, setImportErr] = useState('');

  const fetchAll = useCallback(async (): Promise<FabOperation[]> => {
    setLoading(true); setError('');
    try {
      const [opsRes, rtRes] = await Promise.all([
        fabQuery<QueryResult<FabOperation>>('fabErpOperation', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
        fabQuery<QueryResult<FabResourceType>>('fabErpResourceType', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
      ]);
      const list = opsRes.data ?? [];
      setOperations(list);
      setResourceTypes(rtRes.data ?? []);
      setSelected((prev) => (prev ? list.find((o) => o.id === prev.id) ?? null : null));
      return list;
    } catch (e) { setError(errMsg(e)); return []; } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function downloadOperationsTemplate() {
    setExporting(true);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const res = await api.get(`${API_HOST}/api/${companySlug}/fab_erp/operations/export-template`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'Operations_Import_Template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportOperationsFile(file: File) {
    setImporting(true); setImportErr(''); setImportResult(null);
    try {
      const companySlug = localStorage.getItem('companySlug');
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post<ImportOperationsResult>(
        `${API_HOST}/api/${companySlug}/fab_erp/operations/import`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setImportResult(res.data);
      await fetchAll();
    } catch (e) {
      setImportErr(errMsg(e));
    } finally {
      setImporting(false);
    }
  }

  async function createOperation() {
    // BUG-15: only the name is required — the code auto-generates (OP-####) like
    // every other entity (customers, orders, items). A manual code is optional.
    if (!newName.trim()) { setCreateErr('Name is required.'); return; }
    setCreateSaving(true); setCreateErr('');
    let code = newCode.trim().toUpperCase();
    if (!code) {
      try {
        const codeRes = await fabPost<{ code: string }>('codegen/next-code', { entityType: 'operation' });
        code = codeRes.code.toUpperCase();
      } catch {
        setCreateErr('Failed to generate an operation code. Enter one manually or try again.');
        setCreateSaving(false);
        return;
      }
    }
    try {
      const res = await fabMutate<{ ok: boolean; id: number }>('fabErpOperation', 'insert', {
        name: newName.trim(), code, default_resource_type_id: null,
        time_formula: null, time_unit: 'min', active: 1,
      });
      setNewName(''); setNewCode(''); setCreating(false);
      const list = await fetchAll();
      const found = list.find((o) => o.id === res.id);
      if (found) setSelected(found);
      toast('Operation created');
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 409) {
        // Duplicate name/code — re-resolve the existing row instead of failing silently.
        try {
          const existing = await fabQuery<QueryResult<FabOperation>>('fabErpOperation', {
            filters: { code }, pagination: { limit: 1 },
          });
          const match = existing.data?.[0];
          if (match) {
            await fetchAll();
            setSelected(match);
            setNewName(''); setNewCode(''); setCreating(false);
            toast('Operation with that code already existed — opened it', 'info');
            return;
          }
        } catch { /* fall through to showing the original error */ }
      }
      setCreateErr(errMsg(e));
    } finally { setCreateSaving(false); }
  }

  async function handleDelete() {
    if (!delTarget) return;
    setDeleting(true);
    try {
      await fabMutate('fabErpOperation', 'delete', { id: delTarget.id });
      if (selected?.id === delTarget.id) setSelected(null);
      setDelTarget(null); await fetchAll(); toast('Operation deleted');
    } catch (e) { setError(errMsg(e)); setDelTarget(null); } finally { setDeleting(false); }
  }

  const newBtn = canManage ? (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setCreateErr(''); setCreating(true); }}>New operation</Button>
  ) : null;

  const headerActions = canManage ? (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button
        variant="outlined" size="small" startIcon={exporting ? <CircularProgress size={14} color="inherit" /> : <DownloadIcon />}
        onClick={downloadOperationsTemplate} disabled={exporting}
      >
        Export template
      </Button>
      <Button
        variant="outlined" size="small" startIcon={importing ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
        onClick={() => importFileRef.current?.click()} disabled={importing}
      >
        Import
      </Button>
      <input
        ref={importFileRef} type="file" accept=".xlsx" hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImportOperationsFile(file);
          e.target.value = '';
        }}
      />
      {newBtn}
    </Box>
  ) : null;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <PageHeader title="Operations" subtitle="Manufacturing operations — time formula, default resource type, and formula variables used by routings" actions={headerActions} />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {importErr && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportErr('')}>{importErr}</Alert>}

      {creating && (
        <Surface e={1} sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {createErr && <Alert severity="error" sx={{ py: 0 }}>{createErr}</Alert>}
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text-2)' }}>New operation</Typography>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField label="Name" value={newName} size="small" sx={{ flex: 2 }} autoFocus onChange={(e) => setNewName(e.target.value)} />
            <TextField label="Code (optional)" placeholder="auto (OP-####)" value={newCode} size="small" sx={{ flex: 1 }} onChange={(e) => setNewCode(e.target.value)} />
          </Box>
          <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
            The default resource type and time formula are configured after creation, on the operation’s Details tab.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
            <Button size="small" onClick={() => { setCreating(false); setNewName(''); setNewCode(''); setCreateErr(''); }}>Cancel</Button>
            <Button size="small" variant="contained" onClick={createOperation} disabled={createSaving}>
              {createSaving ? <CircularProgress size={14} /> : 'Create'}
            </Button>
          </Box>
        </Surface>
      )}

      {loading ? <ListSkeleton rows={5} /> : (
        <>
          <Alert severity="info" icon={<InfoOutlinedIcon fontSize="small" />} sx={{ mb: 2 }}>
            Operations are the manufacturing steps used in routings (e.g. "Cut", "Weld", "Paint"). Create one with just a name, then set its default resource type, time formula, and variables on the operation’s Details tab. A flow step using an operation with no time formula produces a zero-duration task.
          </Alert>

          {operations.length === 0 ? (
            <EmptyState icon={<BuildCircleRounded />} title="No operations defined" hint='Click "New operation" to add one.' action={newBtn ?? undefined} />
          ) : (
            <>
              <EntityList
                rows={operations}
                sortableFields={OPERATION_SORT_FIELDS}
                defaultSortKey="name"
                renderRow={(op) => {
                  const isSelected = selected?.id === op.id;
                  return (
                    <EntityRow
                      key={op.id}
                      code={<Mono chip>{op.code}</Mono>}
                      primary={op.name}
                      secondary={op.defaultResourceTypeName ? `Default: ${op.defaultResourceTypeName}` : undefined}
                      trailing={(<>
                        <Mono chip>{op.timeUnit}</Mono>
                        {!op.active && <Mono chip>inactive</Mono>}
                      </>)}
                      onClick={() => setSelected(isSelected ? null : op)}
                      actions={canManage ? (
                        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDelTarget(op)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
                      ) : undefined}
                    />
                  );
                }}
              />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'var(--c-text-3)' }}>
                Click an operation to view/edit its details, variables, and resource-type mappings.
              </Typography>
            </>
          )}

          {selected && (
            <OperationDetail operation={selected} resourceTypes={resourceTypes} canManage={canManage} onSaved={fetchAll} />
          )}
        </>
      )}

      <DeleteDialog open={!!delTarget} label={delTarget ? `${delTarget.code} — ${delTarget.name}` : ''} busy={deleting} onClose={() => setDelTarget(null)} onConfirm={handleDelete} />

      <Dialog open={importResult !== null} onClose={() => setImportResult(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" fontSize="small" />
          Import Complete
        </DialogTitle>
        <DialogContent dividers>
          {importResult && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <StatusBadge status={`${importResult.operationsCreated} operation(s) created`} family="success" />
                <StatusBadge status={`${importResult.mappingsCreated} resource-type mapping(s) created`} family="success" />
                {importResult.operationsSkipped > 0 && <StatusBadge status={`${importResult.operationsSkipped} operation(s) skipped`} family="warning" />}
              </Box>
              {importResult.warnings.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Warnings</Typography>
                  <List dense disablePadding sx={{ maxHeight: 240, overflow: 'auto', bgcolor: 'background.default', borderRadius: 1 }}>
                    {importResult.warnings.map((w, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemText
                          primaryTypographyProps={{ variant: 'caption' }}
                          primary={`Row ${w.row}: ${w.message}`}
                        />
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
