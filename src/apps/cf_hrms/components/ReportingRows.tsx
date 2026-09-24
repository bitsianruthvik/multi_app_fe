import { Box, Stack, Tooltip, Typography } from '@mui/material';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import { EmptyState, Mono, Surface, ToneBadge, CrossLink } from '@shared/ui';
import type { StatusTone } from '@shared/ui';
import type { ResolvedRelationship } from '../api/assignments';

/**
 * The reporting SET, rendered.
 *
 * This component exists to make one idea unmissable on screen: a person can
 * have several managers at once, each of a different KIND, each over a
 * different SCOPE of the work, and each coming from a different LAYER — the
 * position's formal design, or this assignment. Collapsing that into "Manager:
 * Sunita Rao" is the mistake the v1.1 addenda were written to prevent, so
 * nothing here has a single-manager mode.
 *
 * Every row states, in this order: which layer it came from, what kind of
 * authority it is, who holds it (and which of their own hats), what part of the
 * work it covers, and when it applies.
 */

/** Relationship type → badge tone. Kinds of authority, not statuses. */
const TYPE_TONE: Record<string, StatusTone> = {
  PRIMARY_MANAGER: 'success',
  FUNCTIONAL_MANAGER: 'info',
  ADMINISTRATIVE_MANAGER: 'info',
  DOTTED_LINE: 'neutral',
  PROJECT_MANAGER: 'warning',
  SHIFT_SUPERVISOR: 'neutral',
};

export function OriginBadge({ origin }: { origin: 'POSITION' | 'ASSIGNMENT' }) {
  return (
    <Tooltip
      title={
        origin === 'POSITION'
          ? 'Inherited from the position. This is the formal organisation design — it survives a vacancy and a change of people.'
          : 'Added on this work assignment. It is true for this person doing this work.'
      }
    >
      <span>
        <ToneBadge
          tone={origin === 'POSITION' ? 'info' : 'neutral'}
          noIcon
          label={origin === 'POSITION' ? 'From the position' : 'On this assignment'}
        />
      </span>
    </Tooltip>
  );
}

function dateRange(from: string | null, to: string | null): string {
  if (!from && !to) return 'No dates recorded';
  if (from && to) return `${from} → ${to}`;
  if (from) return `From ${from}`;
  return `Until ${to}`;
}

export function ReportingRow({
  row,
  companySlug,
  actions,
  muted = false,
}: {
  row: ResolvedRelationship;
  companySlug: string;
  actions?: React.ReactNode;
  muted?: boolean;
}) {
  const scoped = row.scope.type !== 'GENERAL';
  return (
    <Surface
      e={1}
      bordered
      sx={{
        p: 1.75,
        opacity: muted ? 0.68 : 1,
        borderLeft: '3px solid',
        borderLeftColor: row.isPrimary ? 'var(--c-success-600)' : scoped ? 'var(--c-warning-600)' : 'var(--c-border)',
      }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={1.5} flexWrap="wrap">
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.75 }}>
            <ToneBadge tone={TYPE_TONE[row.relationshipType.code] ?? 'neutral'} label={row.relationshipType.name} />
            <OriginBadge origin={row.origin} />
            {row.isPrimary && (
              <Tooltip title="Primary for this reporting layer. It does not invalidate the dotted, functional or project managers beside it.">
                <span><ToneBadge tone="success" noIcon label="Primary for this layer" /></span>
              </Tooltip>
            )}
            {row.endsOn && <ToneBadge tone="warning" noIcon label={`Ends ${row.endsOn}`} />}
          </Stack>

          {/* Who. A person, and preferably which of their own hats. */}
          {row.manager ? (
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <PersonRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} aria-hidden />
              <CrossLink
                label={row.manager.name}
                to={`/${companySlug}/cf_hrms/employees/${row.manager.employeeId}`}
              />
              {row.manager.workAssignmentId && (
                <CrossLink
                  label={`as ${row.manager.workAssignmentTitle ?? row.manager.roleTitle ?? 'their assignment'}`}
                  to={`/${companySlug}/cf_hrms/assignments/${row.manager.workAssignmentId}`}
                />
              )}
              {row.managerPosition && (
                <CrossLink
                  label={row.managerPosition.code ?? row.managerPosition.title ?? 'seat'}
                  to={`/${companySlug}/cf_hrms/positions/${row.managerPosition.id}`}
                />
              )}
            </Stack>
          ) : (
            <Stack direction="row" spacing={0.75} alignItems="center">
              <AccountTreeRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} aria-hidden />
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                {row.managerPosition
                  ? `${row.managerPosition.title ?? 'That seat'} is vacant — the formal line still stands, nobody currently holds it.`
                  : 'No manager recorded.'}
              </Typography>
            </Stack>
          )}

          {row.managerCandidates.length > 1 && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>
              Also in that seat: {row.managerCandidates.slice(1).map((m) => m.name).join(', ')}
            </Typography>
          )}

          {/* What part of the work. The mechanism that keeps a partial-authority
              manager from becoming a second role. */}
          <Typography sx={{ fontSize: 12.5, color: scoped ? 'var(--c-warning-700)' : 'var(--c-text-3)', mt: 0.75 }}>
            {row.scopeSentence}
            {row.scope.workContextName ? ` · ${row.scope.workContextName}` : ''}
          </Typography>
          {row.scope.notes && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>{row.scope.notes}</Typography>
          )}
          {row.note && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.5, fontStyle: 'italic' }}>{row.note}</Typography>
          )}
        </Box>

        <Stack sx={{ flex: '0 0 auto', alignItems: 'flex-end' }} spacing={0.75}>
          <Mono sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{dateRange(row.effectiveFrom, row.effectiveTo)}</Mono>
          {actions}
        </Stack>
      </Stack>
    </Surface>
  );
}

export function ReportingRowList({
  rows,
  companySlug,
  rowActions,
  muted,
  emptyTitle = 'No reporting lines',
  emptyHint,
  emptyAction,
}: {
  rows: ResolvedRelationship[];
  companySlug: string;
  rowActions?: (row: ResolvedRelationship) => React.ReactNode;
  muted?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={<AccountTreeRounded />}
        title={emptyTitle}
        hint={emptyHint ?? 'Nobody has authority over this work yet. Add a manager — it needs no second role and no second assignment.'}
        action={emptyAction}
      />
    );
  }
  return (
    <Stack spacing={1.25}>
      {rows.map((r) => (
        <ReportingRow key={r.key} row={r} companySlug={companySlug} actions={rowActions?.(r)} muted={muted} />
      ))}
    </Stack>
  );
}
