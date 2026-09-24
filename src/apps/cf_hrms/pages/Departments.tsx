import { useCallback, useMemo, useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
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
import { orgApi, ORG_MANAGE, type Department } from '../api/organisation';
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
 */

interface DraftState {
  id: number | null;
  name: string;
  code: string;
  parentId: number | '';
  status: 'ACTIVE' | 'INACTIVE';
}

const emptyDraft = (parentId: number | null): DraftState => ({
  id: null,
  name: '',
  code: '',
  parentId: parentId ?? '',
  status: 'ACTIVE',
});

export default function Departments() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const load = useCallback(() => orgApi.departments.list(), []);
  const { data, error, loading, reload } = useOrgLoad(load);
  const rows = useMemo(() => data ?? [], [data]);

  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => filterTree(rows, query, (r) => `${r.name} ${r.code ?? ''} ${r.path}`),
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
    return [
      { label: 'Departments', value: rows.length },
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
  }, [rows]);

  const openNew = (parentId: number | null) => setDraft(emptyDraft(parentId));
  const openEdit = (row: Department) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      parentId: row.parentId ?? '',
      status: row.status,
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name,
      code: draft.code,
      parentId: draft.parentId === '' ? null : draft.parentId,
      status: draft.status,
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
              placeholder="Search departments by name or code"
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
              renderPrimary={(row) => row.name}
              renderSecondary={(row) => parentPath(row)}
              renderTrailing={(row) => (
                <>
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
        body="Anything already pointing at it — a role, a position, a work context — will block the delete and say so. Set it inactive instead if you only want it out of the pickers."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
