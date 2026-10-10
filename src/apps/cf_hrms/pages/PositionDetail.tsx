import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import {
  CrossLink, DetailHeader, DetailLayout, DetailSkeleton, EmptyState, ErrorNotice,
  FactItem, Mono, SectionCard, StatusBadge, Surface, ToneBadge,
  useDetailTitle, useIsPermitted, useToast,
} from '@shared/ui';
import type { DetailTab, StatusTone } from '@shared/ui';
import type {
  PositionContextRow, PositionOccupant, PositionOptions, PositionRow,
} from '../api/positions';
import { positionsApi } from '../api/positions';
import type { ResolvedRelationship } from '../api/assignments';
import { PositionContextDialog, PositionFormDialog, PositionSiblingDialog } from '../components/PositionDialogs';
import { SeatJobContentEditor } from '../components/SeatJobContentEditor';
import { PositionShiftControl } from '../components/PositionShiftControl';
import { HiringEntry } from '../components/HiringEntry';
import { PositionReportingDialog } from '../components/ReportingDialogs';
import { ReportingRowList } from '../components/ReportingRows';
import { usePositionRemoval } from '../components/usePositionRemoval';

/**
 * One position (DESIGN_SYSTEM.md §4.3 Record).
 *
 * The record of a POSITION (one chair, one person, one shift), not of a person.
 * Its tabs are the four things a position has that a person does not: the
 * contexts it covers, the FORMAL reporting that survives it being empty, whoever
 * currently holds it, and its job content —
 * what its role says, with anything this position does differently marked and
 * editable in plain words (`SeatJobContentEditor`, which replaced the
 * "Overrides" tab on 2026-10-10). `?tab=job&edit=1` opens that tab in edit mode.
 *
 * Formal reporting here is many rows on purpose — a primary line and a scoped
 * functional line are two rows on ONE position, never two positions and never a
 * second role invented to hold the second manager (v1.1 §13.1).
 */

const STATUS_TONES: Record<string, StatusTone> = {
  DRAFT: 'warning', ACTIVE: 'success', FROZEN: 'info', CLOSED: 'neutral',
  PLANNED: 'info', SUSPENDED: 'warning', ENDED: 'neutral',
};

