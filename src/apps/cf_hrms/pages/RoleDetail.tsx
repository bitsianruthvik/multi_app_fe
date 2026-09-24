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
 *   Content is dated. The band above the tabs reads "everything" by default — so
 *   a future-dated assignment is visible while it is being set up — and can be
 *   pointed at any date to show what was, or will be, in force then.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import AssignmentIndRounded from '@mui/icons-material/AssignmentIndRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import {
  DetailLayout, DetailHeader, CrossLink, FactItem, SectionCard, StatusBadge, ToneBadge, Mono,
  Surface, Callout, ErrorNotice, DetailSkeleton, ConfirmDialog, useToast, useIsPermitted, useCompanySlug,
  useDetailTitle, type DetailTab,
} from '@shared/ui';
import {
  getRoleContent, deleteRole, pretty, type RoleContent,
} from '../api/roles';
import { RoleFormDialog } from '../components/RoleFormDialog';
import { RoleContentTab } from '../components/RoleContentTab';
import { RoleContentSection } from '../components/RoleContentSection';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function RoleDetail() {
  const { id } = useParams<{ id: string }>();
  const roleId = Number(id);
  const company = useCompanySlug();
  const navigate = useNavigate();
  const toast = useToast();
  const can = useIsPermitted();
  const canManage = can('cf_hrms_roles_manage');

  const [content, setContent] = useState<RoleContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState('overview');
  const [scope, setScope] = useState<'all' | 'effective'>('all');
  const [on, setOn] = useState(todayIso());
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(roleId) || roleId <= 0) {
      setError(new Error('That role id is not a number.'));
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setContent(await getRoleContent(roleId, scope === 'all' ? { scope: 'all' } : { on }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [roleId, scope, on]);

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
    ];
  }, [content]);

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
        canManage ? (
          <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<EditRounded />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="small" color="error" startIcon={<DeleteOutlineRounded />} onClick={() => setRemoving(true)}>
              Delete
            </Button>
          </Stack>
        ) : undefined
      }
      facts={
        <>
          <FactItem label="Department" value={role.departmentName ?? '—'} />
          <FactItem label="KRAs" value={role.kraCount} />
          <FactItem label="Responsibilities" value={role.responsibilityCount} />
          <FactItem label="KPIs" value={role.kpiCount} />
          <FactItem label="Positions using it" value={role.positionCount} />
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
      {role.departmentName && (
        <CrossLink icon={<ApartmentRounded />} label={role.departmentName} to={`/${company}/cf_hrms/departments`} />
      )}
      <CrossLink icon={<WorkOutlineRounded />} label="Positions" count={role.positionCount} to={`/${company}/cf_hrms/positions`} />
      <CrossLink icon={<AssignmentIndRounded />} label="Work assignments" to={`/${company}/cf_hrms/assignments`} />
      <CrossLink icon={<FlagRounded />} label="KRA master" to={`/${company}/cf_hrms/kras`} />
    </>
  );

  /** The date this content is being read on. Content is effective-dated; the screen says which day it is showing. */
  const dateBand = (
    <Surface e={1} sx={{ p: 1.25, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
        {scope === 'all'
          ? 'Showing every assignment on this role, including ones dated to start later.'
          : `Showing the content in force on ${content.on}.`}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <TextField
        label="In force on"
        type="date"
        size="small"
        value={on}
        onChange={(e) => {
          setOn(e.target.value);
          setScope('effective');
        }}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: 170 }}
      />
      <Button
        size="small"
        variant={scope === 'all' ? 'contained' : 'text'}
        onClick={() => {
          setScope('all');
          setOn(todayIso());
        }}
      >
        Show everything
      </Button>
    </Surface>
  );

  return (
    <>
      <DetailLayout header={header} crossLinks={crossLinks} beforeTabs={tab === 'overview' ? undefined : dateBand} tabs={tabs} active={tab} onTab={setTab}>
        {tab === 'overview' && (
          <Stack spacing={2}>
            <SectionCard
              title="Purpose"
              subtitle="Why this role exists. It is the opening paragraph of every job description generated from it."
              actions={canManage ? <Button size="small" startIcon={<EditRounded />} onClick={() => setEditing(true)}>Edit</Button> : undefined}
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
                  label="Default department"
                  value={
                    role.departmentName ? (
                      <Box component={Link} to={`/${company}/cf_hrms/departments`} sx={{ color: 'var(--c-primary-700)', textDecoration: 'none' }}>
                        {role.departmentName}
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
                A department here is a default, not a placement. The actual department and location belong to the
                Position, and the person doing the work belongs to a Work Assignment.
              </Box>
            </SectionCard>

            {(!role.hasPurpose || role.kraCount === 0) && (
              <SectionCard title="Before this role can produce a job description">
                <Stack spacing={1} sx={{ fontSize: 13.5 }}>
                  {!role.hasPurpose && <Box>· Write the purpose — one or two sentences on why the role exists.</Box>}
                  {role.kraCount === 0 && (
                    <Box>
                      · Assign at least one KRA, then group the duties and measures under it.{' '}
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

        {tab === 'content' && <RoleContentTab content={content} canManage={canManage} onChanged={() => void load()} />}

        {tab === 'requirements' && (
          <Stack spacing={2}>
            <RoleContentSection
              roleId={roleId}
              kind="skills"
              rows={content.skills}
              kras={content.kras}
              title="Skills"
              subtitle="What someone must be able to do. Assigned from the skill master, marked required or preferred."
              addLabel="Require a skill"
              emptyHint="No skills required yet."
              canManage={canManage}
              onChanged={() => void load()}
            />
            <RoleContentSection
              roleId={roleId}
              kind="qualifications"
              rows={content.qualifications}
              kras={content.kras}
              title="Qualifications"
              subtitle="Education, certification and licences."
              addLabel="Require a qualification"
              emptyHint="No qualifications required yet."
              canManage={canManage}
              onChanged={() => void load()}
            />
            <RoleContentSection
              roleId={roleId}
              kind="experience"
              rows={content.experience}
              kras={content.kras}
              title="Experience"
              subtitle="Years and the area they should be in. Written here rather than assigned — no other role reuses this sentence."
              addLabel="Add experience"
              emptyHint="No experience requirement recorded."
              canManage={canManage}
              onChanged={() => void load()}
            />
          </Stack>
        )}

        {tab === 'authority' && (
          <RoleContentSection
            roleId={roleId}
            kind="authorities"
            rows={content.authorities}
            kras={content.kras}
            title="Authority"
            subtitle="What this role may decide, approve or stop without asking — and the limit it holds that within."
            addLabel="Grant an authority"
            emptyHint="No authority recorded. Until one is, this role decides nothing on its own."
            canManage={canManage}
            onChanged={() => void load()}
          />
        )}

        {tab === 'relationships' && (
          <Stack spacing={2}>
            <Callout label="Read this first" title="These are expectations, not reporting lines" tone="info">
              Who this kind of work coordinates with, inside the company and outside it — the paragraph a job
              description ends with. Who <em>manages</em> the person doing this work is recorded on their Position and
              Work Assignment, where one assignment can carry a primary manager and a dotted manager at the same time.
              Nothing on this tab ever becomes a manager.
            </Callout>
            <RoleContentSection
              roleId={roleId}
              kind="relationships"
              rows={content.relationships}
              kras={content.kras}
              title="Relationship expectations"
              addLabel="Add a relationship"
              emptyHint="No relationships recorded yet."
              canManage={canManage}
              onChanged={() => void load()}
            />
          </Stack>
        )}

        {tab === 'conditions' && (
          <RoleContentSection
            roleId={roleId}
            kind="conditions"
            rows={content.conditions}
            kras={content.kras}
            title="Working conditions"
            subtitle="Shift pattern, physical demands, environment, PPE and travel — what someone taking this role should expect."
            addLabel="Add a condition"
            emptyHint="No working conditions recorded."
            canManage={canManage}
            onChanged={() => void load()}
          />
        )}
      </DetailLayout>

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
        body="Its content is removed with it. If a position or a work assignment still uses the role, the server will refuse — retire it instead, which keeps the definition readable for the work already attached to it."
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
