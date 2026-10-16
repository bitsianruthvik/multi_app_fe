import { useCallback, useMemo, useState } from 'react';
import { Autocomplete, Box, Button, TextField } from '@mui/material';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { cfApi, type CfApiError } from '../api/client';
import type { MovementType, ScreenTree, StockingArea } from '../api/types';
import { checkLedger } from '../api/stockView';
import { kgText } from '../lib/money';
import { screenTreePath } from '../lib/classificationScreens';
import { flattenTree } from '../lib/tree';
import { TRACKINGS, TRACKING_CHIP, VIEW_CATEGORIES, VIEW_CATEGORY_LABEL, ledgerCheckMessage, partyName, quantitiesText } from '../lib/stockView';
import { useLoad } from '../hooks/useLoad';
import { useDebounced } from '../hooks/usePagedList';
import { useStockView } from '../hooks/useStockView';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useNewParam, useUrlParam } from '../hooks/useUrlState';
import { EmptyState, ErrorNotice, PageHeader } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { StockViewTable } from '../components/StockViewTable';
import { StockViewTotals } from '../components/StockViewTotals';
import { PieceHistoryDialog } from '../components/PieceHistoryDialog';
import { MovementButtons } from '../components/MovementButtons';
import { useToast } from '../components/toastContext';

const MOVE_TYPES: MovementType[] = ['receipt', 'issue', 'transfer', 'adjustment', 'scrap'];
const KINDS: { value: '' | 'standard' | 'custom'; label: string }[] = [
  { value: '', label: 'All items' }, { value: 'standard', label: 'Standard (catalog)' }, { value: 'custom', label: 'Custom (made for an order)' },
];

