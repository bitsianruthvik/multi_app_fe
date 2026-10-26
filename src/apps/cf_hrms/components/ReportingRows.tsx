import { Box, Stack, Tooltip, Typography } from '@mui/material';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import { EmptyState, Mono, Surface, ToneBadge, CrossLink } from '@shared/ui';
import type { StatusTone } from '@shared/ui';
import type { ResolvedRelationship } from '../api/assignments';
import { useCan } from '../access/can';
import { derivedFromText } from './unitReportingText';

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

export function OriginBadge({ origin }: { origin: 'POSITION' | 'ASSIGNMENT' | 'DERIVED' }) {
  if (origin === 'DERIVED') {
    return (
      <Tooltip title="No line is stored for this position: it follows its org unit — the unit’s head, or what the unit reports into. Add a line by hand only where it should differ.">
        <span>
          <ToneBadge tone="info" noIcon label="From the org unit" />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      title={
        origin === 'POSITION'
          ? 'Inherited from the position. This is the formal organisation design — it survives a vacancy and a change of people.'
          : 'Added for this person. It is true for this person doing this work.'
      }
    >
      <span>
        <ToneBadge
          tone={origin === 'POSITION' ? 'info' : 'neutral'}
          noIcon
          label={origin === 'POSITION' ? 'From the position' : 'For this person'}
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
  const can = useCan();
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
            {row.origin === 'DERIVED' && derivedFromText(row) && <ToneBadge tone="neutral" noIcon label={derivedFromText(row)!} />}
            {row.crossTree && (
              <Tooltip title={row.crossTreeReason ? `Intended: ${row.crossTreeReason}` : 'The manager is not in this org unit or one above it, and nobody has said why. The reporting check lists it.'}>
                <span data-cross-tree=""><ToneBadge tone="warning" noIcon label="Outside the tree" /></span>
              </Tooltip>
            )}
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
              {can.employees.view ? (
                <CrossLink
                  label={row.manager.name}
                  to={`/${companySlug}/cf_hrms/employees/${row.manager.employeeId}`}
                />
              ) : (
                <Typography component="span" sx={{ fontSize: 14 }}>{row.manager.name}</Typography>
              )}
              {row.manager.workAssignmentId && (
                <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  as {row.manager.workAssignmentTitle ?? row.manager.roleTitle ?? 'their position'}
                </Typography>
              )}
              {row.managerPosition && (can.positions.view ? (
                <CrossLink
                  label={row.managerPosition.code ?? row.managerPosition.title ?? 'position'}
                  to={`/${companySlug}/cf_hrms/positions/${row.managerPosition.id}`}
                />
              ) : (
                <Typography component="span" sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                  {row.managerPosition.code ?? row.managerPosition.title ?? 'position'}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Stack direction="row" spacing={0.75} alignItems="center">
              <AccountTreeRounded sx={{ fontSize: 16, color: 'var(--c-text-3)' }} aria-hidden />
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
                {row.managerPosition
                  ? `${row.managerPosition.title ?? 'That position'} is vacant — the formal line still stands, nobody currently holds it.`
                  : 'No manager recorded.'}
              </Typography>
            </Stack>
          )}

          {row.managerCandidates.length > 1 && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.5 }}>
              Also in that position: {row.managerCandidates.slice(1).map((m) => m.name).join(', ')}
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
        hint={emptyHint ?? 'Nobody has authority over this work yet. Add a manager — it needs no second role and no second position held.'}
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
