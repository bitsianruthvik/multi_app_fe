/**
 * MyPlace — "where I sit, and who I answer to". The fourth world.
 *
 * DESIGN_SYSTEM_APPENDIX.md §A1 describes three worlds (DEFINE / STAFF / RUN),
 * each belonging to HR or to management. This screen is none of them. §A3's last
 * row — "Employee · self only · their own profile" — is this, and it is a
 * different kind of screen from everything else in the app because of who opens
 * it: **a shop-floor employee for whom this is the only screen in the product
 * they will ever see.** There is no Home cockpit behind it, no nav to explore,
 * no second page to go to for the bit that is missing, and nobody to ask what a
 * word means. So:
 *
 *   - IT MUST STAND ALONE. Every term is explained on the page. "Dotted line",
 *     "work assignment", "scope" and "KRA" are HR vocabulary and none of them
 *     appears as a bare label — the backend sends a plain sentence for each
 *     reporting line (`meaning`) and this screen prints it.
 *   - IT LINKS NOWHERE. Every CrossLink elsewhere in cf_hrms points at
 *     /employees/:id, /positions/:id or /assignments/:id, and all three would
 *     answer 403 for this reader. A link that refuses is worse than no link, so
 *     names here are text.
 *   - FOUR QUESTIONS, NO SCROLLING: who am I · who do I report to · who is on
 *     my team · what am I responsible for. The layout is a grid so all four are
 *     above the fold on a desktop, and each panel scrolls inside itself rather
 *     than pushing the next one off the page. Karni's HR Head has 73
 *     responsibilities; a page that renders all of them puts the team panel two
 *     screens down.
 *
 * ── WHY THE LINES LOOK DIFFERENT ──────────────────────────────────────────
 * A person can have several managers at once (plan §2 rule 9). Shown as a plain
 * list they read as a contradiction — "so who IS my boss?" — so three facts are
 * drawn, not written:
 *
 *   SOLID left edge, green    the primary manager for this work
 *   DASHED left edge          a dotted line: real, but not the main manager.
 *                             `lineStyle` comes from the relationship type's own
 *                             `is_formal` flag, so the border style is the
 *                             model's definition and not a choice made here.
 *   AMBER edge + "only for"   a manager over PART of the work. The scope phrase
 *                             ("for statutory compliance") is what turns a
 *                             second manager from a contradiction into a
 *                             narrowing.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Box, Stack, Typography, Button, Tooltip } from '@mui/material';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import {
  PageHeader, SectionCard, Surface, EmptyState, ErrorNotice, Callout,
  StatusBadge, ToneBadge, Mono, CapsLabel, DetailSkeleton,
  type StatusTone,
} from '@shared/ui';
import {
  getMyPlace,
  type MyPlace as MyPlaceData,
  type SelfReportingLine,
  type SelfSeat,
  type SelfTeamMember,
} from '../api/self';
import { fromSelfResponsibilities } from '../api/jobContent';
import { JobContent } from '../components/JobContent';

/**
 * Relationship type → badge tone. A KIND OF AUTHORITY, not a lifecycle state,
 * which is why it is here and not in `statusMap.ts` — that file says so
 * explicitly, and it is the same table `components/ReportingRows.tsx` uses, so
 * a dotted line is the same colour on this screen as on the HR one.
 */
const TYPE_TONE: Record<string, StatusTone> = {
  PRIMARY_MANAGER: 'success',
  FUNCTIONAL_MANAGER: 'info',
  ADMINISTRATIVE_MANAGER: 'info',
  DOTTED_LINE: 'neutral',
  PROJECT_MANAGER: 'warning',
  SHIFT_SUPERVISOR: 'neutral',
};


/* ── small pieces ───────────────────────────────────────────────────────── */

function Fact({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <CapsLabel>{label}</CapsLabel>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25, minWidth: 0 }}>
        {icon}
        <Typography sx={{ fontSize: 14, color: 'var(--c-text)', fontWeight: 500, minWidth: 0 }}>
          {value}
        </Typography>
      </Stack>
    </Box>
  );
}

