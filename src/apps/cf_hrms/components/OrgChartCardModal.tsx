import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import {
  Callout,
  CrossLink,
  DetailSkeleton,
  ErrorNotice,
  FactItem,
  Mono,
  StatusBadge,
  useIsPermitted,
} from '@shared/ui';
import type { CardContentItem, CardReportingRow, PositionCard } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import { usePositionRemoval } from './usePositionRemoval';
import { JobContentPanel } from './JobContentPanel';

/**
 * The position card (spec §5) — the body of the floating panel since 2026-10-09
 * (spec §14). It was a modal Dialog until then; the file keeps its name so the
 * history reads straight. The panel draws the title; this draws everything else.
 *
 * The section that earns this modal is **Reporting**. It shows the full
 * resolved set from `reportingResolver` — every manager, with the type of
 * authority and the part of the work it covers — because the model is
 * many-to-many and the chart can only draw one edge as the tree
 * (CF_HRMS_PLAN.md §2 rule 9). A scope sentence beside a dotted line is the
 * thing whose absence made this client invent a "Compliance Role" to hold a
 * second manager. When a manager's seat is empty the row says so rather than
 * disappearing: an unfilled manager is information, not a gap in the data.
 *
 * Everything else is a cross-link (design system principle #4) — the position,
 * the role, each employee, each work context — so the card is a junction rather
 * than a dead end.
 */

const SHIFT_LABEL: Record<string, string> = {
  G: 'General shift',
  D: 'Day shift',
  N: 'Night shift',
  DN: 'Day & Night shift',
};

