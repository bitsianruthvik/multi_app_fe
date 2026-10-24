/**
 * Roles — the reusable kinds of work (DESIGN_SYSTEM §4.2 Collection).
 *
 * The readiness numbers at the top are the point of this screen being more than
 * a list. A role is what a JD is generated from: without a purpose the document
 * opens with a blank line, and without a KRA it lists duties under no outcome at
 * all. Both are fixable in a minute and invisible until someone tries to
 * generate — so they are named here, and each is a filter that jumps straight to
 * the roles concerned.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Stack } from '@mui/material';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import {
  PageHeader, DataTable, EmptyState, StatusBadge, ToneBadge,
  Mono, ErrorNotice, ListSkeleton, ConfirmDialog, useToast, useCompanySlug,
  type DataColumn,
} from '@shared/ui';
import { useCan } from '../access/can';
import { listRoles, deleteRole, pretty, type Role } from '../api/roles';
import { RoleFormDialog } from '../components/RoleFormDialog';
import { ContentCopySheet, type ContentCopyStart } from '../components/ContentCopySheet';
import { useListFilters, matchesQuery, matchesFlag, YES_NO_OPTIONS as YES_NO } from '../components/list/useListFilters';
import { ListToolbar, type FilterDef } from '../components/list/ListToolbar';
import { RowActions } from '../components/list/RowActions';
import { ExcelButtons } from '../components/excel/ExcelButtons';
import { useUnitKinds } from '../components/orgUnits';

export default function Roles() {
  const navigate = useNavigate();
  const company = useCompanySlug();
  const toast = useToast();
  const can = useCan();
  // New role and copying content into roles = roles.edit. The department link needs org.view.
  const mayEdit = can.roles.edit;
  const mayRemove = can.roles.remove;
  const seeDepartments = can.org.view;
  const [params, setParams] = useSearchParams();
  const filters = useListFilters(['status', 'hasPositions', 'hasPurpose', 'jdReady']);

  const [rows, setRows] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // The shell's quick-create sends ?new=1 here.
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState<Role | null>(null);
  const [removing, setRemoving] = useState<Role | null>(null);
  const [copyStart, setCopyStart] = useState<ContentCopyStart | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows((await listRoles()).items);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The same rules as the server's GET /roles (lib/listFilters.js), so the count
  // line and the Excel download agree.
  const { status, hasPositions, hasPurpose, jdReady } = filters.values;
  const search = filters.params.q ?? '';
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!status || r.status.toLowerCase() === status.toLowerCase()) &&
          matchesFlag(hasPositions, r.positionCount > 0) &&
          matchesFlag(hasPurpose, r.hasPurpose) &&
          matchesFlag(jdReady, r.jdReady) &&
          matchesQuery([r.title, r.roleCode], search),
      ),
    [rows, status, hasPositions, hasPurpose, jdReady, search],
  );

  const defs = useMemo<FilterDef[]>(
    () => [
      {
        key: 'status',
        label: 'Status',
        options: ['ACTIVE', 'DRAFT', 'RETIRED'].map((s) => ({
          value: s,
          label: pretty(s),
          count: rows.filter((r) => r.status === s).length,
        })),
      },
      { key: 'hasPositions', label: 'Has positions', options: YES_NO },
      { key: 'hasPurpose', label: 'Has a purpose', options: YES_NO },
      { key: 'jdReady', label: 'JD ready (purpose and a KRA)', options: YES_NO },
    ],
    [rows],
  );

  const withKind = useUnitKinds();
  const columns = useMemo<DataColumn<Role>[]>(
    () => [
      {
        key: 'roleCode',
        header: 'Code',
        width: 120,
        render: (r) => (r.roleCode ? <Mono>{r.roleCode}</Mono> : <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>),
        sortValue: (r) => r.roleCode ?? null,
      },
      {
        key: 'title',
        header: 'Title',
        width: '28%',
        render: (r) => (
          <Box>
            <Box sx={{ fontWeight: 500 }}>{r.title}</Box>
            {r.rolePurpose && (
              <Box sx={{ fontSize: 12, color: 'var(--c-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                {r.rolePurpose}
              </Box>
            )}
          </Box>
        ),
        sortValue: (r) => r.title,
        exportValue: (r) => r.title,
      },
      {
        key: 'department',
        header: 'Org unit',
        render: (r) =>
          r.departmentName && !seeDepartments ? (
            <Box sx={{ fontSize: 13 }}>{withKind(r.departmentName)}</Box>
          ) : r.departmentName ? (
            <Box
              component="button"
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                navigate(`/${company}/cf_hrms/org-units`);
              }}
              sx={{
                border: 0, background: 'none', p: 0, font: 'inherit', fontSize: 13,
                color: 'var(--c-primary-700)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              {withKind(r.departmentName)}
            </Box>
          ) : (
            <Box sx={{ color: 'var(--c-text-3)' }}>—</Box>
          ),
        sortValue: (r) => r.departmentName ?? null,
      },
      { key: 'kraCount', header: 'KRAs', numeric: true, render: (r) => r.kraCount, sortValue: (r) => r.kraCount },
      { key: 'responsibilityCount', header: 'Responsibilities', numeric: true, render: (r) => r.responsibilityCount, sortValue: (r) => r.responsibilityCount },
      { key: 'kpiCount', header: 'KPIs', numeric: true, render: (r) => r.kpiCount, sortValue: (r) => r.kpiCount },
      { key: 'positionCount', header: 'Positions', numeric: true, defaultHidden: true, render: (r) => r.positionCount, sortValue: (r) => r.positionCount },
      {
        key: 'readiness',
        header: 'JD',
        render: (r) =>
          r.jdReady ? (
            <ToneBadge tone="success" label="Ready" />
          ) : (
            <ToneBadge tone="warning" label={!r.hasPurpose ? 'No purpose' : 'No KRAs'} />
          ),
        sortValue: (r) => (r.jdReady ? 1 : 0),
        exportValue: (r) => (r.jdReady ? 'ready' : !r.hasPurpose ? 'no purpose' : 'no KRAs'),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <StatusBadge status={r.status} label={pretty(r.status)} />,
        sortValue: (r) => r.status,
      },
    ],
    [company, navigate, seeDepartments, withKind],
  );

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="reusable kinds of work — what a JD is generated from"
      />

      {error ? (
        <ErrorNotice error={error} onRetry={() => void load()} />
      ) : loading ? (
        <ListSkeleton rows={7} />
      ) : (
        <>
          <ListToolbar
            filters={filters}
            defs={defs}
            shown={filtered.length}
            total={rows.length}
            noun={['role', 'roles']}
            searchPlaceholder="Search roles by title or code"
            add={mayEdit ? { label: 'New role', onClick: () => setCreating(true) } : undefined}
            excel={
              <ExcelButtons
                entity="roles"
                noun={['role', 'roles']}
                filters={filters.params}
                count={filtered.length}
                canDownload={can.roles.view}
                canUpload={can.roles.upload}
                onApplied={() => void load()}
              />
            }
          />

          <DataTable
            rows={filtered}
            columns={columns}
            getRowId={(r) => r.id}
            storageKey="cf_hrms:roles"
            selectable={mayEdit}
            bulkActions={(selected, clear) => (
              <Button
                size="small"
                startIcon={<ContentCopyRounded />}
                onClick={() => {
                  // The ticked roles are where the content goes; where it comes
                  // FROM is chosen in the sheet.
                  setCopyStart({ to: selected.map((r) => ({ type: 'role' as const, id: r.id })), toType: 'role' });
                  clear();
                }}
              >
                Copy content into {selected.length} role{selected.length === 1 ? '' : 's'}…
              </Button>
            )}
            exportName="cf_hrms-roles"
            defaultSortKey="title"
            onRowClick={(r) => navigate(`/${company}/cf_hrms/roles/${r.id}`)}
            rowActions={
              mayEdit || mayRemove
                ? (r) => (
                    <RowActions
                      name={r.title}
                      onEdit={mayEdit ? () => setEditing(r) : undefined}
                      onRemove={mayRemove ? () => setRemoving(r) : undefined}
                    />
                  )
                : undefined
            }
            empty={
              <EmptyState
                icon={<BadgeRounded />}
                title={rows.length ? 'Nothing matches those filters' : 'No roles yet'}
                hint={
                  rows.length
                    ? 'Clear the search or the filters to see every role.'
                    : 'A role is a kind of work — "Printing Operator". Create one, give it a purpose, then assign KRAs, responsibilities and KPIs from the masters.'
                }
                action={rows.length ? <Button onClick={filters.clear}>Clear</Button> : undefined}
              />
            }
          />

          <Stack sx={{ mt: 2, fontSize: 12.5, color: 'var(--c-text-3)', maxWidth: 760, lineHeight: 1.6 }}>
            A role says what the work is. Where it sits is a Position, and who does it is a person who
            holds it — one person can hold several at once.
          </Stack>
        </>
      )}

      <ContentCopySheet open={!!copyStart} start={copyStart} onClose={() => setCopyStart(null)} onDone={() => void load()} />

      <RoleFormDialog
        open={!!editing}
        role={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          toast.success('Role saved.');
          void load();
        }}
      />

      <ConfirmDialog
        open={!!removing}
        title="Remove this role?"
        entityName={removing?.title}
        body={
          removing && removing.positionCount > 0
            ? `${removing.positionCount} position${removing.positionCount === 1 ? '' : 's'} still hold this role, so the server will refuse and say so. Retire the role instead, or move those positions first.`
            : 'Its content is removed with it. If a position or a person still holds the role, the server will refuse — retire it instead, which keeps the definition readable for the work already attached to it.'
        }
        confirmLabel="Remove"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await deleteRole(removing.id);
          toast.success(`${removing.title} removed.`);
          setRemoving(null);
          await load();
        }}
      />

      <RoleFormDialog
        open={creating}
        role={null}
        onClose={() => {
          setCreating(false);
          if (params.get('new')) {
            params.delete('new');
            setParams(params, { replace: true });
          }
        }}
        onSaved={(role) => {
          setCreating(false);
          navigate(`/${company}/cf_hrms/roles/${role.id}`);
        }}
      />
    </>
  );
}
