import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import { DetailSkeleton, ErrorNotice, Mono, StatusBadge, ToneBadge, useIsPermitted } from '@shared/ui';
import type { CardReportingRow, OrgChartNode, PositionCard } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';
import { rowsOf, seatCount, type BoxRow } from './orgChartLayout';
import { usePositionRemoval } from './usePositionRemoval';
import { OrgChartJobSection } from './OrgChartJobSection';
import { SHIFT_SHORT, SHIFT_WORD, inPanelLink, smallLabel, type PanelNav } from './orgChartPanelNav';

/**
 * A position, in the org chart's floating panel (spec §17; it replaced the
 * card of §5 / §14 on 2026-10-10, after the client read it on production).
 *
 * THE ORDER IS THE CLIENT'S, top to bottom:
 *   1. the people in the seats — one row per seat, exactly as the box draws
 *      them (`rowsOf`), each a button: a person opens that person, an open seat
 *      opens the vacancy. There is no Seats / Filled / Vacant number grid any
 *      more; the list IS those numbers, and its heading carries the count from
 *      the one seat rule (`seatCount`).
 *   2. the facts, shrunk to a strip — role, department, location, shift, and who
 *      the seat reports to (with the scope of a dotted line, and "vacant" when
 *      the manager's seat is empty: an unfilled manager is information).
 *   3. the role's purpose, then its KRAs → responsibilities and KPIs, editable
 *      in place for someone who may edit roles (`OrgChartJobSection`).
 *   4. the actions.
 *   5. the positions that report to this one — last.
 *
 * NOTHING HERE LEAVES THE PANEL unless it says "page": a person, an open seat,
 * the role, a manager's or a report's position all open in the panel, on top of
 * this view, with Back.
 */

export function SectionTitle({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <Typography component="h3" sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', mb: 0.75 }}>
      {children}
      {count != null && (
        <Box component="span" sx={{ fontWeight: 400, color: 'var(--c-text-2)', ml: 0.75 }}>
          · {count}
        </Box>
      )}
    </Typography>
  );
}

/** One row of the people list: a whole-row button, the shift on the left. */
function SeatRow({ row, onClick, label }: { row: BoxRow; onClick: () => void; label: string }) {
  const o = row.occupant;
  return (
    <Box
      component="button"
      type="button"
      data-seatrow={o ? 'person' : 'open'}
      aria-label={label}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        px: 1,
        py: 0.7,
        border: '1px solid var(--c-border)',
        borderStyle: o ? 'solid' : 'dashed',
        borderRadius: 'var(--r-sm)',
        background: o ? 'var(--c-surface)' : 'var(--c-surface-2)',
        '&:hover': { borderColor: 'var(--c-primary-500)' },
        '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
      }}
    >
      {o ? (
        <PersonRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-2)', flexShrink: 0 }} />
      ) : (
        <PersonAddAltRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-2)', flexShrink: 0 }} />
      )}
      {row.shift !== 'G' && (
        <Box sx={{ ...smallLabel, width: 38, flexShrink: 0, color: 'var(--c-text-2)' }}>{SHIFT_SHORT[row.shift]}</Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 13.5, fontWeight: o ? 500 : 400, color: o ? 'var(--c-text)' : 'var(--c-text-2)', fontStyle: o ? 'normal' : 'italic', overflowWrap: 'anywhere' }}>
          {o ? o.name : 'Open seat'}
        </Box>
      </Box>
      {o?.employeeCode && <Mono sx={{ fontSize: 11.5, flexShrink: 0 }}>{o.employeeCode}</Mono>}
      {o?.attendanceStatus && <StatusBadge status={o.attendanceStatus} />}
      <ChevronRightRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-3)', flexShrink: 0 }} />
    </Box>
  );
}

