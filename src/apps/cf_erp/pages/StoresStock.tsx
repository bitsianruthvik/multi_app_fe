import { useMemo, useState } from 'react';
import { Autocomplete, Box, Button, MenuItem, TextField, Typography } from '@mui/material';
import PrintRounded from '@mui/icons-material/PrintRounded';
import WarehouseRounded from '@mui/icons-material/WarehouseRounded';
import { Link } from 'react-router-dom';
import { getDeskSettings, qtyText, type LedgerGroup, type LedgerRow, type StoreArea } from '../api/storesDesk';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { useUrlParam } from '../hooks/useUrlState';
import { appPath } from '../navMeta';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { GiveOutDialog, type GiveOutItem } from '../components/Stores/GiveOutDialog';
import { ItemLedgerDialog } from '../components/Stores/ItemLedgerDialog';
import { StockPrintDialog } from '../components/Stores/StockPrintDialog';
import { useToast } from '../components/toastContext';
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
 * THE FILTERS (user, 2026-11-22: "a proper filtering mechanism … to see a bunch of things only"), one question a row:
 *   What     All · each family of the catalog (Steel, Consumables, Tools, Spares …) · Work in progress · Offcuts, then
 *            the sub-family inside the chosen family. Work in progress and Offcuts are views of this same screen.
 *   Whose    All · Ours · Customer's
 *   State    In stock or moved · Below minimum · Reserved for an order · Out with someone · Every item
 *   Where / when   store area, and the period the opening / in / out are read over.
 * STORES › STOCK (init.sql §111) — the storekeeper's ledger: every item with what the period opened with, what came in,
 * what went out and what is there, over the store's own areas added up. Nothing here is typed in: In happens on Receive,
 * Out on a material request's "Issue now" (or, where the company allows it, Give out on the row), and a correction on Audit. A click on a row shows every event behind it.
 * The same page is what planning, production and purchase read on a phone: it folds to one card an item.
 */
