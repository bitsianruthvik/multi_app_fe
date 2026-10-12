import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete, Box, Button, Checkbox, Dialog, DialogContent, FormControlLabel, Skeleton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { DialogHeader, ErrorNotice, Mono, useToast } from '@shared/ui';
import { peopleApi, type EmployeeRow } from '../api/people';
import { positionsApi, type PositionRow } from '../api/positions';
import { todayIso } from '../api/hiring';

/**
 * Putting a person in a position (CF_HRMS_HIRING_SPEC.md §10).
 *
 * A person is put in a position in exactly two places, and both end at the same
 * server route — `POST /people/employees/:id/move`:
 *
 *   ON THE POSITION  "Move an existing employee here": pick the employee.
 *                    `MoveEmployeeHere` is that form; the org chart's vacant
 *                    position shows it in its panel, and the position page, the
 *                    department list and a closed hiring open the very same
 *                    form in a dialog (`MoveEmployeeHereDialog`).
 *   ON THE EMPLOYEE  "Move to another position" / "Add a second position":
 *                    pick the vacant position (`MoveToPositionDialog`).
 *
 * A MOVE LEAVES THE OLD POSITION. The server ends the position the person holds
 * now the day before the new one starts, in one step. Keeping both is the rare
 * case and is asked for out loud ("Keep their current position too").
 *
 * The server's refusals are shown in its own words: the position was filled
 * meanwhile, a hiring is open for it, or the person has left.
 */

/** May this login put people in positions. The server checks again. */
export const MOVE_PERMISSION = 'cf_hrms_people_manage';

const fieldDate = { inputLabel: { shrink: true } } as const;

/** The form, with the position already known. */
export function MoveEmployeeHere({
  positionId,
  onDone,
  onRefused,
}: {
  positionId: number;
  /** After the person is in the position. */
  onDone?: (employee: EmployeeRow) => void;
  /** The server said no for a reason the caller should reload on (a hiring was opened, the position was filled). */
  onRefused?: (code: string) => void;
}) {
  const toast = useToast();
  const [people, setPeople] = useState<EmployeeRow[] | null>(null);
  const [picked, setPicked] = useState<EmployeeRow | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
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
  }, []);

  const candidates = useMemo(
    () =>
      (people ?? [])
        .filter((p) => p.employmentStatus !== 'EXITED')
        // People with no position first: they are who a vacant position is usually for.
        .sort(
          (a, b) =>
            Number(a.primaryAssignmentId != null) - Number(b.primaryAssignmentId != null) ||
            a.fullName.localeCompare(b.fullName),
        ),
    [people],
  );

  const holdsOne = picked?.primaryAssignmentId != null;

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await peopleApi.move(picked.id, { positionId, effectiveFrom: from, keepCurrent: holdsOne && keep });
      toast.success(`${picked.fullName} is now in this position.`);
      onDone?.(picked);
      setPicked(null);
      setKeep(false);
    } catch (e) {
      setError(e);
      const code = (e as { code?: string })?.code;
      if (code === 'HIRING_OPEN' || code === 'POSITION_FILLED') onRefused?.(code);
    } finally {
      setBusy(false);
    }
  };

  if (people == null && !error) return <Skeleton variant="rounded" height={40} />;

  return (
    <Stack spacing={1.25} data-move-here="">
      {!!error && <ErrorNotice error={error} fallback="That could not be saved." />}
      <Autocomplete
        size="small"
        options={candidates}
        value={picked}
        onChange={(_, v) => {
          setPicked(v);
          setKeep(false);
        }}
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
                  {p.primaryRoleTitle ? `Now: ${p.primaryRoleTitle}` : 'Not in a position'}
                </Box>
              </Box>
            </li>
          );
        }}
        renderInput={(p) => <TextField {...p} label="Employee" placeholder="Search by name or employee code" />}
      />
      {picked && (
        <Box data-move-note="">
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
            {!holdsOne
              ? `${picked.fullName} is not in a position now, so this becomes their position.`
              : keep
                ? `${picked.fullName} keeps ${picked.primaryRoleTitle ? `the position they hold now (${picked.primaryRoleTitle})` : 'the position they hold now'} and holds this one as well.`
                : `${picked.fullName} leaves ${picked.primaryRoleTitle ? `the position they hold now (${picked.primaryRoleTitle})` : 'the position they hold now'} the day before, and that position becomes vacant.`}
          </Typography>
          {holdsOne && (
            <FormControlLabel
              sx={{ mt: 0.25 }}
              control={<Checkbox size="small" checked={keep} onChange={(e) => setKeep(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 12.5 }}>Keep their current position too</Typography>}
            />
          )}
        </Box>
      )}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          label="Starts on"
          type="date"
          size="small"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          slotProps={fieldDate}
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
  );
}

