import { useCallback, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FormDialog,
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
import { labelFilterDefs, matchesLabel } from '../components/labels';
import { forgetUnitKinds, kindWord, nextKindDown, unitLabel } from '../components/orgUnits';
import { CodeNote } from '../components/CodeNote';
import { getDepartmentStaffing } from '../api/jobContent';
import { DepartmentStaffingPanel, JobPeekSheet, type JobPeek } from '../components/DepartmentStaffing';
import {
  ORG_STATUS_LABELS,
  ORG_STATUS_TONES,
  descendantIds,
  filterTreeBy,
  indentedLabel,
  parentPath,
  useOrgLoad,
  useTreeCollapse,
} from '../components/OrgData';
import { OrgCode, OrgTreeView } from '../components/OrgTree';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { matchesQuery, useListFilters } from '../components/list/useListFilters';
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
 * plan and which holiday calendar it belongs to. A flat table with a Parent
 * column makes the reader rebuild that in their head on every visit.
 *
 * WHO WORKS THERE (2026-10-10). An org unit's name is a button: it opens the
 * unit's roles and positions under its row — positions grouped by role,
 * with positions, filled, vacant and who is in each. Clicking a role or a position
 * opens its KRAs, responsibilities and KPIs in a side sheet, with Edit going to
 * the role's Content tab or the position's job-content editor.
 *
 * KINDS (2026-10-12, spec §9 "labels"; groups of §15 removed 2026-10-16; §33).
 * Everything is an org unit; what it is comes from its ONE label, shown as its
 * KIND (Department, Section, Machine, or the company's own words), edited in
 * the "Kinds of org unit" side sheet (LabelsSheet). Each row leads with its
 * kind ("Machine · Nord / Uflex"); the toolbar's Kind filter is `label=…`
 * (the server's rule). Whether a unit is SHARED is a separate fact with its
 * own switch, not a kind. The kinds' words are never branched on.
 *
 * THE DIALOG (§33): "What is it?" first (the kinds as chips, + add a kind),
 * then Name, Sits under and the code; its title follows the choice ("New
 * machine under Printing"). "Add under this" fills Sits under and suggests the
 * kind after the parent's, by the kinds' order.
 *
 * THE CODE IS NOT TYPED (spec §11). It is issued by Setup › Code formats when
 * the unit is created and never changes.
 */

interface DraftState {
  id: number | null;
  name: string;
  /** Shown as text on edit; never sent. */
  code: string | null;
  parentId: number | '';
  status: 'ACTIVE' | 'INACTIVE';
  /** Its ONE label ('' only while the list is still loading). */
  labelId: number | '';
  /** Its people serve other org units — one box on the org chart, pointing at what it serves. */
  isShared: boolean;
  serves: number[];
}

/**
 * A new org unit. On top: the first kind of the list ("Department" unless
 * reordered). Under a parent: the kind after the parent's (§33).
 */
const emptyDraft = (parent: Department | null, labels: DepartmentLabel[]): DraftState => ({
  id: null,
  name: '',
  code: null,
  parentId: parent?.id ?? '',
  status: 'ACTIVE',
  labelId: (parent ? nextKindDown(labels, parent.labelId)?.id : labels[0]?.id) ?? '',
  isShared: false,
  serves: [],
});

/** "3 roles · 12 positions" — what an org unit holds, on its row. */
const staffLabel = (c: { roles: number; positions: number }) =>
  `${c.roles} role${c.roles === 1 ? '' : 's'} · ${c.positions} position${c.positions === 1 ? '' : 's'}`;

export default function Departments() {
  const can = useCan();
  const { success } = useToast();
  // "+ Add a kind" inside the dialog: the text being typed (null = closed), and a refusal.
  const [newKind, setNewKind] = useState<string | null>(null);
  const [kindProblem, setKindProblem] = useState<string | null>(null);
  const [addingKind, setAddingKind] = useState(false);

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
  const labels: DepartmentLabel[] = useMemo(() => data?.labelList.labels ?? [], [data]);
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const filters = useListFilters(['label', 'shared', 'status', 'parent']);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const labelFilter = filters.values.label;
  const sharedOnly = filters.values.shared === '1';
  const statusFilter = filters.values.status;
  const underId = Number(filters.values.parent) || 0;
  const search = filters.params.q ?? '';
  // The server's rules for GET /organisation/departments: "Under" is everything
  // below the chosen unit at any depth, NOT the unit itself; the
  // search is in the name or the code.
  const matched = useMemo(() => {
    const below = underId ? descendantIds(rows, underId) : null;
    return rows.filter(
      (r) =>
        matchesLabel(labelFilter, r.labelId, labels) &&
        (!sharedOnly || !!r.isShared) &&
        (!statusFilter || r.status.toLowerCase() === statusFilter.toLowerCase()) &&
        (!below || (r.id !== underId && below.has(r.id))) &&
        matchesQuery([r.name, r.code], search),
    );
  }, [rows, labelFilter, sharedOnly, statusFilter, underId, search, labels]);
  // Every match keeps its ancestors in the tree (so the chosen unit still
  // shows as the visible ancestor of what is under it); the count is of the matches.
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
      {
        key: 'parent',
        label: 'Under',
        searchable: true,
        options: rows.map((r) => ({ value: String(r.id), label: unitLabel(r.path, r.type) })),
      },
    ],
    [labels, rows],
  );
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Department | null>(null);

  // Derived from the rows already loaded — no second request. The count line
  // under the toolbar says how many org units; these say what it does not.
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

  // On top, a new unit takes the first kind — "Department" unless the company reordered the list;
  // under a parent, the kind after the parent's.
  const openNew = (parent: Department | null) => {
    setNewKind(null);
    setKindProblem(null);
    setDraft(emptyDraft(parent, labels));
  };
  const openEdit = (row: Department) => {
    setNewKind(null);
    setKindProblem(null);
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      parentId: row.parentId ?? '',
      status: row.status,
      labelId: row.labelId ?? labels.find((l) => l.name.toLowerCase() === String(row.type ?? '').toLowerCase())?.id ?? '',
      isShared: Boolean(row.isShared),
      serves: row.serves ?? [],
    });
  };

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
      void reload();
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
      parentId: draft.parentId === '' ? null : draft.parentId,
      status: draft.status,
      ...(draft.labelId === '' ? {} : { labelId: draft.labelId }),
      isShared: draft.isShared,
      // Only a shared unit serves others; un-sharing one clears its list.
      serves: draft.isShared ? draft.serves : [],
    };
    if (draft.id) await orgApi.departments.update(draft.id, body);
    else await orgApi.departments.create(body);
    const saidKind = labels.find((l) => l.id === draft.labelId)?.name;
    const what = saidKind ? `${saidKind} “${draft.name.trim()}”` : `“${draft.name.trim()}”`;
    success(draft.id ? `${what} saved.` : `${what} added.`);
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.departments.remove(doomed.id);
    success(`${doomed.name} removed.`);
    reload();
  };

  // A branch cannot be moved inside itself; the backend refuses it, and the
  // picker should not offer it in the first place.
  const forbidden = draft?.id ? descendantIds(rows, draft.id) : new Set<number>();

  // The dialog's title follows the choice: "New machine under Printing".
  const draftKind = labels.find((l) => l.id === draft?.labelId)?.name ?? null;
  const draftParent = draft && draft.parentId !== '' ? rows.find((r) => r.id === draft.parentId) ?? null : null;
  const dialogTitle = draft?.id
    ? `Edit ${kindWord(draftKind)}`
    : `New ${kindWord(draftKind)}${draftParent ? ` under ${draftParent.name}` : ''}`;

  return (
    <>
      <PageHeader
        title="Org units"
        subtitle="Departments, sections, machines and what sits under them"
      />

      <ErrorNotice error={error} fallback="Could not load the org units." onRetry={reload} />

      {loading ? (
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
            <OrgTreeView
              rows={filtered}
              collapsed={collapsed}
              onToggle={toggle}
              ariaLabel="Org units"
              renderCode={(row) => <OrgCode code={row.code} />}
              renderPrimary={(row) => (
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
                    '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' },
                    '&:focus-visible': { outline: '2px solid var(--c-primary-500)', outlineOffset: 2, borderRadius: '4px' },
                  }}
                >
                  {row.type && (
                    <Box component="span" data-kind="" sx={{ color: 'var(--c-text-3)', fontWeight: 500 }}>
                      {row.type} ·{' '}
                    </Box>
                  )}
                  {row.name}
                </Box>
              )}
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
                  {row.childCount > 0 && (
                    <ToneBadge
                      tone="neutral"
                      noIcon
                      label={`${row.childCount} under it`}
                    />
                  )}
                  <StatusBadge
                    status={row.status}
                    map={ORG_STATUS_TONES}
                    labelMap={ORG_STATUS_LABELS}
                  />
                </>
              )}
              renderActions={
                can.org.edit || can.org.remove
                  ? (row) => (
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
                              ]
                            : undefined
                        }
                        onEdit={can.org.edit ? () => openEdit(row) : undefined}
                        onRemove={can.org.remove ? () => setDoomed(row) : undefined}
                      />
                    )
                  : undefined
              }
            />
          )}
        </>
      )}

      {!loading && unplaced && unplaced.counts.positions > 0 && (
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

      <FormDialog
        open={!!draft}
        title={dialogTitle}
        subtitle={
          draft?.id
            ? 'Change what it is, its name or what it sits under.'
            : 'Choose what it is, name it, and say what it sits under.'
        }
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim() || (labels.length > 0 && draft?.labelId === '') || newKind !== null}
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
                      color={on ? 'primary' : 'default'}
                      variant={on ? 'filled' : 'outlined'}
                      aria-pressed={on}
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
                setDraft({ ...draft, parentId: e.target.value === '' ? '' : Number(e.target.value) })
              }
              fullWidth
              size="small"
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              helperText={draft.id ? 'Moving it moves everything under it.' : undefined}
            >
              <MenuItem value="">
                <em>Nothing — the top level</em>
              </MenuItem>
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