/** A panel that scrolls inside itself, so four answers stay on one screen. */
function ScrollPanel({ children, max = 360 }: { children: React.ReactNode; max?: number }) {
  return (
    <Box sx={{ maxHeight: max, overflowY: 'auto', px: 2.5, py: 2 }}>{children}</Box>
  );
}

/**
 * One reporting line. Everything a reader needs to understand it is on the
 * card: the kind of authority, whose it is, what part of the work it covers,
 * where it comes from, and a sentence saying what that means in practice.
 */
function ReportingLine({ line }: { line: SelfReportingLine }) {
  const scoped = !line.scope.isGeneral;
  const dotted = line.lineStyle === 'DOTTED';
  return (
    <Surface
      e={0}
      sx={{
        p: 1.75,
        // The three looks. A dashed border for a dotted line is the whole point:
        // it is the one visual that needs no caption.
        borderLeft: '4px',
        borderLeftStyle: dotted ? 'dashed' : 'solid',
        // `--c-text-3`, not `--c-border`: in dark mode the border token is
        // rgba(255,255,255,.09) and a dashed edge in it is invisible — which
        // would leave a dotted line looking exactly like a solid one.
        borderLeftColor: line.isPrimary
          ? 'var(--c-success-600)'
          : scoped ? 'var(--c-warning-600)' : 'var(--c-text-3)',
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.75 }}>
        <ToneBadge
          tone={TYPE_TONE[line.relationshipType.code] ?? 'neutral'}
          label={line.isPrimary ? 'Your manager' : line.relationshipType.name}
        />
        {scoped && (
          <ToneBadge
            tone="warning"
            noIcon
            label={`only ${line.scope.phrase ?? 'for part of your work'}`}
            title="This manager is responsible for one part of your work, not all of it."
          />
        )}
        {line.endsOn && <ToneBadge tone="neutral" noIcon label={`until ${line.endsOn}`} />}
      </Stack>

      {line.person ? (
        <>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
            <PersonRounded sx={{ fontSize: 17, color: 'var(--c-text-3)' }} aria-hidden />
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
              {line.person.name}
            </Typography>
          </Stack>
          {(line.person.roleTitle || line.person.positionTitle) && (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', ml: 3 }}>
              {line.person.positionTitle ?? line.person.roleTitle}
            </Typography>
          )}
          {line.person.contact?.phone && (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', ml: 3 }}>
              {line.person.contact.phone}
            </Typography>
          )}
          {line.alsoHeldBy.length > 0 && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', ml: 3, mt: 0.25 }}>
              {`Also in this job: ${line.alsoHeldBy.map((m) => m.name).join(', ')}`}
            </Typography>
          )}
        </>
      ) : (
        // A vacant seat is the honest answer, not a blank. The chart says this
        // job reports into a seat; nobody is in it today.
        <Typography sx={{ fontSize: 14, color: 'var(--c-text-2)' }}>
          {`Nobody is in the ${line.seatTitle ?? 'manager'} job right now, so this line has no person today.`}
        </Typography>
      )}

      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1, lineHeight: 1.5 }}>
        {line.meaning}
      </Typography>
    </Surface>
  );
}

/** A teammate, compact: a name, what they do, and the shift they are on. */
function TeamRow({ member, showLine = false }: { member: SelfTeamMember; showLine?: boolean }) {
  return (
    <Box sx={{ py: 0.85, borderBottom: '1px solid var(--c-border)', '&:last-of-type': { borderBottom: 'none' } }}>
      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap">
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)' }}>
          {member.person.name}
        </Typography>
        {member.shift && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
            {`${member.shift.name} shift`}
          </Typography>
        )}
        {showLine && member.lineStyle === 'DOTTED' && (
          <ToneBadge tone="neutral" noIcon label={member.relationshipType.name} />
        )}
        {showLine && !member.scope.isGeneral && (
          <ToneBadge tone="warning" noIcon label={`only ${member.scope.phrase ?? 'part'}`} />
        )}
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {[member.person.positionTitle ?? member.person.roleTitle, member.departmentName]
          .filter(Boolean).join(' · ') || 'Job not recorded'}
      </Typography>
    </Box>
  );
}


