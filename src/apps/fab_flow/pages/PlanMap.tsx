import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, Divider,
  IconButton, InputAdornment, List, ListItemButton, ListItemText,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ChevronRightIcon    from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon      from '@mui/icons-material/ExpandMore';
import CloseIcon           from '@mui/icons-material/Close';
import SearchIcon          from '@mui/icons-material/Search';
import RouteIcon           from '@mui/icons-material/Route';
import FitScreenIcon       from '@mui/icons-material/FitScreen';
import AccessTimeIcon      from '@mui/icons-material/AccessTime';
import DownloadIcon        from '@mui/icons-material/Download';
import UploadFileIcon      from '@mui/icons-material/UploadFile';
import PictureAsPdfIcon    from '@mui/icons-material/PictureAsPdf';

import api, { API_HOST }  from '@core/utils/axiosConfig';
import ProcessStepNode    from '../components/map/ProcessStepNode';
import FabNodeDot         from '../components/map/FabNodeDot';
import {
  buildEdges, layoutSteps, buildNodeGraph,
  toMinutes, type StepDatum, type NodeGraphResult,
} from '../utils/mapLayout';
import { computeCriticalPath } from '../utils/criticalPath';

const NODE_TYPES: NodeTypes = {
  processStep: ProcessStepNode,
  fabNodeDot:  FabNodeDot,
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

const STEP_TYPE_COLORS: Record<string, string> = {
  Cutting:    '#3b82f6', Welding:    '#ef4444', Drilling:   '#8b5cf6',
  'Fit-up':   '#f59e0b', Fitting:    '#f59e0b', Inspection: '#10b981',
  Blasting:   '#64748b', Painting:   '#ec4899', Assembly:   '#f97316',
  Marking:    '#06b6d4', Grinding:   '#a16207',
};
const STEP_DEFAULT_COLOR = '#6366f1';

function buildPipelineRows(steps: StepDatum[]): StepDatum[][] {
  const rows: StepDatum[][] = [];
  let i = 0;
  while (i < steps.length) {
    const pg = steps[i].parallelGroup;
    if (pg != null) {
      const group: StepDatum[] = [];
      while (i < steps.length && steps[i].parallelGroup === pg) group.push(steps[i++]);
      rows.push(group);
    } else {
      rows.push([steps[i++]]);
    }
  }
  return rows;
}

// ─── Step card (used inside horizontal process chain) ────────────────────────

function StepChainCard({
  step, selected = false, onClick,
}: { step: StepDatum; selected?: boolean; onClick?: () => void }) {
  const col     = STEP_TYPE_COLORS[step.processType ?? ''] ?? STEP_DEFAULT_COLOR;
  const mins    = toMinutes(step.estimatedTimeValue, step.estimatedTimeUnit);
  const timeStr = mins > 0 ? fmtDuration(mins) : '';
  return (
    <Box
      onClick={onClick}
      sx={{
        width: 160,
        border:  2,
        borderColor: selected ? col : 'divider',
        borderRadius: '6px',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: selected ? `0 0 0 2px ${col}44` : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        '&:hover': onClick ? { borderColor: col } : {},
        flexShrink: 0,
      }}
    >
      <Box sx={{ height: 3, bgcolor: col }} />
      <Box sx={{ px: 1.2, py: 0.75 }}>
        <Typography sx={{ fontSize: '0.58rem', fontFamily: 'monospace', color: 'text.disabled', lineHeight: 1 }}>
          {step.processStepCode}
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, lineHeight: 1.3, mt: 0.1 }}>
          {step.processName}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.4, gap: 0.5, flexWrap: 'wrap' }}>
          {step.processType && (
            <Chip label={step.processType} size="small"
              sx={{ height: 16, fontSize: '0.56rem', bgcolor: `${col}22`, color: col, fontWeight: 700, '& .MuiChip-label': { px: 0.8 } }} />
          )}
          {timeStr && (
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: '#b45309', ml: 'auto' }}>
              {timeStr}
            </Typography>
          )}
        </Box>
        {step.machineOrWorkcentreType && (
          <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary', mt: 0.2 }}>
            {step.machineOrWorkcentreType}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── Horizontal process chain dialog ─────────────────────────────────────────

interface ProcessChainDialogProps {
  open: boolean; title: string; steps: StepDatum[]; onClose: () => void;
}

function ProcessChainDialog({ open, title, steps, onClose }: ProcessChainDialogProps) {
  const [selectedStep, setSelectedStep] = useState<StepDatum | null>(null);
  const cols      = useMemo(() => buildPipelineRows(steps), [steps]);
  const totalMins = useMemo(
    () => steps.reduce((s, st) => s + toMinutes(st.estimatedTimeValue, st.estimatedTimeUnit), 0),
    [steps],
  );

  // clear selection when dialog closes or steps change
  useEffect(() => { if (!open) setSelectedStep(null); }, [open]);

  function toggleStep(s: StepDatum) {
    setSelectedStep((prev) => (prev?.id === s.id ? null : s));
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{ sx: { height: '70vh', display: 'flex', flexDirection: 'column' } }}>

      {/* Header */}
      <Box sx={{ px: 2.5, pt: 1.5, pb: 1, display: 'flex', alignItems: 'flex-start', gap: 1, flexShrink: 0 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 0.25, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">{steps.length} step{steps.length !== 1 ? 's' : ''}</Typography>
            {totalMins > 0 && (
              <Chip icon={<AccessTimeIcon sx={{ fontSize: '0.7rem !important' }} />}
                label={fmtDuration(totalMins)} size="small" color="warning" variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />
            )}
            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', fontSize: '0.58rem' }}>
              click a step for details
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider />

      {/* Horizontal pipeline — scrolls horizontally */}
      <Box sx={{ overflowX: 'auto', overflowY: 'hidden', px: 2, py: 1.5, flexShrink: 0 }}>
        {steps.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No process steps for this connection.</Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', width: 'max-content', gap: 0 }}>
            {cols.map((col, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && (
                  <Typography sx={{ mx: 1.5, color: 'text.disabled', fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>
                    →
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'center' }}>
                  {col.map((s) => (
                    <StepChainCard
                      key={s.id} step={s}
                      selected={selectedStep?.id === s.id}
                      onClick={() => toggleStep(s)}
                    />
                  ))}
                  {col.length > 1 && (
                    <Typography sx={{ fontSize: '0.52rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      parallel
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Step detail panel — expands when a step is selected */}
      {selectedStep && (
        <>
          <Divider />
          <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 1.5, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', mt: 0.4, flexShrink: 0,
                bgcolor: STEP_TYPE_COLORS[selectedStep.processType ?? ''] ?? STEP_DEFAULT_COLOR }} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '0.58rem', fontFamily: 'monospace', color: 'text.disabled' }}>
                  {selectedStep.processStepCode}
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  {selectedStep.processName}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setSelectedStep(null)} sx={{ mt: -0.5 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Properties grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 1.5 }}>
              {[
                ['Type',     selectedStep.processType],
                ['Machine',  selectedStep.machineOrWorkcentreType],
                ['Time',     selectedStep.estimatedTimeValue ? `${selectedStep.estimatedTimeValue} ${selectedStep.estimatedTimeUnit ?? ''}` : null],
                ['Sequence', selectedStep.sequenceNo],
                ['Group',    selectedStep.parallelGroup],
              ].filter(([, v]) => v != null).map(([label, value]) => (
                <Box key={label as string}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.75rem' }}>{String(value)}</Typography>
                </Box>
              ))}
            </Box>

            {/* Nodes involved */}
            {selectedStep.nodeMaps.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.4 }}>
                  Nodes involved
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selectedStep.nodeMaps.map((nm) => (
                    <Chip key={nm.nodeId}
                      label={`${nm.nodeRole}: ${nm.nodeCode}`} size="small"
                      sx={{ height: 18, fontSize: '0.6rem' }} />
                  ))}
                </Box>
              </Box>
            )}

            {selectedStep.notes && (
              <Typography variant="caption" color="text.secondary">{selectedStep.notes}</Typography>
            )}
          </Box>
        </>
      )}
    </Dialog>
  );
}

// ─── Node detail dialog ───────────────────────────────────────────────────────

interface FabNode {
  id: number; nodeCode: string; displayName: string; levelName: string | null;
  quantity: number | null; unit: string | null;
}

interface FabNodeDetail {
  id: number; node_code: string; display_name: string; level_name: string | null;
  description: string | null; quantity: number | null; unit: string | null;
  drawing_ref: string | null; drawing_sheet_no: string | null; drawing_revision: string | null;
  material_grade: string | null; profile: string | null;
  length_mm: number | null; width_mm: number | null; thickness_mm: number | null; weight_kg: number | null;
  location_ref: string | null; dispatchable: number | null; notes: string | null;
  diagram_file_name: string | null; diagram_mime_type: string | null;
}

interface NodeDetailDialogProps {
  open: boolean;
  node: FabNode;
  steps: StepDatum[];
  nodeRels: { parentNodeId: number; childNodeId: number }[];
  nodeById: Record<number, FabNode>;
  onClose: () => void;
}

function NodeDetailDialog({ open, node, steps, nodeRels, nodeById, onClose }: NodeDetailDialogProps) {
  const [detail,    setDetail]    = useState<FabNodeDetail | null>(null);
  const [fetching,  setFetching]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [diagError, setDiagError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parentNodes = useMemo(
    () => nodeRels.filter((r) => r.childNodeId === node.id).map((r) => nodeById[r.parentNodeId]).filter(Boolean),
    [node.id, nodeRels, nodeById],
  );
  const childNodes = useMemo(
    () => nodeRels.filter((r) => r.parentNodeId === node.id).map((r) => nodeById[r.childNodeId]).filter(Boolean),
    [node.id, nodeRels, nodeById],
  );
  const totalMins = useMemo(
    () => steps.reduce((s, st) => s + toMinutes(st.estimatedTimeValue, st.estimatedTimeUnit), 0),
    [steps],
  );

  const fetchDetail = useCallback(async () => {
    setFetching(true);
    try {
      const res = await api.get(`/nodes/${node.id}`);
      setDetail(res.data.data);
    } catch { /* non-fatal — basic info still shown */ }
    finally { setFetching(false); }
  }, [node.id]);

  useEffect(() => {
    if (open) { setDetail(null); setDiagError(''); fetchDetail(); }
  }, [open, fetchDetail]);

  async function downloadDiagram() {
    try {
      const res = await api.get(`/nodes/${node.id}/diagram`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${node.nodeCode}_diagram.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDiagError('Could not download diagram.');
    }
  }

  async function uploadDiagram(file: File) {
    setUploading(true); setDiagError('');
    try {
      const form = new FormData();
      form.append('diagram', file);
      await api.post(`/nodes/${node.id}/diagram`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await fetchDetail();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setDiagError(msg ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  const hasDiagram = !!detail?.diagram_file_name;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{ sx: { maxHeight: '85vh' } }}>

      {/* Header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1, display: 'flex', alignItems: 'flex-start', gap: 1, flexShrink: 0 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>{node.nodeCode}</Typography>
          <Typography variant="body2" color="text.secondary">{node.displayName}</Typography>
          {node.levelName && (
            <Chip label={node.levelName} size="small" sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }} />
          )}
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Divider />

      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        {fetching && !detail && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {/* Stats row */}
        <Box sx={{ display: 'flex', gap: 3, px: 2.5, pt: 2, pb: 1.5, flexWrap: 'wrap' }}>
          {node.quantity != null && (
            <Box>
              <Typography variant="caption" color="text.secondary">Quantity</Typography>
              <Typography variant="body2" fontWeight={700}>{node.quantity}{node.unit ? ` ${node.unit}` : ''}</Typography>
            </Box>
          )}
          {steps.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Process Steps</Typography>
              <Typography variant="body2" fontWeight={700}>{steps.length}</Typography>
            </Box>
          )}
          {totalMins > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Total Process Time</Typography>
              <Typography variant="body2" fontWeight={700}>{fmtDuration(totalMins)}</Typography>
            </Box>
          )}
        </Box>

        {detail && (
          <>
            {/* Description */}
            {detail.description && (
              <Box sx={{ px: 2.5, pb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Description</Typography>
                <Typography variant="body2">{detail.description}</Typography>
              </Box>
            )}

            {/* Drawing / material grid */}
            {(detail.drawing_ref || detail.material_grade || detail.profile || detail.weight_kg != null) && (
              <Box sx={{ px: 2.5, pb: 1.5 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                  sx={{ textTransform: 'uppercase', fontSize: '0.6rem', display: 'block', mb: 0.75, letterSpacing: 0.5 }}>
                  Specifications
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                  {[
                    ['Drawing Ref',    detail.drawing_ref],
                    ['Sheet No',       detail.drawing_sheet_no],
                    ['Revision',       detail.drawing_revision],
                    ['Material Grade', detail.material_grade],
                    ['Profile',        detail.profile],
                    ['Weight (kg)',    detail.weight_kg],
                    ['Length (mm)',    detail.length_mm],
                    ['Width (mm)',     detail.width_mm],
                    ['Thickness (mm)', detail.thickness_mm],
                    ['Location Ref',   detail.location_ref],
                    ['Dispatchable',   detail.dispatchable != null ? (detail.dispatchable ? 'Yes' : 'No') : null],
                  ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                    <Box key={label as string}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.75rem' }}>{String(value)}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}

        {/* Part of / Contains */}
        {(parentNodes.length > 0 || childNodes.length > 0) && (
          <Box sx={{ px: 2.5, pb: 1.5 }}>
            {parentNodes.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                  sx={{ textTransform: 'uppercase', fontSize: '0.6rem', display: 'block', mb: 0.5, letterSpacing: 0.5 }}>
                  Part of
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {parentNodes.map((p) => (
                    <Chip key={p.id} label={`${p.nodeCode}: ${p.displayName}`} size="small"
                      sx={{ height: 20, fontSize: '0.65rem' }} />
                  ))}
                </Box>
              </Box>
            )}
            {childNodes.length > 0 && (
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                  sx={{ textTransform: 'uppercase', fontSize: '0.6rem', display: 'block', mb: 0.5, letterSpacing: 0.5 }}>
                  Contains
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {childNodes.map((c) => (
                    <Chip key={c.id} label={`${c.nodeCode}: ${c.displayName}`} size="small"
                      sx={{ height: 20, fontSize: '0.65rem' }} />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}

        {/* Process steps */}
        {steps.length > 0 && (
          <Box sx={{ px: 2.5, pb: 1.5 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', fontSize: '0.6rem', display: 'block', mb: 0.5, letterSpacing: 0.5 }}>
              Process Steps
            </Typography>
            {steps.map((s) => {
              const col  = STEP_TYPE_COLORS[s.processType ?? ''] ?? STEP_DEFAULT_COLOR;
              const mins = toMinutes(s.estimatedTimeValue, s.estimatedTimeUnit);
              return (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: col, flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.2 }}>{s.processName}</Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                      {s.processStepCode}{s.processType ? ` · ${s.processType}` : ''}
                    </Typography>
                  </Box>
                  {mins > 0 && (
                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', flexShrink: 0 }}>
                      {fmtDuration(mins)}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        )}

        {/* Notes */}
        {detail?.notes && (
          <Box sx={{ px: 2.5, pb: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Notes</Typography>
            <Typography variant="body2" color="text.secondary">{detail.notes}</Typography>
          </Box>
        )}

        {/* Diagram section */}
        <Divider />
        <Box sx={{ px: 2.5, py: 1.5 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', fontSize: '0.6rem', display: 'block', mb: 1, letterSpacing: 0.5 }}>
            Diagram (PDF)
          </Typography>
          {diagError && (
            <Alert severity="error" sx={{ mb: 1, py: 0 }} onClose={() => setDiagError('')}>{diagError}</Alert>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {hasDiagram ? (
              <>
                <Chip icon={<PictureAsPdfIcon sx={{ fontSize: '0.9rem !important' }} />}
                  label={detail!.diagram_file_name!.replace(/^node_\d+_\d+/, node.nodeCode)}
                  size="small" variant="outlined" color="error"
                  sx={{ maxWidth: 200, fontSize: '0.65rem' }}
                />
                <Button size="small" startIcon={<DownloadIcon sx={{ fontSize: '0.9rem !important' }} />}
                  onClick={downloadDiagram}>
                  Download
                </Button>
                <Button size="small" startIcon={uploading ? <CircularProgress size={12} /> : <UploadFileIcon sx={{ fontSize: '0.9rem !important' }} />}
                  onClick={() => fileRef.current?.click()} disabled={uploading}>
                  Replace
                </Button>
              </>
            ) : (
              <Button size="small" variant="outlined"
                startIcon={uploading ? <CircularProgress size={12} /> : <UploadFileIcon sx={{ fontSize: '0.9rem !important' }} />}
                onClick={() => fileRef.current?.click()} disabled={uploading || fetching}>
                {uploading ? 'Uploading…' : 'Upload PDF'}
              </Button>
            )}
          </Box>
          <input
            ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDiagram(f); e.target.value = ''; }}
          />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── Node navigator tree ─────────────────────────────────────────────────────

function buildChildMap(rels: { parentNodeId: number; childNodeId: number }[]) {
  const map: Record<number, number[]> = {};
  for (const r of rels) (map[r.parentNodeId] ??= []).push(r.childNodeId);
  return map;
}

interface NavNodeProps {
  node: FabNode; depth: number;
  childMap: Record<number, number[]>; nodeById: Record<number, FabNode>;
  activeNodeId: number | null; onSelect: (n: FabNode) => void;
}

function NavNode({ node, depth, childMap, nodeById, activeNodeId, onSelect }: NavNodeProps) {
  const [open, setOpen] = useState(depth < 2);
  const childIds = childMap[node.id] ?? [];
  const hasChildren = childIds.length > 0;
  return (
    <Box>
      <ListItemButton dense selected={activeNodeId === node.id} onClick={() => onSelect(node)}
        sx={{ pl: 1 + depth * 1.5, py: 0.25, minHeight: 0 }}>
        <Box sx={{ mr: 0.5, display: 'flex', alignItems: 'center', color: 'text.disabled', flexShrink: 0 }}>
          {hasChildren ? (
            <IconButton size="small" sx={{ p: 0, width: 16, height: 16 }}
              onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
              {open ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          ) : (
            <Box sx={{ width: 16 }} />
          )}
        </Box>
        <ListItemText
          primary={<Typography sx={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.3 }}>{node.nodeCode}</Typography>}
          secondary={
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1.2 }}>
              {node.displayName}{node.levelName ? ` · ${node.levelName}` : ''}
            </Typography>
          }
          sx={{ my: 0 }}
        />
      </ListItemButton>
      {open && hasChildren && childIds.map((cid) => {
        const child = nodeById[cid];
        return child ? (
          <NavNode key={cid} node={child} depth={depth + 1} childMap={childMap}
            nodeById={nodeById} activeNodeId={activeNodeId} onSelect={onSelect} />
        ) : null;
      })}
    </Box>
  );
}

// ─── Step detail panel (step view) ───────────────────────────────────────────

interface StepPanelProps {
  step: StepDatum; onCriticalPath: boolean; onClose: () => void;
  company: string; planId: string;
}

function StepDetailPanel({ step, onCriticalPath, onClose, company, planId }: StepPanelProps) {
  const navigate = useNavigate();
  const roles = ['Input', 'Output', 'Worked-On', 'Consumed', 'Reference'];
  const byRole = useMemo(() => {
    const m: Record<string, typeof step.nodeMaps> = {};
    for (const nm of step.nodeMaps) (m[nm.nodeRole] ??= []).push(nm);
    return m;
  }, [step]);

  return (
    <Box sx={{ width: 300, borderLeft: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {step.processStepCode}
          </Typography>
          <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>{step.processName}</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
            {step.processType && <Chip label={step.processType} size="small" sx={{ height: 18, fontSize: '0.62rem' }} />}
            {onCriticalPath && <Chip label="Critical Path" size="small" color="error" sx={{ height: 18, fontSize: '0.62rem' }} />}
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1.5 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          {[
            ['Sequence',       step.sequenceNo],
            ['Parallel Group', step.parallelGroup],
            ['Est. Time',      step.estimatedTimeValue ? `${step.estimatedTimeValue} ${step.estimatedTimeUnit ?? ''}` : null],
            ['Machine',        step.machineOrWorkcentreType],
          ].filter(([, v]) => v != null).map(([label, value]) => (
            <Box key={label as string}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2" fontWeight={500}>{String(value)}</Typography>
            </Box>
          ))}
        </Box>
        {roles.filter((r) => byRole[r]?.length > 0).map((role) => (
          <Box key={role} sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', fontSize: '0.6rem' }}>{role}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.3 }}>
              {byRole[role].map((nm) => (
                <Chip key={nm.nodeId} label={`${nm.nodeCode}: ${nm.nodeDisplayName}`} size="small"
                  sx={{ height: 20, fontSize: '0.65rem' }} />
              ))}
            </Box>
          </Box>
        ))}
        {step.preconditions.length > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', fontSize: '0.6rem' }}>Preconditions</Typography>
            {step.preconditions.map((pc) => (
              <Typography key={pc.id} variant="caption" sx={{ display: 'block', mt: 0.3 }}>
                {pc.requiredStepCode
                  ? `Step ${pc.requiredStepCode} — ${pc.requiredCondition ?? 'Complete'}`
                  : pc.requiredNodeCode
                  ? `Node ${pc.requiredNodeCode} — ${pc.requiredCondition ?? 'Complete'}`
                  : pc.requiredCondition}
              </Typography>
            ))}
          </Box>
        )}
        {step.notes && (
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: 'uppercase', fontSize: '0.6rem' }}>Notes</Typography>
            <Typography variant="caption" sx={{ display: 'block', mt: 0.3, color: 'text.secondary' }}>{step.notes}</Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
        <Button size="small" fullWidth variant="outlined"
          onClick={() => navigate(`/${company}/fab_flow/plans/${planId}/process-steps`)}>
          Edit in Process Steps
        </Button>
      </Box>
    </Box>
  );
}

// ─── Overlay controls ─────────────────────────────────────────────────────────

function MapOverlayControls({
  criticalPathIds, cpNodeIds, cpDuration, showTimes, onToggleTimes, viewMode, onToggleView,
}: {
  criticalPathIds: Set<number>; cpNodeIds: Set<number>; cpDuration: number;
  showTimes: boolean; onToggleTimes: () => void;
  viewMode: 'step' | 'node'; onToggleView: () => void;
}) {
  const { fitView, getNodes, setCenter } = useReactFlow();

  function focusCriticalPath() {
    const ids  = viewMode === 'node' ? cpNodeIds : criticalPathIds;
    const cpNodes = getNodes().filter((n) => ids.has(Number(n.id)));
    if (cpNodes.length === 0) { fitView({ duration: 500 }); return; }
    const xs = cpNodes.map((n) => n.position.x);
    const ys = cpNodes.map((n) => n.position.y);
    setCenter(
      (Math.min(...xs) + Math.max(...xs)) / 2 + 108,
      (Math.min(...ys) + Math.max(...ys)) / 2 + 52,
      { duration: 600, zoom: 0.9 },
    );
  }

  return (
    <Panel position="top-right">
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1.5, px: 1.5, py: 0.75, boxShadow: 1 }}>
        {cpDuration > 0 && (
          <>
            <Chip
              icon={<AccessTimeIcon sx={{ fontSize: '0.8rem !important' }} />}
              label={`CP: ${fmtDuration(cpDuration)}`}
              size="small" color="error" variant="outlined"
              sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
            />
            <Divider orientation="vertical" flexItem />
          </>
        )}
        <Tooltip title="Focus critical path">
          <IconButton size="small" onClick={focusCriticalPath} sx={{ p: 0.4 }}>
            <RouteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit to screen">
          <IconButton size="small" onClick={() => fitView({ duration: 500 })} sx={{ p: 0.4 }}>
            <FitScreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <Tooltip title={viewMode === 'step' ? 'Switch to Node view' : 'Switch to Step view'}>
          <Chip
            label={viewMode === 'step' ? 'Steps' : 'Nodes'}
            size="small"
            color={viewMode === 'node' ? 'primary' : 'default'}
            variant={viewMode === 'node' ? 'filled' : 'outlined'}
            onClick={onToggleView}
            sx={{ height: 22, fontSize: '0.65rem', cursor: 'pointer' }}
          />
        </Tooltip>
        {viewMode === 'step' && (
          <Tooltip title={showTimes ? 'Hide time labels' : 'Show time labels'}>
            <Chip
              label="Time"
              size="small"
              variant={showTimes ? 'filled' : 'outlined'}
              onClick={onToggleTimes}
              sx={{ height: 22, fontSize: '0.65rem', cursor: 'pointer' }}
            />
          </Tooltip>
        )}
      </Box>
    </Panel>
  );
}

function FitOnLoad({ hasNodes }: { hasNodes: boolean }) {
  const { fitView } = useReactFlow();
  const fitted = useRef(false);
  useEffect(() => {
    if (!hasNodes || fitted.current) return;
    fitted.current = true;
    const t = setTimeout(() => fitView({ duration: 600, padding: 0.12 }), 80);
    return () => clearTimeout(t);
  }, [hasNodes, fitView]);
  return null;
}

// ─── Main PlanMap ─────────────────────────────────────────────────────────────

interface PlanMapProps { planId: string; company: string }

function PlanMapInner({ planId, company }: PlanMapProps) {
  const [steps,    setSteps]    = useState<StepDatum[]>([]);
  const [fabNodes, setFabNodes] = useState<FabNode[]>([]);
  const [nodeRels, setNodeRels] = useState<{ parentNodeId: number; childNodeId: number }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [cpIds,   setCpIds]   = useState<Set<number>>(new Set());
  const [cpDuration, setCpDur] = useState(0);

  const [stepLayout, setStepLayout] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [nodeLayout, setNodeLayout] = useState<NodeGraphResult | null>(null);

  const [viewMode,       setViewMode]       = useState<'step' | 'node'>('node');
  const [selectedStep,   setSelectedStep]   = useState<StepDatum | null>(null);
  const [pipelineOpen,   setPipelineOpen]   = useState(false);
  const [pipelineData,   setPipelineData]   = useState<{ title: string; steps: StepDatum[] } | null>(null);
  const [nodeDetailOpen, setNodeDetailOpen] = useState(false);
  const [nodeDetailNode, setNodeDetailNode] = useState<FabNode | null>(null);
  const [activeNodeId,   setActiveNodeId]   = useState<number | null>(null);
  const [nodeSearch,     setNodeSearch]     = useState('');
  const [showTimes,      setShowTimes]      = useState(true);

  // ── fetch
  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [readRes, nodesRes, relsRes] = await Promise.all([
        api.get(`${API_HOST}/api/${company}/fab_flow/plans/${planId}/readiness`),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_nodes',
          fields: ['id','nodeCode','displayName','levelName','quantity','unit'],
          filters: { projectPlanId: Number(planId) }, pagination: { limit: 2000 },
        }),
        api.post(`${API_HOST}/api/query/v1/base_resource`, {
          operation: 'query', resource: 'fab_node_relationships',
          fields: ['id','parentNodeId','childNodeId'],
          filters: { projectPlanId: Number(planId) }, pagination: { limit: 5000 },
        }),
      ]);

      const rd           = readRes.data?.data ?? readRes.data;
      const fetchedSteps = (rd?.steps ?? []) as StepDatum[];
      const fetchedNodes = (nodesRes.data?.data ?? nodesRes.data ?? []) as FabNode[];
      const fetchedRels  = relsRes.data?.data ?? relsRes.data ?? [];

      setSteps(fetchedSteps); setFabNodes(fetchedNodes); setNodeRels(fetchedRels);

      const rawEdges = buildEdges(fetchedSteps);
      const cp       = computeCriticalPath(fetchedSteps, rawEdges);
      setCpIds(cp.stepIds); setCpDur(cp.totalMinutes);

      setStepLayout(layoutSteps(fetchedSteps, rawEdges, cp.stepIds));
      setNodeLayout(buildNodeGraph(fetchedSteps, fetchedNodes, fetchedRels));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [planId, company]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // swap layouts on mode/data change
  useEffect(() => {
    setSelectedStep(null); setPipelineOpen(false);
    setNodeDetailOpen(false); setActiveNodeId(null);
    if (viewMode === 'step' && stepLayout) {
      setRfNodes(stepLayout.nodes); setRfEdges(stepLayout.edges);
    } else if (viewMode === 'node' && nodeLayout) {
      setRfNodes(nodeLayout.nodes); setRfEdges(nodeLayout.edges);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, stepLayout, nodeLayout]);

  // navigator helpers
  const childMap    = useMemo(() => buildChildMap(nodeRels), [nodeRels]);
  const nodeById    = useMemo(() => Object.fromEntries(fabNodes.map((n) => [n.id, n])), [fabNodes]);
  const childIds    = useMemo(() => new Set(nodeRels.map((r) => r.childNodeId)), [nodeRels]);
  const rootNodes   = useMemo(() => fabNodes.filter((n) => !childIds.has(n.id)), [fabNodes, childIds]);
  const filteredNodes = useMemo(() => {
    if (!nodeSearch.trim()) return null;
    const q = nodeSearch.toLowerCase();
    return fabNodes.filter((n) => n.nodeCode.toLowerCase().includes(q) || n.displayName.toLowerCase().includes(q));
  }, [fabNodes, nodeSearch]);

  function handleNavNodeSelect(n: FabNode) {
    setActiveNodeId(n.id);
    if (viewMode === 'step') {
      const related = new Set(
        steps.filter((s) => s.nodeMaps.some((nm) => nm.nodeId === n.id)).map((s) => String(s.id)),
      );
      setRfNodes((prev) => prev.map((rn) => ({ ...rn, style: related.has(rn.id) ? {} : { opacity: 0.15 } })));
    } else {
      setRfNodes((prev) => prev.map((rn) => ({ ...rn, style: rn.id === String(n.id) ? {} : { opacity: 0.15 } })));
    }
  }

  function clearNavSelection() {
    setActiveNodeId(null);
    setRfNodes((prev) => prev.map((rn) => ({ ...rn, style: {} })));
  }

  // node view: single-click opens node detail dialog
  function handleNodeClick(_: React.MouseEvent, rfNode: { id: string }) {
    if (viewMode === 'node') {
      const fn = fabNodes.find((n) => String(n.id) === rfNode.id);
      if (fn) { setNodeDetailNode(fn); setNodeDetailOpen(true); }
    }
  }

  // step view: double-click opens step detail panel
  function handleNodeDoubleClick(_: React.MouseEvent, rfNode: { id: string }) {
    if (viewMode === 'step') {
      const step = steps.find((s) => String(s.id) === rfNode.id);
      if (step) setSelectedStep(step);
    }
  }

  // edge click (node view): open process chain dialog
  function handleEdgeClick(_: React.MouseEvent, edge: Edge) {
    if (viewMode !== 'node') return;
    const key      = `${edge.source}→${edge.target}`;
    const pipeline = nodeLayout?.edgePipelines.get(key) ?? [];
    const src      = fabNodes.find((n) => String(n.id) === edge.source);
    const tgt      = fabNodes.find((n) => String(n.id) === edge.target);
    const title    = src && tgt ? `${src.nodeCode} → ${tgt.nodeCode}` : key.replace('→', ' → ');
    setPipelineData({ title, steps: pipeline });
    setPipelineOpen(true);
  }

  // strip time labels from step-view edges when showTimes is off
  const displayEdges = useMemo(() => {
    if (viewMode !== 'step' || showTimes) return rfEdges;
    return rfEdges.map((e) => ({ ...e, label: undefined }));
  }, [rfEdges, viewMode, showTimes]);

  if (!loading && steps.length === 0 && fabNodes.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
        <Typography variant="h6" color="text.secondary">No data yet</Typography>
        <Typography variant="body2" color="text.secondary">Add nodes and process steps to see the plan map.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 195px)', minHeight: 400, overflow: 'hidden' }}>

      {/* Left navigator */}
      <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: 'background.default' }}>
        <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: 0.5 }}>
            Node Navigator
          </Typography>
          <TextField size="small" fullWidth placeholder="Search nodes…" value={nodeSearch}
            onChange={(e) => setNodeSearch(e.target.value)} sx={{ mt: 0.75 }}
            InputProps={{
              sx: { fontSize: '0.75rem', height: 30 },
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16 }} /></InputAdornment>,
            }}
          />
          {activeNodeId && (
            <Button size="small" variant="text" sx={{ mt: 0.5, fontSize: '0.65rem', p: 0 }} onClick={clearNavSelection}>
              Clear filter
            </Button>
          )}
        </Box>
        <Divider />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress size={20} /></Box>
          ) : filteredNodes ? (
            <List dense disablePadding>
              {filteredNodes.map((n) => (
                <ListItemButton key={n.id} dense selected={activeNodeId === n.id}
                  onClick={() => handleNavNodeSelect(n)} sx={{ py: 0.4 }}>
                  <ListItemText
                    primary={<Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>{n.nodeCode}</Typography>}
                    secondary={<Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{n.displayName}</Typography>}
                  />
                </ListItemButton>
              ))}
              {filteredNodes.length === 0 && (
                <Typography variant="caption" sx={{ display: 'block', p: 2, color: 'text.secondary' }}>No nodes found.</Typography>
              )}
            </List>
          ) : (
            <List dense disablePadding>
              {rootNodes.map((n) => (
                <NavNode key={n.id} node={n} depth={0} childMap={childMap} nodeById={nodeById}
                  activeNodeId={activeNodeId} onSelect={handleNavNodeSelect} />
              ))}
            </List>
          )}
        </Box>
        <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            {fabNodes.length} nodes · {steps.length} steps
          </Typography>
        </Box>
      </Box>

      {/* Canvas */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', height: 'calc(100vh - 195px)', minHeight: 400, minWidth: 400 }}>
        {error && <Alert severity="error" sx={{ m: 1 }} onClose={() => setError('')}>{error}</Alert>}
        {loading && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper', zIndex: 10 }}>
            <CircularProgress />
          </Box>
        )}
        <ReactFlow
          nodes={rfNodes} edges={displayEdges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onEdgeClick={viewMode === 'node' ? handleEdgeClick : undefined}
          minZoom={0.05} maxZoom={2.5}
          defaultEdgeOptions={{ type: 'smoothstep' }}
          onlyRenderVisibleElements
          nodesConnectable={false}
          nodesFocusable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} color="#94a3b8" gap={20} size={1} />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap position="bottom-left" nodeStrokeWidth={2} zoomable pannable
            style={{ width: 160, height: 100 }}
            nodeColor={(n) => (n.data as Record<string, unknown>).onCriticalPath ? '#ef4444' : '#94a3b8'}
          />
          <MapOverlayControls
            criticalPathIds={cpIds}
            cpNodeIds={nodeLayout?.cpNodeIds ?? new Set()}
            cpDuration={cpDuration}
            showTimes={showTimes} onToggleTimes={() => setShowTimes((v) => !v)}
            viewMode={viewMode} onToggleView={() => setViewMode((v) => v === 'step' ? 'node' : 'step')}
          />
          <FitOnLoad key={viewMode} hasNodes={rfNodes.length > 0} />
        </ReactFlow>
      </Box>

      {/* Step detail panel (step view) */}
      {viewMode === 'step' && selectedStep && (
        <StepDetailPanel
          step={selectedStep} onCriticalPath={cpIds.has(selectedStep.id)}
          onClose={() => setSelectedStep(null)} company={company} planId={planId}
        />
      )}

      {/* Dialogs */}
      {pipelineData && (
        <ProcessChainDialog
          open={pipelineOpen} title={pipelineData.title} steps={pipelineData.steps}
          onClose={() => setPipelineOpen(false)}
        />
      )}
      {nodeDetailNode && (
        <NodeDetailDialog
          open={nodeDetailOpen} node={nodeDetailNode}
          steps={nodeLayout?.nodePipelines.get(nodeDetailNode.id) ?? []}
          nodeRels={nodeRels} nodeById={nodeById}
          onClose={() => setNodeDetailOpen(false)}
        />
      )}
    </Box>
  );
}

export default function PlanMap(props: PlanMapProps) {
  return (
    <ReactFlowProvider>
      <PlanMapInner {...props} />
    </ReactFlowProvider>
  );
}
