/**
 * Home (DESIGN_SYSTEM.md §4.1, appendix §A4).
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
 * Only screens that are in the menu appear here (clean-up of 2026-10-12): the
 * cards for open points and attendance to mark went with their screens, and
 * come back when those screens are built. Leave to approve came back with
 * Approvals (spec §22.6): "N approvals waiting", read from the same count as
 * the nav badge (`api/approvals.ts`), not from /overview/home.
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
import NotesRounded from '@mui/icons-material/NotesRounded';
import EventSeatRounded from '@mui/icons-material/EventSeatRounded';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  PageHeader, StatStrip, SectionCard, EmptyState, ErrorNotice, EntityList, EntityRow,
  Mono, CapsLabel, StatSkeleton, CardGridSkeleton, useCompanySlug,
  type Stat,
} from '@shared/ui';
import { useAuth } from '@core/contexts/AuthContext';
import { getHomeOverview, type HomeOverview, type OverviewCounts } from '../api/overview';
import { refreshPendingApprovals, usePendingApprovals } from '../api/approvals';
import { HomeQueueCard, type QueueTone } from '../components/HomeQueueCard';
import { TAG, useCan, type Area } from '../access/can';

interface Queue {
  key: string;
  /** The view tag of the area the card points at; the card is shown only with it. */
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
 * The queues, in the order of what goes wrong if they are ignored: a role with
 * no purpose produces a JD that opens on a blank line; an empty position is
 * felt on the floor every shift; and so on down to a document that expires
 * next month.
 *
 * `count: undefined` means the caller cannot see that figure, and the card is
 * dropped. `count: 0` means there is nothing to do, and the card stays.
 */
function queuesFor(c: OverviewCounts, approvals: number | undefined): Queue[] {
  return [
    {
      key: 'approvals',
      // Not an area right: shown to whoever has approvals, or holds leave edit (count set by the caller).
      permission: '',
      icon: <EventBusyRounded />,
      title: 'Approvals waiting',
      count: approvals,
      unit: 'waiting for you',
      description: 'Leave your team has asked for. People plan around the answer, so decide early.',
      clearNote: 'Nothing is waiting for your decision.',
      actionLabel: 'Decide',
      path: 'approvals',
      tone: 'warning',
    },
    {
      key: 'rolesNoPurpose',
      permission: TAG.roles.view,
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
      permission: TAG.positions.view,
      icon: <EventSeatRounded />,
      title: 'Vacant positions',
      count: c.vacantSeats,
      unit: `of ${c.sanctioned ?? 0} positions`,
      description:
        'Positions with nobody in them. A vacancy is a fact, not an error — but it is the one the floor feels every shift.',
      clearNote: 'Every position has somebody in it.',
      actionLabel: 'See the chart',
      path: 'org-chart',
      tone: 'primary',
    },
    {
      key: 'employeesNoAssignment',
      permission: TAG.employees.view,
      icon: <PersonSearchRounded />,
      title: 'People with no position',
      count: c.employeesNoAssignment,
      unit: 'not placed',
      description:
        'On the payroll, but not in any position. They have no role, so no responsibilities, no reporting line and nothing to appear on a profile.',
      clearNote: 'Everybody on the payroll holds a position.',
      actionLabel: 'See them',
      path: 'employees',
      tone: 'danger',
    },
    {
      key: 'documentsExpiring',
      permission: TAG.employees.view,
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
  const can = useCan();
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
      void refreshPendingApprovals();
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
  const pendingApprovals = usePendingApprovals(can.named.selfView || can.leave.edit);
  const firstName = user?.name?.split(' ')[0] || 'there';

  /* ── band 1: the shape of the organisation, each figure a door ─────────── */
  const stats: Stat[] = [
    c.employees !== undefined && can.employees.view && {
      label: 'People',
      value: c.employees,
      icon: <GroupsRounded />,
      hint: 'Everyone on the payroll who has not exited',
      onClick: () => go('employees'),
    },
    c.sanctioned !== undefined && can.positions.view && {
      label: 'Positions filled',
      value: c.filled ?? 0,
      // A bare "13" says nothing; 13 of 169 is the whole story of this plant.
      display: `${c.filled ?? 0} of ${c.sanctioned}`,
      icon: <EventSeatRounded />,
      hint: 'Positions with somebody in them, counted the way the org chart counts them',
      onClick: () => go('positions'),
    },
    c.rolesTotal !== undefined && can.roles.view && {
      label: 'Roles',
      value: c.rolesTotal,
      icon: <BadgeRounded />,
      hint: 'The kinds of work defined, whatever their status',
      onClick: () => go('roles'),
    },
  ].filter(Boolean) as Stat[];

  /* ── band 2: the queues ────────────────────────────────────────────────── */
  const shownApprovals = pendingApprovals != null && (pendingApprovals > 0 || can.leave.edit) ? pendingApprovals : undefined;
  const queues = queuesFor(c, shownApprovals).filter((q) => q.count !== undefined && can.has(q.permission));
  // Non-empty first, each group keeping the appendix's consequence order. A
  // queue with nothing in it cannot go wrong, so it sorts below one that can.
  const ordered = [...queues.filter((q) => (q.count ?? 0) > 0), ...queues.filter((q) => !q.count)];
  const allClear = queues.length > 0 && ordered.every((q) => !q.count);

  /* ── band 3b: how much of the model is in place (§4.8, in miniature) ───── */
  // Each row is its own area's: it appears only with that area's view right.
  const setupRows: { label: string; n: number | undefined; path: string; hint: string; area: Area }[] = [
    { label: 'Locations', n: c.locations, path: 'locations', hint: 'Plants, offices and sites', area: 'org' },
    { label: 'Org units', n: c.departments, path: 'org-units', hint: 'Departments, sections, machines', area: 'org' },
    { label: 'Shifts', n: c.shifts, path: 'shifts', hint: 'General, day, night', area: 'time' },
    { label: 'Roles', n: c.rolesTotal, path: 'roles', hint: 'The kinds of work', area: 'roles' },
    { label: 'Positions', n: c.positions, path: 'positions', hint: 'One person each, on one shift', area: 'positions' },
    { label: 'Employees', n: c.employees, path: 'employees', hint: 'People on the payroll', area: 'employees' },
  ];
  const setup = setupRows.filter((s) => s.n !== undefined && can[s.area].view);
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
          <StatSkeleton count={3} />
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
              hint="Roles without a purpose, vacant positions, people with no position and documents about to expire all show up here."
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
            {data.recentPeople && can.employees.view && (
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
                        secondary={p.roleTitle ?? 'No position yet'}
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
