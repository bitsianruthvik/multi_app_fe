import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, IconButton,
  MenuItem, TextField, Tooltip, Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import FunctionsRounded from '@mui/icons-material/FunctionsRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { cfApi, CfApiError } from '../api/client';
import type { Formula, FormulaCheck, FormulaKind } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge, Surface } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';
import { DialogHeader } from '../components/FormDialog';

const KIND_LABEL: Record<FormulaKind, string> = { value: 'Value', rollup: 'Roll-up', timing: 'Timing' };
const KIND_HELP: Record<FormulaKind, string> = {
  value: 'Reads the same record’s values — for calculated rules.',
  rollup: 'Adds up BOM children — for roll-up rules.',
  timing: 'Reads the item being worked on and the machine doing it — for operation times.',
};

function FormulaDialog({ open, onClose, onSaved, existing }: { open: boolean; onClose: () => void; onSaved: () => void; existing: Formula | null }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [sample, setSample] = useState<Record<string, string>>({});
  const [check, setCheck] = useState<FormulaCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCheck(null);
    setSample({});
    setCode(existing?.code ?? '');
    setName(existing?.name ?? '');
    setExpression(existing?.expression ?? '');
    setDescription(existing?.description ?? '');
    setStatus(existing?.status ?? 'active');
  }, [open, existing]);

  // Checked as you type (debounced): parse errors, unknown names, and a sample result.
  useEffect(() => {
    if (!open || !expression.trim()) { setCheck(null); return undefined; }
    const t = window.setTimeout(() => {
      cfApi.post<FormulaCheck>('/formulas/check', { expression, sample }).then(setCheck).catch(() => setCheck(null));
    }, 300);
    return () => window.clearTimeout(t);
  }, [expression, sample, open]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (existing) await cfApi.put(`/formulas/${existing.id}`, { name, expression, description: description || null, status });
      else await cfApi.post('/formulas', { code, name, expression, description: description || null });
      setBusy(false);
      onSaved();
      onClose();
    } catch (e) {
      setBusy(false);
      setError(e as CfApiError);
    }
  };

  const result = check?.result;
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="md" fullWidth>
      <DialogHeader title={<>{existing ? `Edit ${existing.code}` : 'New formula'}</>} onClose={onClose} busy={busy} />
      <DialogContent>
        <ErrorNotice error={error} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 2fr)' }, gap: 2, mt: 1 }}>
          <TextField label="Code" value={code} disabled={!!existing} onChange={(e) => setCode(e.target.value.toUpperCase())} inputProps={{ style: { fontFamily: 'var(--font-mono)' } }}
            helperText={existing ? `Version ${existing.version} — changing the expression makes version ${existing.version + 1}` : 'e.g. PLATE_WEIGHT'} />
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Expression" value={expression} onChange={(e) => setExpression(e.target.value)} multiline minRows={2} sx={{ gridColumn: '1 / -1' }}
            inputProps={{ style: { fontFamily: 'var(--font-mono)', fontSize: 14 } }}
            helperText="Specification codes, numbers, + − × ÷ % ^, MIN, MAX, ROUND(x, n), ABS, SQRT, CEIL, FLOOR, IF(a > b, x, y). Roll-ups: SUM(children.WEIGHT). Operation times: item.CUT_LENGTH / machine.CUTTING_SPEED." />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          {existing && (
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          )}
        </Box>
        {check && (
          <Box sx={{ mt: 2 }}>
            {check.problems.length > 0 ? (
              <Alert severity="warning" sx={{ borderRadius: 'var(--r-sm)' }}>{check.problems.map((p) => <Box key={p}>{p}</Box>)}</Alert>
            ) : check.usesRollup ? (
              <Alert severity="info" sx={{ borderRadius: 'var(--r-sm)' }}>A roll-up — it reads {check.rollupTerms?.join(', ')} from BOM children and is evaluated once BOMs exist.</Alert>
            ) : (
              <Surface sx={{ p: 2, background: 'var(--c-surface-2)' }}>
                <Typography sx={{ fontWeight: 500, mb: 1 }}>Try it{check.kind === 'timing' ? ' — minutes, from a sample item and machine' : ''}</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[...check.references, ...(check.itemRefs ?? []).map((c) => `item.${c}`), ...(check.machineRefs ?? []).map((c) => `machine.${c}`)].map((r) => (
                    <TextField key={r} size="small" label={r} type="number" value={sample[r] ?? ''} sx={{ width: 150 }}
                      onChange={(e) => setSample((s) => ({ ...s, [r]: e.target.value }))} inputProps={{ step: 'any', style: { fontFamily: 'var(--font-mono)' } }} />
                  ))}
                  <Typography sx={{ ml: 1 }}>=</Typography>
                  <Mono sx={{ fontSize: 16, color: 'var(--c-text)' }}>
                    {result?.value != null ? result.value : result?.missing ? `needs ${result.missing.join(', ')}` : result?.error ?? '—'}
                  </Mono>
                </Box>
              </Surface>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}>{busy ? 'Saving…' : existing ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

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
  const stats = [
    { label: 'Formulas', value: base.length },
    { label: 'In use', value: base.filter((f) => (f.ruleCount ?? 0) + (f.timingRuleCount ?? 0) > 0).length, tone: 'success' as const },
    { label: 'Unused', value: base.filter((f) => !f.ruleCount && !f.timingRuleCount).length, hint: 'No rule uses it yet' },
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
      <FormulaDialog open={dialog.open} existing={dialog.formula} onClose={() => setDialog({ open: false, formula: null })} onSaved={() => { toast.success('Formula saved.'); reload(); }} />
      <ConfirmDialog open={!!toDelete} title="Delete this formula?" entityName={toDelete ? `${toDelete.code} · ${toDelete.name}` : undefined} danger confirmLabel="Delete"
        body="Refused while a rule uses it — retire it instead." onClose={() => setToDelete(null)}
        onConfirm={async () => { await cfApi.del(`/formulas/${toDelete?.id}`); toast.success('Deleted.'); reload(); }} />
    </Box>
  );
}
