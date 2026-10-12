import { useEffect, useMemo, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useIsPermitted } from '@shared/ui';
import type { OrgChartNode } from '../api/orgchart';
import { positionsApi, type PositionOccupant } from '../api/positions';
import { MOVE_PERMISSION, MoveEmployeeHere } from './MoveEmployee';
import { Link as RouterLink } from 'react-router-dom';
import { joiningSentence } from '../api/hiring';
import { HiringEntry } from './HiringEntry';
import { OrgChartJobSection } from './OrgChartJobSection';
import {
  PositionFacts,
  PositionFooter,
  PositionReportsTo,
  SectionTitle,
} from './OrgChartPositionParts';
import { usePositionCard } from './usePositionCard';
import { smallLabel, type PanelNav } from './orgChartPanelNav';

/**
 * A VACANT position, in the org chart's floating panel: what the position is,
 * the two ways to put a person in it, and the job whoever takes it will do.
 *
 * TWO PATHS, KEPT APART (the user's decision, 2026-10-10):
 *   "Move an existing employee here" — someone already employed. The shared
 *       `MoveEmployeeHere` form (`POST /people/employees/:id/move`): the person
 *       leaves the position they hold now the day before, unless "Keep their
 *       current position too" is ticked. The same form opens from the position
 *       page, the department list and a closed hiring. The server's sentences
 *       are shown as they come — including the refusal of a second person on a
 *       position that has just been filled (409 `POSITION_FILLED`).
 *   "Hire a new person" — a workflow of its own, behind `HiringEntry`. Nothing
 *       here creates an employee or types an employee code.
 *

 * "HOW LONG VACANT" IS ONLY SAID WHEN THE RECORDS SAY IT: the last person to
 * hold the position and the day they left. A date is never made up.
 *
 * KRAs are the role's and are shown fixed; the responsibilities, KPIs and
 * targets under them are edited here at POSITION level.
 */


