import { useState } from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi } from '../api/client';
import type { Formula, FormulaKind } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { FormulaDialog } from '../components/FormulaDialog';

const KIND_LABEL: Record<FormulaKind, string> = { value: 'Value', rollup: 'Roll-up', timing: 'Timing' };
const KIND_HELP: Record<FormulaKind, string> = {
  value: 'Reads the same record’s values — for calculated rules.',
  rollup: 'Adds up BOM children — for roll-up rules.',
  timing: 'Reads the item being worked on and the machine doing it — for operation times.',
};

const usedByText = (f: Formula) => [f.ruleCount ? `${f.ruleCount} spec` : null, f.timingRuleCount ? `${f.timingRuleCount} timing` : null].filter(Boolean).join(' · ') || '—';
const matches = (f: Formula, term: string) => !term || [f.code, f.name, f.expression].some((v) => v?.toLowerCase().includes(term));

const COLUMNS: DataColumn<Formula>[] = [
  { key: 'code', header: 'Code', render: (f) => <Mono chip>{f.code}</Mono>, sortValue: (f) => f.code, alwaysVisible: true },
  { key: 'name', header: 'Name', render: (f) => <Box sx={{ fontWeight: 500 }}>{f.name}</Box>, sortValue: (f) => f.name },
  { key: 'expression', header: 'Expression', render: (f) => <Box sx={{ whiteSpace: 'normal', minWidth: 200 }}><Mono muted>{f.expression}</Mono></Box>, sortValue: (f) => f.expression },
  { key: 'kind', header: 'Kind', sortValue: (f) => f.kind, exportValue: (f) => (f.kind ? KIND_LABEL[f.kind] : ''), render: (f) => f.kind && <Tooltip title={KIND_HELP[f.kind]}><Box component="span">{KIND_LABEL[f.kind]}</Box></Tooltip> },
  { key: 'version', header: 'Version', numeric: true, render: (f) => `v${f.version}`, sortValue: (f) => f.version },
  { key: 'used', header: 'Used by', render: (f) => <Mono muted={usedByText(f) === '—'}>{usedByText(f)}</Mono>, sortValue: (f) => (f.ruleCount ?? 0) + (f.timingRuleCount ?? 0), exportValue: usedByText },
  { key: 'status', header: 'Status', render: (f) => <StatusBadge status={f.status} />, sortValue: (f) => f.status },
];

/** Collection / List (§4.2) — reusable formulas for calculated values, roll-ups and operation times. */
export default function Formulas() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_setup_manage');
  const { data, error, loading, reload } = useLoad(() => cfApi.get<Formula[]>('/formulas'), []);
  const [kind, setKind] = useUrlParam('kind', '');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; formula: Formula | null }>({ open: false, formula: null });
  const [toDelete, setToDelete] = useState<Formula | null>(null);
  useNewParam(() => { if (canManage) setDialog({ open: true, formula: null }); });
  const term = search.trim().toLowerCase();
  const base = (data ?? []).filter((f) => matches(f, term));
  const rows = base.filter((f) => !kind || f.kind === kind);
  // The figures describe the rows in the table beneath them, kind chip included.
  const stats = [
    { label: 'Shown', value: rows.length },
    { label: 'In use', value: rows.filter((f) => (f.ruleCount ?? 0) + (f.timingRuleCount ?? 0) > 0).length, tone: 'success' as const },
    { label: 'Unused', value: rows.filter((f) => !f.ruleCount && !f.timingRuleCount).length, hint: 'No rule uses it yet' },
  ];

  return (
    <Box>
      <PageHeader title="Formulas" subtitle="Reusable expressions: calculated values (weight from length × width × thickness × density), roll-ups, and operation times (cut length at the machine’s speed). Changing one recalculates every item that uses it."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog({ open: true, formula: null })}>New formula</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or expression">
        {([['', 'All'], ['value', 'Value'], ['rollup', 'Roll-up'], ['timing', 'Timing']] as const).map(([v, label]) => (
          <FacetChip key={v || 'all'} label={label} active={kind === v} count={base.filter((f) => !v || f.kind === v).length} onClick={() => setKind(v)} />
        ))}
      </FilterBar>
      <ErrorNotice error={error} onRetry={reload} />
      <DataTable rows={rows} columns={COLUMNS} getRowId={(f) => f.id} loading={loading && !data} storageKey="formulas" exportName="formulas" defaultSortKey="code"
        onRowClick={(f) => setDialog({ open: true, formula: f })}
        rowActions={canManage ? (f) => (
          <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${f.code}`} onClick={() => setToDelete(f)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
        ) : undefined}
        empty={<EmptyState icon={<FunctionsRounded />} title={term || kind ? 'No formula matches' : 'No formulas yet'}
          hint={term || kind ? 'Clear the search or pick another kind.' : 'Add one, then use it in a Calculated rule on a classification node or definition.'}
          action={!term && !kind && canManage && <Button variant="contained" onClick={() => setDialog({ open: true, formula: null })}>New formula</Button>} />} />
      <FormulaDialog open={dialog.open} existing={dialog.formula} canManage={canManage} onClose={() => setDialog({ open: false, formula: null })} onSaved={() => { toast.success('Formula saved.'); reload(); }} />
      <ConfirmDialog open={!!toDelete} title="Delete this formula?" entityName={toDelete ? `${toDelete.code} · ${toDelete.name}` : undefined} danger confirmLabel="Delete"
        body="Refused while a rule uses it — retire it instead." onClose={() => setToDelete(null)}
        onConfirm={async () => { await cfApi.del(`/formulas/${toDelete?.id}`); toast.success('Deleted.'); reload(); }} />
    </Box>
  );
}
