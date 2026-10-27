import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ErrorNotice, ListSkeleton, SideSheet, useToast } from '@shared/ui';
import type { PosRef } from '../api/organisation';
import { kindWord, unitLabel } from './orgUnits';
import { posLine, posTitle, posWho } from './unitReportingText';
import { useUnitReporting, type Draft, type RiChoice, type UnitReportingState } from './useUnitReporting';

/**
 * A unit's HEAD and REPORTS INTO (CF_HRMS_HIRING_SPEC.md §40.2) — one editor,
 * used in three places: the edit org unit dialog, the "Head and reporting"
 * sheet on the Org units page, and a unit box in the org chart's Edit mode.
 *
 *   Head          a position in this unit (or a unit above — one position may
 *                 head several units). "Per shift" gives every shift its own
 *                 head; a position's manager is then the head on its shift.
 *   Reports into  where the unit's head reports. By default the parent unit's
 *                 head, shown as words; "Choose" picks a position of the
 *                 parent unit or a unit above; "Somewhere else" picks any
 *                 other position and needs a reason (the reporting check
 *                 lists it as outside the org unit tree otherwise).
 *
 * The server validates everything again (the unit, the tenant, loops): the
 * screen only offers what may be picked.
 */


function PositionPicker({
  label,
  options,
  value,
  onChange,
  groupBy,
  helperText,
  autoFocus,
}: {
  label: string;
  options: PosRef[];
  value: number | null;
  onChange: (id: number | null) => void;
  groupBy?: (p: PosRef) => string;
  helperText?: string;
  autoFocus?: boolean;
}) {
  const chosen = options.find((p) => p.positionId === value) ?? null;
  return (
    <Autocomplete
      size="small"
      openOnFocus
      options={options}
      value={chosen}
      onChange={(_, v) => onChange(v?.positionId ?? null)}
      groupBy={groupBy}
      getOptionLabel={(p) => posTitle(p)}
      getOptionKey={(p) => p.positionId}
      isOptionEqualToValue={(a, b) => a.positionId === b.positionId}
      renderOption={(props, p) => {
        const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
        return (
          <li key={key} {...rest}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, overflowWrap: 'anywhere' }}>{posTitle(p)}</Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{posWho(p)}</Typography>
            </Box>
          </li>
        );
      }}
      renderInput={(p) => <TextField {...p} label={label} autoFocus={autoFocus} helperText={helperText ?? (chosen ? posWho(chosen) : undefined)} />}
    />
  );
}

