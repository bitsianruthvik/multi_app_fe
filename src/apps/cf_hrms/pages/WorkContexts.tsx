import { useCallback, useMemo, useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import PrecisionManufacturingRounded from '@mui/icons-material/PrecisionManufacturingRounded';
import PersonOffRounded from '@mui/icons-material/PersonOffRounded';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FacetChip,
  FilterBar,
  FormDialog,
  ListSkeleton,
  Mono,
  PageHeader,
  StatSkeleton,
  StatStrip,
  StatusBadge,
  ToneBadge,
  useIsPermitted,
  useToast,
  type Stat,
} from '@shared/ui';
import {
  orgApi,
  ORG_MANAGE,
  type ContextType,
  type Lookups,
  type WorkContext,
} from '../api/organisation';
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
import { OrgNote } from '../components/OrgNote';

/**
 * Work contexts — the machines, lines, areas, projects and cells.
 *
 * THIS SCREEN CARRIES A TEACHING BURDEN, and it is the reason the model has a
 * separate table at all. A work context is **not a manager** (plan §2 rule 3).
 * The client's previous tool drew the Pelican machine as a chart box with
 * people hanging under it, and 36 of their 114 nodes ended up parented to a
 * machine as a result — which makes "who does this person report to?"
 * unanswerable, because the answer is a machine.
 *
 * Here a context is something a position or an assignment COVERS. The schema
 * makes the wrong version impossible — both reporting tables key on positions
 * and employees, and neither can hold a context id — but a person arriving at an
 * empty screen will still try to rebuild their old chart unless the screen says
 * otherwise first. Hence the note above the list, and the empty state that
 * repeats it.
 */

const TYPE_LABELS: Record<ContextType, string> = {
  MACHINE: 'Machine',
  LINE: 'Line',
  AREA: 'Area',
  PROJECT: 'Project',
  CELL: 'Cell',
  OTHER: 'Other',
};

interface DraftState {
  id: number | null;
  name: string;
  code: string;
  contextType: ContextType;
  parentId: number | '';
  locationId: number | '';
  departmentId: number | '';
  externalRef: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const emptyDraft = (parentId: number | null, parent?: WorkContext): DraftState => ({
  id: null,
  name: '',
  code: '',
  contextType: 'MACHINE',
  parentId: parentId ?? '',
  // A machine inside an area is in the same place and the same department as
  // the area, nearly always. Pre-filling is the difference between four fields
  // and one.
  locationId: parent?.locationId ?? '',
  departmentId: parent?.departmentId ?? '',
  externalRef: '',
  status: 'ACTIVE',
});

export default function WorkContexts() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const load = useCallback(
    () =>
      Promise.all([orgApi.workContexts.list(), orgApi.lookups()]).then(([rows, lookups]) => ({
        rows,
        lookups,
      })),
    [],
  );
  const { data, error, loading, reload } = useOrgLoad<{ rows: WorkContext[]; lookups: Lookups }>(load);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const lookups = data?.lookups;

  const [query, setQuery] = useState('');
  const [typeFacet, setTypeFacet] = useState<ContextType | null>(null);
  const searched = useMemo(
    () =>
      filterTree(
        rows,
        query,
        (r) =>
          `${r.name} ${r.code ?? ''} ${r.path} ${r.externalRef ?? ''} ${r.locationName ?? ''} ${r.departmentName ?? ''}`,
      ),
    [rows, query],
  );
  const filtered = useMemo(
    () => (typeFacet ? searched.filter((r) => r.contextType === typeFacet) : searched),
    [searched, typeFacet],
  );
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<WorkContext | null>(null);

  const stats: Stat[] = useMemo(() => {
    const noLocation = rows.filter((r) => !r.locationId).length;
    const noDepartment = rows.filter((r) => !r.departmentId).length;
    const inactive = rows.filter((r) => r.status === 'INACTIVE').length;
    return [
      { label: 'Work contexts', value: rows.length },
      {
        label: 'No location',
        value: noLocation,
        tone: 'warning',
        hint: 'A context with no location cannot be filtered by site, and a roster cannot tell which plant it belongs to.',
      },
      {
        label: 'No department',
        value: noDepartment,
        tone: 'warning',
        hint: 'Without a department, a machine does not appear under the function that runs it.',
      },
      { label: 'Inactive', value: inactive, tone: 'warning', hint: 'Kept for history; hidden from new pickers.' },
    ];
  }, [rows]);

  const typeCounts = useMemo(() => {
    const out = new Map<ContextType, number>();
    for (const r of rows) out.set(r.contextType, (out.get(r.contextType) ?? 0) + 1);
    return out;
  }, [rows]);

