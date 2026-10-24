/**
 * Performance › Actions (CF_HRMS_HIRING_SPEC.md §20.3) — action items raised on
 * reviews and plans: open ones by owner and due date, overdue first.
 *
 * The list pattern of §13.1: search, filters (open / done / dropped / all, overdue
 * only, owner, period, department and below, label, manager), the count line. Each
 * row: Done, Change, Drop — performance edit. An action is added from a review or a
 * plan, where it belongs.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { DataTable, EmptyState, ErrorNotice, ListSkeleton, Mono, PageHeader, PromptDialog, ToneBadge, useToast, type DataColumn } from '@shared/ui';
import { reviewApi, type Action, type ActionList, type OwnerOption } from '../api/reviews';
import { orgApi, type Department } from '../api/organisation';
import { useCan } from '../access/can';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { useListFilters } from '../components/list/useListFilters';
import { labelFilterDefs, useLabels } from '../components/labels';
import { ActionDialog, DueChip } from '../components/performance/ReviewParts';
import { ACTION_STATUS_OPTIONS } from '../components/performance/reviewWords';
import { longDay } from '../components/jobDates';
import { unitLabel, useUnitKinds } from '../components/orgUnits';

export default function PerformanceActions() {
  const { company = '' } = useParams<{ company: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  const filters = useListFilters(['status', 'overdue', 'owner', 'period', 'department', 'label'], { defaults: { status: 'OPEN' } });
  const { labels: labelList } = useLabels(can.performance.view);
  const [data, setData] = useState<ActionList | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [editing, setEditing] = useState<{ action: Action; owners: OwnerOption[] } | null>(null);
  const [doneFor, setDoneFor] = useState<Action | null>(null);
  const [dropFor, setDropFor] = useState<Action | null>(null);

  const querySig = JSON.stringify(filters.params);
  const load = useCallback(() => {
    setLoading(true);
    reviewApi.actions(`?${new URLSearchParams(JSON.parse(querySig) as Record<string, string>).toString()}`)
      .then((r) => { setData(r); setError(null); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [querySig]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { orgApi.departments.list().then(setDepartments).catch(() => setDepartments(null)); }, []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const periods = useMemo(() => [...new Map(items.map((a) => [a.periodId, a.periodName])).entries()].map(([id, name]) => ({ value: String(id), label: name })), [items]);

  const defs: FilterDef[] = useMemo(() => {
    const deps = departments
      ? departments.map((d) => ({ value: String(d.id), label: unitLabel(d.path || d.name, d.type) }))
      : [...new Map(items.filter((r) => r.departmentId != null).map((r) => [r.departmentId, r.departmentName ?? ''])).entries()].map(([id, name]) => ({ value: String(id), label: name }));
    return [
      { key: 'status', label: 'Status', options: ACTION_STATUS_OPTIONS, defaultValue: 'OPEN' },
      { key: 'overdue', label: 'Overdue only', kind: 'toggle' },
      { key: 'owner', label: 'Owner', searchable: true, options: (data?.owners ?? []).map((o) => ({ value: String(o.id), label: o.name })) },
      { key: 'period', label: 'Period', options: periods },
      { key: 'department', label: 'Org unit (and below)', searchable: true, options: deps },
      ...labelFilterDefs(labelList),
    ] as FilterDef[];
  }, [departments, items, labelList, data, periods]);

  const openChange = async (a: Action) => {
    try {
      const pr = await reviewApi.planReviews(a.planId);
      setEditing({ action: a, owners: pr.owners });
    } catch (e) {
      setError(e);
    }
  };

  const withKind = useUnitKinds();
  const columns: DataColumn<Action>[] = useMemo(() => [
    {
      key: 'text', header: 'Action', alwaysVisible: true,
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 14, fontWeight: 500, textDecoration: a.status === 'DROPPED' ? 'line-through' : 'none' }}>{a.text}</Typography>
          {a.note && <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', fontStyle: 'italic' }}>{a.note}</Typography>}
        </Stack>
      ),
      sortValue: (a) => a.text,
      exportValue: (a) => a.text,
    },
    {
      key: 'owner', header: 'Owner',
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 13.5 }}>{a.ownerName}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{a.owner.isThePerson ? 'the person' : `manager of ${a.employeeName}`}</Typography>
        </Stack>
      ),
      sortValue: (a) => a.ownerName,
      exportValue: (a) => a.ownerName,
    },
    {
      key: 'person', header: 'Plan of',
      render: (a) => (
        <Stack spacing={0.25}>
          <Typography sx={{ fontSize: 13.5 }}>{a.employeeName}</Typography>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>{[a.periodName, a.review?.label].filter(Boolean).join(' · ')}</Typography>
          {a.employeeCode && <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{a.employeeCode}</Mono>}
        </Stack>
      ),
      sortValue: (a) => a.employeeName,
      exportValue: (a) => `${a.employeeName} · ${a.periodName}`,
    },
    { key: 'department', header: 'Org unit', render: (a) => withKind(a.departmentName) || '—', sortValue: (a) => a.departmentName ?? '' },
    {
      key: 'due', header: 'Due', width: 170,
      render: (a) => (a.status === 'OPEN'
        ? <DueChip dueDate={a.dueDate} overdue={a.overdue} daysOverdue={a.daysOverdue} />
        : <ToneBadge tone={a.status === 'DONE' ? 'success' : 'neutral'} label={a.status === 'DONE' && a.doneOn ? `Done ${longDay(a.doneOn)}` : a.statusLabel} />),
      sortValue: (a) => `${a.status === 'OPEN' ? (a.overdue ? 0 : 1) : 2}${a.dueDate}`,
      exportValue: (a) => `${a.statusLabel} · due ${a.dueDate}${a.overdue ? ' (overdue)' : ''}`,
    },
    {
      key: 'do', header: '', width: 210, align: 'right',
      render: (a) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          {a.can?.done && <Button size="small" onClick={() => setDoneFor(a)}>Done</Button>}
          {a.can?.edit && <Button size="small" onClick={() => void openChange(a)}>Change</Button>}
          {a.can?.drop && <Button size="small" color="inherit" onClick={() => setDropFor(a)}>Drop</Button>}
        </Box>
      ),
      exportValue: () => '',
    },
  ], [withKind]);

  return (
    <>
      <PageHeader title="Actions" subtitle="what was agreed in reviews and plans — who does it, by when" />
      {data && (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5 }}>
          {data.counts.open} open, of which {data.counts.overdue} overdue. Actions are added from a review or a plan.
        </Typography>
      )}
      <ListToolbar
        filters={filters}
        defs={defs}
        shown={data?.count ?? items.length}
        total={data?.total ?? items.length}
        noun={['action', 'actions']}
        searchPlaceholder="Search by action, owner or person"
      />
      {error != null && <ErrorNotice error={error} onRetry={load} sx={{ mb: 2 }} />}
      {loading && !data ? <ListSkeleton rows={6} /> : (
        <DataTable
          rows={items}
          columns={columns}
          getRowId={(a) => a.id}
          onRowClick={(a) => (a.reviewId ? navigate(reviewApi.reviewPath(company, a.reviewId)) : navigate(`/${company}/cf_hrms/plans/${a.planId}`))}
          loading={loading}
          storageKey="cf_hrms.actions"
          exportName="actions"
          empty={filters.isFiltered ? (
            <EmptyState icon={<TaskAltOutlined />} title="No actions match these filters" hint="Clear the search or the filters." action={<Button size="small" onClick={filters.clear}>Clear the filters</Button>} />
          ) : (
            <EmptyState icon={<TaskAltOutlined />} title="No open actions" hint="Actions are added on a review or on a plan's page." />
          )}
        />
      )}

      {editing && (
        <ActionDialog
          open
          action={editing.action}
          owners={editing.owners}
          onClose={() => setEditing(null)}
          onSubmit={async (body) => {
            await reviewApi.changeAction(editing.action.id, { text: body.text, ownerEmployeeId: body.ownerEmployeeId, dueDate: body.dueDate, note: body.note });
            toast.success('Action changed.');
            load();
          }}
        />
      )}
      <PromptDialog
        open={!!doneFor}
        title="Mark this action done?"
        body={doneFor?.text}
        label="Note (optional)"
        required={false}
        confirmLabel="Done"
        onClose={() => setDoneFor(null)}
        onConfirm={async (note) => { if (!doneFor) return; await reviewApi.actionDone(doneFor.id, note.trim() || undefined); toast.success('Action done.'); load(); }}
      />
      <PromptDialog
        open={!!dropFor}
        title="Drop this action?"
        body="A dropped action is kept, with the reason."
        label="Why is it dropped?"
        required
        confirmLabel="Drop"
        danger
        onClose={() => setDropFor(null)}
        onConfirm={async (note) => { if (!dropFor) return; await reviewApi.dropAction(dropFor.id, note.trim()); toast.success('Action dropped.'); load(); }}
      />
    </>
  );
}
