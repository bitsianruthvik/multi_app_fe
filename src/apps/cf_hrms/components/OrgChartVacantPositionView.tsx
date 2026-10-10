import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Skeleton, Stack, TextField, Typography } from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { ErrorNotice, Mono, useIsPermitted, useToast } from '@shared/ui';
import type { OrgChartNode } from '../api/orgchart';
import { positionsApi, type PositionOccupant } from '../api/positions';
import { peopleApi, type EmployeeRow } from '../api/people';
import { assignmentsApi } from '../api/assignments';
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
 *   "Move an existing employee here" — someone already employed. One work
 *       assignment through `POST /assignments` (role, position and shift taken
 *       from the position). The server keeps its own rules and its sentences
 *       are shown as they come — including the refusal of a second person on a
 *       position that has just been filled (409 `POSITION_FILLED`).
 *   "Hire a new person" — a workflow of its own, behind `HiringEntry`. Nothing
 *       here creates an employee or types an employee code.
 *
 * THE ONE-MAIN-JOB RULE, made visible instead of tripped over: someone with no
 * job gets this one as their main job; someone who already has a main job gets
 * this as an ADDITIONAL job, and the form says which before it is saved.
 *
 * "HOW LONG VACANT" IS ONLY SAID WHEN THE RECORDS SAY IT: the last person to
 * hold the position and the day they left. A date is never made up.
 *
 * KRAs are the role's and are shown fixed; the responsibilities, KPIs and
 * targets under them are edited here at POSITION level.
 */

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
  const toast = useToast();
  const canAssign = can('cf_hrms_assignments_manage') && can('cf_hrms_people_view');

  const { card, error: cardError } = usePositionCard(positionId, asOf, node?.defaultShift?.code ?? '');
  const [past, setPast] = useState<PositionOccupant[] | null>(null);
  const [people, setPeople] = useState<EmployeeRow[] | null>(null);
  const [picked, setPicked] = useState<EmployeeRow | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

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

  useEffect(() => {
    if (!canAssign) return;
    let live = true;
    peopleApi
      .list()
      .then((r) => {
        if (live) setPeople(r.items);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [canAssign]);

  const roleId = node?.roleId ?? card?.roleId ?? null;
  const roleTitle = node?.roleTitle ?? card?.roleTitle ?? null;
  const code = node?.positionCode ?? card?.positionCode ?? null;
  const shiftId = node?.defaultShift?.id ?? card?.shift?.id ?? null;

  const lastHolder = useMemo(() => {
    const ended = (past ?? []).filter((o) => !o.liveOnDate && o.effectiveTo && o.effectiveTo < asOf);
    ended.sort((a, b) => (a.effectiveTo! < b.effectiveTo! ? 1 : -1));
    return ended[0] ?? null;
  }, [past, asOf]);

  const candidates = useMemo(
    () =>
      (people ?? [])
        .filter((p) => p.employmentStatus !== 'EXITED')
        // People with no job first: they are who a vacant position is usually for.
        .sort(
          (a, b) =>
            Number(a.primaryAssignmentId != null) - Number(b.primaryAssignmentId != null) ||
            a.fullName.localeCompare(b.fullName),
        ),
    [people],
  );

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      if (roleId == null) throw new Error('This position has no role, so work cannot be assigned to it yet.');
      await assignmentsApi.create({
        employeeId: picked.id,
        roleId,
        positionId,
        defaultShiftId: shiftId,
        isPrimary: picked.primaryAssignmentId == null,
        status: 'ACTIVE',
        effectiveFrom: from,
      });
      toast.success(`${picked.fullName} is now in this position.`);
      onChanged?.();
      // The view stays on the position: once the chart has reloaded it shows the person.
      setPicked(null);
    } catch (e) {
      // The server's sentence as it comes — e.g. "This position already has a person in it."
      setError(e);
    } finally {
      setBusy(false);
    }
  };

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
        <SectionTitle>Put a person in this position</SectionTitle>
        {!canAssign ? (
          <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            Putting a person in a position needs the permission to manage work assignments.
          </Typography>
        ) : (
          <Stack spacing={1.25}>
            {/* Path 1 — someone already employed */}
            <Box
              data-fill-move=""
              sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', p: 1.25 }}
            >
              <Box sx={{ ...smallLabel, mb: 0.75 }}>Move an existing employee here</Box>
              {people == null && !error ? (
                <Skeleton variant="rounded" height={40} />
              ) : (
                <Stack spacing={1.25}>
                  {!!error && <ErrorNotice error={error} fallback="That could not be saved." />}
                  <Autocomplete
                    size="small"
                    options={candidates}
                    value={picked}
                    onChange={(_, v) => setPicked(v)}
                    getOptionLabel={(p) => `${p.fullName} (${p.employeeCode})`}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    renderOption={(props, p) => {
                      const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                      return (
                        <li key={key} {...rest}>
                          <Box sx={{ minWidth: 0 }}>
                            <Box sx={{ fontSize: 13.5 }}>
                              {p.fullName} <Mono sx={{ fontSize: 11.5 }}>{p.employeeCode}</Mono>
                            </Box>
                            <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                              {p.primaryRoleTitle ? `Now: ${p.primaryRoleTitle}` : 'No job assigned'}
                            </Box>
                          </Box>
                        </li>
                      );
                    }}
                    renderInput={(p) => <TextField {...p} label="Employee" placeholder="Search by name or employee code" />}
                  />
                  {picked && (
                    <Typography data-mainjob="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                      {picked.primaryAssignmentId != null
                        ? `${picked.fullName} already has a main job${picked.primaryRoleTitle ? ` (${picked.primaryRoleTitle})` : ''}. This position is added as an additional job; the main job stays as it is.`
                        : `${picked.fullName} has no job assigned, so this becomes their main job.`}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <TextField
                      label="Starts on"
                      type="date"
                      size="small"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      sx={{ width: 170 }}
                    />
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<SwapHorizRounded />}
                      disabled={!picked || !from || busy}
                      onClick={() => void submit()}
                    >
                      {busy ? 'Moving…' : 'Move here'}
                    </Button>
                  </Stack>
                </Stack>
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
                <Box sx={smallLabel}>Hire a new person</Box>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
                  For someone who is not an employee yet.
                </Typography>
              </Box>
              <HiringEntry
                positionId={positionId}
                positionCode={code}
                roleTitle={roleTitle}
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
