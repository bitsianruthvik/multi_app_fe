import { useCallback, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
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
import { orgApi, type Department, type LabelGroup } from '../api/organisation';
import { LabelGroupsSheet } from '../components/LabelGroupsSheet';
import { LabelChips } from '../components/LabelChips';
import { labelFilterDefs, matchesLabels } from '../components/labelGroups';
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
 * Departments — the functional units, as a tree (DESIGN_SYSTEM.md §4.7).
 *
 * Hierarchical because the parent carries the meaning: "Printing" on its own
 * says almost nothing, "Production › Printing" says which JD, which manpower
 * plan and which holiday calendar it belongs to. A flat table with a Parent
 * column makes the reader rebuild that in their head on every visit.
 *
 * WHO WORKS THERE (2026-10-10). A department's name is a button: it opens the
 * department's roles and positions under its row — positions grouped by role,
 * with positions, filled, vacant and who is in each. Clicking a role or a position
 * opens its KRAs, responsibilities and KPIs in a side sheet, with Edit going to
 * the role's Content tab or the position's job-content editor.
 *
 * LABELS (2026-10-12, spec §9; in groups since §15). Everything is a
 * department; what it is comes from LABELS in named groups — Kind (Department,
 * Section, Machine) and the company's own ("Unit", "Area"), one label per group,
 * edited in the "Labels" side sheet (LabelGroupsSheet). Each row shows its
 * labels as chips; the toolbar filters by each group (`label=…`, the server's
 * rule). Whether a department is SHARED is a separate fact with its own switch,
 * not a label. The labels' words are never branched on.
 *
 * THE CODE IS NOT TYPED (spec §11). It is issued by Setup › Code formats when
 * the department is created and never changes.
 */

interface DraftState {
  id: number | null;
  name: string;
  /** Shown as text on edit; never sent. */
  code: string | null;
  parentId: number | '';
  status: 'ACTIVE' | 'INACTIVE';
  /** Its label in each group: groupId -> labelId ('' = none). Kind is one of them. */
  labels: Record<number, number | ''>;
  /** Its people serve other departments — one box on the org chart, pointing at what it serves. */
  isShared: boolean;
  serves: number[];
}

/** A new department: the first label of every required group (Kind: "Department" unless reordered), nothing in the others. */
const emptyDraft = (parentId: number | null, groups: LabelGroup[]): DraftState => ({
  id: null,
  name: '',
  code: null,
  parentId: parentId ?? '',
  status: 'ACTIVE',
  labels: Object.fromEntries(groups.map((g) => [g.id, (g.isKind || g.isRequired) && g.labels[0] ? g.labels[0].id : ''])),
  isShared: false,
  serves: [],
});

/** "3 roles · 12 positions" — what a department holds, on its row. */
const staffLabel = (c: { roles: number; positions: number }) =>
  `${c.roles} role${c.roles === 1 ? '' : 's'} · ${c.positions} position${c.positions === 1 ? '' : 's'}`;

export default function Departments() {
  const can = useCan();
  const { success } = useToast();

  const company = useCompanySlug();
  const load = useCallback(
    () =>
      Promise.all([orgApi.departments.listWithTypes(), getDepartmentStaffing(), orgApi.labelGroups.list()]).then(
        ([tree, staffing, groups]) => ({ ...tree, staffing, groups }),
      ),
    [],
  );
  const { data, error, loading, reload } = useOrgLoad(load);
  const staffingOf = useMemo(
    () => new Map((data?.staffing.departments ?? []).map((d) => [d.departmentId ?? 0, d])),
    [data],
  );
  // The department whose roles and positions are open, and the job being peeked at.
  const [openId, setOpenId] = useState<number | null>(null);
  const [peek, setPeek] = useState<JobPeek | null>(null);
  const unplaced = staffingOf.get(0) ?? null;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const groups: LabelGroup[] = useMemo(() => data?.groups ?? [], [data]);
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const filters = useListFilters(['label', 'shared', 'status', 'parent']);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const labelFilter = filters.values.label;
  const sharedOnly = filters.values.shared === '1';
  const statusFilter = filters.values.status;
  const underId = Number(filters.values.parent) || 0;
  const search = filters.params.q ?? '';
  // The server's rules for GET /organisation/departments: "Under" is everything
  // below the chosen department at any depth, NOT the department itself; the
  // search is in the name or the code.
  const matched = useMemo(() => {
    const below = underId ? descendantIds(rows, underId) : null;
    return rows.filter(
      (r) =>
        matchesLabels(labelFilter, r.labels, groups) &&
        (!sharedOnly || !!r.isShared) &&
        (!statusFilter || r.status.toLowerCase() === statusFilter.toLowerCase()) &&
        (!below || (r.id !== underId && below.has(r.id))) &&
        matchesQuery([r.name, r.code], search),
    );
  }, [rows, labelFilter, sharedOnly, statusFilter, underId, search, groups]);
  // Every match keeps its ancestors in the tree (so the chosen department still
  // shows as the visible ancestor of what is under it); the count is of the matches.
  const filtered = useMemo(() => {
    const ids = new Set(matched.map((r) => r.id));
    return filterTreeBy(rows, (r) => ids.has(r.id));
  }, [rows, matched]);
  const filterDefs: FilterDef[] = useMemo(
    () => [
      // One filter per label group, all in the one `label` param (groups "and", labels of a group "or").
      ...labelFilterDefs(groups, { withCounts: true }),
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
        options: rows.map((r) => ({ value: String(r.id), label: r.path })),
      },
    ],
    [groups, rows],
  );
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Department | null>(null);

  // Derived from the rows already loaded — no second request. The count line
  // under the toolbar says how many departments; these say what it does not.
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
        hint: 'Departments with no parent. More than a handful usually means a level is missing.',
      },
    ];
  }, [rows, data]);

  // A new department takes the first label of Kind — "Department" unless the company reordered it.
  const openNew = (parentId: number | null) => setDraft(emptyDraft(parentId, groups));
  const openEdit = (row: Department) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      parentId: row.parentId ?? '',
      status: row.status,
      labels: Object.fromEntries(groups.map((g) => [g.id, row.labels?.find((l) => l.groupId === g.id)?.labelId ?? ''])),
      isShared: Boolean(row.isShared),
      serves: row.serves ?? [],
    });

  const save = async () => {
    if (!draft) return;
    // No code: the server issues it on create and never changes it.
    const body = {
      name: draft.name,
      parentId: draft.parentId === '' ? null : draft.parentId,
      status: draft.status,
      // Every group, Kind included; '' = no label in an optional group.
      labels: Object.fromEntries(Object.entries(draft.labels).map(([g, l]) => [g, l === '' ? null : l])),
      isShared: draft.isShared,
      // Only a shared department serves others; un-sharing one clears its list.
      serves: draft.isShared ? draft.serves : [],
    };
    if (draft.id) await orgApi.departments.update(draft.id, body);
    else await orgApi.departments.create(body);
    success(draft.id ? 'Department saved.' : 'Department added.');
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

  return (
    <>
      <PageHeader
        title="Departments"
        subtitle="The functional units — and what sits under them"
      />

      <ErrorNotice error={error} fallback="Could not load departments." onRetry={reload} />

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
              noun={['department', 'departments']}
              searchPlaceholder="Search departments by name or code"
              add={can.org.edit ? { label: 'New department', onClick: () => openNew(null) } : undefined}
              excel={
                <ExcelButtons
                  entity="departments"
                  noun={['department', 'departments']}
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
                    Labels
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
              title="No departments yet"
              hint="A department is a functional unit — Production, Quality, Accounts. Nest the specific ones under the broad ones, so a role can name the deepest that is true."
              action={
                can.org.edit ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                    Add the first department
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
              ariaLabel="Departments"
              renderCode={(row) => <OrgCode code={row.code} />}
              renderPrimary={(row) => (
                <Box
                  component="button"
                  type="button"
                  aria-expanded={openId === row.id}
                  title="Show the roles and positions in this department"
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
                  <LabelChips labels={row.labels} />
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
                                  onClick: () => openNew(row.id),
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
            {unplaced.counts.positions} position{unplaced.counts.positions === 1 ? ' is' : 's are'} not in any department
          </Button>
          {openId === 0 && (
            <DepartmentStaffingPanel name="no department" staffing={unplaced} hasChildren={false} onPeek={setPeek} onRemoved={() => void reload()} />
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
        title={draft?.id ? 'Edit department' : 'New department'}
        subtitle={
          draft?.id
            ? 'Moving a department moves everything under it.'
            : 'Leave the parent blank for a top-level department.'
        }
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim() || groups.some((g) => (g.isKind || g.isRequired) && g.labels.length > 0 && draft?.labels[g.id] === '')}
      >
        {draft && (
          <>
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              autoFocus
              fullWidth
              size="small"
            />
            {/* The code is never typed (spec §11): issued on create, fixed afterwards. */}
            <CodeNote code={draft.code} isNew={!draft.id} />
            <TextField
              select
              label="Parent department"
              value={draft.parentId}
              onChange={(e) =>
                setDraft({ ...draft, parentId: e.target.value === '' ? '' : Number(e.target.value) })
              }
              fullWidth
              size="small"
            >
              <MenuItem value="">
                <em>None — top level</em>
              </MenuItem>
              {rows
                .filter((r) => !forbidden.has(r.id))
                .map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {indentedLabel(r.depth, r.name)}
                  </MenuItem>
                ))}
            </TextField>
            {/* One drop-down per label group, in group order (spec §15.4). */}
            {groups.map((g) => {
              const required = g.isKind || g.isRequired;
              const value = draft.labels[g.id] ?? '';
              return (
                <TextField
                  key={g.id}
                  select
                  label={g.name}
                  required={required}
                  value={g.labels.some((l) => l.id === value) ? value : ''}
                  onChange={(e) => setDraft({ ...draft, labels: { ...draft.labels, [g.id]: e.target.value === '' ? '' : Number(e.target.value) } })}
                  fullWidth
                  size="small"
                  slotProps={{ select: { displayEmpty: !required }, inputLabel: { shrink: true } }}
                  helperText={
                    g.isKind
                      ? 'What kind of department this is. It is shown on its box on the org chart. The lists are yours: change them with the Labels button.'
                      : g.labels.length === 0
                        ? `The group ${g.name} has no labels yet — add them with the Labels button.`
                        : undefined
                  }
                >
                  {!required && (
                    <MenuItem value="">
                      <em>None</em>
                    </MenuItem>
                  )}
                  {g.labels.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.name}
                    </MenuItem>
                  ))}
                </TextField>
              );
            })}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={draft.isShared}
                    onChange={(e) => setDraft({ ...draft, isShared: e.target.checked })}
                  />
                }
                label={<Typography sx={{ fontSize: 14 }}>Shared — serves other departments</Typography>}
              />
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.25 }}>
                Its people work for several departments. The org chart draws it as one box with an
                arrow to each department it serves. This is separate from the label.
              </Typography>
            </Box>
            {draft.isShared && (
              <Autocomplete
                multiple
                size="small"
                options={rows.filter((r) => r.id !== draft.id)}
                value={rows.filter((r) => draft.serves.includes(r.id))}
                onChange={(_, v) => setDraft({ ...draft, serves: v.map((r) => r.id) })}
                getOptionLabel={(r) => r.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderOption={(props, r) => {
                  const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
                  return (
                    <li key={key} {...rest}>
                      {indentedLabel(r.depth, r.name)}
                    </li>
                  );
                }}
                renderInput={(p) => (
                  <TextField
                    {...p}
                    label="Serves"
                    placeholder={draft.serves.length ? '' : 'Pick the departments its people work for'}
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

      <LabelGroupsSheet
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        groups={groups}
        canEdit={can.org.edit}
        canRemove={can.org.remove}
        onChanged={reload}
      />

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Remove this department?"
        entityName={doomed?.path}
        body="Anything already pointing at it — a role, a position, a sub-department — will block the removal and say so. Set it inactive instead if you only want it out of the pickers."
        confirmLabel="Remove"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
