import { useState } from 'react';
import { Box, MenuItem, TextField, Typography } from '@mui/material';
import { SideSheet } from '@shared/ui';
import { orgApi, type DepartmentLabel, type ShiftChoice } from '../api/organisation';
import { EditableList } from './EditableList';

/**
 * Departments › Labels: the company's ONE list of department labels
 * (CF_HRMS_HIRING_SPEC.md §9; the groups of §15 were removed on 2026-10-16).
 * Every department has exactly one label.
 *
 *   - Add, rename, reorder and remove in the inline EditableList; removing a
 *     label in use asks where its departments move. The last label stays.
 *   - Each label shows how many departments carry it.
 *   - "New positions start on" (spec §17.2): a label may carry a default shift.
 *     A position created without a shift, in a department with that label,
 *     starts on it; else the General shift. Existing positions never change.
 *
 * Every control follows the rights: org edit adds / renames / reorders and
 * sets "New positions start on", org remove removes.
 */

function words(e: unknown): string {
  const err = e as { message?: string; problems?: string[] } | null;
  return err?.problems?.[0] || err?.message || 'That could not be saved.';
}

function StartsOn({ labels, shifts, canEdit, onChanged, onProblem }: {
  labels: DepartmentLabel[];
  shifts: ShiftChoice[];
  canEdit: boolean;
  onChanged: () => void;
  onProblem: (text: string | null) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!labels.length || (!canEdit && !labels.some((l) => l.defaultShiftId))) return null;
  const nameOf = (id: number | null | undefined) => shifts.find((s) => s.id === id)?.name ?? null;
  return (
    <Box data-starts-on="" sx={{ mt: 2 }}>
      <Typography component="h3" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 0.25 }}>New positions start on</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 0.75 }}>
        A new position with no shift chosen starts on its department’s label’s shift. Positions that exist do not change.
      </Typography>
      {labels.map((l) => (
        <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
          <Typography sx={{ fontSize: 13, flex: '1 1 120px', minWidth: 0, overflowWrap: 'anywhere' }}>{l.name}</Typography>
          {canEdit ? (
            <TextField
              select
              size="small"
              value={l.defaultShiftId ?? ''}
              disabled={busy === l.id}
              onChange={async (e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                setBusy(l.id);
                onProblem(null);
                try {
                  await orgApi.departmentLabels.setDefaultShift(l.id, v);
                  onChanged();
                } catch (err) {
                  onProblem(words(err));
                } finally {
                  setBusy(null);
                }
              }}
              slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': `New positions in ${l.name} start on` } }}
              sx={{ flex: '0 0 170px', '& .MuiInputBase-input': { fontSize: 13, py: 0.6 } }}
            >
              <MenuItem value="">No default</MenuItem>
              {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              {l.defaultShiftId != null && !shifts.some((s) => s.id === l.defaultShiftId) && <MenuItem value={l.defaultShiftId}>A shift no longer active</MenuItem>}
            </TextField>
          ) : (
            <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{nameOf(l.defaultShiftId) ?? 'No default'}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}

export function LabelsSheet({ open, onClose, labels, shifts, canEdit, canRemove, onChanged }: {
  open: boolean;
  onClose: () => void;
  labels: DepartmentLabel[];
  shifts: ShiftChoice[];
  canEdit: boolean;
  canRemove: boolean;
  /** Reload the labels (and whatever shows them). */
  onChanged: () => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <SideSheet open={open} onClose={onClose} title="Labels" subtitle="What kinds of department this company has" width={440}>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, lineHeight: 1.55 }}>
        Everything on this screen is a department. Its label says what it is: Department, Section,
        Machine, or any name you use. Every department has one label. A label is its own: it does not
        pass to the departments under it. Renaming a label renames it on every department that has it.
      </Typography>
      <EditableList
        items={labels.map((l) => ({ id: l.id, name: l.name, count: l.departmentCount }))}
        canEdit={canEdit}
        canRemove={canRemove}
        noun="label"
        usage={(n) => `${n} department${n === 1 ? '' : 's'}`}
        minItems={1}
        onAdd={async (name) => { await orgApi.departmentLabels.create(name); onChanged(); }}
        onRename={async (id, name) => { await orgApi.departmentLabels.rename(id, name); onChanged(); }}
        onReorder={async (ids) => { await orgApi.departmentLabels.reorder(ids); onChanged(); }}
        onRemove={async (id, moveTo) => { await orgApi.departmentLabels.remove(id, typeof moveTo === 'number' ? moveTo : undefined); onChanged(); }}
      />
      {problem && <Typography role="alert" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)', mt: 1 }}>{problem}</Typography>}
      <StartsOn labels={labels} shifts={shifts} canEdit={canEdit} onChanged={onChanged} onProblem={setProblem} />
    </SideSheet>
  );
}
