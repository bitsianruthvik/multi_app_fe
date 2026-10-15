/**
 * Performance › Reviews (CF_HRMS_HIRING_SPEC.md §20.3) — check-ins and final
 * reviews, due / overdue / done.
 *
 * Final reviews are made by the app: each active plan gets one when its period's
 * last month begins (the server makes them when this list is read). Check-ins are
 * opened from a plan's page. The list pattern of §13.1: search, filters (period,
 * kind, due / overdue / done, status, department and below, label, manager), the
 * count line; a row opens the review.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Stack, Typography } from '@mui/material';
import RateReviewOutlined from '@mui/icons-material/RateReviewOutlined';
import { DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, ToneBadge, type DataColumn } from '@shared/ui';
import { reviewApi, type Review, type ReviewList } from '../api/reviews';
import { orgApi, type Department } from '../api/organisation';
import { useCan } from '../access/can';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { labelFilterDefs, useLabelGroups } from '../components/labelGroups';
import { DueChip, ReviewStatusBadge } from '../components/performance/ReviewParts';
import { REVIEW_KIND_OPTIONS, REVIEW_STATE_OPTIONS, REVIEW_STATUS_LABEL } from '../components/performance/reviewWords';

const STATUS_OPTIONS = (['OPEN', 'EMPLOYEE_DONE', 'DONE', 'CANCELLED'] as const).map((s) => ({ value: s, label: REVIEW_STATUS_LABEL[s] }));

export default function PerformanceReviews() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const filters = useListFilters(['period', 'kind', 'state', 'status', 'department', 'label', 'manager']);
  const { groups } = useLabelGroups(can.performance.view);
  const [data, setData] = useState<ReviewList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);

  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    setLoading(true);
    reviewApi.list(`?${new URLSearchParams(JSON.parse(querySig) as Record<string, string>).toString()}`)
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [querySig]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { orgApi.departments.list().then(setDepartments).catch(() => setDepartments(null)); }, []);

  const items = useMemo(() => data?.items ?? [], [data]);

  const defs: FilterDef[] = useMemo(() => {
    const deps = departments
      ? departments.map((d) => ({ value: String(d.id), label: d.path || d.name }))
      : [...new Map(items.filter((r) => r.departmentId != null).map((r) => [r.departmentId, r.departmentName ?? ''])).entries()].map(([id, name]) => ({ value: String(id), label: name }));
    return [
      { key: 'state', label: 'Due / overdue / done', options: REVIEW_STATE_OPTIONS },
      { key: 'period', label: 'Period', options: (data?.periods ?? []).map((p) => ({ value: String(p.id), label: p.name })) },
      { key: 'kind', label: 'Kind', options: REVIEW_KIND_OPTIONS },
      { key: 'status', label: 'Status', options: STATUS_OPTIONS },
      { key: 'department', label: 'Department (and below)', searchable: true, options: deps },
      ...labelFilterDefs(groups),
      {
        key: 'manager', label: 'Manager', searchable: true,
        options: (data?.managers ?? []).map((m) => ({ value: String(m.id), label: [m.name, m.code, m.title].filter(Boolean).join(' · ') })),
      },
    ];
  }, [departments, items, groups, data]);

  const columns: DataColumn<Review>[] = useMemo(() => [
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
      key: 'review', header: 'Review',
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 13.5 }}>{r.kindLabel}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{r.slot ? r.slot.name : r.periodName}</Typography>
        </Stack>
      ),
      sortValue: (r) => `${r.kind}${r.slot?.start ?? r.period.start}`,
      exportValue: (r) => `${r.kindLabel} · ${r.slot ? r.slot.name : r.periodName}`,
    },
    {
      key: 'position', header: 'Position',
      render: (r) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 13.5 }}>{r.positionTitle ?? r.roleTitle ?? '—'}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{r.departmentName ?? ''}</Typography>
        </Stack>
      ),
      sortValue: (r) => r.positionTitle ?? r.roleTitle ?? '',
      exportValue: (r) => [r.positionCode, r.positionTitle ?? r.roleTitle, r.departmentName].filter(Boolean).join(' · '),
    },
    { key: 'manager', header: 'Manager', render: (r) => r.managerName ?? (r.managerPositionCode ? `${r.managerPositionCode} (vacant)` : '—'), sortValue: (r) => r.managerName ?? '' },
    {
      key: 'due', header: 'Due', width: 160,
      render: (r) => <DueChip dueDate={r.dueDate} overdue={r.overdue} daysOverdue={r.daysOverdue} open={r.status === 'OPEN' || r.status === 'EMPLOYEE_DONE'} />,
      sortValue: (r) => r.dueDate,
      exportValue: (r) => `${r.dueDate}${r.overdue ? ' (overdue)' : ''}`,
    },
    { key: 'status', header: 'Status', width: 170, render: (r) => <ReviewStatusBadge status={r.status} />, sortValue: (r) => r.status, exportValue: (r) => r.statusLabel },
    {
      key: 'rating', header: 'Rating', width: 170,
      render: (r) => (r.kind !== 'FINAL' ? <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>—</Typography>
        : r.rating ? <ToneBadge tone="info" label={`${r.rating.value} · ${r.rating.label}`} noIcon /> : <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>Not rated</Typography>),
      sortValue: (r) => r.ratingValue ?? -1,
      exportValue: (r) => (r.rating ? `${r.rating.value} ${r.rating.label}` : ''),
    },
    { key: 'actions', header: 'Open actions', width: 110, numeric: true, align: 'right', render: (r) => r.openActions || '—', sortValue: (r) => r.openActions },
  ], []);

  const counts = data?.counts;
  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle="check-ins during a period and the final review at its end — the person writes their part, the manager closes it"
      />
      {counts && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }} data-review-counts="">
          {counts.overdue} overdue · {counts.due} due · {counts.done} done. A final review is made for each active plan when its period&rsquo;s last month begins; check-ins are opened from a plan.
        </Typography>
      )}
      <ListToolbar
        filters={filters}
        defs={defs}
        shown={data?.count ?? items.length}
        total={data?.total ?? items.length}
        noun={['review', 'reviews']}
        searchPlaceholder="Search by person, code, position or manager"
      />
      {error != null && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}
      {loading && !data ? <ListSkeleton rows={6} /> : (
        <DataTable
          rows={items}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(reviewApi.reviewPath(company, r.id))}
          loading={loading}
          storageKey="cf_hrms.reviews"
          exportName="reviews"
          empty={filters.isFiltered ? (
            <EmptyState icon={<RateReviewOutlined />} title="No reviews match these filters" hint="Clear the search or the filters to see every review."
              action={<Button size="small" onClick={filters.clear}>Clear the filters</Button>} />
          ) : (
            <EmptyState icon={<RateReviewOutlined />} title="No reviews yet"
              hint="Each active plan gets a final review when its period's last month begins. Open a check-in from a plan's page at any time." />
          )}
        />
      )}
    </>
  );
}