export function OrgChartVacantPositionView({
  positionId,
  node,
  asOf,
  company,
  nav,
  titleOf,
  onStartFrom,
  onClose,
  onChanged,
}: {
  positionId: number;
  /** The position as the chart holds it; null for one that is not on the chart. */
  node: OrgChartNode | null;
  asOf: string;
  company: string;
  nav: PanelNav;
  titleOf?: (positionId: number) => string | undefined;
  onStartFrom?: (positionId: number) => void;
  onClose?: () => void;
  /** After a person is assigned or the shift changes: the page reloads the chart. */
  onChanged?: () => void;
}) {
  const can = useIsPermitted();
  const canAssign = can(MOVE_PERMISSION) && can('cf_hrms_people_view');

  const { card, error: cardError } = usePositionCard(positionId, asOf, node?.defaultShift?.code ?? '');
  const [past, setPast] = useState<PositionOccupant[] | null>(null);

  // Who held it before — for "vacant since". Read-only, org_view.
  useEffect(() => {
    let live = true;
    setPast(null);
    positionsApi
      .occupants(positionId)
      .then((r) => {
        if (live) setPast(r.items);
      })
      .catch(() => {
        if (live) setPast([]);
      });
    return () => {
      live = false;
    };
  }, [positionId]);

  const roleId = node?.roleId ?? card?.roleId ?? null;
  const roleTitle = node?.roleTitle ?? card?.roleTitle ?? null;
  const code = node?.positionCode ?? card?.positionCode ?? null;

  // The open hiring, if there is one. While it is open the position is still
  // vacant, but nobody else can be moved into it: the hiring is closed first.
  const hiring = node?.hiring ?? card?.hiring ?? null;
  // Somebody is appointed and joins on a later day: nothing else can fill the position.
  const joining = node?.joining ?? card?.joining ?? null;

  const lastHolder = useMemo(() => {
    const ended = (past ?? []).filter((o) => !o.liveOnDate && o.effectiveTo && o.effectiveTo < asOf);
    ended.sort((a, b) => (a.effectiveTo! < b.effectiveTo! ? 1 : -1));
    return ended[0] ?? null;
  }, [past, asOf]);

  return (
    <Box data-vacantview="">
      <PositionFacts positionId={positionId} node={node} card={card} asOf={asOf} nav={nav} onChanged={onChanged} />
      {card && <PositionReportsTo card={card} nav={nav} titleOf={titleOf} />}

      <Typography data-vacantsince="" sx={{ fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.55, mt: 1 }}>
        {past == null
          ? '…'
          : lastHolder
            ? `This position was last held by ${lastHolder.employeeName}, until ${lastHolder.effectiveTo}.`
            : 'Nobody is recorded as having held this position before, so there is no date it became vacant.'}
      </Typography>

      <Box sx={{ mt: 2 }} data-fill="">
        <SectionTitle>{joining ? 'Who is coming' : 'Put a person in this position'}</SectionTitle>
        {joining ? (
          <Typography data-joining="" sx={{ fontSize: 13.5, lineHeight: 1.55 }}>
            <Box component={RouterLink} to={`/${company}/cf_hrms/employees/${joining.employeeId}`} sx={{ color: 'var(--c-primary-700)', fontWeight: 500 }}>
              {joining.name}
            </Box>
            {joiningSentence(joining).slice(joining.name.length)}. The position is vacant until that day, and nobody else can be put in it.
          </Typography>
        ) : !canAssign ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            You do not have the permission to put a person in a position.
          </Typography>
        ) : (
          <Stack spacing={1.25}>
            {/* Path 1 — someone already employed */}
            <Box
              data-fill-move=""
              sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.25 }}
            >
              <Box sx={{ ...smallLabel, mb: 0.75, color: hiring ? 'var(--c-text-3)' : undefined }}>Move an existing employee here</Box>
              {hiring ? (
                <Typography data-fill-move-blocked="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                  A hiring is open for this position. Close it first.
                </Typography>
              ) : (
                <MoveEmployeeHere positionId={positionId} onDone={() => onChanged?.()} onRefused={() => onChanged?.()} />
              )}
            </Box>

            {/* Path 2 — someone who is not an employee yet */}
            <Box
              data-fill-hire=""
              sx={{
                border: '1px solid var(--c-border)',
                borderRadius: 'var(--r-sm)',
                p: 1.25,
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Box sx={{ flex: '1 1 180px', minWidth: 0 }}>
                <Box sx={smallLabel}>{hiring ? 'Hiring in progress' : 'Hire a new person'}</Box>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                  {hiring
                    ? hiring.candidateName?.trim()
                      ? `For ${hiring.candidateName.trim()}. They become an employee at the appointment.`
                      : 'No candidate has been entered yet.'
                    : 'For someone who is not an employee yet.'}
                </Typography>
              </Box>
              <HiringEntry
                positionId={positionId}
                positionCode={code}
                roleTitle={roleTitle}
                hiring={hiring}
                onChanged={() => onChanged?.()}
              />
            </Box>
          </Stack>
        )}
      </Box>

      {/* What whoever fills the position will be doing: the role's KRAs, fixed,
          with the position's responsibilities and KPIs — edited at position level. */}
      <Box sx={{ mt: 2 }} data-card-jobcontent="">
        <SectionTitle>KRAs, responsibilities and KPIs</SectionTitle>
        <Typography data-belongs="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5, mb: 0.75 }}>
          These belong to the position: whoever is put in it takes them on as they stand.
        </Typography>
        <OrgChartJobSection
          target={{ type: 'position', id: positionId }}
          roleId={roleId}
          asOf={asOf}
          company={company}
          onChanged={onChanged}
          onOpenRole={(id, t) => nav.push({ kind: 'role', roleId: id, cardId: node?.cardId ?? card?.cardId ?? null, title: t })}
        />
      </Box>

      <PositionFooter
        positionId={positionId}
        card={card}
        error={cardError}
        company={company}
        nav={nav}
        titleOf={titleOf}
        onStartFrom={onStartFrom}
        onClose={onClose}
        onChanged={onChanged}
      />
    </Box>
  );
}

export default OrgChartVacantPositionView;
