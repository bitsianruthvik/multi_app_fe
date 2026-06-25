import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, Grid, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon    from '@mui/icons-material/ArrowBack';
import EditIcon         from '@mui/icons-material/Edit';
import SaveIcon         from '@mui/icons-material/Save';
import AddIcon          from '@mui/icons-material/Add';
import DeleteIcon       from '@mui/icons-material/DeleteOutline';
import AccountTreeIcon  from '@mui/icons-material/AccountTree';
import api, { API_HOST } from '@core/utils/axiosConfig';

const METRIC_KEY_OPTIONS = [
  'weld_length_mm','cut_length_mm','num_holes','num_studs',
  'paint_area_m2','blast_area_m2','bend_length_mm','grind_length_mm',
  'drill_count','bolt_count','area_m2','length_mm','mass_kg',
];

interface NodeMetric {
  id:          number;
  nodeId:      number;
  metricKey:   string;
  metricValue: number;
  metricUnit:  string | null;
}

interface Node {
  id: number; nodeCode: string; displayName: string; levelName: string;
  description: string; quantity: number; unit: string;
  drawingRef: string; drawingSheetNo: string; drawingRevision: string;
  materialGrade: string; profile: string;
  lengthMm: number; widthMm: number; thicknessMm: number; weightKg: number;
  locationRef: string; dispatchable: number; notes: string;
  preferredWorkAreaId: number | null;
  projectPlanId: number;
}
interface WorkAreaOpt { id: number; workAreaCode: string; workAreaName: string }

interface ProcessParticipation {
  id:             number;
  processStepId:  number;
  nodeRole:       string;
  processName:    string;
  processStepCode: string;
}

const EDITABLE_FIELDS: { key: keyof Node; label: string; type?: string }[] = [
  { key: 'nodeCode',       label: 'Node Code' },
  { key: 'displayName',    label: 'Display Name' },
  { key: 'levelName',      label: 'Level Name' },
  { key: 'description',    label: 'Description' },
  { key: 'quantity',       label: 'Quantity', type: 'number' },
  { key: 'unit',           label: 'Unit' },
  { key: 'drawingRef',     label: 'Drawing Ref' },
  { key: 'drawingSheetNo', label: 'Sheet No' },
  { key: 'drawingRevision',label: 'Drawing Rev' },
  { key: 'materialGrade',  label: 'Material Grade' },
  { key: 'profile',        label: 'Profile' },
  { key: 'lengthMm',       label: 'Length (mm)', type: 'number' },
  { key: 'widthMm',        label: 'Width (mm)',  type: 'number' },
  { key: 'thicknessMm',    label: 'Thickness (mm)', type: 'number' },
  { key: 'weightKg',       label: 'Weight (kg)', type: 'number' },
  { key: 'locationRef',    label: 'Location Ref' },
  { key: 'notes',          label: 'Notes' },
];

const ROLE_COLORS: Record<string, 'default'|'primary'|'success'|'error'|'warning'|'info'> = {
  'Worked-On': 'primary',
  'Input':     'info',
  'Output':    'success',
  'Consumed':  'warning',
  'Reference': 'default',
};

