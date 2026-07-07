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
];

const SEGMENT_TYPES_BASE: { value: CodegenSegment['type']; label: string; entityOnly?: string[] }[] = [
  { value: 'fixed', label: 'Fixed text' },
  { value: 'date', label: 'Date' },
  { value: 'sequence', label: 'Running sequence' },
  { value: 'category_shortform', label: 'Category shortform', entityOnly: ['item'] },
  { value: 'group_shortform', label: 'Group shortform', entityOnly: ['item'] },
  { value: 'subgroup_shortform', label: 'Subgroup shortform', entityOnly: ['item'] },
];

function segmentTypesFor(entityType: string) {
  return SEGMENT_TYPES_BASE.filter(
    (t) => !t.entityOnly || t.entityOnly.includes(entityType),
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
      <PageHeader title="Code Generation" subtitle="Per-entity rules for auto-generating human-readable codes (items, resources, plants, stock locations, BOMs, routes)" />

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
