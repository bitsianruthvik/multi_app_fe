import { useMemo, useState } from 'react';
import {
  Box, Button, IconButton, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import TuneRounded from '@mui/icons-material/TuneRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi } from '../api/client';
import type { Meta, Specification } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { SpecDialog } from '../components/SpecDialog';
import { TYPE_LABEL } from '../lib/specTypes';


const matches = (s: Specification, term: string) => !term || s.code.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
const TYPE_CHIPS: [string, string][] = [['', 'All'], ['number', 'Number'], ['text', 'Text'], ['option', 'Pick-list'], ['boolean', 'Yes / no'], ['date', 'Date'], ['table', 'Table']];

const COLUMNS: DataColumn<Specification>[] = [
  { key: 'code', header: 'Code', render: (s) => <Mono chip>{s.code}</Mono>, sortValue: (s) => s.code, alwaysVisible: true },
  {
    key: 'name', header: 'Name', sortValue: (s) => s.name,
    render: (s) => (
      <Box sx={{ py: 0.5 }}>
        <Box sx={{ fontWeight: 500 }}>{s.name}</Box>
        {s.dataType === 'option' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{(s.options ?? []).map((o) => o.value).join(' · ')}</Typography>}
        {s.dataType === 'table' && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', whiteSpace: 'normal' }}>{(s.tableConfig?.axes ?? []).map((a) => a.label).join(' × ')}</Typography>}
      </Box>
    ),
  },
  { key: 'type', header: 'Type', render: (s) => (TYPE_LABEL[s.dataType] ?? s.dataType), sortValue: (s) => s.dataType },
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
