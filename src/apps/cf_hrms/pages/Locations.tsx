import { useCallback, useMemo, useState } from 'react';
import { Box, Button, MenuItem, TextField } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FormDialog,
  ListSkeleton,
  PageHeader,
  StatSkeleton,
  StatStrip,
  StatusBadge,
  ToneBadge,
  useToast,
  type Stat,
} from '@shared/ui';
import { useCan } from '../access/can';
import {
  orgApi,
  type Address,
  type LocationType,
  type OrgLocation,
} from '../api/organisation';
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
import { CodeNote } from '../components/CodeNote';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { matchesQuery, useListFilters } from '../components/list/useListFilters';
import { RowActions } from '../components/list/RowActions';
import { ExcelButtons } from '../components/excel/ExcelButtons';

/**
 * Locations — where work physically happens, as a tree (§4.7).
 *
 * Self-parenting because a real SME's geography is nested: "Unit 2 is inside
 * Karni Packaging, Bhilwara". The holiday calendar and the position filter both
 * walk that, so the screen has to show it.
 *
 * The address is structured rather than a free-text block: a statutory register
 * and a payslip need the city, the state and the PIN as fields, and splitting a
 * pasted paragraph back into them later never quite works.
 */

const TYPE_LABELS: Record<LocationType, string> = {
  PLANT: 'Plant',
  OFFICE: 'Office',
  UNIT: 'Unit',
  BRANCH: 'Branch',
  SITE: 'Site',
  OTHER: 'Other',
};

