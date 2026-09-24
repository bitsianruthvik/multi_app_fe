/**
 * Home — the cockpit (DESIGN_SYSTEM.md §4.1, appendix §A4).
 *
 * It answers one question: **what needs me today.** Three bands, in the order
 * intent arrives:
 *
 *   1. the stat strip — the shape of the organisation, each figure a door;
 *   2. the work queues — every pending thing, worst consequence first, each
 *      with a count and exactly one action;
 *   3. the two panels — who joined last, and how much of the model is in place.
 *
 * **It is a to-do surface, not a dashboard.** There are no charts here on
 * purpose (§4.9 is a different screen): a chart on a landing page asks the
 * reader to interpret something, and someone opening an HR system at 9am wants
 * to be told what to fix. Every number on this page links to the screen that
 * fixes it.
 *
 * This replaces a stub that said "Not built yet", which meant the app opened
 * onto an empty page and then a menu of tables — principle #1 exactly
 * inverted. See the appendix's header for the whole story.
 *
 * ONE REQUEST. Everything comes from `GET /overview/home`; the counts are real
 * queries, not derived from a list the page happened to load. A permission the
 * user lacks simply has no key in the response, so its card is absent rather
 * than reading a zero the user would take as fact.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import NotesRounded from '@mui/icons-material/NotesRounded';
import EventSeatRounded from '@mui/icons-material/EventSeatRounded';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import {
  PageHeader, StatStrip, SectionCard, EmptyState, ErrorNotice, EntityList, EntityRow,
  Mono, CapsLabel, StatSkeleton, CardGridSkeleton, useIsPermitted, useCompanySlug,
  type Stat,
} from '@shared/ui';
import { useAuth } from '@core/contexts/AuthContext';
import { getHomeOverview, type HomeOverview, type OverviewCounts } from '../api/overview';
import { HomeQueueCard, type QueueTone } from '../components/HomeQueueCard';

const ORG = 'cf_hrms_org_view';
const PEOPLE = 'cf_hrms_people_view';
const ROLES = 'cf_hrms_roles_manage';
const ATTENDANCE = 'cf_hrms_attendance_view';
const LEAVE = 'cf_hrms_leave_view';

interface Queue {
  key: string;
  permission: string;
  icon: ReactNode;
  title: string;
  count: number | undefined;
  unit: string;
  description: string;
  clearNote?: string;
  actionLabel: string;
  path: string;
  tone: QueueTone;
}

/**
 * The seven queues of appendix §A4, in the order the appendix puts them —
 * which is the order of what goes wrong if they are ignored. An unanswered
 * question about the organisation blocks every role written from it; a role
 * with no purpose produces a JD that opens on a blank line; an empty seat is
 * felt on the floor every shift; and so on down to a document that expires
 * next month.
 *
 * `count: undefined` means the caller cannot see that figure, and the card is
 * dropped. `count: 0` means there is nothing to do, and the card stays.
 */
