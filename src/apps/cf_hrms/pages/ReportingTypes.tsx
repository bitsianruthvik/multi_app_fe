import { useCallback, useMemo, useState } from 'react';
import { Box, Button, FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import HubRounded from '@mui/icons-material/HubRounded';
import LinearScaleRounded from '@mui/icons-material/LinearScaleRounded';
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorNotice,
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
  type DataColumn,
  type Stat,
} from '@shared/ui';
import { orgApi, ORG_MANAGE, type ReportingType } from '../api/organisation';
import { ORG_STATUS_LABELS, ORG_STATUS_TONES, useOrgLoad } from '../components/OrgData';
import { OrgNote } from '../components/OrgNote';

/**
 * Reporting types — the catalogue of ways one person can answer to another.
 *
 * This table is the reason `employee.manager_id` does not exist (plan §2 rule
 * 1). Reporting is typed: the same person can have a primary manager, a
 * functional manager and a dotted line to compliance, all at once, and none of
 * those is "the" manager. A second manager is never a reason to invent a second
 * Role (rule 9) — it is a row here plus a scope on the relationship.
 *
 * Two flags carry all the behaviour, and neither explains itself from its name,
 * so the screen explains both. The six defaults are seeded; the code is
 * permanent because the org chart, the reporting resolver and the importer all
 * look a type up by it.
 */