/** A manager line, one or two lines tall. The manager's seat and its people open in the panel. */
function ReportsToLine({ row, nav, title }: { row: CardReportingRow; nav: PanelNav; title: string }) {
  const people = row.managerCandidates ?? [];
  const vacant = row.vacant === true || people.length === 0;
  const scoped = row.scopeType && row.scopeType !== 'GENERAL';
  const primary = row.typeCode === 'PRIMARY_MANAGER';
  return (
    <Box
      data-reportsto=""
      sx={{
        pl: 1,
        borderLeft: '3px',
        borderLeftStyle: primary ? 'solid' : 'dashed',
        // --c-text-3, not --c-border: a dashed edge in the dark border token is invisible.
        borderLeftColor: primary ? 'var(--c-primary-500)' : 'var(--c-text-3)',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 0.75 }}>
        {row.managerPositionId ? (
          <Box
            component="button"
            type="button"
            onClick={() =>
              nav.push({ kind: 'seat', positionId: row.managerPositionId!, title })
            }
            sx={{ ...inPanelLink, fontWeight: 500 }}
          >
            {title}
          </Box>
        ) : (
          <span>{row.managerPositionTitle ?? 'Manager not recorded'}</span>
        )}
        <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {row.typeName}
          {row.origin === 'ASSIGNMENT' ? ' · for this person' : ''}
        </Box>
      </Box>
      <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {vacant ? (
          <Box component="span" sx={{ fontStyle: 'italic' }}>
            {row.note ?? 'That seat is vacant today — the line exists, the person does not.'}
          </Box>
        ) : (
          people.map((p, i) => (
            <span key={p.employeeId}>
              {i > 0 ? ', ' : ''}
              <Box
                component="button"
                type="button"
                onClick={() =>
                  nav.push({
                    kind: 'person',
                    employeeId: p.employeeId,
                    title: p.name,
                    employeeCode: null,
                    positionId: row.managerPositionId ?? null,
                    shiftCode: null,
                  })
                }
                sx={inPanelLink}
              >
                {p.name}
              </Box>
            </span>
          ))
        )}
        {scoped && <> · only for {row.scopeLabel ?? row.scopeSentence ?? String(row.scopeType).toLowerCase()}</>}
      </Box>
    </Box>
  );
}

