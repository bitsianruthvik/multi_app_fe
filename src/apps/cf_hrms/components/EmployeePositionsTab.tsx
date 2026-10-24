import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Collapse, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import WorkOutlineRounded from '@mui/icons-material/WorkOutlineRounded';
import {
  ConfirmDialog, EmptyState, ErrorNotice, ListSkeleton, Mono, SectionCard, ToneBadge, useToast,
} from '@shared/ui';
import { peopleApi, type PositionHeld } from '../api/people';
import { assignmentsApi, type AssignmentOptions, type ResolvedReportingResult } from '../api/assignments';
import { AssignmentReportingDialog } from './ReportingDialogs';
import { ReportingRowList } from './ReportingRows';
import { MoveToPositionDialog } from './MoveEmployee';
import { useCan } from '../access/can';

/**
 * Positions held — every position this person has been in, newest first
 * (CF_HRMS_HIRING_SPEC.md §10).
 *
 * This tab replaced the Work assignments screens on 2026-10-12. A person is put
 * in a position in two places only — here and on the position itself — and both
 * call the same server route. What the old screens did that is still needed
 * lives here:
 *
 *   - MOVE to another position (the current one ends the day before);
 *   - ADD A SECOND position, for the rare person who holds two;
 *   - END a position held, without moving anywhere;
 *   - WHO THEY REPORT TO in each position held now — the position's own lines
 *     plus any added for this person — with "Add a manager" and "End line".
 *
 * How a position ended is the server's sentence and is shown as it comes.
 */

const cell = { fontSize: 13, color: 'var(--c-text-2)' } as const;

function ReportsTo({
  held,
  company,
  employeeId,
  canEditLines,
}: {
  held: PositionHeld;
  company: string;
  employeeId: number;
  canEditLines: boolean;
}) {
  const toast = useToast();
  const [data, setData] = useState<ResolvedReportingResult | null>(null);
  const [options, setOptions] = useState<AssignmentOptions | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    assignmentsApi
      .resolvedReporting(held.id)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch(setError);
  }, [held.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setAdding(true);
    if (!options) assignmentsApi.options().then(setOptions).catch(() => setOptions(null));
  };

  if (error) return <ErrorNotice error={error} onRetry={load} />;
  if (!data) return <ListSkeleton rows={2} />;

  return (
    <Box data-reports-to="">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
          Who they report to in this position. The position&rsquo;s own lines come first; a line added for this person is marked.
        </Typography>
        {canEditLines && (
          <Button size="small" startIcon={<AddRounded />} onClick={openAdd} sx={{ flexShrink: 0 }}>
            Add a manager
          </Button>
        )}
      </Stack>
      <ReportingRowList
        rows={data.relationships}
        companySlug={company}
        emptyTitle="Nobody is recorded as their manager"
        emptyHint="Neither the position nor this person has a reporting line."
        rowActions={(r) =>
          canEditLines && r.origin === 'ASSIGNMENT' ? (
            <Tooltip title="End this line today. It is kept in history.">
              <IconButton
                size="small"
                aria-label="End this reporting line"
                onClick={async () => {
                  try {
                    await assignmentsApi.endReporting(r.id);
                    toast.success('Reporting line ended');
                    load();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                <EventBusyRounded fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null
        }
      />
      {data.superseded.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 0.75 }}>
            Replaced for this person — the position still says this:
          </Typography>
          <ReportingRowList rows={data.superseded} companySlug={company} muted />
        </Box>
      )}
      <AssignmentReportingDialog
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          load();
        }}
        assignmentId={held.id}
        options={options}
        subjectEmployeeId={employeeId}
      />
    </Box>
  );
}

