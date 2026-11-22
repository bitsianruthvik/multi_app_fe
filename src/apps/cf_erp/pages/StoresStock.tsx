import { Fragment, useMemo, useState } from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import PrintRounded from '@mui/icons-material/PrintRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { Link } from 'react-router-dom';
import { qtyText, type LedgerGroup, type LedgerRow, type StoreArea } from '../api/storesDesk';
import { useCompanySlug } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { ItemLedgerDialog } from '../components/Stores/ItemLedgerDialog';
import { StockPrintDialog } from '../components/Stores/StockPrintDialog';
import { ClassTreePicker } from '../components/Stores/ClassTreePicker';
import { pickFromParams, pickWords, type TreePick } from '../components/Stores/classTree';
import { LotSplit } from '../components/Stores/LotSplit';
import WorkInProgress from './WorkInProgress';
import Offcuts from './Offcuts';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** This month, this week (from Monday) or today, as from / to. */
function periodOf(key: string): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  if (key === 'today') return { from: to, to };
  if (key === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: iso(d), to }; }
  return { from: `${to.slice(0, 8)}01`, to };
}
const PERIODS = [['month', 'This month'], ['week', 'This week'], ['today', 'Today']] as const;
/** Whose stock: ours, a customer's material kept for their order, or both added up (user, 2026-11-22). */
const OWNERS = [['', 'All'], ['ours', 'Ours'], ['customer', "Customer's"]] as const;
const SHOWS = [['stock', 'In stock or moved'], ['low', 'Below minimum'], ['reserved', 'Reserved for an order'], ['out', 'Out with someone'], ['all', 'Every item']] as const;
type Meta = { period: { from: string; to: string }; areas: StoreArea[]; groups: LedgerGroup[] };
const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;
const th = { fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', textAlign: 'left', p: '8px 12px', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' } as const;
const td = { p: '9px 12px', borderBottom: '1px solid var(--c-divider)', fontSize: 13.5, verticalAlign: 'middle' } as const;

/**
 * STORES › STOCK (init.sql §111) — the storekeeper's ledger: every item with what the period opened with, what came in,
 * what went out and what is there, over the store's own areas added up. Nothing here is typed in and nothing goes out
 * from here (user, 2026-11-23: "Stock out option should go away from each item in the stock page as it should only happen
 * on an MR. Even the button on the top should go away"): In happens on Receive, Out on a material request's Give out /
 * Issue now, a correction on Audit.
 *   Double-click a line → its LOTS open under it (area, brand, vendor, vendor's lot no., date, quantity, held, cost);
 *   the ledger icon (or "Every entry") → every entry behind the numbers. On a phone a tap opens the lots.
 *   Filters: What (Stock · Work in progress · Offcuts) · period · state · ONE family › sub-family › variant tree
 *   (components/Stores/ClassTreePicker) · whose · store area · ?item= one item (the item page's Stock link).
 * The same page is what planning, production and purchase read on a phone: it folds to one card an item.
 */