  const openNew = (parent: WorkContext | null) => setDraft(emptyDraft(parent?.id ?? null, parent ?? undefined));
  const openEdit = (row: WorkContext) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      contextType: row.contextType,
      parentId: row.parentId ?? '',
      locationId: row.locationId ?? '',
      departmentId: row.departmentId ?? '',
      externalRef: row.externalRef ?? '',
      status: row.status,
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name,
      code: draft.code,
      contextType: draft.contextType,
      parentId: draft.parentId === '' ? null : draft.parentId,
      locationId: draft.locationId === '' ? null : draft.locationId,
      departmentId: draft.departmentId === '' ? null : draft.departmentId,
      externalRef: draft.externalRef,
      status: draft.status,
    };
    if (draft.id) await orgApi.workContexts.update(draft.id, body);
    else await orgApi.workContexts.create(body);
    success(draft.id ? 'Work context saved.' : 'Work context added.');
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.workContexts.remove(doomed.id);
    success(`${doomed.name} deleted.`);
    reload();
  };

  const forbidden = draft?.id ? descendantIds(rows, draft.id) : new Set<number>();

  return (
    <>
      <PageHeader
        title="Work contexts"
        subtitle="The machines, lines, areas, projects and cells that work is done on"
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
                New work context
              </Button>
            )}
          </Box>
        }
      />

      <OrgNote
        label="How this works"
        title="A machine is never a manager."
        icon={<PersonOffRounded />}
      >
        A work context is something a job <strong>covers</strong>, not something a person reports to.
        The Pelican machine does not manage the operator running it — a person does. Link the machine
        to a position or to a work assignment and the coverage is recorded; leave the reporting line
        to the manager it actually belongs to.
        <br />
        That distinction is why these rows live here instead of on the org chart. An org chart drawn
        with machines as boxes cannot answer &ldquo;who does this person report to?&rdquo;, because
        the answer comes back as a machine — which is exactly the state the previous tool left the
        data in.
      </OrgNote>

      <ErrorNotice error={error} fallback="Could not load work contexts." onRetry={reload} />

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
              placeholder="Search by name, code, machine reference, location or department"
            >
              {(Object.keys(TYPE_LABELS) as ContextType[])
                .filter((t) => typeCounts.get(t))
                .map((t) => (
                  <FacetChip
                    key={t}
                    label={TYPE_LABELS[t]}
                    count={typeCounts.get(t)}
                    active={typeFacet === t}
                    onClick={() => setTypeFacet(typeFacet === t ? null : t)}
                  />
                ))}
            </FilterBar>
          </Box>

          {rows.length === 0 ? (
            <EmptyState
              icon={<PrecisionManufacturingRounded />}
              title="No work contexts yet"
              hint="Add the machines, lines, areas and projects work is done on. They are what a position or an assignment covers — never who somebody reports to, and never a box on the org chart with people underneath it."
              action={
                canManage ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                    Add the first work context
                  </Button>
                ) : undefined
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              hint="The search covers the name, code, machine reference, location and department."
              action={
                <Button
                  onClick={() => {
                    setQuery('');
                    setTypeFacet(null);
                  }}
                >
                  Clear the filters
                </Button>
              }
            />
          ) : (
            <OrgTreeView
              rows={filtered}
              collapsed={collapsed}
              onToggle={toggle}
              ariaLabel="Work contexts"
              renderCode={(row) => <OrgCode code={row.code} />}
              renderPrimary={(row) => row.name}
              renderSecondary={(row) =>
                [
                  parentPath(row),
                  row.locationName,
                  row.departmentName,
                  row.externalRef ? `ref ${row.externalRef}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || null
              }
              renderTrailing={(row) => (
                <>
                  <ToneBadge tone="neutral" noIcon label={TYPE_LABELS[row.contextType]} />
                  {!row.locationId && (
                    <ToneBadge
                      tone="warning"
                      label="No location"
                      title="Cannot be filtered by site until it has one."
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
                        <Tooltip title="Add a context inside this one">
                          <IconButton size="small" onClick={() => openNew(row)} aria-label={`Add a work context inside ${row.name}`}>
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
        title={draft?.id ? 'Edit work context' : 'New work context'}
        subtitle="Something work is done on — not somebody work is done for."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim()}
        maxWidth="md"
      >
        {draft && (
          <>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                autoFocus
                size="small"
                sx={{ flex: '2 1 240px' }}
                helperText="Named once for the whole company — the same machine under two areas is one row."
              />
              <TextField
                select
                label="Type"
                value={draft.contextType}
                onChange={(e) => setDraft({ ...draft, contextType: e.target.value as ContextType })}
                size="small"
                sx={{ flex: '1 1 160px' }}
              >
                {(Object.keys(TYPE_LABELS) as ContextType[]).map((t) => (
                  <MenuItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                size="small"
                sx={{ flex: '1 1 140px' }}
                helperText="Optional"
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                select
                label="Inside"
                value={draft.parentId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    parentId: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                size="small"
                sx={{ flex: '1 1 220px' }}
                helperText="An area contains lines; a line contains machines."
              >
                <MenuItem value="">
                  <em>Nothing — top level</em>
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
                label="Location"
                value={draft.locationId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    locationId: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                size="small"
                sx={{ flex: '1 1 220px' }}
              >
                <MenuItem value="">
                  <em>Not set</em>
                </MenuItem>
                {(lookups?.locations ?? []).map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Department"
                value={draft.departmentId}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    departmentId: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                size="small"
                sx={{ flex: '1 1 220px' }}
              >
                <MenuItem value="">
                  <em>Not set</em>
                </MenuItem>
                {(lookups?.departments ?? []).map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Machine / ERP reference"
                value={draft.externalRef}
                onChange={(e) => setDraft({ ...draft, externalRef: e.target.value })}
                size="small"
                sx={{ flex: '2 1 260px' }}
                helperText="The other system's own id, so an integration can join on it instead of on the name."
              />
              <TextField
                select
                label="Status"
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as DraftState['status'] })
                }
                size="small"
                sx={{ flex: '1 1 160px' }}
              >
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive</MenuItem>
              </TextField>
            </Box>

            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
              There is no &ldquo;reports to&rdquo; field here on purpose. Coverage is recorded by
              linking this context to a position or a work assignment; the manager belongs to the
              person, not to the machine. See <Mono>CF_HRMS_PLAN.md</Mono> §2 rule 3.
            </Box>
          </>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Delete this work context?"
        entityName={doomed?.path}
        body="Positions, assignments, rosters and reporting scopes that point at it will block the delete and say how many. Set it inactive if the machine is simply out of service."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
