/**
 * Payroll › Salaries (CF_HRMS_HIRING_SPEC.md §25.2) — every person with their
 * salary today: CTC a year and a month, the structure, the day it started. A
 * salary that starts later than today is marked "Future". Opening a person
 * opens their salary, its breakdown and its history.
 *
 * Amounts: payroll view AND the named pay view. The server audits every read.
 * Many at once by Excel (`pay-salaries`): a later Effective from is a revision.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import {
  DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, ToneBadge, type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { payrollApi, type SalaryList, type SalaryListItem } from '../api/payroll';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { Amount, NeedPayView } from '../components/payroll/PayParts';
import { longDay } from '../components/jobDates';
import { useUnitKinds } from '../components/orgUnits';

export default function Salaries() {
  const can = useCan();
  if (!can.named.payView) return can.settled ? <><PageHeader title="Salaries" /><NeedPayView what="Salaries" /></> : <ListSkeleton rows={6} />;
  return <SalariesList />;
}

function SalariesList() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const filters = useListFilters(['structureId', 'has']);
  const [data, setData] = useState<SalaryList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    setLoading(true);
    payrollApi.salaries(JSON.parse(querySig) as Record<string, string>)
      .then((d) => { setData(d); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [querySig]);
  useEffect(load, [load]);

  const defs: FilterDef[] = useMemo(() => [
    { key: 'structureId', label: 'Structure', options: (data?.structures ?? []).map((s) => ({ value: String(s.id), label: s.status === 'ACTIVE' ? s.name : `${s.name} (inactive)` })) },
    { key: 'has', label: 'Salary', options: [{ value: 'with', label: 'With a salary' }, { value: 'without', label: 'Without a salary' }] },
  ], [data]);

  const withKind = useUnitKinds();
  const columns: DataColumn<SalaryListItem>[] = useMemo(() => [
    {
      key: 'person', header: 'Person', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.employee.name}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
            <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)', mr: 0.75 }}>{r.employee.code}</Mono>
            {r.employee.status === 'EXITED' ? 'Left' : ''}
          </Typography>
        </Stack>
      ),
      sortValue: (r) => r.employee.name,
      exportValue: (r) => `${r.employee.name} (${r.employee.code})`,
    },
    { key: 'department', header: 'Org unit', render: (r) => withKind(r.employee.departmentName) || '—', sortValue: (r) => r.employee.departmentName ?? '' },
    { key: 'position', header: 'Position', defaultHidden: true, render: (r) => r.employee.positionTitle ?? '—', sortValue: (r) => r.employee.positionTitle ?? '' },
    {
      key: 'ctc', header: 'CTC a year', numeric: true,
      render: (r) => (r.salary ? <Amount value={r.salary.annualCtc} strong /> : <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No salary</Typography>),
      sortValue: (r) => r.salary?.annualCtc ?? -1, exportValue: (r) => r.salary?.annualCtc ?? '',
    },
    { key: 'monthly', header: 'CTC a month', numeric: true, render: (r) => (r.salary ? <Amount value={r.salary.monthlyCtc} /> : ''), sortValue: (r) => r.salary?.monthlyCtc ?? -1, exportValue: (r) => r.salary?.monthlyCtc ?? '' },
    { key: 'structure', header: 'Structure', render: (r) => r.salary?.structure?.name ?? '', sortValue: (r) => r.salary?.structure?.name ?? '' },
    {
      key: 'from', header: 'From',
      render: (r) => (r.salary ? (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{longDay(r.salary.effectiveFrom)}</span>
          {r.salary.future && <ToneBadge tone="info" label="Future" title="Starts after today: no salary today." noIcon />}
        </Box>
      ) : ''),
      sortValue: (r) => r.salary?.effectiveFrom ?? '', exportValue: (r) => r.salary?.effectiveFrom ?? '',
    },
  ], [withKind]);

  const rows = data?.items ?? [];
  return (
    <>
      <PageHeader title="Salaries" subtitle="Each person’s salary today" />
      <ListToolbar
        filters={filters}
        defs={defs}
        shown={rows.length}
        noun={['person', 'people']}
        searchPlaceholder="Search by name or code"
        excel={
          <ExcelButtons
            entity="pay-salaries"
            noun={['person', 'people']}
            filters={filters.params}
            count={rows.length}
            canDownload={can.payroll.view && can.named.payView}
            canUpload={can.payroll.upload && can.named.payView}
            onApplied={load}
          />
        }
      />
      <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />
      {loading && !data ? <ListSkeleton rows={8} /> : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.employee.id}
          loading={loading}
          onRowClick={(r) => navigate(`/${company}/cf_hrms/salaries/${r.employee.id}`)}
          storageKey="cf_hrms.salaries"
          exportName="salaries"
          empty={
            <EmptyState
              icon={<PaymentsOutlined />}
              title={filters.isFiltered ? 'Nobody matches these filters' : 'Nobody to show'}
              hint="Everyone employed now, or who left within a year, is listed here."
            />
          }
        />
      )}
    </>
  );
}
