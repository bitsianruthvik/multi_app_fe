/**
 * ProgressTemplates.tsx — Phase 2 config screen for the Project Progress view.
 * Master-detail: list of progress templates → select one → edit its header
 * (name / code / finished-good category match / active) and its ordered stages
 * (ProgressStagesSheet). Mirrors OperationFlows.tsx. All CRUD via the generic
 * query/mutate API on fabErpProgressTemplate / Stage / StageOp.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  IconButton, MenuItem, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import StackedBarChartRounded from '@mui/icons-material/StackedBarChartRounded';

import { fabQuery, fabMutate } from '../api/client';
import {
  PageHeader, Surface, StatusBadge, Mono, EmptyState, ListSkeleton, useToast,
  DataTable, ConfirmDialog,
} from '../components';
import ProgressStagesSheet from '../components/ProgressStagesSheet';
import type { FabOperation, FabItemCategory } from '../types';
import { DialogCloseButton } from '../components/FormDialog';

interface QueryResult<T> { data: T[] }
interface FabProgressTemplate {
  id: number; companyId: number; name: string; code: string | null;
  matchItemCategoryId: number | null; matchCategoryName: string | null; active: number;
}

function errMsg(e: unknown): string {
  const ax = e as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return ax.response?.data?.message ?? ax.response?.data?.error ?? ax.message ?? 'Something went wrong.';
}

// ── Create / edit template dialog ────────────────────────────────────────────
function TemplateDialog({ open, initial, categories, onClose, onSaved }: {
  open: boolean;
  initial: FabProgressTemplate | null;
  categories: FabItemCategory[];
  onClose: () => void;
  onSaved: (id?: number) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '');
      setCode(initial?.code ?? '');
      setCategoryId(initial?.matchItemCategoryId ?? '');
      setActive(initial ? initial.active === 1 : true);
      setErr('');
    }
  }, [open, initial]);

  async function save() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        match_item_category_id: categoryId === '' ? null : Number(categoryId),
        active: active ? 1 : 0,
      };
      if (initial) {
        await fabMutate('fabErpProgressTemplate', 'update', { id: initial.id, ...payload });
        onSaved(initial.id);
      } else {
        const res = await fabMutate<{ id: number }>('fabErpProgressTemplate', 'insert', payload);
        onSaved(res?.id);
      }
    } catch (e) { setErr(errMsg(e)); } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogCloseButton absolute onClose={() => onClose()} disabled={saving} />
      <DialogTitle>{initial ? 'Edit template' : 'New progress template'}</DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
        <TextField label="Name" fullWidth size="small" value={name} onChange={(e) => setName(e.target.value)} sx={{ mb: 2, mt: 1 }} />
        <TextField label="Code (optional)" fullWidth size="small" value={code} onChange={(e) => setCode(e.target.value)} sx={{ mb: 2 }} />
        <TextField
          select label="Auto-match finished-good category (optional)" fullWidth size="small"
          value={categoryId} onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
          helperText="Orders whose top-level finished good is in this category use this template automatically (a manual per-order override still wins)."
          sx={{ mb: 2 }}
        >
          <MenuItem value="">— none —</MenuItem>
          {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>
        <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} variant="contained" disabled={saving}>{initial ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ProgressTemplates() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<FabProgressTemplate[]>([]);
  const [categories, setCategories] = useState<FabItemCategory[]>([]);
  const [operations, setOperations] = useState<FabOperation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState<{ open: boolean; template: FabProgressTemplate | null }>({ open: false, template: null });
  const [delTarget, setDelTarget] = useState<FabProgressTemplate | null>(null);

  const fetchTemplates = useCallback(async (selectId?: number) => {
    setLoading(true); setError('');
    try {
      const res = await fabQuery<QueryResult<FabProgressTemplate>>('fabErpProgressTemplate', {
        orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 },
      });
      const list = res.data ?? [];
      setTemplates(list);
      if (selectId !== undefined) setSelectedId(list.some((t) => t.id === selectId) ? selectId : null);
    } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, []);

  const fetchLookups = useCallback(async () => {
    try {
      const [cat, ops] = await Promise.all([
        fabQuery<QueryResult<FabItemCategory>>('fabErpItemCategory', { orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
        fabQuery<QueryResult<FabOperation>>('fabErpOperation', { filters: { active: 1 }, orderBy: [{ field: 'name', direction: 'asc' }], pagination: { limit: 500 } }),
      ]);
      setCategories(cat.data ?? []);
      setOperations(ops.data ?? []);
    } catch (e) { setError(errMsg(e)); }
  }, []);

  useEffect(() => { fetchTemplates(); fetchLookups(); }, [fetchTemplates, fetchLookups]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  // Deliberately does NOT catch: ConfirmDialog surfaces the backend message
  // in-dialog and keeps itself open on failure. Swallowing the error here
  // would close the dialog and leave the user thinking the delete worked.
  async function handleDelete() {
    if (!delTarget) return;
    await fabMutate('fabErpProgressTemplate', 'delete', { id: delTarget.id });
    if (selectedId === delTarget.id) setSelectedId(null);
    setDelTarget(null);
    fetchTemplates();
    toast('Template deleted');
  }

  const newBtn = (
    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlg({ open: true, template: null })}>New template</Button>
  );

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <PageHeader
        title="Progress Templates"
        subtitle="Report stages that club operations — power the per-stage bars on the Task Engine › Progress view."
        actions={selected ? undefined : newBtn}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? <ListSkeleton rows={5} /> : !selected ? (
        templates.length === 0 ? (
          <EmptyState icon={<StackedBarChartRounded />} title="No progress templates yet" hint='Click "New template" to define reporting stages.' action={newBtn} />
        ) : (
          <DataTable
            rows={templates}
            getRowId={(t) => t.id}
            onRowClick={(t) => setSelectedId(t.id)}
            storageKey="progress-templates"
            exportName="progress-templates"
            defaultSortKey="name"
            columns={[
              { key: 'code', header: 'Code', width: 130, render: (t) => (t.code ? <Mono chip>{t.code}</Mono> : '—'), sortValue: (t) => t.code ?? '' },
              { key: 'name', header: 'Name', render: (t) => <Box sx={{ fontWeight: 500 }}>{t.name}</Box>, sortValue: (t) => t.name },
              {
                key: 'matchCategoryName',
                header: 'Auto-match category',
                render: (t) => (
                  <Box sx={{ color: t.matchCategoryName ? 'var(--c-text)' : 'var(--c-text-3)' }}>
                    {t.matchCategoryName ?? '—'}
                  </Box>
                ),
                sortValue: (t) => t.matchCategoryName ?? '',
              },
              {
                key: 'active',
                header: 'Status',
                width: 120,
                render: (t) => <StatusBadge status={t.active ? 'Active' : 'Inactive'} family={t.active ? 'success' : 'neutral'} />,
                sortValue: (t) => (t.active ? 1 : 0),
                exportValue: (t) => (t.active ? 'Active' : 'Inactive'),
              },
            ]}
            rowActions={(t) => (
              <>
                <Tooltip title="Edit">
                  <IconButton size="small" onClick={() => setDlg({ open: true, template: t })} aria-label={`Edit ${t.name}`}>
                    <EditRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton size="small" color="error" onClick={() => setDelTarget(t)} aria-label={`Delete ${t.name}`}>
                    <DeleteOutlineRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          />
        )
      ) : (
        <>
          <Button size="small" startIcon={<ArrowBackRounded />} onClick={() => setSelectedId(null)} sx={{ mb: 1.5 }}>Back to templates</Button>
          <Surface e={2} sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 17, fontWeight: 600 }}>{selected.name}</Typography>
                {selected.code && <Mono chip>{selected.code}</Mono>}
                <StatusBadge status={selected.active ? 'Active' : 'Inactive'} family={selected.active ? 'success' : 'neutral'} />
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>
                Auto-matches: {selected.matchCategoryName ?? 'no category (manual assignment only)'}
              </Typography>
            </Box>
            <Button size="small" variant="outlined" startIcon={<EditRounded fontSize="small" />} onClick={() => setDlg({ open: true, template: selected })}>Edit header</Button>
          </Surface>

          <Surface e={1} sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 1.5, color: 'var(--c-text-2)' }}>Stages</Typography>
            <ProgressStagesSheet templateId={selected.id} operations={operations} />
          </Surface>
        </>
      )}

      <TemplateDialog
        open={dlg.open} initial={dlg.template} categories={categories}
        onClose={() => setDlg({ open: false, template: null })}
        onSaved={(id) => { setDlg({ open: false, template: null }); toast('Template saved'); fetchTemplates(id); }}
      />

      <ConfirmDialog
        open={!!delTarget}
        title="Delete template"
        entityName={delTarget?.name}
        body="Its stages go with it. Orders keep their tasks — they just lose this reporting view."
        onClose={() => setDelTarget(null)}
        onConfirm={handleDelete}
      />
    </Box>
  );
}