const ADDRESS_FIELDS: { key: keyof Address; label: string }[] = [
  { key: 'line1', label: 'Address line 1' },
  { key: 'line2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'PIN code' },
  { key: 'country', label: 'Country' },
];

const hasAddress = (a: Address | null) => !!a && Object.values(a).some((v) => String(v ?? '').trim());

const oneLineAddress = (a: Address | null) =>
  a ? [a.line1, a.line2, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ') : '';

interface DraftState {
  id: number | null;
  name: string;
  /** Shown as text on edit; never sent. */
  code: string | null;
  locationType: LocationType;
  parentId: number | '';
  status: 'ACTIVE' | 'INACTIVE';
  address: Address;
}

const emptyDraft = (parentId: number | null): DraftState => ({
  id: null,
  name: '',
  code: null,
  locationType: 'PLANT',
  parentId: parentId ?? '',
  status: 'ACTIVE',
  address: {},
});

export default function Locations() {
  const can = useCan();
  const { success } = useToast();

  const load = useCallback(() => orgApi.locations.list(), []);
  const { data, error, loading, reload } = useOrgLoad(load);
  const rows = useMemo(() => data ?? [], [data]);

  const filters = useListFilters(['status']);
  const statusFilter = filters.values.status;
  const search = filters.params.q ?? '';
  // The server's rule for GET /organisation/locations: status, and the search in the name or the code.
  const matched = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!statusFilter || r.status.toLowerCase() === statusFilter.toLowerCase()) &&
          matchesQuery([r.name, r.code], search),
      ),
    [rows, statusFilter, search],
  );
  // Every match keeps its ancestors in the tree so it still reads; the count is of the matches.
  const filtered = useMemo(() => {
    const ids = new Set(matched.map((r) => r.id));
    return filterTreeBy(rows, (r) => ids.has(r.id));
  }, [rows, matched]);
  const filterDefs: FilterDef[] = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
      ],
    },
  ];
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<OrgLocation | null>(null);

  const stats: Stat[] = useMemo(() => {
    const noAddress = rows.filter((r) => !hasAddress(r.address)).length;
    return [
      {
        label: 'No address',
        value: noAddress,
        tone: 'warning',
        hint: 'Statutory registers, payslips and letters all print an address. Fill it once here.',
      },
    ];
  }, [rows]);

  const openNew = (parentId: number | null) => setDraft(emptyDraft(parentId));
  const openEdit = (row: OrgLocation) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      locationType: row.locationType,
      parentId: row.parentId ?? '',
      status: row.status,
      address: { ...(row.address ?? {}) },
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      // No code: the server issues it on create and never changes it (spec §11).
      name: draft.name,
      locationType: draft.locationType,
      parentId: draft.parentId === '' ? null : draft.parentId,
      status: draft.status,
      address: draft.address,
    };
    if (draft.id) await orgApi.locations.update(draft.id, body);
    else await orgApi.locations.create(body);
    success(draft.id ? 'Location saved.' : 'Location added.');
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.locations.remove(doomed.id);
    success(`${doomed.name} removed.`);
    reload();
  };

  const forbidden = draft?.id ? descendantIds(rows, draft.id) : new Set<number>();

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Plants, units, offices and sites — and what sits inside them"
      />

      <ErrorNotice error={error} fallback="Could not load locations." onRetry={reload} />

      {loading ? (
        <>
          <StatSkeleton count={3} />
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
              noun={['location', 'locations']}
              searchPlaceholder="Search locations by name or code"
              add={can.org.edit ? { label: 'New location', onClick: () => openNew(null) } : undefined}
              excel={
                <ExcelButtons
                  entity="locations"
                  noun={['location', 'locations']}
                  filters={filters.params}
                  count={matched.length}
                  canDownload={can.org.view}
                  canUpload={can.org.upload}
                  onApplied={reload}
                />
              }
              extra={
                rows.length > 0 ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={anyCollapsed ? <UnfoldMoreRounded /> : <UnfoldLessRounded />}
                    onClick={anyCollapsed ? expandAll : collapseAll}
                    sx={{ height: 36, whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {anyCollapsed ? 'Expand all' : 'Collapse all'}
                  </Button>
                ) : undefined
              }
            />
          </Box>

          {rows.length === 0 ? (
            <EmptyState
              icon={<PlaceRounded />}
              title="No locations yet"
              hint="Start with the company's own site, then add the units, offices and branches inside it. Holidays, positions and people all point at a location."
              action={
                can.org.edit ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                    Add the first location
                  </Button>
                ) : undefined
              }
            />
          ) : matched.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              hint="The search covers the name and the code."
              action={<Button onClick={filters.clear}>Clear the filters</Button>}
            />
          ) : (
            <OrgTreeView
              rows={filtered}
              collapsed={collapsed}
              onToggle={toggle}
              ariaLabel="Locations"
              renderCode={(row) => <OrgCode code={row.code} />}
              renderPrimary={(row) => row.name}
              renderSecondary={(row) =>
                [parentPath(row), oneLineAddress(row.address)].filter(Boolean).join(' · ') || null
              }
              renderTrailing={(row) => (
                <>
                  <ToneBadge tone="neutral" noIcon label={TYPE_LABELS[row.locationType]} />
                  {!hasAddress(row.address) && (
                    <ToneBadge tone="warning" label="No address" title="Registers and letters print an address." />
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
                                  key: 'add-inside',
                                  label: 'Add inside this',
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

      <FormDialog
        open={!!draft}
        title={draft?.id ? 'Edit location' : 'New location'}
        subtitle="The address is used by statutory registers and printed documents."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim()}
        maxWidth="md"
      >
        {draft && (
          <>
            <CodeNote code={draft.code} isNew={!draft.id} />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
                autoFocus
                size="small"
                sx={{ flex: '2 1 240px' }}
              />

              <TextField
                select
                label="Type"
                value={draft.locationType}
                onChange={(e) =>
                  setDraft({ ...draft, locationType: e.target.value as LocationType })
                }
                size="small"
                sx={{ flex: '1 1 160px' }}
              >
                {(Object.keys(TYPE_LABELS) as LocationType[]).map((t) => (
                  <MenuItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </TextField>
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
                sx={{ flex: '2 1 240px' }}
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

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {ADDRESS_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  value={draft.address[f.key] ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, address: { ...draft.address, [f.key]: e.target.value } })
                  }
                  size="small"
                  sx={{ flex: '1 1 200px' }}
                />
              ))}
            </Box>
          </>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Remove this location?"
        entityName={doomed?.path}
        body="Departments, holidays, positions and people that point at it will block the removal and say how many. Set it inactive if you only want it out of the pickers."
        confirmLabel="Remove"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
