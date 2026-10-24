/**
 * Performance › Actuals (CF_HRMS_HIRING_SPEC.md §19.3).
 *
 * Pick a period and a slot (default: the latest slot that has begun); one row
 * per person × KPI with its target, the slot's input — a number, or Met / Not
 * met for a target written as words — the achievement chip in its band's
 * colour, and a note. Typing saves the cell (a first value by itself once typing
 * stops, with a quiet "Saved"); correcting a value already entered asks why.
 * "Show only what is missing" and the count line "312 of 400 entered".
 *
 * Two logins use it:
 *   mode 'hr'    /actuals — performance view; entering needs performance edit
 *                (the server sets each row's `canEnter`, scope included); Excel
 *                download (view) and upload (performance upload).
 *   mode 'team'  /my-place/team-actuals — a manager, for the people below them
 *                (the same grid and the same writer, through /user/me/team/…).
 *
 * The period, the slot and the filters live in the address.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, type DataColumn } from '@shared/ui';
import {
  performanceApi, teamPlanApi,
  type ActualInput as ActualBody, type ActualRow, type ActualSaved, type ActualsGrid, type ActualHistory,
} from '../api/performance';
import { orgApi, type Department } from '../api/organisation';
import { useCan } from '../access/can';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { labelFilterDefs, useLabels } from '../components/labels';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { AchievementChip, ActualInput, HistoryButton, NoteButton } from '../components/performance/ActualParts';
import { BAND_OPTIONS, periodDates } from '../components/performance/planWords';
import { unitLabel } from '../components/orgUnits';

export type ActualsMode = 'hr' | 'team';

interface Source {
  grid: (search: string) => Promise<ActualsGrid>;
  enter: (body: ActualBody) => Promise<ActualSaved>;
  history: (planId: number, kpiId: number) => Promise<ActualHistory>;
}
const SOURCES: Record<ActualsMode, Source> = {
  hr: { grid: performanceApi.actuals, enter: performanceApi.enterActual, history: performanceApi.actualHistory },
  team: { grid: teamPlanApi.actuals, enter: teamPlanApi.enterActual, history: teamPlanApi.actualHistory },
};

export default function PerformanceActuals({ mode = 'hr' }: { mode?: ActualsMode }) {
  const { company = '' } = useParams<{ company: string }>();
  const can = useCan();
  const src = SOURCES[mode];
  const [params, setParams] = useSearchParams();
  const periodParam = params.get('periodId') ?? '';
  const slotParam = params.get('slot') ?? '';
  const filters = useListFilters(mode === 'hr' ? ['department', 'label', 'role', 'manager', 'band', 'missing'] : ['role', 'band', 'missing']);
  const { labels: labelList } = useLabels(mode === 'hr' && can.performance.view);

  const [data, setData] = useState<ActualsGrid | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);

  useEffect(() => {
    if (mode !== 'hr') return;
    orgApi.departments.list().then(setDepartments).catch(() => setDepartments(null));
  }, [mode]);

  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    const search = new URLSearchParams({ ...(JSON.parse(querySig) as Record<string, string>) });
    if (periodParam) search.set('periodId', periodParam);
    if (slotParam) search.set('slot', slotParam);
    setLoading(true);
    src.grid(`?${search.toString()}`)
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [src, periodParam, slotParam, querySig]);
  useEffect(() => { load(); }, [load]);

  const setPicker = (patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    }, { replace: true });
  };

  // A saved cell redraws its own row and the count line; nothing else is fetched again.
  const saveCell = useCallback(async (row: ActualRow, v: Omit<ActualBody, 'planId' | 'kpiId' | 'slotStart'>) => {
    const r = await src.enter({ planId: row.planId, kpiId: row.kpiId, slotStart: row.slotStart, ...v });
    setData((d) => {
      if (!d) return d;
      const wasEntered = !!d.rows.find((x) => x.key === row.key)?.actual;
      const rows = d.rows.map((x) => (x.key === row.key ? { ...x, actual: r.actual, achievement: r.achievement, band: r.band, bandLabel: r.bandLabel } : x));
      const entered = (d.counts.entered ?? 0) + (!wasEntered && r.actual ? 1 : 0);
      return { ...d, rows, counts: { ...d.counts, entered } };
    });
    return r;
  }, [src]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const showSlot = data?.slot === 'all';

  const filterDefs: FilterDef[] = useMemo(() => {
    const deps = departments
      ? departments.map((d) => ({ value: String(d.id), label: unitLabel(d.path || d.name, d.type) }))
      : [...new Map(rows.filter((r) => r.departmentId != null).map((r) => [r.departmentId, r.departmentName ?? ''])).entries()].map(([id, name]) => ({ value: String(id), label: name }));
    return [
      ...(mode === 'hr' ? [{ key: 'department', label: 'Org unit (and below)', searchable: true, multiple: true, options: deps } as FilterDef, ...labelFilterDefs(labelList)] : []),
      { key: 'role', label: 'Role', searchable: true, options: (data?.roles ?? []).map((r) => ({ value: String(r.id), label: r.title })) },
      ...(mode === 'hr' ? [{ key: 'manager', label: 'Manager', searchable: true, options: (data?.managers ?? []).map((m) => ({ value: String(m.id), label: [m.code, m.title].filter(Boolean).join(' — ') })) } as FilterDef] : []),
      { key: 'band', label: 'Band', options: BAND_OPTIONS },
      { key: 'missing', label: 'Show only what is missing', kind: 'toggle' },
    ];
  }, [departments, rows, labelList, data, mode]);

  const columns: DataColumn<ActualRow>[] = useMemo(() => [
    {
      key: 'person', header: 'Person', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{r.employeeName}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            {[r.employeeCode, r.positionTitle ?? r.roleTitle].filter(Boolean).join(' · ')}
          </Typography>
        </Stack>
      ),
      sortValue: (r) => r.employeeName,
      exportValue: (r) => `${r.employeeName}${r.employeeCode ? ` (${r.employeeCode})` : ''}`,
    },
    {
      key: 'kpi', header: 'KPI', alwaysVisible: true,
      render: (r) => (
        <Stack spacing={0.25} sx={{ minWidth: 0, whiteSpace: 'normal', maxWidth: 340 }}>
          <Typography sx={{ fontSize: 13.5 }}>{r.kpiName}</Typography>
          {r.kraName && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.kraName}</Typography>}
        </Stack>
      ),
      sortValue: (r) => r.kpiName,
    },
    ...(showSlot ? [{ key: 'slot', header: 'Slot', render: (r: ActualRow) => r.slotName, sortValue: (r: ActualRow) => r.slotStart } as DataColumn<ActualRow>] : []),
    { key: 'unit', header: 'Unit', width: 80, render: (r) => r.unit ?? '—', defaultHidden: true },
    {
      key: 'target', header: 'Target',
      render: (r) => <Typography component="span" sx={{ fontSize: 13, whiteSpace: 'normal' }}>{r.target}</Typography>,
      sortValue: (r) => r.target,
    },
    {
      key: 'actual', header: 'Actual', alwaysVisible: true,
      render: (r) => (
        <ActualInput
          direction={r.direction} unit={r.unit} actual={r.actual} canEnter={r.canEnter}
          label={`${r.employeeName}, ${r.kpiName}, ${r.slotName}`}
          onSave={(v) => saveCell(r, v)}
        />
      ),
      sortValue: (r) => r.actual?.value ?? (r.actual?.met === 'YES' ? 1 : r.actual?.met === 'NO' ? 0 : null),
      exportValue: (r) => (r.actual?.met ? (r.actual.met === 'YES' ? 'Met' : 'Not met') : r.actual?.value ?? ''),
    },
    {
      key: 'achievement', header: 'Achievement',
      render: (r) => <AchievementChip achievement={r.achievement} band={r.band} />,
      sortValue: (r) => r.achievement ?? -1,
      exportValue: (r) => (r.achievement == null ? '' : `${r.achievement}%`),
    },
    {
      key: 'note', header: 'Note', width: 120,
      render: (r) => (
        <Stack direction="row" spacing={0.25} alignItems="center">
          <NoteButton
            actual={r.actual} canEnter={r.canEnter} label={`${r.employeeName} — ${r.kpiName}, ${r.slotName}`}
            onSave={(note) => saveCell(r, { note })}
          />
          {r.actual?.corrected && (
            <HistoryButton title={`${r.kpiName} — ${r.employeeName}`} load={() => src.history(r.planId, r.kpiId)} />
          )}
          {r.locked && !r.canEnter && (
            <LockOutlined titleAccess={r.locked} sx={{ fontSize: 15, color: 'var(--c-text-3)' }} />
          )}
        </Stack>
      ),
      exportValue: (r) => r.actual?.note ?? '',
    },
  ], [showSlot, saveCell, src]);

  const period = data?.period ?? null;
  const entered = data?.counts.entered ?? 0;
  const all = data?.counts.rows ?? rows.length;
  const openRows = (data?.slots ?? []).filter((s) => s.open).reduce((t, s) => t + s.rows, 0);

  return (
    <>
      {mode === 'team' && (
        <Button component={RouterLink} to={`/${company}/cf_hrms/my-place`} startIcon={<ArrowBackRounded />} size="small" sx={{ mb: 1 }}>
          Back to my place
        </Button>
      )}
      <PageHeader
        title={mode === 'team' ? 'Actuals for my team' : 'Actuals'}
        subtitle={mode === 'team'
          ? 'what the people below you achieved against their targets — enter them here'
          : 'what each person achieved against the targets of their plan, slot by slot'}
      />

      <Box data-actuals-picker="" sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 260px) minmax(0, 260px)' }, mb: 1.5 }}>
        <TextField
          select size="small" label="Period"
          value={period ? String(period.id) : ''}
          onChange={(e) => setPicker({ periodId: e.target.value, slot: null })}
          disabled={!data?.periods.length}
        >
          {(data?.periods ?? []).map((p) => (
            <MenuItem key={p.id} value={String(p.id)}>
              {[p.name, `${p.plans ?? 0} active plan${p.plans === 1 ? '' : 's'}`, p.status === 'CLOSED' ? 'closed' : null, p.current ? 'now' : null].filter(Boolean).join(' · ')}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select size="small" label="Slot"
          value={data?.slot ?? ''}
          onChange={(e) => setPicker({ slot: e.target.value })}
          disabled={!data?.slots.length}
        >
          {(data?.slots ?? []).map((s) => (
            <MenuItem key={s.key} value={s.key} disabled={!s.open}>
              {s.whole ? `${s.name} (once for the period)` : s.name}{s.open ? '' : ' — not begun'}
            </MenuItem>
          ))}
          <MenuItem value="all">Every slot that has begun</MenuItem>
        </TextField>
      </Box>

      {period && (
        <Typography data-count-line="" sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
          {period.status === 'CLOSED' && <LockOutlined sx={{ fontSize: 14, mr: 0.5, verticalAlign: '-2px' }} />}
          {period.name} · {periodDates(period.start, period.end)}{period.status === 'CLOSED' ? ' · closed: read only' : ''}
          {' — '}<b>{entered.toLocaleString()} of {all.toLocaleString()} entered</b>
          {data?.line ? ` · ${data.line}` : ''}
        </Typography>
      )}

      <ListToolbar
        filters={filters}
        defs={filterDefs}
        shown={data?.count ?? rows.length}
        total={data?.total ?? rows.length}
        noun={['row', 'rows']}
        searchPlaceholder="Search by person, code, position or KPI"
        excel={mode === 'hr' && period ? (
          <ExcelButtons
            entity="actuals"
            noun={['actual', 'actuals']}
            filters={{ ...filters.params, periodId: String(period.id) }}
            defaults={{ periodId: String(period.id) }}
            count={filters.isFiltered ? (data?.count ?? rows.length) : openRows}
            canDownload={can.performance.view}
            canUpload={can.performance.upload}
            onApplied={load}
          />
        ) : undefined}
      />

      {error != null && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}

      {loading && !data ? (
        <ListSkeleton rows={8} />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r.key}
          loading={loading}
          storageKey={`cf_hrms.actuals.${mode}`}
          exportName="actuals"
          pageSize={100}
          empty={(
            <EmptyState
              icon={<FactCheckOutlined />}
              title={filters.isFiltered ? 'Nothing matches these filters' : (data?.line ?? 'No actuals to enter here')}
              hint={filters.isFiltered
                ? 'Clear the search or the filters to see every row of this slot.'
                : mode === 'hr'
                  ? 'Actuals are entered against ACTIVE plans. Make and activate plans on Performance › Plans.'
                  : 'When the plans of the people below you are active, their KPIs are listed here.'}
              action={filters.isFiltered
                ? <Button size="small" onClick={filters.clear}>Clear the filters</Button>
                : mode === 'hr' ? <Link component={RouterLink} to={`/${company}/cf_hrms/plans`}>Go to Plans</Link> : undefined}
            />
          )}
        />
      )}
      {rows.length > 0 && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
          Achievement here is the slot on its own. A plan&apos;s page shows each KPI over all its slots and the plan&apos;s score. <Mono sx={{ fontSize: 12 }}>Enter</Mono> saves a cell; a value already entered is corrected with a reason, and the earlier one is kept.
        </Typography>
      )}
    </>
  );
}