export default function PositionDetail() {
  const { company = '', id = '' } = useParams<{ company: string; id: string }>();
  const positionId = Number(id);
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const toast = useToast();
  const navigate = useNavigate();

  const [position, setPosition] = useState<PositionRow | null>(null);
  const [options, setOptions] = useState<PositionOptions | null>(null);
  const [contexts, setContexts] = useState<PositionContextRow[]>([]);
  const [reporting, setReporting] = useState<ResolvedRelationship[]>([]);
  const [directReports, setDirectReports] = useState<{ id: number; fromPositionId: number; fromPositionTitle: string | null; relationshipTypeName: string | null }[]>([]);
  const [occupants, setOccupants] = useState<PositionOccupant[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [search] = useSearchParams();
  const [tab, setTab] = useState(search.get('tab') === 'job' ? 'job' : 'overview');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [addingReporting, setAddingReporting] = useState(false);
  // Close or delete this position; the dialog reads what it would do to the team first. A deleted position has no page to stay on.
  const removal = usePositionRemoval({ onDone: (r) => { if (r.deletedIds) navigate(`/${company}/cf_hrms/positions`); else load(); } });

  const load = useCallback(() => {
    if (!Number.isInteger(positionId) || positionId <= 0) { setError(new Error('That is not a position id.')); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      positionsApi.get(positionId),
      positionsApi.contexts(positionId),
      positionsApi.resolvedReporting(positionId),
      positionsApi.reporting(positionId),
      positionsApi.occupants(positionId),
    ])
      .then(([p, c, rr, r, o]) => {
        setPosition(p.position);
        setContexts(c.items);
        setReporting(rr.relationships);
        setDirectReports(r.directReports.map((d) => ({
          id: d.id, fromPositionId: d.fromPositionId, fromPositionTitle: d.fromPositionTitle, relationshipTypeName: d.relationshipTypeName,
        })));
        setOccupants(o.items);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [positionId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { positionsApi.options().then(setOptions).catch(() => setOptions(null)); }, []);
  useDetailTitle(position?.displayTitle ?? null);

  if (loading && !position) return <DetailSkeleton />;
  if (error && !position) return <ErrorNotice error={error} onRetry={load} />;
  if (!position) return null;
  const isVacant = position.occupant === null || (position.occupant === undefined && position.filledCount === 0);
  const shiftFact = (
    <PositionShiftControl
      positionId={position.id}
      shift={position.shift ?? (position.shiftName ? { id: position.defaultShiftId, code: position.shiftCode, name: position.shiftName } : null)}
      occupantName={position.occupant?.name ?? null}
      onChanged={() => load()}
    />
  );
  const vacantPaths = isVacant && canManage ? (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Fill this position</Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
        <Button size="small" variant="outlined" onClick={() => navigate(`/${company}/cf_hrms/assignments?new=1&positionId=${position.id}`)}>Move an existing employee here</Button>
        <HiringEntry positionId={position.id} positionCode={position.positionCode} roleTitle={position.roleTitle} onChanged={() => load()} />
      </Stack>
    </Stack>
  ) : null;
  const personFact = isVacant
    ? 'Vacant'
    : position.occupant
      ? <CrossLink label={position.occupant.name} to={`/${company}/cf_hrms/employees/${position.occupant.employeeId}`} />
      : 'Filled';

  const tabs: DetailTab[] = [
    { value: 'overview', label: 'Overview' },
    // Machines and areas are departments now (plan §9.4). The tab stays only for
    // a company that still has work contexts recorded, or a position still linked to one.
    ...(contexts.length > 0 || (options?.workContexts?.length ?? 0) > 0
      ? [{ value: 'contexts', label: 'Work contexts', count: contexts.length }]
      : []),
    { value: 'reporting', label: 'Formal reporting', count: reporting.length },
    { value: 'occupants', label: 'Person', count: occupants.filter((o) => o.liveOnDate).length },
    { value: 'job', label: 'Job content' },
  ];

  return (
    <>
      <DetailLayout
        header={
          <DetailHeader
            code={<Mono>{position.positionCode ?? `#${position.id}`}</Mono>}
            title={position.displayTitle}
            badges={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <StatusBadge status={position.status} map={STATUS_TONES} />
                {isVacant
                  ? <ToneBadge tone="neutral" noIcon label="Vacant" />
                  : <ToneBadge tone="success" noIcon label="Filled" />}
              </Stack>
            }
            subtitle={position.roleTitle ? `The role is ${position.roleTitle}` : undefined}
            actions={
              canManage && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<ContentCopyRounded />} onClick={() => setAdding(true)}>Add a position like this</Button>
                  <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button>
                  <Button size="small" variant="outlined" color="inherit" startIcon={<DeleteOutlineRounded />} disabled={removal.busyId === position.id} onClick={() => { void removal.start(position.id); }}>Close or delete…</Button>
                </Stack>
              )
            }
            facts={
              <>
                <FactItem label="Person" value={personFact} />
                <FactItem label="Shift" value={shiftFact} />
              </>
            }
          />
        }
        crossLinks={
          <>
            <CrossLink label={position.roleTitle ?? 'Role'} to={`/${company}/cf_hrms/roles/${position.roleId}`} />
            {position.departmentId && <CrossLink label={position.departmentName ?? 'Department'} to={`/${company}/cf_hrms/departments`} />}
            {position.locationId && <CrossLink label={position.locationName ?? 'Location'} to={`/${company}/cf_hrms/locations`} />}
            <CrossLink label="Org chart" to={`/${company}/cf_hrms/org-chart`} />
            <CrossLink
              label="Work assignments"
              count={occupants.length}
              to={`/${company}/cf_hrms/assignments?positionId=${position.id}`}
            />
          </>
        }
        tabs={tabs}
        active={tab}
        onTab={setTab}
      >
        {tab === 'overview' && (
          <SectionCard title="The position">
            <Stack spacing={1.25}>
              <FactItem label="Role" value={<CrossLink label={position.roleTitle ?? '—'} to={`/${company}/cf_hrms/roles/${position.roleId}`} />} />
              <FactItem label="Department" value={position.departmentName ?? 'Not set'} />
              <FactItem label="Location" value={position.locationName ?? 'Not set'} />
              <FactItem label="Person" value={personFact} />
              <FactItem label="Shift" value={shiftFact} />
              <FactItem label="Status" value={<StatusBadge status={position.status} map={STATUS_TONES} />} />
              <FactItem label="Effective" value={<Mono>{position.effectiveFrom ?? '—'}{position.effectiveTo ? ` → ${position.effectiveTo}` : ''}</Mono>} />
            </Stack>
            {vacantPaths}
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 2 }}>
              A vacancy here is a fact to plan against, not an error. A position with no occupant is
              still a real part of the organisation's design, and its formal reporting still stands.
            </Typography>
          </SectionCard>
        )}

        {tab === 'contexts' && (
          <SectionCard
            title="Work contexts"
            subtitle="The machines, lines, areas or projects this position covers — linked, never cloned per machine."
            action={canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingContext(true)}>Add context</Button>}
          >
            {contexts.length === 0 ? (
              <EmptyState
                icon={<PrecisionManufacturingRounded />}
                title="No work contexts linked"
                hint="A shared position — one helper serving four machines — is this one position with four context links."
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
                      <Tooltip title="Remove this link">
                        <IconButton
                          size="small"
                          aria-label={`Remove ${c.workContextName}`}
                          onClick={async () => { await positionsApi.removeContext(c.id); toast.success('Context unlinked'); load(); }}
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

        {tab === 'reporting' && (
          <Stack spacing={2}>
            <SectionCard
              title="Formal reporting"
              subtitle="Position to position. This is the design that survives a vacancy and a change of people — several rows are normal."
              action={canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingReporting(true)}>Add line</Button>}
            >
              <ReportingRowList
                rows={reporting}
                companySlug={company}
                emptyTitle="No formal reporting line"
                emptyHint="This position has no manager in the organisation's design yet. A primary line plus a scoped functional or dotted line are separate rows on this one position."
                emptyAction={canManage ? <Button size="small" variant="contained" onClick={() => setAddingReporting(true)}>Add line</Button> : undefined}
                rowActions={(r) => canManage ? (
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="End this line today. History keeps it.">
                      <IconButton
                        size="small"
                        aria-label="End this reporting line"
                        onClick={async () => { await positionsApi.endReporting(r.id); toast.success('Reporting line ended'); load(); }}
                      >
                        <EventBusyRounded fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ) : null}
              />
            </SectionCard>

            <SectionCard title="Reports into this position" subtitle="Positions whose formal line points here.">
              {directReports.length === 0 ? (
                <EmptyState title="Nobody reports to this position" hint="No position names this one as its manager." />
              ) : (
                <Stack spacing={1}>
                  {directReports.map((d) => (
                    <Surface key={d.id} e={1} bordered sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <CrossLink label={d.fromPositionTitle ?? `Position ${d.fromPositionId}`} to={`/${company}/cf_hrms/positions/${d.fromPositionId}`} />
                      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>{d.relationshipTypeName}</Typography>
                    </Surface>
                  ))}
                </Stack>
              )}
            </SectionCard>
          </Stack>
        )}

        {tab === 'occupants' && (
          <SectionCard
            title="Person"
            subtitle={isVacant ? 'This position is vacant.' : 'One person holds this position.'}
          >
            {occupants.length === 0 ? (
              <EmptyState
                icon={<GroupsRounded />}
                title="Nobody holds this position"
                hint="A vacant position is a fact, not a fault. Its formal reporting still stands and the vacancy is countable."
              />
            ) : (
              <Stack spacing={1}>
                {occupants.map((o) => (
                  <Surface key={o.id} e={1} bordered sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <CrossLink label={o.employeeName} to={`/${company}/cf_hrms/employees/${o.employeeId}`} />
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', flex: 1 }}>
                      {o.assignmentTitle ?? o.roleTitle ?? '—'}
                      {o.allocationPercent != null ? ` · ${o.allocationPercent}%` : ''}
                    </Typography>
                    <StatusBadge status={o.status} map={STATUS_TONES} />
                    <CrossLink label="Open assignment" to={`/${company}/cf_hrms/assignments/${o.id}`} />
                  </Surface>
                ))}
              </Stack>
            )}
          </SectionCard>
        )}

        {tab === 'job' && (
          <SeatJobContentEditor
            positionId={position.id}
            company={company}
            canManage={canManage}
            startEditing={search.get('edit') === '1'}
          />
        )}
      </DetailLayout>

      {removal.dialog}
      <PositionFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        onDone={() => { setEditing(false); load(); }}
        options={options}
        position={position}
      />
      <PositionSiblingDialog
        open={adding}
        onClose={() => setAdding(false)}
        onDone={(newId) => { setAdding(false); navigate(`/${company}/cf_hrms/positions/${newId}`); }}
        position={position}
        options={options}
      />
      <PositionContextDialog
        open={addingContext}
        onClose={() => setAddingContext(false)}
        onDone={() => { setAddingContext(false); load(); }}
        positionId={position.id}
        options={options}
      />
      <PositionReportingDialog
        open={addingReporting}
        onClose={() => setAddingReporting(false)}
        onDone={() => { setAddingReporting(false); load(); }}
        positionId={position.id}
        options={options}
      />
      {error && <ErrorNotice error={error} onRetry={load} sx={{ mt: 2 }} />}
      {!canManage && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 2 }}>
          Read-only: you do not hold <Mono>cf_hrms_org_manage</Mono>.
        </Typography>
      )}
    </>
  );
}
