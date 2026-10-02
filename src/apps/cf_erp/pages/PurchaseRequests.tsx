import { useEffect, useState } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import AddRounded from '@mui/icons-material/AddRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import type { RequestDetail, RequestRow } from '../api/procurement';
import { cfApi } from '../api/client';
import type { MasterRecord } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { dayText, rupeeText } from '../lib/money';
import { REQUEST_FILTERS } from '../lib/procurement';
import { Money } from '../components/Money';
import { EmptyState, ErrorNotice, Mono, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { DataTable, type DataColumn } from '../components/DataTable';
import { RequestStatusBadge } from '../components/ProcurementUi';
import { FormDialog } from '../components/FormDialog';
import { RecordPicker } from '../components/RecordPicker';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

function NewRequestDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: RequestDetail) => void }) {
  const [item, setItem] = useState<MasterRecord | null>(null);
  const [quantity, setQuantity] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (open) { setItem(null); setQuantity(''); setNeededBy(''); setNotes(''); } }, [open]);
  const save = async () => onCreated(await cfApi.post<RequestDetail>('/purchase-requests', {
    neededBy: neededBy || null, notes: notes.trim() || null, lines: [{ itemId: item?.id, quantity }],
  }));
  return (
    <FormDialog open={open} title="New purchase request" onClose={onClose} onSubmit={save} submitLabel="Create" maxWidth="sm" submitDisabled={!item || !quantity}
      subtitle="It starts as a draft. Add more lines, then submit it for approval.">
      <RecordPicker kinds={['catalog']} value={item} onChange={setItem} label="First item" activeOnly autoFocus />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
        <TextField label="Quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} helperText={item?.item?.uom ? `In ${item.item.uom}` : ' '} inputProps={{ inputMode: 'decimal' }} />
        <TextField label="Needed by" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} InputLabelProps={{ shrink: true }} />
      </Box>
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth />
    </FormDialog>
  );
}

/** Every purchase request: what is wanted, who asked, and whether it may go for quotes. */
interface RequestCounts { status: Record<string, number>; open: number; all: number; estimated: number; lines: number; unpricedLines: number }
/** Columns the server sorts (procurementService REQUEST_SORT). */
const SERVER_SORT = ['code', 'status', 'lines', 'estTotal', 'neededBy', 'by'];

export default function PurchaseRequests() {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [status, setStatus] = useUrlParam('status', 'all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  useNewParam(() => { if (canManage) setCreating(true); });
  const term = useDebounced(search.trim());
  // Search and the status chip filter on the server, a page at a time; every figure counts all matching requests.
  const list = usePagedList<RequestRow, RequestCounts>('/purchase-requests', { status: status === 'all' ? undefined : status, q: term }, { defaultSort: { key: 'code', dir: 'desc' } });
  const counts = list.counts;
  const estimated = counts?.estimated ?? 0;
  const chipCount = (v: string) => (!counts ? undefined : v === 'all' ? counts.all : v === 'open' ? counts.open : counts.status[v]);
  const stats = [
    { label: 'Requests', value: list.total },
    { label: 'Waiting for approval', value: counts?.status.submitted ?? 0, tone: 'info' as const, hint: 'Submitted, no decision yet' },
    { label: 'Approved', value: counts?.status.approved ?? 0, tone: 'success' as const, hint: 'Can go for quotes' },
    { label: 'Estimated', value: estimated, display: counts && counts.lines > 0 && counts.unpricedLines === counts.lines ? 'no prices' : rupeeText(estimated), hint: 'Before tax, at the estimated prices; unpriced lines are left out' },
  ];
  const columns: DataColumn<RequestRow>[] = [
    { key: 'code', header: 'Number', alwaysVisible: true, sortValue: (r) => r.code, render: (r) => <Mono chip><Box component={Link} to={appPath(company, `purchase-requests/${r.id}`)} sx={linkSx}>{r.code}</Box></Mono> },
    { key: 'status', header: 'Status', alwaysVisible: true, sortValue: (r) => r.status, render: (r) => <RequestStatusBadge status={r.status} /> },
    { key: 'lines', header: 'Lines', numeric: true, sortValue: (r) => r.lines, render: (r) => <Mono>{r.lines}</Mono> },
    { key: 'estTotal', header: 'Estimated', numeric: true, sortValue: (r) => r.estTotal, exportValue: (r) => r.estTotal ?? '', render: (r) => <><Money value={r.unpricedLines === r.lines || r.estTotal == null ? null : r.estTotal} missing="no prices" />{(r.unpricedLines ?? 0) > 0 && r.unpricedLines !== r.lines && <Box component="span" sx={{ color: 'var(--c-text-3)', fontSize: 11.5 }}> + {r.unpricedLines} unpriced</Box>}</> },
    { key: 'neededBy', header: 'Needed by', sortValue: (r) => r.neededBy, render: (r) => <Mono muted>{dayText(r.neededBy) || '—'}</Mono> },
    { key: 'by', header: 'Asked by', sortValue: (r) => r.requestedBy?.name ?? '', render: (r) => <>{r.requestedBy?.name ?? '—'}</> },
    { key: 'decided', header: 'Decided by', defaultHidden: true, render: (r) => <>{r.decidedBy ? `${r.decidedBy.name}${r.decidedAt ? `, ${dayText(r.decidedAt)}` : ''}` : '—'}</> },
  ];
  return (
    <Box>
      <PageHeader title="Purchase requests" subtitle="What is needed, asked for once and approved before anyone is asked for a price. An approved request becomes an RFQ."
        actions={canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreating(true)}>New purchase request</Button>} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search number or person">
        {REQUEST_FILTERS.map((f) => <FacetChip key={f.value} label={f.label} active={status === f.value} count={chipCount(f.value)} onClick={() => setStatus(f.value)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <DataTable rows={list.rows} columns={columns} getRowId={(r) => r.id} loading={!list.loaded} server={{ ...list.server, sortable: SERVER_SORT }} defaultSortKey="code" defaultSortDir="desc" storageKey="purchase-requests" exportName="purchase-requests"
        onRowClick={(r) => navigate(appPath(company, `purchase-requests/${r.id}`))}
        empty={<EmptyState icon={<ChecklistRounded />} title={term ? 'No request matches' : 'No purchase requests here'}
          hint={term ? 'Clear the search.' : 'Raise one from the To buy list, or start one by hand.'}
          action={term ? <Button onClick={() => setSearch('')}>Clear search</Button> : <Button component={Link} to={appPath(company, 'buy-list')}>Go to To buy</Button>} />} />
      <NewRequestDialog open={creating} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); navigate(appPath(company, `purchase-requests/${r.id}`)); }} />
    </Box>
  );
}