/** One of the caller's jobs: the seat, and the facts about it. */
function SeatStrip({ seat, many }: { seat: SelfSeat; many: boolean }) {
  return (
    <Surface e={0} sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1.25 }}>
        <WorkOutlineRounded sx={{ fontSize: 18, color: 'var(--c-text-3)' }} aria-hidden />
        {/*
          `seat.label` and not `positionTitle`: the label is what the reporting
          lines above are tagged with ("as Safety Officer (additional charge)"),
          and a card headed with the seat's formal title while the line beside
          it uses the assignment's own name reads as two different jobs.
        */}
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'var(--c-text)' }}>
          {seat.label}
        </Typography>
        {many && seat.isPrimary && <ToneBadge tone="success" noIcon label="Your main job" />}
        {seat.status !== 'ACTIVE' && <StatusBadge status={seat.status} />}
      </Stack>
      {/* The formal seat, when the person's own job name differs from it. */}
      {seat.positionTitle && seat.positionTitle !== seat.label && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: -0.75, mb: 1.25, ml: 3.25 }}>
          {`Seat: ${seat.positionTitle}`}
        </Typography>
      )}

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {seat.departmentName && <Fact label="Department" value={seat.departmentName} />}
        {seat.locationName && <Fact label="Where" value={seat.locationName} />}
        {seat.shift && (
          <Fact
            label="Shift"
            icon={<ScheduleRounded sx={{ fontSize: 15, color: 'var(--c-text-3)' }} aria-hidden />}
            value={
              seat.shift.startTime && seat.shift.endTime
                ? `${seat.shift.name} · ${seat.shift.startTime}–${seat.shift.endTime}`
                : seat.shift.name
            }
          />
        )}
        {/* Allocation only reads as useful when there is more than one job to split. */}
        {many && seat.allocationPercent != null && (
          <Fact label="Share of your time" value={`${seat.allocationPercent}%`} />
        )}
      </Box>

      {seat.workContexts.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <CapsLabel>Machines and areas</CapsLabel>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mt: 0.5, gap: 0.75 }}>
            {seat.workContexts.map((c) => (
              <ToneBadge
                key={c.id}
                tone="neutral"
                icon={<PrecisionManufacturingRounded aria-hidden />}
                label={c.name}
              />
            ))}
          </Stack>
        </Box>
      )}
    </Surface>
  );
}

/* ── the screen ─────────────────────────────────────────────────────────── */

