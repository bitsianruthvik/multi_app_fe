import { useCallback, useMemo, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import DriveFileMoveRounded from '@mui/icons-material/DriveFileMoveRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  ListSkeleton,
  PageHeader,
  StatStrip,
  StatSkeleton,
  StatusBadge,
  ToneBadge,
  useToast,
  type Stat,
} from '@shared/ui';
import { useCompanySlug } from '@shared/ui';
import { useCan } from '../access/can';
import { orgApi, type Department, type DepartmentLabel } from '../api/organisation';
import { LabelsSheet } from '../components/LabelsSheet';
import { kindChipSx, kindColourOf, labelFilterDefs, matchesLabel } from '../components/labels';
import { forgetUnitKinds, kindWord, orgUnitOptions, unitLabel } from '../components/orgUnits';
import { getDepartmentStaffing } from '../api/jobContent';
import { DepartmentStaffingPanel, JobPeekSheet, type JobPeek } from '../components/DepartmentStaffing';
import {
  ORG_STATUS_LABELS,
  ORG_STATUS_TONES,
  descendantIds,
  filterTreeBy,
  parentPath,
  useOrgLoad,
  useTreeCollapse,
} from '../components/OrgData';
import { OrgCode } from '../components/OrgTree';
import { OrgUnitTree, type UnitDrop } from '../components/OrgUnitTree';
import { OrgUnitDialog } from '../components/OrgUnitDialog';
import { MoveConfirm, MoveToDialog, UndoBar, type PendingMove } from '../components/OrgUnitMove';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { matchesQuery, multiValues, useListFilters } from '../components/list/useListFilters';
import { RowActions } from '../components/list/RowActions';
import { ExcelButtons } from '../components/excel/ExcelButtons';

/**
 * Org units — departments, sections, machines and what sits under them, as a
 * tree (DESIGN_SYSTEM.md §4.7). The page was "Departments" until spec §33
 * (2026-10-24): people confused a department, a section and a machine when all
 * three were called "department". The tables and the API still say department.
 *
 * Hierarchical because the parent carries the meaning: "Printing" on its own
 * says almost nothing, "Production › Printing" says which JD, which manpower
 * plan and which holiday calendar it belongs to.
 *
 * WHO WORKS THERE (2026-10-10). An org unit's name is a button: it opens the
 * unit's roles and positions under its row. Clicking a role or a position
 * opens its KRAs, responsibilities and KPIs in a side sheet.
 *
 * KINDS (spec §9, §15, §33, §34.1). Every unit has ONE kind (Department,
 * Section, Machine, or the company's own words), edited in the "Kinds of org
 * unit" side sheet, each with a COLOUR: the kind chip leading each row, the
 * Kind filter's chips and the org chart use it. The words are never branched on.
 *
 * ORDER, MOVES AND ADDING (spec §34). Siblings show in their stored order
 * (then code), never by name. Drag a row's handle onto another unit to put it
 * under that unit, or onto the top / bottom edge of a row to put it before /
 * after it among its siblings; a move to another parent asks first ("Move
 * Lamination (Section) from Production to Operations — 6 positions and 2
 * units under it move with it"), a reorder does not; both offer Undo. "Move
 * to…" in the row menu is the keyboard and touch way. A "+" on each row adds a
 * unit under it (the next kind down suggested); a "+" in the gap above a row
 * adds a sibling at that place; "+ New org unit" defaults to the first top
 * unit, and the top level is an explicit choice with its own confirm line
 * (OrgUnitDialog). Dragging is off while the list is filtered.
 *
 * THE CODE IS NOT TYPED (spec §11). It is issued by Setup › Code formats when
 * the unit is created and never changes.
 */

/** "3 roles · 12 positions" — what an org unit holds, on its row. */
const staffLabel = (c: { roles: number; positions: number }) =>
  `${c.roles} role${c.roles === 1 ? '' : 's'} · ${c.positions} position${c.positions === 1 ? '' : 's'}`;

/** The dialog: a unit to edit, or where a new one goes. */
interface DialogState {
  unit: Department | null;
  parentId: number | null;
  sortOrder: number | null;
  atTop: boolean;
}

