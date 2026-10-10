import { useEffect, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import { ErrorNotice, Mono, StatusBadge, ToneBadge, useIsPermitted } from '@shared/ui';
import type { CardReportingRow, OrgChartNode, PositionCard } from '../api/orgchart';
import { joiningLabel, type JoiningRef } from '../api/hiring';
import { shiftNameOf } from './orgChartLayout';
import { PositionShiftControl } from './PositionShiftControl';
import { usePositionRemoval } from './usePositionRemoval';
import { inPanelLink, smallLabel, type PanelNav } from './orgChartPanelNav';

/**
 * The pieces every POSITION view in the org chart panel is built from — the
 * person view (a filled position) and the vacant-position view share them, so
 * a position reads the same whoever is, or is not, in it:
 *
 *   PositionFacts    code · role · department · location · shift, with
 *                    "Change shift" on the shift
 *   PositionReportsTo  the resolved reporting set — never one manager
 *   PositionFooter   qualifications, open points, the actions, and the
 *                    positions reporting to this one
 *
 * and `PositionListRow`, the row a ROLE view lists its positions with.
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

/** A two-pair grid of small facts; one pair per line on a narrow panel. */
export function FactsGrid({ facts }: { facts: { label: string; value: ReactNode }[] }) {
  return (
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
  );
}

/** One position as a whole-row button: the person or "Vacant", its shift, its code. */
export function PositionListRow({
  name,
  shift,
  code,
  current,
  hiring,
  joining,
  onClick,
}: {
  /** The person in it; null = vacant. */
  name: string | null;
  /** A vacant position with a hiring open: the candidate (or "Hiring"), still drawn as a vacancy. */
  hiring?: { candidateName: string | null } | null;
  /** A vacant position somebody is appointed to and has not joined yet. */
  joining?: JoiningRef | null;
  shift: string | null;
  code: string | null;
  /** This is the position the panel was opened on. */
  current?: boolean;
  onClick: () => void;
}) {
  const coming = !name && joining ? joiningLabel(joining) : null;
  const beingHired = !name && !coming && hiring ? hiring.candidateName?.trim() || 'Hiring' : null;
  const said = name ?? (coming ? `Vacant, ${coming}` : beingHired ? `Vacant, hiring ${beingHired === 'Hiring' ? 'in progress' : beingHired}` : 'Vacant');
  const label = `${said}${shift ? `, ${shift} shift` : ''}${code ? `, position ${code}` : ''}. Open this position.`;
  return (
    <Box
      component="button"
      type="button"
      data-positionrow={name ? 'filled' : 'vacant'}
      aria-label={label}
      aria-current={current ? 'true' : undefined}
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
        borderStyle: name ? 'solid' : 'dashed',
        borderColor: current ? 'var(--c-primary-500)' : 'var(--c-border)',
        borderRadius: 'var(--r-sm)',
        background: name ? 'var(--c-surface)' : 'var(--c-surface-2)',
        '&:hover': { borderColor: 'var(--c-primary-500)' },
        '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 1 },
      }}
    >
      {name ? (
        <PersonRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-2)', flexShrink: 0 }} />
      ) : (
        <PersonOutlineRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-3)', flexShrink: 0 }} />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            fontSize: 13.5,
            fontWeight: name ? 500 : 400,
            color: name ? 'var(--c-text)' : 'var(--c-text-2)',
            fontStyle: name ? 'normal' : 'italic',
            overflowWrap: 'anywhere',
          }}
        >
          {name ?? coming ?? beingHired ?? 'Vacant'}
        </Box>
      </Box>
      {beingHired && beingHired !== 'Hiring' && (
        <Box
          data-hiringlabel=""
          sx={{ fontSize: 11, px: 0.75, borderRadius: 'var(--r-sm)', background: 'var(--c-surface-3)', color: 'var(--c-text-2)', flexShrink: 0 }}
        >
          Hiring
        </Box>
      )}
      {shift && <Box sx={{ fontSize: 12, color: 'var(--c-text-2)', flexShrink: 0 }}>{shift}</Box>}
      {code && <Mono sx={{ fontSize: 11.5, flexShrink: 0 }}>{code}</Mono>}
      <ChevronRightRounded aria-hidden sx={{ fontSize: 18, color: 'var(--c-text-3)', flexShrink: 0 }} />
    </Box>
  );
}

/**
 * The position's own facts. The role's name opens the ROLE view (where KRAs and
 * the role's content are edited); the shift carries "Change shift".
 */
