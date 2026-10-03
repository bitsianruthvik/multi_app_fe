import { useState } from 'react';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import PeopleRounded from '@mui/icons-material/PeopleRounded';
import { cfApi } from '../api/client';
import type { Party, PartyRole } from '../api/types';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { invalidateNavCounts } from '../hooks/useNavCounts';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { DataTable, type DataColumn } from '../components/DataTable';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { PartyDialog } from '../components/PartyDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/toastContext';

const ROLE_WORD: Record<PartyRole, string> = { customer: 'Customer', supplier: 'Supplier', subcontractor: 'Contractor' };
const ROLE_CHIPS: { value: string; label: string }[] = [
  { value: 'customer', label: 'Customers' }, { value: 'supplier', label: 'Suppliers' }, { value: 'subcontractor', label: 'Contractors' }, { value: 'all', label: 'All' },
];
const PAGE_TITLE: Record<string, string> = { customer: 'Customers', supplier: 'Suppliers', subcontractor: 'Contractors', all: 'Customers & suppliers' };
/** What GET /parties?paged=1 counts over every match (not the loaded page). */
interface PartyCounts { roles: Record<string, number>; active: number; inactive: number; noContact: number }

/**
 * Collection / List (§4.2) of parties. They live in the separate parties
 * module, shared by whatever app needs customers and suppliers; this screen
 * starts on customers because sales orders are what use them today.
 */
/** `fixedRole` pins the screen to one kind of party (Production › Contractors). */
export default function Customers({ fixedRole }: { fixedRole?: PartyRole } = {}) {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_parties_manage');
  const [urlRole, setRole] = useUrlParam('role', 'customer');
  const role = fixedRole ?? urlRole;
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ open: boolean; party: Party | null }>({ open: false, party: null });
  const [deleting, setDeleting] = useState<Party | null>(null);
  useNewParam(() => { if (canManage) setEditing({ open: true, party: null }); });
  // Search and role filter on the server, a page at a time; the figures count every match.
  const debounced = useDebounced(search.trim());
  const list = usePagedList<Party, PartyCounts>('/parties', { search: debounced, role });
  const term = debounced;
  const pc = list.counts;
  // Figures that name something to act on, not a restatement of the row count.
  const stats = [
    { label: 'Active', value: pc?.active ?? 0, tone: 'success' as const },
    { label: 'Inactive', value: pc?.inactive ?? 0, tone: 'neutral' as const, hint: 'Not offered on new orders' },
    { label: 'No contact', value: pc?.noContact ?? 0, tone: 'warning' as const, hint: 'No email or phone on record' },
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
      <PageHeader title={PAGE_TITLE[role] ?? 'Customers'} subtitle={fixedRole === 'subcontractor' ? 'Who does work for you outside the shop — they get work orders from an order’s Contractors tab.' : fixedRole === 'supplier' ? 'Who you buy from — asked for quotations on a purchase order, and the PO is placed with them.' : 'Who orders from you — and who supplies you. One record can be both.'}
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setEditing({ open: true, party: null })}>{newLabel}</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search code, name or contact">
        {!fixedRole && ROLE_CHIPS.map((c) => <FacetChip key={c.value} label={c.label} active={role === c.value} count={list.counts?.roles[c.value]} onClick={() => setRole(c.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.rows} columns={columns} getRowId={(p) => p.id} loading={!list.loaded} storageKey="parties" exportName="parties" defaultSortKey="name"
        server={{ ...list.server, sortable: ['code', 'name', 'roles', 'contact', 'tax', 'status'] }}
        onRowClick={canManage ? (p) => setEditing({ open: true, party: p }) : undefined}
        rowActions={canManage ? (p) => (
          <>
            <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ open: true, party: p })}><EditRounded fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Delete"><IconButton size="small" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip>
          </>
        ) : undefined}
        empty={<EmptyState icon={<PeopleRounded />} title={term ? 'Nobody matches' : 'Nobody here yet'}
          hint={term ? 'Try a code, a name or a contact.' : role === 'subcontractor' ? 'Add a contractor — then assign them work on an order’s Contractors tab.' : role === 'supplier' ? 'Add a supplier — purchase orders need one.' : 'Add the first customer — orders need one.'}
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
