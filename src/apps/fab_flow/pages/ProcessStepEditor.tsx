import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Checkbox, Chip,
  CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, IconButton, MenuItem, Select, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackIcon   from '@mui/icons-material/ArrowBack';
import AddIcon         from '@mui/icons-material/Add';
import DeleteIcon      from '@mui/icons-material/Delete';
import EditIcon        from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingIcon     from '@mui/icons-material/HourglassEmpty';
import api, { API_HOST } from '@core/utils/axiosConfig';

// ── types ──────────────────────────────────────────────────────────────────

interface PlanNode { id: number; nodeCode: string; displayName: string }

interface NodeMap {
  id:              number;
  nodeId:          number;
  nodeRole:        string;
  quantity?:       number;
  notes?:          string;
  nodeCode:        string;
  nodeDisplayName: string;
}

interface Precondition {
  id:                     number;
  requiredProcessStepId?: number;
  requiredNodeId?:        number;
  requiredCondition:      string;
  notes?:                 string;
  requiredStepCode?:      string;
  requiredStepName?:      string;
  requiredNodeCode?:      string;
}

interface ProcessStep {
  id:                        number;
  processStepCode:           string;
  processName:               string;
  processType:               string;
  sequenceNo:                number;
  parallelGroup:             string;
  machineOrWorkcentreType:   string;
  estimatedTimeValue:        number;
  estimatedTimeUnit:         string;
  mandatory:                 number;
  notes:                     string;
  requiresWorkArea:          boolean;
  preferredWorkAreaId:       number | null;
  preferredWorkAreaCode:     string | null;
  preferredWorkAreaName:     string | null;
  requiresMachine:           boolean;
  estimatedMachineTimeValue: number | null;
  estimatedMachineTimeUnit:  string;
  resourceNotes:             string;
  timeCalcMode?:             'manual' | 'metric';
  timeMetricKey?:            string | null;
  timeRateValue?:            number | null;
  timeRateUnit?:             string | null;
  allowedWorkAreas:          { workAreaCode: string; workAreaName: string; priority: number }[];
  missingWorkArea:           boolean;
  missingMachineType:        boolean;
  resourceComplete:          boolean;
  nodeMaps:                  NodeMap[];
  preconditions:             Precondition[];
  ready:                     boolean;
}

interface ProcessTypeReg {
  id:              number;
  processTypeName: string;
  metricKey:       string | null;
  rateValue:       number | null;
  rateUnit:        string | null;
}

interface WorkAreaOption { id: number; workAreaCode: string; workAreaName: string }

// ── form types ─────────────────────────────────────────────────────────────

interface NodeMappingForm { nodeId: number; nodeRole: string; quantity?: number; notes?: string }
interface PreconditionForm { requiredProcessStepId?: number; requiredNodeId?: number; requiredCondition: string; notes?: string }

interface StepForm {
  id?:                          number;
  process_step_code:            string;
  process_name:                 string;
  process_type:                 string;
  sequence_no:                  number;
  parallel_group:               string;
  machine_or_workcentre_type:   string;
  estimated_time_value:         string;
  estimated_time_unit:          string;
  mandatory:                    boolean;
  notes:                        string;
  requires_work_area:           boolean;
  preferred_work_area_id:       number | null;
  requires_machine:             boolean;
  estimated_machine_time_value: string;
  estimated_machine_time_unit:  string;
  resource_notes:               string;
  time_calc_mode:               'manual' | 'metric';
  time_metric_key:              string;
  time_rate_value:              string;
  time_rate_unit:               string;
  nodeMappings:                 NodeMappingForm[];
  preconditions:                PreconditionForm[];
  _existingNodeMapIds:          number[];
  _existingPrecondIds:          number[];
}

