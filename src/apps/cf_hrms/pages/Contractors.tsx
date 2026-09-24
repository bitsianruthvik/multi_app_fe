import { useCallback, useMemo, useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import BadgeRounded from '@mui/icons-material/BadgeRounded';
import {
  ConfirmDialog,
  EmptyState,
  EntityList,
  EntityRow,
  ErrorNotice,
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
import { orgApi, PEOPLE_MANAGE, type Contact, type Contractor } from '../api/organisation';
import { ORG_STATUS_LABELS, ORG_STATUS_TONES, norm, useOrgLoad } from '../components/OrgData';

/**
 * Contractors — the external employers of contract labour.
 *
 * Flat, because they are: a manpower agency has no parent. It sits under
 * Setup and under the PEOPLE permissions rather than the org ones, because a
 * contractor is read on the employee form and maintained by whoever maintains
 * employees — handing out the org grant should not also hand over the
 * contract-labour register.
 *
 * The person stays ONE employee row whoever employs them (init.sql §1d):
 * attendance, leave and assignments are about the person, so the contractor is
 * an attribute of their employment, not a second identity.
 */

const CONTACT_FIELDS: { key: keyof Contact; label: string; helper?: string }[] = [
  { key: 'contactPerson', label: 'Contact person' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'address', label: 'Address' },
  { key: 'notes', label: 'Notes', helper: 'Licence number, agreement reference, anything that does not deserve a field of its own.' },
];

const hasContact = (c: Contact | null) => !!c && Object.values(c).some((v) => String(v ?? '').trim());

const contactLine = (c: Contact | null) =>
  c ? [c.contactPerson, c.phone, c.email].filter(Boolean).join(' · ') : '';

interface DraftState {
  id: number | null;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  contact: Contact;
}

const emptyDraft = (): DraftState => ({ id: null, name: '', code: '', status: 'ACTIVE', contact: {} });

export default function Contractors() {
  const can = useIsPermitted();
  const canManage = can(PEOPLE_MANAGE);
  const { success } = useToast();

  const load = useCallback(() => orgApi.contractors.list(), []);
  const { data, error, loading, reload } = useOrgLoad(load);
  const rows = useMemo(() => data ?? [], [data]);

  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return rows;
    return rows.filter((r) =>
      norm(`${r.name} ${r.code ?? ''} ${contactLine(r.contact)}`).includes(q),
    );
  }, [rows, query]);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [doomed, setDoomed] = useState<Contractor | null>(null);

  const stats: Stat[] = useMemo(() => {
    const noContact = rows.filter((r) => !hasContact(r.contact)).length;
    const unused = rows.filter((r) => r.employeeCount === 0 && r.status === 'ACTIVE').length;
    const people = rows.reduce((n, r) => n + r.employeeCount, 0);
    return [
      { label: 'Contractors', value: rows.length },
      {
        label: 'No contact details',
        value: noContact,
        tone: 'warning',
        hint: 'Nobody to call when a shift is short. Add at least a name and a phone number.',
      },
      {
        label: 'Nobody on their books',
        value: unused,
        tone: 'warning',
        hint: 'Active, but no employee is recorded against them. Either people are missing, or the contractor is finished and should be set inactive.',
      },
      { label: 'Contract employees', value: people, hint: 'People whose employer is one of these contractors.' },
    ];
  }, [rows]);

  const openEdit = (row: Contractor) =>
    setDraft({
      id: row.id,
      name: row.name,
      code: row.code ?? '',
      status: row.status,
      contact: { ...(row.contact ?? {}) },
    });

  const save = async () => {
    if (!draft) return;
    const body = {
      name: draft.name,
      code: draft.code,
      status: draft.status,
      contact: draft.contact,
    };
    if (draft.id) await orgApi.contractors.update(draft.id, body);
    else await orgApi.contractors.create(body);
    success(draft.id ? 'Contractor saved.' : 'Contractor added.');
    reload();
  };

  const remove = async () => {
    if (!doomed) return;
    await orgApi.contractors.remove(doomed.id);
    success(`${doomed.name} deleted.`);
    reload();
  };

  return (
    <>
      <PageHeader
        title="Contractors"
        subtitle="The outside employers that supply contract labour"
        actions={
          canManage ? (
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft())}>
              New contractor
            </Button>
          ) : undefined
        }
      />

      <ErrorNotice error={error} fallback="Could not load contractors." onRetry={reload} />

      {loading ? (
        <>
          <StatSkeleton count={4} />
          <Box sx={{ mt: 2 }}>
            <ListSkeleton rows={5} />
          </Box>
        </>
      ) : (
        <>
          <StatStrip stats={stats} />
          <Box sx={{ mt: 2, mb: 2 }}>
            <FilterBar
              search={query}
              onSearch={setQuery}
              placeholder="Search contractors by name, code or contact"
            />
          </Box>

          {rows.length === 0 ? (
            <EmptyState
              icon={<BadgeRounded />}
              title="No contractors yet"
              hint="Add the agencies and employers that supply contract labour. A contract worker is still one employee row here — the contractor records who employs them, not a second version of the person."
              action={
                canManage ? (
                  <Button variant="contained" startIcon={<AddRounded />} onClick={() => setDraft(emptyDraft())}>
                    Add the first contractor
                  </Button>
                ) : undefined
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={`Nothing matches “${query}”`}
              hint="Search covers the name, the code and the contact details."
              action={<Button onClick={() => setQuery('')}>Clear the search</Button>}
            />
          ) : (
            <EntityList
              rows={filtered}
              defaultSortKey="name"
              sortableFields={[
                { key: 'name', label: 'Name' },
                { key: 'code', label: 'Code' },
                { key: 'employeeCount', label: 'People' },
                { key: 'status', label: 'Status' },
              ]}
              renderRow={(row) => (
                <EntityRow
                  key={row.id}
                  code={row.code ? <Mono chip>{row.code}</Mono> : undefined}
                  primary={row.name}
                  secondary={contactLine(row.contact) || 'No contact details recorded'}
                  trailing={
                    <>
                      <ToneBadge
                        tone={row.employeeCount ? 'info' : 'neutral'}
                        noIcon
                        label={
                          row.employeeCount === 1 ? '1 person' : `${row.employeeCount} people`
                        }
                        title="Employees whose employer is this contractor."
                      />
                      <StatusBadge
                        status={row.status}
                        map={ORG_STATUS_TONES}
                        labelMap={ORG_STATUS_LABELS}
                      />
                    </>
                  }
                  actions={
                    canManage ? (
                      <>
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
                    ) : undefined
                  }
                />
              )}
            />
          )}
        </>
      )}

      <FormDialog
        open={!!draft}
        title={draft?.id ? 'Edit contractor' : 'New contractor'}
        subtitle="One row per employer — the same agency supplying two departments is still one contractor."
        onClose={() => setDraft(null)}
        onSubmit={save}
        submitLabel={draft?.id ? 'Save' : 'Create'}
        submitDisabled={!draft?.name.trim()}
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
                helperText="Optional"
              />
            </Box>
            {CONTACT_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                value={draft.contact[f.key] ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, contact: { ...draft.contact, [f.key]: e.target.value } })
                }
                size="small"
                fullWidth
                helperText={f.helper}
              />
            ))}
            <TextField
              select
              label="Status"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value as DraftState['status'] })}
              size="small"
              fullWidth
              helperText="Set a finished contractor inactive — their employees' history stays intact."
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
        title="Delete this contractor?"
        entityName={doomed?.name}
        body={
          doomed?.employeeCount
            ? 'Employees are recorded against this contractor, so the delete will be refused. Set it inactive instead.'
            : 'No employees are recorded against it, so this is safe. Set it inactive instead if you may use them again.'
        }
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setDoomed(null)}
      />
    </>
  );
}
