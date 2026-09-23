import { useCallback, useEffect, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, TextField } from '@mui/material';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { cfApi, qs, type CfApiError } from '../api/client';
import type { MovementType, StockCategory, StockRow, StockingArea } from '../api/types';
import { useLoad } from '../hooks/useLoad';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { CATEGORY_LABEL } from '../lib/inventory';
import { EmptyState, ErrorNotice, PageHeader, StatStrip } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { StockTable } from '../components/StockTables';
import { MovementButtons } from '../components/MovementButtons';
import { useToast } from '../components/toastContext';

const CATEGORIES: (StockCategory | '')[] = ['', 'available', 'in_process', 'held', 'rejected', 'dispatch'];
const MOVE_TYPES: MovementType[] = ['receipt', 'issue', 'transfer', 'adjustment', 'scrap'];

interface LedgerCheck { ok: boolean; checked: number; differences: { areaId: number; itemId: number; batchId: number | null; ledger: number; balance: number }[] }

/** What is in stock, where, and what it counts as — across every stocking area. */
export default function Stock() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [category, setCategory] = useUrlParam('counts', '');
  const [areaParam, setAreaParam] = useUrlParam('areaId', '');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [requested, setRequested] = useState<MovementType | null>(null);
  const [checking, setChecking] = useState(false);
  const areaId = Number(areaParam) || null;
  useNewParam((v) => { if (canManage) setRequested(MOVE_TYPES.includes(v as MovementType) ? (v as MovementType) : 'receipt'); });
  useEffect(() => { const t = window.setTimeout(() => setDebounced(search), 250); return () => window.clearTimeout(t); }, [search]);
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const list = useLoad(() => cfApi.get<StockRow[]>(`/stock${qs({ search: debounced, areaId })}`), [debounced, areaId]);
  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => (category ? all.filter((r) => r.category === category) : all), [all, category]);
  // Counted over the rows shown, so the figures always agree with the table.
  const stats = [
    { label: 'Items', value: new Set(rows.map((r) => r.item.id)).size, hint: 'Different items in the list below' },
    { label: 'Stock lines', value: rows.length, hint: 'One line per item × area × batch' },
    { label: 'Areas holding', value: new Set(rows.map((r) => r.area.id)).size },
    { label: 'Cannot be used', value: rows.filter((r) => r.category === 'held' || r.category === 'rejected').length, tone: 'warning' as const, hint: 'In quarantine, on hold or rejected', onClick: () => setCategory('held') },
  ];
  const areaOptions = areas.data ?? [];
  const handled = useCallback(() => setRequested(null), []);
  const checkLedger = async () => {
    setChecking(true);
    try {
      const r = await cfApi.get<LedgerCheck>('/stock/check');
      if (r.ok) toast.success(`Ledger checked: all ${r.checked} balances agree with their movements.`);
      else toast.error(`${r.differences.length} balance${r.differences.length === 1 ? '' : 's'} disagree with the ledger — tell whoever looks after the system.`);
    } catch (e) { toast.error((e as CfApiError).message); } finally { setChecking(false); }
  };
  const filtered = !!debounced || !!areaId || !!category;

  return (
    <Box>
      <PageHeader title="Stock" subtitle="Every stocking area’s inventory in one list. Plates are kept by batch (with their heat); bolts and the like by quantity."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button startIcon={<FactCheckRounded />} onClick={checkLedger} disabled={checking} sx={{ color: 'var(--c-text-2)' }}>{checking ? 'Checking…' : 'Check ledger'}</Button>
            {canManage && <MovementButtons onPosted={list.reload} requestOpen={requested} onRequestHandled={handled} />}
          </Box>
        )} />
      <StatStrip stats={stats} />
      <FilterBar search={search} onSearch={setSearch} placeholder="Search item or batch">
        {CATEGORIES.map((c) => (
          <FacetChip key={c || 'all'} label={c ? CATEGORY_LABEL[c] : 'All'} active={category === c} count={all.filter((r) => !c || r.category === c).length} onClick={() => setCategory(c)} />
        ))}
        <Autocomplete size="small" options={areaOptions} value={areaOptions.find((a) => a.id === areaId) ?? null} getOptionLabel={(a) => `${a.code} · ${a.name}`}
          isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, a) => setAreaParam(a ? String(a.id) : '')} sx={{ flex: '1 1 220px', maxWidth: 320, minWidth: 0 }}
          renderInput={(p) => <TextField {...p} label="Stocking area" />} />
      </FilterBar>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <StockTable rows={rows} storageKey="stock" loading={list.loading && !list.data}
        empty={<EmptyState icon={<WarehouseRounded />} title={filtered ? 'Nothing matches' : 'Nothing in stock yet'}
          hint={filtered ? 'Clear the search, the area or what it counts as.' : 'Receive material into a stocking area to start its inventory.'}
          action={filtered ? <Button onClick={() => { setSearch(''); setAreaParam(''); setCategory(''); }}>Clear filters</Button>
            : canManage && <Button variant="contained" onClick={() => setRequested('receipt')}>Receive stock</Button>} />} />
    </Box>
  );
}
