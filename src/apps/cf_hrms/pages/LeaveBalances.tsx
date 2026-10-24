/**
 * Time and leave › Leave balances (CF_HRMS_HIRING_SPEC.md §22.2, §22.6) — every
 * person × every leave type, for one leave year.
 *
 * A balance = what the policy gives + an opening balance HR may enter. Each
 * cell shows what is available; hovering gives the server's "why". HR (leave
 * edit) clicks a cell to set that person's opening for the year, with a note —
 * or does many at once by Excel (`leave-balances`: Employee code · Name · one
 * Opening column per leave type, for the chosen year).
 *
 * Nothing is computed here: every number is the server's
 * (`services/leave/balance.js`).
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Box, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AccountBalanceWalletOutlined from '@mui/icons-material/AccountBalanceWalletOutlined';
import {
  DataTable, EmptyState, ErrorNotice, FormDialog, ListSkeleton, Mono, PageHeader, useToast, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { orgApi, type Department } from '../api/organisation';
import {
  hrLeaveApi, numberWord,
  type Balance, type BalanceGrid, type BalanceGridRow,
} from '../api/leaveRequests';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { unitLabel } from '../components/orgUnits';

interface Editing {
  row: BalanceGridRow;
  type: { id: number; name: string };
  cell: Balance;
}

/** "2026-27" style when the shown year has it, else "2026". */
function yearOptionLabel(start: number, sample: string | undefined): string {
  return sample && /^d{4}-d{2}$/.test(sample) ? `${start}-${String(start + 1).slice(2)}` : String(start);
}