export default function NodeDetail() {
  const { company, planId, nodeId } = useParams<{ company: string; planId: string; nodeId: string }>();
  const navigate                    = useNavigate();

  const [node, setNode]               = useState<Node | null>(null);
  const [processes, setProcesses]     = useState<ProcessParticipation[]>([]);
  const [children, setChildren]       = useState<any[]>([]);
  const [parents, setParents]         = useState<any[]>([]);
  const [childNodes, setChildNodes]   = useState<Record<number,any>>({});
  const [parentNodes, setParentNodes] = useState<Record<number,any>>({});
  const [allWorkAreas, setAllWAs]     = useState<WorkAreaOpt[]>([]);
  const [metrics, setMetrics]         = useState<NodeMetric[]>([]);
  const [metricDraft, setMetricDraft] = useState<{ key: string; value: string; unit: string }>({ key: '', value: '', unit: '' });
  const [metricBusy, setMetricBusy]   = useState(false);
  const [editing, setEditing]         = useState(false);
  const [draft, setDraft]             = useState<Partial<Node>>({});
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const fetchNode = useCallback(async () => {
    setLoading(true);
    try {
      const [nodeRes, processRes, relRes, waRes, metricsRes] = await Promise.all([
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: EDITABLE_FIELDS.map((f) => f.key as string).concat(['projectPlanId','preferredWorkAreaId']),
          filters: { id: Number(nodeId) },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_process_step_node_map',
          fields: ['id','processStepId','nodeRole','processName','processStepCode'],
          filters: { nodeId: Number(nodeId) },
          pagination: { limit: 200 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_node_relationships',
          fields: ['id','parentNodeId','childNodeId','isPrimary','quantityRequired'],
          filters: { projectPlanId: Number(planId) },
          pagination: { limit: 2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_work_areas',
          fields: ['id','workAreaCode','workAreaName'],
          orderBy: [{ field: 'workAreaCode', direction: 'asc' }],
          pagination: { limit: 500 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_node_metrics',
          fields: ['id','nodeId','metricKey','metricValue','metricUnit'],
          filters: { nodeId: Number(nodeId) },
          orderBy: [{ field: 'metricKey', direction: 'asc' }],
          pagination: { limit: 200 },
        }),
      ]);

      const n = (nodeRes.data?.data ?? nodeRes.data)?.[0];
      setNode(n ?? null);
      setDraft(n ?? {});
      setProcesses(processRes.data?.data ?? processRes.data ?? []);
      setAllWAs(waRes.data?.data ?? []);
      setMetrics(metricsRes.data?.data ?? []);

      const rels: any[] = relRes.data?.data ?? relRes.data ?? [];
      const nodeChildren = rels.filter((r) => r.parentNodeId === Number(nodeId));
      const nodeParents  = rels.filter((r) => r.childNodeId  === Number(nodeId));
      setChildren(nodeChildren);
      setParents(nodeParents);

      // Batch-load sibling node codes for chips
      const relatedIds = [
        ...nodeChildren.map((r: any) => r.childNodeId),
        ...nodeParents.map((r: any) => r.parentNodeId),
      ];
      if (relatedIds.length > 0) {
        const sibRes = await api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','nodeCode','displayName'],
          filters: { projectPlanId: Number(planId) },
          pagination: { limit: 2000 },
        });
        const allPlanNodes: any[] = sibRes.data?.data ?? sibRes.data ?? [];
        const byId: Record<number,any> = {};
        allPlanNodes.forEach((nd) => { byId[nd.id] = nd; });
        const childMap: Record<number,any> = {};
        const parentMap: Record<number,any> = {};
        nodeChildren.forEach((r: any) => { childMap[r.childNodeId]   = byId[r.childNodeId]; });
        nodeParents.forEach((r: any)  => { parentMap[r.parentNodeId] = byId[r.parentNodeId]; });
        setChildNodes(childMap);
        setParentNodes(parentMap);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [nodeId, planId]);

  useEffect(() => { fetchNode(); }, [fetchNode]);

  async function saveNode() {
    setSaving(true);
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'update', resource: 'fab_nodes',
        data:      { ...draft, id: Number(nodeId) },
      });
      setEditing(false);
      fetchNode();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setSaving(false);
    }
  }

  async function addMetric() {
    if (!metricDraft.key.trim() || metricDraft.value === '') return;
    setMetricBusy(true);
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'insert', resource: 'fab_node_metrics',
        data: {
          node_id:      Number(nodeId),
          metric_key:   metricDraft.key.trim(),
          metric_value: Number(metricDraft.value),
          metric_unit:  metricDraft.unit.trim() || null,
        },
      });
      setMetricDraft({ key: '', value: '', unit: '' });
      fetchNode();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setMetricBusy(false);
    }
  }

  async function updateMetric(m: NodeMetric, value: number, unit: string) {
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'update', resource: 'fab_node_metrics',
        data: {
          id:           m.id,
          metric_value: value,
          metric_unit:  unit || null,
        },
      });
      fetchNode();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    }
  }

  async function deleteMetric(id: number) {
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'delete', resource: 'fab_node_metrics',
        data: { id },
      });
      fetchNode();
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (!node)   return <Box sx={{ p: 3 }}><Alert severity="error">Node not found.</Alert></Box>;

  const groupedProcesses = processes.reduce<Record<string, ProcessParticipation[]>>((acc, p) => {
    (acc[p.nodeRole] ??= []).push(p);
    return acc;
  }, {});

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/tree`)}>
          Tree
        </Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{node.nodeCode} — {node.displayName}</Typography>
        <Button size="small" startIcon={<AccountTreeIcon />}
          onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/process-steps`)}>
          Process Steps
        </Button>
        <IconButton onClick={() => { setEditing(!editing); setDraft(node); }}>
          <EditIcon fontSize="small" />
        </IconButton>
        {editing && (
          <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={saveNode} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : 'Save'}
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Node fields */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>Node Details</Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {EDITABLE_FIELDS.map(({ key, label, type }) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={key as string}>
                {editing ? (
                  <TextField
                    label={label} size="small" fullWidth type={type ?? 'text'}
                    value={(draft as any)[key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                  />
                ) : (
                  <>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2">{(node as any)[key] ?? '—'}</Typography>
                  </>
                )}
              </Grid>
            ))}
            {/* Preferred Work Area */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              {editing ? (
                <Autocomplete
                  size="small"
                  options={allWorkAreas}
                  value={allWorkAreas.find((wa) => wa.id === (draft.preferredWorkAreaId ?? null)) ?? null}
                  onChange={(_, v) => setDraft((d) => ({ ...d, preferredWorkAreaId: v?.id ?? null }))}
                  getOptionLabel={(o) => `${o.workAreaCode} — ${o.workAreaName}`}
                  renderInput={(params) => <TextField {...params} label="Preferred Work Area" />}
                />
              ) : (
                <>
                  <Typography variant="caption" color="text.secondary">Preferred Work Area</Typography>
                  <Typography variant="body2">
                    {node.preferredWorkAreaId
                      ? (allWorkAreas.find((wa) => wa.id === node.preferredWorkAreaId)?.workAreaCode ?? `#${node.preferredWorkAreaId}`)
                      : '—'}
                  </Typography>
                </>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Node Metrics — drive metric-based process duration */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">Metrics ({metrics.length})</Typography>
            <Typography variant="caption" color="text.secondary">
              Used by metric-based process steps: duration = value × rate
            </Typography>
          </Box>
          <Divider sx={{ mb: 1.5 }} />

          {/* Existing rows */}
          {metrics.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              No metrics set on this node yet.
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ mb: 2 }}>
              {metrics.map((m) => (
                <MetricRow key={m.id} metric={m}
                  onSave={(v, u) => updateMetric(m, v, u)}
                  onDelete={() => deleteMetric(m.id)} />
              ))}
            </Stack>
          )}

          {/* Add new */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Autocomplete freeSolo options={METRIC_KEY_OPTIONS}
              size="small" sx={{ flex: 1, minWidth: 200 }}
              value={metricDraft.key}
              onInputChange={(_, v) => setMetricDraft((d) => ({ ...d, key: v }))}
              renderInput={(p) => <TextField {...p} label="Metric Key" placeholder="e.g. weld_length_mm" />} />
            <TextField label="Value" type="number" size="small" sx={{ width: 130 }}
              value={metricDraft.value}
              onChange={(e) => setMetricDraft((d) => ({ ...d, value: e.target.value }))}
              inputProps={{ step: 0.0001 }} />
            <TextField label="Unit" size="small" sx={{ width: 100 }}
              value={metricDraft.unit}
              onChange={(e) => setMetricDraft((d) => ({ ...d, unit: e.target.value }))} />
            <Button variant="contained" startIcon={<AddIcon />} size="small"
              disabled={metricBusy || !metricDraft.key.trim() || metricDraft.value === ''}
              onClick={addMetric}>
              {metricBusy ? <CircularProgress size={16} /> : 'Add'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Relationships */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>Parent Nodes ({parents.length})</Typography>
              {parents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Root node</Typography>
              ) : parents.map((r) => {
                const pn = parentNodes[r.parentNodeId];
                return (
                  <Chip key={r.id} size="small" sx={{ mr: 0.5, mb: 0.5 }} clickable
                    label={pn ? `${pn.nodeCode}` : `#${r.parentNodeId}`}
                    onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/${r.parentNodeId}`)} />
                );
              })}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>Child Nodes ({children.length})</Typography>
              {children.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Leaf node</Typography>
              ) : children.map((r) => {
                const cn = childNodes[r.childNodeId];
                return (
                  <Chip key={r.id} size="small" sx={{ mr: 0.5, mb: 0.5 }} clickable
                    label={cn ? `${cn.nodeCode}` : `#${r.childNodeId}`}
                    onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/nodes/${r.childNodeId}`)} />
                );
              })}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Process participation */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">
              Process Participation ({processes.length} step{processes.length !== 1 ? 's' : ''})
            </Typography>
            <Button size="small"
              onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/process-steps`)}>
              Manage Steps
            </Button>
          </Box>
          <Divider sx={{ mb: 1.5 }} />
          {processes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This node is not yet assigned to any process step.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {Object.entries(groupedProcesses).map(([role, ps]) => (
                <Box key={role}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Chip size="small" label={role} color={ROLE_COLORS[role] ?? 'default'} />
                    <Typography variant="caption" color="text.secondary">in these steps:</Typography>
                  </Box>
                  <Box sx={{ pl: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {ps.map((p) => (
                      <Chip key={p.id} size="small" variant="outlined"
                        label={p.processStepCode ? `${p.processStepCode} — ${p.processName}` : p.processName}
                        onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/process-steps`)}
                      />
                    ))}
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

// Inline metric row with edit/save/delete
function MetricRow({ metric, onSave, onDelete }: {
  metric: NodeMetric;
  onSave: (value: number, unit: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const [val, setVal]   = useState(String(metric.metricValue));
  const [unit, setUnit] = useState(metric.metricUnit ?? '');

  useEffect(() => {
    setVal(String(metric.metricValue));
    setUnit(metric.metricUnit ?? '');
  }, [metric]);

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip size="small" label={metric.metricKey} sx={{ minWidth: 180, justifyContent: 'flex-start' }} />
      {edit ? (
        <>
          <TextField size="small" type="number" sx={{ width: 130 }}
            value={val} onChange={(e) => setVal(e.target.value)}
            inputProps={{ step: 0.0001 }} />
          <TextField size="small" sx={{ width: 100 }}
            value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" />
          <Button size="small" variant="contained" startIcon={<SaveIcon />}
            onClick={async () => { await onSave(Number(val), unit); setEdit(false); }}>
            Save
          </Button>
          <Button size="small" onClick={() => { setEdit(false); setVal(String(metric.metricValue)); setUnit(metric.metricUnit ?? ''); }}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          <Typography variant="body2" sx={{ width: 130 }}>{metric.metricValue}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ width: 100 }}>{metric.metricUnit ?? '—'}</Typography>
          <IconButton size="small" onClick={() => setEdit(true)}><EditIcon fontSize="small" /></IconButton>
          <IconButton size="small" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
        </>
      )}
    </Box>
  );
}
