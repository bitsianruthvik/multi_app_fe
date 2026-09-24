import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import LayersRounded from '@mui/icons-material/LayersRounded';
import {
  CrossLink, DetailHeader, DetailLayout, DetailSkeleton, EmptyState, ErrorNotice,
  FactItem, Mono, SectionCard, StatusBadge, Surface, ToneBadge,
  useDetailTitle, useIsPermitted, useToast,
} from '@shared/ui';
import type { DetailTab, StatusTone } from '@shared/ui';
import type {
  ContentOverrideRow, PositionContextRow, PositionOccupant, PositionOptions, PositionRow,
} from '../api/positions';
import { positionsApi } from '../api/positions';
import type { ResolvedRelationship } from '../api/assignments';
import { ContentOverrideDialog, PositionContextDialog, PositionFormDialog } from '../components/PositionDialogs';
import { PositionReportingDialog } from '../components/ReportingDialogs';
import { ReportingRowList } from '../components/ReportingRows';

/**
 * One position (DESIGN_SYSTEM.md §4.3 Record).
 *
 * The record of a SEAT, not of a person. Its tabs are the four things a seat
 * has that a person does not: the contexts it covers, the FORMAL reporting that
 * survives it being empty, whoever currently occupies it, and the content it
 * overlays on its role.
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

  const [position, setPosition] = useState<PositionRow | null>(null);
  const [options, setOptions] = useState<PositionOptions | null>(null);
  const [contexts, setContexts] = useState<PositionContextRow[]>([]);
  const [reporting, setReporting] = useState<ResolvedRelationship[]>([]);
  const [directReports, setDirectReports] = useState<{ id: number; fromPositionId: number; fromPositionTitle: string | null; relationshipTypeName: string | null }[]>([]);
  const [occupants, setOccupants] = useState<PositionOccupant[]>([]);
  const [overrides, setOverrides] = useState<ContentOverrideRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [addingReporting, setAddingReporting] = useState(false);
  const [addingOverride, setAddingOverride] = useState(false);

  const load = useCallback(() => {
    if (!Number.isInteger(positionId) || positionId <= 0) { setError(new Error('That is not a position id.')); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      positionsApi.get(positionId),
      positionsApi.contexts(positionId),
      positionsApi.resolvedReporting(positionId),
      positionsApi.reporting(positionId),
      positionsApi.occupants(positionId),
      positionsApi.overrides(positionId),
    ])
      .then(([p, c, rr, r, o, ov]) => {
        setPosition(p.position);
        setContexts(c.items);
        setReporting(rr.relationships);
        setDirectReports(r.directReports.map((d) => ({
          id: d.id, fromPositionId: d.fromPositionId, fromPositionTitle: d.fromPositionTitle, relationshipTypeName: d.relationshipTypeName,
        })));
        setOccupants(o.items);
        setOverrides(ov.items);
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

  const tabs: DetailTab[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'contexts', label: 'Work contexts', count: contexts.length },
    { value: 'reporting', label: 'Formal reporting', count: reporting.length },
    { value: 'occupants', label: 'Occupants', count: occupants.filter((o) => o.liveOnDate).length },
    { value: 'overrides', label: 'Overrides', count: overrides.length },
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
                {position.overFilled
                  ? <ToneBadge tone="warning" label={`${position.filledCount - position.seats} over sanctioned`} />
                  : <ToneBadge tone="neutral" noIcon label={`${position.vacancyCount} vacant of ${position.seats}`} />}
              </Stack>
            }
            subtitle={position.roleTitle ? `Sanctions the role ${position.roleTitle}` : undefined}
            actions={
              canManage && (
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button>
                </Stack>
              )
            }
            facts={
              <>
                <FactItem label="Seats" value={<Mono>{position.seats}</Mono>} />
                <FactItem label="Filled" value={<Mono>{position.filledCount}</Mono>} />
                <FactItem label="Vacant" value={<Mono>{position.vacancyCount}</Mono>} />
                <FactItem label="Default shift" value={position.shiftCode ? `${position.shiftCode} · ${position.shiftName}` : '—'} />
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
          <SectionCard title="The seat">
            <Stack spacing={1.25}>
              <FactItem label="Role" value={<CrossLink label={position.roleTitle ?? '—'} to={`/${company}/cf_hrms/roles/${position.roleId}`} />} />
              <FactItem label="Department" value={position.departmentName ?? 'Not set'} />
              <FactItem label="Location" value={position.locationName ?? 'Not set'} />
              <FactItem
                label="Sanctioned headcount"
                value={
                  <>
                    <Mono>{position.sanctionedHeadcount}</Mono>
                    {position.seats !== position.sanctionedHeadcount && (
                      <Box component="span" sx={{ ml: 0.75, color: 'var(--c-text-2)', fontSize: 13, whiteSpace: 'nowrap' }}>
                        · per shift ({position.seats} across day and night)
                      </Box>
                    )}
                  </>
                }
              />
              <FactItem label="Default shift" value={position.shiftCode ? `${position.shiftCode} · ${position.shiftName}` : 'Not set'} />
              <FactItem label="Status" value={<StatusBadge status={position.status} map={STATUS_TONES} />} />
              <FactItem label="Effective" value={<Mono>{position.effectiveFrom ?? '—'}{position.effectiveTo ? ` → ${position.effectiveTo}` : ''}</Mono>} />
            </Stack>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 2 }}>
              A vacancy here is a fact to plan against, not an error. A position with no occupant is
              still a real part of the organisation's design, and its formal reporting still stands.
            </Typography>
          </SectionCard>
        )}

        {tab === 'contexts' && (
          <SectionCard
            title="Work contexts"
            subtitle="The machines, lines, areas or projects this one seat covers — linked, never cloned per machine."
            action={canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingContext(true)}>Add context</Button>}
          >
            {contexts.length === 0 ? (
              <EmptyState
                icon={<PrecisionManufacturingRounded />}
                title="No work contexts linked"
                hint="A shared seat — one helper serving four machines — is this one position with four context links."
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
                emptyHint="This seat has no manager in the organisation's design yet. A primary line plus a scoped functional or dotted line are separate rows on this one position."
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

            <SectionCard title="Reports into this seat" subtitle="Positions whose formal line points here.">
              {directReports.length === 0 ? (
                <EmptyState title="Nobody reports to this seat" hint="No position names this one as its manager." />
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
            title="Occupants"
            subtitle={`${occupants.filter((o) => o.liveOnDate).length} of ${position.seats} sanctioned seats filled.`}
          >
            {occupants.length === 0 ? (
              <EmptyState
                icon={<GroupsRounded />}
                title="Nobody holds this seat"
                hint="A vacant seat is a fact, not a fault. Its formal reporting still stands and the vacancy is countable."
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

        {tab === 'overrides' && (
          <SectionCard
            title="Content overlays"
            subtitle="What this seat ADDs to, OVERRIDEs or SUPPRESSes from its role's content. Used for a genuine contextual difference, not to copy role content down."
            action={canManage && <Button size="small" startIcon={<AddRounded />} onClick={() => setAddingOverride(true)}>Add overlay</Button>}
          >
            {overrides.length === 0 ? (
              <EmptyState
                icon={<LayersRounded />}
                title="No overlays"
                hint="This seat carries exactly what its role says. That is the normal and preferred state."
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
                        onClick={async () => { await positionsApi.removeOverride(o.id); toast.success('Overlay removed'); load(); }}
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

      <PositionFormDialog
        open={editing}
        onClose={() => setEditing(false)}
        onDone={() => { setEditing(false); load(); }}
        options={options}
        position={position}
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
      <ContentOverrideDialog
        open={addingOverride}
        onClose={() => setAddingOverride(false)}
        subtitle="Applied on top of the role's content, for this seat only."
        definitions={{
          KRA: options?.kraDefinitions ?? [],
          RESPONSIBILITY: options?.responsibilityDefinitions ?? [],
          KPI: options?.kpiDefinitions ?? [],
        }}
        onSubmit={async (body) => {
          await positionsApi.addOverride(position.id, body);
          setAddingOverride(false);
          load();
        }}
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