export function PositionFacts({
  positionId,
  node,
  card,
  asOf,
  nav,
  onChanged,
}: {
  positionId: number;
  /** The position as the chart holds it; null for one that is not on the chart. */
  node: OrgChartNode | null;
  card: PositionCard | null;
  asOf: string;
  nav: PanelNav;
  /** After the shift changes: the page re-reads the chart, so the row's label and the counts follow. */
  onChanged?: () => void;
}) {
  // Shown at once after a change, until the reloaded chart says the same.
  const [changed, setChanged] = useState<{ id: number; code: string | null; name: string } | null>(null);
  useEffect(() => setChanged(null), [positionId]);

  const code = node?.positionCode ?? card?.positionCode ?? null;
  const status = node?.status ?? card?.status ?? null;
  const roleId = node?.roleId ?? card?.roleId ?? null;
  const roleTitle = node?.roleTitle ?? card?.roleTitle ?? null;
  const shift =
    changed ??
    node?.defaultShift ??
    card?.shift ??
    (node ? { id: null, code: node.shiftPattern, name: shiftNameOf(node) } : null);
  const occupant = node?.occupants?.[0]?.name ?? card?.occupants?.[0]?.name ?? null;

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: 'Position',
      value: (
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {code ? <Mono sx={{ fontSize: 12.5 }}>{code}</Mono> : '—'}
          {status && status !== 'ACTIVE' && <StatusBadge status={status} />}
        </Box>
      ),
    },
    {
      label: 'Shift',
      value: (
        <PositionShiftControl
          positionId={positionId}
          shift={shift}
          occupantName={occupant}
          onChanged={(s) => {
            setChanged(s);
            onChanged?.();
          }}
        />
      ),
    },
    {
      label: 'Role',
      value:
        roleId != null ? (
          <Box
            component="button"
            type="button"
            data-rolelink=""
            onClick={() =>
              nav.push({ kind: 'role', roleId, cardId: node?.cardId ?? card?.cardId ?? null, title: roleTitle ?? 'Role' })
            }
            sx={inPanelLink}
          >
            {roleTitle ?? 'Role'}
          </Box>
        ) : (
          (roleTitle ?? '—')
        ),
    },
    { label: 'Department', value: node?.departmentName ?? card?.departmentName ?? '—' },
    { label: 'Location', value: node?.locationName ?? card?.locationName ?? '—' },
    { label: 'As at', value: asOf },
  ];
  return (
    <Box data-positionfacts={positionId}>
      <FactsGrid facts={facts} />
    </Box>
  );
}

/** A manager line, one or two lines tall. The manager's position and the person in it open in the panel. */
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
        {vacant ? (
          <Box component="span" sx={{ fontStyle: 'italic', color: 'var(--c-text-2)' }}>
            Vacant
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
                  })
                }
                sx={{ ...inPanelLink, fontWeight: 500 }}
              >
                {p.name}
              </Box>
            </span>
          ))
        )}
        <Box component="span" sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {row.typeName}
          {row.origin === 'ASSIGNMENT' ? ' · for this person' : ''}
        </Box>
      </Box>
      <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
        {row.managerPositionId ? (
          <Box
            component="button"
            type="button"
            onClick={() => nav.push({ kind: 'position', positionId: row.managerPositionId!, title })}
            sx={inPanelLink}
          >
            {title}
          </Box>
        ) : (
          <span>{row.managerPositionTitle ?? 'Manager not recorded'}</span>
        )}
        {vacant && <> · {row.note ?? 'the line exists, the person does not'}</>}
        {scoped && <> · only for {row.scopeLabel ?? row.scopeSentence ?? String(row.scopeType).toLowerCase()}</>}
      </Box>
    </Box>
  );
}

/** Who the position reports to — the full resolved set, with scopes. */
export function PositionReportsTo({
  card,
  nav,
  titleOf,
}: {
  card: PositionCard;
  nav: PanelNav;
  /** A position's title as the chart writes it (disambiguated). */
  titleOf?: (positionId: number) => string | undefined;
}) {
  return (
    <Box sx={{ mt: 1 }} data-positionreports="">
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
  );
}

/**
 * The end of a position view: qualifications, open points, the actions, and —
 * last — the positions reporting to this one.
 */
export function PositionFooter({
  positionId,
  card,
  error,
  company,
  nav,
  titleOf,
  onStartFrom,
  onClose,
  onChanged,
  extraActions,
}: {
  positionId: number;
  card: PositionCard | null;
  error?: unknown;
  company: string;
  nav: PanelNav;
  titleOf?: (positionId: number) => string | undefined;
  onStartFrom?: (positionId: number) => void;
  /** Closes the panel; called once the position has been closed or deleted from here. */
  onClose?: () => void;
  onChanged?: () => void;
  extraActions?: ReactNode;
}) {
  const can = useIsPermitted();
  const canManage = can('cf_hrms_org_manage');
  const removal = usePositionRemoval({
    onDone: () => {
      onClose?.();
      if (onChanged) onChanged();
      else window.setTimeout(() => window.location.reload(), 1200);
    },
  });
  const reports = card?.directReports ?? [];
  const openPoints = card?.openPoints ?? [];
  return (
    <>
      {!!error && <ErrorNotice error={error} />}
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

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 2 }} data-actions="">
        {extraActions}
        <Button size="small" variant="outlined" component={RouterLink} to={`/${company}/cf_hrms/positions/${positionId}`}>
          Position page
        </Button>
        {onStartFrom && (
          <Button size="small" variant="outlined" startIcon={<OpenInNewRounded />} onClick={() => onStartFrom(positionId)}>
            Start the chart here
          </Button>
        )}
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

      {card && reports.length > 0 && (
        <Box sx={{ mt: 2 }} data-reports="">
          <SectionTitle count={reports.length}>Positions reporting to this one</SectionTitle>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25, fontSize: 13 }}>
            {reports.map((d) => (
              <li key={d.positionId}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => nav.push({ kind: 'position', positionId: d.positionId, title: titleOf?.(d.positionId) ?? d.title })}
                  sx={inPanelLink}
                >
                  {titleOf?.(d.positionId) ?? d.title}
                  {d.positionCode ? ` (${d.positionCode})` : ''}
                </Box>
              </li>
            ))}
          </Box>
        </Box>
      )}
      {removal.dialog}
    </>
  );
}

