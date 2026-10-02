import { useState } from 'react';
import { Box, Button } from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import type { Movement, MovementType } from '../api/types';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { EmptyState, ErrorNotice, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { MovementsTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';

const TYPES: [MovementType | '', string][] = [['', 'All'], ['receipt', 'Receipts'], ['issue', 'Issues'], ['transfer', 'Transfers'], ['adjustment', 'Counts'], ['scrap', 'Scrap']];
const MOVE_TYPES: MovementType[] = ['receipt', 'issue', 'transfer', 'adjustment', 'scrap'];
/** What GET /movements?paged=1 counts over every matching movement (stockService.listMovements). */
interface MovementCounts { types: Record<string, number>; month: number; receipts: number; reversed: number }
/** Columns the server sorts by (stockService MOVEMENT_SORT). */
const SERVER_SORT = ['code', 'type', 'date', 'reference'];

/** Every stock movement, newest first. Movements are never edited — a mistake is reversed. */
export default function Movements() {
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [type, setType] = useUrlParam('type', '');
  const [search, setSearch] = useState('');
  const [requested, setRequested] = useState<MovementType | null>(null);
  useNewParam((v) => { if (canManage) setRequested(MOVE_TYPES.includes(v as MovementType) ? (v as MovementType) : 'receipt'); });
  const debounced = useDebounced(search.trim());
  // Search and type filter on the server, a page at a time; every figure counts all matching movements.
  const list = usePagedList<Movement, MovementCounts>('/movements', { search: debounced, type: type || undefined });
  const counts = list.counts;
  const stats = [
    { label: 'Movements', value: list.total, hint: 'All that match' },
    { label: 'This month', value: counts?.month ?? 0 },
    { label: 'Receipts', value: counts?.receipts ?? 0, tone: 'success' as const, hint: 'Material booked in', onClick: () => setType('receipt') },
    { label: 'Reversed', value: counts?.reversed ?? 0, tone: 'warning' as const, hint: 'Undone by a reversal' },
  ];
  const filtered = !!debounced || !!type;

  return (
    <Box>
      <PageHeader title="Movements" subtitle="Receipts, issues, transfers, counts and scrap — the ledger every inventory is built from. A posted movement never changes; a mistake is undone by reversing it."
        actions={canManage && <MovementButtons types={MOVE_TYPES} onPosted={list.reload} requestOpen={requested} onRequestHandled={() => setRequested(null)} />} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search document, reference, supplier, order">
        {TYPES.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={type === v} count={counts?.types[v || 'all']} onClick={() => setType(v)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <MovementsTable rows={list.rows} storageKey="movements" loading={!list.loaded} server={{ ...list.server, sortable: SERVER_SORT }}
        emptyNode={<EmptyState icon={<SwapHorizRounded />} title={filtered ? 'No movement matches' : 'No movements yet'}
          hint={filtered ? 'Clear the search or pick another type.' : 'The first receipt starts the ledger.'}
          action={filtered ? <Button onClick={() => { setSearch(''); setType(''); }}>Clear filters</Button> : undefined} />} />
    </Box>
  );
}
