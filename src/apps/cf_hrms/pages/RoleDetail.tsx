/**
 * One role and everything a JD is generated from (DESIGN_SYSTEM §4.3 Record).
 *
 * Six tabs, in the order the document reads: what the role is for, the content
 * it is accountable for, what it needs from a person, what it may decide, who it
 * works with, and what it is like to do.
 *
 * TWO THINGS THIS SCREEN IS CAREFUL ABOUT:
 *
 *   Relationships are EXPECTATIONS, not reporting. "Coordinates with Quality" is
 *   a sentence in a JD; who manages the person doing this work is a property of
 *   their Position and Work Assignment and is edited on those screens. The tab
 *   says so, because a tab called "Relationships" on a role screen is exactly
 *   where someone would otherwise go looking for their manager (plan §2 rule 9).
 *
 *   Content is dated, and never overwritten (spec §16). "As on" above the tabs
 *   reads today by default; any other day shows what was, or will be, in force
 *   then — read-only, under a banner that says so. The History tab lists every
 *   change to the role's KRAs, responsibilities and KPIs, newest first.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Box, Button, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Typography } from '@mui/material';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import CallMadeRounded from '@mui/icons-material/CallMadeRounded';
import CallReceivedRounded from '@mui/icons-material/CallReceivedRounded';
import {
  DetailLayout, DetailHeader, CrossLink, FactItem, SectionCard, StatusBadge, ToneBadge, Mono,
  Callout, ErrorNotice, DetailSkeleton, ConfirmDialog, useToast, useCompanySlug,
  useDetailTitle, type DetailTab,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  getRoleContent, deleteRole, pretty, type RoleContent,
} from '../api/roles';
import { RoleFormDialog } from '../components/RoleFormDialog';
import { RolePositionsTab } from '../components/RolePositionsTab';
import { RoleLeavePolicy } from '../components/LeavePolicyLine';
import { RoleContentTab } from '../components/RoleContentTab';
import { RoleContentSection } from '../components/RoleContentSection';
import { ContentCopySheet, type ContentCopyStart } from '../components/ContentCopySheet';
import { AsOnBar, JobHistoryList } from '../components/JobDating';
import { todayIso } from '../components/jobDates';
import { useUnitKinds } from '../components/orgUnits';

export default function RoleDetail() {
  const withKind = useUnitKinds();
  const { id } = useParams<{ id: string }>();
  const roleId = Number(id);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useCan();
  // Edit the role and its content = roles.edit; delete the role = roles.remove.
  const canEdit = can.roles.edit;
  const canRemove = can.roles.remove;
  // Copying is the one thing here two rights can do: a position-only copy
  // needs positions.edit, a role-wide one roles.edit. The sheet offers only
  // the targets that are open to this person.
  const canCopy = canEdit || can.positions.edit;
  const seePositions = can.positions.view;
  const seeDepartments = can.org.view;

  const [content, setContent] = useState<RoleContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // `?tab=content` lands on the editor — where the Departments screen's Edit goes.
  const [search] = useSearchParams();
  const [tab, setTab] = useState(search.get('tab') === 'content' ? 'content' : 'overview');
  const [on, setOn] = useState(todayIso());
  const readOnly = on !== todayIso();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copyStart, setCopyStart] = useState<ContentCopyStart | null>(null);
  const [copyMenu, setCopyMenu] = useState<HTMLElement | null>(null);

  const load = useCallback(async () => {
    if (!Number.isInteger(roleId) || roleId <= 0) {
      setError(new Error('That role id is not a number.'));
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setContent(await getRoleContent(roleId, { on }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [roleId, on]);

  useEffect(() => {
    void load();
  }, [load]);

  const role = content?.role ?? null;
  useDetailTitle(role?.title);

  const tabs = useMemo<DetailTab[]>(() => {
    const c = content?.counts ?? {};
    return [
      { value: 'overview', label: 'Overview' },
      { value: 'content', label: 'Content', count: (c.kras ?? 0) + (c.responsibilities ?? 0) + (c.kpis ?? 0) },
      { value: 'requirements', label: 'Requirements', count: (c.skills ?? 0) + (c.qualifications ?? 0) + (c.experience ?? 0) },
      { value: 'authority', label: 'Authority', count: c.authorities ?? 0 },
      { value: 'relationships', label: 'Relationships', count: c.relationships ?? 0 },
      { value: 'conditions', label: 'Conditions', count: c.conditions ?? 0 },
      ...(seePositions ? [{ value: 'positions', label: 'Positions', count: role?.positionCount }] : []),
      { value: 'history', label: 'History' },
    ];
  }, [content, role?.positionCount, seePositions]);

  if (loading) return <DetailSkeleton />;
  if (error || !content || !role) {
    return <ErrorNotice error={error} fallback="That role could not be loaded." onRetry={() => void load()} />;
  }

  const header = (
    <DetailHeader
      code={role.roleCode ? <Mono>{role.roleCode}</Mono> : undefined}
      title={role.title}
      badges={
        <Stack direction="row" spacing={0.75}>
          <StatusBadge status={role.status} label={pretty(role.status)} />
          {role.jdReady ? (
            <ToneBadge tone="success" label="JD ready" />
          ) : (
            <ToneBadge tone="warning" label={!role.hasPurpose ? 'No purpose' : 'No KRAs'} />
          )}
        </Stack>
      }
      subtitle={role.roleSummary ?? undefined}
      actions={
        canCopy || canEdit || canRemove ? (
          <Stack direction="row" spacing={1}>
            {canCopy && (
              <Button
                size="small"
                startIcon={<ContentCopyRounded />}
                endIcon={<ArrowDropDownRounded />}
                onClick={(e) => setCopyMenu(e.currentTarget)}
                aria-haspopup="menu"
                aria-expanded={!!copyMenu}
              >
                Copy content
              </Button>
            )}
            {canEdit && (
              <Button size="small" startIcon={<EditRounded />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canRemove && (
              <Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setRemoving(true)}>
                Delete
              </Button>
            )}
          </Stack>
        ) : undefined
      }
      facts={
        <>
          <FactItem label="Default org unit" value={withKind(role.departmentName) || '—'} />
          <FactItem label="KRAs" value={role.kraCount} />
          <FactItem label="Responsibilities" value={role.responsibilityCount} />
          <FactItem label="KPIs" value={role.kpiCount} />
          <FactItem label="Positions using it" value={role.positionCount} />
          {/* The role's own leave policy, or that it follows the location; changed from here. */}
          {can.leave.view &&<FactItem label="Leave policy" value={<RoleLeavePolicy roleId={role.id} roleTitle={role.title} company={company} />} />}
          <FactItem
            label="Effective"
            value={role.effectiveFrom ? `${role.effectiveFrom}${role.effectiveTo ? ` → ${role.effectiveTo}` : ''}` : '—'}
          />
        </>
      }
    />
  );

  const crossLinks = (
    <>
      {role.departmentName && seeDepartments && (
        <CrossLink icon={<ApartmentRounded />} label={withKind(role.departmentName)} to={`/${company}/cf_hrms/org-units`} />
      )}
      {seePositions && (
        <CrossLink icon={<WorkOutlineRounded />} label="Positions" count={role.positionCount} to={`/${company}/cf_hrms/positions`} />
      )}
      <CrossLink icon={<FlagRounded />} label="KRA library" to={`/${company}/cf_hrms/libraries?tab=kras`} />
    </>
  );

  /** The day this content is read on (spec §16.4): today by default; another day is read-only. */
  const dateBand = (
    <AsOnBar on={on} onChange={setOn} note="Today’s job. Pick a day to read what was, or will be, expected then." />
  );

  return (
    <>
      <DetailLayout header={header} crossLinks={crossLinks} beforeTabs={tab === 'overview' || tab === 'positions' || tab === 'history' ? undefined : dateBand} tabs={tabs} active={tab} onTab={setTab}>
        {tab === 'positions' && seePositions && <RolePositionsTab roleId={roleId} company={company} />}

        {tab === 'overview' && (
          <Stack spacing={2}>
            <SectionCard
              title="Purpose"
              subtitle="Why this role exists. It is the opening paragraph of every job description generated from it."
              actions={canEdit ? <Button size="small" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button> : undefined}
            >
              {role.rolePurpose ? (
                <Typography sx={{ fontSize: 15, lineHeight: 1.7, maxWidth: 760 }}>{role.rolePurpose}</Typography>
              ) : (
                <Box sx={{ fontSize: 13.5, color: 'var(--c-warning-700)' }}>
                  No purpose yet. A JD generated now would open with a blank line — write one sentence saying what
                  this role is for.
                </Box>
              )}
            </SectionCard>

            {role.roleSummary && (
              <SectionCard title="Summary" subtitle="The scope in one line.">
                <Typography sx={{ fontSize: 14, lineHeight: 1.6, maxWidth: 760 }}>{role.roleSummary}</Typography>
              </SectionCard>
            )}

            <SectionCard title="Placement" subtitle="Where this kind of work usually sits, and when the definition applies.">
              <Stack direction="row" flexWrap="wrap" sx={{ gap: 3 }}>
                <FactItem
                  label="Default org unit"
                  value={
                    role.departmentName && !seeDepartments ? (
                      withKind(role.departmentName)
                    ) : role.departmentName ? (
                      <Box component={Link} to={`/${company}/cf_hrms/org-units`} sx={{ color: 'var(--c-primary-700)', textDecoration: 'none' }}>
                        {withKind(role.departmentName)}
                      </Box>
                    ) : (
                      '—'
                    )
                  }
                />
                <FactItem label="Status" value={<StatusBadge status={role.status} label={pretty(role.status)} />} />
                <FactItem label="Effective from" value={role.effectiveFrom ?? '—'} />
                <FactItem label="Effective to" value={role.effectiveTo ?? '—'} />
              </Stack>
              <Box sx={{ mt: 2, fontSize: 12.5, color: 'var(--c-text-3)', maxWidth: 720, lineHeight: 1.6 }}>
                An org unit here is a default, not a placement. The actual org unit and location belong to the
                Position, and the person doing the work holds that position.
              </Box>
            </SectionCard>

            {(!role.hasPurpose || role.kraCount === 0) && (
              <SectionCard title="Before this role can produce a job description">
                <Stack spacing={1} sx={{ fontSize: 13.5 }}>
                  {!role.hasPurpose && <Box>· Write the purpose — one or two sentences on why the role exists.</Box>}
                  {role.kraCount === 0 && (
                    <Box>
                      · Write at least one KRA, then file the responsibilities and KPIs under it.{' '}
                      <Box component="button" type="button" onClick={() => setTab('content')} sx={{ border: 0, background: 'none', p: 0, font: 'inherit', color: 'var(--c-primary-700)', cursor: 'pointer' }}>
                        Open the Content tab
                      </Box>
                      .
                    </Box>
                  )}
                </Stack>
              </SectionCard>
            )}
          </Stack>
        )}

        {tab === 'content' && <RoleContentTab content={content} onChanged={() => void load()} readOnly={readOnly} />}
        {tab === 'history' && (
          <SectionCard title="History" subtitle="Every change to this role’s KRAs, responsibilities and KPIs, and when it took effect.">
            <JobHistoryList subject={{ type: 'role', id: roleId }} />
          </SectionCard>
        )}

        {tab === 'requirements' && (
          <Stack spacing={2}>
            <RoleContentSection
              readOnly={readOnly}
              roleId={roleId}
              kind="skills"
              rows={content.skills}
              kras={content.kras}
              title="Skills"
              subtitle="What someone must be able to do. Assigned from the skill master, marked required or preferred."
              addLabel="Require a skill"
              emptyHint="No skills required yet."
              onChanged={() => void load()}
            />
            <RoleContentSection
              readOnly={readOnly}
              roleId={roleId}
              kind="qualifications"
              rows={content.qualifications}
              kras={content.kras}
              title="Qualifications"
              subtitle="Education, certification and licences."
              addLabel="Require a qualification"
              emptyHint="No qualifications required yet."
              onChanged={() => void load()}
            />
            <RoleContentSection
              readOnly={readOnly}
              roleId={roleId}
              kind="experience"
              rows={content.experience}
              kras={content.kras}
              title="Experience"
              subtitle="Years and the area they should be in. Written here rather than assigned — no other role reuses this sentence."
              addLabel="Add experience"
              emptyHint="No experience requirement recorded."
              onChanged={() => void load()}
            />
          </Stack>
        )}

        {tab === 'authority' && (
          <RoleContentSection
              readOnly={readOnly}
            roleId={roleId}
            kind="authorities"
            rows={content.authorities}
            kras={content.kras}
            title="Authority"
            subtitle="What this role may decide, approve or stop without asking — and the limit it holds that within."
            addLabel="Grant an authority"
            emptyHint="No authority recorded. Until one is, this role decides nothing on its own."
            onChanged={() => void load()}
          />
        )}

        {tab === 'relationships' && (
          <Stack spacing={2}>
            <Callout label="Read this first" title="These are expectations, not reporting lines" tone="info">
              Who this kind of work coordinates with, inside the company and outside it — the paragraph a job
              description ends with. Who <em>manages</em> the person doing this work is recorded on their Position,
              where one person can have a primary manager and a dotted manager at the same time.
              Nothing on this tab ever becomes a manager.
            </Callout>
            <RoleContentSection
              readOnly={readOnly}
              roleId={roleId}
              kind="relationships"
              rows={content.relationships}
              kras={content.kras}
              title="Relationship expectations"
              addLabel="Add a relationship"
              emptyHint="No relationships recorded yet."
              onChanged={() => void load()}
            />
          </Stack>
        )}

        {tab === 'conditions' && (
          <RoleContentSection
              readOnly={readOnly}
            roleId={roleId}
            kind="conditions"
            rows={content.conditions}
            kras={content.kras}
            title="Working conditions"
            subtitle="Shift pattern, physical demands, environment, PPE and travel — what someone taking this role should expect."
            addLabel="Add a condition"
            emptyHint="No working conditions recorded."
            onChanged={() => void load()}
          />
        )}
      </DetailLayout>

      <Menu anchorEl={copyMenu} open={!!copyMenu} onClose={() => setCopyMenu(null)}>
        <MenuItem
          onClick={() => {
            setCopyMenu(null);
            setCopyStart({ from: { type: 'role', id: roleId }, toType: 'position' });
          }}
        >
          <ListItemIcon>
            <CallMadeRounded fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Copy this role's content to…" secondary="Other positions or roles. A single position is the safe default." />
        </MenuItem>
        {canEdit && (
          <MenuItem
            onClick={() => {
              setCopyMenu(null);
              setCopyStart({ to: [{ type: 'role', id: roleId }], toType: 'role' });
            }}
          >
            <ListItemIcon>
              <CallReceivedRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Copy content into this role from…"
              secondary={`Changes the role itself — all ${role.positionCount} position${role.positionCount === 1 ? '' : 's'} holding it.`}
            />
          </MenuItem>
        )}
      </Menu>

      <ContentCopySheet open={!!copyStart} start={copyStart} onClose={() => setCopyStart(null)} onDone={() => void load()} />

      <RoleFormDialog
        open={editing}
        role={role}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          toast.success('Role saved.');
          void load();
        }}
      />

      <ConfirmDialog
        open={removing}
        title="Delete this role?"
        entityName={role.title}
        body="Its content is removed with it. If a position or a person still holds the role, the server will refuse — retire it instead, which keeps the definition readable for the work already attached to it."
        confirmLabel="Delete"
        danger
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          await deleteRole(roleId);
          toast.success(`${role.title} deleted.`);
          navigate(`/${company}/cf_hrms/roles`);
        }}
      />
    </>
  );
}
