import { useMemo, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import { cfApi, qs } from '../api/client';
import type { Party, PartyRole } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { PartyDialog } from '../components/PartyDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';

const ROLE_WORD: Record<PartyRole, string> = { customer: 'Customer', supplier: 'Supplier', subcontractor: 'Subcontractor' };
const ROLE_CHIPS: { value: string; label: string }[] = [
  { value: 'customer', label: 'Customers' }, { value: 'supplier', label: 'Suppliers' }, { value: 'subcontractor', label: 'Subcontractors' }, { value: 'all', label: 'All' },
];
const inRole = (p: Party, r: string) => r === 'all' || p.roles.includes(r as PartyRole);
const matches = (p: Party, term: string) => !term || [p.code, p.name, p.contactName, p.email, p.phone].some((v) => v?.toLowerCase().includes(term));

/**
 * Collection / List (§4.2) of parties. They live in the separate parties
 * module, shared by whatever app needs customers and suppliers; this screen
 * starts on customers because sales orders are what use them today.
 */
export default function Customers() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_parties_manage');
  const [role, setRole] = useUrlParam('role', 'customer');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ open: boolean; party: Party | null }>({ open: false, party: null });
  const [deleting, setDeleting] = useState<Party | null>(null);
  useNewParam(() => { if (canManage) setEditing({ open: true, party: null }); });
  const list = useLoad(() => cfApi.get<Party[]>(`/parties${qs({ limit: 500 })}`), []);

  const term = search.trim().toLowerCase();
  const base = useMemo(() => (list.data ?? []).filter((p) => matches(p, term)), [list.data, term]);
  const rows = useMemo(() => base.filter((p) => inRole(p, role)), [base, role]);
  // Figures that name something to act on, not a restatement of the row count.
  const stats = [
    { label: 'Active', value: rows.filter((p) => p.status === 'active').length, tone: 'success' as const },
    { label: 'Inactive', value: rows.filter((p) => p.status !== 'active').length, tone: 'neutral' as const, hint: 'Not offered on new orders' },
    { label: 'No contact', value: rows.filter((p) => !p.email && !p.phone).length, tone: 'warning' as const, hint: 'No email or phone on record' },
  ];
  const newLabel = `New ${(ROLE_WORD[role as PartyRole] ?? 'Customer').toLowerCase()}`;

  const columns: DataColumn<Party>[] = [
    { key: 'code', header: 'Code', render: (p) => <Mono chip>{p.code}</Mono>, sortValue: (p) => p.code, alwaysVisible: true },
    { key: 'name', header: 'Name', render: (p) => <Box sx={{ fontWeight: 500 }}>{p.name}</Box>, sortValue: (p) => p.name },
    { key: 'roles', header: 'Roles', render: (p) => p.roles.map((r) => ROLE_WORD[r]).join(', '), sortValue: (p) => p.roles.join(',') },
    {
      key: 'contact', header: 'Contact', sortValue: (p) => p.contactName ?? '', exportValue: (p) => [p.contactName, p.email, p.phone].filter(Boolean).join(' · '),
      render: (p) => (
        <Box sx={{ py: 0.5 }}>
          <Box>{p.contactName ?? '—'}</Box>
          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[p.email, p.phone].filter(Boolean).join(' · ')}</Typography>
        </Box>
      ),
    },
    { key: 'tax', header: 'Tax number', render: (p) => <Mono muted={!p.taxNumber}>{p.taxNumber ?? '—'}</Mono>, sortValue: (p) => p.taxNumber, defaultHidden: true },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
  ];

  return (
    <Box>
      <PageHeader title="Customers" subtitle="Who orders from you — and who supplies you. One record can be both."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({ open: true, party: null })}>{newLabel}</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or contact">
        {ROLE_CHIPS.map((c) => <FacetChip key={c.value} label={c.label} active={role === c.value} count={base.filter((p) => inRole(p, c.value)).length} onClick={() => setRole(c.value)} />)}
      </FilterBar>
      {(list.data ?? []).length >= 500 && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mb: 1.5 }}>
          The first 500 by name are shown, and the search only looks through those.
        </Typography>
      )}
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={rows} columns={columns} getRowId={(p) => p.id} loading={list.loading && !list.data} storageKey="parties" exportName="parties" defaultSortKey="name"
        onRowClick={canManage ? (p) => setEditing({ open: true, party: p }) : undefined}
        rowActions={canManage ? (p) => (
          <>
            <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ open: true, party: p })}><EditRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </>
        ) : undefined}
        empty={<EmptyState icon={<PeopleRounded />} title={term ? 'Nobody matches' : 'Nobody here yet'}
          hint={term ? 'Try a code, a name or a contact.' : 'Add the first customer — orders need one.'}
          action={!term && canManage && <Button variant="contained" onClick={() => setEditing({ open: true, party: null })}>{newLabel}</Button>} />} />
      <PartyDialog open={editing.open} existing={editing.party} defaultRole={role === 'all' ? 'customer' : (role as PartyRole)} onClose={() => setEditing({ open: false, party: null })}
        onSaved={(p) => { toast.success(`${p.name} saved.`); invalidateNavCounts(); list.reload(); }} />
      <ConfirmDialog open={!!deleting} danger confirmLabel="Delete" title="Delete this party?" entityName={deleting ? `${deleting.code} · ${deleting.name}` : undefined}
        body="Refused while an order names them — mark them inactive instead, so the orders keep their customer."
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await cfApi.del(`/parties/${deleting?.id}`); toast.success('Deleted.'); invalidateNavCounts(); list.reload(); }} />
    </Box>
  );
}
