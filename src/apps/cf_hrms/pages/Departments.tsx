import { useCallback, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import LabelOutlined from '@mui/icons-material/LabelOutlined';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FacetChip,
  FilterBar,
  FormDialog,
  ListSkeleton,
  PageHeader,
  SideSheet,
  StatStrip,
  StatSkeleton,
  StatusBadge,
  ToneBadge,
  useIsPermitted,
  useToast,
  type Stat,
} from '@shared/ui';
import { useCompanySlug } from '@shared/ui';
import { orgApi, ORG_MANAGE, type Department, type DepartmentLabel } from '../api/organisation';
import { EditableList } from '../components/EditableList';
import { CodeNote } from '../components/CodeNote';
import { getDepartmentStaffing } from '../api/jobContent';
import { DepartmentStaffingPanel, JobPeekSheet, type JobPeek } from '../components/DepartmentStaffing';
import {
  ORG_STATUS_LABELS,
  ORG_STATUS_TONES,
  descendantIds,
  filterTree,
  indentedLabel,
  parentPath,
  useOrgLoad,
  useTreeCollapse,
} from '../components/OrgData';
import { OrgCode, OrgTreeView } from '../components/OrgTree';

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
 * LABELS (2026-10-12, spec §9). Everything is a department; what kind it is —
 * Department, Section, Machine — is a LABEL from the company's own short list,
 * edited in the "Labels" side sheet with the inline `EditableList`. Whether a
 * department is SHARED (its people serve other departments) is a separate fact
 * with its own switch, not a label. The label's words are never branched on.
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
  /** One of the company's labels, by name. */
  type: string;
  /** Its people serve other departments — one box on the org chart, pointing at what it serves. */
  isShared: boolean;
  serves: number[];
}

const emptyDraft = (parentId: number | null, label: string): DraftState => ({
  id: null,
  name: '',
  code: null,
  parentId: parentId ?? '',
  status: 'ACTIVE',
  type: label,
  isShared: false,
  serves: [],
});

/** "3 roles · 12 positions" — what a department holds, on its row. */
const staffLabel = (c: { roles: number; positions: number }) =>
  `${c.roles} role${c.roles === 1 ? '' : 's'} · ${c.positions} position${c.positions === 1 ? '' : 's'}`;

