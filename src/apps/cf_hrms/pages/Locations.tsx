import { useCallback, useMemo, useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import SubdirectoryArrowRightRounded from '@mui/icons-material/SubdirectoryArrowRightRounded';
import UnfoldLessRounded from '@mui/icons-material/UnfoldLessRounded';
import UnfoldMoreRounded from '@mui/icons-material/UnfoldMoreRounded';
import PlaceRounded from '@mui/icons-material/PlaceRounded';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  FacetChip,
  FilterBar,
  FormDialog,
  ListSkeleton,
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
  type Address,
  type LocationType,
  type OrgLocation,
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
  code: string;
  locationType: LocationType;
  parentId: number | '';
  status: 'ACTIVE' | 'INACTIVE';
  address: Address;
}

const emptyDraft = (parentId: number | null): DraftState => ({
  id: null,
  name: '',
  code: '',
  locationType: 'PLANT',
  parentId: parentId ?? '',
  status: 'ACTIVE',
  address: {},
});

export default function Locations() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const load = useCallback(() => orgApi.locations.list(), []);
  const { data, error, loading, reload } = useOrgLoad(load);
  const rows = useMemo(() => data ?? [], [data]);

  const [query, setQuery] = useState('');
  const [typeFacet, setTypeFacet] = useState<LocationType | null>(null);
  const searched = useMemo(
    () =>
      filterTree(
        rows,
        query,
        (r) => `${r.name} ${r.code ?? ''} ${r.path} ${oneLineAddress(r.address)}`,
      ),
    [rows, query],
  );
  // A type facet on a tree is a filter on the ROWS, not on the branches — so it
  // flattens to a plain list, which is honest: "every SITE" is not a tree.
  const filtered = useMemo(
    () => (typeFacet ? searched.filter((r) => r.locationType === typeFacet) : searched),
    [searched, typeFacet],
  );
  const { collapsed, toggle, expandAll, collapseAll, anyCollapsed } = useTreeCollapse(rows);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<OrgLocation | null>(null);

  const stats: Stat[] = useMemo(() => {
    const noAddress = rows.filter((r) => !hasAddress(r.address)).length;
    const noCode = rows.filter((r) => !r.code).length;
    const inactive = rows.filter((r) => r.status === 'INACTIVE').length;
    return [
      { label: 'Locations', value: rows.length },
      {
        label: 'No address',
        value: noAddress,
        tone: 'warning',
        hint: 'Statutory registers, payslips and letters all print an address. Fill it once here.',
      },
      {
        label: 'Without a code',
        value: noCode,
        tone: 'warning',
        hint: 'Imports and exports match on the code. Without one they have to match on the name.',
      },
      { label: 'Inactive', value: inactive, tone: 'warning', hint: 'Kept for history; hidden from new pickers.' },
    ];
  }, [rows]);

  const typeCounts = useMemo(() => {
    const out = new Map<LocationType, number>();
    for (const r of rows) out.set(r.locationType, (out.get(r.locationType) ?? 0) + 1);
    return out;
  }, [rows]);

  const openNew = (parentId: number | null) => setDraft(emptyDraft(parentId));
  const openEdit = (row: OrgLocation) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      locationType: row.locationType,
      parentId: row.parentId ?? '',
      status: row.status,
      address: { ...(row.address ?? {}) },
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name,
      code: draft.code,
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
    success(`${doomed.name} deleted.`);
    reload();
  };

  const forbidden = draft?.id ? descendantIds(rows, draft.id) : new Set<number>();

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Plants, units, offices and sites — and what sits inside them"
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
                New location
              </Button>
            )}
          </Box>
        }
      />

      <ErrorNotice error={error} fallback="Could not load locations." onRetry={reload} />

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
              placeholder="Search locations by name, code or address"
            >
              {(Object.keys(TYPE_LABELS) as LocationType[])
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
              icon={<PlaceRounded />}
              title="No locations yet"
              hint="Start with the company's own site, then add the units, offices and branches inside it. Holidays, positions and assignments all point at a location."
              action={
                canManage ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => openNew(null)}>
                    Add the first location
                  </Button>
                ) : undefined
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              hint="The search covers the name, the code, the path and the address."
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
                canManage
                  ? (row) => (
                      <>
                        <Tooltip title="Add a location inside this one">
                          <IconButton size="small" onClick={() => openNew(row.id)} aria-label={`Add a location inside ${row.name}`}>
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
                label="Code"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                size="small"
                sx={{ flex: '1 1 140px' }}
                helperText="Optional, matched without case"
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
        title="Delete this location?"
        entityName={doomed?.path}
        body="Work contexts, holidays, positions and assignments that point at it will block the delete and say how many. Set it inactive if you only want it out of the pickers."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
