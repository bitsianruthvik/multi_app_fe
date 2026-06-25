import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  MarkerType,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';

import {
  Alert, Box, Button, Chip, CircularProgress, Collapse,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, ListItemButton, MenuItem, Paper, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AccountTreeIcon  from '@mui/icons-material/AccountTree';
import AddIcon          from '@mui/icons-material/Add';
import ArrowBackIcon    from '@mui/icons-material/ArrowBack';
import CloseIcon        from '@mui/icons-material/Close';
import DeleteIcon       from '@mui/icons-material/Delete';
import ExpandLessIcon   from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon   from '@mui/icons-material/ExpandMore';
import PublishIcon      from '@mui/icons-material/Publish';
import SaveIcon         from '@mui/icons-material/Save';
import VerifiedIcon     from '@mui/icons-material/Verified';

import { fabGet, fabPost, fabPut, fabPatch, fabDel } from '../api/client';
import type {
  FabRoutingPlan, FabRoutingOpStep, FabRoutingOpDep,
  FabRoutingOpInput, FabRoutingOpOutput, FabRoutingOpFormula,
  FabResourceType, FormulaVar,
} from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BomItem {
  id: number;
  name: string;
  qty: number;
  unit: string | null;
  itemCategory: string;
  refItemName: string | null;
  refItemCode: string | null;
}

interface NodeData extends Record<string, unknown> {
  stepId:          number;
  name:            string;
  resourceTypeName: string | null;
  inputCount:      number;
  outputCount:     number;
  formulaCount:    number;
  score:           number;   // 0–4 completion
  isDropTarget:    boolean;
  onDelete:        (stepId: number, nodeId: string) => void;
}

interface FullPlan {
  plan:     FabRoutingPlan;
  steps:    FabRoutingOpStep[];
  deps:     FabRoutingOpDep[];
  inputs:   Record<number, FabRoutingOpInput[]>;
  outputs:  Record<number, FabRoutingOpOutput[]>;
  formulas: Record<number, FabRoutingOpFormula[]>;
}

const FORMULA_TYPES = [
  { value: 'setup_time',   label: 'Setup Time' },
  { value: 'machine_time', label: 'Machine Time' },
  { value: 'people_time',  label: 'People Time' },
  { value: 'wait_time',    label: 'Wait Time' },
  { value: 'move_time',    label: 'Move Time' },
] as const;
type FormulaType = typeof FORMULA_TYPES[number]['value'];

const SCORE_COLOR = ['#ef5350', '#ff7043', '#ffa726', '#8bc34a', '#4caf50'];

function stepScore(s: FabRoutingOpStep, ins: FabRoutingOpInput[], outs: FabRoutingOpOutput[], fmls: FabRoutingOpFormula[]) {
  return (s.resourceTypeId ? 1 : 0) + (ins.length > 0 ? 1 : 0) + (outs.length > 0 ? 1 : 0) + (fmls.length > 0 ? 1 : 0);
}

// ─── Auto-layout (dagre) ─────────────────────────────────────────────────────

function dagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new Dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 140 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => g.setNode(n.id, { width: 200, height: 80 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  Dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - 100, y: pos.y - 40 } };
  });
}

// ─── Custom Operation Node ────────────────────────────────────────────────────

function OperationNode({ data, selected }: NodeProps<NodeData>) {
  const scoreColor = SCORE_COLOR[data.score as number] ?? SCORE_COLOR[0];
  return (
    <Box sx={{
      border: '2px solid', borderColor: data.isDropTarget ? 'var(--c-info-500)' : selected ? 'var(--c-primary-600)' : 'var(--c-divider)',
      borderRadius: 'var(--r-md)', width: 200, position: 'relative', overflow: 'hidden', fontFamily: 'var(--font-ui)',
      bgcolor: data.isDropTarget ? 'var(--c-info-50)' : selected ? 'var(--c-primary-50)' : 'var(--c-surface)',
      boxShadow: data.isDropTarget ? '0 0 0 3px var(--c-info-200)' : selected ? 'var(--e-2)' : 'var(--e-1)',
      transition: 'all 0.12s',
    }}>
      <Handle type="target" position={Position.Left}
        style={{ width: 16, height: 16, background: 'var(--c-primary-600)', border: '2px solid white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)', left: -9, cursor: 'crosshair' }} />
      <Handle type="source" position={Position.Right}
        style={{ width: 16, height: 16, background: 'var(--c-primary-600)', border: '2px solid white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)', right: -9, cursor: 'crosshair' }} />

      {/* Completion stripe at bottom */}
      <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, bgcolor: scoreColor }} />

      <IconButton size="small"
        onClick={e => { e.stopPropagation(); (data.onDelete as (id: number, nid: string) => void)(data.stepId as number, `step-${data.stepId}`); }}
        sx={{ position: 'absolute', top: 2, right: 2, zIndex: 10, opacity: 0.4, '&:hover': { opacity: 1 } }}>
        <CloseIcon sx={{ fontSize: 13 }} />
      </IconButton>

      <Box sx={{ p: 1.5, pr: 3.5, pb: 2 }}>
        <Typography variant="subtitle2" noWrap fontWeight={700} fontSize={12}>{data.name as string}</Typography>
        {data.resourceTypeName
          ? <Typography variant="caption" color="primary.main" noWrap fontSize={10}>{data.resourceTypeName as string}</Typography>
          : <Typography variant="caption" color="error.light" fontSize={10}>No resource type</Typography>
        }
        <Stack direction="row" gap={0.4} mt={0.6} flexWrap="wrap">
          <Chip size="small" label={`In ${data.inputCount}`}  sx={{ height: 16, fontSize: 9 }} />
          <Chip size="small" label={`Out ${data.outputCount}`} sx={{ height: 16, fontSize: 9 }} />
          {(data.formulaCount as number) > 0 && (
            <Chip size="small" color="primary" label={`${data.formulaCount}f`} sx={{ height: 16, fontSize: 9 }} />
          )}
          <Chip size="small" label={`${data.score}/4`}
            sx={{ height: 16, fontSize: 9, bgcolor: scoreColor, color: 'white', fontWeight: 700 }} />
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Variable browser ─────────────────────────────────────────────────────────