function Cell({ cell, canEdit, onEdit }: { cell: Balance | undefined; canEdit: boolean; onEdit: () => void }) {
  if (!cell) return <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>—</Typography>;
  const body = (
    <Box
      component={canEdit ? 'button' : 'span'}
      type={canEdit ? 'button' : undefined}
      onClick={canEdit ? (e: MouseEvent<HTMLElement>) => { e.stopPropagation(); onEdit(); } : undefined}
      data-balance-cell=""
      sx={{
        all: 'unset', boxSizing: 'border-box', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end',
        cursor: canEdit ? 'pointer' : 'default', px: 0.75, py: 0.25, borderRadius: 'var(--r-sm)',
        '&:hover, &:focus-visible': canEdit ? { background: 'var(--c-primary-50)' } : undefined,
      }}
    >
      <Typography component="span" sx={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {numberWord(cell.available, cell.limited)}
      </Typography>
      <Typography component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
        opening {numberWord(cell.opening)}
      </Typography>
    </Box>
  );
  return <Tooltip title={cell.why}>{body}</Tooltip>;
}

export default function LeaveBalances() {
  const can = useCan();
  const toast = useToast();
  const filters = useListFilters(['year', 'departmentId']);
  const [grid, setGrid] = useState<BalanceGrid | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [opening, setOpening] = useState('');
  const [note, setNote] = useState('');
  // The leave year shown when no year is asked for — today's — so the year filter can offer the ones around it.
  const [baseStart, setBaseStart] = useState<number | null>(null);

  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    setLoading(true);
    const p = JSON.parse(querySig) as Record<string, string>;
    hrLeaveApi.balances({ year: p.year, departmentId: p.departmentId, q: p.q })
      .then((g) => {
        setGrid(g);
        setError(null);
        const start = Number(String(g.year?.key ?? '').slice(0, 4));
        if (!p.year && start) setBaseStart(start);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [querySig]);
  useEffect(load, [load]);
  useEffect(() => { orgApi.departments.list().then(setDepartments).catch(() => setDepartments(null)); }, []);

  const yearParam = filters.values.year || (baseStart ? String(baseStart) : '');
  const defs: FilterDef[] = useMemo(() => {
    const sample = grid?.year?.key;
    const years = baseStart ? [baseStart + 1, baseStart, baseStart - 1, baseStart - 2] : [];
    return [
      ...(years.length ? [{
        key: 'year', label: 'Leave year', defaultValue: String(baseStart),
        options: years.map((y) => ({ value: String(y), label: yearOptionLabel(y, sample) })),
      }] : []),
      ...(departments?.length ? [{ key: 'departmentId', label: 'Org unit (and below)', searchable: true, options: departments.map((d) => ({ value: String(d.id), label: unitLabel(d.path || d.name, d.type) })) }] : []),
    ];
  }, [grid, departments, baseStart]);

  const columns: DataColumn<BalanceGridRow>[] = useMemo(() => [
    {
      key: 'person', header: 'Person', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.person.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            {r.person.employeeCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 0.75 }}>{r.person.employeeCode}</Mono>}
            {r.person.departmentName ?? ''}
          </Typography>
        </Stack>
      ),
      sortValue: (r) => r.person.name,
      exportValue: (r) => `${r.person.name}${r.person.employeeCode ? ` (${r.person.employeeCode})` : ''}`,
    },
    ...(grid?.leaveTypes ?? []).map((t): DataColumn<BalanceGridRow> => ({
      key: `t${t.id}`,
      header: t.name,
      numeric: true,
      align: 'right',
      render: (r) => {
        const cell = r.balances.find((b) => b.leaveTypeId === t.id);
        return (
          <Cell
            cell={cell}
            canEdit={can.leave.edit && !!cell}
            onEdit={() => {
              if (!cell) return;
              setEditing({ row: r, type: t, cell });
              setOpening(String(cell.opening));
              setNote('');
            }}
          />
        );
      },
      sortValue: (r) => r.balances.find((b) => b.leaveTypeId === t.id)?.available ?? -1,
      exportValue: (r) => r.balances.find((b) => b.leaveTypeId === t.id)?.available ?? '',
    })),
  ], [grid, can.leave.edit]);

  const rows = grid?.rows ?? [];
  const openingNum = opening.trim() === '' ? null : Number(opening);
  const openingBad = openingNum != null && (!Number.isFinite(openingNum) || Math.abs(openingNum * 100 - Math.round(openingNum * 100)) > 1e-6);

  return (
    <>
      <PageHeader
        title="Leave balances"
        subtitle={grid?.year ? `Leave year ${grid.year.label} — what each person has, by leave type` : 'what each person has, by leave type'}
      />
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
        Available = opening + earned − taken − waiting for approval. {can.leave.edit ? 'Click a number to set that person’s opening balance for the year.' : ''}
      </Typography>
      <ListToolbar
        filters={filters}
        defs={defs}
        shown={rows.length}
        noun={['person', 'people']}
        searchPlaceholder="Search by person or code"
        excel={
          <ExcelButtons
            entity="leave-balances"
            noun={['person', 'people']}
            filters={{ ...filters.params, ...(yearParam ? { year: yearParam } : {}) }}
            defaults={baseStart ? { year: String(baseStart) } : undefined}
            count={rows.length}
            canDownload={can.leave.view}
            canUpload={can.leave.edit}
            onApplied={load}
          />
        }
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {loading && !grid ? <ListSkeleton rows={6} /> : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.person.employeeId}
          loading={loading}
          storageKey="cf_hrms.leave-balances"
          exportName="leave-balances"
          empty={
            <EmptyState
              icon={<AccountBalanceWalletOutlined />}
              title={filters.isFiltered ? 'Nobody matches these filters' : 'No balances to show'}
              hint="A person has balances once a leave policy applies to their position."
            />
          }
        />
      )}

      <FormDialog
        open={!!editing}
        title="Opening balance"
        subtitle={editing ? `${editing.row.person.name} · ${editing.type.name} · ${editing.row.year?.label ?? grid?.year?.label ?? ''}` : undefined}
        onClose={() => setEditing(null)}
        submitLabel="Save"
        submitDisabled={openingBad || !note.trim()}
        maxWidth="xs"
        enterSubmits={false}
        onSubmit={async () => {
          const yearKey = editing?.row.year?.key ?? grid?.year?.key;
          if (!editing || !yearKey) return;
          await hrLeaveApi.setOpening({
            employeeId: editing.row.person.employeeId,
            leaveTypeId: editing.type.id,
            yearKey,
            opening: openingNum,
            note: note.trim(),
          });
          toast.success(`Opening balance saved for ${editing.row.person.name}.`);
          load();
        }}
      >
        {editing && (
          <Stack spacing={1.5} sx={{ pt: 0.75 }}>
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{editing.cell.why}</Typography>
            <TextField
              label="Opening balance (days)"
              size="small"
              type="number"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              error={openingBad}
              helperText={openingBad ? 'A number of days, with at most two decimals.' : can.leave.remove ? 'Leave it empty to go back to carrying from last year by the rule.' : 'The number of days this person starts the year with.'}
              inputProps={{ step: 0.5, 'data-field': 'opening' }}
            />
            <TextField
              label="Note"
              required
              size="small"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText="Why this number — for example, the balance carried over from the old system."
              inputProps={{ maxLength: 500 }}
            />
          </Stack>
        )}
      </FormDialog>
    </>
  );
}
