import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import SupervisorAccountRounded from '@mui/icons-material/SupervisorAccountRounded';
import {
  ConfirmDialog, CrossLink, DetailHeader, DetailLayout, DetailSkeleton, EmptyState, ErrorNotice,
  FactItem, Mono, SectionCard, StatusBadge, Surface, ToneBadge,
  useDetailTitle, useIsPermitted, useToast,
} from '@shared/ui';
import type { DetailTab, StatusTone } from '@shared/ui';
import type {
  AssignmentContextRow, AssignmentOptions, AssignmentRow, ResolvedReportingResult, SiblingAssignment,
} from '../api/assignments';
import { assignmentsApi } from '../api/assignments';
import type { ContentOverrideRow } from '../api/positions';
import { AssignmentContextDialog, AssignmentFormDialog } from '../components/AssignmentDialogs';
import { ContentOverrideDialog } from '../components/PositionDialogs';
import { AssignmentReportingDialog } from '../components/ReportingDialogs';
import { ReportingRowList } from '../components/ReportingRows';

/**
 * One work assignment (§4.3 Record) — the centre of the model.
 *
 * The Reporting tab is the point of this screen. It shows the RESOLVED SET: the
 * position's formal defaults and this assignment's own rows together, each
 * labelled with the layer it came from, each with its kind and its scope, and
 * the formal rows this assignment has replaced kept visible underneath rather
 * than quietly dropped.
 *
 * "Add a manager" is a first-class button on that tab, and it is the ONLY way
 * this screen offers to record a second manager. There is deliberately no path
 * from "another manager" to "another role" or "another assignment" — that is
 * the mistake taxonomy §17 exists to prevent, and a UI that makes the wrong
 * move easy will get it made.
 */

const STATUS_TONES: Record<string, StatusTone> = {
  PLANNED: 'info', ACTIVE: 'success', SUSPENDED: 'warning', ENDED: 'neutral',
};