export default function Departments() {
  const can = useCan();
  const { success, error: toastError } = useToast();

  const company = useCompanySlug();
  const load = useCallback(
    () =>
      Promise.all([orgApi.departments.listWithTypes(), getDepartmentStaffing(), orgApi.departmentLabels.read()]).then(
        ([tree, staffing, labelList]) => ({ ...tree, staffing, labelList }),
      ),
    [],
  );
  const { data, error, loading, reload: reloadData } = useOrgLoad(load);
  // Every other screen shows "Name (Kind)" from one shared read: refresh it too.
  const reload = useCallback(() => {
    forgetUnitKinds();
    return reloadData();
  }, [reloadData]);
  const staffingOf = useMemo(
    () => new Map((data?.staffing.departments ?? []).map((d) => [d.departmentId ?? 0, d])),
    [data],
  );
  // The org unit whose roles and positions are open, and the job being peeked at.
  const [openId, setOpenId] = useState<number | null>(null);
  const [peek, setPeek] = useState<JobPeek | null>(null);
  const unplaced = staffingOf.get(0) ?? null;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const labels: DepartmentLabel[] = useMemo(() => data?.labelList.labels ?? [], [data]);
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const filters = useListFilters(['label', 'shared', 'status', 'parent']);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const labelFilter = filters.values.label;
  const sharedOnly = filters.values.shared === '1';
  const statusFilter = filters.values.status;
  const underIds = useMemo(() => multiValues(filters.values.parent).map(Number).filter((n) => n > 0), [filters.values.parent]);
  const search = filters.params.q ?? '';
  // The server's rules for GET /organisation/departments: "Under" is everything
  // below ANY of the chosen units at any depth, NOT the unit itself (spec §34.2:
  // one or more); the search is in the name or the code.
  const matched = useMemo(() => {
    const below = underIds.map((id) => ({ id, set: descendantIds(rows, id) }));
    return rows.filter(
      (r) =>
        matchesLabel(labelFilter, r.labelId, labels) &&
        (!sharedOnly || !!r.isShared) &&
        (!statusFilter || r.status.toLowerCase() === statusFilter.toLowerCase()) &&
        (!below.length || below.some((b) => b.id !== r.id && b.set.has(r.id))) &&
        matchesQuery([r.name, r.code], search),
    );
  }, [rows, labelFilter, sharedOnly, statusFilter, underIds, search, labels]);
  // Every match keeps its ancestors in the tree; the count is of the matches.
  const filtered = useMemo(() => {
    const ids = new Set(matched.map((r) => r.id));
    return filterTreeBy(rows, (r) => ids.has(r.id));
  }, [rows, matched]);
  const filterDefs: FilterDef[] = useMemo(
    () => [
      ...labelFilterDefs(labels, { withCounts: true, label: 'Kind' }),
      { key: 'shared', label: 'Shared', kind: 'toggle' },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'ACTIVE', label: 'Active' },
          { value: 'INACTIVE', label: 'Inactive' },
        ],
      },
      { key: 'parent', label: 'Under', searchable: true, multiple: true, options: orgUnitOptions(rows, labels) },
    ],
    [labels, rows],
  );
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [doomed, setDoomed] = useState<Department | null>(null);
  const [moveTo, setMoveTo] = useState<Department | null>(null);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [undo, setUndo] = useState<{ text: string; run: () => Promise<void> } | null>(null);

  const stats: Stat[] = useMemo(() => {
    const roots = rows.filter((r) => r.depth === 0).length;
    const totals = data?.staffing.counts;
    return [
      ...(totals
        ? [
            {
              label: 'Positions',
              value: totals.positions,
              hint: `${totals.filled} filled, ${totals.vacant} vacant across ${totals.positions} positions — the same count the org chart shows.`,
            },
          ]
        : []),
      {
        label: 'Top level',
        value: roots,
        hint: 'Org units that sit under nothing. More than a handful usually means a level is missing.',
      },
    ];
  }, [rows, data]);

  const openNew = (parent: Department | null) => setDialog({ unit: null, parentId: parent?.id ?? null, sortOrder: null, atTop: false });
  // "+" in the gap above a row: a sibling at that row's place.
  const openBefore = (row: Department) =>
    setDialog({ unit: null, parentId: row.parentId ?? null, sortOrder: row.sortOrder || null, atTop: row.parentId == null });
  const openEdit = (row: Department) => setDialog({ unit: row, parentId: null, sortOrder: null, atTop: false });

  const remove = async () => {
    if (!doomed) return;
    await orgApi.departments.remove(doomed.id);
    success(`${doomed.name} removed.`);
    reload();
  };

  /** The siblings of a parent (null = the top level), in the order the list shows them. */
  const siblingsOf = useCallback((parentId: number | null) => rows.filter((r) => (r.parentId ?? null) === parentId), [rows]);

  // A move to another parent, confirmed (MoveConfirm). Undo puts it back at its old place.
  const doMove = async (m: PendingMove) => {
    const unit = byId.get(m.unitId);
    if (!unit) return;
    const old = { parentId: unit.parentId ?? null, sortOrder: unit.sortOrder || undefined };
    await orgApi.departments.move(m.unitId, m.parentId, m.sortOrder);
    const to = m.parentId != null ? nameOf.get(m.parentId) : null;
    await reload();
    setUndo({
      text: `${unit.name} moved ${to ? `under ${to}` : 'to the top level'}.`,
      run: async () => {
        try {
          await orgApi.departments.move(unit.id, old.parentId, old.sortOrder);
          success(`${unit.name} is back where it was.`);
        } catch (e) {
          toastError((e as Error)?.message || 'It could not be moved back.');
        }
        await reload();
      },
    });
  };

  // A drop from the tree: onto a unit = under it (asks first); between siblings = a reorder (no question, Undo).
  const onDrop = async ({ unitId, targetId, zone }: UnitDrop) => {
    const unit = byId.get(unitId);
    const target = byId.get(targetId);
    if (!unit || !target) return;
    if (zone === 'inside') {
      if (target.id === unit.parentId) return;
      setPending({ unitId, parentId: target.id });
      return;
    }
    const parentId = target.parentId ?? null;
    if (parentId === (unit.parentId ?? null)) {
      const before = siblingsOf(parentId).map((r) => r.id);
      const ids = before.filter((id) => id !== unitId);
      ids.splice(ids.indexOf(targetId) + (zone === 'after' ? 1 : 0), 0, unitId);
      if (ids.join() === before.join()) return;
      try {
        await orgApi.departments.reorder(parentId, ids);
      } catch (e) {
        toastError((e as Error)?.message || 'The order could not be saved.');
        return;
      }
      await reload();
      setUndo({
        text: `${unit.name} moved ${zone} ${target.name}.`,
        run: async () => {
          try { await orgApi.departments.reorder(parentId, before); } catch (e) { toastError((e as Error)?.message || 'The old order could not be put back.'); }
          await reload();
        },
      });
      return;
    }
    // Between two units of ANOTHER parent: a move to that parent, at that place.
    const place = (target.sortOrder || 0) + (zone === 'after' ? 1 : 0);
    setPending({ unitId, parentId, sortOrder: place > 0 ? place : undefined });
  };

  const draggable = can.org.edit && !filters.isFiltered;

  return (
    <>
      <PageHeader
        title="Org units"
        subtitle="Departments, sections, machines and what sits under them"
      />

      <ErrorNotice error={error} fallback="Could not load the org units." onRetry={reload} />

      {loading && !data ? (
        <>
          <StatSkeleton count={4} />
          <Box sx={{ mt: 2 }}>
            <ListSkeleton rows={6} />
          </Box>
        </>
      ) : (
        <>
          <StatStrip stats={stats} />
          <Box sx={{ mt: 2 }}>
            <ListToolbar
              filters={filters}
              defs={filterDefs}
              shown={matched.length}
              total={rows.length}
              noun={['org unit', 'org units']}
              searchPlaceholder="Search org units by name or code"
              add={can.org.edit ? { label: 'New org unit', onClick: () => openNew(null) } : undefined}
              excel={
                <ExcelButtons
                  entity="departments"
                  noun={['org unit', 'org units']}
                  filters={filters.params}
                  count={matched.length}
                  canDownload={can.org.view}
                  canUpload={can.org.upload}
                  onApplied={reload}
                />
              }
              extra={
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<LabelOutlined />}
                    onClick={() => setLabelsOpen(true)}
                    sx={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    Kinds
                  </Button>
                  {rows.length > 0 && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={anyCollapsed ? <UnfoldMoreRounded /> : <UnfoldLessRounded />}
                      onClick={anyCollapsed ? expandAll : collapseAll}
                      sx={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
                    >
                      {anyCollapsed ? 'Expand all' : 'Collapse all'}
                    </Button>
                  )}
                </>
              }
            />
          </Box>

          {can.org.edit && rows.length > 1 && (
            <Typography data-drag-hint="" sx={{ fontSize: 12.5, color: 'var(--c-text-3)', mt: -1, mb: 1, px: 0.5 }}>
              {draggable
                ? 'Drag a unit by its handle onto another to put it under it, or between two units to change the order. On a phone: press and hold, or use “Move to…”.'
                : 'Clear the filters to drag units around; “Move to…” in a row’s menu works now.'}
            </Typography>
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={<AccountTreeRounded />}
              title="No org units yet"
              hint="An org unit is any part of the structure — a department such as Production, a section, a machine. Nest the specific ones under the broad ones, so a role can name the deepest that is true."
              action={
                can.org.edit ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                    Add the first org unit
                  </Button>
                ) : undefined
              }
            />
          ) : matched.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              hint="Search covers the name and the code."
              action={<Button onClick={filters.clear}>Clear the filters</Button>}
            />
          ) : (
            <OrgUnitTree
              rows={filtered}
              allRows={rows}
              collapsed={collapsed}
              onToggle={toggle}
              draggable={draggable}
              onDrop={(d) => void onDrop(d)}
              onAddBefore={can.org.edit ? openBefore : undefined}
              renderCode={(row) => <OrgCode code={row.code} />}
              renderPrimary={(row) => {
                const colour = kindColourOf(labels, row.labelId);
                return (
                  <Box
                    component="button"
                    type="button"
                    aria-expanded={openId === row.id}
                    title={`Show the roles and positions in this ${kindWord(row.type)}`}
                    onClick={() => setOpenId((id) => (id === row.id ? null : row.id))}
                    sx={{
                      border: 0,
                      background: 'none',
                      p: 0,
                      font: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'left',
                      maxWidth: '100%',
                      '&:hover .ou-name': { color: 'var(--c-primary-700)', textDecoration: 'underline' },
                      '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 2, borderRadius: '4px' },
                    }}
                  >
                    {row.type && (
                      <Box
                        component="span"
                        data-kind=""
                        sx={{
                          display: 'inline-block',
                          fontSize: 11.5,
                          fontWeight: 600,
                          lineHeight: '18px',
                          px: 0.75,
                          mr: 0.75,
                          borderRadius: '6px',
                          border: '1px solid var(--c-border)',
                          color: 'var(--c-text-2)',
                          verticalAlign: 'middle',
                          ...kindChipSx(colour),
                        }}
                      >
                        {row.type}
                      </Box>
                    )}
                    <Box component="span" className="ou-name" sx={{ verticalAlign: 'middle' }}>{row.name}</Box>
                  </Box>
                );
              }}
              renderBelow={(row) =>
                openId === row.id ? (
                  <DepartmentStaffingPanel
                    name={row.name}
                    staffing={staffingOf.get(row.id) ?? null}
                    hasChildren={row.childCount > 0}
                    onPeek={setPeek}
                    onRemoved={() => void reload()}
                  />
                ) : null
              }
              renderSecondary={(row) => {
                const served = (row.serves ?? []).map((id) => nameOf.get(id)).filter(Boolean);
                return [parentPath(row), served.length ? `serves ${served.join(', ')}` : null]
                  .filter(Boolean)
                  .join(' · ');
              }}
              renderTrailing={(row) => (
                <>
                  {staffingOf.get(row.id) && <ToneBadge tone="neutral" noIcon label={staffLabel(staffingOf.get(row.id)!.counts)} />}
                  {row.isShared && <ToneBadge tone="info" noIcon label="Shared" />}
                  {row.childCount > 0 && <ToneBadge tone="neutral" noIcon label={`${row.childCount} under it`} />}
                  <StatusBadge status={row.status} map={ORG_STATUS_TONES} labelMap={ORG_STATUS_LABELS} />
                </>
              )}
              renderActions={
                can.org.edit || can.org.remove
                  ? (row) => (
                      <>
                        {can.org.edit && (
                          <Tooltip title={`Add under ${row.name}`}>
                            <IconButton
                              size="small"
                              aria-label={`Add an org unit under ${row.name}`}
                              data-add-under={row.id}
                              onClick={() => openNew(row)}
                              sx={{ color: 'var(--c-primary-700)' }}
                            >
                              <AddRounded fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <RowActions
                          name={row.name}
                          more={
                            can.org.edit
                              ? [
                                  {
                                    key: 'add-under',
                                    label: 'Add under this',
                                    icon: <SubdirectoryArrowRightRounded fontSize="small" />,
                                    onClick: () => openNew(row),
                                  },
                                  {
                                    key: 'move-to',
                                    label: 'Move to…',
                                    icon: <DriveFileMoveRounded fontSize="small" />,
                                    onClick: () => setMoveTo(row),
                                  },
                                ]
                              : undefined
                          }
                          onEdit={can.org.edit ? () => openEdit(row) : undefined}
                          onRemove={can.org.remove ? () => setDoomed(row) : undefined}
                        />
                      </>
                    )
                  : undefined
              }
            />
          )}
        </>
      )}

      {data && unplaced && unplaced.counts.positions > 0 && (
        <Box sx={{ mt: 2 }}>
          <Button
            size="small"
            aria-expanded={openId === 0}
            onClick={() => setOpenId((id) => (id === 0 ? null : 0))}
            sx={{ textTransform: 'none' }}
          >
            {unplaced.counts.positions} position{unplaced.counts.positions === 1 ? ' is' : 's are'} not in any org unit
          </Button>
          {openId === 0 && (
            <DepartmentStaffingPanel name="no org unit" staffing={unplaced} hasChildren={false} onPeek={setPeek} onRemoved={() => void reload()} />
          )}
        </Box>
      )}

      <JobPeekSheet
        peek={peek}
        company={company}
        onClose={() => setPeek(null)}
        onChanged={(shift) => {
          setPeek((p) => (p ? { ...p, shift } : p));
          void reload();
        }}
      />

      <OrgUnitDialog
        open={!!dialog}
        unit={dialog?.unit ?? null}
        parentId={dialog?.parentId ?? null}
        sortOrder={dialog?.sortOrder ?? null}
        atTop={dialog?.atTop ?? false}
        rows={rows}
        labels={labels}
        onClose={() => setDialog(null)}
        onSaved={() => void reload()}
      />

      <MoveToDialog
        unit={moveTo}
        rows={rows}
        onClose={() => setMoveTo(null)}
        onPick={(parentId) => { if (moveTo) setPending({ unitId: moveTo.id, parentId }); }}
      />
      <MoveConfirm move={pending} onClose={() => setPending(null)} onConfirm={doMove} />
      <UndoBar text={undo?.text ?? null} onUndo={() => undo?.run()} onClose={() => setUndo(null)} />

      <LabelsSheet
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        labels={labels}
        shifts={data?.labelList.shifts ?? []}
        canEdit={can.org.edit}
        canRemove={can.org.remove}
        onChanged={reload}
      />

      <ConfirmDialog
        open={!!doomed}
        danger
        title={`Remove this ${kindWord(doomed?.type)}?`}
        entityName={doomed ? unitLabel(doomed.path, doomed.type) : undefined}
        body="Anything already pointing at it — a role, a position, an org unit under it — will block the removal and say so. Set it inactive instead if you only want it out of the pickers."
        confirmLabel="Remove"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
