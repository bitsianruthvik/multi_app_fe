/**
 * VersionedTemplateManager — shared component for Process Templates and Routing Templates.
 *
 * Both pages are structurally identical:
 *   - Master table (name, code, version_no, is_current_version, approval_status)
 *   - Add / Edit / Delete template (permission-gated)
 *   - "New Version" button per row (calls POST /api/:company/fab_erp/version/new)
 *   - Click a row → steps editor panel (seq_no, name, resource_type_id, formula_id)
 *   - Steps: add / edit / delete (permission-gated)
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon         from '@mui/icons-material/Add';
import DeleteIcon      from '@mui/icons-material/Delete';
import EditIcon        from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { fabQuery, fabMutate } from '../api/client';
import api, { API_HOST }       from '@core/utils/axiosConfig';
import { usePermission }       from '@core/hooks/usePermission';
import type {
  FabProcessTemplate,
  FabProcessTemplateStep,
  FabResourceType,
} from '../types';

// ── Legacy stubs for removed types (this component is no longer used) ─────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabRoutingTemplate    = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabRoutingTemplateStep = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabFormula            = any;

// ── Types ─────────────────────────────────────────────────────────────────────

type Template    = FabProcessTemplate | FabRoutingTemplate;
type TemplateStep = FabProcessTemplateStep | FabRoutingTemplateStep;

export type TemplateKind = 'process' | 'routing';

interface Config {
  kind:              TemplateKind;
  /** e.g. 'fabErpProcessTemplate' */
  templateAlias:     string;
  /** e.g. 'fabErpProcessTemplateStep' */
  stepAlias:         string;
  /** snake_case resource name for fabMutate */
  templateResource:  string;
  stepResource:      string;
  /** FK column name in step payload (snake_case) */
  stepFkCol:         string;
  /** camelCase FK field on step rows returned from API */
  stepFkField:       string;
  /** entity string for POST /version/new */
  versionEntity:     string;
  pageTitle:         string;
  pageSubtitle:      string;
}

// ── Approval Status Chip ──────────────────────────────────────────────────────

function ApprovalChip({ status }: { status: string }) {
  const map: Record<string, { label: string; color: 'default' | 'warning' | 'success' }> = {
    draft:    { label: 'Draft',    color: 'default'  },
    pending:  { label: 'Pending',  color: 'warning'  },
    approved: { label: 'Approved', color: 'success'  },
  };
  const { label, color } = map[status] ?? { label: status, color: 'default' };
  return <Chip label={label} color={color} size="small" />;
}

// ── Template Dialog ───────────────────────────────────────────────────────────

interface TplDraft {
  name:             string;
  code:             string;
  plant_id:         number | '';
  approval_status:  'draft' | 'pending' | 'approved';
}

const BLANK_TPL = (): TplDraft => ({
  name:            '',
  code:            '',
  plant_id:        '',
  approval_status: 'draft',
});

interface TemplateDialogProps {
  open:     boolean;
  initial:  Template | null;
  resource: string;
  onClose:  () => void;
  onSaved:  () => void;
}