/** The fields. `state` comes from useUnitReporting; `canEdit` false shows them read-only. */
export function UnitReportingFields({ state, canEdit = true }: { state: UnitReportingState; canEdit?: boolean }) {
  const { data, draft, setDraft, error } = state;
  if (error) return <ErrorNotice error={error} fallback="Could not read this unit's head and reporting." onRetry={state.reload} />;
  if (!data || !draft) return <ListSkeleton rows={3} />;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const unitWord = kindWord(data.unit.type);
  const headGroup = (p: PosRef) => (p.unitId === data.unit.id ? `In this ${unitWord}` : `Above: ${unitLabel(p.unitName ?? '', p.unitType)}`);
  const above = data.candidates.reportsInto.flatMap((g) => g.positions);
  const aboveGroup = (p: PosRef) => {
    const g = data.candidates.reportsInto.find((x) => x.positions.some((q) => q.positionId === p.positionId));
    return g ? `${g.distance === 1 ? 'Parent' : 'Above'}: ${unitLabel(g.unitName, g.unitType)}` : '';
  };
  const effective = data.reportsInto.effective;
  return (
    <Stack spacing={2} data-unit-reporting="">
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Head</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 1 }}>
          Everyone in this {unitWord} reports to its head unless their position has a line set by hand.
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={draft.perShift}
              disabled={!canEdit || !data.shifts.length}
              onChange={(e) => set({ perShift: e.target.checked })}
            />
          }
          label={<Typography sx={{ fontSize: 14 }}>A head per shift</Typography>}
        />
        <Box sx={{ mt: 1 }}>
          {draft.perShift ? (
            <Stack spacing={1.25}>
              {data.shifts.map((s) => (
                <PositionPicker
                  key={s.id}
                  label={`Head on ${s.name}`}
                  options={data.candidates.heads}
                  groupBy={headGroup}
                  value={draft.shiftHeads[s.id] ?? null}
                  onChange={(id) => canEdit && set({ shiftHeads: { ...draft.shiftHeads, [s.id]: id } })}
                />
              ))}
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>
                A position reports to the head on its own shift. A shift with no head: its positions follow the {unitWord}’s Reports into.
              </Typography>
            </Stack>
          ) : (
            <PositionPicker
              label="Head"
              options={data.candidates.heads}
              groupBy={headGroup}
              value={draft.head}
              onChange={(id) => canEdit && set({ head: id })}
              helperText={draft.head == null ? `No head: the positions in it follow its Reports into.` : undefined}
            />
          )}
          {!data.candidates.heads.length && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.5 }}>
              There is no position in this {unitWord} yet to make its head.
            </Typography>
          )}
        </Box>
      </Box>

      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>Reports into</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mb: 0.5 }}>
          Who the head of this {unitWord} reports to.
        </Typography>
        <RadioGroup
          value={draft.ri}
          onChange={(e) => canEdit && set({ ri: e.target.value as RiChoice, riPosition: null })}
        >
          <FormControlLabel
            value="DEFAULT"
            disabled={!canEdit}
            control={<Radio size="small" />}
            label={
              <Box sx={{ py: 0.5 }}>
                <Typography sx={{ fontSize: 14 }}>The default</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }} data-default-text="">
                  {data.reportsInto.defaultText}
                </Typography>
              </Box>
            }
          />
          {/* A unit at the top has no unit above it: no such choice (a hint says so). One whose units
              above have no position yet: the choice shows, switched off, with the reason. */}
          {data.unit.parentId != null && (
            <FormControlLabel
              value="CHOSEN"
              disabled={!canEdit || !above.length}
              control={<Radio size="small" />}
              label={
                <Box sx={{ py: 0.5 }}>
                  <Typography sx={{ fontSize: 14 }}>Choose from the units above</Typography>
                  {!above.length && (
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }} data-no-above="">
                      The units above it have no position yet.
                    </Typography>
                  )}
                </Box>
              }
            />
          )}
          <FormControlLabel
            value="ELSEWHERE"
            disabled={!canEdit}
            control={<Radio size="small" />}
            label={<Typography sx={{ fontSize: 14, py: 0.5 }}>Somewhere else (needs a reason)</Typography>}
          />
        </RadioGroup>
        {data.unit.parentId == null && (
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: 0.25 }} data-top-hint="">
            {data.unit.name} is at the top: there is no unit above it to choose from. To have its head report to someone, use Somewhere else.
          </Typography>
        )}
        {draft.ri === 'CHOSEN' && (
          <Box sx={{ mt: 1 }}>
            <PositionPicker
              label="Reports into"
              options={above}
              groupBy={aboveGroup}
              value={draft.riPosition}
              onChange={(id) => set({ riPosition: id })}
              autoFocus
            />
          </Box>
        )}
        {draft.ri === 'ELSEWHERE' && (
          <Stack spacing={1.25} sx={{ mt: 1 }}>
            <PositionPicker
              label="Reports into"
              options={data.candidates.elsewhere}
              groupBy={(p) => unitLabel(p.unitName ?? 'No org unit', p.unitType)}
              value={draft.riPosition}
              onChange={(id) => set({ riPosition: id })}
              autoFocus
            />
            <TextField
              size="small"
              label="Why"
              required
              value={draft.reason}
              onChange={(e) => set({ reason: e.target.value })}
              placeholder="e.g. The lab reports to the plant head for quality sign-off"
              slotProps={{ htmlInput: { maxLength: 500 } }}
              helperText="Shown on the org chart when someone points at the dashed line."
            />
          </Stack>
        )}
        {draft.ri === 'CHOSEN' && (
          <TextField
            size="small"
            label="Note (optional)"
            value={draft.reason}
            onChange={(e) => set({ reason: e.target.value })}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            sx={{ mt: 1.25 }}
            fullWidth
          />
        )}
        {effective && !state.dirty && (
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 1 }}>
            Today that is {posLine(effective)}.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

/** The "Head and reporting" side sheet: the editor with its own Save. */
export function UnitReportingSheet({
  unit,
  canEdit,
  onClose,
  onSaved,
}: {
  unit: { id: number; name: string; type?: string | null } | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const state = useUnitReporting(unit?.id ?? null);
  const { success } = useToast();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  useEffect(() => { setSaveError(null); }, [unit]);
  const save = async () => {
    setBusy(true);
    setSaveError(null);
    try {
      await state.save();
      success(`${unit?.name ?? 'The unit'}: head and reporting saved.`);
      onSaved?.();
    } catch (e) {
      setSaveError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SideSheet
      open={!!unit}
      onClose={onClose}
      title={unit ? `Head and reporting — ${unitLabel(unit.name, unit.type ?? null)}` : 'Head and reporting'}
      subtitle="Who heads it, and where it reports. Positions follow this unless a line is set by hand."
      width={480}
      actions={
        canEdit ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" disabled={!state.dirty || busy} onClick={() => void save()}>
              Save
            </Button>
          </>
        ) : undefined
      }
    >
      <ErrorNotice error={saveError} fallback="It could not be saved." />
      <UnitReportingFields state={state} canEdit={canEdit} />
    </SideSheet>
  );
}

export default UnitReportingFields;
