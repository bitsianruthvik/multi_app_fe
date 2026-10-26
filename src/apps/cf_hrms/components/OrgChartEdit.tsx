import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  Autocomplete,
  Box,
  FormControlLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import DriveFileMoveRounded from '@mui/icons-material/DriveFileMoveRounded';
import PersonAddAltRounded from '@mui/icons-material/PersonAddAltRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import SupervisorAccountRounded from '@mui/icons-material/SupervisorAccountRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { FormDialog, errorMessage, useToast } from '@shared/ui';
import type { Can } from '../access/can';
import { orgApi, type Department } from '../api/organisation';
import { MoveConfirm, MoveToDialog, UndoBar, type PendingMove } from './OrgUnitMove';
import type { OrgChartDepartment, OrgChartNode } from '../api/orgchart';
import { positionsApi, type PositionOptions, type PositionRow } from '../api/positions';
import type { Role } from '../api/roles';
import { useStartHiring } from './useStartHiring';
import { MoveEmployeeHereDialog, MoveToPositionDialog } from './MoveEmployee';
import { PositionFormDialog, PositionSiblingDialog } from './PositionDialogs';
import { PositionShiftMenu } from './PositionShiftControl';
import { PositionReportingDialog } from './ReportingDialogs';
import { RoleFormDialog } from './RoleFormDialog';
import { OrgUnitDialog } from './OrgUnitDialog';
import { UnitReportingSheet } from './UnitReporting';
import { forgetUnitKinds, unitLabel } from './orgUnits';
import { NO_DEPT, type ChartModel } from './orgChartLayout';

/**
 * The org chart's EDIT MODE (CF_HRMS_HIRING_SPEC.md §34.5).
 *
 * View mode is untouched: everything here is reached only through the small
 * + / ⋯ buttons the canvas draws while editing, and the drag of an org unit's
 * title band. Each action opens the SAME dialog the list screens use:
 *
 *   org unit box   + Org unit (OrgUnitDialog, under it, kind next down) ·
 *                  + Role here (pick or create a role — RoleFormDialog — then
 *                  its first position here — PositionFormDialog) · Move… (a
 *                  picker, then the move confirm)
 *   role card      + Position (PositionSiblingDialog: same role, unit, manager)
 *   vacant row     Hire for this (the hiring start, as the pop-up) · Put a
 *                  person here (MoveEmployeeHereDialog, dated)
 *   filled row     Move person… (MoveToPositionDialog) · Change shift
 *                  (PositionShiftMenu) · Reports to… (PositionReportingDialog)
 *   drag a box     onto another box: the same move confirm
 *
 * RIGHTS: the server checks every call as it always has. The buttons follow
 * the login's rights (`useCan`) and, for a login limited to some org units,
 * appear only inside them (`inScope`).
 */

export type EditTarget =
  | { kind: 'unit'; deptId: number }
  | { kind: 'card'; cardId: number }
  | { kind: 'row'; positionId: number; cardId: number };

/** What the canvas needs while editing. */
export interface CanvasEdit {
  /** Does this unit / card / row get a + (or ⋯) button? */
  unit: (deptId: number) => boolean;
  card: (cardId: number) => boolean;
  row: (positionId: number) => boolean;
  /** The menu of a button, anchored to it. */
  onMenu: (target: EditTarget, anchor: Element) => void;
  /** Whose menu is open (its button stays visible). */
  openKey: string | null;
  /** Dragging a unit box onto another. Absent = no drag. */
  drag?: {
    /** Why `to` cannot take `from`; null = it can. */
    check: (from: number, to: number | null) => string | null;
    onDrop: (from: number, to: number) => void;
    nameOf: (deptId: number) => string;
  };
}

export const editKey = (t: EditTarget) =>
  t.kind === 'unit' ? `u${t.deptId}` : t.kind === 'card' ? `c${t.cardId}` : `r${t.positionId}`;

/** Every unit under `id`, at any depth (not `id` itself). */
function unitsBelow(departments: OrgChartDepartment[], id: number): Set<number> {
  const kids = new Map<number, number[]>();
  for (const d of departments) {
    if (d.parentId == null) continue;
    const list = kids.get(d.parentId);
    if (list) list.push(d.id);
    else kids.set(d.parentId, [d.id]);
  }
  const out = new Set<number>();
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    if (out.has(k)) continue;
    out.add(k);
    stack.push(...(kids.get(k) ?? []));
  }
  return out;
}