function TemplateDialog({ open, initial, resource, onClose, onSaved }: TemplateDialogProps) {
  const [draft,  setDraft]  = useState<TplDraft>(BLANK_TPL());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        name:            initial.name,
        code:            initial.code,
        plant_id:        initial.plantId ?? '',
        approval_status: initial.approvalStatus,
      });
    } else {
      setDraft(BLANK_TPL());
    }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof TplDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        name:            draft.name,
        code:            draft.code,
        plant_id:        draft.plant_id === '' ? null : draft.plant_id,
        approval_status: draft.approval_status,
      };
      if (isNew) {
        await fabMutate(resource, 'insert', payload);
      } else {
        await fabMutate(resource, 'update', { id: initial!.id, ...payload });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Template' : `Edit — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              label="Name" value={draft.name} size="small" fullWidth required
              onChange={(e) => set('name', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Code" value={draft.code} size="small" fullWidth required
              onChange={(e) => set('code', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select label="Approval Status"
              value={draft.approval_status} size="small" fullWidth
              onChange={(e) => set('approval_status', e.target.value)}
            >
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" onClick={save}
          disabled={saving || !draft.name || !draft.code}
        >
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Delete Confirm Dialog ─────────────────────────────────────────────────────

function DeleteDialog({ open, label, onClose, onConfirm }: {
  open: boolean; label: string; onClose: () => void; onConfirm: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handle() {
    setBusy(true);
    try { await onConfirm(); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogContent>
        <Typography>Delete <strong>{label}</strong>? This cannot be undone.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" onClick={handle} disabled={busy}>
          {busy ? <CircularProgress size={16} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Step Dialog ───────────────────────────────────────────────────────────────

interface StepDraft {
  seq_no:           number | '';
  name:             string;
  resource_type_id: number | '';
  formula_id:       number | '';
}

const BLANK_STEP = (): StepDraft => ({
  seq_no:           '',
  name:             '',
  resource_type_id: '',
  formula_id:       '',
});

interface StepDialogProps {
  open:          boolean;
  initial:       TemplateStep | null;
  templateId:    number;
  stepResource:  string;
  stepFkCol:     string;
  resourceTypes: FabResourceType[];
  formulas:      FabFormula[];
  onClose:       () => void;
  onSaved:       () => void;
}

function StepDialog({
  open, initial, templateId, stepResource, stepFkCol,
  resourceTypes, formulas, onClose, onSaved,
}: StepDialogProps) {
  const [draft,  setDraft]  = useState<StepDraft>(BLANK_STEP());
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const isNew = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft({
        seq_no:           initial.seqNo,
        name:             initial.name,
        resource_type_id: initial.resourceTypeId ?? '',
        formula_id:       initial.formulaId       ?? '',
      });
    } else {
      setDraft(BLANK_STEP());
    }
    setErr('');
  }, [open, initial]);

  const set = (k: keyof StepDraft, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      const payload: Record<string, unknown> = {
        [stepFkCol]:       templateId,
        seq_no:            draft.seq_no === '' ? null : Number(draft.seq_no),
        name:              draft.name,
        resource_type_id:  draft.resource_type_id === '' ? null : draft.resource_type_id,
        formula_id:        draft.formula_id        === '' ? null : draft.formula_id,
      };
      if (isNew) {
        await fabMutate(stepResource, 'insert', payload);
      } else {
        await fabMutate(stepResource, 'update', { id: initial!.id, ...payload });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isNew ? 'New Step' : `Edit Step — ${initial?.name}`}</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {err && <Alert severity="error">{err}</Alert>}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              label="Seq No" type="number" value={draft.seq_no}
              size="small" fullWidth required inputProps={{ min: 1 }}
              onChange={(e) => set('seq_no', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 9 }}>
            <TextField
              label="Step Name" value={draft.name}
              size="small" fullWidth required
              onChange={(e) => set('name', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select label="Resource Type"
              value={draft.resource_type_id} size="small" fullWidth
              onChange={(e) => set('resource_type_id', e.target.value ? Number(e.target.value) : '')}
            >
              <MenuItem value="">— None —</MenuItem>
              {resourceTypes.map((rt) => (
                <MenuItem key={rt.id} value={rt.id}>{rt.name} ({rt.code})</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select label="Formula"
              value={draft.formula_id} size="small" fullWidth
              onChange={(e) => set('formula_id', e.target.value ? Number(e.target.value) : '')}
            >
              <MenuItem value="">— None —</MenuItem>
              {formulas.map((f) => (
                <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
        <Typography variant="caption" color="text.secondary">
          Note: only steps whose chosen formula's formula set is approved will be consumable
          downstream; the backend gates this. The template's own approval status is shown in the
          master list.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained" onClick={save}
          disabled={saving || !draft.name || draft.seq_no === ''}
        >
          {saving ? <CircularProgress size={16} /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Steps Panel ───────────────────────────────────────────────────────────────

interface StepsPanelProps {
  template:      Template;
  config:        Config;
  resourceTypes: FabResourceType[];
  formulas:      FabFormula[];
  canManage:     boolean;
}

function StepsPanel({ template, config, resourceTypes, formulas, canManage }: StepsPanelProps) {
  const [steps,   setSteps]   = useState<TemplateStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState('');

  const [stepDlg,   setStepDlg]   = useState<{ open: boolean; item: TemplateStep | null }>({ open: false, item: null });
  const [delStepDlg, setDelStepDlg] = useState<{ open: boolean; item: TemplateStep | null }>({ open: false, item: null });

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res: any = await fabQuery(config.stepAlias, {
        filters:  { [config.stepFkField]: template.id },
        orderBy:  [{ field: 'seqNo', direction: 'asc' }],
        pagination: { limit: 200 },
      });
      setSteps(res.data ?? []);
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [template.id, config]);

  useEffect(() => { load(); }, [load]);

  async function deleteStep() {
    if (!delStepDlg.item) return;
    await fabMutate(config.stepResource, 'delete', { id: delStepDlg.item.id });
    setDelStepDlg({ open: false, item: null });
    load();
  }

  const formulaMap = Object.fromEntries(formulas.map((f) => [f.id, f.name]));
  const rtMap      = Object.fromEntries(resourceTypes.map((rt) => [rt.id, `${rt.name} (${rt.code})`]));

  return (
    <Box sx={{ mt: 1 }}>
      {err && <Alert severity="error" sx={{ mb: 1 }}>{err}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" color="text.secondary">
          Steps — {template.name} (v{template.versionNo})
        </Typography>
        {canManage && (
          <Button size="small" startIcon={<AddIcon />} variant="outlined"
            onClick={() => setStepDlg({ open: true, item: null })}>
            Add Step
          </Button>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
      ) : steps.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No steps defined for this template version.
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 60 }}>#</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Step Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Resource Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Formula</TableCell>
              {canManage && <TableCell sx={{ width: 80 }} />}
            </TableRow>
          </TableHead>
          <TableBody>
            {steps.map((step) => (
              <TableRow key={step.id} hover>
                <TableCell>{step.seqNo}</TableCell>
                <TableCell>{step.name}</TableCell>
                <TableCell>{step.resourceTypeId ? (rtMap[step.resourceTypeId] ?? step.resourceTypeId) : '—'}</TableCell>
                <TableCell>{step.formulaId ? (formulaMap[step.formulaId] ?? step.formulaId) : '—'}</TableCell>
                {canManage && (
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Edit Step">
                        <IconButton size="small" onClick={() => setStepDlg({ open: true, item: step })}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete Step">
                        <IconButton size="small" color="error"
                          onClick={() => setDelStepDlg({ open: true, item: step })}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <StepDialog
        open={stepDlg.open}
        initial={stepDlg.item}
        templateId={template.id}
        stepResource={config.stepResource}
        stepFkCol={config.stepFkCol}
        resourceTypes={resourceTypes}
        formulas={formulas}
        onClose={() => setStepDlg({ open: false, item: null })}
        onSaved={() => { setStepDlg({ open: false, item: null }); load(); }}
      />

      <DeleteDialog
        open={delStepDlg.open}
        label={delStepDlg.item?.name ?? ''}
        onClose={() => setDelStepDlg({ open: false, item: null })}
        onConfirm={deleteStep}
      />
    </Box>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function VersionedTemplateManager({ config }: { config: Config }) {
  const { company } = useParams<{ company: string }>();
  const canManage   = usePermission('fab_erp_templates_manage');

  const [templates,     setTemplates]     = useState<Template[]>([]);
  const [resourceTypes, setResourceTypes] = useState<FabResourceType[]>([]);
  const [formulas,      setFormulas]      = useState<FabFormula[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState('');
  const [selectedId,    setSelectedId]    = useState<number | null>(null);

  // template dialog
  const [tplDlg,  setTplDlg]  = useState<{ open: boolean; item: Template | null }>({ open: false, item: null });
  const [delDlg,  setDelDlg]  = useState<{ open: boolean; item: Template | null }>({ open: false, item: null });
  const [versioning, setVersioning] = useState<number | null>(null); // id of row being versioned

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [tplRes, rtRes, fRes]: any[] = await Promise.all([
        fabQuery(config.templateAlias, {
          orderBy:    [{ field: 'name', direction: 'asc' }, { field: 'versionNo', direction: 'desc' }],
          pagination: { limit: 500 },
        }),
        fabQuery('fabErpResourceType', {
          orderBy:    [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 500 },
        }),
        fabQuery('fabErpFormula', {
          orderBy:    [{ field: 'name', direction: 'asc' }],
          pagination: { limit: 500 },
        }),
      ]);
      setTemplates(tplRes.data   ?? []);
      setResourceTypes(rtRes.data ?? []);
      setFormulas(fRes.data       ?? []);
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [config.templateAlias]);

  useEffect(() => { load(); }, [load]);

  async function deleteTemplate() {
    if (!delDlg.item) return;
    await fabMutate(config.templateResource, 'delete', { id: delDlg.item.id });
    setDelDlg({ open: false, item: null });
    if (selectedId === delDlg.item.id) setSelectedId(null);
    load();
  }

  async function newVersion(tpl: Template) {
    if (!company) return;
    setVersioning(tpl.id);
    try {
      await api.post(`${API_HOST}/api/${company}/fab_erp/version/new`, {
        entity:   config.versionEntity,
        sourceId: tpl.id,
      });
      load();
    } catch (e: any) {
      setErr(e.response?.data?.error ?? e.message);
    } finally {
      setVersioning(null);
    }
  }

  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <Box sx={{ p: 3, maxWidth: 1300, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{config.pageTitle}</Typography>
          <Typography variant="body2" color="text.secondary">{config.pageSubtitle}</Typography>
        </Box>
        {canManage && (
          <Button
            variant="contained" startIcon={<AddIcon />}
            onClick={() => setTplDlg({ open: true, item: null })}
          >
            New Template
          </Button>
        )}
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <Grid container spacing={2}>
          {/* ── Master Table ─────────────────────────────────────────────── */}
          <Grid size={{ xs: 12, md: selectedTemplate ? 7 : 12 }}>
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 60, textAlign: 'center' }}>Ver</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 80, textAlign: 'center' }}>Current</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 110 }}>Status</TableCell>
                    {canManage && <TableCell sx={{ width: 150 }} />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 6 : 5} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                        No templates defined yet.
                      </TableCell>
                    </TableRow>
                  ) : templates.map((tpl) => (
                    <TableRow
                      key={tpl.id}
                      hover
                      selected={selectedId === tpl.id}
                      sx={{ cursor: 'pointer' }}
                      onClick={() => setSelectedId(selectedId === tpl.id ? null : tpl.id)}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>{tpl.name}</TableCell>
                      <TableCell>
                        <Chip label={tpl.code} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>{tpl.versionNo}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        {tpl.isCurrentVersion ? (
                          <Chip label="Yes" size="small" color="primary" />
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <ApprovalChip status={tpl.approvalStatus} />
                      </TableCell>
                      {canManage && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Edit">
                              <IconButton size="small"
                                onClick={() => setTplDlg({ open: true, item: tpl })}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="New Version">
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={() => newVersion(tpl)}
                                  disabled={versioning === tpl.id}
                                >
                                  {versioning === tpl.id
                                    ? <CircularProgress size={14} />
                                    : <ContentCopyIcon fontSize="small" />}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" color="error"
                                onClick={() => setDelDlg({ open: true, item: tpl })}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* ── Steps Panel ──────────────────────────────────────────────── */}
          {selectedTemplate && (
            <Grid size={{ xs: 12, md: 5 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <StepsPanel
                  template={selectedTemplate}
                  config={config}
                  resourceTypes={resourceTypes}
                  formulas={formulas}
                  canManage={canManage}
                />
              </Paper>
            </Grid>
          )}
        </Grid>
      )}

      {/* Template add/edit dialog */}
      <TemplateDialog
        open={tplDlg.open}
        initial={tplDlg.item}
        resource={config.templateResource}
        onClose={() => setTplDlg({ open: false, item: null })}
        onSaved={() => { setTplDlg({ open: false, item: null }); load(); }}
      />

      {/* Template delete dialog */}
      <DeleteDialog
        open={delDlg.open}
        label={delDlg.item ? `${delDlg.item.name} v${delDlg.item.versionNo}` : ''}
        onClose={() => setDelDlg({ open: false, item: null })}
        onConfirm={deleteTemplate}
      />
    </Box>
  );
}
