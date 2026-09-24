/**
 * The six content masters share one screen (DESIGN_SYSTEM §4.2 Collection).
 *
 * KRAs, Responsibilities, KPIs, Skills, Qualifications and Authorities are six
 * *different* vocabularies — that separation is the model's central idea and it
 * is why there are six routes rather than one "content" screen with a type
 * column. What they share is the shape of the work done to them: browse, add,
 * edit, retire, and see which roles depend on each one. That shape lives here
 * once; the six descriptors below say what makes each vocabulary itself.
 *
 * Every screen shows a usage count, because a master is a shared vocabulary:
 * editing "Production efficiency" edits it for every role that carries it, and
 * deleting one that is in use is refused by the backend with the roles named.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import GroupWorkRounded from '@mui/icons-material/GroupWorkRounded';
import {
  PageHeader, FilterBar, FacetChip, DataTable, EmptyState, StatStrip, StatusBadge, ToneBadge, Mono,
  FormDialog, ConfirmDialog, ErrorNotice, SideSheet, ListSkeleton, Callout, useToast, useIsPermitted,
  useCompanySlug, type DataColumn, type Stat,
} from '@shared/ui';
import {
  listMaster, createMaster, updateMaster, deleteMaster, masterUsage, getMeta,
  pretty,
  type MasterKind, type MasterItem, type MasterUsage, type HrmsMeta,
} from '../api/roles';

// ---------------------------------------------------------------------------
// What makes each vocabulary itself
// ---------------------------------------------------------------------------

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'multiline' | 'select';
  required?: boolean;
  helper?: string;
  options?: (meta: HrmsMeta | null) => string[];
  allowBlank?: boolean;
}

interface MasterDef {
  title: string;
  /** The singular noun for dialogs. 'KRAs'.replace(/s$/,'') is 'KRA' with a lie in it. */
  singular: string;
  subtitle: string;
  /** What this vocabulary is, in the words the spec uses. Shown once, above the list. */
  meaning: string;
  newLabel: string;
  hasCode: boolean;
  columns: DataColumn<MasterItem>[];
  facetField?: keyof MasterItem;
  facets?: (meta: HrmsMeta | null) => string[];
  fields: FieldDef[];
  /** The failure mode worth naming at the top of the screen. */
  extraStat?: (rows: MasterItem[]) => Stat | null;
  emptyHint: string;
}

const typeColumn = (key: keyof MasterItem, header: string): DataColumn<MasterItem> => ({
  key: String(key),
  header,
  render: (r) => (r[key] ? <ToneBadge tone="neutral" label={pretty(String(r[key]))} noIcon /> : <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>),
  sortValue: (r) => (r[key] ? String(r[key]) : null),
});

