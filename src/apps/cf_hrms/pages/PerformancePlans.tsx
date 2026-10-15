/**
 * Plans — one plan per person per period (CF_HRMS_HIRING_SPEC.md §18.3).
 *
 * The period picker (year · frequency · period) sits above the list pattern of
 * §13.1 (search, filters, count line, row click). The picker is in the address
 * too (`year`, `frequency`, `period` = the period's start day), so a link to
 * "Q3 drafts in Printing" works. Periods are made on demand: a period nobody
 * has a plan for yet has no id, and its list is simply empty.
 *
 * Actions follow the rights: Create plans and Close period and Activate
 * selected = performance edit; Cancel = performance remove.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AssignmentTurnedInOutlined from '@mui/icons-material/AssignmentTurnedInOutlined';
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import HighlightOffRounded from '@mui/icons-material/HighlightOffRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import {
  Callout, ConfirmDialog, DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, PromptDialog, ToneBadge,
  useToast, type DataColumn,
} from '@shared/ui';
import {
  performanceApi,
  type BulkResult, type Frequency, type Period, type PeriodYear, type PlanList, type PlanRow,
} from '../api/performance';
import { orgApi, type Department } from '../api/organisation';
import { useCan } from '../access/can';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { labelFilterDefs, useLabelGroups } from '../components/labelGroups';
import { PlanStatusBadge } from '../components/performance/PlanParts';
import { CreatePlansDialog } from '../components/performance/CreatePlansDialog';
import { FREQUENCY_LABEL, PLAN_STATUS_LABEL, periodDates } from '../components/performance/planWords';
import { longDay } from '../components/jobDates';

const STATUS_OPTIONS = (['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const).map((s) => ({ value: s, label: PLAN_STATUS_LABEL[s] }));

function periodOption(p: Period): string {
  const bits = [p.name, p.made ? `${p.planCount} plan${p.planCount === 1 ? '' : 's'}` : 'no plans yet'];
  if (p.status === 'CLOSED') bits.push('closed');
  if (p.current) bits.push('now');
  return bits.join(' · ');
}

interface BulkOutcome { verb: string; result: BulkResult; names: Map<number, string> }

export default function PerformancePlans() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  const mayEdit = can.performance.edit;
  const mayRemove = can.performance.remove;
  const [params, setParams] = useSearchParams();

  // The picker, from the address.
  const yearParam = params.get('year') ?? '';
  const freqParam = (params.get('frequency') ?? '') as Frequency | '';
  const periodParam = params.get('period') ?? '';

  const filters = useListFilters(['status', 'department', 'label']);
  const { groups } = useLabelGroups(can.performance.view);

  const [periods, setPeriods] = useState<PeriodYear | null>(null);
  const [periodsError, setPeriodsError] = useState<unknown>(null);
  const [periodsTick, setPeriodsTick] = useState(0);
  const [data, setData] = useState<PlanList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);

  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelIds, setCancelIds] = useState<number[] | null>(null);
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null);
  const [activatingBusy, setActivatingBusy] = useState(false);

  /* ── periods ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    let live = true;
    performanceApi.periods({ year: yearParam ? Number(yearParam) : undefined, frequency: freqParam || undefined })
      .then((r) => { if (live) { setPeriods(r); setPeriodsError(null); } })
      .catch((e) => { if (live) setPeriodsError(e); });
    return () => { live = false; };
  }, [yearParam, freqParam, periodsTick]);

  // A link that names a period but not its year (the plan page's "Back"): pick the year that holds it.
  useEffect(() => {
    if (!periods || yearParam || !periodParam) return;
    if (periods.periods.some((p) => p.start === periodParam)) return;
    const [y, m] = periodParam.split('-').map(Number);
    if (!y || !m) return;
    const year = m >= periods.yearStartMonth ? y : y - 1;
    if (year !== periods.year && periods.years.some((o) => o.value === year)) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('year', String(year));
        return next;
      }, { replace: true });
    }
  }, [periods, yearParam, periodParam, setParams]);

  useEffect(() => {
    orgApi.departments.list().then(setDepartments).catch(() => setDepartments(null));
  }, []);

  const frequency: Frequency = freqParam || periods?.defaultFrequency || 'QUARTERLY';
  // The server answers with every frequency when none is asked for: keep the chosen one.
  const periodList = useMemo(() => (periods?.periods ?? []).filter((p) => p.frequency === frequency), [periods, frequency]);
  const period: Period | null = useMemo(
    () => periodList.find((p) => p.start === periodParam) ?? periodList.find((p) => p.current) ?? periodList[0] ?? null,
    [periodList, periodParam],
  );

  const setPicker = (patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    }, { replace: true });
  };

  /* ── the list ────────────────────────────────────────────────────────── */

  const periodId = period?.id ?? null;
  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    if (periodId == null) {
      setData({ items: [], total: 0, count: 0 });
      setError(null);
      return;
    }
    const search = new URLSearchParams({ ...(JSON.parse(querySig) as Record<string, string>), periodId: String(periodId) });
    setLoading(true);
    performanceApi.list(`?${search.toString()}`)
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [periodId, querySig]);

  useEffect(() => {
    if (!periods) return;
    load();
  }, [load, periods]);

  const refreshAll = () => {
    setPeriodsTick((t) => t + 1);
  };

  const items = useMemo(() => data?.items ?? [], [data]);
  const nameOf = useMemo(() => new Map(items.map((r) => [r.id, r.employeeName])), [items]);

  const filterDefs: FilterDef[] = useMemo(() => {
    // The departments list needs the organisation right; without it, those of the plans shown.
    const deps = departments
      ? departments.map((d) => ({ value: String(d.id), label: d.path || d.name }))
      : [...new Map(items.filter((r) => r.departmentId != null).map((r) => [r.departmentId, r.departmentName ?? ''])).entries()]
          .map(([id, name]) => ({ value: String(id), label: name }));
    return [
      { key: 'status', label: 'Status', options: STATUS_OPTIONS },
      { key: 'department', label: 'Department (and below)', searchable: true, options: deps },
      ...labelFilterDefs(groups),
    ];
  }, [departments, items, groups]);

  const columns: DataColumn<PlanRow>[] = useMemo(() => [
    {
      key: 'person', header: 'Person', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{r.employeeName}</Typography>
          {r.employeeCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.employeeCode}</Mono>}
        </Stack>
      ),
      sortValue: (r) => r.employeeName,
      exportValue: (r) => `${r.employeeName}${r.employeeCode ? ` (${r.employeeCode})` : ''}`,
    },
    {
      key: 'position', header: 'Position',
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 13.5 }}>{r.positionTitle ?? r.roleTitle ?? '—'}</Typography>
          {r.positionCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.positionCode}</Mono>}
        </Stack>
      ),
      sortValue: (r) => r.positionTitle ?? r.roleTitle ?? '',
      exportValue: (r) => [r.positionCode, r.positionTitle ?? r.roleTitle].filter(Boolean).join(' '),
    },
    { key: 'department', header: 'Department', render: (r) => r.departmentName ?? '—', sortValue: (r) => r.departmentName ?? '' },
    {
      key: 'status', header: 'Status', width: 120,
      render: (r) => <PlanStatusBadge status={r.status} />,
      sortValue: (r) => r.status,
      exportValue: (r) => PLAN_STATUS_LABEL[r.status],
    },
    { key: 'kras', header: 'KRAs', width: 80, numeric: true, align: 'right', render: (r) => r.kraCount, sortValue: (r) => r.kraCount },
    {
      key: 'kpis', header: 'KPIs', width: 80, numeric: true, align: 'right',
      render: (r) => (r.noKpis ? <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }} title="No KPIs — KRAs only">0</Typography> : r.kpiCount),
      sortValue: (r) => r.kpiCount,
    },
    {
      key: 'weights', header: 'Weights OK?', width: 140,
      render: (r) => (!r.weightsSet
        ? <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Not set</Typography>
        : r.weightsOk
          ? <ToneBadge tone="success" label="Yes" />
          : <ToneBadge tone="warning" label={`Adds to ${r.weightTotal}%`} />),
      sortValue: (r) => (r.weightsSet ? (r.weightsOk ? 2 : 1) : 0),
      exportValue: (r) => (!r.weightsSet ? 'Not set' : r.weightsOk ? 'Yes' : `Adds to ${r.weightTotal}%`),
    },
  ], []);

  /* ── actions ─────────────────────────────────────────────────────────── */

  const activate = async (rows: PlanRow[], clear: () => void) => {
    setActivatingBusy(true);
    try {
      const result = await performanceApi.activateMany(rows.map((r) => r.id));
      setOutcome({ verb: 'activated', result, names: new Map(rows.map((r) => [r.id, r.employeeName])) });
      if (result.done) toast.success(`${result.done} plan${result.done === 1 ? '' : 's'} activated.`);
      clear();
      load();
    } catch (e) {
      setError(e);
    } finally {
      setActivatingBusy(false);
    }
  };

  const canClose = mayEdit && !!period?.made && period.status === 'OPEN' && period.id != null;
  const periodLine = period ? `${period.name} · ${periodDates(period.start, period.end)}${period.status === 'CLOSED' ? ' · closed' : ''}` : '';

  /* ── render ──────────────────────────────────────────────────────────── */

  if (periodsError && !periods) {
    return (
      <>
        <PageHeader title="Plans" />
        <ErrorNotice error={periodsError} onRetry={refreshAll} />
      </>
    );
  }

  const filtered = (data?.total ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="each person's KRAs and KPIs for one period, copied from their job as it stood when the period began"
      />

      {/* The period picker */}
      <Box
        data-period-picker=""
        sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '140px 170px minmax(0, 1fr)' }, mb: 1.5, alignItems: 'center' }}
      >
        <TextField
          select size="small" label="Year"
          value={periods ? String(periods.year) : ''}
          onChange={(e) => setPicker({ year: e.target.value, period: null })}
        >
          {(periods?.years ?? []).map((y) => <MenuItem key={y.value} value={String(y.value)}>{y.label}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Frequency"
          value={periods ? frequency : ''}
          onChange={(e) => setPicker({ frequency: e.target.value, period: null })}
        >
          {(periods?.frequencies ?? (Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))).map((f) => (
            <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Period"
          value={period?.start ?? ''}
          onChange={(e) => setPicker({ period: e.target.value })}
        >
          {periodList.map((p) => <MenuItem key={p.start} value={p.start}>{periodOption(p)}</MenuItem>)}
        </TextField>
      </Box>

      {period && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 220px' }}>
            {period.status === 'CLOSED' && <LockOutlined sx={{ fontSize: 14, mr: 0.5, verticalAlign: '-2px' }} />}
            {periodLine}
          </Typography>
          {canClose && (
            <Button size="small" variant="outlined" startIcon={<HighlightOffRounded />} onClick={() => setClosing(true)}>
              Close period
            </Button>
          )}
        </Box>
      )}

      {outcome && (
        <Box sx={{ mb: 2, position: 'relative' }}>
          <Callout
            tone={outcome.result.refused.length ? 'warning' : 'success'}
            title={`${outcome.result.done} ${outcome.verb}${outcome.result.refused.length ? `, ${outcome.result.refused.length} refused` : ''}`}
          >
            {outcome.result.refused.length > 0 && (
              <Box component="ul" data-bulk-refused="" sx={{ m: 0, pl: 2.5 }}>
                {outcome.result.refused.map((r) => (
                  <li key={r.id}>
                    <b>{outcome.names.get(r.id) ?? `Plan ${r.id}`}</b> — {r.message}
                    {r.problems.length > 0 && (
                      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                        {r.problems.filter((x) => x !== r.message).map((x) => <li key={x}>{x}</li>)}
                      </Box>
                    )}
                  </li>
                ))}
              </Box>
            )}
          </Callout>
          <IconButton size="small" aria-label="Dismiss" onClick={() => setOutcome(null)} sx={{ position: 'absolute', top: 6, right: 6 }}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
      )}

      <ListToolbar
        filters={filters}
        defs={filterDefs}
        shown={data?.count ?? items.length}
        total={data?.total ?? items.length}
        noun={['plan', 'plans']}
        searchPlaceholder="Search by person, code or position"
        add={mayEdit && period && period.status === 'OPEN' ? { label: 'Create plans for this period', onClick: () => setCreating(true) } : undefined}
      />

      {error != null && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {!periods || (loading && !data) ? (
        <ListSkeleton rows={6} />
      ) : (
        <DataTable
          rows={items}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/${company}/cf_hrms/plans/${r.id}`)}
          selectable={mayEdit || mayRemove}
          bulkActions={(selected, clear) => (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {mayEdit && (
                <Button size="small" startIcon={<CheckCircleOutlineRounded />} disabled={activatingBusy} onClick={() => void activate(selected, clear)}>
                  Activate selected
                </Button>
              )}
              {mayRemove && (
                <Button size="small" color="error" startIcon={<HighlightOffRounded />} onClick={() => { setCancelIds(selected.map((r) => r.id)); clear(); }}>
                  Cancel
                </Button>
              )}
            </Stack>
          )}
          loading={loading}
          storageKey="cf_hrms.plans"
          exportName="plans"
          defaultSortKey="person"
          empty={
            filtered ? (
              <EmptyState
                icon={<AssignmentTurnedInOutlined />}
                title="No plans match these filters"
                hint="Clear the search or the filters to see every plan of this period."
                action={<Button size="small" onClick={filters.clear}>Clear the filters</Button>}
              />
            ) : (
              <EmptyState
                icon={<AssignmentTurnedInOutlined />}
                title={period ? `No plans for ${period.name} yet` : 'No period chosen'}
                hint={period
                  ? `Creating plans copies each person's KRAs and KPIs from their job as it stood on ${longDay(period.start)}. Then change only what differs for this period — a weight, a target, an extra KPI.`
                  : 'Choose a year, a frequency and a period above.'}
                action={mayEdit && period && period.status === 'OPEN'
                  ? <Button variant="contained" size="small" onClick={() => setCreating(true)}>Create plans for this period</Button>
                  : undefined}
              />
            )
          }
        />
      )}

      {period && (
        <CreatePlansDialog
          open={creating}
          frequency={period.frequency}
          start={period.start}
          onClose={() => setCreating(false)}
          onDone={(r) => {
            setCreating(false);
            toast.success(r.created ? `${r.created} plan${r.created === 1 ? '' : 's'} made for ${r.period.name}.` : r.line ?? 'No new plans were needed.');
            // The period may have just been made: put it in the address and re-read both.
            setPicker({ frequency: r.period.frequency, period: r.period.start });
            refreshAll();
          }}
        />
      )}

      {canClose && period && (
        <ConfirmDialog
          open={closing}
          title={`Close ${period.name}?`}
          body="Closing the period closes every active plan in it. Plans can no longer be changed after that."
          confirmLabel="Close period"
          danger
          onClose={() => setClosing(false)}
          onConfirm={async () => {
            const r = await performanceApi.closePeriod(period.id!);
            toast.success(`${period.name} closed. ${r.plansClosed} plan${r.plansClosed === 1 ? '' : 's'} closed.`);
            refreshAll();
          }}
        />
      )}

      <PromptDialog
        open={!!cancelIds}
        title={`Cancel ${cancelIds?.length ?? 0} plan${cancelIds?.length === 1 ? '' : 's'}?`}
        body="A cancelled plan is kept, read-only. Nothing is deleted."
        label="Reason (optional)"
        required={false}
        confirmLabel="Cancel plans"
        danger
        onClose={() => setCancelIds(null)}
        onConfirm={async (reason) => {
          if (!cancelIds) return;
          const result = await performanceApi.cancelMany(cancelIds, reason.trim() || undefined);
          setOutcome({ verb: 'cancelled', result, names: new Map(nameOf) });
          if (result.done) toast.success(`${result.done} plan${result.done === 1 ? '' : 's'} cancelled.`);
          load();
        }}
      />
    </>
  );
}