/** The units a login limited to some org units may change: theirs and everything under them. Null = all. */
export function scopeUnits(can: Can, departments: OrgChartDepartment[]): Set<number> | null {
  if (!can.scope || can.scope.all || can.owner) return null;
  const names = new Set(can.scope.departmentNames.map((n) => n.trim().toLowerCase()));
  const out = new Set<number>();
  for (const d of departments) {
    if (!names.has(d.name.trim().toLowerCase())) continue;
    out.add(d.id);
    for (const k of unitsBelow(departments, d.id)) out.add(k);
  }
  return out;
}

interface MoveAsk { unit: number; to: number | null }

type Dialog =
  | { kind: 'unit-new'; parentId: number }
  | { kind: 'role-here'; deptId: number }
  | { kind: 'role-new'; deptId: number }
  | { kind: 'position-new'; deptId: number; roleId: number }
  | { kind: 'unit-move-pick'; unit: number }
  | { kind: 'sibling'; position: PositionRow }
  | { kind: 'put-person'; positionId: number; label: string }
  | { kind: 'move-person'; employeeId: number; name: string; current: string }
  | { kind: 'reports-to'; positionId: number };

export function useOrgChartEdit({
  active,
  model,
  can,
  onChanged,
  onOpenUnit,
}: {
  active: boolean;
  model: ChartModel | null;
  can: Can;
  /** After any save: re-read the chart quietly (zoom, pan, open units and selection stay). */
  onChanged: () => void;
  /** Open a unit's box on the chart (the parent of a new unit, the target of a move). */
  onOpenUnit: (deptId: number) => void;
}): { canvasEdit: CanvasEdit | null; ui: ReactNode } {
  const toast = useToast();
  const [menu, setMenu] = useState<{ target: EditTarget; anchor: Element } | null>(null);
  const [shiftAt, setShiftAt] = useState<{ anchor: Element; positionId: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  // Spec §40.2: a unit box's "Head and reporting" — the Org units page's own sheet.
  const [reportingUnit, setReportingUnit] = useState<{ id: number; name: string; type: string | null } | null>(null);
  const [moveAsk, setMoveAsk] = useState<MoveAsk | null>(null);
  const [options, setOptions] = useState<PositionOptions | null>(null);
  const hiring = useStartHiring(null, onChanged);

  const departments = useMemo(() => model?.departments ?? [], [model]);
  const deptById = model?.deptById;
  const scope = useMemo(() => scopeUnits(can, departments), [can, departments]);
  const inScope = useCallback((deptId: number | null | undefined) => !scope || (deptId != null && scope.has(deptId)), [scope]);

  const loadOptions = useCallback(async (fresh = false) => {
    if (options && !fresh) return options;
    const o = await positionsApi.options();
    setOptions(o);
    return o;
  }, [options]);

  const [unitRows, setUnitRows] = useState<Department[] | null>(null);
  const loadUnitRows = useCallback(
    () =>
      orgApi.departments
        .list()
        .then((rows) => { setUnitRows(rows); return rows; })
        .catch((e) => { toast.error(errorMessage(e, 'The org units could not be read.')); return null; }),
    [toast],
  );

  const nameOf = useCallback(
    (id: number | null) => {
      if (id == null) return 'the top level';
      const d = deptById?.get(id);
      return d ? unitLabel(d.name, d.type) : 'that org unit';
    },
    [deptById],
  );

  // ── Rights per target ────────────────────────────────────────────────
  const mayAddRole = can.positions.edit && (can.roles.view || can.roles.edit);
  const unitActions = can.org.edit || mayAddRole;
  const rowActions = can.positions.edit || can.hiring.edit || can.hiring.view;

  const unitsUnder = useCallback((id: number) => unitsBelow(departments, id), [departments]);

  /** Why `to` cannot take `from` (null = it can). The server says no as well; this only explains early. */
  const check = useCallback(
    (from: number, to: number | null): string | null => {
      if (to == null) return null;
      if (to === NO_DEPT) return 'That box is not an org unit.';
      if (to === from) return 'Drop it on another org unit.';
      const unit = deptById?.get(from);
      if (unit?.parentId === to) return `${nameOf(from)} is already under ${nameOf(to)}.`;
      if (unitsUnder(from).has(to)) return `${nameOf(to)} is inside ${nameOf(from)} — a unit cannot go under its own branch.`;
      if (!inScope(to)) return `${nameOf(to)} is outside the org units you look after.`;
      return null;
    },
    [deptById, nameOf, unitsUnder, inScope],
  );

  const canvasEdit = useMemo<CanvasEdit | null>(() => {
    if (!active || !model) return null;
    return {
      unit: (id) => id !== NO_DEPT && unitActions && inScope(id),
      card: (cardId) => can.positions.edit && inScope(model.byId.get(cardId)?.departmentId),
      row: (positionId) => rowActions && inScope(model.positions.get(positionId)?.departmentId),
      onMenu: (target, anchor) => setMenu({ target, anchor }),
      openKey: menu ? editKey(menu.target) : null,
      drag: can.org.edit
        ? {
            check,
            onDrop: (from, to) => { void loadUnitRows(); setMoveAsk({ unit: from, to }); },
            nameOf: (id) => nameOf(id),
          }
        : undefined,
    };
  }, [active, model, unitActions, rowActions, inScope, can.positions.edit, can.org.edit, menu, check, nameOf, loadUnitRows]);

  // ── The menu ─────────────────────────────────────────────────────────
  const closeMenu = () => setMenu(null);
  const position = (id: number): OrgChartNode | undefined => model?.positions.get(id);
  const positionWords = (p: OrgChartNode | undefined) =>
    p ? [p.displayTitle || p.roleTitle || p.title, p.positionCode].filter(Boolean).join(' · ') : '';

  const items: ReactNode[] = [];
  const item = (key: string, icon: ReactNode, label: string, onClick: () => void, opts: { hint?: string; disabled?: boolean } = {}) =>
    items.push(
      <MenuItem key={key} dense disabled={opts.disabled} onClick={() => { closeMenu(); onClick(); }}>
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText
          primary={label}
          secondary={opts.hint}
          slotProps={{ secondary: { sx: { fontSize: 12, color: 'var(--c-text-2)', whiteSpace: 'normal', maxWidth: 240 } } }}
        />
      </MenuItem>,
    );
  let menuTitle = '';
  if (menu && model) {
    const t = menu.target;
    if (t.kind === 'unit') {
      const d = deptById?.get(t.deptId);
      menuTitle = nameOf(t.deptId);
      if (can.org.edit) {
        item('unit', <AccountTreeRounded fontSize="small" />, '+ Org unit', () => setDialog({ kind: 'unit-new', parentId: t.deptId }), {
          hint: `A new unit under ${d?.name ?? 'it'}`,
        });
      }
      if (mayAddRole) {
        item('role', <BadgeRounded fontSize="small" />, '+ Role here', () => {
          void loadOptions().catch(() => undefined);
          setRoleChoice('existing');
          setPickedRole(null);
          setDialog({ kind: 'role-here', deptId: t.deptId });
        }, { hint: 'A role, with its first position in this unit' });
      }
      if (can.org.edit) {
        item('move', <DriveFileMoveRounded fontSize="small" />, 'Move…', () => { void loadUnitRows(); setDialog({ kind: 'unit-move-pick', unit: t.deptId }); }, {
          hint: 'Put it under another unit (or drag the box)',
        });
        item('reporting', <SupervisorAccountRounded fontSize="small" />, 'Head and reporting…', () => {
          setReportingUnit({ id: t.deptId, name: d?.name ?? nameOf(t.deptId), type: d?.type ?? null });
        }, { hint: 'Who heads it, and where it reports into' });
      }
    } else if (t.kind === 'card') {
      const card = model.byId.get(t.cardId);
      menuTitle = card ? card.displayTitle || card.roleTitle || card.title : 'Role';
      const first = card?.positions[0];
      if (first) {
        item('pos', <AddRounded fontSize="small" />, '+ Position', async () => {
          try {
            const [{ position: row }] = await Promise.all([positionsApi.get(first.id), loadOptions()]);
            setDialog({ kind: 'sibling', position: row });
          } catch (e) {
            toast.error(errorMessage(e, 'That position could not be read.'));
          }
        }, { hint: 'Another chair of this role in this unit' });
      }
    } else {
      const p = position(t.positionId);
      const occ = p?.occupants?.[0] ?? null;
      menuTitle = occ ? `${occ.name} — ${positionWords(p)}` : `Vacant — ${positionWords(p)}`;
      if (p && !occ) {
        const blocked = p.joining
          ? `${p.joining.name} is joining this position.`
          : p.hiring
            ? 'A hiring is open for it. Close it first.'
            : null;
        if (p.hiring && can.hiring.view) {
          item('hire', <ArrowForwardRounded fontSize="small" />, 'Continue hiring', () => hiring.open(p.hiring!.id), { hint: p.hiring.statusLine ?? undefined });
        } else if (!p.joining && can.hiring.edit) {
          item('hire', <PersonAddAltRounded fontSize="small" />, 'Hire for this', () => void hiring.start(p.id), {
            hint: 'Start a hiring for someone who is not an employee yet',
          });
        }
        if (can.positions.edit && can.employees.view) {
          item('put', <SwapHorizRounded fontSize="small" />, 'Put a person here', () =>
            setDialog({ kind: 'put-person', positionId: p.id, label: positionWords(p) }), {
            hint: blocked ?? 'Move an existing employee here, from a date',
            disabled: !!blocked,
          });
        }
      } else if (p && occ) {
        if (can.positions.edit && can.employees.view) {
          item('move', <SwapHorizRounded fontSize="small" />, 'Move person…', () =>
            setDialog({ kind: 'move-person', employeeId: occ.employeeId, name: occ.name, current: positionWords(p) }), {
            hint: `${occ.name} to another vacant position`,
          });
        }
        if (can.positions.edit) {
          const anchor = menu.anchor;
          item('shift', <ScheduleRounded fontSize="small" />, 'Change shift', () => setShiftAt({ anchor, positionId: p.id }), {
            hint: p.defaultShift ? `Now ${p.defaultShift.name}` : undefined,
          });
          item('reports', <SupervisorAccountRounded fontSize="small" />, 'Reports to…', async () => {
            try {
              await loadOptions();
              setDialog({ kind: 'reports-to', positionId: p.id });
            } catch (e) {
              toast.error(errorMessage(e, 'The positions could not be read.'));
            }
          }, { hint: 'Add a formal reporting line for this position' });
        }
      }
    }
  }

  // ── After a save ─────────────────────────────────────────────────────
  const done = () => {
    setDialog(null);
    onChanged();
  };

  // ── Move (picker, drag) → the Org units page's confirm (OrgUnitMove) ──
  // The picker and the confirm are the list's own: MoveToDialog lists the units
  // (not the unit itself or anything under it), MoveConfirm says it in the
  // server's words (GET …/move-check), and UndoBar offers one Undo.
  const pending = useMemo<PendingMove | null>(() => (moveAsk ? { unitId: moveAsk.unit, parentId: moveAsk.to } : null), [moveAsk]);
  const [undo, setUndo] = useState<{
    text: string; unitId: number; parentId: number | null; sortOrder?: number;
    chosen?: { positionId: number; reason: string | null } | null;
  } | null>(null);
  const doMove = async (m: PendingMove) => {
    // Where it was, for Undo (from the list read for the picker, else from the chart).
    const before = unitRows?.find((r) => r.id === m.unitId);
    const oldParent = before ? before.parentId : (deptById?.get(m.unitId)?.parentId ?? null);
    // §40.4: a chosen Reports into that the move switched comes back with Undo.
    const dept = deptById?.get(m.unitId);
    const chosenId = before?.reportsInto?.mode === 'CHOSEN' ? before.reportsInto.positionId
      : dept?.reportsIntoMode === 'CHOSEN' ? (dept.reportsIntoPositionId ?? null) : null;
    const chosen = m.reportsInto === 'SWITCH' && chosenId != null ? { positionId: chosenId, reason: before?.reportsInto?.reason ?? null } : null;
    await orgApi.departments.move(m.unitId, m.parentId, m.sortOrder, m.reportsInto);
    forgetUnitKinds();
    setUndo({ text: `${nameOf(m.unitId)} is now under ${nameOf(m.parentId)}.`, unitId: m.unitId, parentId: oldParent, sortOrder: before?.sortOrder, chosen });
    setUnitRows(null);
    if (m.parentId != null) onOpenUnit(m.parentId);
    onChanged();
  };
  const movingUnit = dialog?.kind === 'unit-move-pick' ? (unitRows?.find((r) => r.id === dialog.unit) ?? null) : null;
  // Inside a scope, only the units the login looks after are offered as the new parent.
  const pickRows = useMemo(() => (unitRows ?? []).filter((r) => inScope(r.id) || r.id === movingUnit?.id), [unitRows, inScope, movingUnit]);

  // ── + Role here: pick a role or make one ─────────────────────────────
  const [roleChoice, setRoleChoice] = useState<'existing' | 'new'>('existing');
  const [pickedRole, setPickedRole] = useState<{ id: number; name: string; code: string | null } | null>(null);

  const deptOfDialog = dialog && 'deptId' in dialog ? dialog.deptId : null;
  const roleHereTitle = deptOfDialog != null ? `A role in ${nameOf(deptOfDialog)}` : '';

  const ui = (
    <>
      <Menu
        anchorEl={menu?.anchor ?? null}
        open={!!menu && items.length > 0}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { dense: true, 'aria-label': menuTitle } }}
      >
        <Box sx={{ px: 2, pt: 0.5, pb: 0.75, maxWidth: 280, fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
          {menuTitle}
        </Box>
        {items}
      </Menu>
      {menu && items.length === 0 && (
        <Menu anchorEl={menu.anchor} open onClose={closeMenu}>
          <Box sx={{ px: 2, py: 1, maxWidth: 260, fontSize: 13, color: 'var(--c-text-2)' }}>Nothing here you can change.</Box>
        </Menu>
      )}

      {shiftAt && model && (
        <PositionShiftMenu
          anchorEl={shiftAt.anchor}
          positionId={shiftAt.positionId}
          shift={model.positions.get(shiftAt.positionId)?.defaultShift ?? null}
          occupantName={model.positions.get(shiftAt.positionId)?.occupants?.[0]?.name ?? null}
          onClose={() => setShiftAt(null)}
          onChanged={() => onChanged()}
        />
      )}

      {/* + Org unit: the Org units page's dialog, under this unit. */}
      <OrgUnitDialog
        open={dialog?.kind === 'unit-new'}
        parentId={dialog?.kind === 'unit-new' ? dialog.parentId : null}
        onClose={() => setDialog(null)}
        onSaved={() => {
          if (dialog?.kind === 'unit-new') onOpenUnit(dialog.parentId);
          done();
        }}
      />

      {/* + Role here, step 1: an existing role, or a new one. */}
      <FormDialog
        open={dialog?.kind === 'role-here'}
        title={roleHereTitle}
        subtitle="A role is placed in an org unit by giving it a position there. Pick the role, then its first position."
        onClose={() => setDialog(null)}
        submitLabel="Next"
        submitDisabled={roleChoice === 'existing' && !pickedRole}
        onSubmit={() => {
          if (dialog?.kind !== 'role-here') return;
          const deptId = dialog.deptId;
          // FormDialog closes itself after this; the next dialog opens on the next tick.
          window.setTimeout(() => {
            if (roleChoice === 'new') setDialog({ kind: 'role-new', deptId });
            else if (pickedRole) setDialog({ kind: 'position-new', deptId, roleId: pickedRole.id });
          }, 0);
        }}
      >
        <RadioGroup value={roleChoice} onChange={(e) => setRoleChoice(e.target.value as 'existing' | 'new')}>
          <FormControlLabel value="existing" control={<Radio size="small" />} label="An existing role" disabled={!can.roles.view && !options?.roles.length} />
          {roleChoice === 'existing' && (
            <Autocomplete
              size="small"
              sx={{ ml: 3.5, mb: 1 }}
              options={(options?.roles ?? []).map((r) => ({ id: r.id, name: r.name, code: r.code ?? null }))}
              loading={!options}
              value={pickedRole}
              onChange={(_, v) => setPickedRole(v)}
              getOptionLabel={(r) => `${r.name}${r.code ? ` · ${r.code}` : ''}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(p) => <TextField {...p} label="Role" placeholder="Type to find a role" autoFocus />}
            />
          )}
          <FormControlLabel value="new" control={<Radio size="small" />} label="A new role" disabled={!can.roles.edit} />
          {!can.roles.edit && (
            <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 3.5 }}>Making a role needs the roles edit right.</Typography>
          )}
        </RadioGroup>
      </FormDialog>

      {/* + Role here, step 1b: the Roles page's own form, with this unit as its default. */}
      <RoleFormDialog
        open={dialog?.kind === 'role-new'}
        role={null}
        initialDepartmentId={dialog?.kind === 'role-new' ? dialog.deptId : null}
        onClose={() => setDialog(null)}
        onSaved={(role: Role) => {
          if (dialog?.kind !== 'role-new') return;
          const deptId = dialog.deptId;
          void loadOptions(true).catch(() => undefined).finally(() => {
            window.setTimeout(() => setDialog({ kind: 'position-new', deptId, roleId: role.id }), 0);
          });
        }}
      />

      {/* + Role here, step 2: the Positions page's form, role and unit filled in. */}
      <PositionFormDialog
        open={dialog?.kind === 'position-new'}
        position={null}
        options={options}
        initial={dialog?.kind === 'position-new' ? { roleId: dialog.roleId, departmentId: dialog.deptId } : undefined}
        onClose={() => setDialog(null)}
        onDone={() => {
          toast.success('Position added.');
          done();
        }}
      />

      {/* Move… : the Org units page's own picker, then its confirm. */}
      <MoveToDialog
        unit={movingUnit}
        rows={pickRows}
        onClose={() => setDialog(null)}
        onPick={(parentId) => {
          if (movingUnit) setMoveAsk({ unit: movingUnit.id, to: parentId });
        }}
      />
      <MoveConfirm move={pending} onClose={() => setMoveAsk(null)} onConfirm={doMove} />
      <UndoBar
        text={undo?.text ?? null}
        onClose={() => setUndo(null)}
        onUndo={async () => {
          if (!undo) return;
          await orgApi.departments.move(undo.unitId, undo.parentId, undo.sortOrder);
          if (undo.chosen) {
            await orgApi.departments.setReporting(undo.unitId, {
              reportsInto: { mode: 'CHOSEN', positionId: undo.chosen.positionId, ...(undo.chosen.reason ? { reason: undo.chosen.reason } : {}) },
            });
          }
          forgetUnitKinds();
          if (undo.parentId != null) onOpenUnit(undo.parentId);
          onChanged();
        }}
      />

      {/* + Position: one more chair like the card's first. */}
      {dialog?.kind === 'sibling' && (
        <PositionSiblingDialog
          open
          position={dialog.position}
          options={options}
          onClose={() => setDialog(null)}
          onDone={() => {
            toast.success('Position added.');
            done();
          }}
        />
      )}

      {/* Put a person here: the move-a-person form, dated. */}
      <MoveEmployeeHereDialog
        open={dialog?.kind === 'put-person'}
        positionId={dialog?.kind === 'put-person' ? dialog.positionId : 0}
        positionLabel={dialog?.kind === 'put-person' ? dialog.label : null}
        onClose={() => setDialog(null)}
        onDone={onChanged}
        onRefused={onChanged}
      />

      {/* Move person…: the employee's "Move to another position". */}
      {dialog?.kind === 'move-person' && (
        <MoveToPositionDialog
          open
          employeeId={dialog.employeeId}
          employeeName={dialog.name}
          currentLabel={dialog.current}
          second={false}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}

      {/* Reports to…: the position page's formal reporting line. */}
      <PositionReportingDialog
        open={dialog?.kind === 'reports-to'}
        positionId={dialog?.kind === 'reports-to' ? dialog.positionId : 0}
        options={options}
        onClose={() => setDialog(null)}
        onDone={done}
      />

      <UnitReportingSheet
        unit={reportingUnit}
        canEdit={can.org.edit}
        onClose={() => setReportingUnit(null)}
        onSaved={() => { setReportingUnit(null); onChanged(); }}
      />
    </>
  );

  return { canvasEdit, ui };
}