function HeldRow({
  held,
  company,
  employeeId,
  showMain,
  canEnd,
  canEditLines,
  onEnd,
}: {
  held: PositionHeld;
  company: string;
  employeeId: number;
  /** Only said when the person holds more than one now. */
  showMain: boolean;
  canEnd: boolean;
  canEditLines: boolean;
  onEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canSeePosition = useCan().positions.view;
  const shift = held.shiftName ? `${held.shiftName} shift` : held.shiftCode;

  return (
    <Box
      data-held={held.id}
      data-current={held.isCurrent ? '1' : '0'}
      sx={{ py: 1.5, borderTop: '1px solid var(--c-border)', '&:first-of-type': { borderTop: 0, pt: 0 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {held.positionId && !canSeePosition ? (
              <Mono sx={{ fontSize: 13 }}>{held.positionCode ?? 'Position'}</Mono>
            ) : held.positionId ? (
              <Box
                component={Link}
                to={`/${company}/cf_hrms/positions/${held.positionId}`}
                sx={{ color: 'var(--c-primary-700)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                <Mono sx={{ fontSize: 13 }}>{held.positionCode ?? 'Position'}</Mono>
              </Box>
            ) : (
              <Typography sx={{ fontSize: 13, color: 'var(--c-text-3)' }}>No position</Typography>
            )}
            <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: held.isCurrent ? 'var(--c-text)' : 'var(--c-text-2)' }}>
              {held.roleTitle ?? '—'}
            </Typography>
            {held.isCurrent && <ToneBadge tone="success" label="Now" noIcon />}
            {held.isCurrent && showMain && held.isPrimary && <ToneBadge tone="info" label="Main" noIcon />}
            {!held.isCurrent && held.startsLater && <ToneBadge tone="info" label="Starts later" noIcon />}
          </Box>
          <Typography sx={{ ...cell, mt: 0.25 }}>
            {[held.departmentName, shift].filter(Boolean).join(' · ') || 'No org unit recorded'}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.25 }}>
            From <Mono sx={{ fontSize: 12 }}>{held.effectiveFrom ?? '—'}</Mono>
            {held.effectiveTo ? (
              <>
                {' '}to <Mono sx={{ fontSize: 12 }}>{held.effectiveTo}</Mono>
              </>
            ) : (
              ' — still held'
            )}
            {held.endedHow ? ` · ${held.endedHow}` : ''}
          </Typography>
        </Box>

        {held.isCurrent && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              color="inherit"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              endIcon={<ExpandMoreRounded sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--t-fast) var(--ease)' }} />}
            >
              Reports to
            </Button>
            {canEnd && (
              <Button size="small" color="warning" startIcon={<EventBusyRounded />} onClick={onEnd}>
                End
              </Button>
            )}
          </Stack>
        )}
      </Box>

      {held.isCurrent && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ mt: 1.5, p: 1.5, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }}>
            <ReportsTo held={held} company={company} employeeId={employeeId} canEditLines={canEditLines} />
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export function EmployeePositionsTab({
  employeeId,
  employeeName,
  employmentStatus,
  companySlug,
  onChanged,
}: {
  employeeId: number;
  employeeName: string;
  employmentStatus: string;
  companySlug: string;
  /** After a move, a second position or an end: the page reloads its header. */
  onChanged: () => void;
}) {
  const can = useCan();
  const toast = useToast();
  const hasLeft = employmentStatus === 'EXITED';
  const canMove = can.positions.edit && can.positions.view && !hasLeft;
  const canEnd = can.positions.edit && !hasLeft;
  const canEditLines = can.positions.edit;

  const [rows, setRows] = useState<PositionHeld[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [moving, setMoving] = useState<'move' | 'second' | null>(null);
  const [ending, setEnding] = useState<PositionHeld | null>(null);

  const load = useCallback(() => {
    peopleApi
      .positionsHeld(employeeId)
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch(setError);
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const changed = () => {
    load();
    onChanged();
  };

  const current = (rows ?? []).filter((r) => r.isCurrent);
  const main = current.find((r) => r.isPrimary) ?? current[0] ?? null;
  const currentLabel = main ? [main.roleTitle, main.positionCode].filter(Boolean).join(' · ') || null : null;

  return (
    <>
      <SectionCard
        title="Positions held"
        subtitle="Every position this person has been in, newest first."
      >
        {/* In the body, not the card header: two buttons do not fit beside the title on a phone. */}
        {canMove && (
          <Box sx={{ mb: 1.5 }} data-held-actions="">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="flex-end">
              {current.length > 0 && (
                <Button size="small" startIcon={<AddRounded />} onClick={() => setMoving('second')}>
                  Add a second position
                </Button>
              )}
              <Button size="small" variant="contained" startIcon={<SwapHorizRounded />} onClick={() => setMoving('move')}>
                {current.length > 0 ? 'Move to another position' : 'Put in a position'}
              </Button>
            </Stack>
          </Box>
        )}
        {error ? (
          <ErrorNotice error={error} onRetry={load} />
        ) : rows == null ? (
          <ListSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<WorkOutlineRounded />}
            title="Not in a position"
            body={
              hasLeft
                ? `${employeeName} has left and never held a position on record.`
                : `${employeeName} is on the books but holds no position, so they have no role, no manager and no responsibilities.`
            }
          />
        ) : (
          <Box data-positions-held="">
            {rows.map((r) => (
              <HeldRow
                key={r.id}
                held={r}
                company={companySlug}
                employeeId={employeeId}
                showMain={current.length > 1}
                canEnd={canEnd}
                canEditLines={canEditLines}
                onEnd={() => setEnding(r)}
              />
            ))}
          </Box>
        )}
      </SectionCard>

      <MoveToPositionDialog
        open={moving != null}
        employeeId={employeeId}
        employeeName={employeeName}
        currentLabel={currentLabel}
        second={moving === 'second'}
        onClose={() => setMoving(null)}
        onDone={changed}
      />

      <ConfirmDialog
        open={!!ending}
        title="End this position held"
        entityName={ending ? [ending.roleTitle, ending.positionCode].filter(Boolean).join(' · ') : ''}
        body={`${employeeName} stops holding this position today and it becomes vacant. Reporting lines added for them here end with it. Nothing is deleted: it stays in this list.`}
        confirmLabel="End today"
        onClose={() => setEnding(null)}
        onConfirm={async () => {
          if (!ending) return;
          await assignmentsApi.end(ending.id);
          toast.success('Ended. The position is vacant.');
          setEnding(null);
          changed();
        }}
      />
    </>
  );
}
