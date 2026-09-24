import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import { SectionCard, EmptyState, StatusBadge, ToneBadge, Mono } from '@shared/ui';
import type { AssignmentSummary } from '../api/people';

/**
 * Work — the read view of "one person, many jobs".
 *
 * This tab is where the central idea of the whole model becomes visible: Ram
 * Babu is Admin Manager 60%, HR Executive 25% and Transport Coordinator 15% —
 * ONE employee record, THREE assignments, no duplicated person anywhere. So the
 * allocation is drawn as a proportion bar you can read at a glance rather than
 * left as three numbers in a column, and the assignments are ordered primary
 * first, biggest share next.
 *
 * READ ONLY, on purpose. Creating, changing and ending an assignment belongs to
 * the Work assignments screen and its own permission; this links out to it.
 *
 * The allocation total is SHOWN and never enforced. Nothing requires a person's
 * assignments to add to 100 — that is a company policy choice, and enforcing it
 * would make a handover week impossible to record honestly. So the bar says what
 * the total is and leaves the judgement to the reader.
 */

const ASSIGNMENT_TONE = {
  ACTIVE: 'success',
  PLANNED: 'info',
  SUSPENDED: 'warning',
  ENDED: 'neutral',
} as const;

const ASSIGNMENT_LABEL = {
  ACTIVE: 'Active',
  PLANNED: 'Planned',
  SUSPENDED: 'Suspended',
  ENDED: 'Ended',
};

/**
 * Segment colours, darkest first, so the primary assignment reads as the main
 * one. Named tokens rather than a computed ramp — `--c-primary-300` does not
 * exist, and a missing variable renders as a transparent segment.
 */
const SEGMENT = [
  'var(--c-primary-600)',
  'var(--c-primary-500)',
  'var(--c-primary-400)',
  'var(--c-primary-200)',
  'var(--c-primary-100)',
];

/** The proportion bar. One segment per active assignment, widths = allocation. */
function AllocationBar({ items, total }: { items: AssignmentSummary[]; total: number }) {
  // Unallocated time is drawn too — a person at 40% is a real and visible fact.
  const span = Math.max(total, 100);
  return (
    <Box sx={{ mt: 1 }}>
      <Box
        sx={{
          display: 'flex',
          height: 10,
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          background: 'var(--c-surface-2)',
          border: '1px solid var(--c-border)',
        }}
        role="img"
        aria-label={`Allocation: ${items.map((a) => `${a.roleTitle} ${a.allocationPercent ?? 0}%`).join(', ')}`}
      >
        {items.map((a, i) => (
          <Box
            key={a.id}
            sx={{
              width: `${((a.allocationPercent ?? 0) / span) * 100}%`,
              background: SEGMENT[Math.min(i, SEGMENT.length - 1)],
              transition: 'width var(--t-normal) var(--ease)',
            }}
          />
        ))}
      </Box>
      <Typography sx={{ fontSize: 12, color: total === 100 ? 'var(--c-text-3)' : 'var(--c-warning-600)', mt: 0.5 }}>
        {total === 100
          ? 'Fully allocated'
          : total > 100
            ? `Allocated ${total}% — over 100%, which is allowed but worth a look`
            : `Allocated ${total}% — ${100 - total}% of this person's time is not recorded against any job`}
      </Typography>
    </Box>
  );
}

function AssignmentCard({ a, companySlug }: { a: AssignmentSummary; companySlug: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        py: 1.75,
        borderTop: '1px solid var(--c-border)',
        '&:first-of-type': { borderTop: 0, pt: 0 },
      }}
    >
      {/* The share, big enough to compare down the column without reading. */}
      <Box sx={{ width: 64, flexShrink: 0, textAlign: 'right' }}>
        <Typography
          sx={{
            fontFamily: 'var(--font-mono)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 20,
            fontWeight: 600,
            color: a.isActive ? 'var(--c-text)' : 'var(--c-text-3)',
            lineHeight: 1.1,
          }}
        >
          {a.allocationPercent === null ? '—' : `${a.allocationPercent}%`}
        </Typography>
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)' }}>
            {a.roleTitle ?? a.assignmentTitle ?? `Assignment ${a.id}`}
          </Typography>
          {a.isPrimary && <ToneBadge tone="info" label="Primary" noIcon title="Supplies defaults for display, roster and profile" />}
          <StatusBadge status={a.status} map={ASSIGNMENT_TONE} labelMap={ASSIGNMENT_LABEL} />
        </Box>

        {a.assignmentTitle && a.roleTitle && (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: 0.25 }}>
            Titled “{a.assignmentTitle}” for this person
          </Typography>
        )}

        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mt: 0.5 }}>
          {[
            a.departmentName,
            a.locationName,
            a.positionTitle ?? a.positionCode,
            a.shiftName && `${a.shiftName} shift`,
          ].filter(Boolean).join(' · ') || 'No department or location recorded'}
        </Typography>

        {a.contexts.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75 }}>
            {/* Machines and areas are contexts, never managers. */}
            {a.contexts.map((c) => (
              <ToneBadge key={c.id} tone="neutral" label={c.name} noIcon title={c.type} />
            ))}
          </Box>
        )}

        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5 }}>
          From <Mono sx={{ fontSize: 12 }}>{a.effectiveFrom}</Mono>
          {a.effectiveTo ? <> to <Mono sx={{ fontSize: 12 }}>{a.effectiveTo}</Mono></> : ' — open ended'}
          {a.reason && ` · ${a.reason}`}
        </Typography>
      </Box>

      <Button
        component={Link}
        to={`/${companySlug}/cf_hrms/assignments/${a.id}`}
        size="small"
        endIcon={<OpenInNewRounded sx={{ fontSize: 14 }} />}
        sx={{ flexShrink: 0 }}
      >
        Open
      </Button>
    </Box>
  );
}

export function EmployeeWorkTab({
  assignments,
  totalAllocationPercent,
  companySlug,
  employeeName,
}: {
  assignments: AssignmentSummary[];
  totalAllocationPercent: number;
  companySlug: string;
  employeeName: string;
}) {
  const active = assignments.filter((a) => a.isActive);
  const other = assignments.filter((a) => !a.isActive);

  if (assignments.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={<WorkOutlineRounded />}
          title="No work assignments"
          body={`${employeeName} is on the books but is doing no recorded work. A work assignment is what says which role they hold, for how much of their time, and where.`}
          action={(
            <Button component={Link} to={`/${companySlug}/cf_hrms/assignments`} variant="contained" size="small">
              Go to work assignments
            </Button>
          )}
        />
      </SectionCard>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionCard
        title={active.length === 1 ? 'Current job' : `Current jobs (${active.length})`}
        subtitle="One person, as many jobs as they actually do — each with its own role, share of time and context"
        actions={(
          <Button component={Link} to={`/${companySlug}/cf_hrms/assignments`} size="small">
            All assignments
          </Button>
        )}
      >
        {active.length === 0 ? (
          <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-3)' }}>
            Nothing active today. Past and planned assignments are below.
          </Typography>
        ) : (
          <>
            <AllocationBar items={active} total={totalAllocationPercent} />
            <Box sx={{ mt: 2 }}>
              {active.map((a) => <AssignmentCard key={a.id} a={a} companySlug={companySlug} />)}
            </Box>
          </>
        )}
      </SectionCard>

      {other.length > 0 && (
        <SectionCard
          title={`Not active today (${other.length})`}
          subtitle="Ended, planned or suspended — kept because the history is the point"
        >
          {other.map((a) => <AssignmentCard key={a.id} a={a} companySlug={companySlug} />)}
        </SectionCard>
      )}
    </Box>
  );
}