export function OrgChartSeatView({
  positionId,
  node,
  asOf,
  company,
  nav,
  titleOf,
  onClose,
  onStartFrom,
  onChanged,
  children,
}: {
  positionId: number;
  /** The seat as the chart holds it — the people rows are drawn from this, like the box. */
  node: OrgChartNode | null;
  asOf: string;
  company: string;
  nav: PanelNav;
  /**
   * A position's title as the CHART writes it — disambiguated ("Incharge -
   * Production (Printing)") where four seats share one title. Falls back to the
   * card's plain title for a seat that is not on the chart.
   */
  titleOf?: (positionId: number) => string | undefined;
  /** Closes the panel; called once a seat has been closed or deleted from here. */
  onClose: () => void;
  onStartFrom: (id: number) => void;
  /** After anything here changes the organisation; the page reloads the graph. */
  onChanged?: () => void;
  /** The viewer's own view options for this box, at the very bottom. */
  children?: ReactNode;
}) {
  const [loaded, setCard] = useState<PositionCard | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const canAssign = can('cf_hrms_assignments_manage');
  const removal = usePositionRemoval({
    onDone: () => {
      onClose();
      if (onChanged) onChanged();
      else window.setTimeout(() => window.location.reload(), 1200);
    },
  });

  // `node` in the deps: when the graph reloads after an assignment, the card's
  // reporting and reports are read again with it.
  const occupantKey = (node?.occupants ?? []).map((o) => o.assignmentId).join(',');
  useEffect(() => {
    let live = true;
    setLoading(true);
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
  }, [positionId, asOf, occupantKey]);

  // A card from the previous box must never sit under this box's title.
  const card = loaded && loaded.positionId === positionId ? loaded : null;

  // The rows the box draws. A seat that is not on the chart (closed, or outside
  // the date) has no node: fall back to the card's own occupants, no padding.
  const rows: BoxRow[] = node
    ? rowsOf(node, 'all')
    : (card?.occupants ?? []).map((o) => ({ shift: 'G' as const, occupant: o }));
  const count = node ? seatCount(node, 'all') : null;
  const title = node?.displayTitle || node?.title || card?.displayTitle || card?.title || 'Position';
  const roleId = node?.roleId ?? card?.roleId ?? null;
  const roleTitle = node?.roleTitle ?? card?.roleTitle ?? null;
  const pattern = node?.shiftPattern ?? card?.shiftPattern ?? 'G';
  const code = node?.positionCode ?? card?.positionCode ?? null;
  const status = node?.status ?? card?.status ?? null;
  const openPoints = card?.openPoints ?? [];
  const reports = card?.directReports ?? [];

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: 'Role',
      value:
        roleId != null ? (
          <Box
            component="button"
            type="button"
            data-rolelink=""
            onClick={() => nav.push({ kind: 'role', roleId, title: roleTitle ?? 'Role' })}
            sx={inPanelLink}
          >
            {roleTitle ?? 'Role'}
          </Box>
        ) : (
          '—'
        ),
    },
    { label: 'Department', value: node?.departmentName ?? card?.departmentName ?? '—' },
    { label: 'Location', value: node?.locationName ?? card?.locationName ?? '—' },
    { label: 'Shift', value: SHIFT_WORD[pattern] ?? pattern },
  ];

  return (
    <>
      <Box data-seatview="">
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.25 }}>
          {code && <Mono sx={{ fontSize: 12.5 }}>{code}</Mono>}
          {status && <StatusBadge status={status} />}
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>as at {asOf}</Typography>
        </Stack>

        {/* 1 ── the people in the seats, first */}
        <Box data-people="">
          <SectionTitle
            count={
              count ? (
                <>
                  {count.filled} of {count.seats}
                  {count.overFilled ? ` — ${count.filled - count.seats} more than its seats` : ''}
                </>
              ) : undefined
            }
          >
            People in this position
          </SectionTitle>
          {rows.length === 0 ? (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>This position has no seats on this date.</Typography>
          ) : (
            <Stack spacing={0.5}>
              {rows.map((r, i) => {
                const shift = r.shift === 'G' ? '' : `${SHIFT_SHORT[r.shift]} shift, `;
                return r.occupant ? (
                  <SeatRow
                    key={`p${r.occupant.assignmentId}`}
                    row={r}
                    label={`${shift}${r.occupant.name}. Open this person.`}
                    onClick={() =>
                      nav.push({
                        kind: 'person',
                        employeeId: r.occupant!.employeeId,
                        title: r.occupant!.name,
                        employeeCode: r.occupant!.employeeCode,
                        positionId,
                        shiftCode: r.shift,
                      })
                    }
                  />
                ) : (
                  <SeatRow
                    key={`o${r.shift}${i}`}
                    row={r}
                    label={`${shift}open seat. ${canAssign ? 'Open it to assign a person.' : 'Open it.'}`}
                    onClick={() => nav.push({ kind: 'open', positionId, shift: r.shift, title: `Open seat — ${title}` })}
                  />
                );
              })}
            </Stack>
          )}
        </Box>

        {/* 2 ── the facts, as a strip */}
        <Box
          component="dl"
          data-facts=""
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto minmax(0, 1fr)',
            columnGap: 1,
            rowGap: 0.25,
            alignItems: 'baseline',
            m: 0,
            mt: 1.5,
            fontSize: 13,
            lineHeight: 1.5,
            '@media (max-width: 420px)': { gridTemplateColumns: 'auto minmax(0, 1fr)' },
          }}
        >
          {facts.map((f) => (
            <Box key={f.label} sx={{ display: 'contents' }}>
              <Box component="dt" sx={smallLabel}>
                {f.label}
              </Box>
              <Box component="dd" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                {f.value}
              </Box>
            </Box>
          ))}
        </Box>

        {loading && !card && <Box sx={{ mt: 1.5 }}><DetailSkeleton /></Box>}
        {!!error && <ErrorNotice error={error} />}

        {card && (
          <Box sx={{ mt: 1 }}>
            <Box sx={smallLabel}>Reports to</Box>
            {(card.reporting ?? []).length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Nobody — this is a top of the chart.</Typography>
            ) : (
              <Stack spacing={0.5} sx={{ mt: 0.25 }}>
                {card.reporting.map((r, i) => (
                  <ReportsToLine
                    key={`${r.typeCode}-${r.managerPositionId}-${i}`}
                    row={r}
                    nav={nav}
                    title={
                      (r.managerPositionId != null ? titleOf?.(r.managerPositionId) : undefined) ??
                      r.managerPositionTitle ??
                      'Position'
                    }
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* 3 ── what the job is */}
        {card?.rolePurpose && (
          <Typography data-purpose="" sx={{ fontSize: 13, color: 'var(--c-text)', lineHeight: 1.55, mt: 1.75 }}>
            <Box component="span" sx={{ ...smallLabel, mr: 0.75 }}>
              Purpose
            </Box>
            {card.rolePurpose}
          </Typography>
        )}

        <Box sx={{ mt: 1.75 }} data-card-jobcontent="">
          <SectionTitle>KRAs, responsibilities and KPIs</SectionTitle>
          <OrgChartJobSection
            target={{ type: 'position', id: positionId }}
            roleId={roleId}
            asOf={asOf}
            company={company}
            onChanged={onChanged}
            onOpenRole={(id, t) => nav.push({ kind: 'role', roleId: id, title: t })}
          />
        </Box>

        {card && (card.qualifications ?? []).length > 0 && (
          <Box sx={{ mt: 1.75 }}>
            <SectionTitle count={card.qualifications.length}>Qualifications</SectionTitle>
            <Box component="ul" sx={{ m: 0, pl: 2.25, fontSize: 13, lineHeight: 1.5 }}>
              {card.qualifications.map((q, i) => (
                <li key={q.id ?? q.definitionId ?? i}>{q.text}</li>
              ))}
            </Box>
          </Box>
        )}

        {openPoints.length > 0 && (
          <Box sx={{ mt: 1.75 }}>
            <SectionTitle count={openPoints.length}>Open points — still to be answered</SectionTitle>
            <Box component="ol" sx={{ m: 0, pl: 2.25, fontSize: 13, lineHeight: 1.5 }}>
              {openPoints.map((p) => (
                <li key={p.id}>
                  {p.question} <ToneBadge tone="warning" noIcon label={String(p.status).toLowerCase()} />
                </li>
              ))}
            </Box>
          </Box>
        )}

        {/* 4 ── actions */}
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }} data-actions="">
          <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/positions/${positionId}`}>
            Position page
          </Button>
          {roleId != null && (
            <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/roles/${roleId}`}>
              Role page
            </Button>
          )}
          <Button size="small" variant="outlined" startIcon={<OpenInNewRounded />} onClick={() => onStartFrom(positionId)}>
            Start the chart here
          </Button>
          {canManage && (
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              startIcon={<DeleteOutlineRounded />}
              disabled={removal.busyId === positionId}
              onClick={() => {
                void removal.start(positionId);
              }}
            >
              Close or delete…
            </Button>
          )}
        </Stack>

        {/* 5 ── who reports here, last */}
        {card && (
          <Box sx={{ mt: 2 }} data-reports="">
            <SectionTitle count={reports.length || undefined}>Positions reporting to this one</SectionTitle>
            {reports.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>No position reports to this one.</Typography>
            ) : (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25, fontSize: 13 }}>
                {reports.map((d) => (
                  <li key={d.positionId}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => nav.push({ kind: 'seat', positionId: d.positionId, title: titleOf?.(d.positionId) ?? d.title })}
                      sx={inPanelLink}
                    >
                      {titleOf?.(d.positionId) ?? d.title}
                    </Box>
                  </li>
                ))}
              </Box>
            )}
          </Box>
        )}

        {children}
      </Box>
      {removal.dialog}
    </>
  );
}

export default OrgChartSeatView;
