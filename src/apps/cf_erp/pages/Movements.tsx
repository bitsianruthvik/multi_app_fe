import { useEffect, useMemo, useState } from 'react';
import { Box, Button } from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import { cfApi, qs } from '../api/client';
import type { Movement, MovementType } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { EmptyState, ErrorNotice, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { MovementsTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';

const TYPES: [MovementType | '', string][] = [['', 'All'], ['receipt', 'Receipts'], ['issue', 'Issues'], ['transfer', 'Transfers'], ['adjustment', 'Counts'], ['scrap', 'Scrap']];
const MOVE_TYPES: MovementType[] = ['receipt', 'issue', 'transfer', 'adjustment', 'scrap'];
/** The most the server will return in one go. */
const LIMIT = 500;

/** Every stock movement, newest first. Movements are never edited — a mistake is reversed. */
export default function Movements() {
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [type, setType] = useUrlParam('type', '');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [requested, setRequested] = useState<MovementType | null>(null);
  useNewParam((v) => { if (canManage) setRequested(MOVE_TYPES.includes(v as MovementType) ? (v as MovementType) : 'receipt'); });
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  // The type goes to the server: picking "Scrap" must search the whole ledger,
  // not only whichever of the newest 500 movements happen to be scrap.
  const list = useLoad(() => cfApi.get<Movement[]>(`/movements${qs({ search: debounced, type, limit: LIMIT })}`), [debounced, type]);
  const rows = useMemo(() => list.data ?? [], [list.data]);
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const stats = [
    { label: 'Movements', value: rows.length, hint: rows.length >= LIMIT ? `The newest ${LIMIT}; search or pick a type to narrow it` : 'All that match' },
    { label: 'This month', value: rows.filter((m) => m.movementDate?.startsWith(month)).length },
    { label: 'Receipts', value: rows.filter((m) => m.movementType === 'receipt' && !m.reversalOf).length, tone: 'success' as const, hint: 'Material booked in', onClick: () => setType('receipt') },
    { label: 'Reversed', value: rows.filter((m) => m.reversedBy).length, tone: 'warning' as const, hint: 'Undone by a reversal' },
  ];
  const filtered = !!debounced || !!type;

  return (
    <Box>
      <PageHeader title="Movements" subtitle="Receipts, issues, transfers, counts and scrap — the ledger every inventory is built from. A posted movement never changes; a mistake is undone by reversing it."
        actions={canManage && <MovementButtons types={MOVE_TYPES} onPosted={list.reload} requestOpen={requested} onRequestHandled={() => setRequested(null)} />} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search document, reference, supplier, order">
        {TYPES.map(([v, label]) => <FacetChip key={v || 'all'} label={label} active={type === v} onClick={() => setType(v)} />)}
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <MovementsTable rows={rows} storageKey="movements" loading={list.loading && !list.data}
        emptyNode={<EmptyState icon={<SwapHorizRounded />} title={filtered ? 'No movement matches' : 'No movements yet'}
          hint={filtered ? 'Clear the search or pick another type.' : 'The first receipt starts the ledger.'}
          action={filtered ? <Button onClick={() => { setSearch(''); setType(''); }}>Clear filters</Button> : undefined} />} />
    </Box>
  );
}