const EMPTY_FORM: StepForm = {
  process_step_code: '', process_name: '', process_type: '',
  sequence_no: 10, parallel_group: '', machine_or_workcentre_type: '',
  estimated_time_value: '', estimated_time_unit: 'min',
  mandatory: true, notes: '',
  requires_work_area: false, preferred_work_area_id: null,
  requires_machine: false, estimated_machine_time_value: '',
  estimated_machine_time_unit: 'hr', resource_notes: '',
  time_calc_mode: 'manual', time_metric_key: '', time_rate_value: '', time_rate_unit: '',
  nodeMappings: [], preconditions: [],
  _existingNodeMapIds: [], _existingPrecondIds: [],
};

const METRIC_KEY_OPTIONS = [
  'weld_length_mm','cut_length_mm','num_holes','num_studs',
  'paint_area_m2','blast_area_m2','bend_length_mm','grind_length_mm',
  'drill_count','bolt_count','area_m2','length_mm','mass_kg',
];

const NODE_ROLES   = ['Worked-On','Input','Output','Consumed','Reference'];
const CONDITIONS   = ['Complete','In Progress','Started'];
const ROLE_COLORS: Record<string, 'default'|'primary'|'success'|'error'|'warning'|'info'> = {
  'Worked-On': 'primary',
  'Input':     'info',
  'Output':    'success',
  'Consumed':  'warning',
  'Reference': 'default',
};

// ── component ──────────────────────────────────────────────────────────────