export default function Departments() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const company = useCompanySlug();
  const load = useCallback(
    () =>
      Promise.all([orgApi.departments.listWithTypes(), getDepartmentStaffing(), orgApi.departmentLabels.list()]).then(
        ([tree, staffing, labels]) => ({ ...tree, staffing, labels }),
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
  const labels: DepartmentLabel[] = useMemo(() => data?.labels ?? [], [data]);
  const labelItems = useMemo(() => labels.map((l) => ({ id: l.id, name: l.name, count: l.departmentCount })), [labels]);
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const [query, setQuery] = useState('');
  /** The label the list is narrowed to, by name; '' = every label. */
  const [labelFilter, setLabelFilter] = useState('');
  const [labelsOpen, setLabelsOpen] = useState(false);
  const filtered = useMemo(() => {
    // A label that was renamed or removed while it was the filter stops filtering.
    const want = labels.some((l) => l.name === labelFilter) ? labelFilter : '';
    let pool = rows;
    if (want) {
      // The departments with that label, plus the ones above them so the tree still reads.
      const keep = new Set<number>();
      const above: number[] = [];
      for (const r of rows) {
        above.length = r.depth;
        if (r.type === want) {
          keep.add(r.id);
          for (const id of above) keep.add(id);
        }
        above[r.depth] = r.id;
      }
      pool = rows.filter((r) => keep.has(r.id));
    }
    return filterTree(pool, query, (r) => `${r.name} ${r.code ?? ''} ${r.path} ${r.type ?? ''}`);
  }, [rows, query, labelFilter, labels]);
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Department | null>(null);

  // Derived from the rows already loaded — no second request, and the numbers
  // always agree with the list beneath (§4.2). Each names something fixable
  // rather than restating the row count.
  const stats: Stat[] = useMemo(() => {
    const inactive = rows.filter((r) => r.status === 'INACTIVE').length;
    const roots = rows.filter((r) => r.depth === 0).length;
    const totals = data?.staffing.counts;
    return [
      { label: 'Departments', value: rows.length },
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
      {
        label: 'Inactive',
        value: inactive,
        tone: 'warning',
        hint: 'Kept for history; hidden from new pickers.',
      },
    ];
  }, [rows, data]);

  // A new department takes the first label of the list — "Department" unless the company reordered it.
  const openNew = (parentId: number | null) => setDraft(emptyDraft(parentId, labels[0]?.name ?? ''));
  const openEdit = (row: Department) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      parentId: row.parentId ?? '',
      status: row.status,
      type: row.type ?? '',
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
      type: draft.type || null,
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
    success(`${doomed.name} deleted.`);
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
        actions={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" startIcon={<LabelOutlined />} onClick={() => setLabelsOpen(true)}>
              Labels
            </Button>
            {rows.length > 0 && (
              <Button
                size="small"
                variant="outlined"
                startIcon={anyCollapsed ? <UnfoldMoreRounded /> : <UnfoldLessRounded />}
                onClick={anyCollapsed ? expandAll : collapseAll}
              >
                {anyCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            )}
            {canManage && (
              <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                New department
              </Button>
            )}
          </Box>
        }
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
          <Box sx={{ mt: 2, mb: 2 }}>
            <FilterBar
              search={query}
              onSearch={setQuery}
              placeholder="Search departments by name, code or label"
            >
              {labels.length > 0 && (
                <>
                  <FacetChip label="All" active={!labelFilter} onClick={() => setLabelFilter('')} />
                  {labels.map((l) => (
                    <FacetChip
                      key={l.id}
                      label={l.name}
                      count={l.departmentCount}
                      active={labelFilter === l.name}
                      onClick={() => setLabelFilter((cur) => (cur === l.name ? '' : l.name))}
                    />
                  ))}
                </>
              )}
            </FilterBar>
          </Box>

          {rows.length === 0 ? (
            <EmptyState
              icon={<AccountTreeRounded />}
              title="No departments yet"
              hint="A department is a functional unit — Production, Quality, Accounts. Nest the specific ones under the broad ones, so a role can name the deepest that is true."
              action={
                canManage ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                    Add the first department
                  </Button>
                ) : undefined
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={query ? `Nothing matches “${query}”` : `No department is labelled “${labelFilter}”`}
              hint="Search covers the name, the code, the label and the full path."
              action={<Button onClick={() => { setQuery(''); setLabelFilter(''); }}>Show every department</Button>}
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
                return [row.type, parentPath(row), served.length ? `serves ${served.join(', ')}` : null]
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
                canManage
                  ? (row) => (
                      <>
                        <Tooltip title="Add a department under this one">
                          <IconButton size="small" onClick={() => openNew(row.id)} aria-label={`Add a department under ${row.name}`}>
                            <SubdirectoryArrowRightRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => setDoomed(row)} aria-label={`Delete ${row.name}`}>
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
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
        submitDisabled={!draft?.name.trim()}
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
            <TextField
              select
              label="Label"
              value={labels.some((l) => l.name === draft.type) ? draft.type : ''}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              fullWidth
              size="small"
              helperText="What kind of department this is. It is shown under the name on the org chart. The list is yours: change it with the Labels button."
            >
              {labels.map((l) => (
                <MenuItem key={l.id} value={l.name}>
                  {l.name}
                </MenuItem>
              ))}
            </TextField>
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

      <SideSheet
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        title="Labels"
        subtitle="What kinds of department this company has"
        width={420}
      >
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', mb: 1.5, lineHeight: 1.55 }}>
          Everything on this screen is a department. The label says what kind — it is shown under the
          name on the org chart and can be filtered on here. Renaming a label renames it on every
          department that uses it.
        </Typography>
        <EditableList
          items={labelItems}
          canEdit={canManage}
          noun="label"
          usage={(n) => `${n} department${n === 1 ? '' : 's'}`}
          minItems={1}
          onAdd={async (name) => {
            await orgApi.departmentLabels.create(name);
            reload();
          }}
          onRename={async (id, name) => {
            await orgApi.departmentLabels.rename(id, name);
            reload();
          }}
          onReorder={async (ids) => {
            await orgApi.departmentLabels.reorder(ids);
            reload();
          }}
          onRemove={async (id, moveTo) => {
            await orgApi.departmentLabels.remove(id, moveTo);
            reload();
          }}
        />
      </SideSheet>

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Delete this department?"
        entityName={doomed?.path}
        body="Anything already pointing at it — a role, a position, a sub-department — will block the delete and say so. Set it inactive instead if you only want it out of the pickers."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