export default function MyPlace() {
  const { company = '' } = useParams<{ company: string }>();
  const [data, setData] = useState<MyPlaceData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyPlace()
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading && !data) return <DetailSkeleton />;

  if (error) {
    return (
      <>
        <PageHeader title="Your place" />
        <ErrorNotice error={error} fallback="Could not load your record." onRetry={load} />
      </>
    );
  }

  if (!data) return null;

  // Not an error: an HR administrator's login was never imported as a person.
  if (!data.linked || !data.me) {
    return (
      <>
        <PageHeader title="Your place" />
        <EmptyState
          icon={<BadgeRounded sx={{ fontSize: 34 }} />}
          title="This login is not connected to an employee record"
          hint={data.reason ?? 'An HR administrator can connect it on your employee record.'}
        />
      </>
    );
  }

  const { me, seats, reportsTo, reports, peers } = data;
  const many = seats.length > 1;

  // Every responsibility across every job, with the area it belongs to kept as
  // a label rather than a nesting level — one flat list is what a person reads.
  // `additional` is included deliberately: an ungrouped responsibility must
  // never vanish (plan §17.1).
  const allResponsibilities = seats.flatMap((s) => [
    ...(s.responsibilities?.areas ?? []).flatMap((a) => a.responsibilities),
    ...(s.responsibilities?.additional.responsibilities ?? []),
  ]);
  // The measures count too: a job with KPIs and no listed duties is not "nothing".
  const allMeasures = seats.flatMap((s) => [
    ...(s.responsibilities?.areas ?? []).flatMap((a) => a.measures),
    ...(s.responsibilities?.additional.measures ?? []),
  ]);
  const itemCount = allResponsibilities.length + allMeasures.length;
  const unwritten = seats.every((s) => s.responsibilities?.emptyBecauseUnwritten !== false);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* ── WHO AM I ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={me.fullName}
        actions={
          // Back to the chart. A self-only login gets their slice; anyone who
          // can see the company chart is redirected there by the route.
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={`/${company}/cf_hrms/my-org-chart`}
            startIcon={<AccountTreeRounded />}
          >
            See me on the org chart
          </Button>
        }
        subtitle={
          // `component="span"`, not a Stack: PageHeader renders its subtitle
          // inside a <Typography> (a <p>), and a <div> nested in a <p> is
          // invalid HTML — React logs a hydration error and the browser silently
          // closes the paragraph early, which breaks the layout in production
          // where the warning is not printed.
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Mono chip>{me.employeeCode}</Mono>
            {me.employmentStatus !== 'ACTIVE' && <StatusBadge status={me.employmentStatus} />}
            <Box component="span" sx={{ fontSize: 13.5, color: 'var(--c-text-2)' }}>
              {[
                seats[0]?.positionTitle ?? seats[0]?.roleTitle,
                me.departmentName,
                me.locationName,
              ].filter(Boolean).join(' · ')}
            </Box>
          </Box>
        }
      />

      {/* The jobs. Usually one card; three for the people who do three jobs. */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: many ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr' },
          mb: 2,
        }}
      >
        {seats.length > 0 ? (
          seats.map((s) => <SeatStrip key={s.assignmentId} seat={s} many={many} />)
        ) : (
          <Callout tone="warning" title="No job is recorded for you yet">
            Your employee record exists but no work has been assigned to it, so there is nothing to
            show here yet. Your HR department can set that up.
          </Callout>
        )}
      </Box>

      {/* ── THE THREE REMAINING ANSWERS, SIDE BY SIDE ───────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1.15fr 1fr 1fr' },
          alignItems: 'start',
        }}
      >
        {/* WHO DO I REPORT TO */}
        <SectionCard
          flush
          title="Who you report to"
          subtitle={
            reportsTo.length > 1
              ? `${reportsTo.length} people, each for a different part of your work`
              : undefined
          }
        >
          <ScrollPanel>
            {reportsTo.length === 0 ? (
              <Callout tone="warning" title="No manager is recorded">
                Nobody has been recorded as your manager yet. If that looks wrong, your supervisor
                or HR department can correct it.
              </Callout>
            ) : (
              <Stack spacing={1.25}>
                {reportsTo.map((line) => (
                  <Box key={line.key}>
                    {/* Only label which job a line belongs to when there is more than one. */}
                    {many && (
                      <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-3)', mb: 0.4 }}>
                        {`as ${line.seat.label}`}
                      </Typography>
                    )}
                    <ReportingLine line={line} />
                  </Box>
                ))}
                {reportsTo.length > 1 && (
                  <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.5, pt: 0.5 }}>
                    Having more than one manager is normal here. The solid green line is the one who
                    sets and signs off your work; a dashed line is real but narrower.
                  </Typography>
                )}
              </Stack>
            )}
          </ScrollPanel>
        </SectionCard>

        {/* WHO IS ON MY TEAM */}
        <SectionCard
          flush
          title="Your team"
          subtitle={
            reports.length > 0
              ? `${reports.length} ${reports.length === 1 ? 'person reports' : 'people report'} to you`
              : peers.length > 0 ? `${peers.length} alongside you` : undefined
          }
        >
          <ScrollPanel>
            {reports.length === 0 && peers.length === 0 ? (
              <EmptyState
                icon={<GroupsRounded sx={{ fontSize: 28 }} />}
                title="Nobody else is recorded on your team"
                hint="No one reports to you, and no one else shares your manager."
              />
            ) : (
              <Stack spacing={2}>
                {reports.length > 0 && (
                  <Box>
                    <CapsLabel>Report to you</CapsLabel>
                    <Box sx={{ mt: 0.5 }}>
                      {reports.map((m) => <TeamRow key={m.key} member={m} showLine />)}
                    </Box>
                  </Box>
                )}
                {peers.length > 0 && (
                  <Box>
                    <CapsLabel>Alongside you</CapsLabel>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mb: 0.5 }}>
                      {peers[0]?.sharedManager
                        ? `Also reporting to ${peers[0].sharedManager}.`
                        : 'Reporting to the same manager as you.'}
                    </Typography>
                    <Box>
                      {peers.map((m) => <TeamRow key={m.key} member={m} />)}
                    </Box>
                  </Box>
                )}
              </Stack>
            )}
          </ScrollPanel>
        </SectionCard>

        {/* WHAT AM I RESPONSIBLE FOR */}
        <SectionCard
          flush
          title="What you are responsible for"
          subtitle={
            itemCount > 0
              ? [
                  `${allResponsibilities.length} ${allResponsibilities.length === 1 ? 'responsibility' : 'responsibilities'}`,
                  allMeasures.length ? `${allMeasures.length} ${allMeasures.length === 1 ? 'KPI' : 'KPIs'}` : null,
                ].filter(Boolean).join(' · ')
              : undefined
          }
        >
          <ScrollPanel>
            {itemCount === 0 ? (
              <Callout
                tone="neutral"
                icon={<ChecklistRounded sx={{ fontSize: 18 }} />}
                title={unwritten ? 'Not written down yet' : 'Nothing recorded for your job'}
              >
                {unwritten
                  ? 'Your responsibilities have not been written into the system yet. That is about '
                    + 'the records, not about your job — your supervisor can tell you what is expected '
                    + 'while HR fills this in.'
                  : 'No responsibilities are recorded against your job at the moment.'}
              </Callout>
            ) : (
              <>
                {seats[0]?.responsibilities?.rolePurpose && (
                  <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.25, lineHeight: 1.55 }}>
                    {seats[0].responsibilities.rolePurpose}
                  </Typography>
                )}
                {/* The same grouped view HR sees on the role and the position
                    (components/JobContent.tsx), built from what /user/me/place
                    already returned — no request is made for it. One per job
                    for the people who hold more than one. */}
                <Stack spacing={2}>
                  {seats
                    .filter((s) => s.responsibilities)
                    .map((s) => (
                      <Box key={s.assignmentId} data-myjob="">
                        {many && (
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.5 }}>
                            {`as ${s.label}`}
                          </Typography>
                        )}
                        <JobContent content={fromSelfResponsibilities(s.responsibilities!)} voice="self" dense />
                      </Box>
                    ))}
                </Stack>
              </>
            )}
          </ScrollPanel>
        </SectionCard>
      </Box>

      {/* ── The footnotes. Below the fold on purpose: useful, not the answer. ── */}
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {/* Their own details, so "my emergency contact is wrong" is actionable. */}
        {(me.contact.phone || me.contact.email || me.contact.dateOfBirth) && (
          <SectionCard title="Your details on file">
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {me.contact.phone && <Fact label="Phone" value={me.contact.phone} />}
              {me.contact.email && <Fact label="Email" value={me.contact.email} />}
              {me.contact.dateOfBirth && <Fact label="Date of birth" value={me.contact.dateOfBirth} />}
              {me.dateOfJoining && <Fact label="Joined" value={me.dateOfJoining} />}
              {me.contractorName && <Fact label="Employer" value={me.contractorName} />}
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 1.5 }}>
              Something wrong here? Only your HR department can change it — tell them and they will.
            </Typography>
          </SectionCard>
        )}

        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ px: 0.5 }}>
          <Tooltip title="This page shows your own record only.">
            <LockOutlined sx={{ fontSize: 15, color: 'var(--c-text-3)', mt: '2px' }} aria-hidden />
          </Tooltip>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.6 }}>
            {`This is your own record, as it stands on ${data.asOf}. `}
            {data.pii.note ?? ''}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ px: 0.5 }}>
          <HelpOutlineRounded sx={{ fontSize: 15, color: 'var(--c-text-3)', mt: '2px' }} aria-hidden />
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', lineHeight: 1.6 }}>
            If anything on this page does not match what you actually do, tell your supervisor or
            your HR department. Nothing here can be changed from this screen.
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
