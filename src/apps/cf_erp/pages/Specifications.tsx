import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton,
  MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi, CfApiError } from '../api/client';
import type { DataType, Meta, Specification } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { DialogHeader } from '../components/FormDialog';

interface OptionDraft { id?: number; value: string; label: string; status?: 'active' | 'inactive' }

function SpecDialog({ open, onClose, onSaved, existing, meta, canManage }: {
  open: boolean; onClose: () => void; onSaved: () => void; existing: Specification | null; meta: Meta | null; canManage: boolean;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<DataType>('number');
  const [measurementType, setMeasurementType] = useState('');
  const [defaultUom, setDefaultUom] = useState('');
  const [decimals, setDecimals] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [newOption, setNewOption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNewOption('');
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setDataType(existing?.dataType ?? 'number');
    setMeasurementType(existing?.measurementType ?? '');
    setDefaultUom(existing?.defaultUom ?? '');
    setDecimals(existing?.decimals == null ? '' : String(existing.decimals));
    setDescription(existing?.description ?? '');
    setStatus(existing?.status ?? 'active');
    setOptions((existing?.options ?? []).map((o) => ({ id: o.id, value: o.value, label: o.label ?? '', status: o.status })));
  }, [open, existing]);

  const addOption = () => {
    const v = newOption.trim();
    if (!v || options.some((o) => o.value.toLowerCase() === v.toLowerCase())) return;
    setOptions((o) => [...o, { value: v, label: '' }]);
    setNewOption('');
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const common = { name, measurementType: measurementType || null, defaultUom: defaultUom || null, decimals: decimals === '' ? null : Number(decimals), description: description || null };
      if (existing) {
        // dataType goes with it: the field is editable until the spec has values,
        // and leaving it out made changing it silently do nothing.
        await cfApi.put(`/specifications/${existing.id}`, { ...common, dataType, status });
        // Options are edited one by one on an existing spec: stored values keep their option ids.
        for (const o of options.filter((x) => !x.id)) await cfApi.post(`/specifications/${existing.id}/options`, { value: o.value, label: o.label || null });
        for (const o of options.filter((x) => x.id)) {
          const before = existing.options?.find((b) => b.id === o.id);
          if (before && ((before.label ?? '') !== o.label || before.status !== o.status)) {
            await cfApi.put(`/spec-options/${o.id}`, { label: o.label || null, status: o.status });
          }
        }
      } else {
        await cfApi.post('/specifications', { ...common, code, dataType, options: dataType === 'option' ? options.map((o) => ({ value: o.value, label: o.label || null })) : undefined });
      }
      setBusy(false);
      onSaved();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="sm" fullWidth>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New specification'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <Typography sx={{ color: 'var(--c-text-2)', fontSize: 13, mb: 2 }}>
          Defined once, used everywhere. How its value is obtained is decided where it is attached, not here.
        </Typography>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Code" required={!existing} value={code} disabled={!!existing} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus={!existing}
            helperText={existing ? 'Permanent — formulas and coding rules refer to it' : 'Capital letters, digits, _ — e.g. THICKNESS'}
            inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus={!!existing} />
          <TextField select label="Data type" value={dataType} disabled={!!existing && existing.valueCount > 0}
            helperText={existing && existing.valueCount > 0 ? 'Fixed once values exist' : ' '} onChange={(e) => setDataType(e.target.value as DataType)}>
            {(meta?.dataTypes ?? ['number', 'text', 'boolean', 'date', 'option']).map((d) => <MenuItem key={d} value={d}>{d === 'option' ? 'Pick-list' : d[0].toUpperCase() + d.slice(1)}</MenuItem>)}
          </TextField>
          <TextField select label="Measures" value={measurementType} onChange={(e) => setMeasurementType(e.target.value)} helperText=" ">
            <MenuItem value="">—</MenuItem>
            {(meta?.measurementTypes ?? []).map((m) => <MenuItem key={m} value={m}>{m[0] + m.slice(1).toLowerCase()}</MenuItem>)}
          </TextField>
          {dataType === 'number' && (
            <>
              <TextField label="Unit" value={defaultUom} onChange={(e) => setDefaultUom(e.target.value)} helperText="Every value is stored in this unit" />
              <TextField label="Decimals shown" type="number" value={decimals} onChange={(e) => setDecimals(e.target.value)} inputProps={{ min: 0, max: 6 }} />
            </>
          )}
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          {existing && (
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')} helperText="Inactive keeps existing values but stops new use">
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          )}
        </Box>
        {dataType === 'option' && (
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontWeight: 500, mb: 0.5 }}>Options</Typography>
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mb: 1 }}>A rule can narrow this list for the items it covers.</Typography>
            <Box sx={{ display: 'grid', gap: 1 }}>
              {options.map((o, i) => (
                <Box key={o.id ?? `new-${o.value}`} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 1, alignItems: 'center' }}>
                  <TextField size="small" label="Value" value={o.value} disabled inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
                  <TextField size="small" label="Label (optional)" value={o.label} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  {o.id ? (
                    <TextField size="small" select value={o.status ?? 'active'} sx={{ width: 120 }} onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, status: e.target.value as 'active' | 'inactive' } : x)))}>
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="inactive">Retired</MenuItem>
                    </TextField>
                  ) : (
                    <IconButton aria-label={`Remove ${o.value}`} onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}><DeleteOutlineRounded /></IconButton>
                  )}
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField size="small" label="Add an option" value={newOption} onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }} />
                <Button onClick={addOption} startIcon={<AddRounded />}>Add</Button>
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{canManage ? 'Cancel' : 'Close'}</Button>
        {canManage && (
          <Button variant="contained" onClick={save} disabled={busy || !name.trim() || (!existing && !code.trim())} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save' : 'Create'}</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

const matches = (s: Specification, term: string) => !term || s.code.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
const TYPE_CHIPS: [string, string][] = [['', 'All'], ['number', 'Number'], ['text', 'Text'], ['option', 'Pick-list'], ['boolean', 'Yes / no'], ['date', 'Date']];

const COLUMNS: DataColumn<Specification>[] = [
  { key: 'code', header: 'Code', render: (s) => <Mono chip>{s.code}</Mono>, sortValue: (s) => s.code, alwaysVisible: true },
  {
    key: 'name', header: 'Name', sortValue: (s) => s.name,
    render: (s) => (
      <Box sx={{ py: 0.5 }}>
        <Box sx={{ fontWeight: 500 }}>{s.name}</Box>
        {s.dataType === 'option' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{(s.options ?? []).map((o) => o.value).join(' · ')}</Typography>}
      </Box>
    ),
  },
  { key: 'type', header: 'Type', render: (s) => (s.dataType === 'option' ? 'Pick-list' : s.dataType), sortValue: (s) => s.dataType },
  { key: 'unit', header: 'Unit', render: (s) => <Mono muted>{s.defaultUom ?? '—'}</Mono>, sortValue: (s) => s.defaultUom },
  { key: 'rules', header: 'Rules', numeric: true, render: (s) => s.ruleCount, sortValue: (s) => s.ruleCount },
  { key: 'values', header: 'Values', numeric: true, render: (s) => s.valueCount, sortValue: (s) => s.valueCount },
  { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} />, sortValue: (s) => s.status },
];

/** Collection / List (§4.2) — the specification library. */
export default function Specifications() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_setup_manage');
  const { data, error, loading, reload } = useLoad(() => cfApi.get<Specification[]>('/specifications'), []);
  const meta = useLoad(() => cfApi.get<Meta>('/meta'), []);
  const [type, setType] = useUrlParam('type', '');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; spec: Specification | null }>({ open: false, spec: null });
  const [toDelete, setToDelete] = useState<Specification | null>(null);
  useNewParam(() => { if (canManage) setDialog({ open: true, spec: null }); });
  const term = search.trim().toLowerCase();
  const base = useMemo(() => (data ?? []).filter((s) => matches(s, term)), [data, term]);
  const rows = useMemo(() => base.filter((s) => !type || s.dataType === type), [base, type]);
  const chips = TYPE_CHIPS.filter(([v]) => !v || base.some((s) => s.dataType === v));

  return (
    <Box>
      <PageHeader title="Specifications" subtitle="The library of characteristics — thickness, grade, weight. Each is defined once and attached by rules to classification nodes, definitions and items."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog({ open: true, spec: null })}>New specification</Button>} />
      <StatStrip stats={[
        { label: 'Shown', value: rows.length },
        { label: 'Unused', value: rows.filter((s) => s.ruleCount === 0).length, tone: 'warning', hint: 'No rule attaches them yet' },
        { label: 'Pick-lists', value: rows.filter((s) => s.dataType === 'option').length },
      ]} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code or name">
        {chips.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={type === v} count={base.filter((s) => !v || s.dataType === v).length} onClick={() => setType(v)} />)}
      </FilterBar>
      <ErrorNotice error={error} onRetry={reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(s) => s.id} loading={loading && !data} storageKey="specifications" exportName="specifications" defaultSortKey="code"
        onRowClick={(s) => setDialog({ open: true, spec: s })}
        rowActions={canManage ? (s) => (
          <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${s.code}`} onClick={() => setToDelete(s)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
        ) : undefined}
        empty={<EmptyState icon={<TuneRounded />} title={term || type ? 'Nothing matches' : 'No specifications yet'}
          hint={term || type ? 'Try another code, name or type.' : 'Add the characteristics your items and definitions are described by.'}
          action={!term && !type && canManage && <Button variant="contained" onClick={() => setDialog({ open: true, spec: null })}>New specification</Button>} />} />
      <SpecDialog open={dialog.open} existing={dialog.spec} meta={meta.data} canManage={canManage} onClose={() => setDialog({ open: false, spec: null })} onSaved={() => { toast.success('Specification saved.'); reload(); }} />
      <ConfirmDialog open={!!toDelete} title="Delete this specification?" entityName={toDelete ? `${toDelete.code} · ${toDelete.name}` : undefined} danger confirmLabel="Delete"
        body="Only a specification nothing uses can be deleted. One in use can be retired instead (status inactive)."
        onClose={() => setToDelete(null)} onConfirm={async () => { await cfApi.del(`/specifications/${toDelete?.id}`); toast.success('Deleted.'); reload(); }} />
    </Box>
  );
}
