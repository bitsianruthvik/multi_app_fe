import { useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, Chip, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import { FormDialog, useToast } from '@shared/ui';
import { useCan } from '../access/can';
import { orgApi, type Department, type DepartmentLabel } from '../api/organisation';
import { CodeNote } from './CodeNote';
import { descendantIds, indentedLabel } from './OrgData';
import { forgetUnitKinds, kindWord, nextKindDown, unitLabel } from './orgUnits';
import { kindChipSx, kindColour } from './labels';
import { UnitReportingFields } from './UnitReporting';
import { useUnitReporting } from './useUnitReporting';

/**
 * The new / edit org unit dialog, as one component (CF_HRMS_HIRING_SPEC.md
 * §33, §34.5). Extracted from the Org units page's own dialog, word for word,
 * so the org chart's edit mode ("+ Org unit") opens the SAME dialog the list
 * does: "What is it?" first (the kinds as chips, + add a kind), then Name,
 * Sits under, the code note, Shared / Serves and Status. Its title follows the
 * choice ("New machine under Printing"); under a parent the kind after the
 * parent's is suggested.
 *
 * `rows` / `labels` may be passed by a screen that already holds them; without
 * them the dialog reads both when it opens.
 *
 * NO SILENT TOP LEVEL (§34). "Sits under" is never left blank by accident: the
 * top level is its own choice, "At the top (no parent)", with a line saying
 * "This makes a new top-level unit beside …". A new unit opened from nowhere
 * defaults to the company's first top unit (the server still takes no parent:
 * the first unit of a company is top level). `sortOrder` places a new unit
 * among its siblings (the "+" between two rows on the Org units page).
 */

interface DraftState {
  id: number | null;
  name: string;
  /** Shown as text on edit; never sent. */
  code: string | null;
  /** A unit's id, 'top' = at the top level (chosen out loud), '' = not chosen yet. */
  parentId: number | '' | 'top';
  status: 'ACTIVE' | 'INACTIVE';
  /** Its ONE label ('' only while the list is still loading). */
  labelId: number | '';
  /** Its people serve other org units — one box on the org chart, pointing at what it serves. */
  isShared: boolean;
  serves: number[];
}

/**
 * On top: the first kind of the list. Under a parent: the kind after the parent's (§33).
 * No parent given (§34): the company's first top unit; a company with none starts at the top.
 */
const emptyDraft = (parent: Department | null, labels: DepartmentLabel[], firstTop: Department | null = null): DraftState => ({
  id: null,
  name: '',
  code: null,
  parentId: parent?.id ?? firstTop?.id ?? 'top',
  status: 'ACTIVE',
  labelId: (parent ? nextKindDown(labels, parent.labelId)?.id : labels[0]?.id) ?? '',
  isShared: false,
  serves: [],
});

const draftOf = (row: Department, labels: DepartmentLabel[]): DraftState => ({
  id: row.id,
  name: row.name,
  code: row.code ?? null,
  parentId: row.parentId ?? 'top',
  status: row.status,
  labelId: row.labelId ?? labels.find((l) => l.name.toLowerCase() === String(row.type ?? '').toLowerCase())?.id ?? '',
  isShared: Boolean(row.isShared),
  serves: row.serves ?? [],
});

export function OrgUnitDialog({
  open,
  unit = null,
  parentId = null,
  sortOrder = null,
  atTop = false,
  rows: givenRows,
  labels: givenLabels,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** The unit to edit; null = a new one. */
  unit?: Department | null;
  /** A new unit's "Sits under" (the unit it was started from). None: the company's first top unit. */
  parentId?: number | null;
  /** A new unit's place among its siblings (1 = first); none = after the last. */
  sortOrder?: number | null;
  /** A new unit AT THE TOP, chosen already (a "+" between two top units). */
  atTop?: boolean;
  rows?: Department[];
  labels?: DepartmentLabel[];
  onClose: () => void;
  /** After a save: the saved unit (the caller reloads what shows it). */
  onSaved: (saved: Department) => void;
}) {
  const can = useCan();
  const { success } = useToast();
  const [loaded, setLoaded] = useState<{ rows: Department[]; labels: DepartmentLabel[] } | null>(null);
  const rows = useMemo(() => givenRows ?? loaded?.rows ?? [], [givenRows, loaded]);
  const labels = useMemo(() => givenLabels ?? loaded?.labels ?? [], [givenLabels, loaded]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  // "+ Add a kind" inside the dialog: the text being typed (null = closed), and a refusal.
  const [newKind, setNewKind] = useState<string | null>(null);
  const [kindProblem, setKindProblem] = useState<string | null>(null);
  const [addingKind, setAddingKind] = useState(false);
  const [tick, setTick] = useState(0);
  // Spec §40.2: an existing unit's head and Reports into, saved with the unit.
  const reporting = useUnitReporting(open && unit ? unit.id : null);

  // Read the units and kinds when the caller did not pass them.
  const needRead = open && (!givenRows || !givenLabels);
  useEffect(() => {
    if (!needRead) return undefined;
    let live = true;
    Promise.all([orgApi.departments.list(), orgApi.departmentLabels.read()])
      .then(([r, l]) => { if (live) setLoaded({ rows: r, labels: l.labels }); })
      .catch(() => { if (live) setLoaded({ rows: [], labels: [] }); });
    return () => { live = false; };
  }, [needRead, tick]);

  const ready = !!givenRows && !!givenLabels ? true : !!loaded;
  // The draft is made once per opening, when the lists are there.
  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    if (!ready || draft) return;
    setNewKind(null);
    setKindProblem(null);
    if (unit) setDraft(draftOf(unit, labels));
    else {
      // A parent the caller gave (`parentId`: a unit box on the org chart, "Add under this") always stays chosen;
      // only with none given does the dialog fall back to the company's first top unit (§34).
      const parent = rows.find((r) => r.id === parentId) ?? null;
      const firstTop = atTop || parentId != null ? null : rows.find((r) => r.parentId == null && r.depth === 0) ?? null;
      const base = emptyDraft(parent, labels, firstTop);
      const d = parentId != null && !parent ? { ...base, parentId } : base;
      // Opened from the first top unit by default: its kind suggests the next one down, as "Add under this" does.
      setDraft(parent || !firstTop ? d : { ...d, labelId: nextKindDown(labels, firstTop.labelId)?.id ?? d.labelId });
    }
  }, [open, ready, draft, unit, parentId, atTop, rows, labels]);

  // "+ Add a kind" (the labels API): added to the company's list and chosen at once.
  const addKind = async () => {
    const name = (newKind ?? '').trim();
    if (!name || !draft) return;
    setAddingKind(true);
    setKindProblem(null);
    try {
      const made = await orgApi.departmentLabels.create(name);
      setDraft((d) => (d ? { ...d, labelId: made.id } : d));
      setNewKind(null);
      forgetUnitKinds();
      if (!givenLabels) setLoaded((l) => (l ? { ...l, labels: [...l.labels, made] } : l));
      setTick((t) => t + 1);
    } catch (e) {
      const err = e as { message?: string; problems?: string[] } | null;
      setKindProblem(err?.problems?.[0] || err?.message || 'That kind could not be added.');
    } finally {
      setAddingKind(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    // No code: the server issues it on create and never changes it.
    const body = {
      name: draft.name,
      parentId: draft.parentId === '' || draft.parentId === 'top' ? null : draft.parentId,
      ...(!draft.id && sortOrder ? { sortOrder } : {}),
      status: draft.status,
      ...(draft.labelId === '' ? {} : { labelId: draft.labelId }),
      isShared: draft.isShared,
      // Only a shared unit serves others; un-sharing one clears its list.
      serves: draft.isShared ? draft.serves : [],
    };
    const saved = draft.id ? await orgApi.departments.update(draft.id, body) : await orgApi.departments.create(body);
    // After the unit: a move first, then the head and Reports into that are offered under the new place.
    if (draft.id && reporting.dirty) await reporting.save();
    const saidKind = labels.find((l) => l.id === draft.labelId)?.name;
    const what = saidKind ? `${saidKind} “${draft.name.trim()}”` : `“${draft.name.trim()}”`;
    success(draft.id ? `${what} saved.` : `${what} added.`);
    forgetUnitKinds();
    onSaved(saved);
  };

  // A branch cannot be moved inside itself; the backend refuses it, and the
  // picker should not offer it in the first place.
  const forbidden = draft?.id ? descendantIds(rows, draft.id) : new Set<number>();

  // The dialog's title follows the choice: "New machine under Printing".
  const draftKind = labels.find((l) => l.id === draft?.labelId)?.name ?? null;
  const draftParent = draft && typeof draft.parentId === 'number' ? rows.find((r) => r.id === draft.parentId) ?? null : null;
  const dialogTitle = draft?.id
    ? `Edit ${kindWord(draftKind)}`
    : `New ${kindWord(draftKind)}${draftParent ? ` under ${draftParent.name}` : draft?.parentId === 'top' ? ' at the top' : ''}`;
  // §34: the top units it would sit beside, for the confirm line.
  const besideTops = rows.filter((r) => r.parentId == null && r.depth === 0 && r.id !== draft?.id);
  const topLine = draft?.parentId === 'top' && besideTops.length && !(draft.id && unit?.parentId == null)
    ? `This makes a new top-level unit beside ${besideTops.slice(0, 4).map((r) => r.name).join(', ')}${besideTops.length > 4 ? ` and ${besideTops.length - 4} more` : ''}.`
    : null;

  return (
    <FormDialog
      open={open}
      title={dialogTitle}
      subtitle={
        draft?.id
          ? 'Change what it is, its name or what it sits under.'
          : 'Choose what it is, name it, and say what it sits under.'
      }
      onClose={onClose}
      onSubmit={save}
      submitLabel={draft?.id ? 'Save' : 'Create'}
      submitDisabled={!draft?.name.trim() || (labels.length > 0 && draft?.labelId === '') || newKind !== null || draft?.parentId === ''}
    >
      {draft && (
        <>
          {/* §33: what it is comes first — the kinds as chips, + add a kind. */}
          <Box role="group" aria-labelledby="ou-kind-label" data-kind-chips="">
            <Typography id="ou-kind-label" sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)', mb: 0.75 }}>
              What is it?
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {labels.map((l) => {
                const on = draft.labelId === l.id;
                return (
                  <Chip
                    key={l.id}
                    label={l.name}
                    size="small"
                    clickable
                    color={on && !kindColour(l) ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    aria-pressed={on}
                    // §34.1: the chosen kind in its own colour.
                    sx={on && kindColour(l) ? { ...kindChipSx(kindColour(l)), border: '1px solid', fontWeight: 600 } : undefined}
                    onClick={() => setDraft({ ...draft, labelId: l.id })}
                  />
                );
              })}
              {can.org.edit && newKind === null && (
                <Chip
                  label="Add a kind"
                  size="small"
                  variant="outlined"
                  icon={<AddRounded fontSize="small" />}
                  onClick={() => { setKindProblem(null); setNewKind(''); }}
                  sx={{ borderStyle: 'dashed' }}
                />
              )}
            </Box>
            {newKind !== null && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  label="New kind"
                  placeholder="e.g. Line, Cell, Area"
                  value={newKind}
                  autoFocus
                  onChange={(e) => setNewKind(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void addKind(); }
                    if (e.key === 'Escape') { e.stopPropagation(); setNewKind(null); }
                  }}
                  slotProps={{ htmlInput: { maxLength: 60 } }}
                  sx={{ flex: '1 1 160px' }}
                />
                <Button size="small" variant="contained" onClick={() => void addKind()} disabled={!newKind.trim() || addingKind} sx={{ height: 40 }}>
                  Add
                </Button>
                <Button size="small" onClick={() => setNewKind(null)} sx={{ height: 40 }}>
                  Cancel
                </Button>
              </Box>
            )}
            {kindProblem && (
              <Typography role="alert" sx={{ fontSize: 12.5, color: 'var(--c-danger-600)', mt: 0.75 }}>{kindProblem}</Typography>
            )}
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.75 }}>
              Shown with its name everywhere, e.g. “Printing 2 (Machine)”. The list is yours: the Kinds button changes it.
            </Typography>
          </Box>
          <TextField
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            autoFocus={!!draft.id || draft.labelId !== ''}
            fullWidth
            size="small"
          />
          <TextField
            select
            label="Sits under"
            value={draft.parentId}
            onChange={(e) =>
              setDraft({ ...draft, parentId: e.target.value === '' ? '' : e.target.value === 'top' ? 'top' : Number(e.target.value) })
            }
            fullWidth
            size="small"
            slotProps={{ select: { displayEmpty: true, renderValue: (v) => (v === '' ? <em>Choose where it sits</em> : v === 'top' ? 'At the top (no parent)' : unitLabel(rows.find((r) => r.id === v)?.name, rows.find((r) => r.id === v)?.type)) }, inputLabel: { shrink: true }, formHelperText: topLine ? { role: 'status', sx: { color: 'var(--c-warning-800)', fontWeight: 500 } } : undefined }}
            helperText={topLine ?? (draft.id ? 'Moving it moves everything under it.' : undefined)}
            data-top-confirm={topLine ? '' : undefined}
          >
            <MenuItem value="top">At the top (no parent)</MenuItem>
            {rows
              .filter((r) => !forbidden.has(r.id))
              .map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {indentedLabel(r.depth, unitLabel(r.name, r.type))}
                </MenuItem>
              ))}
          </TextField>
          {/* The code is never typed (spec §11): issued on create, fixed afterwards. */}
          <CodeNote code={draft.code} isNew={!draft.id} />
          <Box>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={draft.isShared}
                  onChange={(e) => setDraft({ ...draft, isShared: e.target.checked })}
                />
              }
              label={<Typography sx={{ fontSize: 14 }}>Shared — serves other org units</Typography>}
            />
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.25 }}>
              Its people work for several org units. The org chart draws it as one box with an
              arrow to each unit it serves. This is separate from its kind.
            </Typography>
          </Box>
          {draft.isShared && (
            <Autocomplete
              multiple
              size="small"
              options={rows.filter((r) => r.id !== draft.id)}
              value={rows.filter((r) => draft.serves.includes(r.id))}
              onChange={(_, v) => setDraft({ ...draft, serves: v.map((r) => r.id) })}
              getOptionLabel={(r) => unitLabel(r.name, r.type)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderOption={(props, r) => {
                const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                return (
                  <li key={key} {...rest}>
                    {indentedLabel(r.depth, unitLabel(r.name, r.type))}
                  </li>
                );
              }}
              renderInput={(p) => (
                <TextField
                  {...p}
                  label="Serves"
                  placeholder={draft.serves.length ? '' : 'Pick the org units its people work for'}
                  helperText="Two or more draws it as one shared box with an arrow to each; none draws it as an ordinary box with a dashed frame."
                />
              )}
            />
          )}
          <Box sx={{ borderTop: '1px solid var(--c-divider)', pt: 2 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', mb: 1 }}>Head and reporting</Typography>
            {draft.id ? (
              <UnitReportingFields state={reporting} canEdit={can.org.edit} />
            ) : (
              <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>
                Its head and where it reports into are set once it exists and has positions: “Head and reporting” in its row menu. Until then it follows the unit it sits under.
              </Typography>
            )}
          </Box>
          <TextField
            select
            label="Status"
            value={draft.status}
            onChange={(e) =>
              setDraft({ ...draft, status: e.target.value as DraftState['status'] })
            }
            fullWidth
            size="small"
            helperText="Inactive keeps the history and stops it appearing in new pickers."
          >
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
          </TextField>
        </>
      )}
    </FormDialog>
  );
}

export default OrgUnitDialog;
