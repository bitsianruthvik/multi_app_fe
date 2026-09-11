import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, IconButton, MenuItem, Stack,
  TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';

import { fabGet, fabPost } from '../api/client';
import type { CodegenSegment } from '../types';
import { usePermission } from '@core/hooks/usePermission';
import { Surface, PageHeader, Mono, EmptyState, ListSkeleton, useToast } from '../components';

const ENTITY_TYPES = [
  { value: 'item', label: 'Items' },
  { value: 'resource', label: 'Resources' },
  { value: 'plant', label: 'Plants' },
  { value: 'stock_location', label: 'Stock Locations' },
  { value: 'bom', label: 'BOMs' },
  { value: 'route', label: 'Routes' },
  { value: 'customer', label: 'Customers' },
  { value: 'supplier', label: 'Suppliers' },
  { value: 'operation', label: 'Operations' },
  { value: 'stock_piece', label: 'Stock pieces' },
  { value: 'sales_order', label: 'Sales orders' },
  { value: 'manufacturing_order', label: 'Production orders' },
  { value: 'purchase_order', label: 'Purchase orders' },
  { value: 'order_item', label: 'BOM rows on an order' },
  { value: 'blank', label: 'Blanks' },
  { value: 'task', label: 'Tasks' },
];

/**
 * Kinds whose code is READ OFF the thing — its place in the BOM, its size, its
 * step — rather than counted. They never burn a number, so a running sequence
 * has no meaning for them and is not offered.
 */
const DERIVED = ['order_item', 'blank', 'task'];

/** What each kind's example preview is built from, said plainly under the preview. */
const SAMPLE_NOTE: Record<string, string> = {
  order_item: 'Example: the 2nd Segment row under Line 1 (BOM code blank), the 6th Segment row in the whole order.',
  blank: 'Example: a 28 × 2995 × 12000 MS E350BO blank on SO-20260910-0066.',
  task: 'Example: step 5, operation SAW, on row …-SPAN1-L1-2.',
};

const BLANK_FIELDS = [
  { value: 'orderRef', label: 'Order number (digits)' },
  { value: 'material', label: 'Material' },
  { value: 'grade', label: 'Grade' },
  { value: 'thickness', label: 'Thickness' },
  { value: 'width', label: 'Width' },
  { value: 'length', label: 'Length' },
];

const SEGMENT_TYPES_BASE: {
  value: CodegenSegment['type']; label: string; entityOnly?: string[]; notFor?: string[];
}[] = [
  { value: 'fixed', label: 'Fixed text' },
  { value: 'date', label: 'Date' },
  { value: 'sequence', label: 'Running sequence', notFor: DERIVED },
  { value: 'category_shortform', label: 'Category shortform', entityOnly: ['item'] },
  { value: 'group_shortform', label: 'Group shortform', entityOnly: ['item'] },
  { value: 'subgroup_shortform', label: 'Subgroup shortform', entityOnly: ['item'] },
  { value: 'order_prefix', label: 'Customer + order number', entityOnly: ['order_item', 'blank'] },
  { value: 'parent_code', label: "Parent's code", entityOnly: ['order_item', 'task'] },
  { value: 'bom_code', label: 'Code from the BOM', entityOnly: ['order_item'] },
  { value: 'position', label: 'Position in the BOM', entityOnly: ['order_item'] },
  { value: 'attribute', label: 'Size / material', entityOnly: ['blank'] },
  { value: 'step_no', label: 'Step number', entityOnly: ['task'] },
  { value: 'operation_code', label: 'Operation code', entityOnly: ['task'] },
];

function segmentTypesFor(entityType: string) {
  return SEGMENT_TYPES_BASE.filter(
    (t) => (!t.entityOnly || t.entityOnly.includes(entityType)) && !t.notFor?.includes(entityType),
  );
}

const DATE_FORMATS = ['YYYY', 'YY', 'MM', 'DD', 'YYMM', 'YYYYMM', 'YYYYMMDD'];
const RESET_PERIODS: { value: 'never' | 'yearly' | 'monthly'; label: string }[] = [
  { value: 'never', label: 'Never reset' },
  { value: 'yearly', label: 'Reset yearly' },
  { value: 'monthly', label: 'Reset monthly' },
];

