import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon       from '@mui/icons-material/Add';
import DeleteIcon    from '@mui/icons-material/Delete';
import api, { API_HOST } from '@core/utils/axiosConfig';
import ProcessRouteVisualizer, { type ProcessStep } from '../components/ProcessRouteVisualizer';

const EMPTY_STEP = {
  process_step_code: '', sequence_no: 10, parallel_group: '', process_name: '',
  process_type: '', machine_or_workcentre_type: '', estimated_time_value: '',
  estimated_time_unit: 'min', mandatory: true, drawing_ref: '', detail_ref: '', notes: '',
};

export default function ProcessRouteEditor() {
  const { company, planId, nodeId } = useParams<{ company: string; planId: string; nodeId: string }>();
  const navigate                    = useNavigate();

  const [steps, setSteps]       = useState<ProcessStep[]>([]);
  const [nodeName, setNodeName] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dialog, setDialog]     = useState(false);
  const [editStep, setEditStep] = useState<any>(EMPTY_STEP);
  const [saving, setSaving]     = useState(false);

  const fetchSteps = useCallback(async () => {
    setLoading(true);
    try {
      const [nodeRes, routeRes] = await Promise.all([
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','nodeCode','displayName'],
          filters: { id: Number(nodeId) },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_node_process_routes',
          fields: ['id','processStepCode','sequenceNo','parallelGroup','processName','processType',
                   'machineOrWorkcentreType','estimatedTimeValue','estimatedTimeUnit','mandatory',
                   'drawingRef','drawingSheetNo','detailRef','notes'],
          filters: { nodeId: Number(nodeId) },
          orderBy: [{ field: 'sequenceNo', direction: 'asc' }],
          pagination: { limit: 200 },
        }),
      ]);
      const n = (nodeRes.data?.data ?? nodeRes.data)?.[0];
      setNodeName(n ? `${n.nodeCode} — ${n.displayName}` : '');
      setSteps(routeRes.data?.data ?? routeRes.data ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  async function saveStep() {
    setSaving(true);
    try {
      const data = {
        ...editStep,
        node_id:         Number(nodeId),
        project_plan_id: Number(planId),
        estimated_time_value: editStep.estimated_time_value ? Number(editStep.estimated_time_value) : null,
        mandatory: editStep.mandatory ? 1 : 0,
      };
      if (editStep.id) {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'update', resource: 'fab_node_process_routes',
          filters: { id: editStep.id }, data,
        });
      } else {
        await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'insert', resource: 'fab_node_process_routes', data,
        });
      }
      setDialog(false);
      setEditStep(EMPTY_STEP);
      fetchSteps();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteStep(id: number) {
    if (!window.confirm('Delete this process step?')) return;
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'update', resource: 'fab_node_process_routes',
        filters: { id }, data: { deleted_at: new Date().toISOString() },
      });
      fetchSteps();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    }
  }

  function openEdit(step?: any) {
    setEditStep(step ? {
      ...step,
      process_step_code:          step.processStepCode ?? '',
      sequence_no:                step.sequenceNo,
      parallel_group:             step.parallelGroup ?? '',
      process_name:               step.processName,
      process_type:               step.processType ?? '',
      machine_or_workcentre_type: step.machineOrWorkcentreType ?? '',
      estimated_time_value:       step.estimatedTimeValue ?? '',
      estimated_time_unit:        step.estimatedTimeUnit ?? 'min',
      mandatory:                  Boolean(step.mandatory),
      drawing_ref:                step.drawingRef ?? '',
      detail_ref:                 step.detailRef  ?? '',
      notes:                      step.notes      ?? '',
    } : EMPTY_STEP);
    setDialog(true);
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/${nodeId}`)}>
          Back
        </Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Process Route — {nodeName}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openEdit()}>Add Step</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
      ) : (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>Visual Route</Typography>
              <ProcessRouteVisualizer steps={steps} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>All Steps</Typography>
              {steps.length === 0 ? (
                <Typography color="text.secondary">No steps yet — click Add Step.</Typography>
              ) : (
                <Stack spacing={1}>
                  {steps.map((step) => (
                    <Box
                      key={step.id}
                      sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                    >
                      <Typography sx={{ width: 36, fontWeight: 700, color: 'primary.main' }}>
                        {step.sequenceNo}
                        {step.parallelGroup && <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>({step.parallelGroup})</Typography>}
                      </Typography>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{step.processName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {step.processType} · {step.machineOrWorkcentreType} · {step.estimatedTimeValue} {step.estimatedTimeUnit}
                          {!step.mandatory && ' · Optional'}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={() => openEdit(step)}><AddIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => deleteStep(step.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Box>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editStep.id ? 'Edit Step' : 'Add Process Step'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 2 }}>
          <Stack direction="row" spacing={1}>
            <TextField label="Seq No" type="number" size="small" sx={{ width: 90 }}
              value={editStep.sequence_no}
              onChange={(e) => setEditStep((s: any) => ({ ...s, sequence_no: Number(e.target.value) }))} />
            <TextField label="Parallel Group" size="small" sx={{ flex: 1 }} placeholder="e.g. P1"
              value={editStep.parallel_group}
              onChange={(e) => setEditStep((s: any) => ({ ...s, parallel_group: e.target.value }))} />
            <TextField label="Step Code" size="small" sx={{ flex: 1 }}
              value={editStep.process_step_code}
              onChange={(e) => setEditStep((s: any) => ({ ...s, process_step_code: e.target.value }))} />
          </Stack>
          <TextField label="Process Name" size="small" required
            value={editStep.process_name}
            onChange={(e) => setEditStep((s: any) => ({ ...s, process_name: e.target.value }))} />
          <Stack direction="row" spacing={1}>
            <TextField label="Process Type" size="small" sx={{ flex: 1 }}
              value={editStep.process_type}
              onChange={(e) => setEditStep((s: any) => ({ ...s, process_type: e.target.value }))} />
            <TextField label="Machine / Work Centre" size="small" sx={{ flex: 2 }}
              value={editStep.machine_or_workcentre_type}
              onChange={(e) => setEditStep((s: any) => ({ ...s, machine_or_workcentre_type: e.target.value }))} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label="Est. Time" type="number" size="small" sx={{ flex: 1 }}
              value={editStep.estimated_time_value}
              onChange={(e) => setEditStep((s: any) => ({ ...s, estimated_time_value: e.target.value }))} />
            <TextField label="Unit" size="small" sx={{ width: 80 }}
              value={editStep.estimated_time_unit}
              onChange={(e) => setEditStep((s: any) => ({ ...s, estimated_time_unit: e.target.value }))} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField label="Drawing Ref" size="small" sx={{ flex: 1 }}
              value={editStep.drawing_ref}
              onChange={(e) => setEditStep((s: any) => ({ ...s, drawing_ref: e.target.value }))} />
            <TextField label="Detail Ref" size="small" sx={{ flex: 1 }}
              value={editStep.detail_ref}
              onChange={(e) => setEditStep((s: any) => ({ ...s, detail_ref: e.target.value }))} />
          </Stack>
          <TextField label="Notes" size="small" multiline rows={2}
            value={editStep.notes}
            onChange={(e) => setEditStep((s: any) => ({ ...s, notes: e.target.value }))} />
          <FormControlLabel
            control={<Checkbox checked={editStep.mandatory} onChange={(e) => setEditStep((s: any) => ({ ...s, mandatory: e.target.checked }))} />}
            label="Mandatory step"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveStep} disabled={saving || !editStep.process_name}>
            {saving ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
