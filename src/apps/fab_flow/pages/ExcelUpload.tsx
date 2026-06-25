import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, Paper, Stack, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, Typography,
} from '@mui/material';
import ArrowBackIcon    from '@mui/icons-material/ArrowBack';
import UploadFileIcon   from '@mui/icons-material/UploadFile';
import DownloadIcon     from '@mui/icons-material/Download';
import CheckCircleIcon  from '@mui/icons-material/CheckCircle';
import api from '@core/utils/axiosConfig';

interface Issue { sheet_name: string; row_number: number; severity: 'Error' | 'Warning'; field_name: string; message: string }
interface BatchResult {
  batchId: number; status: string; errorCount: number; warningCount: number;
  preview: { projectInfo: any; nodes: any[]; steps: any[]; stepNodes: any[]; preconditions: any[]; workAreaOptions: any[]; nodeMetrics: any[] };
  issues: Issue[];
}

export default function ExcelUpload() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate            = useNavigate();
  const fileRef             = useRef<HTMLInputElement>(null);

  const [uploading, setUploading]   = useState(false);
  const [importing, setImporting]   = useState(false);
  const [exporting, setExporting]   = useState(false);
  const [result, setResult]         = useState<BatchResult | null>(null);
  const [error, setError]           = useState('');
  const [tab, setTab]               = useState(0);
  const [importDone, setImportDone] = useState(false);

  async function downloadExport() {
    setExporting(true);
    try {
      const res = await api.get(`/plans/${planId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `FabFlow_Plan_${planId}_export.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Export failed — could not download the current plan.');
    } finally {
      setExporting(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setResult(null);
    setError('');
    try {
      const form = new FormData();
      form.append('excel_file', file);
      const res = await api.post(`/plans/${planId}/excel-upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setUploading(false);
    }
  }

  async function doImport() {
    if (!result) return;
    setImporting(true);
    try {
      await api.post(`/import-batches/${result.batchId}/import`);
      setImportDone(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? err.message);
    } finally {
      setImporting(false);
    }
  }

  const canImport = result && result.status === 'Parsed' && result.errorCount === 0 && !importDone;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/${company}/fab_flow/plans/${planId}`)}>Back</Button>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>Excel Upload</Typography>
        <Button
          startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
          onClick={downloadExport}
          disabled={exporting}
        >
          Export Current Plan
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {importDone && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
          Import successful! <Button size="small" onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/tree`)}>View Tree</Button>
        </Alert>
      )}

      {/* Drop zone */}
      <Paper
        variant="outlined"
        sx={{
          p: 4, mb: 3, textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={() => fileRef.current?.click()}
      >
        <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography variant="subtitle1">Click to select Excel file (.xlsx)</Typography>
        <Typography variant="body2" color="text.secondary">Fill out the template and upload all sheets at once</Typography>
        {uploading && <CircularProgress sx={{ mt: 2 }} />}
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
        />
      </Paper>

      {/* Preview */}
      {result && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={result.status}
                  color={result.status === 'Parsed' ? 'success' : 'error'}
                  size="small"
                />
                {result.errorCount > 0 && <Chip label={`${result.errorCount} Errors`} color="error" size="small" />}
                {result.warningCount > 0 && <Chip label={`${result.warningCount} Warnings`} color="warning" size="small" />}
              </Stack>
              {canImport && (
                <Button variant="contained" color="success" onClick={doImport} disabled={importing}>
                  {importing ? <CircularProgress size={18} /> : 'Import to Plan'}
                </Button>
              )}
            </Box>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable" scrollButtons="auto">
              <Tab label="Project Info" />
              <Tab label={`Nodes (${result.preview.nodes.length})`} />
              <Tab label={`Process Steps (${result.preview.steps.length})`} />
              <Tab label={`Step Nodes (${result.preview.stepNodes.length})`} />
              <Tab label={`Preconditions (${result.preview.preconditions.length})`} />
              <Tab label={`Node Metrics (${result.preview.nodeMetrics?.length ?? 0})`} />
              <Tab label={`Issues (${result.issues.length})`} />
            </Tabs>
            <Divider sx={{ mb: 2 }} />

            {tab === 0 && result.preview.projectInfo && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                {Object.entries(result.preview.projectInfo).filter(([,v]) => v).map(([k, v]) => (
                  <Box key={k}>
                    <Typography variant="caption" color="text.secondary">{k.replace(/_/g,' ')}</Typography>
                    <Typography variant="body2">{String(v)}</Typography>
                  </Box>
                ))}
              </Box>
            )}

            {tab === 1 && (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Code','Name','Level','Qty','Unit','Parent','Profile','Material'].map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.preview.nodes.map((n, i) => (
                      <TableRow key={i} sx={{ bgcolor: n.node_code ? 'inherit' : 'error.lighter' }}>
                        <TableCell>{n.node_code}</TableCell>
                        <TableCell>{n.display_name}</TableCell>
                        <TableCell>{n.level_name}</TableCell>
                        <TableCell>{n.quantity}</TableCell>
                        <TableCell>{n.unit}</TableCell>
                        <TableCell>{n.parent_node_code}</TableCell>
                        <TableCell>{n.profile}</TableCell>
                        <TableCell>{n.material_grade}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {tab === 2 && (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Code','Process Name','Type','Machine','Seq','Time'].map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.preview.steps.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{s.process_step_code}</TableCell>
                        <TableCell>{s.process_name}</TableCell>
                        <TableCell>{s.process_type}</TableCell>
                        <TableCell>{s.machine_or_workcentre_type}</TableCell>
                        <TableCell>{s.sequence_no}</TableCell>
                        <TableCell>{s.estimated_time_value} {s.estimated_time_unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {tab === 3 && (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Step Code','Node Code','Role','Qty','Notes'].map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.preview.stepNodes.map((sn, i) => (
                      <TableRow key={i}>
                        <TableCell>{sn.process_step_code}</TableCell>
                        <TableCell>{sn.node_code}</TableCell>
                        <TableCell>{sn.node_role}</TableCell>
                        <TableCell>{sn.quantity}</TableCell>
                        <TableCell>{sn.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {tab === 4 && (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Step Code','Req. Step','Req. Node','Condition','Notes'].map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.preview.preconditions.map((pc, i) => (
                      <TableRow key={i}>
                        <TableCell>{pc.process_step_code}</TableCell>
                        <TableCell>{pc.required_process_step_code}</TableCell>
                        <TableCell>{pc.required_node_code}</TableCell>
                        <TableCell>{pc.required_condition}</TableCell>
                        <TableCell>{pc.notes}</TableCell>
                      </TableRow>
                    ))}
                    {result.preview.preconditions.length === 0 && (
                      <TableRow><TableCell colSpan={5} align="center">No preconditions defined.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {tab === 5 && (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Node Code','Metric Key','Value','Unit'].map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(result.preview.nodeMetrics ?? []).map((m, i) => (
                      <TableRow key={i}>
                        <TableCell>{m.node_code}</TableCell>
                        <TableCell>{m.metric_key}</TableCell>
                        <TableCell>{m.metric_value}</TableCell>
                        <TableCell>{m.metric_unit ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                    {(result.preview.nodeMetrics ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={4} align="center">No node metrics in this upload.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {tab === 6 && (
              <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Sheet','Row','Severity','Field','Message'].map((h) => (
                        <TableCell key={h}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {result.issues.map((issue, i) => (
                      <TableRow key={i}>
                        <TableCell>{issue.sheet_name}</TableCell>
                        <TableCell>{issue.row_number}</TableCell>
                        <TableCell>
                          <Chip label={issue.severity} color={issue.severity === 'Error' ? 'error' : 'warning'} size="small" />
                        </TableCell>
                        <TableCell>{issue.field_name}</TableCell>
                        <TableCell>{issue.message}</TableCell>
                      </TableRow>
                    ))}
                    {result.issues.length === 0 && (
                      <TableRow><TableCell colSpan={5} align="center">No issues found — clean upload.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