function blankSegment(type: CodegenSegment['type']): CodegenSegment {
  switch (type) {
    case 'fixed': return { type: 'fixed', value: '' };
    case 'free_text': return { type: 'free_text', value: '' };
    case 'date': return { type: 'date', format: 'YYYY' };
    case 'category_shortform': return { type: 'category_shortform', length: 3 };
    case 'group_shortform': return { type: 'group_shortform', length: 3 };
    case 'subgroup_shortform': return { type: 'subgroup_shortform', length: 3 };
    case 'sequence': return { type: 'sequence', digits: 4, resetPeriod: 'never' };
    case 'attribute': return { type: 'attribute', field: 'thickness' };
    case 'order_prefix': return { type: 'order_prefix' };
    case 'parent_code': return { type: 'parent_code', separator: '-', topLevel: 'order_prefix' };
    case 'bom_code': return { type: 'bom_code' };
    case 'position': return { type: 'position', digits: 1, restart: 'parent' };
    case 'step_no': return { type: 'step_no', digits: 2 };
    case 'operation_code': return { type: 'operation_code' };
  }
}

function SegmentRow({ segment, entityType, onChange, onRemove, onMove, isFirst, isLast }: {
  segment: CodegenSegment; entityType: string; onChange: (s: CodegenSegment) => void; onRemove: () => void;
  onMove: (dir: -1 | 1) => void; isFirst: boolean; isLast: boolean;
}) {
  const availableTypes = segmentTypesFor(entityType);

  const lengthField = (s: { length: number }) => (
    <TextField size="small" type="number" label="Length" value={s.length} sx={{ width: 100 }}
      onChange={(e) => onChange({ ...segment, length: Math.max(1, Number(e.target.value) || 1) } as CodegenSegment)} />
  );

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
      <TextField select size="small" label="Segment" value={segment.type} sx={{ minWidth: 190 }}
        onChange={(e) => onChange(blankSegment(e.target.value as CodegenSegment['type']))}>
        {availableTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>

      {segment.type === 'fixed' && (
        <TextField size="small" label="Text" value={segment.value} sx={{ flex: 1 }}
          onChange={(e) => onChange({ ...segment, value: e.target.value })} />
      )}
      {segment.type === 'date' && (
        <TextField select size="small" label="Format" value={segment.format} sx={{ minWidth: 140 }}
          onChange={(e) => onChange({ type: 'date', format: e.target.value as typeof segment.format })}>
          {DATE_FORMATS.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
        </TextField>
      )}
      {segment.type === 'category_shortform' && lengthField(segment)}
      {segment.type === 'group_shortform' && lengthField(segment)}
      {segment.type === 'subgroup_shortform' && lengthField(segment)}
      {segment.type === 'sequence' && (<>
        <TextField size="small" type="number" label="Digits" value={segment.digits} sx={{ width: 100 }}
          onChange={(e) => onChange({ ...segment, digits: Math.max(1, Number(e.target.value) || 1) })} />
        <TextField select size="small" label="Reset" value={segment.resetPeriod} sx={{ minWidth: 150 }}
          onChange={(e) => onChange({ ...segment, resetPeriod: e.target.value as 'never' | 'yearly' | 'monthly' })}>
          {RESET_PERIODS.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
      </>)}
      {segment.type === 'parent_code' && (<>
        <TextField size="small" label="Then" value={segment.separator} sx={{ width: 80 }}
          onChange={(e) => onChange({ ...segment, separator: e.target.value })} />
        <TextField select size="small" label="Top row has no parent — use" value={segment.topLevel} sx={{ minWidth: 230 }}
          onChange={(e) => onChange({ ...segment, topLevel: e.target.value as 'order_prefix' | 'none' })}>
          <MenuItem value="order_prefix">Customer + order number</MenuItem>
          <MenuItem value="none">Nothing</MenuItem>
        </TextField>
      </>)}
      {segment.type === 'position' && (<>
        <TextField select size="small" label="Numbering" value={segment.restart} sx={{ minWidth: 250 }}
          onChange={(e) => onChange({ ...segment, restart: e.target.value as 'parent' | 'above' })}>
          <MenuItem value="parent">Starts at 1 under each parent</MenuItem>
          <MenuItem value="above">Carries on from the rows above</MenuItem>
        </TextField>
        <TextField size="small" type="number" label="Digits" value={segment.digits} sx={{ width: 90 }}
          onChange={(e) => onChange({ ...segment, digits: Math.max(1, Number(e.target.value) || 1) })} />
      </>)}
      {segment.type === 'step_no' && (
        <TextField size="small" type="number" label="Digits" value={segment.digits} sx={{ width: 90 }}
          onChange={(e) => onChange({ ...segment, digits: Math.max(1, Number(e.target.value) || 1) })} />
      )}
      {segment.type === 'attribute' && (
        <TextField select size="small" label="Value" value={segment.field} sx={{ minWidth: 200 }}
          onChange={(e) => onChange({ ...segment, field: e.target.value })}>
          {BLANK_FIELDS.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
        </TextField>
      )}

      <Box sx={{ flex: 1 }} />
      <Tooltip title="Move up"><span><IconButton size="small" disabled={isFirst} onClick={() => onMove(-1)}><ArrowUpwardRounded fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><span><IconButton size="small" disabled={isLast} onClick={() => onMove(1)}><ArrowDownwardRounded fontSize="small" /></IconButton></span></Tooltip>
      <Tooltip title="Remove"><IconButton size="small" color="error" onClick={onRemove}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
    </Stack>
  );
}

export default function CodegenSettings() {
  const canManage = usePermission('fab_erp_items_meta_manage');
  const { toast } = useToast();

  const [entityType, setEntityType] = useState('item');
  const [segments, setSegments] = useState<CodegenSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');

  const load = useCallback(async (type: string) => {
    setLoading(true); setError('');
    try {
      const rule = await fabGet<{ segments: CodegenSegment[] }>('codegen-rules', { entityType: type });
      setSegments(rule.segments ?? []);
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Failed to load rule');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(entityType); }, [entityType, load]);

  useEffect(() => {
    if (segments.length === 0) { setPreview(''); setPreviewError(''); return; }
    const handle = setTimeout(() => {
      fabPost<{ code: string }>('codegen/preview', { entityType, segments, context: { categoryId: null } })
        .then((res) => { setPreview(res.code); setPreviewError(''); })
        .catch((e) => {
          const ax = e as { response?: { data?: { message?: string } }; message?: string };
          setPreviewError(ax.response?.data?.message ?? ax.message ?? 'Preview failed');
        });
    }, 300);
    return () => clearTimeout(handle);
  }, [entityType, segments]);

  function updateSegment(i: number, s: CodegenSegment) {
    setSegments((arr) => arr.map((seg, j) => (j === i ? s : seg)));
  }
  function removeSegment(i: number) {
    setSegments((arr) => arr.filter((_, j) => j !== i));
  }
  function moveSegment(i: number, dir: -1 | 1) {
    setSegments((arr) => {
      const next = [...arr];
      const j = i + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addSegment() {
    setSegments((arr) => [...arr, blankSegment('fixed')]);
  }

  async function save() {
    setSaving(true); setError('');
    try {
      await fabPost('codegen-rules', { entityType, segments });
      toast('Code generation rule saved');
    } catch (e) {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      setError(ax.response?.data?.message ?? ax.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <PageHeader title="Code Generation" subtitle="One rule for every code in the system — items, orders, BOM rows, blanks and tasks" />

      <TextField select size="small" label="Entity" value={entityType} sx={{ minWidth: 220, mb: 2 }}
        onChange={(e) => setEntityType(e.target.value)}>
        {ENTITY_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? <ListSkeleton rows={3} /> : (
        <Surface e={1} sx={{ p: 2.5 }}>
          {segments.length === 0 ? (
            <EmptyState icon={<TuneRounded />} title="No segments yet" hint="Add a segment to start building the code pattern." />
          ) : (
            <Stack spacing={1.25} sx={{ mb: 2 }}>
              {segments.map((seg, i) => (
                <SegmentRow
                  key={i} segment={seg} entityType={entityType}
                  onChange={(s) => updateSegment(i, s)}
                  onRemove={() => removeSegment(i)}
                  onMove={(dir) => moveSegment(i, dir)}
                  isFirst={i === 0} isLast={i === segments.length - 1}
                />
              ))}
            </Stack>
          )}

          {canManage && (
            <Button startIcon={<AddIcon />} onClick={addSegment} sx={{ mb: 2 }}>Add segment</Button>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)' }}>
            <Typography variant="body2" color="text.secondary">Preview:</Typography>
            {previewError ? <Alert severity="warning" sx={{ flex: 1 }}>{previewError}</Alert> : <Mono chip>{preview || '—'}</Mono>}
          </Box>
          {SAMPLE_NOTE[entityType] && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>{SAMPLE_NOTE[entityType]}</Typography>
          )}

          {canManage && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button variant="contained" onClick={save} disabled={saving}>
                {saving ? <CircularProgress size={16} color="inherit" /> : 'Save rule'}
              </Button>
            </Box>
          )}
        </Surface>
      )}
    </Box>
  );
}