function queuesFor(c: OverviewCounts): Queue[] {
  return [
    {
      key: 'openPoints',
      permission: ORG,
      icon: <HelpOutlineRounded />,
      title: 'Open points',
      count: c.openPoints,
      unit: 'unresolved',
      description:
        'Questions the org chart raised and nobody has answered. Each one is a seat, a role or a reporting line that is still a guess.',
      clearNote: 'Every question the org chart raised has been answered.',
      actionLabel: 'Resolve',
      path: 'org-chart',
      tone: 'warning',
    },
    {
      key: 'rolesNoPurpose',
      permission: ROLES,
      icon: <NotesRounded />,
      title: 'Roles with no purpose',
      count: c.rolesNoPurpose,
      unit: 'to write',
      description:
        'A job description is generated from the role. Without a purpose it opens on a blank line, so the role cannot produce a usable JD.',
      clearNote: 'Every role says what it is for.',
      actionLabel: 'Write purpose',
      path: 'roles',
      tone: 'warning',
    },
    {
      key: 'vacantSeats',
      permission: ORG,
      icon: <EventSeatRounded />,
      title: 'Vacant seats',
      count: c.vacantSeats,
      unit: `of ${c.sanctioned ?? 0} sanctioned`,
      description:
        'Seats the organisation has sanctioned with nobody in them. A vacancy is a fact, not an error — but it is the one the floor feels every shift.',
      clearNote: 'Every sanctioned seat has somebody in it.',
      actionLabel: 'See the chart',
      path: 'org-chart',
      tone: 'primary',
    },
    {
      key: 'employeesNoAssignment',
      permission: PEOPLE,
      icon: <PersonSearchRounded />,
      title: 'People with no assignment',
      count: c.employeesNoAssignment,
      unit: 'unassigned',
      description:
        'On the payroll, doing no recorded work. They have no role, so no responsibilities, no reporting line and nothing to appear on a profile.',
      clearNote: 'Everybody on the payroll has work recorded against them.',
      actionLabel: 'Assign',
      path: 'employees',
      tone: 'danger',
    },
    {
      key: 'leavePending',
      permission: LEAVE,
      icon: <EventAvailableRounded />,
      title: 'Leave awaiting approval',
      count: c.leavePending,
      unit: 'to review',
      description:
        'Requests nobody has decided. An approval also writes the attendance days it covers, so an unanswered request leaves the muster wrong too.',
      clearNote: 'No leave request is waiting on a decision.',
      actionLabel: 'Review',
      path: 'leave-requests',
      tone: 'warning',
    },
    {
      key: 'attendanceUnmarked',
      permission: ATTENDANCE,
      icon: <FactCheckRounded />,
      title: 'Attendance not marked',
      count: c.attendanceUnmarked,
      unit: `of ${c.attendanceExpected ?? 0} today`,
      description:
        'People with live work and no attendance row for today. A day that is never marked cannot be corrected later — there is nothing to correct.',
      clearNote: 'Everybody working today has been marked.',
      actionLabel: 'Mark',
      path: 'attendance',
      tone: 'warning',
    },
    {
      key: 'documentsExpiring',
      permission: PEOPLE,
      icon: <DescriptionRounded />,
      title: 'Documents expiring',
      count: c.documentsExpiring,
      unit: 'within 30 days',
      description:
        'Licences, certificates and contracts about to lapse. While they are only expiring they are still cheap to renew.',
      clearNote: 'Nothing on file lapses in the next 30 days.',
      actionLabel: 'Check',
      path: 'employees',
      tone: 'info',
    },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const company = useCompanySlug();
  const { user } = useAuth();
  const can = useIsPermitted();
  const go = (path: string) => navigate(`/${company}/cf_hrms/${path}`);
  const to = (path: string) => `/${company}/cf_hrms/${path}`;

  const [data, setData] = useState<HomeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getHomeOverview());
    } catch (e) {
      // Keep whatever was last shown. A cockpit that blanks itself on one bad
      // response is worse than one holding a figure a minute old.
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const c = data?.counts ?? {};
  const firstName = user?.name?.split(' ')[0] || 'there';

  /* ── band 1: the shape of the organisation, each figure a door ─────────── */
  const stats: Stat[] = [
    c.employees !== undefined && can(PEOPLE) && {
      label: 'People',
      value: c.employees,
      icon: <GroupsRounded />,
      hint: 'Everyone on the payroll who has not exited',
      onClick: () => go('employees'),
    },
    c.sanctioned !== undefined && can(ORG) && {
      label: 'Seats filled',
      value: c.filled ?? 0,
      // A bare "13" says nothing; 13 of 169 is the whole story of this plant.
      display: `${c.filled ?? 0} of ${c.sanctioned}`,
      icon: <EventSeatRounded />,
      hint: 'Sanctioned seats with somebody in them, counted the way the org chart counts them',
      onClick: () => go('positions'),
    },
    c.rolesTotal !== undefined && can(ROLES) && {
      label: 'Roles',
      value: c.rolesTotal,
      icon: <BadgeRounded />,
      hint: 'The kinds of work defined, whatever their status',
      onClick: () => go('roles'),
    },
    c.activeAssignments !== undefined && can(PEOPLE) && {
      label: 'Work assignments',
      value: c.activeAssignments,
      icon: <AccountTreeRounded />,
      hint: 'Live person-to-role links. One person can hold several.',
      onClick: () => go('assignments'),
    },
  ].filter(Boolean) as Stat[];

  /* ── band 2: the queues ────────────────────────────────────────────────── */
  const queues = queuesFor(c).filter((q) => q.count !== undefined && can(q.permission));
  // Non-empty first, each group keeping the appendix's consequence order. A
  // queue with nothing in it cannot go wrong, so it sorts below one that can.
  const ordered = [...queues.filter((q) => (q.count ?? 0) > 0), ...queues.filter((q) => !q.count)];
  const allClear = queues.length > 0 && ordered.every((q) => !q.count);

  /* ── band 3b: how much of the model is in place (§4.8, in miniature) ───── */
  const setup = can(ORG)
    ? [
        { label: 'Locations', n: c.locations, path: 'locations', hint: 'Plants, offices and sites' },
        { label: 'Departments', n: c.departments, path: 'departments', hint: 'Functions and divisions' },
        { label: 'Shifts', n: c.shifts, path: 'shifts', hint: 'General, day, night' },
        { label: 'Roles', n: c.rolesTotal, path: 'roles', hint: 'The kinds of work' },
        { label: 'Positions', n: c.positions, path: 'positions', hint: 'Sanctioned seats' },
        { label: 'Employees', n: c.employees, path: 'employees', hint: 'People on the payroll' },
        { label: 'Leave types', n: c.leaveTypes, path: 'leave-types', hint: 'What people can apply for' },
      ].filter((s) => s.n !== undefined)
    : [];
  const setupDone = setup.filter((s) => (s.n ?? 0) > 0).length;

  return (
    <Box sx={{ maxWidth: 1280 }}>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what needs you today."
        actions={
          <Button
            size="small"
            startIcon={<RefreshRounded />}
            onClick={() => void load()}
            disabled={loading}
            sx={{ color: 'var(--c-text-2)' }}
          >
            Refresh
          </Button>
        }
      />
      <ErrorNotice error={error} onRetry={() => void load()} />

      {loading && !data ? (
        <>
          <StatSkeleton count={4} />
          <CardGridSkeleton count={6} />
        </>
      ) : data ? (
        <>
          {stats.length > 0 && <StatStrip stats={stats} />}

          <CapsLabel component="h2" sx={{ mb: 1.5 }}>
            What needs you
          </CapsLabel>

          {queues.length === 0 ? (
            <EmptyState
              icon={<CheckCircleRounded />}
              title="No queues to show"
              hint="Work queues appear here as you are given access to the parts of the system that own them."
            />
          ) : allClear ? (
            <EmptyState
              icon={<CheckCircleRounded />}
              title="Nothing is waiting on you"
              hint="Open points, roles without a purpose, vacant seats, unassigned people, leave to approve, attendance to mark and documents about to expire all show up here."
            />
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
                gap: 1.5,
                alignItems: 'stretch',
              }}
            >
              {ordered.map((q) => (
                <HomeQueueCard
                  key={q.key}
                  icon={q.icon}
                  title={q.title}
                  count={q.count ?? 0}
                  unit={q.unit}
                  description={q.description}
                  clearNote={q.clearNote}
                  actionLabel={q.actionLabel}
                  onAction={() => go(q.path)}
                  tone={q.tone}
                />
              ))}
            </Box>
          )}

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
              mt: 3,
            }}
          >
            {data.recentPeople && (
              <SectionCard
                title="Recently joined"
                subtitle="The newest people on the payroll, and the role they actually do."
                actions={
                  <Button component={Link} to={to('employees')} size="small" endIcon={<ArrowForwardRounded />}>
                    All people
                  </Button>
                }
              >
                {data.recentPeople.length === 0 ? (
                  <Typography sx={{ color: 'var(--c-text-2)', fontSize: 14, py: 2 }}>
                    Nobody on the payroll yet.
                  </Typography>
                ) : (
                  <EntityList>
                    {data.recentPeople.map((p) => (
                      <EntityRow
                        key={p.id}
                        onClick={() => go(`employees/${p.id}`)}
                        code={<Mono chip>{p.employeeCode}</Mono>}
                        primary={p.fullName}
                        secondary={p.roleTitle ?? 'No assignment yet'}
                        trailing={
                          <Mono muted tabular>
                            {p.dateOfJoining ?? '—'}
                          </Mono>
                        }
                      />
                    ))}
                  </EntityList>
                )}
              </SectionCard>
            )}

            {setup.length > 0 && (
              <SectionCard
                title="The model"
                subtitle={`${setupDone} of ${setup.length} in place — what everything else is written from, in the order it is usually set up.`}
              >
                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 0.5 }}>
                  {setup.map((s) => (
                    <Box component="li" key={s.label}>
                      <Box
                        component={Link}
                        to={to(s.path)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          p: 1.25,
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--c-text)',
                          textDecoration: 'none',
                          '&:hover': { background: 'var(--c-surface-2)' },
                        }}
                      >
                        {(s.n ?? 0) > 0 ? (
                          <CheckCircleRounded sx={{ color: 'var(--c-success-600)' }} aria-label="In place" />
                        ) : (
                          <RadioButtonUncheckedRounded sx={{ color: 'var(--c-text-3)' }} aria-label="Not yet" />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{s.label}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                            {(s.n ?? 0) > 0 ? `${s.n} · ${s.hint}` : `None yet — ${s.hint.toLowerCase()}`}
                          </Typography>
                        </Box>
                        <ArrowForwardRounded sx={{ color: 'var(--c-text-3)', fontSize: 18 }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </SectionCard>
            )}
          </Box>
        </>
      ) : null}
    </Box>
  );
}
