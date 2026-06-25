import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Fragment } from 'react';
import {
  Alert, Autocomplete, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, IconButton, Paper, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon       from '@mui/icons-material/Add';
import EditIcon      from '@mui/icons-material/Edit';
import DeleteIcon    from '@mui/icons-material/DeleteOutline';
import api, { API_HOST } from '@core/utils/axiosConfig';
import ProgressDialog from '../components/ProgressDialog';

interface StepLite {
  id:              number;
  processStepCode: string;
  processName:     string;
}
interface NodeLite { id: number; nodeCode: string; displayName: string }

interface ProgressRow {
  id:             number;
  nodeId:         number;
  processStepId:  number;
  snapshotDate:   string;
  batchQty:       number;
  completionPct:  number;
  notes:          string | null;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function DailyProgress() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();

  const [date, setDate]           = useState(today());
  const [steps, setSteps]         = useState<StepLite[]>([]);
  const [nodes, setNodes]         = useState<NodeLite[]>([]);
  const [rows, setRows]           = useState<ProgressRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [dlg, setDlg]             = useState<{ open: boolean; stepId: number | null; nodeId: number | null; stepName?: string }>(
    { open: false, stepId: null, nodeId: null });
  const [stepFilter, setStepFilter] = useState<number | ''>('');

  const stepMap = useMemo(() => new Map(steps.map(s => [s.id, s])), [steps]);
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stepsRes, nodesRes, progressRes] = await Promise.all([
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_process_steps',
          fields: ['id','processStepCode','processName'],
          filters: { projectPlanId: Number(planId) },
          orderBy: [{ field: 'sequenceNo', direction: 'asc' }],
          pagination: { limit: 5000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','nodeCode','displayName'],
          filters: { projectPlanId: Number(planId) },
          orderBy: [{ field: 'nodeCode', direction: 'asc' }],
          pagination: { limit: 5000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_node_process_progress',
          fields: ['id','nodeId','processStepId','snapshotDate','batchQty','completionPct','notes'],
          filters: { planId: Number(planId), snapshotDate: date },
          orderBy: [{ field: 'id', direction: 'asc' }],
          pagination: { limit: 5000 },
        }),
      ]);
      setSteps(stepsRes.data?.data ?? []);
      setNodes(nodesRes.data?.data ?? []);
      setRows(progressRes.data?.data ?? []);
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    } finally {
      setLoading(false);
    }
  }, [planId, date]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function deleteRow(id: number) {
    if (!window.confirm('Delete this progress entry?')) return;
    try {
      await api.post(`${API_HOST}/api/query/v1/base_resource`, {
        operation: 'delete', resource: 'fab_node_process_progress', data: { id },
      });
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message);
    }
  }

  // Group rows by step+node for nicer display
  const grouped = useMemo(() => {
    const byStep = new Map<number, Map<number, ProgressRow[]>>();
    for (const r of rows) {
      if (stepFilter && r.processStepId !== stepFilter) continue;
      if (!byStep.has(r.processStepId)) byStep.set(r.processStepId, new Map());
      const byNode = byStep.get(r.processStepId)!;
      if (!byNode.has(r.nodeId)) byNode.set(r.nodeId, []);
      byNode.get(r.nodeId)!.push(r);
    }
    return byStep;
  }, [rows, stepFilter]);

  const totalEntries = Array.from(grouped.values()).reduce(
    (sum, m) => sum + Array.from(m.values()).reduce((s, batches) => s + batches.length, 0), 0);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Paper elevation={0} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/schedule`)}>
          Back to Gantt
        </Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Daily Progress</Typography>
        <TextField label="Date" type="date" size="small" sx={{ width: 170 }}
          value={date} onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }} />
        <Autocomplete size="small" sx={{ width: 320 }}
          options={steps}
          getOptionLabel={(s) => s.processStepCode ? `${s.processStepCode} — ${s.processName}` : s.processName}
          value={steps.find(s => s.id === stepFilter) ?? null}
          onChange={(_, v) => setStepFilter(v?.id ?? '')}
          renderInput={(p) => <TextField {...p} label="Filter by step" />} />
        <Button variant="contained" startIcon={<AddIcon />}
          onClick={() => setDlg({ open: true, stepId: stepFilter || null, nodeId: null })}>
          Add Entry
        </Button>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">
              {totalEntries} entr{totalEntries === 1 ? 'y' : 'ies'} on {date}
            </Typography>
          </Box>
          <Divider sx={{ mb: 1.5 }} />
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : grouped.size === 0 ? (
            <Typography variant="body2" color="text.secondary">No progress logged for this date yet.</Typography>
          ) : (
            <Stack spacing={2}>
              {[...grouped.entries()].map(([stepId, byNode]) => {
                const step = stepMap.get(stepId);
                return (
                  <Box key={stepId}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      {step ? (step.processStepCode ? `${step.processStepCode} — ${step.processName}` : step.processName) : `Step #${stepId}`}
                    </Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Node</TableCell>
                          <TableCell align="right">Qty</TableCell>
                          <TableCell align="right">Done %</TableCell>
                          <TableCell>Notes</TableCell>
                          <TableCell align="right" />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {[...byNode.entries()].map(([nodeId, batches]) => {
                          const node = nodeMap.get(nodeId);
                          const totalQty = batches.reduce((s, b) => s + Number(b.batchQty), 0);
                          const weighted = totalQty > 0
                            ? batches.reduce((s, b) => s + Number(b.batchQty) * Number(b.completionPct), 0) / totalQty
                            : 0;
                          return (
                            <Fragment key={nodeId}>
                              {batches.map((b, i) => (
                                <TableRow key={b.id} hover>
                                  {i === 0 && (
                                    <TableCell rowSpan={batches.length}>
                                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                        <Typography variant="body2" fontWeight={600}>
                                          {node ? node.nodeCode : `#${nodeId}`}
                                        </Typography>
                                        {node?.displayName && (
                                          <Typography variant="caption" color="text.secondary">{node.displayName}</Typography>
                                        )}
                                        <Chip size="small" variant="outlined" sx={{ mt: 0.5, alignSelf: 'flex-start' }}
                                          label={`Σ ${weighted.toFixed(1)}%`} />
                                      </Box>
                                    </TableCell>
                                  )}
                                  <TableCell align="right">{b.batchQty}</TableCell>
                                  <TableCell align="right">{b.completionPct}</TableCell>
                                  <TableCell>{b.notes || '—'}</TableCell>
                                  <TableCell align="right">
                                    {i === 0 && (
                                      <IconButton size="small"
                                        onClick={() => setDlg({ open: true, stepId, nodeId,
                                          stepName: step ? `${step.processStepCode || ''} ${step.processName}`.trim() : undefined })}>
                                        <EditIcon fontSize="small" />
                                      </IconButton>
                                    )}
                                    <IconButton size="small" onClick={() => deleteRow(b.id)}>
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Box>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      <ProgressDialog
        open={dlg.open}
        planId={Number(planId)}
        processStepId={dlg.stepId}
        initialNodeId={dlg.nodeId ?? undefined}
        stepName={dlg.stepName}
        date={date}
        onClose={() => setDlg({ open: false, stepId: null, nodeId: null })}
        onSaved={() => { setDlg({ open: false, stepId: null, nodeId: null }); fetchAll(); }}
      />
    </Box>
  );
}

