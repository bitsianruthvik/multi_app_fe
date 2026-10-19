/**
 * Payroll › Structures (CF_HRMS_HIRING_SPEC.md §25.2) — how a CTC is split into
 * components. Each structure is a list of lines, one formula each; a salary
 * names its structure. Opening one opens its formula editor with a live preview.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MenuItem, Stack, TextField, Typography } from '@mui/material';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import {
  DataTable, EmptyState, ErrorNotice, FormDialog, ListSkeleton, Mono, PageHeader, StatusBadge, useToast, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type PayStructure } from '../api/payroll';
import { ListToolbar } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';

export default function PayStructures() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const toast = useToast();
  const filters = useListFilters([]);
  const [rows, setRows] = useState<PayStructure[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState<{ code: string; name: string; copyOf: string } | null>(null);

  const load = useCallback(() => {
    payrollApi.structures().then((r) => { setRows(r.structures); setError(null); }).catch(setError);
  }, []);
  useEffect(load, [load]);

  const q = filters.q.trim().toLowerCase();
  const shown = useMemo(() => (rows ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)), [rows, q]);
  const open = (s: PayStructure) => navigate(`/${company}/cf_hrms/pay-structures/${s.id}`);

  const columns: DataColumn<PayStructure>[] = useMemo(() => [
    {
      key: 'name', header: 'Structure', alwaysVisible: true,
      render: (s) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{s.name}</Typography>
          {s.description && <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', maxWidth: 520 }} noWrap title={s.description}>{s.description}</Typography>}
        </Stack>
      ),
      sortValue: (s) => s.name,
    },
    { key: 'code', header: 'Code', render: (s) => <Mono sx={{ fontSize: 12.5 }}>{s.code}</Mono>, sortValue: (s) => s.code },
    { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} />, sortValue: (s) => s.status },
    { key: 'lines', header: 'Lines', numeric: true, render: (s) => s.lines.length, sortValue: (s) => s.lines.length },
    { key: 'people', header: 'People on it today', numeric: true, render: (s) => s.peopleCount ?? 0, sortValue: (s) => s.peopleCount ?? 0 },
  ], []);

  return (
    <>
      <PageHeader title="Salary structures" subtitle="How a CTC is split into components" />
      <ListToolbar
        filters={filters}
        shown={shown.length}
        total={rows?.length}
        noun={['structure', 'structures']}
        searchPlaceholder="Search by name or code"
        add={can.payroll.edit ? { label: 'New structure', onClick: () => setCreating({ code: '', name: '', copyOf: '' }) } : undefined}
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {!rows && !error ? <ListSkeleton rows={5} /> : (
        <DataTable
          rows={shown}
          columns={columns}
          getRowId={(s) => s.id}
          onRowClick={open}
          storageKey="cf_hrms.pay-structures"
          exportName="salary-structures"
          empty={
            <EmptyState
              icon={<AccountTreeOutlined />}
              title={filters.isFiltered ? 'No structure matches' : 'No salary structures yet'}
              hint="Set up payroll to get the sample “Staff standard”, or add one."
            />
          }
        />
      )}

      <FormDialog
        open={!!creating}
        title="New salary structure"
        onClose={() => setCreating(null)}
        submitLabel="Create"
        submitDisabled={!creating?.code.trim() || !creating?.name.trim()}
        onSubmit={async () => {
          if (!creating) return;
          const r = await payrollApi.createStructure({
            code: creating.code.trim().toUpperCase(), name: creating.name.trim(),
            ...(creating.copyOf ? { copyOf: Number(creating.copyOf) } : { lines: [] }),
          });
          toast.success('Structure created. Add its lines.');
          navigate(`/${company}/cf_hrms/pay-structures/${r.structure.id}`);
        }}
      >
        {creating && (
          <Stack spacing={1.5}>
            <TextField size="small" label="Code" required value={creating.code}
              onChange={(e) => setCreating({ ...creating, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
              helperText="Capital letters, digits and _: STAFF_STD." inputProps={{ maxLength: 30 }} />
            <TextField size="small" label="Name" required value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} inputProps={{ maxLength: 120 }} />
            <TextField select size="small" label="Copy the lines of" value={creating.copyOf} onChange={(e) => setCreating({ ...creating, copyOf: e.target.value })}
              SelectProps={{ displayEmpty: true }} slotProps={{ inputLabel: { shrink: true } }}>
              <MenuItem value="">Nothing — start empty</MenuItem>
              {(rows ?? []).map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
            </TextField>
          </Stack>
        )}
      </FormDialog>
    </>
  );
}