interface VarGroup { label: string; vars: { key: string; hint: string }[]; }

function VarBrowser({ groups, onInsert }: { groups: VarGroup[]; onInsert: (k: string) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (groups.length === 0) return null;
  return (
    <Paper variant="outlined" sx={{ mb: 1.5 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" px={1} pt={1}>
        VARIABLES — click to insert
      </Typography>
      {groups.map(g => (
        <Box key={g.label}>
          <ListItemButton dense onClick={() => setOpen(o => ({ ...o, [g.label]: !o[g.label] }))} sx={{ px: 1, py: 0.5 }}>
            <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>{g.label}</Typography>
            {open[g.label] ? <ExpandLessIcon sx={{ fontSize: 13 }} /> : <ExpandMoreIcon sx={{ fontSize: 13 }} />}
          </ListItemButton>
          <Collapse in={open[g.label]}>
            <Box sx={{ px: 1, pb: 0.75, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {g.vars.map(v => (
                <Chip key={v.key} label={v.key} size="small" variant="outlined" clickable title={v.hint}
                  onClick={() => onInsert(v.key)}
                  sx={{ height: 18, fontSize: 10, fontFamily: 'monospace' }} />
              ))}
            </Box>
          </Collapse>
        </Box>
      ))}
    </Paper>
  );
}

// ─── Collapsible section (replaces tabs) ─────────────────────────────────────

function Section({ title, badge, warn, defaultOpen = true, children }: {
  title: string; badge?: string | number; warn?: boolean; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box onClick={() => setOpen(o => !o)}
        sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none',
          '&:hover': { bgcolor: 'action.hover' } }}>
        <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>{title}</Typography>
        {badge !== undefined && (
          <Chip size="small" label={badge}
            color={warn ? 'warning' : 'default'}
            sx={{ height: 18, fontSize: 10, mr: 0.75 }} />
        )}
        {open ? <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
               : <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
      </Box>
      <Collapse in={open}>
        <Box sx={{ px: 2, pb: 2 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

// ─── Step Detail Panel ────────────────────────────────────────────────────────

interface StepPanelProps {
  step:            FabRoutingOpStep;
  inputs:          FabRoutingOpInput[];
  outputs:         FabRoutingOpOutput[];
  formulas:        FabRoutingOpFormula[];
  bomComponents:   BomItem[];
  bomCoProducts:   BomItem[];
  catalogItemName: string;
  resourceTypes:   FabResourceType[];
  onSaveStep:      (draft: Partial<FabRoutingOpStep>) => Promise<void>;
  onAddInput:      (stepId: number, input: Partial<FabRoutingOpInput>) => Promise<void>;
  onDeleteInput:   (id: number) => Promise<void>;
  onAddOutput:     (out: Partial<FabRoutingOpOutput>) => Promise<void>;
  onDeleteOutput:  (id: number) => Promise<void>;
  onSaveFormula:   (formulaType: FormulaType, expression: string) => Promise<void>;
  onClose:         () => void;
  planStatus:      FabRoutingPlan['status'];
}

function StepPanel(p: StepPanelProps) {
  const [saving,        setSaving]        = useState(false);
  const [savingFormulas,setSavingFormulas] = useState(false);

  const [name,  setName]  = useState(p.step.name);
  const [desc,  setDesc]  = useState(p.step.description ?? '');
  const [rtId,  setRtId]  = useState<number | null>(p.step.resourceTypeId ?? null);
  const [notes, setNotes] = useState(p.step.notes ?? '');

  const [inDlg,  setInDlg]  = useState(false);
  const [inItem, setInItem] = useState<BomItem | null>(null);
  const [inQty,  setInQty]  = useState('');
  const [inUom,  setInUom]  = useState('');

  const [outDlg,  setOutDlg]  = useState(false);
  const [outName, setOutName] = useState('');
  const [outType, setOutType] = useState<'wip' | 'final' | 'scrap'>('wip');
  const [outUom,  setOutUom]  = useState('');

  const [formulaDrafts, setFormulaDrafts] = useState<Record<FormulaType, string>>(() => {
    const d = {} as Record<FormulaType, string>;
    FORMULA_TYPES.forEach(ft => { d[ft.value] = ''; });
    p.formulas.forEach(f => { d[f.formulaType] = f.expression; });
    return d;
  });
  const [focusedFormula, setFocusedFormula] = useState<FormulaType>('machine_time');
  const [rtVars, setRtVars] = useState<FormulaVar[]>([]);

  useEffect(() => {
    setName(p.step.name);
    setDesc(p.step.description ?? '');
    setRtId(p.step.resourceTypeId ?? null);
    setNotes(p.step.notes ?? '');
    const d = {} as Record<FormulaType, string>;
    FORMULA_TYPES.forEach(ft => { d[ft.value] = ''; });
    p.formulas.forEach(f => { d[f.formulaType] = f.expression; });
    setFormulaDrafts(d);
  }, [p.step.id]);

  useEffect(() => {
    if (!rtId) { setRtVars([]); return; }
    fabGet<{ vars: FormulaVar[] }>(`routing/resource-type-vars/${rtId}`)
      .then(r => setRtVars(r.vars ?? [])).catch(() => setRtVars([]));
  }, [rtId]);

  const isRO = p.planStatus !== 'draft';
  const addedBomIds = new Set(p.inputs.map(i => i.bomItemId).filter(Boolean));
  const remainComps = p.bomComponents.filter(b => !addedBomIds.has(b.id));
  const remainCoProd = p.bomCoProducts.filter(b => !p.outputs.some(o => o.name === b.name));
  const finalAdded   = p.outputs.some(o => o.outputType === 'final' && o.name === p.catalogItemName);

  const varGroups = useMemo((): VarGroup[] => {
    const groups: VarGroup[] = [
      { label: 'Order / Batch', vars: [
        { key: 'order.quantity',   hint: 'Total order quantity' },
        { key: 'order.batch_size', hint: 'Batch size for this run' },
      ]},
    ];
    if (p.inputs.length > 0) {
      groups.push({ label: `Inputs (${p.inputs.length})`,
        vars: p.inputs.flatMap(inp => {
          const slug = (inp.label ?? inp.bomItemName ?? `item${inp.bomItemId}`)
            .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          return [
            { key: `input.${slug}.qty`,    hint: `Quantity of ${inp.label ?? inp.bomItemName}` },
            { key: `input.${slug}.weight`, hint: `Weight of ${inp.label ?? inp.bomItemName}` },
            { key: `input.${slug}.uom`,    hint: `UOM of ${inp.label ?? inp.bomItemName}` },
          ];
        }),
      });
    }
    if (p.outputs.length > 0) {
      groups.push({ label: `Outputs (${p.outputs.length})`,
        vars: p.outputs.flatMap(out => {
          const slug = out.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          return [
            { key: `output.${slug}.qty`,       hint: `Quantity of ${out.name}` },
            { key: `output.${slug}.scrap_pct`, hint: `Scrap % for ${out.name}` },
          ];
        }),
      });
    }
    if (rtVars.length > 0) {
      groups.push({ label: 'Resource', vars: rtVars.map(v => ({ key: v.key, hint: v.label + (v.unit ? ` (${v.unit})` : '') })) });
    }
    return groups;
  }, [p.inputs, p.outputs, rtVars]);

  const handleSaveBasic = async () => {
    setSaving(true);
    try { await p.onSaveStep({ name, description: desc || null, resourceTypeId: rtId, notes: notes || null }); }
    finally { setSaving(false); }
  };

  const openAddInput = (b: BomItem) => {
    setInItem(b);
    setInQty(String(b.qty ?? ''));
    setInUom(b.unit ?? '');
    setInDlg(true);
  };

  const handleAddInput = async () => {
    if (!inItem) return;
    await p.onAddInput(p.step.id, {
      sourceType: 'bom_item', bomItemId: inItem.id, label: inItem.name,
      qty: inQty ? parseFloat(inQty) : inItem.qty, uom: inUom || inItem.unit || null,
    });
    setInDlg(false); setInItem(null); setInQty(''); setInUom('');
  };

  const handleAddOutput = async (preset?: { name: string; outputType: 'wip' | 'final' | 'scrap' }) => {
    if (preset) { await p.onAddOutput({ name: preset.name, outputType: preset.outputType }); return; }
    if (!outName.trim()) return;
    await p.onAddOutput({ name: outName.trim(), outputType: outType, uom: outUom || null });
    setOutDlg(false); setOutName(''); setOutType('wip'); setOutUom('');
  };

  const handleSaveAllFormulas = async () => {
    setSavingFormulas(true);
    try { for (const ft of FORMULA_TYPES) { const e = formulaDrafts[ft.value].trim(); if (e) await p.onSaveFormula(ft.value, e); } }
    finally { setSavingFormulas(false); }
  };

  const insertVar = (key: string) => setFormulaDrafts(d => ({
    ...d, [focusedFormula]: (d[focusedFormula] ? d[focusedFormula] + ' + ' : '') + key,
  }));

  const score = stepScore(p.step, p.inputs, p.outputs, p.formulas);

  return (
    <Box sx={{ width: 380, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
        display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap title={p.step.name}>{p.step.name}</Typography>
          <Stack direction="row" gap={0.5} mt={0.25} alignItems="center">
            {[1, 2, 3, 4].map(i => (
              <Box key={i} sx={{ width: 20, height: 4, borderRadius: 2,
                bgcolor: i <= score ? SCORE_COLOR[score] : 'grey.300' }} />
            ))}
            <Typography variant="caption" color="text.secondary" ml={0.5}>{score}/4 complete</Typography>
          </Stack>
        </Box>
        <IconButton size="small" onClick={p.onClose}><CloseIcon /></IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto' }}>

        {/* ── Basic Info ── */}
        <Section title="Basic Info" defaultOpen>
          <Stack gap={1.5} pt={0.5}>
            <TextField label="Operation Name" value={name} onChange={e => setName(e.target.value)}
              size="small" fullWidth disabled={isRO} required />
            <TextField label="Description" value={desc} onChange={e => setDesc(e.target.value)}
              size="small" fullWidth multiline rows={2} disabled={isRO} />
            <TextField select label="Resource Type" value={rtId ?? ''}
              onChange={e => setRtId(e.target.value ? parseInt(e.target.value) : null)}
              size="small" fullWidth disabled={isRO}
              helperText={!rtId ? '⚠ Required for validation' : 'Controls resource formula variables'}>
              <MenuItem value="">— none —</MenuItem>
              {p.resourceTypes.map(rt => <MenuItem key={rt.id} value={rt.id}>{rt.name}</MenuItem>)}
            </TextField>
            <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)}
              size="small" fullWidth multiline rows={2} disabled={isRO} />
            {!isRO && (
              <Button variant="contained" size="small" onClick={handleSaveBasic}
                disabled={saving || !name.trim()}
                startIcon={saving ? <CircularProgress size={13} /> : <SaveIcon sx={{ fontSize: 15 }} />}>
                Save
              </Button>
            )}
          </Stack>
        </Section>

        {/* ── Inputs ── */}
        <Section title="Inputs" badge={p.inputs.length || undefined} warn={p.inputs.length === 0} defaultOpen>
          <Stack gap={1} pt={0.5}>
            {p.inputs.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                {isRO ? 'No inputs assigned.' : 'Click a BOM component below to assign it.'}
              </Typography>
            )}
            {p.inputs.map(inp => (
              <Paper key={inp.id} variant="outlined"
                sx={{ p: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>
                    {inp.label ?? inp.bomItemName ?? `BOM #${inp.bomItemId}`}
                  </Typography>
                  {(inp.qty || inp.uom) && (
                    <Typography variant="caption" color="text.secondary">{inp.qty} {inp.uom}</Typography>
                  )}
                </Box>
                {!isRO && (
                  <IconButton size="small" color="error" onClick={() => p.onDeleteInput(inp.id)}>
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                )}
              </Paper>
            ))}
            {!isRO && remainComps.length > 0 && (
              <>
                <Divider sx={{ my: 0.25 }}>
                  <Typography variant="caption" color="text.secondary" fontSize={10}>BOM COMPONENTS</Typography>
                </Divider>
                {remainComps.map(b => (
                  <Paper key={b.id} variant="outlined"
                    sx={{ p: 0.75, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                      borderRadius: 1, '&:hover': { bgcolor: 'primary.50', borderColor: 'primary.main' } }}
                    onClick={() => openAddInput(b)}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{b.name}</Typography>
                      {b.refItemName && <Typography variant="caption" color="text.secondary" noWrap>→ {b.refItemName}</Typography>}
                    </Box>
                    <Chip size="small" label={`${b.qty} ${b.unit ?? ''}`} variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                    <AddIcon sx={{ fontSize: 15, color: 'primary.main', flexShrink: 0 }} />
                  </Paper>
                ))}
              </>
            )}
            {!isRO && p.bomComponents.length === 0 && (
              <Alert severity="info" sx={{ py: 0, fontSize: 11 }}>
                No BOM components. Add materials to the BOM first.
              </Alert>
            )}
          </Stack>

          {/* Input qty dialog */}
          <Dialog open={inDlg} onClose={() => setInDlg(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ py: 1.5 }}>Add: {inItem?.name}</DialogTitle>
            <DialogContent>
              <Stack gap={1.5} mt={1}>
                <Stack direction="row" gap={1}>
                  <TextField label="Qty" value={inQty} onChange={e => setInQty(e.target.value)}
                    size="small" type="number" sx={{ flex: 1 }} />
                  <TextField label="UOM" value={inUom} onChange={e => setInUom(e.target.value)}
                    size="small" sx={{ flex: 1 }} placeholder="kg, pcs…" />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Override qty / UOM if this operation uses a different amount than the BOM.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setInDlg(false)}>Cancel</Button>
              <Button variant="contained" size="small" onClick={handleAddInput}>Add</Button>
            </DialogActions>
          </Dialog>
        </Section>

        {/* ── Outputs ── */}
        <Section title="Outputs" badge={p.outputs.length || undefined} warn={p.outputs.length === 0} defaultOpen>
          <Stack gap={1} pt={0.5}>
            {p.outputs.length === 0 && (
              <Typography variant="caption" color="text.secondary">
                {isRO ? 'No outputs defined.' : 'Add the products this operation produces.'}
              </Typography>
            )}
            {p.outputs.map(out => (
              <Paper key={out.id} variant="outlined"
                sx={{ p: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>{out.name}</Typography>
                  <Chip size="small"
                    label={out.outputType === 'final' ? 'Final Product' : out.outputType === 'scrap' ? 'Scrap' : 'WIP'}
                    color={out.outputType === 'final' ? 'success' : out.outputType === 'scrap' ? 'error' : 'default'}
                    sx={{ height: 16, fontSize: 10, mt: 0.25 }} />
                </Box>
                {!isRO && (
                  <IconButton size="small" color="error" onClick={() => p.onDeleteOutput(out.id)}>
                    <DeleteIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                )}
              </Paper>
            ))}
            {!isRO && (
              <Stack gap={0.75} mt={0.5}>
                {!finalAdded && p.catalogItemName && (
                  <Paper variant="outlined"
                    sx={{ p: 0.75, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                      borderColor: 'success.light', borderStyle: 'dashed',
                      '&:hover': { bgcolor: 'success.50' } }}
                    onClick={() => handleAddOutput({ name: p.catalogItemName, outputType: 'final' })}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={500}>{p.catalogItemName}</Typography>
                      <Typography variant="caption" color="text.secondary">Final manufactured product</Typography>
                    </Box>
                    <Chip size="small" label="Final" color="success" sx={{ fontSize: 10 }} />
                    <AddIcon sx={{ fontSize: 15, color: 'success.main' }} />
                  </Paper>
                )}
                {remainCoProd.map(b => (
                  <Paper key={b.id} variant="outlined"
                    sx={{ p: 0.75, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => handleAddOutput({ name: b.name, outputType: 'wip' })}>
                    <Box sx={{ flex: 1 }}><Typography variant="body2">{b.name}</Typography></Box>
                    <AddIcon sx={{ fontSize: 15, color: 'primary.main' }} />
                  </Paper>
                ))}
                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setOutDlg(true)}>
                  Add WIP / Scrap
                </Button>
              </Stack>
            )}
          </Stack>

          <Dialog open={outDlg} onClose={() => setOutDlg(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ py: 1.5 }}>Add Custom Output</DialogTitle>
            <DialogContent>
              <Stack gap={1.5} mt={1}>
                <TextField label="Output Name" value={outName} onChange={e => setOutName(e.target.value)}
                  size="small" fullWidth required placeholder="e.g. Welded Frame, Metal Scrap" />
                <TextField select label="Type" value={outType}
                  onChange={e => setOutType(e.target.value as 'wip' | 'final' | 'scrap')} size="small" fullWidth>
                  <MenuItem value="wip">WIP (Intermediate)</MenuItem>
                  <MenuItem value="scrap">Scrap</MenuItem>
                </TextField>
                <TextField label="UOM (optional)" value={outUom} onChange={e => setOutUom(e.target.value)}
                  size="small" fullWidth placeholder="pcs, kg…" />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOutDlg(false)}>Cancel</Button>
              <Button variant="contained" size="small" onClick={() => handleAddOutput()} disabled={!outName.trim()}>Add</Button>
            </DialogActions>
          </Dialog>
        </Section>

        {/* ── Formulas ── */}
        <Section title="Formulas" badge={p.formulas.length || undefined} defaultOpen={false}>
          <Stack gap={1.5} pt={0.5}>
            <VarBrowser groups={varGroups} onInsert={insertVar} />
            {p.inputs.length === 0 && p.outputs.length === 0 && !rtId && (
              <Alert severity="info" sx={{ py: 0, fontSize: 11 }}>
                Add inputs, outputs and a resource type first to see variables.
              </Alert>
            )}
            {FORMULA_TYPES.map(ft => {
              const saved = p.formulas.find(f => f.formulaType === ft.value);
              return (
                <Box key={ft.value}>
                  <Stack direction="row" alignItems="center" mb={0.5}>
                    <Typography variant="caption" fontWeight={700} sx={{ flex: 1 }}>{ft.label}</Typography>
                    {saved && <Chip size="small" label="saved" color="success" variant="outlined" sx={{ height: 15, fontSize: 9 }} />}
                  </Stack>
                  <TextField
                    value={formulaDrafts[ft.value]}
                    onChange={e => setFormulaDrafts(d => ({ ...d, [ft.value]: e.target.value }))}
                    onFocus={() => setFocusedFormula(ft.value)}
                    size="small" fullWidth multiline rows={2} disabled={isRO}
                    placeholder="e.g. resource.setup_time_hrs"
                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
                  />
                </Box>
              );
            })}
            {!isRO && (
              <Button variant="contained" size="small" onClick={handleSaveAllFormulas}
                disabled={savingFormulas || FORMULA_TYPES.every(ft => !formulaDrafts[ft.value].trim())}
                startIcon={savingFormulas ? <CircularProgress size={13} /> : <SaveIcon sx={{ fontSize: 14 }} />}>
                Save All Formulas
              </Button>
            )}
          </Stack>
        </Section>
      </Box>
    </Box>
  );
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

function RoutingPlanBuilderInner() {
  const { company, planId } = useParams<{ company: string; planId: string }>();
  const navigate = useNavigate();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [full,          setFull]          = useState<FullPlan | null>(null);
  const [nodes,         setNodes,         onNodesChange] = useNodesState<NodeData>([]);
  const [edges,         setEdges,         onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedStep,  setSelectedStep]  = useState<FabRoutingOpStep | null>(null);
  const [bomComponents, setBomComponents] = useState<BomItem[]>([]);
  const [bomCoProducts, setBomCoProducts] = useState<BomItem[]>([]);
  const [resourceTypes, setResourceTypes] = useState<FabResourceType[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [validErrors,   setValidErrors]   = useState<string[]>([]);
  const [validated,     setValidated]     = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [dropTargetId,  setDropTargetId]  = useState<string | null>(null);


  const nodeTypes = useMemo(() => ({ operation: OperationNode }), []);

  const handleDeleteNode = useCallback(async (stepId: number, nodeId: string) => {
    try {
      await fabDel(`routing/steps/${stepId}`);
      setNodes(ns => ns.filter(n => n.id !== nodeId));
      setEdges(es => es.filter(e => e.source !== nodeId && e.target !== nodeId));
      setFull(prev => {
        if (!prev) return prev;
        const ni = { ...prev.inputs };   delete ni[stepId];
        const no = { ...prev.outputs };  delete no[stepId];
        const nf = { ...prev.formulas }; delete nf[stepId];
        return { ...prev, steps: prev.steps.filter(s => s.id !== stepId),
          deps: prev.deps.filter(d => d.fromStepId !== stepId && d.toStepId !== stepId),
          inputs: ni, outputs: no, formulas: nf };
      });
      if (selectedStep?.id === stepId) setSelectedStep(null);
    } catch (e: unknown) { setError((e as Error).message); }
  }, [selectedStep, setNodes, setEdges]);

  const makeNodeData = useCallback((
    s: FabRoutingOpStep,
    inputs:   Record<number, FabRoutingOpInput[]>,
    outputs:  Record<number, FabRoutingOpOutput[]>,
    formulas: Record<number, FabRoutingOpFormula[]>,
    delFn: typeof handleDeleteNode,
    dropId?: string | null,
  ): NodeData => ({
    stepId:          s.id,
    name:            s.name,
    resourceTypeName: s.resourceTypeName ?? null,
    inputCount:      (inputs[s.id]   ?? []).length,
    outputCount:     (outputs[s.id]  ?? []).length,
    formulaCount:    (formulas[s.id] ?? []).length,
    score:           stepScore(s, inputs[s.id] ?? [], outputs[s.id] ?? [], formulas[s.id] ?? []),
    isDropTarget:    dropId === `step-${s.id}`,
    onDelete:        delFn,
  }), []);

  const buildNodes = useCallback((
    steps: FabRoutingOpStep[],
    inputs: Record<number, FabRoutingOpInput[]>,
    outputs: Record<number, FabRoutingOpOutput[]>,
    formulas: Record<number, FabRoutingOpFormula[]>,
    delFn: typeof handleDeleteNode,
  ): Node<NodeData>[] => steps.map(s => ({
    id: `step-${s.id}`, type: 'operation', position: { x: s.xPos, y: s.yPos },
    data: makeNodeData(s, inputs, outputs, formulas, delFn),
  })), [makeNodeData]);

  const buildEdges = useCallback((deps: FabRoutingOpDep[]): Edge[] => deps.map(d => ({
    id: `dep-${d.id}`, source: `step-${d.fromStepId}`, target: `step-${d.toStepId}`,
    markerEnd: { type: MarkerType.ArrowClosed }, data: { depId: d.id }, style: { strokeWidth: 2 },
  })), []);

  const load = useCallback(async () => {
    if (!planId) return;
    setLoading(true); setError('');
    try {
      const [planRes, rtRes] = await Promise.all([
        fabGet<FullPlan>(`routing/plans/${planId}`),
        fabGet<{ data: FabResourceType[] }>('routing/resource-types').catch(() => ({ data: [] as FabResourceType[] })),
      ]);
      setFull(planRes);
      setResourceTypes(rtRes.data);

      const bomRes = await fabGet<{ data: BomItem[] }>(`routing/bom-items/${planRes.plan.bomId}`);
      const all = bomRes.data ?? [];
      setBomComponents(all.filter(b => b.itemCategory === 'component'));
      setBomCoProducts(all.filter(b => b.itemCategory === 'co_product'));

      setNodes(buildNodes(planRes.steps, planRes.inputs, planRes.outputs, planRes.formulas, handleDeleteNode));
      setEdges(buildEdges(planRes.deps));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }, [planId, buildNodes, buildEdges, handleDeleteNode, setNodes, setEdges]);

  useEffect(() => { load(); }, [load]);

  // Keep node data in sync with full state
  useEffect(() => {
    if (!full) return;
    setNodes(prev => prev.map(n => {
      const stepId = (n.data as NodeData).stepId;
      const s = full.steps.find(st => st.id === stepId);
      if (!s) return n;
      return { ...n, data: makeNodeData(s, full.inputs, full.outputs, full.formulas, handleDeleteNode, dropTargetId) };
    }));
  }, [full, handleDeleteNode, makeNodeData, setNodes, dropTargetId]);

  // Update drop-target highlight without full state update
  useEffect(() => {
    setNodes(prev => prev.map(n => ({
      ...n, data: { ...n.data, isDropTarget: dropTargetId === n.id },
    })));
  }, [dropTargetId, setNodes]);

  // ── Auto-layout ──────────────────────────────────────────────────────────────
  const handleAutoLayout = useCallback(async () => {
    const laid = dagreLayout(nodes, edges);
    setNodes(laid);
    // Save all new positions
    await Promise.all(laid.map(n =>
      fabPatch(`routing/steps/${(n.data as NodeData).stepId}/pos`, { xPos: n.position.x, yPos: n.position.y })
        .catch(console.error),
    ));
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [nodes, edges, setNodes, fitView]);

  // ── Shared add-input (by stepId, no reliance on selectedStep) ────────────────
  const handleAddInputToStep = useCallback(async (stepId: number, input: Partial<FabRoutingOpInput>) => {
    const res = await fabPost<{ id: number }>('routing/inputs', { stepId, ...input });
    const newInput: FabRoutingOpInput = {
      id: res.id, companyId: 0, stepId,
      sourceType: 'bom_item', bomItemId: input.bomItemId ?? null,
      sourceStepId: null, label: input.label ?? null,
      qty: input.qty ?? null, uom: input.uom ?? null, notes: null,
      bomItemName: bomComponents.find(b => b.id === input.bomItemId)?.name,
      createdAt: '', updatedAt: '', deletedAt: null,
    };
    setFull(prev => prev ? {
      ...prev, inputs: { ...prev.inputs, [stepId]: [...(prev.inputs[stepId] ?? []), newInput] },
    } : prev);
  }, [bomComponents]);

  // ── Drag BOM items onto canvas / nodes ───────────────────────────────────────
  const onCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/bom-item')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const hit = nodes.find(n => {
      const nx = n.position.x, ny = n.position.y;
      return pos.x >= nx - 10 && pos.x <= nx + 210 && pos.y >= ny - 10 && pos.y <= ny + 90;
    });
    setDropTargetId(hit?.id ?? null);
  }, [nodes, screenToFlowPosition]);

  const onCanvasDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
    const raw = e.dataTransfer.getData('application/bom-item');
    if (!raw) return;
    const bomItem: BomItem = JSON.parse(raw);
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const targetNode = nodes.find(n => {
      const nx = n.position.x, ny = n.position.y;
      return pos.x >= nx && pos.x <= nx + 200 && pos.y >= ny && pos.y <= ny + 80;
    });
    if (!targetNode) { setError('Drop onto an operation node to assign it as an input.'); return; }
    const stepId = (targetNode.data as NodeData).stepId;
    await handleAddInputToStep(stepId, {
      sourceType: 'bom_item', bomItemId: bomItem.id, label: bomItem.name,
      qty: bomItem.qty, uom: bomItem.unit,
    });
  }, [nodes, screenToFlowPosition, handleAddInputToStep]);

  const onConnect = useCallback(async (params: Connection) => {
    if (!full || !params.source || !params.target) return;
    const fromStepId = parseInt(params.source.replace('step-', ''));
    const toStepId   = parseInt(params.target.replace('step-', ''));
    try {
      const res = await fabPost<{ id: number }>('routing/deps', { routingPlanId: parseInt(planId!), fromStepId, toStepId });
      setFull(prev => prev ? { ...prev, deps: [...prev.deps, {
        id: res.id, companyId: 0, routingPlanId: parseInt(planId!),
        fromStepId, toStepId, lagMinutes: null, notes: null, createdAt: '', updatedAt: '', deletedAt: null,
      }] } : prev);
      setEdges(eds => addEdge({ ...params, id: `dep-${res.id}`,
        markerEnd: { type: MarkerType.ArrowClosed }, data: { depId: res.id }, style: { strokeWidth: 2 } }, eds));
      setValidated(false);
    } catch (e: unknown) { setError((e as Error).message); }
  }, [full, planId, setEdges]);

  const onEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
    for (const e of deletedEdges) {
      const depId = (e.data as { depId?: number })?.depId;
      if (depId) {
        await fabDel(`routing/deps/${depId}`).catch(console.error);
        setFull(prev => prev ? { ...prev, deps: prev.deps.filter(d => d.id !== depId) } : prev);
      }
    }
    setValidated(false);
  }, []);

  const onNodeDragStop = useCallback(async (_: React.MouseEvent, node: Node<NodeData>) => {
    await fabPatch(`routing/steps/${node.data.stepId}/pos`, { xPos: node.position.x, yPos: node.position.y })
      .catch(console.error);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<NodeData>) => {
    const s = full?.steps.find(st => st.id === (node.data as NodeData).stepId) ?? null;
    setSelectedStep(s);
  }, [full]);

  const handleSaveStep = useCallback(async (draft: Partial<FabRoutingOpStep>) => {
    if (!selectedStep) return;
    await fabPut(`routing/steps/${selectedStep.id}`, draft as Record<string, unknown>);
    const rt = draft.resourceTypeId ? resourceTypes.find(r => r.id === draft.resourceTypeId) : null;
    const updated = { ...selectedStep, ...draft, resourceTypeName: rt?.name ?? null };
    setFull(prev => prev ? { ...prev, steps: prev.steps.map(s => s.id === selectedStep.id ? updated : s) } : prev);
    setSelectedStep(updated);
    setValidated(false);
  }, [selectedStep, resourceTypes]);

  const handleDeleteInput = useCallback(async (id: number) => {
    if (!selectedStep) return;
    await fabDel(`routing/inputs/${id}`);
    setFull(prev => prev ? {
      ...prev, inputs: { ...prev.inputs, [selectedStep.id]: (prev.inputs[selectedStep.id] ?? []).filter(i => i.id !== id) },
    } : prev);
  }, [selectedStep]);

  const handleAddOutput = useCallback(async (out: Partial<FabRoutingOpOutput>) => {
    if (!selectedStep) return;
    const res = await fabPost<{ id: number }>('routing/outputs', { stepId: selectedStep.id, ...out });
    const newOut: FabRoutingOpOutput = {
      id: res.id, companyId: 0, stepId: selectedStep.id,
      name: out.name ?? '', outputType: out.outputType ?? 'wip',
      qtyFormula: null, uom: out.uom ?? null, notes: null,
      createdAt: '', updatedAt: '', deletedAt: null,
    };
    setFull(prev => prev ? {
      ...prev, outputs: { ...prev.outputs, [selectedStep.id]: [...(prev.outputs[selectedStep.id] ?? []), newOut] },
    } : prev);
  }, [selectedStep]);

  const handleDeleteOutput = useCallback(async (id: number) => {
    if (!selectedStep) return;
    await fabDel(`routing/outputs/${id}`);
    setFull(prev => prev ? {
      ...prev, outputs: { ...prev.outputs, [selectedStep.id]: (prev.outputs[selectedStep.id] ?? []).filter(o => o.id !== id) },
    } : prev);
  }, [selectedStep]);

  const handleSaveFormula = useCallback(async (formulaType: FormulaType, expression: string) => {
    if (!selectedStep) return;
    const res = await fabPost<{ id: number }>('routing/formulas', { stepId: selectedStep.id, formulaType, expression, outputUnit: 'hours' });
    setFull(prev => {
      if (!prev) return prev;
      const existing = (prev.formulas[selectedStep.id] ?? []).find(f => f.formulaType === formulaType);
      const updated  = existing
        ? (prev.formulas[selectedStep.id] ?? []).map(f => f.formulaType === formulaType ? { ...f, expression } : f)
        : [...(prev.formulas[selectedStep.id] ?? []), {
            id: res.id, companyId: 0, stepId: selectedStep.id,
            formulaType, expression, outputUnit: 'hours', isValid: 0,
            createdAt: '', updatedAt: '', deletedAt: null,
          } as FabRoutingOpFormula];
      return { ...prev, formulas: { ...prev.formulas, [selectedStep.id]: updated } };
    });
  }, [selectedStep]);

  const handleValidate = async () => {
    if (!planId) return;
    try {
      const res = await fabPost<{ valid: boolean; errors: string[] }>(`routing/plans/${planId}/validate`);
      setValidErrors(res.errors ?? []); setValidated(res.valid);
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const handleRelease = async () => {
    if (!planId) return;
    try {
      await fabPost(`routing/plans/${planId}/release`);
      setFull(prev => prev ? { ...prev, plan: { ...prev.plan, status: 'released' } } : prev);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { errors?: string[] } }; message?: string };
      if (err.response?.data?.errors) setValidErrors(err.response.data.errors);
      else setError(err.message ?? 'Release failed');
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;

  const plan    = full?.plan;
  const isDraft = plan?.status === 'draft';

  const stepInputs   = selectedStep ? (full?.inputs[selectedStep.id]   ?? []) : [];
  const stepOutputs  = selectedStep ? (full?.outputs[selectedStep.id]  ?? []) : [];
  const stepFormulas = selectedStep ? (full?.formulas[selectedStep.id] ?? []) : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Top Bar ── */}
      <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider',
        background: 'background.paper', display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
        <IconButton size="small" onClick={() => navigate(`/${company}/fab_erp/routing-plans`)}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2} noWrap>{plan?.name}</Typography>
          <Typography variant="caption" color="text.secondary">{plan?.catalogItemName} · {plan?.bomName}</Typography>
        </Box>
        <Chip size="small" label={plan?.status ?? 'draft'}
          color={plan?.status === 'released' ? 'success' : plan?.status === 'archived' ? 'error' : 'default'} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Auto-arrange nodes left to right">
          <span>
            <Button size="small" startIcon={<AccountTreeIcon />} onClick={handleAutoLayout}
              disabled={nodes.length < 2}>
              Layout
            </Button>
          </span>
        </Tooltip>
        {isDraft && (
          <Tooltip title="Double-click canvas to add at position">
            <Button size="small" startIcon={<AddIcon />} variant="outlined"
              onClick={() => {/* handled by double-click, but button still available */
                setSaving(true);
                const xPos = 80 + (nodes.length % 4) * 260;
                const yPos = 80 + Math.floor(nodes.length / 4) * 160;
                fabPost<{ id: number }>('routing/steps', { routingPlanId: parseInt(planId!), name: 'New Operation', xPos, yPos })
                  .then(res => {
                    const ns: FabRoutingOpStep = {
                      id: res.id, companyId: 0, routingPlanId: parseInt(planId!),
                      name: 'New Operation', description: null, resourceTypeId: null,
                      seqNo: nodes.length, xPos, yPos, isOptional: 0, notes: null,
                      resourceTypeName: undefined, resourceTypeCode: undefined,
                      createdAt: '', updatedAt: '', deletedAt: null,
                    };
                    setFull(prev => prev ? { ...prev, steps: [...prev.steps, ns],
                      inputs:   { ...prev.inputs,   [res.id]: [] },
                      outputs:  { ...prev.outputs,  [res.id]: [] },
                      formulas: { ...prev.formulas, [res.id]: [] },
                    } : prev);
                    setNodes(p => [...p, { id: `step-${res.id}`, type: 'operation', position: { x: xPos, y: yPos },
                      data: { stepId: res.id, name: 'New Operation', resourceTypeName: null,
                        inputCount: 0, outputCount: 0, formulaCount: 0, score: 0, isDropTarget: false, onDelete: handleDeleteNode } }]);
                    setSelectedStep(ns);
                    setValidated(false);
                  })
                  .catch(e => setError((e as Error).message))
                  .finally(() => setSaving(false));
              }}
              disabled={saving}>
              {saving ? <CircularProgress size={14} /> : 'Add Operation'}
            </Button>
          </Tooltip>
        )}
        <Button size="small" startIcon={<VerifiedIcon />} onClick={handleValidate}>Validate</Button>
        {isDraft && (
          <Button size="small" variant="contained" color="success"
            startIcon={<PublishIcon />} onClick={handleRelease} disabled={!validated}>
            Release
          </Button>
        )}
      </Box>

      {/* ── Alerts ── */}
      {validErrors.length > 0 && (
        <Alert severity="error" onClose={() => setValidErrors([])} sx={{ mx: 2, mt: 1, flexShrink: 0 }}>
          {validErrors.map((e, i) => <Typography key={i} variant="caption" display="block">• {e}</Typography>)}
        </Alert>
      )}
      {validated && validErrors.length === 0 && (
        <Alert severity="success" onClose={() => setValidated(false)} sx={{ mx: 2, mt: 1, flexShrink: 0 }}>
          Plan is valid and ready to release.
        </Alert>
      )}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mx: 2, mt: 1, flexShrink: 0 }}>{error}</Alert>}

      {/* ── Body ── */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel — draggable BOM items */}
        <Box sx={{ width: 200, borderRight: '1px solid', borderColor: 'divider', overflow: 'auto',
          flexShrink: 0, background: 'background.default', p: 1 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.5}>
            BOM COMPONENTS
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.75} fontSize={10}>
            Drag onto a node to assign
          </Typography>
          {bomComponents.length === 0 && (
            <Typography variant="caption" color="text.secondary">No components</Typography>
          )}
          {bomComponents.map(b => (
            <Paper key={b.id} variant="outlined"
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/bom-item', JSON.stringify(b));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              sx={{ p: 0.75, mb: 0.5, cursor: 'grab', userSelect: 'none',
                '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.50' },
                '&:active': { cursor: 'grabbing' },
              }}>
              <Typography variant="caption" display="block" noWrap fontWeight={500}>{b.name}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap fontSize={10}>{b.qty} {b.unit}</Typography>
            </Paper>
          ))}

          <Divider sx={{ my: 1 }} />

          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.5}>
            RESOURCE TYPES
          </Typography>
          {resourceTypes.map(rt => (
            <Box key={rt.id} sx={{ py: 0.3, px: 0.5 }}>
              <Typography variant="caption" display="block" noWrap>{rt.name}</Typography>
            </Box>
          ))}
        </Box>

        {/* Canvas */}
        <Box sx={{ flex: 1, position: 'relative' }}>
          {nodes.length === 0 && (
            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', opacity: 0.65 }}>
                <Typography variant="h6" color="text.secondary">Empty Canvas</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  Double-click anywhere to add an operation
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  or use "Add Operation" in the toolbar
                </Typography>
              </Paper>
            </Box>
          )}
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={isDraft ? onConnect : undefined}
            onEdgesDelete={isDraft ? onEdgesDelete : undefined}
            onNodeDragStop={isDraft ? onNodeDragStop : undefined}
            onNodeClick={onNodeClick}
            onDragOver={onCanvasDragOver}
            onDrop={onCanvasDrop}
            onDragLeave={() => setDropTargetId(null)}
            fitView fitViewOptions={{ padding: 0.25 }}
            deleteKeyCode={isDraft ? 'Backspace' : null}>
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap nodeStrokeWidth={3} />
          </ReactFlow>
        </Box>

        {/* Right panel — step detail (single scrollable, no tabs) */}
        {selectedStep && (
          <Box sx={{ width: 380, borderLeft: '1px solid', borderColor: 'divider', overflow: 'auto',
            flexShrink: 0, background: 'background.paper' }}>
            <StepPanel
              key={selectedStep.id}
              step={selectedStep}
              inputs={stepInputs}
              outputs={stepOutputs}
              formulas={stepFormulas}
              bomComponents={bomComponents}
              bomCoProducts={bomCoProducts}
              catalogItemName={plan?.catalogItemName ?? ''}
              resourceTypes={resourceTypes}
              onSaveStep={handleSaveStep}
              onAddInput={handleAddInputToStep}
              onDeleteInput={handleDeleteInput}
              onAddOutput={handleAddOutput}
              onDeleteOutput={handleDeleteOutput}
              onSaveFormula={handleSaveFormula}
              onClose={() => setSelectedStep(null)}
              planStatus={plan?.status ?? 'draft'}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function RoutingPlanBuilder() {
  return <ReactFlowProvider><RoutingPlanBuilderInner /></ReactFlowProvider>;
}