const descriptionColumn: DataColumn<MasterItem> = {
  key: 'description',
  header: 'Description',
  width: '38%',
  render: (r) => (
    <Box sx={{ color: 'var(--c-text-2)', fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      {r.description || '—'}
    </Box>
  ),
  exportValue: (r) => r.description ?? '',
};

const MASTERS: Record<MasterKind, MasterDef> = {
  kras: {
    title: 'KRAs',
    singular: 'KRA',
    subtitle: 'key result areas',
    meaning:
      'A KRA is an AREA of outcome a role is accountable for — "Production efficiency". It is not a task and not a measure: the duties live under Responsibilities and the numbers under KPIs, and a role\'s content groups them beneath the KRA they serve.',
    newLabel: 'New KRA',
    hasCode: true,
    columns: [
      { key: 'category', header: 'Category', render: (r) => (r.category ? <Box sx={{ fontSize: 13 }}>{r.category}</Box> : <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>), sortValue: (r) => r.category ?? null },
      descriptionColumn,
    ],
    facetField: 'category',
    fields: [
      { name: 'code', label: 'Code', type: 'text', helper: 'Optional short key, e.g. KRA-PROD.' },
      { name: 'name', label: 'Name', type: 'text', required: true, helper: 'The outcome area, as a noun phrase — "Production efficiency".' },
      { name: 'category', label: 'Category', type: 'text', helper: 'Optional grouping — Operations, Quality, People.' },
      { name: 'description', label: 'What this area covers', type: 'multiline' },
      { name: 'status', label: 'Status', type: 'select', options: (m) => m?.activeStatuses ?? ['ACTIVE', 'INACTIVE'] },
    ],
    extraStat: (rows) => {
      const n = rows.filter((r) => !r.description).length;
      return { label: 'No description', value: n, tone: 'warning', hint: 'A KRA with no description is a heading nobody can interpret.' };
    },
    emptyHint: 'Start with four to six outcome areas. A company with two hundred KRAs is writing responsibilities in the wrong place.',
  },

  responsibilities: {
    title: 'Responsibilities',
    singular: 'responsibility',
    subtitle: 'duties and accountabilities',
    meaning:
      'A responsibility is an activity or duty expected of the role — "Review machine-wise output and investigate production deviations". Written once here, assigned to as many roles as need it, and grouped under a KRA on each role.',
    newLabel: 'New responsibility',
    hasCode: true,
    columns: [
      descriptionColumn,
      typeColumn('responsibilityClass', 'Class'),
    ],
    facetField: 'responsibilityClass',
    facets: (m) => m?.responsibilityClasses ?? [],
    fields: [
      { name: 'code', label: 'Code', type: 'text' },
      { name: 'name', label: 'Short label', type: 'text', required: true, helper: 'What the JD lists — "Review machine-wise output".' },
      { name: 'description', label: 'Full statement', type: 'multiline', required: true, helper: 'The whole duty in one sentence. This is what a JD prints.' },
      { name: 'responsibilityClass', label: 'Class', type: 'select', allowBlank: true, options: (m) => m?.responsibilityClasses ?? [], helper: 'How the role holds it: owner, joint owner, support, backup, approver, reviewer.' },
      { name: 'status', label: 'Status', type: 'select', options: (m) => m?.activeStatuses ?? ['ACTIVE', 'INACTIVE'] },
    ],
    extraStat: (rows) => {
      const n = rows.filter((r) => !r.usageCount).length;
      return { label: 'Used by no role', value: n, tone: 'warning', hint: 'A duty nobody carries is either missing an assignment or was written twice.' };
    },
    emptyHint: 'Responsibilities are phrased as activities — "Maintain the stock of critical spares", not "Spares".',
  },

  kpis: {
    title: 'KPIs',
    singular: 'KPI',
    subtitle: 'measurable indicators',
    meaning:
      'A KPI is how results are judged — "Production plan achievement %". The definition says what is measured and how; the target lives on the role that carries it, because the same indicator can carry a different target for a manager and for an operator.',
    newLabel: 'New KPI',
    hasCode: true,
    columns: [
      typeColumn('measurementType', 'Measured as'),
      { key: 'unit', header: 'Unit', render: (r) => <Mono sx={{ fontSize: 12.5 }}>{r.unit || '—'}</Mono>, sortValue: (r) => r.unit ?? null },
      typeColumn('direction', 'Direction'),
      typeColumn('defaultFrequency', 'Frequency'),
      { key: 'dataSource', header: 'Data source', render: (r) => <Box sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{r.dataSource || '—'}</Box>, sortValue: (r) => r.dataSource ?? null },
      {
        key: 'formulaText',
        header: 'Formula',
        defaultHidden: true,
        render: (r) => <Box sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-2)' }}>{r.formulaText || '—'}</Box>,
        exportValue: (r) => r.formulaText ?? '',
      },
    ],
    facetField: 'measurementType',
    facets: (m) => m?.measurementTypes ?? [],
    fields: [
      { name: 'code', label: 'Code', type: 'text' },
      { name: 'name', label: 'Name', type: 'text', required: true, helper: 'Name the indicator, not the target — "Rejection rate %", not "Rejection under 2%".' },
      { name: 'measurementType', label: 'Measured as', type: 'select', required: true, options: (m) => m?.measurementTypes ?? [] },
      { name: 'unit', label: 'Unit', type: 'text', helper: '%, minutes, kg/t.' },
      { name: 'direction', label: 'Direction', type: 'select', allowBlank: true, options: (m) => m?.kpiDirections ?? [], helper: 'Is higher better, lower better, or inside a range?' },
      { name: 'defaultFrequency', label: 'Default frequency', type: 'select', allowBlank: true, options: (m) => m?.frequencies ?? [], helper: 'A role may override this.' },
      { name: 'dataSource', label: 'Data source', type: 'text', helper: 'Where the number comes from — the ERP, the shift log, a manual register.' },
      { name: 'formulaText', label: 'Formula', type: 'multiline', helper: 'Written for a person to read. Nothing evaluates it.' },
      { name: 'description', label: 'Description', type: 'multiline' },
      { name: 'status', label: 'Status', type: 'select', options: (m) => m?.activeStatuses ?? ['ACTIVE', 'INACTIVE'] },
    ],
    extraStat: (rows) => {
      const n = rows.filter((r) => !r.dataSource).length;
      return { label: 'No data source', value: n, tone: 'warning', hint: 'A KPI nobody can say where the number comes from is a KPI nobody will report.' };
    },
    emptyHint: 'A KPI states what is measured and where the number comes from. The target belongs to the role.',
  },

  skills: {
    title: 'Skills',
    singular: 'skill',
    subtitle: 'what the work needs someone to be able to do',
    meaning: 'A skill is a capability a role requires. Roles mark each one required or preferred, with a proficiency.',
    newLabel: 'New skill',
    hasCode: false,
    columns: [typeColumn('skillType', 'Type'), descriptionColumn],
    facetField: 'skillType',
    facets: (m) => m?.skillTypes ?? [],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'skillType', label: 'Type', type: 'select', required: true, options: (m) => m?.skillTypes ?? [] },
      { name: 'description', label: 'Description', type: 'multiline' },
      { name: 'status', label: 'Status', type: 'select', options: (m) => m?.activeStatuses ?? ['ACTIVE', 'INACTIVE'] },
    ],
    emptyHint: 'Machine skills, system skills and behaviours all live here; the type keeps them apart.',
  },

  qualifications: {
    title: 'Qualifications',
    singular: 'qualification',
    subtitle: 'education, certification and licences',
    meaning: 'A qualification is a credential a role requires or prefers. Expiry and verification live on the employee, not here.',
    newLabel: 'New qualification',
    hasCode: false,
    columns: [typeColumn('qualificationType', 'Type'), descriptionColumn],
    facetField: 'qualificationType',
    facets: (m) => m?.qualificationTypes ?? [],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'qualificationType', label: 'Type', type: 'select', required: true, options: (m) => m?.qualificationTypes ?? [] },
      { name: 'description', label: 'Description', type: 'multiline' },
      { name: 'status', label: 'Status', type: 'select', options: (m) => m?.activeStatuses ?? ['ACTIVE', 'INACTIVE'] },
    ],
    emptyHint: 'Name the credential as it is written on the certificate.',
  },

  authorities: {
    title: 'Authorities',
    singular: 'authority',
    subtitle: 'what the role may decide, approve or stop',
    meaning:
      'An authority is a power the role holds — approve, decide, stop, issue, escalate, spend. The limit (amount, scope, condition) is set on each role, because the same authority is held to different limits at different levels.',
    newLabel: 'New authority',
    hasCode: false,
    columns: [typeColumn('authorityType', 'Type'), descriptionColumn],
    facetField: 'authorityType',
    facets: (m) => m?.authorityTypes ?? [],
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, helper: '"Approve consumable purchase", "Stop the machine".' },
      { name: 'authorityType', label: 'Type', type: 'select', required: true, options: (m) => m?.authorityTypes ?? [] },
      { name: 'description', label: 'What the holder may do', type: 'multiline', required: true },
      { name: 'status', label: 'Status', type: 'select', options: (m) => m?.activeStatuses ?? ['ACTIVE', 'INACTIVE'] },
    ],
    emptyHint: 'An authority says what someone may do without asking. The limit is set per role.',
  },
};