function ContentList({
  title,
  items,
  empty,
}: {
  title: string;
  items: CardContentItem[];
  empty: string;
}) {
  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>
        {title}
        {items.length > 0 && (
          <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)', ml: 1 }}>
            {items.length}
          </Typography>
        )}
      </Typography>
      {items.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>{empty}</Typography>
      ) : (
        <Stack component="ol" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
          {items.map((it, i) => (
            <Box component="li" key={it.id ?? it.definitionId ?? i} sx={{ fontSize: 14, lineHeight: 1.5 }}>
              {it.text}
              {(it.kraText || it.weightPercent != null || it.layer) && (
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                  {[
                    it.kraText ? `Under ${it.kraText}` : null,
                    it.weightPercent != null ? `${it.weightPercent}%` : null,
                    it.layer && it.layer !== 'ROLE' ? `${it.layer.toLowerCase()} overlay` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function ReportingRow({ row, company }: { row: CardReportingRow; company: string }) {
  const scoped = row.scopeType && row.scopeType !== 'GENERAL';
  const people = row.managerCandidates ?? [];
  // A manager's position is a SEAT. When it is empty the reporting line is still
  // real and still names who this person answers to — it simply has nobody in it
  // today. Dropping the row would read as "no manager", which is a different and
  // untrue statement.
  const seatVacant = row.vacant === true || people.length === 0;
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 'var(--r-sm)',
        background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
        borderLeft: `3px solid ${row.typeCode === 'PRIMARY_MANAGER' ? 'var(--c-primary-500)' : 'var(--c-info-600)'}`,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{row.typeName}</Typography>
        {row.isPrimary && (
          <Chip size="small" label="Primary for this layer" sx={{ height: 20, fontSize: 11 }} />
        )}
        {row.origin && (
          <Chip
            size="small"
            variant="outlined"
            label={row.origin === 'ASSIGNMENT' ? 'From this assignment' : 'From the position'}
            sx={{ height: 20, fontSize: 11 }}
          />
        )}
        {(row.layer === 'ACTUAL' || row.isFormal === false) && (
          <Chip
            size="small"
            variant="outlined"
            label="Actual, not formal"
            sx={{ height: 20, fontSize: 11 }}
          />
        )}
      </Stack>
      <Typography sx={{ fontSize: 14, mt: 0.5 }}>
        {row.managerPositionId ? (
          <CrossLink
            label={row.managerPositionTitle ?? `Position ${row.managerPositionId}`}
            to={`/${company}/cf_hrms/positions/${row.managerPositionId}`}
          />
        ) : (
          (row.managerPositionTitle ?? 'Manager not recorded')
        )}
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: scoped ? 'var(--c-text)' : 'var(--c-text-2)', mt: 0.5 }}>
        {scoped
          ? `Scope: ${row.scopeLabel ?? row.scopeSentence ?? row.scopeType}`
          : (row.scopeSentence ?? 'All of this work')}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
        {seatVacant ? (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', fontStyle: 'italic' }}>
            {row.note ??
              'That seat is vacant today — the reporting line exists, the person does not.'}
          </Typography>
        ) : (
          people.map((p) => (
            <CrossLink
              key={p.employeeId}
              label={p.name}
              to={`/${company}/cf_hrms/employees/${p.employeeId}`}
            />
          ))
        )}
      </Stack>
    </Box>
  );
}

export function OrgChartCard({
  positionId,
  asOf,
  company,
  onClose,
  onStartFrom,
  onChanged,
  children,
}: {
  positionId: number | null;
  asOf: string;
  company: string;
  /** Closes the panel; called once a seat has been closed or deleted from here. */
  onClose: () => void;
  onStartFrom: (id: number) => void;
  /** The viewer's own controls for this box (arrangement, fold), under the actions. */
  children?: ReactNode;
  /**
   * Called after a position is closed or deleted from this card. The chart holds
   * the whole graph in its parent, so the parent is the one that can refresh it:
   * pass its reload here. Without it the page reloads itself, which is correct
   * but blunt — a removed seat must not stay on screen.
   */
  onChanged?: () => void;
}) {
  const [loaded, setCard] = useState<PositionCard | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const canEditRole = can('cf_hrms_roles_manage');
  // Close or delete this seat. The dialog reads what it would do to the seat's
  // team before it offers anything, and makes closing the default.
  const removal = usePositionRemoval({
    onDone: () => {
      onClose();
      if (onChanged) onChanged();
      else window.setTimeout(() => window.location.reload(), 1200); // long enough to read the toast
    },
  });

  useEffect(() => {
    if (positionId == null) return;
    let live = true;
    setLoading(true);
    setCard(null);
    setError(null);
    orgChartApi
      .card(positionId, asOf)
      .then((c) => {
        if (live) setCard(c);
      })
      .catch((e) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [positionId, asOf]);

  // A card from the previous box must never sit under this box's title.
  const card = loaded && loaded.positionId === positionId ? loaded : null;

  return (
    <>
      <Box>
        {loading && !card && <DetailSkeleton />}
        {!!error && <ErrorNotice error={error} />}
        {card && (
          <>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              {card.positionCode && <Mono sx={{ fontSize: 12.5 }}>{card.positionCode}</Mono>}
              {card.status && <StatusBadge status={card.status} />}
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>as at {asOf}</Typography>
            </Stack>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                gap: 2,
                mb: 2,
              }}
            >
              <FactItem label="Role" value={card.roleTitle ?? '—'} />
              <FactItem label="Department" value={card.departmentName ?? '—'} />
              <FactItem label="Location" value={card.locationName ?? '—'} />
              <FactItem
                label="Shift"
                value={SHIFT_LABEL[card.shiftPattern] ?? card.shiftPattern}
              />
              {/* Seats, not headcount: a day/night seat is two seats, and
                  "sanctioned 1 / vacant 2" on the same card reads as a bug. */}
              <FactItem
                label="Seats"
                value={String(card.effectiveSanctioned ?? card.sanctionedHeadcount)}
              />
              <FactItem label="Filled" value={String(card.occupants?.length ?? 0)} />
              <FactItem label="Vacant" value={String(card.vacancies)} />
              <FactItem label="Open points" value={String(card.openPoints?.length ?? 0)} />
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <CrossLink label="Open position" to={`/${company}/cf_hrms/positions/${card.positionId}`} />
              {card.roleId && (
                <CrossLink label="Open role" to={`/${company}/cf_hrms/roles/${card.roleId}`} />
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNewRounded />}
                onClick={() => onStartFrom(card.positionId)}
              >
                Start the chart here
              </Button>
              {canManage && (
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  startIcon={<DeleteOutlineRounded />}
                  disabled={removal.busyId === card.positionId}
                  onClick={() => { void removal.start(card.positionId); }}
                >
                  Close or delete…
                </Button>
              )}
            </Stack>

            {children}

            {card.rolePurpose && (
              <Callout label="Purpose" title="Why this role exists">
                {card.rolePurpose}
              </Callout>
            )}

            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>Reporting</Typography>
              {(card.reporting ?? []).length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                  No reporting relationship recorded — this is a top of the chart.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {card.reporting.map((r, i) => (
                    <ReportingRow key={`${r.typeCode}-${r.managerPositionId}-${i}`} row={r} company={company} />
                  ))}
                </Stack>
              )}
            </Box>

            {(card.directReports ?? []).length > 0 && (
              <Box sx={{ mt: 2.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>
                  Direct reports
                  <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-3)', ml: 1 }}>
                    {card.directReports!.length}
                  </Typography>
                </Typography>
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {card.directReports!.map((d) => (
                    <CrossLink
                      key={d.positionId}
                      label={d.title}
                      to={`/${company}/cf_hrms/positions/${d.positionId}`}
                    />
                  ))}
                </Stack>
              </Box>
            )}

            {/* Machines and areas are departments now (plan §9.4); this block is
                only for a seat that still carries a work context. */}
            {(card.contexts ?? []).length > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>Work contexts</Typography>
              {(card.contexts ?? []).length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                  No machine or area recorded against this seat.
                </Typography>
              ) : (
                <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                  {card.contexts.map((c) => (
                    <Chip
                      key={c.id}
                      component={RouterLink}
                      to={`/${company}/cf_hrms/work-contexts`}
                      clickable
                      size="small"
                      label={`${c.name}${c.contextType ? ` · ${c.contextType.toLowerCase()}` : ''}`}
                    />
                  ))}
                </Stack>
              )}
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>
                A machine or area is where the work happens. It is never a manager.
              </Typography>
            </Box>
            )}

            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>People in this seat</Typography>
              {(card.occupants ?? []).length === 0 ? (
                <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>
                  Nobody is assigned. {card.vacancies} vacant seat
                  {card.vacancies === 1 ? '' : 's'}.
                </Typography>
              ) : (
                <Stack spacing={0.5}>
                  {card.occupants.map((o) => (
                    <Stack
                      key={o.assignmentId ?? o.employeeId}
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      useFlexGap
                    >
                      <CrossLink
                        label={o.name}
                        to={`/${company}/cf_hrms/employees/${o.employeeId}`}
                      />
                      {o.employeeCode && <Mono sx={{ fontSize: 12 }}>{o.employeeCode}</Mono>}
                      {o.allocationPercent != null && (
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                          {o.allocationPercent}% of their time
                        </Typography>
                      )}
                      {o.shiftCode && (
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
                          {SHIFT_LABEL[o.shiftCode] ?? o.shiftCode}
                        </Typography>
                      )}
                      {o.attendanceStatus && <StatusBadge status={o.attendanceStatus} />}
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <Divider sx={{ mt: 2.5 }} />

            {/* The seat's RESOLVED job: its role's KRAs with the responsibilities
                and KPIs under each, and anything this seat does differently marked
                on the line. Its own request (cf_hrms_org_view), made beside the
                card's, so the facts above never wait for it. Until 2026-10-10 this
                was three flat lists of the ROLE's content, which could not show a
                seat's own changes. */}
            <Box sx={{ mt: 2.5 }} data-card-jobcontent="">
              <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>Job content</Typography>
              <JobContentPanel
                target={{ type: 'position', id: card.positionId }}
                asOf={asOf}
                dense
                noKrasAction={
                  card.roleId ? (
                    <Box component={RouterLink} to={`/${company}/cf_hrms/roles/${card.roleId}?tab=content`} sx={{ color: 'var(--c-primary-700)' }}>
                      {canEditRole ? 'Write them on the role' : 'Open the role'}
                    </Box>
                  ) : undefined
                }
                after={() => (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                    {canManage && (
                      <CrossLink label="Edit for this seat" to={`/${company}/cf_hrms/positions/${card.positionId}?tab=job&edit=1`} />
                    )}
                    {canEditRole && card.roleId && (
                      <CrossLink label="Edit the role's KRAs" to={`/${company}/cf_hrms/roles/${card.roleId}?tab=content`} />
                    )}
                  </Stack>
                )}
              />
            </Box>
            <ContentList
              title="Qualifications"
              items={card.qualifications ?? []}
              empty="No qualification or experience requirement recorded."
            />

            {(card.openPoints ?? []).length > 0 && (
              <Box sx={{ mt: 2.5 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 1 }}>
                  Open points — the client still has to answer these
                </Typography>
                <Stack component="ol" spacing={0.75} sx={{ m: 0, pl: 2.5 }}>
                  {card.openPoints.map((p) => (
                    <Box component="li" key={p.id} sx={{ fontSize: 14, lineHeight: 1.5 }}>
                      {p.question}
                      <StatusBadge status={p.status} />
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}
      </Box>
      {removal.dialog}
    </>
  );
}