export default function ProcessStepEditor() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate             = useNavigate();

  const [planName, setPlanName]     = useState('');
  const [steps, setSteps]           = useState<ProcessStep[]>([]);
  const [allNodes, setAllNodes]     = useState<PlanNode[]>([]);
  const [allWorkAreas, setAllWAs]   = useState<WorkAreaOption[]>([]);
  const [processTypes, setPTypes]   = useState<ProcessTypeReg[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm]             = useState<StepForm>(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // inline "add node" state within dialog
  const [newNodeOption, setNewNodeOption]   = useState<PlanNode | null>(null);
  const [newNodeRole, setNewNodeRole]       = useState('Worked-On');
  // inline "add precond" state within dialog
  const [newPrecondStep, setNewPrecondStep] = useState<ProcessStep | null>(null);
  const [newPrecondCond, setNewPrecondCond] = useState('Complete');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [readinessRes, nodesRes, waRes, ptRes] = await Promise.all([
        api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/readiness`),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','nodeCode','displayName'],
          filters: { projectPlanId: Number(planId) },
          orderBy: [{ field: 'nodeCode', direction: 'asc' }],
          pagination: { limit: 2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_work_areas',
          fields: ['id','workAreaCode','workAreaName'],
          orderBy: [{ field: 'workAreaCode', direction: 'asc' }],
          pagination: { limit: 500 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_process_type_registry',
          fields: ['id','processTypeName','metricKey','rateValue','rateUnit'],
          orderBy: [{ field: 'processTypeName', direction: 'asc' }],
          pagination: { limit: 500 },
        }),
      ]);
      const rd = readinessRes.data?.data ?? readinessRes.data;
      setPlanName(rd?.planName ?? '');
      setSteps(rd?.steps ?? []);
      setAllNodes(nodesRes.data?.data ?? nodesRes.data ?? []);
      setAllWAs(waRes.data?.data ?? []);
      setPTypes(ptRes.data?.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [company, planId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── open dialog ──────────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM);
    setNewNodeOption(null);
    setNewPrecondStep(null);
    setDialogOpen(true);
  }

  function openEdit(step: ProcessStep) {
    setForm({
      id:                           step.id,
      process_step_code:            step.processStepCode ?? '',
      process_name:                 step.processName,
      process_type:                 step.processType ?? '',
      sequence_no:                  step.sequenceNo,
      parallel_group:               step.parallelGroup ?? '',
      machine_or_workcentre_type:   step.machineOrWorkcentreType ?? '',
      estimated_time_value:         String(step.estimatedTimeValue ?? ''),
      estimated_time_unit:          step.estimatedTimeUnit ?? 'min',
      mandatory:                    Boolean(step.mandatory),
      notes:                        step.notes ?? '',
      requires_work_area:           step.requiresWorkArea ?? false,
      preferred_work_area_id:       step.preferredWorkAreaId ?? null,
      requires_machine:             step.requiresMachine ?? false,
      estimated_machine_time_value: String(step.estimatedMachineTimeValue ?? ''),
      estimated_machine_time_unit:  step.estimatedMachineTimeUnit ?? 'hr',
      resource_notes:               step.resourceNotes ?? '',
      time_calc_mode:               (step.timeCalcMode === 'metric' ? 'metric' : 'manual'),
      time_metric_key:              step.timeMetricKey ?? '',
      time_rate_value:              step.timeRateValue != null ? String(step.timeRateValue) : '',
      time_rate_unit:               step.timeRateUnit ?? '',
      nodeMappings: step.nodeMaps.map((nm) => ({
        nodeId:   nm.nodeId,
        nodeRole: nm.nodeRole,
        quantity: nm.quantity ?? undefined,
        notes:    nm.notes ?? undefined,
      })),
      preconditions: step.preconditions.map((pc) => ({
        requiredProcessStepId: pc.requiredProcessStepId ?? undefined,
        requiredNodeId:        pc.requiredNodeId ?? undefined,
        requiredCondition:     pc.requiredCondition,
        notes:                 pc.notes ?? undefined,
      })),
      _existingNodeMapIds: step.nodeMaps.map((nm) => nm.id),
      _existingPrecondIds: step.preconditions.map((pc) => pc.id),
    });
    setNewNodeOption(null);
    setNewPrecondStep(null);
    setDialogOpen(true);
  }

  // ── save step ────────────────────────────────────────────────────────────

  async function saveStep() {
    if (!form.process_name.trim()) return;
    setSaving(true);
    try {
      let stepId = form.id;

      const stepData = {
        project_plan_id:              Number(planId),
        process_step_code:            form.process_step_code || null,
        process_name:                 form.process_name,
        process_type:                 form.process_type || null,
        sequence_no:                  form.sequence_no,
        parallel_group:               form.parallel_group || null,
        machine_or_workcentre_type:   form.machine_or_workcentre_type || null,
        estimated_time_value:         form.estimated_time_value ? Number(form.estimated_time_value) : null,
        estimated_time_unit:          form.estimated_time_unit,
        mandatory:                    form.mandatory ? 1 : 0,
        notes:                        form.notes || null,
        requires_work_area:           form.requires_work_area ? 1 : 0,
        preferred_work_area_id:       form.preferred_work_area_id || null,
        requires_machine:             form.requires_machine ? 1 : 0,
        estimated_machine_time_value: form.estimated_machine_time_value ? Number(form.estimated_machine_time_value) : null,
        estimated_machine_time_unit:  form.estimated_machine_time_unit,
        resource_notes:               form.resource_notes || null,
        time_calc_mode:               form.time_calc_mode,
        time_metric_key:              form.time_calc_mode === 'metric' ? (form.time_metric_key || null) : null,
        time_rate_value:              form.time_calc_mode === 'metric' && form.time_rate_value !== '' ? Number(form.time_rate_value) : null,
        time_rate_unit:               form.time_calc_mode === 'metric' ? (form.time_rate_unit || null) : null,
      };

      if (stepId) {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'update', resource: 'fab_process_steps',
          data: { id: stepId, ...stepData },
        });
        // Soft-delete old mappings and preconditions
        await Promise.all([
          ...form._existingNodeMapIds.map((id) =>
            api.post(`${API_HOST}/api/query/v1/base_resource`, {
              operation: 'delete', resource: 'fab_process_step_node_map', data: { id },
            }),
          ),
          ...form._existingPrecondIds.map((id) =>
            api.post(`${API_HOST}/api/query/v1/base_resource`, {
              operation: 'delete', resource: 'fab_process_preconditions', data: { id },
            }),
          ),
        ]);
      } else {
        const res = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'insert', resource: 'fab_process_steps', data: stepData,
        });
        stepId = res.data?.data?.insertId ?? res.data?.data?.id;
      }

      // Insert node mappings
      await Promise.all(
        form.nodeMappings.map((nm) =>
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'insert', resource: 'fab_process_step_node_map',
            data: {
              process_step_id: stepId,
              node_id:         nm.nodeId,
              node_role:       nm.nodeRole,
              quantity:        nm.quantity ?? null,
              notes:           nm.notes ?? null,
            },
          }),
        ),
      );

      // Insert preconditions
      await Promise.all(
        form.preconditions.map((pc) =>
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'insert', resource: 'fab_process_preconditions',
            data: {
              process_step_id:          stepId,
              required_process_step_id: pc.requiredProcessStepId ?? null,
              required_node_id:         pc.requiredNodeId ?? null,
              required_condition:       pc.requiredCondition,
              notes:                    pc.notes ?? null,
            },
          }),
        ),
      );

      setDialogOpen(false);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── delete step ──────────────────────────────────────────────────────────

  async function deleteStep(step: ProcessStep) {
    if (!window.confirm(`Delete step "${step.processName}"? This cannot be undone.`)) return;
    try {
      // Delete node maps and preconditions first, then the step
      await Promise.all([
        ...step.nodeMaps.map((nm) =>
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'delete', resource: 'fab_process_step_node_map', data: { id: nm.id },
          }),
        ),
        ...step.preconditions.map((pc) =>
          api.post(`${API_HOST}/api/query/v1/base_resource`, {
            operation: 'delete', resource: 'fab_process_preconditions', data: { id: pc.id },
          }),
        ),
      ]);
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'delete', resource: 'fab_process_steps', data: { id: step.id },
      });
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    }
  }

  // ── form helpers ─────────────────────────────────────────────────────────

  function addNodeMapping() {
    if (!newNodeOption) return;
    if (form.nodeMappings.some((nm) => nm.nodeId === newNodeOption.id && nm.nodeRole === newNodeRole)) return;
    setForm((f) => ({ ...f, nodeMappings: [...f.nodeMappings, { nodeId: newNodeOption.id, nodeRole: newNodeRole }] }));
    setNewNodeOption(null);
  }

  function removeNodeMapping(idx: number) {
    setForm((f) => ({ ...f, nodeMappings: f.nodeMappings.filter((_, i) => i !== idx) }));
  }

  function addPrecondition() {
    if (!newPrecondStep) return;
    setForm((f) => ({
      ...f,
      preconditions: [
        ...f.preconditions,
        {
          requiredProcessStepId: newPrecondStep.id,
          requiredCondition:     newPrecondCond,
        },
      ],
    }));
    setNewPrecondStep(null);
    setNewPrecondCond('Complete');
  }

  function removePrecondition(idx: number) {
    setForm((f) => ({ ...f, preconditions: f.preconditions.filter((_, i) => i !== idx) }));
  }

  // ── helpers for display ───────────────────────────────────────────────────

  function nodeLabel(nodeId: number) {
    const n = allNodes.find((nd) => nd.id === nodeId);
    return n ? `${n.nodeCode} — ${n.displayName}` : `#${nodeId}`;
  }

  function stepLabel(stepId: number) {
    const s = steps.find((st) => st.id === stepId);
    return s ? `${s.processStepCode || s.processName}` : `#${stepId}`;
  }

  const readyCount    = steps.filter((s) => s.ready).length;
  const pendingCount  = steps.length - readyCount;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}`)}>
          Back
        </Button>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>Process Steps — {planName}</Typography>
          {steps.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {readyCount} ready · {pendingCount} with preconditions
            </Typography>
          )}
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Step
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
      ) : steps.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <Typography color="text.secondary" gutterBottom>No process steps yet.</Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>Add First Step</Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {steps.map((step) => (
            <Card key={step.id} variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                {/* Step header row */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ width: 40, textAlign: 'center', pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">Seq</Typography>
                    <Typography fontWeight={700} color="primary.main">{step.sequenceNo}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body1" fontWeight={600}>{step.processName}</Typography>
                      {step.processStepCode && (
                        <Typography variant="caption" color="text.secondary">({step.processStepCode})</Typography>
                      )}
                      <Tooltip title={step.ready ? 'No preconditions — can start immediately' : 'Has preconditions'}>
                        <Chip
                          size="small"
                          icon={step.ready ? <CheckCircleIcon /> : <PendingIcon />}
                          label={step.ready ? 'Ready' : 'Has preconditions'}
                          color={step.ready ? 'success' : 'warning'}
                          variant="outlined"
                        />
                      </Tooltip>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {[step.processType, step.machineOrWorkcentreType,
                        step.estimatedTimeValue ? `${step.estimatedTimeValue} ${step.estimatedTimeUnit}` : null,
                        step.parallelGroup ? `Group ${step.parallelGroup}` : null,
                        !step.mandatory ? 'Optional' : null,
                        step.preferredWorkAreaCode ?? null,
                        step.estimatedMachineTimeValue ? `Machine: ${step.estimatedMachineTimeValue} ${step.estimatedMachineTimeUnit}` : null,
                      ].filter(Boolean).join(' · ')}
                    </Typography>
                    {(!step.resourceComplete) && (
                      <Typography variant="caption" color="warning.main">
                        {[step.missingWorkArea ? '⚠ Missing work area' : null, step.missingMachineType ? '⚠ Missing machine type' : null].filter(Boolean).join(' · ')}
                      </Typography>
                    )}
                  </Box>
                  <IconButton size="small" onClick={() => openEdit(step)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => deleteStep(step)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>

                {/* Node mappings */}
                {step.nodeMaps.length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap', pl: 6 }}>
                    {step.nodeMaps.map((nm) => (
                      <Chip
                        key={nm.id}
                        size="small"
                        label={`${nm.nodeRole}: ${nm.nodeCode}`}
                        color={ROLE_COLORS[nm.nodeRole] ?? 'default'}
                        variant="outlined"
                      />
                    ))}
                  </Box>
                )}

                {/* Preconditions */}
                {step.preconditions.length > 0 && (
                  <Box sx={{ mt: 0.5, pl: 6 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Requires:</Typography>
                    {step.preconditions.map((pc) => (
                      <Chip
                        key={pc.id}
                        size="small"
                        sx={{ mr: 0.5, mt: 0.3 }}
                        label={`${pc.requiredStepCode ?? pc.requiredStepName ?? `Step #${pc.requiredProcessStepId}`} ${pc.requiredNodeCode ? `on ${pc.requiredNodeCode}` : ''} — ${pc.requiredCondition}`}
                        variant="outlined"
                        color="warning"
                      />
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* ── Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.id ? 'Edit Process Step' : 'New Process Step'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Step details */}
          <Stack direction="row" spacing={1}>
            <TextField label="Seq No" type="number" size="small" sx={{ width: 90 }}
              value={form.sequence_no}
              onChange={(e) => setForm((f) => ({ ...f, sequence_no: Number(e.target.value) }))} />
            <TextField label="Step Code" size="small" sx={{ flex: 1 }}
              value={form.process_step_code}
              onChange={(e) => setForm((f) => ({ ...f, process_step_code: e.target.value }))} />
            <TextField label="Parallel Group" size="small" sx={{ width: 130 }} placeholder="e.g. P1"
              value={form.parallel_group}
              onChange={(e) => setForm((f) => ({ ...f, parallel_group: e.target.value }))} />
          </Stack>

          <TextField label="Process Name *" size="small" required
            value={form.process_name}
            onChange={(e) => setForm((f) => ({ ...f, process_name: e.target.value }))} />

          <Autocomplete freeSolo size="small"
            options={processTypes.map((p) => p.processTypeName)}
            value={form.process_type}
            onInputChange={(_, v) => {
              const reg = processTypes.find((p) => p.processTypeName === v);
              setForm((f) => ({
                ...f,
                process_type: v,
                // Auto-fill metric defaults from registry on type select (only if metric mode + fields blank)
                time_metric_key: (f.time_calc_mode === 'metric' && !f.time_metric_key && reg?.metricKey) ? reg.metricKey : f.time_metric_key,
                time_rate_value: (f.time_calc_mode === 'metric' && !f.time_rate_value && reg?.rateValue != null) ? String(reg.rateValue) : f.time_rate_value,
                time_rate_unit:  (f.time_calc_mode === 'metric' && !f.time_rate_unit  && reg?.rateUnit) ? reg.rateUnit : f.time_rate_unit,
              }));
            }}
            renderInput={(p) => <TextField {...p} label="Process Type" />} />

          <Stack direction="row" spacing={1} alignItems="center">
            <Select size="small" value={form.time_calc_mode} sx={{ width: 130 }}
              onChange={(e) => {
                const mode = e.target.value as 'manual' | 'metric';
                const reg = processTypes.find((p) => p.processTypeName === form.process_type);
                setForm((f) => ({
                  ...f,
                  time_calc_mode: mode,
                  // When switching to metric, pre-fill from registry if available and fields are blank
                  time_metric_key: mode === 'metric' && !f.time_metric_key && reg?.metricKey ? reg.metricKey : f.time_metric_key,
                  time_rate_value: mode === 'metric' && !f.time_rate_value && reg?.rateValue != null ? String(reg.rateValue) : f.time_rate_value,
                  time_rate_unit:  mode === 'metric' && !f.time_rate_unit  && reg?.rateUnit ? reg.rateUnit : f.time_rate_unit,
                }));
              }}>
              <MenuItem value="manual">Manual time</MenuItem>
              <MenuItem value="metric">Metric × rate</MenuItem>
            </Select>
            <FormControlLabel
              control={<Checkbox checked={form.mandatory}
                onChange={(e) => setForm((f) => ({ ...f, mandatory: e.target.checked }))} />}
              label="Mandatory" />
          </Stack>

          {form.time_calc_mode === 'manual' ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField label="Est. Time" type="number" size="small" sx={{ flex: 1 }}
                value={form.estimated_time_value}
                onChange={(e) => setForm((f) => ({ ...f, estimated_time_value: e.target.value }))} />
              <Select size="small" value={form.estimated_time_unit} sx={{ width: 90 }}
                onChange={(e) => setForm((f) => ({ ...f, estimated_time_unit: e.target.value }))}>
                <MenuItem value="min">min</MenuItem>
                <MenuItem value="hr">hr</MenuItem>
              </Select>
            </Stack>
          ) : (
            <Box sx={{ p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Duration = node metric value × rate (per Worked-On node)
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Autocomplete freeSolo size="small" sx={{ flex: 1 }}
                  options={METRIC_KEY_OPTIONS}
                  value={form.time_metric_key}
                  onInputChange={(_, v) => setForm((f) => ({ ...f, time_metric_key: v }))}
                  renderInput={(p) => <TextField {...p} label="Metric Key" placeholder="e.g. weld_length_mm" />} />
                <TextField label="Rate (hr/unit)" type="number" size="small" sx={{ width: 140 }}
                  value={form.time_rate_value}
                  onChange={(e) => setForm((f) => ({ ...f, time_rate_value: e.target.value }))}
                  inputProps={{ step: 0.0001 }} />
                <TextField label="Rate Unit" size="small" sx={{ width: 100 }}
                  value={form.time_rate_unit}
                  onChange={(e) => setForm((f) => ({ ...f, time_rate_unit: e.target.value }))} />
              </Stack>
            </Box>
          )}

          <TextField label="Notes" size="small" multiline rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />

          <Divider />

          {/* Resource / capacity fields */}
          <Typography variant="subtitle2" color="primary">Resource Requirements</Typography>

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <FormControlLabel
              control={<Checkbox checked={form.requires_work_area}
                onChange={(e) => setForm((f) => ({ ...f, requires_work_area: e.target.checked }))} />}
              label="Requires Work Area" />
            <FormControlLabel
              control={<Checkbox checked={form.requires_machine}
                onChange={(e) => setForm((f) => ({ ...f, requires_machine: e.target.checked }))} />}
              label="Requires Machine" />
          </Stack>

          <Stack direction="row" spacing={1}>
            <Autocomplete
              size="small"
              sx={{ flex: 2 }}
              options={allWorkAreas}
              value={allWorkAreas.find((wa) => wa.id === form.preferred_work_area_id) ?? null}
              onChange={(_, v) => setForm((f) => ({ ...f, preferred_work_area_id: v?.id ?? null }))}
              getOptionLabel={(o) => `${o.workAreaCode} — ${o.workAreaName}`}
              renderInput={(params) => <TextField {...params} label="Preferred Work Area" />}
            />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField label="Machine Time" type="number" size="small" sx={{ flex: 1 }}
              value={form.estimated_machine_time_value}
              onChange={(e) => setForm((f) => ({ ...f, estimated_machine_time_value: e.target.value }))} />
            <Select size="small" value={form.estimated_machine_time_unit} sx={{ width: 90 }}
              onChange={(e) => setForm((f) => ({ ...f, estimated_machine_time_unit: e.target.value }))}>
              <MenuItem value="min">min</MenuItem>
              <MenuItem value="hr">hr</MenuItem>
              <MenuItem value="shift">shift</MenuItem>
            </Select>
            <TextField label="Machine / Work Centre Type" size="small" sx={{ flex: 2 }}
              value={form.machine_or_workcentre_type}
              onChange={(e) => setForm((f) => ({ ...f, machine_or_workcentre_type: e.target.value }))} />
          </Stack>

          <TextField label="Resource Notes" size="small" multiline rows={1}
            value={form.resource_notes}
            onChange={(e) => setForm((f) => ({ ...f, resource_notes: e.target.value }))} />

          <Divider />

          {/* Node mappings */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Participating Nodes</Typography>
            {form.nodeMappings.length > 0 && (
              <Stack spacing={0.5} sx={{ mb: 1 }}>
                {form.nodeMappings.map((nm, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip size="small" label={nm.nodeRole} color={ROLE_COLORS[nm.nodeRole] ?? 'default'} />
                    <Typography variant="body2" sx={{ flex: 1 }}>{nodeLabel(nm.nodeId)}</Typography>
                    <IconButton size="small" onClick={() => removeNodeMapping(idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1} alignItems="center">
              <Autocomplete
                size="small"
                sx={{ flex: 1 }}
                options={allNodes}
                value={newNodeOption}
                onChange={(_, v) => setNewNodeOption(v)}
                getOptionLabel={(o) => `${o.nodeCode} — ${o.displayName}`}
                renderInput={(params) => <TextField {...params} label="Select node" />}
              />
              <Select size="small" value={newNodeRole} sx={{ width: 130 }}
                onChange={(e) => setNewNodeRole(e.target.value)}>
                {NODE_ROLES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </Select>
              <Button size="small" variant="outlined" onClick={addNodeMapping} disabled={!newNodeOption}>
                Add
              </Button>
            </Stack>
          </Box>

          <Divider />

          {/* Preconditions */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Preconditions</Typography>
            {form.preconditions.length > 0 && (
              <Stack spacing={0.5} sx={{ mb: 1 }}>
                {form.preconditions.map((pc, idx) => (
                  <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {stepLabel(pc.requiredProcessStepId!)} must be <strong>{pc.requiredCondition}</strong>
                    </Typography>
                    <IconButton size="small" onClick={() => removePrecondition(idx)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1} alignItems="center">
              <Autocomplete
                size="small"
                sx={{ flex: 1 }}
                options={steps.filter((s) => s.id !== form.id)}
                value={newPrecondStep}
                onChange={(_, v) => setNewPrecondStep(v)}
                getOptionLabel={(s) => s.processStepCode ? `${s.processStepCode} — ${s.processName}` : s.processName}
                renderInput={(params) => <TextField {...params} label="Required step" />}
              />
              <Select size="small" value={newPrecondCond} sx={{ width: 130 }}
                onChange={(e) => setNewPrecondCond(e.target.value)}>
                {CONDITIONS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
              <Button size="small" variant="outlined" onClick={addPrecondition} disabled={!newPrecondStep}>
                Add
              </Button>
            </Stack>
          </Box>

        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveStep} disabled={saving || !form.process_name.trim()}>
            {saving ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