// ---------------------------------------------------------------------------

function blankForm(def: MasterDef): Record<string, string> {
  const out: Record<string, string> = { status: 'ACTIVE' };
  for (const f of def.fields) {
    if (f.type === 'select' && !f.allowBlank && f.name !== 'status') {
      out[f.name] = (f.options?.(null) ?? [])[0] ?? '';
    } else out[f.name] = out[f.name] ?? '';
  }
  return out;
}

function toForm(def: MasterDef, item: MasterItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) {
    const v = (item as unknown as Record<string, unknown>)[f.name];
    out[f.name] = v === null || v === undefined ? '' : String(v);
  }
  return out;
}

export function RoleMasterScreen({ kind }: { kind: MasterKind }) {
  const def = MASTERS[kind];
  const can = useIsPermitted();
  const mayManage = can('cf_hrms_roles_manage');
  const toast = useToast();
  const company = useCompanySlug();

  const [rows, setRows] = useState<MasterItem[]>([]);
  const [meta, setMeta] = useState<HrmsMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [facet, setFacet] = useState<string | null>(null);

  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<MasterItem | null>(null);
  const [usage, setUsage] = useState<{ item: MasterItem; data: MasterUsage | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMaster(kind);
      setRows(res.items);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Advisory: without /meta the pickers fall back to what the descriptor knows.
    getMeta().then(setMeta).catch(() => setMeta(null));
  }, []);

  useEffect(() => {
    setSearch('');
    setFacet(null);
  }, [kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (facet && def.facetField && String(r[def.facetField] ?? '') !== facet) return false;
      if (!q) return true;
      return [r.name, r.code, r.description, r.category]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, facet, def.facetField]);

  const facetValues = useMemo(() => {
    if (!def.facetField) return [];
    const fromMeta = def.facets?.(meta) ?? [];
    const present = new Set(rows.map((r) => String(r[def.facetField!] ?? '')).filter(Boolean));
    const all = fromMeta.length ? fromMeta.filter((v) => present.has(v)) : [...present].sort();
    return all;
  }, [rows, meta, def]);

  /** Metrics describe the FILTERED set, so they always agree with the list below. */
  const stats = useMemo<Stat[]>(() => {
    const unused = filtered.filter((r) => !r.usageCount).length;
    const base: Stat[] = [
      { label: def.title, value: filtered.length, hint: 'In this list' },
      { label: 'Assigned to a role', value: filtered.filter((r) => r.usageCount > 0).length, tone: 'primary' },
      { label: 'Used by no role', value: unused, tone: unused ? 'warning' : 'default', hint: 'Defined, but no role carries it yet.' },
    ];
    const extra = def.extraStat?.(filtered);
    // The generic "unused" stat is already there; a descriptor that repeats it wins nothing.
    if (extra && extra.label !== 'Used by no role') base.push(extra);
    return base;
  }, [filtered, def]);

  const columns = useMemo<DataColumn<MasterItem>[]>(() => {
    const head: DataColumn<MasterItem>[] = [];
    if (def.hasCode) {
      head.push({
        key: 'code',
        header: 'Code',
        width: 120,
        render: (r) => (r.code ? <Mono>{r.code}</Mono> : <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>),
        sortValue: (r) => r.code ?? null,
      });
    }
    head.push({
      key: 'name',
      header: 'Name',
      width: '26%',
      render: (r) => <Box sx={{ fontWeight: 500 }}>{r.name}</Box>,
      sortValue: (r) => r.name,
    });
    return [
      ...head,
      ...def.columns,
      {
        key: 'usage',
        header: 'Used by',
        align: 'right',
        render: (r) => (
          <Button
            size="small"
            variant="text"
            disabled={!r.usageCount}
            onClick={(e) => {
              e.stopPropagation();
              openUsage(r);
            }}
            sx={{ fontSize: 12.5, minWidth: 0, color: r.usageCount ? 'var(--c-primary-700)' : 'var(--c-text-3)' }}
          >
            {r.usageCount ? `${r.usageCount} role${r.usageCount === 1 ? '' : 's'}` : 'no role'}
          </Button>
        ),
        sortValue: (r) => r.usageCount,
        exportValue: (r) => r.usageCount,
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <StatusBadge status={r.status} label={pretty(r.status)} />,
        sortValue: (r) => r.status,
      },
    ];
    // openUsage is stable enough for this memo; it only reads setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  async function openUsage(item: MasterItem) {
    setUsage({ item, data: null });
    try {
      setUsage({ item, data: await masterUsage(kind, item.id) });
    } catch {
      setUsage({ item, data: { kind, id: item.id, roles: [] } });
    }
  }

  function openCreate() {
    setForm(blankForm(def));
    setCreating(true);
  }

  function openEdit(item: MasterItem) {
    setForm(toForm(def, item));
    setEditing(item);
  }

  async function submit() {
    const body: Record<string, unknown> = {};
    for (const f of def.fields) body[f.name] = form[f.name] === '' ? null : form[f.name];
    if (editing) {
      await updateMaster(kind, editing.id, body);
      toast.success(`${form.name} saved.`);
    } else {
      await createMaster(kind, body);
      toast.success(`${form.name} added.`);
    }
    setEditing(null);
    setCreating(false);
    await load();
  }

  const dialogOpen = creating || !!editing;

  return (
    <>
      <PageHeader
        title={def.title}
        subtitle={def.subtitle}
        actions={
          mayManage ? (
            <Button variant="contained" startIcon={<AddRounded />} onClick={openCreate}>
              {def.newLabel}
            </Button>
          ) : null
        }
      />

      {/* The one sentence that keeps the three vocabularies apart. A screen
          called "Responsibilities" looks perfectly usable while being filled
          with outcome areas — which is exactly when a Callout earns its space. */}
      <Callout label="What this is" title={def.title} tone="neutral">
        {def.meaning}
      </Callout>

      {error ? (
        <ErrorNotice error={error} onRetry={() => void load()} />
      ) : loading ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <StatStrip stats={stats} />

          <Box sx={{ mt: 2, mb: 2 }}>
            <FilterBar search={search} onSearch={setSearch} placeholder={`Search ${def.title.toLowerCase()}…`}>
              {facetValues.length > 0 && (
                <>
                  <FacetChip label="All" active={!facet} onClick={() => setFacet(null)} count={rows.length} />
                  {facetValues.map((v) => (
                    <FacetChip
                      key={v}
                      // Enum facets are prettified; a free-text one (a KRA
                      // category) is shown as typed — "EHS" is not "Ehs".
                      label={def.facets ? pretty(v) : v}
                      active={facet === v}
                      onClick={() => setFacet(facet === v ? null : v)}
                      count={rows.filter((r) => String(r[def.facetField!] ?? '') === v).length}
                    />
                  ))}
                </>
              )}
            </FilterBar>
          </Box>

          <DataTable
            rows={filtered}
            columns={columns}
            getRowId={(r) => r.id}
            storageKey={`cf_hrms:master:${kind}`}
            exportName={`cf_hrms-${kind}`}
            defaultSortKey="name"
            onRowClick={mayManage ? openEdit : undefined}
            rowActions={
              mayManage
                ? (r) => (
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Edit">
                        <IconButton size="small" aria-label={`Edit ${r.name}`} onClick={(e) => { e.stopPropagation(); openEdit(r); }}>
                          <EditRounded fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={r.usageCount ? 'In use — unassign it first' : 'Delete'}>
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Delete ${r.name}`}
                            onClick={(e) => { e.stopPropagation(); setRemoving(r); }}
                          >
                            <DeleteOutlineRounded fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  )
                : undefined
            }
            empty={
              <EmptyState
                icon={<GroupWorkRounded />}
                title={rows.length ? 'Nothing matches those filters' : `No ${def.title.toLowerCase()} yet`}
                hint={rows.length ? 'Clear the search or the facet to see everything.' : def.emptyHint}
                action={
                  mayManage && !rows.length ? (
                    <Button variant="contained" startIcon={<AddRounded />} onClick={openCreate}>
                      {def.newLabel}
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </>
      )}

      <FormDialog
        open={dialogOpen}
        title={editing ? `Edit ${def.singular}` : def.newLabel}
        subtitle={editing ? editing.name : def.meaning}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSubmit={submit}
        submitLabel={editing ? 'Save' : 'Add'}
        enterSubmits={false}
        maxWidth="sm"
      >
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {def.fields.map((f) => {
            const options = f.type === 'select' ? f.options?.(meta) ?? [] : [];
            return (
              <TextField
                key={f.name}
                label={f.label}
                value={form[f.name] ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                required={f.required}
                select={f.type === 'select'}
                multiline={f.type === 'multiline'}
                minRows={f.type === 'multiline' ? 2 : undefined}
                helperText={f.helper}
                fullWidth
                size="small"
              >
                {f.type === 'select' && f.allowBlank && <MenuItem value="">—</MenuItem>}
                {options.map((o) => (
                  <MenuItem key={o} value={o}>
                    {pretty(o)}
                  </MenuItem>
                ))}
              </TextField>
            );
          })}
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={!!removing}
        title={`Delete this ${def.singular}?`}
        entityName={removing?.name}
        body={
          removing?.usageCount
            ? 'This one is assigned to roles. The server will refuse and name them — unassign it there, or set it inactive so it stops appearing in pickers while the roles that carry it keep their content.'
            : 'It disappears from the pickers. Nothing that already refers to it is affected, because nothing does.'
        }
        confirmLabel="Delete"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await deleteMaster(kind, removing.id);
          toast.success(`${removing.name} deleted.`);
          setRemoving(null);
          await load();
        }}
      />

      {/* Which roles depend on this definition — principle #4, both directions. */}
      <SideSheet
        open={!!usage}
        onClose={() => setUsage(null)}
        title={usage?.item.name ?? ''}
        subtitle="Editing this definition changes it for every role below."
      >
        {!usage?.data ? (
          <ListSkeleton rows={3} />
        ) : (
          <Stack divider={<Box sx={{ borderBottom: '1px solid var(--c-border)' }} />}>
            {usage.data.roles.map((r) => (
              <Box
                key={r.id}
                component={Link}
                to={`/${company}/cf_hrms/roles/${r.id}`}
                onClick={() => setUsage(null)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25,
                  textDecoration: 'none', color: 'var(--c-text)',
                  '&:hover': { background: 'var(--c-primary-50)' },
                }}
              >
                {r.roleCode && <Mono sx={{ fontSize: 12 }}>{r.roleCode}</Mono>}
                <Typography sx={{ fontSize: 14, flex: 1 }}>{r.title}</Typography>
                <StatusBadge status={r.status} label={pretty(r.status)} />
              </Box>
            ))}
          </Stack>
        )}
      </SideSheet>
    </>
  );
}

export default RoleMasterScreen;