/** The same form in a dialog, for a screen that has the position but no panel to show it in. */
export function MoveEmployeeHereDialog({
  open,
  positionId,
  positionLabel,
  onClose,
  onDone,
  onRefused,
}: {
  open: boolean;
  positionId: number;
  /** What the position is called on the screen that opened this: "Machine Operator · P0102". */
  positionLabel?: string | null;
  onClose: () => void;
  onDone?: () => void;
  onRefused?: (code: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogHeader
        title="Move an existing employee here"
        subtitle={positionLabel || undefined}
        onClose={onClose}
      />
      <DialogContent sx={{ pt: '8px !important' }}>
        {open && (
          <MoveEmployeeHere
            positionId={positionId}
            onDone={() => {
              onDone?.();
              onClose();
            }}
            onRefused={onRefused}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The button and its dialog in one piece, so the three screens that offer
 * "Move an existing employee here" cannot drift apart. `blocked` is the reason
 * it cannot be done now (a hiring is open) — said on the button, not hidden.
 */
export function MoveEmployeeHereButton({
  positionId,
  positionLabel,
  blocked,
  variant = 'outlined',
  onDone,
}: {
  positionId: number;
  positionLabel?: string | null;
  blocked?: string | null;
  variant?: 'outlined' | 'contained';
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title={blocked ?? ''}>
        <Box component="span">
          <Button size="small" variant={variant} disabled={!!blocked} onClick={() => setOpen(true)} data-move-here-button="">
            Move an existing employee here
          </Button>
        </Box>
      </Tooltip>
      <MoveEmployeeHereDialog
        open={open}
        positionId={positionId}
        positionLabel={positionLabel}
        onClose={() => setOpen(false)}
        onDone={onDone}
        // A hiring was opened or somebody was put here meanwhile: the screen behind reloads.
        onRefused={() => onDone?.()}
      />
    </>
  );
}

/** From the employee's side: pick the vacant position. */
export function MoveToPositionDialog({
  open,
  employeeId,
  employeeName,
  currentLabel,
  second,
  onClose,
  onDone,
}: {
  open: boolean;
  employeeId: number;
  employeeName: string;
  /** The position held now, in words; null when the person holds none. */
  currentLabel: string | null;
  /** True for "Add a second position": the current one is kept. */
  second: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [positions, setPositions] = useState<PositionRow[] | null>(null);
  const [picked, setPicked] = useState<PositionRow | null>(null);
  const [from, setFrom] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setPicked(null);
    setError(null);
    setFrom(todayIso());
    setPositions(null);
    positionsApi
      .list()
      .then((r) => {
        if (live) setPositions(r.items);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [open]);

  // Vacant, with no hiring open and nobody about to join: the ones the server will accept.
  const vacant = useMemo(
    () =>
      (positions ?? [])
        .filter((p) => p.status !== 'INACTIVE' && p.filledCount === 0 && !p.hiring && !p.joining)
        .sort((a, b) => a.displayTitle.localeCompare(b.displayTitle) || (a.positionCode ?? '').localeCompare(b.positionCode ?? '')),
    [positions],
  );

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await peopleApi.move(employeeId, { positionId: picked.id, effectiveFrom: from, keepCurrent: second });
      toast.success(
        second
          ? `${employeeName} now holds ${picked.displayTitle} as well.`
          : `${employeeName} is now in ${picked.displayTitle}.`,
      );
      onDone();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogHeader
        title={second ? 'Add a second position' : 'Move to another position'}
        subtitle={employeeName}
        onClose={onClose}
        busy={busy}
      />
      <DialogContent sx={{ pt: '8px !important' }}>
        <Stack spacing={1.5} data-move-to="">
          {!!error && <ErrorNotice error={error} fallback="That could not be saved." />}
          {positions == null && !error ? (
            <Skeleton variant="rounded" height={40} />
          ) : (
            <Autocomplete
              size="small"
              options={vacant}
              value={picked}
              onChange={(_, v) => setPicked(v)}
              getOptionLabel={(p) => `${p.displayTitle}${p.positionCode ? ` (${p.positionCode})` : ''}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="No vacant position"
              renderOption={(props, p) => {
                const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                return (
                  <li key={key} {...rest}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontSize: 13.5 }}>
                        {p.displayTitle} {p.positionCode && <Mono sx={{ fontSize: 11.5 }}>{p.positionCode}</Mono>}
                      </Box>
                      <Box sx={{ fontSize: 12, color: 'var(--c-text-2)' }}>
                        {[p.departmentName, p.shiftName && `${p.shiftName} shift`, p.locationName].filter(Boolean).join(' · ') || 'No department recorded'}
                      </Box>
                    </Box>
                  </li>
                );
              }}
              renderInput={(p) => (
                <TextField {...p} label="Vacant position" placeholder="Search by role or position code" helperText="Only vacant positions with no hiring open are listed." />
              )}
            />
          )}
          <TextField
            label="Starts on"
            type="date"
            size="small"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={fieldDate}
            sx={{ width: 170 }}
          />
          <Typography data-move-note="" sx={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.5 }}>
            {second
              ? `${employeeName} keeps ${currentLabel ?? 'the position they hold now'} and holds the new one as well.`
              : currentLabel
                ? `${employeeName} leaves ${currentLabel} the day before, and that position becomes vacant.`
                : `${employeeName} is not in a position now, so this becomes their position.`}
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={onClose} disabled={busy} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" disabled={!picked || !from || busy} onClick={() => void submit()}>
              {busy ? 'Saving…' : second ? 'Add position' : 'Move'}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
