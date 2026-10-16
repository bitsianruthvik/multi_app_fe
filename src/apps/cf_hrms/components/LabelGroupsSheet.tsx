import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { SideSheet, ToneBadge } from '@shared/ui';
import { orgApi, type LabelGroup } from '../api/organisation';
import { EditableList } from './EditableList';

/**
 * Departments › Labels (CF_HRMS_HIRING_SPEC.md §15.4): the groups as sections,
 * each with its labels in the inline EditableList, and "Add a group".
 *
 *   - Kind is every company's: "always required", never removed.
 *   - A group may be required (every department must have one of its labels)
 *     or optional. Making a group required does not change any department; the
 *     section says how many still have none.
 *   - Removing a group that departments use asks once more, naming how many,
 *     and then takes its labels off them.
 *
 * Every control follows the rights: org edit adds / renames / reorders and
 * sets "New positions start on", org remove removes.
 *
 * NEW POSITIONS START ON (spec §17.2): each label may carry a default shift. A
 * position created without a shift, in a department carrying the label, starts
 * on it — the first label in group order that has one; else General. Existing
 * positions never change.
 */

type ShiftChoice = { id: number; code: string | null; name: string };

function StartsOn({ group, shifts, canEdit, onChanged, onProblem }: {
  group: LabelGroup;
  shifts: ShiftChoice[];
  canEdit: boolean;
  onChanged: () => void;
  onProblem: (text: string) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!group.labels.length || (!canEdit && !group.labels.some((l) => l.defaultShiftId))) return null;
  const nameOf = (id: number | null | undefined) => shifts.find((s) => s.id === id)?.name ?? null;
  return (
    <Box data-starts-on={group.id} sx={{ mt: 1 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', mb: 0.5 }}>New positions start on</Typography>
      {group.labels.map((l) => (
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

function words(e: unknown): string {
  const err = e as { message?: string; problems?: string[] } | null;
  return err?.problems?.[0] || err?.message || 'That could not be saved.';
}

export function LabelGroupsSheet({ open, onClose, groups, canEdit, canRemove, onChanged }: {
  open: boolean;
  onClose: () => void;
  groups: LabelGroup[];
  canEdit: boolean;
  canRemove: boolean;
  /** Reload the groups (and whatever shows them). */
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const [doomed, setDoomed] = useState<{ group: LabelGroup; used: number | null } | null>(null);
  const [problem, setProblem] = useState<{ id: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shifts, setShifts] = useState<ShiftChoice[]>([]);
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    orgApi.labelGroups.shifts().then((s) => { if (live) setShifts(s); }).catch(() => undefined);
    return () => { live = false; };
  }, [open]);

  const run = async (id: number, fn: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setProblem({ id, text: words(e) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await run(0, () => orgApi.labelGroups.create(name, newRequired))) {
      setAdding(false);
      setNewName('');
      setNewRequired(false);
    }
  };

  /** Swap a group with its neighbour. The order decides which label wins a leave-policy conflict, and the order of the drop-downs. */
  const move = (index: number, by: -1 | 1) => {
    const ids = groups.map((g) => g.id);
    const j = index + by;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void run(groups[index].id, () => orgApi.labelGroups.reorder(ids));
  };

  const askRemove = (group: LabelGroup) => {
    setProblem(null);
    const used = group.labels.reduce((t, l) => t + l.departmentCount, 0);
    setDoomed({ group, used });
  };

  return (
    <SideSheet open={open} onClose={onClose} title="Labels" subtitle="What kinds of department this company has, in groups" width={460}>
      <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, lineHeight: 1.55 }}>
        Everything on this screen is a department. Labels say what a department is, in groups: its kind
        (Department, Section, Machine), and any group of your own — a unit, an area. A department has one
        label in each group. Its labels are its own: a label on a department does not pass to the
        departments under it. Renaming a label renames it on every department that has it.
        The order of the groups matters: when two of a department's labels point to different leave
        policies, the label in the group higher up wins. Use the arrows to change the order.
      </Typography>

      {groups.map((g, i) => (
        <Box
          key={g.id}
          component="section"
          aria-label={`Group ${g.name}`}
          sx={{ mb: 2.5, pb: 2, borderBottom: '1px solid var(--c-border)', '&:last-of-type': { borderBottom: 0 } }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
            {renaming === g.id ? (
              <TextField
                size="small"
                autoFocus
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void run(g.id, () => orgApi.labelGroups.update(g.id, { name: renameText.trim() })).then((done) => done && setRenaming(null));
                  }
                  if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); }
                }}
                inputProps={{ 'aria-label': `New name for the group ${g.name}`, maxLength: 40 }}
                sx={{ flex: '1 1 160px' }}
              />
            ) : (
              <Typography component="h3" sx={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-text)' }}>
                {g.name}
              </Typography>
            )}
            {g.isKind ? (
              <ToneBadge tone="neutral" noIcon label="Always required" />
            ) : g.isRequired ? (
              <ToneBadge tone="info" noIcon label="Required" />
            ) : (
              <ToneBadge tone="neutral" noIcon label="Optional" />
            )}
            <Box sx={{ flex: 1 }} />
            {canEdit && groups.length > 1 && renaming !== g.id && (
              <>
                <Tooltip title="Move up">
                  <span>
                    <IconButton size="small" aria-label={`Move the group ${g.name} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpwardRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span>
                    <IconButton size="small" aria-label={`Move the group ${g.name} down`} disabled={busy || i === groups.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownwardRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            )}
            {canEdit && renaming !== g.id && (
              <Tooltip title="Rename the group">
                <IconButton size="small" aria-label={`Rename the group ${g.name}`} onClick={() => { setRenaming(g.id); setRenameText(g.name); }}>
                  <EditOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canRemove && !g.locked && (
              <Tooltip title="Remove the group">
                <IconButton size="small" aria-label={`Remove the group ${g.name}`} onClick={() => askRemove(g)}>
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          {canEdit && !g.isKind && (
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={g.isRequired}
                  disabled={busy}
                  onChange={(e) => void run(g.id, () => orgApi.labelGroups.update(g.id, { isRequired: e.target.checked }))}
                />
              }
              label={<Typography sx={{ fontSize: 13 }}>Every department must have one</Typography>}
              sx={{ ml: -0.5, mb: 0.5 }}
            />
          )}
          {g.departmentsWithout > 0 && (g.isRequired || g.isKind) && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-700, var(--c-text-2))', mb: 0.75 }}>
              {g.departmentsWithout} department{g.departmentsWithout === 1 ? ' has' : 's have'} no {g.name} label yet — give
              {g.departmentsWithout === 1 ? ' it' : ' them'} one when you next edit {g.departmentsWithout === 1 ? 'it' : 'them'}, or in Excel.
            </Typography>
          )}
          {problem?.id === g.id && (
            <Typography role="alert" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)', mb: 0.75 }}>{problem.text}</Typography>
          )}
          {doomed?.group.id === g.id && (
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, p: 1, mb: 1, background: 'var(--c-surface-2)', borderRadius: 'var(--r-sm)' }}>
              <Typography sx={{ fontSize: 13, flex: '1 1 200px' }}>
                {doomed.used
                  ? `${doomed.used} department${doomed.used === 1 ? ' has' : 's have'} a ${g.name} label. Removing the group takes ${doomed.used === 1 ? 'it' : 'them'} off, with its ${g.labels.length} label${g.labels.length === 1 ? '' : 's'}.`
                  : `Remove the group “${g.name}” and its ${g.labels.length} label${g.labels.length === 1 ? '' : 's'}? No department has one.`}
              </Typography>
              <Button
                size="small"
                variant="contained"
                color="error"
                disabled={busy}
                onClick={() => void run(g.id, () => orgApi.labelGroups.remove(g.id, Boolean(doomed.used))).then((done) => done && setDoomed(null))}
              >
                Remove the group
              </Button>
              <Button size="small" color="inherit" onClick={() => setDoomed(null)}>Cancel</Button>
            </Box>
          )}
          <EditableList
            items={g.labels.map((l) => ({ id: l.id, name: l.name, count: l.departmentCount }))}
            canEdit={canEdit}
            canRemove={canRemove}
            noun={`${g.name} label`}
            usage={(n) => `${n} department${n === 1 ? '' : 's'}`}
            minItems={g.isRequired || g.isKind ? 1 : 0}
            clearChoice={g.isRequired || g.isKind ? undefined : 'Take it off them'}
            onAdd={async (name) => { await orgApi.departmentLabels.create(name, g.id); onChanged(); }}
            onRename={async (id, name) => { await orgApi.departmentLabels.rename(id, name); onChanged(); }}
            onReorder={async (ids) => { await orgApi.departmentLabels.reorder(ids, g.id); onChanged(); }}
            onRemove={async (id, moveTo) => { await orgApi.departmentLabels.remove(id, moveTo); onChanged(); }}
          />
          <StartsOn group={g} shifts={shifts} canEdit={canEdit} onChanged={onChanged} onProblem={(text) => setProblem({ id: g.id, text })} />
        </Box>
      ))}

      {canEdit && (adding ? (
        <Box sx={{ p: 1.5, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm)', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            size="small"
            autoFocus
            label="Group name"
            placeholder="Unit, Area, Plant…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addGroup(); } }}
            inputProps={{ maxLength: 40 }}
          />
          <FormControlLabel
            control={<Checkbox size="small" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 13 }}>Every department must have one of its labels</Typography>}
          />
          {problem?.id === 0 && <Typography role="alert" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)' }}>{problem.text}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button size="small" color="inherit" onClick={() => { setAdding(false); setProblem(null); }}>Cancel</Button>
            <Button size="small" variant="contained" disabled={!newName.trim() || busy} onClick={() => void addGroup()}>Add the group</Button>
          </Box>
        </Box>
      ) : (
        <Button size="small" startIcon={<AddRounded />} onClick={() => setAdding(true)}>
          Add a group
        </Button>
      ))}
    </SideSheet>
  );
}
