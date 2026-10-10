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
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FilterBar,
  FormDialog,
  ListSkeleton,
  PageHeader,
  StatStrip,
  StatSkeleton,
  StatusBadge,
  ToneBadge,
  useIsPermitted,
  useToast,
  type Stat,
} from '@shared/ui';
import { useCompanySlug } from '@shared/ui';
import { orgApi, ORG_MANAGE, type Department } from '../api/organisation';
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
 * with seats, filled, vacant and who is in each. Clicking a role or a position
 * opens its KRAs, responsibilities and KPIs in a side sheet, with Edit going to
 * the role's Content tab or the position's job-content editor. Two requests for
 * the whole screen: the tree, and every department's staffing in one answer.
 */

interface DraftState {
  id: number | null;
  name: string;
  code: string;
  parentId: number | '';
  status: 'ACTIVE' | 'INACTIVE';
  /** A label, free text; the labels already in use are offered. */
  type: string;
  /** A shared crew — one box on the org chart, pointing at what it serves. */
  isShared: boolean;
  serves: number[];
}

const emptyDraft = (parentId: number | null): DraftState => ({
  id: null,
  name: '',
  code: '',
  parentId: parentId ?? '',
  status: 'ACTIVE',
  type: '',
  isShared: false,
  serves: [],
});

/** "3 roles · 12 seats" — what a department holds, on its row. */
const staffLabel = (c: { roles: number; seats: number }) =>
  `${c.roles} role${c.roles === 1 ? '' : 's'} · ${c.seats} seat${c.seats === 1 ? '' : 's'}`;

export default function Departments() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const company = useCompanySlug();
  const load = useCallback(
    () =>
      Promise.all([orgApi.departments.listWithTypes(), getDepartmentStaffing()]).then(([tree, staffing]) => ({
        ...tree,
        staffing,
      })),
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
  const types = useMemo(() => data?.types ?? [], [data]);
  const nameOf = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => filterTree(rows, query, (r) => `${r.name} ${r.code ?? ''} ${r.path} ${r.type ?? ''}`),
    [rows, query],
  );
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Department | null>(null);

  // Derived from the rows already loaded — no second request, and the numbers
  // always agree with the list beneath (§4.2). Each names something fixable
  // rather than restating the row count.
  const stats: Stat[] = useMemo(() => {
    const noCode = rows.filter((r) => !r.code).length;
    const inactive = rows.filter((r) => r.status === 'INACTIVE').length;
    const roots = rows.filter((r) => r.depth === 0).length;
    const totals = data?.staffing.counts;
    return [
      { label: 'Departments', value: rows.length },
      ...(totals
        ? [
            {
              label: 'Seats',
              value: totals.seats,
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
        label: 'Without a code',
        value: noCode,
        tone: 'warning',
        hint: 'Imports, exports and spreadsheets match on the code. A department with none has to be matched by name.',
      },
      {
        label: 'Inactive',
        value: inactive,
        tone: 'warning',
        hint: 'Kept for history; hidden from new pickers.',
      },
    ];
  }, [rows, data]);

  const openNew = (parentId: number | null) => setDraft(emptyDraft(parentId));
  const openEdit = (row: Department) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      parentId: row.parentId ?? '',
      status: row.status,
      type: row.type ?? '',
      isShared: Boolean(row.isShared),
      serves: row.serves ?? [],
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name,
      code: draft.code,
      parentId: draft.parentId === '' ? null : draft.parentId,
      status: draft.status,
      type: draft.type.trim() || null,
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
          <Box sx={{ display: 'flex', gap: 1 }}>
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
          <StatSkeleton count={5} />
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
              placeholder="Search departments by name, code or type"
            />
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
              title={`Nothing matches “${query}”`}
              hint="Search covers the name, the code and the full path."
              action={<Button onClick={() => setQuery('')}>Clear the search</Button>}
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
                  {row.isShared && <ToneBadge tone="info" noIcon label="Shared crew" />}
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
            <DepartmentStaffingPanel name="no department" staffing={unplaced} hasChildren={false} onPeek={setPeek} />
          )}
        </Box>
      )}

      <JobPeekSheet peek={peek} company={company} onClose={() => setPeek(null)} />

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
            <TextField
              label="Code"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value })}
              fullWidth
              size="small"
              helperText="Optional. Letters, digits, _ - . — matched without case, so PROD and prod are the same code."
            />
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
            <Autocomplete
              freeSolo
              size="small"
              options={types}
              value={draft.type}
              onChange={(_, v) => setDraft({ ...draft, type: v ?? '' })}
              onInputChange={(_, v) => setDraft((d) => (d ? { ...d, type: v } : d))}
              renderInput={(p) => (
                <TextField
                  {...p}
                  label="Type"
                  helperText="A label shown under the name on the org chart — Department, Section, Machine / area. Pick one in use or type a new one."
                />
              )}
            />
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={draft.isShared}
                    onChange={(e) => setDraft({ ...draft, isShared: e.target.checked })}
                  />
                }
                label={<Typography sx={{ fontSize: 14 }}>Shared crew</Typography>}
              />
              <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', ml: 0.25 }}>
                Its people work for several departments. The org chart draws it as one box with an
                arrow to each department it serves.
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
                    placeholder={draft.serves.length ? '' : 'Pick the departments this crew works for'}
                    helperText="Two or more makes it a shared crew in the picture; none draws it as an ordinary box with a dashed frame."
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