interface DraftState {
  id: number | null;
  code: string;
  name: string;
  isFormal: boolean;
  allowMultiple: boolean;
  sortOrder: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const emptyDraft = (nextOrder: number): DraftState => ({
  id: null,
  code: '',
  name: '',
  isFormal: false,
  allowMultiple: true,
  sortOrder: String(nextOrder),
  status: 'ACTIVE',
});

export default function ReportingTypes() {
  const can = useIsPermitted();
  const canManage = can(ORG_MANAGE);
  const { success } = useToast();

  const load = useCallback(() => orgApi.reportingTypes.list(), []);
  const { data, error, loading, reload } = useOrgLoad(load);
  const rows = useMemo(() => data ?? [], [data]);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<ReportingType | null>(null);

  const stats: Stat[] = useMemo(() => {
    const formal = rows.filter((r) => r.isFormal).length;
    const single = rows.filter((r) => !r.allowMultiple).length;
    const inactive = rows.filter((r) => r.status === 'INACTIVE').length;
    return [
      { label: 'Relationship types', value: rows.length },
      {
        label: 'Formal',
        value: formal,
        tone: 'info',
        hint: 'Drawn as solid lines on the org chart, attached to positions, and checked for cycles.',
      },
      {
        label: 'One at a time',
        value: single,
        hint: 'At most one active relationship of this kind per person. Everything else may repeat.',
      },
      {
        label: 'Inactive',
        value: inactive,
        tone: 'warning',
        hint: 'Kept so old reporting lines still read correctly; not offered on new ones.',
      },
    ];
  }, [rows]);

  const openEdit = (row: ReportingType) =>
    setDraft({
      id: row.id,
      code: row.code,
      name: row.name,
      isFormal: row.isFormal,
      allowMultiple: row.allowMultiple,
      sortOrder: String(row.sortOrder),
      status: row.status,
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name,
      isFormal: draft.isFormal,
      allowMultiple: draft.allowMultiple,
      sortOrder: Number(draft.sortOrder) || 0,
      status: draft.status,
    };
    // The code goes only on a create — it is permanent afterwards, and the
    // backend refuses a change rather than quietly retargeting the resolver.
    if (draft.id) await orgApi.reportingTypes.update(draft.id, body);
    else await orgApi.reportingTypes.create({ ...body, code: draft.code });
    success(draft.id ? 'Reporting type saved.' : 'Reporting type added.');
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.reportingTypes.remove(doomed.id);
    success(`${doomed.name} deleted.`);
    reload();
  };

  const nextOrder = useMemo(
    () => (rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 10 : 10),
    [rows],
  );

  const columns: DataColumn<ReportingType>[] = useMemo(
    () => [
      {
        key: 'code',
        header: 'Code',
        width: 210,
        render: (r) => <Mono chip>{r.code}</Mono>,
        sortValue: (r) => r.code,
      },
      { key: 'name', header: 'Name', render: (r) => r.name, sortValue: (r) => r.name },
      {
        key: 'isFormal',
        header: 'Formal',
        render: (r) =>
          r.isFormal ? (
            <ToneBadge
              tone="info"
              icon={<HubRounded fontSize="small" />}
              label="Formal"
              title="Attaches to positions, draws a solid line, is checked for cycles."
            />
          ) : (
            <ToneBadge
              tone="neutral"
              icon={<LinearScaleRounded fontSize="small" />}
              label="Informal"
              title="Lives on the work assignment. Real, but not part of the sanctioned structure."
            />
          ),
        sortValue: (r) => (r.isFormal ? 0 : 1),
        exportValue: (r) => (r.isFormal ? 'formal' : 'informal'),
      },
      {
        key: 'allowMultiple',
        header: 'How many',
        render: (r) => (
          <Box component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>
            {r.allowMultiple ? 'Several allowed' : 'One at a time'}
          </Box>
        ),
        sortValue: (r) => (r.allowMultiple ? 1 : 0),
        exportValue: (r) => (r.allowMultiple ? 'several' : 'one'),
      },
      {
        key: 'inUse',
        header: 'Lines using it',
        numeric: true,
        render: (r) => r.inUse,
        sortValue: (r) => r.inUse,
      },
      {
        key: 'sortOrder',
        header: 'Order',
        numeric: true,
        defaultHidden: true,
        render: (r) => r.sortOrder,
        sortValue: (r) => r.sortOrder,
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => (
          <StatusBadge status={r.status} map={ORG_STATUS_TONES} labelMap={ORG_STATUS_LABELS} />
        ),
        sortValue: (r) => r.status,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Reporting types"
        subtitle="The ways one person can answer to another"
        actions={
          canManage ? (
            <Button
              variant="contained"
              startIcon={<AddRounded />}
              onClick={() => setDraft(emptyDraft(nextOrder))}
            >
              New type
            </Button>
          ) : undefined
        }
      />

      <OrgNote label="What the two flags mean" title="Formal, and how many.">
        <strong>Formal</strong> means the relationship belongs to the <em>position</em>, not to the
        person filling it. A formal line survives a vacancy: when the Production Manager leaves, the
        shift in-charges still report to that post, and the org chart still draws the line. An
        informal one lives on the work assignment and leaves with the person — a dotted line to a
        project lead exists while the project does.
        <br />
        <strong>Several allowed</strong> says whether a person can hold more than one active
        relationship of this kind at a time. Primary manager is one at a time; functional, project
        and dotted lines are not, because having two of them is normal and is never a reason to
        invent a second role or a second job for somebody.
      </OrgNote>

      <ErrorNotice error={error} fallback="Could not load reporting types." onRetry={reload} />

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
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={(r) => r.id}
              storageKey="cf_hrms_reporting_types"
              exportName="reporting-types"
              defaultSortKey="sortOrder"
              rowActions={
                canManage
                  ? (row) => (
                      <>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(row)} aria-label={`Edit ${row.name}`}>
                            <EditRounded fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          title={row.inUse ? 'In use by existing reporting lines' : 'Delete'}
                        >
                          {/* A disabled IconButton fires no events, so the tooltip needs a wrapper to hover. */}
                          <Box component="span">
                            <IconButton
                              size="small"
                              disabled={row.inUse > 0}
                              onClick={() => setDoomed(row)}
                              aria-label={`Delete ${row.name}`}
                            >
                              <DeleteOutlineRounded fontSize="small" />
                            </IconButton>
                          </Box>
                        </Tooltip>
                      </>
                    )
                  : undefined
              }
              empty={
                <EmptyState
                  icon={<HubRounded />}
                  title="No reporting types"
                  hint="The six standard types are seeded with the app. If this list is empty, the seed has not run for this company — add them back with the same codes, starting with PRIMARY_MANAGER."
                  action={
                    canManage ? (
                      <Button
                        variant="contained"
                        startIcon={<AddRounded />}
                        onClick={() => setDraft(emptyDraft(nextOrder))}
                      >
                        Add a type
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </Box>
        </>
      )}

      <FormDialog
        open={!!draft}
        title={draft?.id ? 'Edit reporting type' : 'New reporting type'}
        subtitle={
          draft?.id
            ? 'The code is permanent — the org chart and the importer look this type up by it.'
            : 'Add one only when an existing type plus a scope genuinely cannot say it.'
        }
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim() || (!draft?.id && !draft?.code.trim())}
      >
        {draft && (
          <>
            <TextField
              label="Code"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              disabled={!!draft.id}
              required={!draft.id}
              size="small"
              fullWidth
              helperText={
                draft.id
                  ? 'Permanent. Change the name instead — that is what people read.'
                  : 'Upper case with underscores, e.g. QUALITY_MENTOR. It is what the resolver and the importer match on.'
              }
            />
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              autoFocus
              size="small"
              fullWidth
            />

            <FormControlLabel
              control={
                <Switch
                  checked={draft.isFormal}
                  onChange={(e) => setDraft({ ...draft, isFormal: e.target.checked })}
                />
              }
              label="Formal"
            />
            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: -1.5 }}>
              Attaches to the position rather than the person, so it survives a vacancy and appears
              as a solid line on the org chart. Formal types are also the ones checked for cycles.
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={draft.allowMultiple}
                  onChange={(e) => setDraft({ ...draft, allowMultiple: e.target.checked })}
                />
              }
              label="Several allowed at once"
            />
            <Box sx={{ fontSize: 13, color: 'var(--c-text-2)', mt: -1.5 }}>
              Off means at most one active relationship of this kind per person — which is what
              &ldquo;primary&rdquo; means. It never makes reporting exclusive: a primary manager and
              a dotted line sit side by side.
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="Order"
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                size="small"
                sx={{ flex: '1 1 140px' }}
                helperText="Where it sits in pickers"
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
                helperText="Inactive keeps old lines readable"
              >
                <MenuItem value="ACTIVE">Active</MenuItem>
                <MenuItem value="INACTIVE">Inactive</MenuItem>
              </TextField>
            </Box>
          </>
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!doomed}
        danger
        title="Delete this reporting type?"
        entityName={doomed ? `${doomed.code} — ${doomed.name}` : undefined}
        body="Nothing uses it yet, so this is safe. If it is one of the six standard types, deleting it will make the org-chart import fall back to creating it again."
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