export default function StoresStock() {
  const company = useCompanySlug();
  const toast = useToast();
  const isPermitted = useIsPermitted();
  const canStore = isPermitted('cf_erp_stores|cf_erp_inventory_manage');
  // 2026-11-23: stock leaves the store against a material request (Issue now on the request). The loose Give out shows
  // only on a company that switched it on (Setup › Settings › Stores: the day).
  const desk = useLoad(() => getDeskSettings(), []);
  const canGive = canStore && desk.data?.giveOutLoose === true;
  const [period, setPeriod] = useUrlParam('period', 'month');
  const [show, setShow] = useUrlParam('show', 'stock');
  const [areaParam, setAreaParam] = useUrlParam('areaId', '');
  // 2026-11-23 (user): several families, sub-families and variants at once — each list narrowed by the one above.
  const [famParam, setFamParam] = useUrlParam('fam', '');
  const [subParam, setSubParam] = useUrlParam('sub', '');
  const [varParam, setVarParam] = useUrlParam('var', '');
  const [printing, setPrinting] = useState(false);
  const [owner, setOwner] = useUrlParam('owner', '');
  /** What: '' = the store's stock, 'wip' or 'offcuts'. */
  const [what, setWhat] = useUrlParam('what', '');
  const other = what === 'wip' || what === 'offcuts';
  const [basket, setBasket] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [giving, setGiving] = useState<GiveOutItem | null>(null);
  const term = useDebounced(search.trim());
  const { from, to } = useMemo(() => periodOf(period), [period]);
  // A search looks through every item: the storekeeper is looking for something to give out, whether or not it has stock.
  const list = usePagedList<LedgerRow, Meta>('/stores-desk/ledger', {
    from, to, search: term || undefined, show: term ? 'all' : show, areaId: areaParam || undefined, familyIds: famParam || undefined, subfamilyIds: subParam || undefined, variantIds: varParam || undefined, owner: owner || undefined,
  });
  const meta = list.counts;
  const areas = meta?.areas ?? [];
  const groups = useMemo(() => meta?.groups ?? [], [meta]);
  const families = useMemo(() => { const m = new Map<number, string>(); for (const g of groups) if (g.familyId != null && !m.has(g.familyId)) m.set(g.familyId, g.family ?? ''); return [...m].sort((a, b) => a[1].localeCompare(b[1])); }, [groups]);
  const famSet = new Set(famParam.split(',').filter(Boolean).map(Number));
  const subSet = new Set(subParam.split(',').filter(Boolean).map(Number));
  const varSet = new Set(varParam.split(',').filter(Boolean).map(Number));
  const subOpts = useMemo(() => { const m = new Map<number, { id: number; label: string; familyId: number }>(); for (const g of groups) if (g.subfamilyId != null && (!famSet.size || famSet.has(g.familyId)) && !m.has(g.subfamilyId)) m.set(g.subfamilyId, { id: g.subfamilyId, label: famSet.size === 1 ? g.subfamily : `${g.family} › ${g.subfamily}`, familyId: g.familyId }); return [...m.values()]; }, [groups, famParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const varOpts = useMemo(() => groups.filter((g) => g.variantId != null && (!famSet.size || famSet.has(g.familyId)) && (!subSet.size || subSet.has(g.subfamilyId)))
    .map((g) => ({ id: g.variantId as number, label: `${subSet.size === 1 ? '' : `${g.subfamily} › `}${g.variant}`, items: g.items })), [groups, famParam, subParam]); // eslint-disable-line react-hooks/exhaustive-deps
  const famOpts = families.map(([id, name]) => ({ id, label: name }));
  const setIds = (setter: (v: string) => void) => (_: unknown, v: { id: number }[]) => setter(v.map((x) => x.id).join(','));
  const pickWhat = (k: string) => { setWhat(k); };
  const filtered = !!term || !!areaParam || !!famParam || !!subParam || !!varParam || !!owner || !!what || show !== 'stock';
  const filterWords = [
    famSet.size ? famOpts.filter((o) => famSet.has(o.id)).map((o) => o.label).join(', ') : 'every family',
    subSet.size ? subOpts.filter((o) => subSet.has(o.id)).map((o) => o.label).join(', ') : null,
    varSet.size ? varOpts.filter((o) => varSet.has(o.id)).map((o) => o.label).join(', ') : null,
    SHOWS.find(([k]) => k === (term ? 'all' : show))?.[1], owner ? OWNERS.find(([k]) => k === owner)?.[1] : null,
    areaParam ? areas.find((a) => String(a.id) === areaParam)?.name : 'all store areas', term ? `"${term}"` : null, `${from} to ${to}`,
  ].filter(Boolean).join(' · ');
  const give = (r: LedgerRow) => setGiving({ id: r.item.id, name: r.item.name, uom: r.item.uom, returnable: r.item.returnable, inStock: r.now, issueConditions: r.item.issueConditions ?? null });

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Stock" subtitle="What the store opened with, what came in, what went out and what is there. Click an item to see every entry behind its numbers."
        actions={(
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {canGive && <Button variant="contained" onClick={() => setBasket(true)} data-testid="give-out-several">Give out</Button>}
            {canStore && !canGive && <Button component={Link} to={appPath(company, 'material-requests')} variant="contained" data-testid="go-requests">Give out: open Requests</Button>}
            {canStore && <Button component={Link} to={appPath(company, 'receive')} variant="outlined">Receive against a PO</Button>}
            {!other && <Button variant="outlined" startIcon={<PrintRounded />} onClick={() => setPrinting(true)} data-testid="stock-print-open">Print / download</Button>}
            <Button component={Link} to={appPath(company, 'stock')} sx={{ color: 'var(--c-text-2)' }}>Every area, by lot and owner</Button>
          </Box>
        )} />
      <Box data-testid="ledger-what" role="group" aria-label="What" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', mr: 0.5 }}>What</Typography>
        <FacetChip label="Stock" active={!what} onClick={() => pickWhat('')} />
        <FacetChip label="Work in progress" active={what === 'wip'} onClick={() => pickWhat('wip')} />
        <FacetChip label="Offcuts" active={what === 'offcuts'} onClick={() => pickWhat('offcuts')} />
      </Box>
      {what === 'wip' && <WorkInProgress embedded />}
      {what === 'offcuts' && <Offcuts embedded />}
      {!other && <>
      <FilterBar search={search} onSearch={setSearch} placeholder="Search an item by name or code">
        {PERIODS.map(([k, label]) => <FacetChip key={k} label={label} active={period === k} onClick={() => setPeriod(k)} />)}
        <Box sx={{ width: '1px', height: 20, background: 'var(--c-border)', mx: 0.5 }} aria-hidden />
        {SHOWS.map(([k, label]) => <FacetChip key={k} label={label} active={!term && show === k} onClick={() => setShow(k)} />)}
      </FilterBar>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, minWidth: 0 }}>
        <Autocomplete multiple size="small" options={famOpts} value={famOpts.filter((o) => famSet.has(o.id))} onChange={setIds(setFamParam)} getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label="Family" placeholder={famSet.size ? '' : 'Every family'} />} sx={{ flex: '1 1 220px', maxWidth: 360, minWidth: 0 }} data-testid="ledger-families" />
        <Autocomplete multiple size="small" options={subOpts} value={subOpts.filter((o) => subSet.has(o.id))} onChange={setIds(setSubParam)} getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label="Sub-family" placeholder={subSet.size ? '' : 'Every sub-family'} />} sx={{ flex: '1 1 240px', maxWidth: 380, minWidth: 0 }} data-testid="ledger-subfamilies" />
        <Autocomplete multiple size="small" options={varOpts} value={varOpts.filter((o) => varSet.has(o.id))} onChange={setIds(setVarParam)} getOptionLabel={(o) => o.label} isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label="Variant" placeholder={varSet.size ? '' : 'Every variant'} />} sx={{ flex: '1 1 240px', maxWidth: 380, minWidth: 0 }} data-testid="ledger-variants" />
        <Box data-testid="ledger-owner" role="group" aria-label="Whose stock" sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {OWNERS.map(([k, label]) => <FacetChip key={k || 'all'} label={label} active={owner === k} onClick={() => setOwner(k)} />)}
        </Box>
        {areas.length > 1 && (
          <TextField select size="small" label="Store area" value={areaParam} onChange={(e) => setAreaParam(e.target.value)} sx={{ flex: '1 1 200px', maxWidth: 300, minWidth: 0 }}>
            <MenuItem value="">All store areas, added up</MenuItem>
            {areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.loaded && !list.error && <SkeletonRows rows={8} />}
      {list.loaded && list.rows.length === 0 && (
        <EmptyState icon={<WarehouseRounded />} title={filtered ? 'Nothing matches' : 'Nothing in the store yet'}
          hint={filtered ? 'Clear the search, or pick "Every item".' : 'Stock arrives by Receive against a PO. "Every item" lists the catalog.'}
          action={<Button onClick={() => { setSearch(''); setShow('all'); setFamParam(''); setSubParam(''); setVarParam(''); setAreaParam(''); setOwner(''); setWhat(''); }}>Show every item</Button>} />
      )}
      {list.rows.length > 0 && (
        <>
          {/* Desk: the ledger as a table. */}
          <Box data-testid="ledger-table" sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflowX: 'auto', background: 'var(--c-surface)', opacity: list.refreshing ? 0.6 : 1 }}>
            <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <Box component="th" sx={th}>Item</Box><Box component="th" sx={{ ...th, ...num }}>Opening</Box><Box component="th" sx={{ ...th, ...num }}>In</Box>
                <Box component="th" sx={{ ...th, ...num }}>Out</Box><Box component="th" sx={{ ...th, ...num }}>Balance</Box><Box component="th" sx={{ ...th, ...num }}>Out with</Box>
                <Box component="th" sx={{ ...th, ...num }}>On order</Box><Box component="th" sx={th} />
              </tr></thead>
              <tbody>
                {list.rows.map((r) => (
                  <Box component="tr" key={r.item.id} data-testid="ledger-row" onClick={() => setOpen(r.item.id)} sx={{ cursor: 'pointer', '&:hover': { background: 'var(--c-neutral-50)' } }}>
                    <Box component="td" sx={{ ...td, minWidth: 220 }}>
                      <Box sx={{ fontWeight: 500 }}>{r.item.name}</Box>
                      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[r.item.code, [r.group.subfamily, r.group.variant].filter(Boolean).join(' › '), r.item.uom].filter(Boolean).join(' · ')}{r.reserved > 0 ? ` · ${qtyText(r.reserved)} reserved` : ''}{!owner && r.customers > 0 ? ` · ${qtyText(r.customers)} is a customer's` : ''}</Typography>
                    </Box>
                    <Box component="td" sx={{ ...td, ...num }}><Mono muted>{qtyText(r.opening)}</Mono></Box>
                    <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.in}>{qtyText(r.in)}</Mono></Box>
                    <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.out}>{qtyText(r.out)}</Mono></Box>
                    <Box component="td" sx={{ ...td, ...num, fontWeight: 600, color: r.low ? 'var(--c-danger-700)' : undefined }}><Mono>{qtyText(r.balance)}</Mono>{r.low && <Box sx={{ fontSize: 11.5, fontWeight: 500 }}>min {qtyText(r.min)}</Box>}</Box>
                    <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.outWith}>{r.outWith ? qtyText(r.outWith) : '—'}</Mono></Box>
                    <Box component="td" sx={{ ...td, ...num }}><Mono muted={!r.onOrder}>{r.onOrder ? qtyText(r.onOrder) : '—'}</Mono></Box>
                    <Box component="td" sx={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canGive && r.now > 0 && <Button size="small" variant="outlined" data-testid="give-out" onClick={(e) => { e.stopPropagation(); give(r); }}>Give out</Button>}
                    </Box>
                  </Box>
                ))}
              </tbody>
            </Box>
          </Box>
          {/* Phone: one card an item — the balance first, the rest in a line. */}
          <Box data-testid="ledger-cards" sx={{ display: { xs: 'grid', md: 'none' }, gap: 1, opacity: list.refreshing ? 0.6 : 1 }}>
            {list.rows.map((r) => (
              <Box key={r.item.id} onClick={() => setOpen(r.item.id)} sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', background: 'var(--c-surface)', p: 1.5, display: 'grid', gap: 0.75, cursor: 'pointer' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, alignItems: 'baseline' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ fontWeight: 500, fontSize: 14.5, overflowWrap: 'anywhere' }}>{r.item.name}</Box>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{r.group.subfamily ?? r.item.code}</Typography>
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
                  {canGive && r.now > 0 && <Button size="small" variant="outlined" sx={{ ml: 'auto' }} onClick={(e) => { e.stopPropagation(); give(r); }}>Give out</Button>}
                </Box>
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
      <StockPrintDialog open={printing} onClose={() => setPrinting(false)} title={`Stock — ${from === to ? to : `${from} to ${to}`}`} filterWords={filterWords}
        query={{ from, to, search: term || undefined, show: term ? 'all' : show, areaId: areaParam || undefined, familyIds: famParam || undefined, subfamilyIds: subParam || undefined, variantIds: varParam || undefined, owner: owner || undefined }} />
      <ItemLedgerDialog itemId={open} from={from} to={to} onClose={() => setOpen(null)} />
      <GiveOutDialog item={giving} open={basket} areas={areas} onClose={() => { setGiving(null); setBasket(false); }} onDone={(text) => { toast.success(text); list.reload(); }} />
    </Box>
  );
}