/** What is in stock, where, whose, and what it counts as — across every stocking area (GET /stock/view). */
export default function Stock() {
  const toast = useToast();
  const canManage = useIsPermitted()('cf_erp_inventory_manage');
  const [category, setCategory] = useUrlParam('counts', '');
  const [areaParam, setAreaParam] = useUrlParam('areaId', '');
  const [owner, setOwner] = useUrlParam('owner', '');
  const [kind, setKind] = useUrlParam('kind', '');
  const [tracking, setTracking] = useUrlParam('tracking', '');
  const [classParam, setClassParam] = useUrlParam('classificationId', '');
  const [search, setSearch] = useState('');
  const [requested, setRequested] = useState<MovementType | null>(null);
  const [checking, setChecking] = useState(false);
  const [piece, setPiece] = useState<number | null>(null);
  const areaId = Number(areaParam) || null;
  const classificationId = Number(classParam) || null;
  useNewParam((v) => { if (canManage) setRequested(MOVE_TYPES.includes(v as MovementType) ? (v as MovementType) : 'receipt'); });
  const debounced = useDebounced(search.trim());
  const areas = useLoad(() => cfApi.get<StockingArea[]>('/stocking-areas'), []);
  const tree = useLoad(() => cfApi.get<ScreenTree>(screenTreePath('items', true)).catch(() => null), []);
  const nodes = useMemo(() => flattenTree(tree.data), [tree.data]);
  // Every filter goes to the server, a page at a time; the chips, the totals and the scrap rate come back with the page.
  const list = useStockView({
    search: debounced || undefined, areaId, category: category || undefined, owner: owner || undefined,
    kind: kind || undefined, tracking: tracking || undefined, classificationId,
  });
  const counts = list.counts;
  const totals = list.totals;
  const parties = counts?.owners.parties ?? [];
  const customers = totals?.customers ?? [];
  const showOwner = parties.length > 0 || customers.length > 0 || list.rows.some((r) => r.owner);
  const pickOwner = (next: string) => setOwner(owner === next ? '' : next);
  const areaOptions = areas.data ?? [];
  const handled = useCallback(() => setRequested(null), []);
  const runCheck = async () => {
    setChecking(true);
    try {
      const m = ledgerCheckMessage(await checkLedger());
      if (m.ok) toast.success(m.text); else toast.error(m.text);
    } catch (e) { toast.error((e as CfApiError).message); } finally { setChecking(false); }
  };
  const filtered = !!debounced || !!areaId || !!category || !!owner || !!kind || !!tracking || !!classificationId;
  const clearAll = () => { setSearch(''); setAreaParam(''); setCategory(''); setOwner(''); setKind(''); setTracking(''); setClassParam(''); };

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Stock" subtitle="Every stocking area’s stock in one list. Each row is one item in one area, by owner and by what it counts as."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button startIcon={<FactCheckRounded />} onClick={runCheck} disabled={checking} sx={{ color: 'var(--c-text-2)' }}>{checking ? 'Checking…' : 'Check ledger'}</Button>
            {canManage && <MovementButtons onPosted={list.reload} requestOpen={requested} onRequestHandled={handled} />}
          </Box>
        )} />
      {totals && <StockViewTotals totals={totals} scrapRate={list.scrapRate} owner={owner} onOwner={setOwner} />}
      {customers.length > 0 && (
        <Box data-testid="customer-material-held" sx={{ mb: 2, fontSize: 13, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text)' }}>Customer material held</Box> (not ours, not in our value — pick a customer to see only theirs):{' '}
          {customers.map((c, i) => (
            <span key={c.party.id} data-testid="held-by-customer">{i > 0 && ' · '}
              <Box component="button" type="button" onClick={() => pickOwner(String(c.party.id))}
                sx={{ font: 'inherit', fontWeight: 700, color: owner === String(c.party.id) ? 'var(--c-primary-700)' : 'inherit', background: 'none', border: 0, p: 0, cursor: 'pointer', textDecoration: 'underline dotted' }}>{partyName(c.party)}</Box>
              {' '}{quantitiesText(c) || kgText(c.kg)}
            </span>
          ))}
        </Box>
      )}
      <FilterBar search={search} onSearch={setSearch} placeholder="Search item or lot">
        <FacetChip label="All" active={!category} count={counts?.categories.all} onClick={() => setCategory('')} />
        {VIEW_CATEGORIES.map((c) => (
          <FacetChip key={c} label={VIEW_CATEGORY_LABEL[c]} active={category === c} count={counts?.categories[c]} onClick={() => setCategory(category === c ? '' : c)} />
        ))}
      </FilterBar>
      <Box data-testid="stock-filters" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2, minWidth: 0 }}>
        {(parties.length > 0 || !!owner) && (
          <>
            <FacetChip label="All owners" active={!owner} onClick={() => setOwner('')} />
            <FacetChip label="Ours" active={owner === 'ours'} count={counts?.owners.ours} onClick={() => pickOwner('ours')} />
            <FacetChip label="All customers'" active={owner === 'customer'} count={parties.reduce((t, p) => t + p.n, 0)} onClick={() => pickOwner('customer')} />
            {parties.map((p) => <FacetChip key={p.id} label={`${partyName(p)}'s`} active={owner === String(p.id)} count={p.n} onClick={() => pickOwner(String(p.id))} />)}
          </>
        )}
        {KINDS.map((k) => (
          <FacetChip key={k.value || 'all'} label={k.label} active={kind === k.value} count={counts?.kinds[k.value || 'all']} onClick={() => setKind(k.value)} />
        ))}
        <FacetChip label="Any tracking" active={!tracking} count={counts?.tracking.all} onClick={() => setTracking('')} />
        {TRACKINGS.map((t) => (
          <FacetChip key={t} label={TRACKING_CHIP[t]} active={tracking === t} count={counts?.tracking[t]} onClick={() => setTracking(tracking === t ? '' : t)} />
        ))}
        <Autocomplete size="small" options={nodes} value={nodes.find((n) => n.id === classificationId) ?? null} getOptionLabel={(n) => n.path}
          isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, n) => setClassParam(n ? String(n.id) : '')} noOptionsText="No branch matches"
          sx={{ flex: '1 1 240px', maxWidth: 360, minWidth: 0 }}
          renderInput={(p) => <TextField {...p} label="Classification" inputProps={{ ...p.inputProps, 'data-testid': 'classification-filter' }} />} />
        <Autocomplete size="small" options={areaOptions} value={areaOptions.find((a) => a.id === areaId) ?? null} getOptionLabel={(a) => `${a.code} · ${a.name}`}
          isOptionEqualToValue={(a, b) => a.id === b.id} onChange={(_, a) => setAreaParam(a ? String(a.id) : '')} sx={{ flex: '1 1 220px', maxWidth: 320, minWidth: 0 }}
          renderInput={(p) => <TextField {...p} label="Stocking area" inputProps={{ ...p.inputProps, 'data-testid': 'area-filter' }} />} />
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      <StockViewTable rows={list.rows} showOwner={showOwner} loading={!list.loaded && !list.error} sort={list.sort} onSort={list.setSort} onOpenPiece={setPiece}
        footer={list.hasMore && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, p: 1.5, flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
            Showing {list.rows.length} of {list.total}.
            <Button size="small" onClick={() => { void list.loadMore(); }} disabled={list.loadingMore}>{list.loadingMore ? 'Loading…' : 'Load more'}</Button>
          </Box>
        )}
        empty={<EmptyState icon={<WarehouseRounded />} title={filtered ? 'Nothing matches' : 'Nothing in stock yet'}
          hint={filtered ? 'Clear the search or the filters.' : 'Receive material into a stocking area to start its stock.'}
          action={filtered ? <Button onClick={clearAll}>Clear filters</Button>
            : canManage && <Button variant="contained" onClick={() => setRequested('receipt')}>Receive stock</Button>} />} />
      <PieceHistoryDialog unitId={piece} onClose={() => setPiece(null)} />
    </Box>
  );
}