export default function AssignmentDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const assignmentId = Number(id);
  const can = useIsPermitted();
  const canManage = can('cf_hrms_assignments_manage');
  const toast = useToast();

  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [siblings, setSiblings] = useState<SiblingAssignment[]>([]);
  const [options, setOptions] = useState<AssignmentOptions | null>(null);
  const [contexts, setContexts] = useState<AssignmentContextRow[]>([]);
  const [resolved, setResolved] = useState<ResolvedReportingResult | null>(null);
  const [overrides, setOverrides] = useState<ContentOverrideRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [addingManager, setAddingManager] = useState(false);
  const [addingOverride, setAddingOverride] = useState(false);
  const [ending, setEnding] = useState(false);

  const load = useCallback(() => {
    if (!Number.isInteger(assignmentId) || assignmentId <= 0) { setError(new Error('That is not an assignment id.')); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      assignmentsApi.get(assignmentId),
      assignmentsApi.contexts(assignmentId),
      assignmentsApi.resolvedReporting(assignmentId),
      assignmentsApi.overrides(assignmentId),
    ])
      .then(([a, c, r, o]) => {
        setAssignment(a.assignment);
        setSiblings(a.siblingAssignments);
        setContexts(c.items);
        setResolved(r);
        setOverrides(o.items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [assignmentId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { assignmentsApi.options().then(setOptions).catch(() => setOptions(null)); }, []);
  useDetailTitle(assignment ? `${assignment.employeeName} · ${assignment.roleTitle ?? 'assignment'}` : null);

  if (loading && !assignment) return <DetailSkeleton />;
  if (error && !assignment) return <ErrorNotice error={error} onRetry={load} />;
  if (!assignment) return null;

  const rows = resolved?.relationships ?? [];
  const superseded = resolved?.superseded ?? [];

  const tabs: DetailTab[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'reporting', label: 'Reporting', count: rows.length },
    { value: 'contexts', label: 'Contexts', count: contexts.length },
    { value: 'overrides', label: 'Overrides', count: overrides.length },
  ];

  return (
    <>
      <DetailLayout
        header={
          <DetailHeader
            code={<Mono>{assignment.employeeCode ?? `#${assignment.id}`}</Mono>}
            title={assignment.employeeName}
            badges={
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                <StatusBadge status={assignment.status} map={STATUS_TONES} />
                {assignment.isPrimary && <ToneBadge tone="success" noIcon label="Primary assignment" />}
                {!assignment.positionId && (
                  <Tooltip title="Position is optional. Role is required.">
                    <span><ToneBadge tone="neutral" noIcon label="No sanctioned position" /></span>
                  </Tooltip>
                )}
                {assignment.roleDiffersFromPosition && <ToneBadge tone="warning" label="Role differs from the seat" />}
              </Stack>
            }
            subtitle={assignment.assignmentTitle ?? assignment.roleTitle ?? undefined}
            actions={
              canManage && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button>
                  {assignment.status !== 'ENDED' && (
                    <Button size="small" variant="outlined" color="warning" startIcon={<EventBusyRounded />} onClick={() => setEnding(true)}>End</Button>
                  )}
                </Stack>
              )
            }
            facts={
              <>
                <FactItem label="Role" value={assignment.roleTitle ?? '—'} />
                <FactItem label="Allocation" value={<Mono>{assignment.allocationPercent == null ? '—' : `${assignment.allocationPercent}%`}</Mono>} />
                <FactItem label="Managers" value={<Mono>{rows.length}</Mono>} />
                <FactItem label="Effective" value={<Mono>{assignment.effectiveFrom ?? '—'}{assignment.effectiveTo ? ` → ${assignment.effectiveTo}` : ''}</Mono>} />
              </>
            }
          />
        }
        crossLinks={
          <>
            <CrossLink label={assignment.employeeName} to={`/${company}/cf_hrms/employees/${assignment.employeeId}`} />
            <CrossLink label={assignment.roleTitle ?? 'Role'} to={`/${company}/cf_hrms/roles/${assignment.roleId}`} />
            {assignment.positionId && (
              <CrossLink label={assignment.positionCode ?? 'Position'} to={`/${company}/cf_hrms/positions/${assignment.positionId}`} />
            )}
            {assignment.departmentId && <CrossLink label={assignment.departmentName ?? 'Department'} to={`/${company}/cf_hrms/departments`} />}
            {assignment.locationId && <CrossLink label={assignment.locationName ?? 'Location'} to={`/${company}/cf_hrms/locations`} />}
            <CrossLink
              label="This person's other assignments"
              count={siblings.length}
              to={`/${company}/cf_hrms/assignments?employeeId=${assignment.employeeId}`}
            />
          </>
        }
        tabs={tabs}
        active={tab}
        onTab={setTab}
      >
        {tab === 'overview' && (
          <Stack spacing={2}>
            <SectionCard title="The work">
              <Stack spacing={1.25}>
                <FactItem label="Person" value={<CrossLink label={assignment.employeeName} to={`/${company}/cf_hrms/employees/${assignment.employeeId}`} />} />
                <FactItem label="Role (required)" value={<CrossLink label={assignment.roleTitle ?? '—'} to={`/${company}/cf_hrms/roles/${assignment.roleId}`} />} />
                <FactItem
                  label="Position (optional)"
                  value={assignment.positionId
                    ? <CrossLink label={assignment.positionTitle ?? assignment.positionCode ?? '—'} to={`/${company}/cf_hrms/positions/${assignment.positionId}`} />
                    : 'No sanctioned position — the work is real either way.'}
                />
                <FactItem label="Department" value={assignment.departmentName ?? 'Not set'} />
                <FactItem label="Location" value={assignment.locationName ?? 'Not set'} />
                <FactItem label="Default shift" value={assignment.shiftCode ? `${assignment.shiftCode} · ${assignment.shiftName}` : 'Not set'} />
                <FactItem label="Allocation" value={<Mono>{assignment.allocationPercent == null ? 'Not recorded' : `${assignment.allocationPercent}%`}</Mono>} />
                {assignment.reason && <FactItem label="Why it exists" value={assignment.reason} />}
              </Stack>
            </SectionCard>

            {assignment.employeeOverAllocated && (
              <Alert severity="warning" sx={{ fontSize: 13 }}>
                {assignment.employeeName} is committed to {assignment.employeeAllocationTotal}% across{' '}
                {assignment.employeeAssignmentCount} live assignments. Allocation is advisory — this is
                recorded so it can be fixed, not refused.
              </Alert>
            )}

            <SectionCard
              title="This person's other assignments"
              subtitle="One employee, many concurrent assignments. Each has its own role, allocation and managers."
            >
              {siblings.length === 0 ? (
                <EmptyState title="This is their only assignment" hint="Nothing else is recorded for this person." />
              ) : (
                <Stack spacing={1}>
                  {siblings.map((s) => (
                    <Surface key={s.id} e={1} bordered sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <CrossLink label={s.assignmentTitle ?? s.roleTitle ?? `Assignment ${s.id}`} to={`/${company}/cf_hrms/assignments/${s.id}`} />
                      <Mono sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flex: 1 }}>
                        {s.allocationPercent == null ? '—' : `${s.allocationPercent}%`}
                        {s.positionId ? '' : ' · no position'}
                      </Mono>
                      {s.isPrimary && <ToneBadge tone="success" noIcon label="Primary" />}
                      <StatusBadge status={s.status} map={STATUS_TONES} />
                    </Surface>
                  ))}
                </Stack>
              )}
            </SectionCard>
          </Stack>
        )}

        {tab === 'reporting' && (
          <Stack spacing={2}>
            <SectionCard
              title="Who has authority over this work"
              subtitle="Every manager, of every kind, over every scope — from the position's formal design and from this assignment."
              action={canManage && <Button size="small" variant="contained" startIcon={<AddRounded />} onClick={() => setAddingManager(true)}>Add a manager</Button>}
            >
              <Alert severity="info" sx={{ fontSize: 13, mb: 2 }}>
                A second manager needs no second role, no second position and no second assignment.
                When a manager's authority covers only part of the work, give the row a scope —
                "Statutory compliance", one machine, one project.
              </Alert>

              <ReportingRowList
                rows={rows}
                companySlug={company}
                emptyTitle="Nobody has authority over this work"
                emptyHint="Neither this assignment nor its position records a manager. Add one — it is a row, not a new job."
                emptyAction={canManage ? <Button size="small" variant="contained" startIcon={<SupervisorAccountRounded />} onClick={() => setAddingManager(true)}>Add a manager</Button> : undefined}
                rowActions={(r) => (canManage && r.origin === 'ASSIGNMENT') ? (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="End this line today. It is kept in history, not deleted.">
                      <IconButton
                        size="small"
                        aria-label="End this reporting line"
                        onClick={async () => { await assignmentsApi.endReporting(r.id); toast.success('Reporting line ended'); load(); }}
                      >
                        <EventBusyRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ) : null}
              />
            </SectionCard>

            {superseded.length > 0 && (
              <SectionCard
                title="Replaced for this person"
                subtitle="The position's formal design still says this; this assignment overrides it. Both facts are kept."
              >
                <ReportingRowList rows={superseded} companySlug={company} muted />
              </SectionCard>
            )}

            {assignment.positionId == null && (
              <Alert severity="info" sx={{ fontSize: 13 }}>
                This assignment has no position, so there is no formal layer to inherit from. Every
                line above is recorded directly on the assignment — which is exactly how an SME that
                has not yet drawn its org chart should look.
              </Alert>
            )}
          </Stack>
        )}

        {tab === 'contexts' && (
          <SectionCard
            title="Work contexts"
            subtitle="The machines, lines, areas or projects this work covers. Contexts are never managers."
            action={canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingContext(true)}>Add context</Button>}
          >
            {contexts.length === 0 ? (
              <EmptyState
                icon={<PrecisionManufacturingRounded />}
                title="No work contexts"
                hint="A helper covering four machines is this ONE assignment with four context links, never four assignments."
                action={canManage ? <Button size="small" variant="contained" onClick={() => setAddingContext(true)}>Add context</Button> : undefined}
              />
            ) : (
              <Stack spacing={1}>
                {contexts.map((c) => (
                  <Surface key={c.id} e={1} bordered sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{c.workContextName}</Typography>
                    <ToneBadge tone="neutral" noIcon label={c.contextType ?? '—'} />
                    {c.isPrimary && <ToneBadge tone="success" noIcon label="Primary" />}
                    {canManage && (
                      <Tooltip title="Unlink this context">
                        <IconButton
                          size="small"
                          aria-label={`Unlink ${c.workContextName}`}
                          onClick={async () => { await assignmentsApi.removeContext(c.id); toast.success('Context unlinked'); load(); }}
                        >
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Surface>
                ))}
              </Stack>
            )}
          </SectionCard>
        )}

        {tab === 'overrides' && (
          <SectionCard
            title="Content overlays"
            subtitle="The last layer of resolution: role → position → this assignment."
            action={canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingOverride(true)}>Add overlay</Button>}
          >
            <Alert severity="info" sx={{ fontSize: 13, mb: 2 }}>
              Use these sparingly. They are for what is genuinely true of ONE person's assignment and
              not of the role — a temporary extra duty, a responsibility suspended during training.
              Normal content belongs on the Role, or every JD for that role will be wrong.
            </Alert>
            {overrides.length === 0 ? (
              <EmptyState
                icon={<LayersRounded />}
                title="No overlays"
                hint="This assignment carries exactly what its role and position say. That is the preferred state."
                action={canManage ? <Button size="small" variant="contained" onClick={() => setAddingOverride(true)}>Add overlay</Button> : undefined}
              />
            ) : (
              <Stack spacing={1}>
                {overrides.map((o) => (
                  <Surface key={o.id} e={1} bordered sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <ToneBadge tone={o.action === 'SUPPRESS' ? 'danger' : o.action === 'OVERRIDE' ? 'warning' : 'success'} noIcon label={o.action} />
                    <ToneBadge tone="neutral" noIcon label={o.contentType} />
                    <Typography sx={{ fontSize: 14, flex: 1 }}>{o.definitionName ?? '—'}</Typography>
                    {o.reason && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{o.reason}</Typography>}
                    {canManage && (
                      <IconButton
                        size="small"
                        aria-label="Remove this overlay"
                        onClick={async () => { await assignmentsApi.removeOverride(o.id); toast.success('Overlay removed'); load(); }}
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    )}
                  </Surface>
                ))}
              </Stack>
            )}
          </SectionCard>
        )}
      </DetailLayout>

      <AssignmentFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        onDone={() => { setEditing(false); load(); }}
        options={options}
        assignment={assignment}
      />
      <AssignmentContextDialog
        open={addingContext}
        onClose={() => setAddingContext(false)}
        onDone={() => { setAddingContext(false); load(); }}
        assignmentId={assignment.id}
        options={options}
      />
      <AssignmentReportingDialog
        open={addingManager}
        onClose={() => setAddingManager(false)}
        onDone={() => { setAddingManager(false); load(); }}
        assignmentId={assignment.id}
        options={options}
        subjectEmployeeId={assignment.employeeId}
      />
      <ContentOverrideDialog
        open={addingOverride}
        onClose={() => setAddingOverride(false)}
        subtitle="For this one person's assignment only."
        definitions={{
          KRA: options?.kraDefinitions ?? [],
          RESPONSIBILITY: options?.responsibilityDefinitions ?? [],
          KPI: options?.kpiDefinitions ?? [],
        }}
        onSubmit={async (body) => {
          await assignmentsApi.addOverride(assignment.id, body);
          setAddingOverride(false);
          load();
        }}
      />
      <ConfirmDialog
        open={ending}
        title="End this assignment"
        entityName={assignment.assignmentTitle ?? assignment.roleTitle ?? `Assignment ${assignment.id}`}
        body="Its reporting lines and work contexts are ended with it — kept in history, never deleted."
        confirmLabel="End assignment"
        onClose={() => setEnding(false)}
        onConfirm={async () => {
          const r = await assignmentsApi.end(assignment.id);
          toast.success(`Ended. ${r.endedReportingRows} reporting line${r.endedReportingRows === 1 ? '' : 's'} and ${r.endedContextLinks} context link${r.endedContextLinks === 1 ? '' : 's'} ended with it.`);
          setEnding(false);
          load();
        }}
      />

      {error && <ErrorNotice error={error} onRetry={load} sx={{ mt: 2 }} />}
      {!canManage && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 2 }}>
          Read-only: you do not hold <Mono>cf_hrms_assignments_manage</Mono>.
        </Typography>
      )}
    </>
  );
}