export default function StoresStock() {
  const company = useCompanySlug();
  const isPermitted = useIsPermitted();
  const canStore = isPermitted('cf_erp_stores|cf_erp_inventory_manage');
  const [period, setPeriod] = useUrlParam('period', 'month');
  const [show, setShow] = useUrlParam('show', 'stock');
  const [areaParam, setAreaParam] = useUrlParam('areaId', '');
  const [famParam, setFamParam] = useUrlParam('fam', '');
  const [subParam, setSubParam] = useUrlParam('sub', '');
  const [varParam, setVarParam] = useUrlParam('var', '');
  const [itemParam, setItemParam] = useUrlParam('item', '');
  const [printing, setPrinting] = useState(false);
  const [owner, setOwner] = useUrlParam('owner', '');
  /** What: '' = the store's stock, 'wip' or 'offcuts'. */
  const [what, setWhat] = useUrlParam('what', '');
  const other = what === 'wip' || what === 'offcuts';
  const [search, setSearch] = useState('');
  const [ledgerOf, setLedgerOf] = useState<number | null>(null);
  const [opened, setOpened] = useState<Set<number>>(() => new Set(itemParam ? [Number(itemParam)] : []));
  const term = useDebounced(search.trim());
  const { from, to } = useMemo(() => periodOf(period), [period]);
  const pick = useMemo(() => pickFromParams(famParam, subParam, varParam), [famParam, subParam, varParam]);
  const setPick = (p: TreePick) => { setFamParam(p.fam.join(',')); setSubParam(p.sub.join(',')); setVarParam(p.var.join(',')); };
  const query = {
    from, to, search: term || undefined, show: term || itemParam ? 'all' : show, areaId: areaParam || undefined,
    familyIds: famParam || undefined, subfamilyIds: subParam || undefined, variantIds: varParam || undefined, owner: owner || undefined, itemId: itemParam || undefined,
  };
  const list = usePagedList<LedgerRow, Meta>('/stores-desk/ledger', query);
  const meta = list.counts;
  const areas = meta?.areas ?? [];
  const groups = useMemo(() => meta?.groups ?? [], [meta]);
  const filtered = !!term || !!areaParam || !!famParam || !!subParam || !!varParam || !!owner || !!what || !!itemParam || show !== 'stock';
  const filterWords = [
    pickWords(groups, pick).map((w) => w.label).join(', ') || 'every family',
    SHOWS.find(([k]) => k === (term ? 'all' : show))?.[1], owner ? OWNERS.find(([k]) => k === owner)?.[1] : null,
    areaParam ? areas.find((a) => String(a.id) === areaParam)?.name : 'all store areas', term ? `"${term}"` : null, `${from} to ${to}`,
  ].filter(Boolean).join(' · ');
  const toggle = (id: number) => setOpened((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearAll = () => { setSearch(''); setShow('all'); setPick({ fam: [], sub: [], var: [] }); setAreaParam(''); setOwner(''); setWhat(''); setItemParam(''); };

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Stock" subtitle="What the store opened with, what came in, what went out and what is there. Double-click a line to split it by lot, brand and vendor."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canStore && <Button component={Link} to={appPath(company, 'receive')} variant="outlined">Receive against a PO</Button>}
            {!other && <Button variant="outlined" startIcon={<PrintRounded />} onClick={() => setPrinting(true)} data-testid="stock-print-open">Print / download</Button>}
          </Box>
        )} />
      <Box data-testid="ledger-what" role="group" aria-label="What" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 0.5 }}>What</Typography>
        <FacetChip label="Stock" active={!what} onClick={() => setWhat('')} />
        <FacetChip label="Work in progress" active={what === 'wip'} onClick={() => setWhat('wip')} />
        <FacetChip label="Offcuts" active={what === 'offcuts'} onClick={() => setWhat('offcuts')} />
      </Box>
      {what === 'wip' && <WorkInProgress embedded />}
      {what === 'offcuts' && <Offcuts embedded />}
      {!other && <>
      <FilterBar search={search} onSearch={setSearch} placeholder="Search an item by name or code">
        {PERIODS.map(([k, label]) => <FacetChip key={k} label={label} active={period === k} onClick={() => setPeriod(k)} />)}
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        {SHOWS.map(([k, label]) => <FacetChip key={k} label={label} active={!term && show === k} onClick={() => setShow(k)} />)}
      </FilterBar>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, minWidth: 0, alignItems: 'center' }}>
        <ClassTreePicker groups={groups} value={pick} onChange={setPick} />
        <Box data-testid="ledger-owner" role="group" aria-label="Whose stock" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {OWNERS.map(([k, label]) => <FacetChip key={k || 'all'} label={label} active={owner === k} onClick={() => setOwner(k)} />)}
        </Box>
        {areas.length > 1 && (
          <TextField select size="small" label="Store area" value={areaParam} onChange={(e) => setAreaParam(e.target.value)} sx={{ flex: '1 1 200px', maxWidth: 300, minWidth: 0 }}>
            <MenuItem value="">All store areas, added up</MenuItem>
            {areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
          </TextField>
        )}
        {itemParam && <Button size="small" onClick={() => setItemParam('')} data-testid="all-items">Show every item, not just this one</Button>}
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.loaded && !list.error && <SkeletonRows rows={8} />}
      {list.loaded && list.rows.length === 0 && (
        <EmptyState icon={<WarehouseRounded />} title={filtered ? 'Nothing matches' : 'Nothing in the store yet'}
          hint={filtered ? 'Clear the search, or pick "Every item".' : 'Stock arrives by Receive against a PO. "Every item" lists the catalog.'}
          action={<Button onClick={clearAll}>Show every item</Button>} />
      )}
      {list.rows.length > 0 && (
        <>
          {/* Desk: the ledger as a table; a double-click opens the line's lots under it. */}
          <Box data-testid="ledger-table" sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflowX: 'auto', background: 'var(--c-surface)', opacity: list.refreshing ? 0.6 : 1 }}>
            <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <Box component="th" sx={{ ...th, width: 36, p: '8px 4px 8px 8px' }} /><Box component="th" sx={th}>Item</Box><Box component="th" sx={{ ...th, ...num }}>Opening</Box><Box component="th" sx={{ ...th, ...num }}>In</Box>
                <Box component="th" sx={{ ...th, ...num }}>Out</Box><Box component="th" sx={{ ...th, ...num }}>Balance</Box><Box component="th" sx={{ ...th, ...num }}>Out with</Box>
                <Box component="th" sx={{ ...th, ...num }}>On order</Box><Box component="th" sx={th} />
              </tr></thead>
              <tbody>
                {list.rows.map((r) => {
                  const isOpen = opened.has(r.item.id);
                  return (
                    <Fragment key={r.item.id}>
                      <Box component="tr" data-testid="ledger-row" onDoubleClick={() => toggle(r.item.id)} title="Double-click to split by lot"
                        sx={{ cursor: 'pointer', userSelect: 'none', background: isOpen ? 'var(--c-neutral-50)' : undefined, '&:hover': { background: 'var(--c-neutral-50)' } }}>
                        <Box component="td" sx={{ ...td, p: '9px 4px 9px 8px' }}>
                          <IconButton size="small" onClick={() => toggle(r.item.id)} aria-label={isOpen ? 'Close the lots' : 'Open the lots'} data-testid="lots-toggle">{isOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton>
                        </Box>
                        <Box component="td" sx={{ ...td, minWidth: 220 }}>
                          <Box sx={{ fontWeight: 500 }}>{r.item.name}</Box>
                          <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[r.item.code, [r.group.family, r.group.subfamily, r.group.variant].filter(Boolean).join(' › '), r.item.uom].filter(Boolean).join(' · ')}{r.reserved > 0 ? ` · ${qtyText(r.reserved)} reserved` : ''}{!owner && r.customers > 0 ? ` · ${qtyText(r.customers)} is a customer's` : ''}</Typography>
                        </Box>
                        <Box component="td" sx={{ ...td, ...num }}><Mono muted>{qtyText(r.opening)}</Mono></Box>
                        <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.in}>{qtyText(r.in)}</Mono></Box>
                        <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.out}>{qtyText(r.out)}</Mono></Box>
                        <Box component="td" sx={{ ...td, ...num, fontWeight: 600, color: r.low ? 'var(--c-danger-700)' : undefined }}><Mono>{qtyText(r.balance)}</Mono>{r.low && <Box sx={{ fontSize: 11.5, fontWeight: 500 }}>min {qtyText(r.min)}</Box>}</Box>
                        <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.outWith}>{r.outWith ? qtyText(r.outWith) : '—'}</Mono></Box>
                        <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.onOrder}>{r.onOrder ? qtyText(r.onOrder) : '—'}</Mono></Box>
                        <Box component="td" sx={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', p: '9px 8px' }}>
                          <Tooltip title="Every entry"><IconButton size="small" onClick={(e) => { e.stopPropagation(); setLedgerOf(r.item.id); }} aria-label="Every entry" data-testid="ledger-open"><ReceiptLongRounded fontSize="small" /></IconButton></Tooltip>
                        </Box>
                      </Box>
                      {isOpen && (
                        <tr><Box component="td" colSpan={9} sx={{ p: 0, borderBottom: '1px solid var(--c-border)' }}>
                          <LotSplit itemId={r.item.id} from={from} to={to} showCost={canStore} onEntries={() => setLedgerOf(r.item.id)} />
                        </Box></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </Box>
          </Box>
          {/* Phone: one card an item — the balance first, the rest in a line; a tap opens its lots. */}
          <Box data-testid="ledger-cards" sx={{ display: { xs: 'grid', md: 'none' }, gap: 1, opacity: list.refreshing ? 0.6 : 1 }}>
            {list.rows.map((r) => (
              <Box key={r.item.id} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', overflow: 'hidden' }}>
                <Box onClick={() => toggle(r.item.id)} sx={{ p: 1.5, display: 'grid', gap: 0.75, cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'baseline' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontWeight: 500, fontSize: 14.5, overflowWrap: 'anywhere' }}>{r.item.name}</Box>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[r.group.subfamily, r.group.variant].filter(Boolean).join(' › ') || r.item.code}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Box sx={{ fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: r.low ? 'var(--c-danger-700)' : undefined }}>{qtyText(r.balance)}</Box>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.item.uom}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: 'var(--c-text-2)' }}>
                    <span>In {qtyText(r.in)} · Out {qtyText(r.out)}</span>
                    {r.low && <Badge family="danger" label={`Below min ${qtyText(r.min)}`} noIcon />}
                    {r.reserved > 0 && <Badge family="warning" label={`${qtyText(r.reserved)} reserved`} noIcon />}
                    {!owner && r.customers > 0 && <Badge family="neutral" label={`${qtyText(r.customers)} customer's`} noIcon />}
                    {r.outWith > 0 && <Badge family="info" label={`${qtyText(r.outWith)} out with`} noIcon />}
                    {r.onOrder > 0 && <Badge family="neutral" label={`${qtyText(r.onOrder)} on order`} noIcon />}
                  </Box>
                </Box>
                {opened.has(r.item.id) && <LotSplit itemId={r.item.id} from={from} to={to} showCost={canStore} onEntries={() => setLedgerOf(r.item.id)} />}
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, p: 1.5, flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
            Showing {list.rows.length} of {list.total}.
            {list.hasMore && <Button size="small" onClick={() => { void list.loadMore(); }} disabled={list.loadingMore}>{list.loadingMore ? 'Loading…' : 'Load more'}</Button>}
          </Box>
        </>
      )}
      </>}
      <StockPrintDialog open={printing} onClose={() => setPrinting(false)} title={`Stock — ${from === to ? to : `${from} to ${to}`}`} filterWords={filterWords} query={query} />
      <ItemLedgerDialog itemId={ledgerOf} from={from} to={to} onClose={() => setLedgerOf(null)} />
    </Box>
  );
}
