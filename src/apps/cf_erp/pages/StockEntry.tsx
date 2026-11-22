import { Fragment, useMemo, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import type { CfApiError } from '../api/client';
import { qtyText, saveStockEntry, type EntryLot, type EntryLotIn, type EntryMeta, type EntryRow } from '../api/storesDesk';
import type { BrandRef, Party } from '../api/types';
import { useDebounced, usePagedList } from '../hooks/usePagedList';
import { useUrlParam } from '../hooks/useUrlState';
import { useIsPermitted } from '../hooks/useIsPermitted';
import { Badge, EmptyState, ErrorNotice, Mono, PageHeader, SkeletonRows } from '../components/ui';
import { FacetChip, FilterBar } from '../components/FilterBar';
import { BrandPicker } from '../components/BrandPicker';
import { PartyPicker } from '../components/ServerPicker';
import { ClassTreePicker } from '../components/Stores/ClassTreePicker';
import { pickFromParams, type TreePick } from '../components/Stores/classTree';
import { useToast } from '../components/toastContext';

const num = { textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;
const th = { fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--c-text-3)', textAlign: 'left', p: '8px 12px', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' } as const;
const td = { p: '8px 12px', borderBottom: '1px solid var(--c-divider)', fontSize: 13.5, verticalAlign: 'middle' } as const;
const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** One lot as it is being typed. */
interface Draft { key: string; lotId: number | null; loose: boolean; code: string | null; quantity: string; brand: BrandRef | null; vendor: Party | null; supplierRef: string; receivedOn: string; owner: string | null }
const draftOf = (l: EntryLot, i: number): Draft => ({
  key: `l${l.lotId ?? `loose${i}`}`, lotId: l.lotId, loose: l.lotId == null, code: l.code, quantity: String(l.quantity),
  brand: l.brand, vendor: l.vendor ? ({ id: l.vendor.id, name: l.vendor.name, code: '' } as Party) : null,
  supplierRef: l.supplierRef ?? '', receivedOn: l.receivedOn ?? '', owner: l.owner?.name ?? null,
});
let seq = 0;
const newDraft = (): Draft => ({ key: `n${seq += 1}`, lotId: null, loose: false, code: null, quantity: '', brand: null, vendor: null, supplierRef: '', receivedOn: todayIso(), owner: null });
const total = (ds: Draft[]) => ds.reduce((t, d) => t + (Number(d.quantity) || 0), 0);

/**
 * STORES › STOCK ENTRY — TEMPORARY (user, 2026-11-23: "1 temporary screen for now where they can see all the list like in
 * store/audit and change the number while they are auditing … segregate it by lots/batches/brands and all by double
 * clicking on the line. This will be active for next one week to ensure we get the data in correctly.")
 * Open while the company setting stock_entry_until has not passed (Setup › Settings › Stores: audits and the stock book);
 * the menu hides it after that. Every catalog item of one store area, its quantity there and its lots:
 *   type the quantity on the line and Save — when the item has one lot (or none) that is all;
 *   double-click the line (or the arrow) to split it: one row a lot — brand, vendor, the vendor's lot no., the day it came
 *   in, quantity — add a row for a lot not in the book, then Save.
 * A save is one adjustment of the differences, without an approval, kept as an audit of kind "entry" (so it counts for
 * the month's audit). "Not entered yet" lists what is left.
 */
export default function StockEntry() {
  const toast = useToast();
  const canStore = useIsPermitted()('cf_erp_stores|cf_erp_inventory_manage');
  const [areaParam, setAreaParam] = useUrlParam('areaId', '');
  const [famParam, setFamParam] = useUrlParam('fam', '');
  const [subParam, setSubParam] = useUrlParam('sub', '');
  const [varParam, setVarParam] = useUrlParam('var', '');
  const [todo, setTodo] = useUrlParam('todo', '1');
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim());
  const pick = useMemo(() => pickFromParams(famParam, subParam, varParam), [famParam, subParam, varParam]);
  const setPick = (p: TreePick) => { setFamParam(p.fam.join(',')); setSubParam(p.sub.join(',')); setVarParam(p.var.join(',')); };
  const list = usePagedList<EntryRow, EntryMeta>('/stores-desk/stock-entry', {
    areaId: areaParam || undefined, search: term || undefined, familyIds: famParam || undefined, subfamilyIds: subParam || undefined, variantIds: varParam || undefined, todo: todo === '1' ? 1 : undefined,
  });
  const meta = list.counts;
  const area = meta?.area ?? null;
  const open = meta?.window.open ?? false;
  /** What was saved here since the list was read: the item's lots as the server now has them. */
  const [saved, setSaved] = useState<Record<number, { book: number; lots: EntryLot[] }>>({});
  /** Lines being split: their lot rows as typed. */
  const [drafts, setDrafts] = useState<Record<number, Draft[]>>({});
  /** The quantity typed on a line that is not split. */
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, CfApiError | null>>({});

  const rowOf = (r: EntryRow) => (saved[r.item.id] ? { ...r, ...saved[r.item.id], entered: true } : r);
  const split = (r: EntryRow) => {
    const id = r.item.id;
    setDrafts((d) => {
      if (d[id]) { const n = { ...d }; delete n[id]; return n; }
      const lots = rowOf(r).lots;
      return { ...d, [id]: lots.length ? lots.map(draftOf) : [{ ...newDraft(), quantity: typed[id] && Number(typed[id]) > 0 ? typed[id] : '' }] };
    });
  };
  const setDraft = (id: number, key: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: d[id].map((x) => (x.key === key ? { ...x, ...patch } : x)) }));

  const save = async (r: EntryRow) => {
    if (!area) return;
    const id = r.item.id;
    const cur = rowOf(r);
    let lots: EntryLotIn[];
    const ds = drafts[id];
    if (ds) {
      lots = ds.filter((x) => x.lotId != null || x.loose || x.quantity !== '').map((x) => ({
        lotId: x.lotId, loose: x.loose && x.lotId == null ? true : undefined, quantity: Number(x.quantity || 0),
        brandId: x.brand?.id ?? null, vendorId: x.vendor?.id ?? null, supplierRef: x.supplierRef || null, receivedOn: x.receivedOn || null,
      }));
    } else {
      const q = Number(typed[id] ?? cur.book);
      if (cur.lots.length > 1 && Math.abs(q - cur.book) > 1e-9) { split(r); toast.error(`${r.item.name} has ${cur.lots.length} lots — say which lot changed.`); return; }
      const only = cur.lots[0];
      lots = only ? [{ lotId: only.lotId, loose: only.lotId == null ? true : undefined, quantity: q }] : [{ loose: true, quantity: q }];
    }
    setBusy(id); setErrors((e) => ({ ...e, [id]: null }));
    try {
      const res = await saveStockEntry({ areaId: area.id, itemId: id, lots });
      setSaved((s) => ({ ...s, [id]: { book: res.book, lots: res.lots } }));
      setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
      setTyped((t) => { const n = { ...t }; delete n[id]; return n; });
      toast.success(res.changed ? `${r.item.name}: ${qtyText(res.book)} ${r.item.uom} in ${res.lots.length} lot${res.lots.length === 1 ? '' : 's'}.` : `${r.item.name}: as in the book — marked entered.`);
    } catch (e) { setErrors((x) => ({ ...x, [id]: e as CfApiError })); } finally { setBusy(null); }
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader title="Stock entry" subtitle="Every item as it is on the shelf. Type the quantity and Save; double-click a line to split it by lot, brand and vendor." />
      {meta && (open
        ? <Alert severity="info" sx={{ mb: 2 }} data-testid="entry-open">This screen is temporary: it is open until <b>{meta.window.until}</b> to get the real stock in. Saves correct the book at once, without an approval, and count as this month's audit. {meta.entered} item{meta.entered === 1 ? '' : 's'} entered in this area so far.</Alert>
        : <Alert severity="warning" sx={{ mb: 2 }} data-testid="entry-closed">The stock entry screen is closed{meta.window.until ? ` (it was open until ${meta.window.until})` : ''}. Use Audit to correct the book. Setup › Settings can open it again.</Alert>)}
      <FilterBar search={search} onSearch={setSearch} placeholder="Search an item by name or code">
        <FacetChip label="Not entered yet" active={todo === '1'} onClick={() => setTodo('1')} />
        <FacetChip label="Every item" active={todo !== '1'} onClick={() => setTodo('0')} />
      </FilterBar>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, minWidth: 0, alignItems: 'center' }}>
        <ClassTreePicker groups={meta?.groups ?? []} value={pick} onChange={setPick} />
        {(meta?.areas.length ?? 0) > 1 && (
          <TextField select size="small" label="Store area" value={areaParam || String(area?.id ?? '')} onChange={(e) => setAreaParam(e.target.value)} sx={{ flex: '1 1 200px', maxWidth: 300, minWidth: 0 }}>
            {meta!.areas.map((a) => <MenuItem key={a.id} value={String(a.id)}>{a.name}</MenuItem>)}
          </TextField>
        )}
      </Box>
      <ErrorNotice error={list.error} onRetry={list.reload} />
      {!list.loaded && !list.error && <SkeletonRows rows={8} />}
      {list.loaded && list.rows.length === 0 && <EmptyState icon={<Inventory2Rounded />} title={todo === '1' ? 'Every item here is entered' : 'Nothing matches'} hint={todo === '1' ? 'Pick "Every item" to look at them again.' : 'Clear the search or the families.'} />}
      {list.rows.length > 0 && (
        <Box data-testid="entry-table" sx={{ border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', overflowX: 'auto', background: 'var(--c-surface)', opacity: list.refreshing ? 0.6 : 1 }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
            <thead><tr>
              <Box component="th" sx={{ ...th, width: 36, p: '8px 4px 8px 8px' }} /><Box component="th" sx={th}>Item</Box><Box component="th" sx={th}>Lots</Box>
              <Box component="th" sx={{ ...th, ...num }}>In the book</Box><Box component="th" sx={{ ...th, ...num }}>On the shelf</Box><Box component="th" sx={th} />
            </tr></thead>
            <tbody>
              {list.rows.map((r0) => {
                const r = rowOf(r0);
                const id = r.item.id;
                const ds = drafts[id];
                const shown = ds ? qtyText(total(ds)) : null;
                const t = typed[id] ?? String(r.book);
                const changed = !!ds || Math.abs(Number(t) - r.book) > 1e-9;
                return (
                  <Fragment key={id}>
                    <Box component="tr" data-testid="entry-row" onDoubleClick={() => open && split(r)} title={open ? 'Double-click to split by lot, brand and vendor' : undefined}
                      sx={{ background: ds ? 'var(--c-neutral-50)' : undefined, '&:hover': { background: 'var(--c-neutral-50)' } }}>
                      <Box component="td" sx={{ ...td, p: '8px 4px 8px 8px' }}>
                        <IconButton size="small" disabled={!open} onClick={() => split(r)} aria-label={ds ? 'Close the lots' : 'Split by lot'} data-testid="entry-split">{ds ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}</IconButton>
                      </Box>
                      <Box component="td" sx={{ ...td, minWidth: 220 }}>
                        <Box sx={{ fontWeight: 500, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>{r.item.name}{r.entered && <Badge family="success" label="Entered" noIcon />}</Box>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{[r.item.code, [r.group.family, r.group.subfamily, r.group.variant].filter(Boolean).join(' › '), r.item.uom].filter(Boolean).join(' · ')}</Typography>
                      </Box>
                      <Box component="td" sx={{ ...td, fontSize: 12.5, color: 'var(--c-text-2)', maxWidth: 280 }}>
                        {r.lots.length ? r.lots.map((l) => [l.code ?? 'no lot', l.brand?.name].filter(Boolean).join(' ')).join(', ') : '—'}
                      </Box>
                      <Box component="td" sx={{ ...td, ...num }}><Mono muted>{qtyText(r.book)}</Mono></Box>
                      <Box component="td" sx={{ ...td, ...num, width: 150 }}>
                        {ds ? <Mono>{shown}</Mono> : (
                          <TextField size="small" type="number" value={t} disabled={!open || !canStore} onChange={(e) => setTyped((x) => ({ ...x, [id]: e.target.value }))}
                            onDoubleClick={(e) => e.stopPropagation()} inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' }, 'aria-label': `${r.item.name} on the shelf`, 'data-testid': 'entry-qty' }} sx={{ width: 130 }} />
                        )}
                      </Box>
                      <Box component="td" sx={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {open && canStore && !ds && <Button size="small" variant={changed ? 'contained' : 'outlined'} disabled={busy === id} onClick={() => void save(r)} data-testid="entry-save">
                          {busy === id ? 'Saving…' : changed ? 'Save' : 'As in the book'}
                        </Button>}
                      </Box>
                    </Box>
                    {(ds || errors[id]) && (
                      <tr><Box component="td" colSpan={6} sx={{ p: 0, borderBottom: '1px solid var(--c-border)' }}>
                        <Box sx={{ p: 1.5, display: 'grid', gap: 1, background: 'var(--c-neutral-50)' }} data-testid="entry-lots">
                          {errors[id] && <ErrorNotice error={errors[id]} />}
                          {ds && <>
                            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>One row a lot as it is on the shelf. A lot you do not change stays as it is; set one to 0 when it is not there. Add a row for a lot the book does not have.</Typography>
                            {ds.map((x) => (
                              <Box key={x.key} data-testid="entry-lot" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', p: 1, border: '1px solid var(--c-border)', borderRadius: 'var(--r-sm, 6px)', background: 'var(--c-surface)' }}>
                                <Box sx={{ flex: '0 0 120px', minWidth: 0 }}>
                                  {x.lotId ? <Mono>{x.code}</Mono> : <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{x.loose ? 'Not in a lot yet' : 'New lot'}</Typography>}
                                  {x.owner && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{x.owner}'s</Typography>}
                                </Box>
                                <BrandPicker value={x.brand} onChange={(b) => setDraft(id, x.key, { brand: b })} minWidth={170} testId="entry-brand" />
                                <PartyPicker role="supplier" label="Vendor" value={x.vendor} onChange={(p) => setDraft(id, x.key, { vendor: p })} size="small" sx={{ flex: '1 1 200px', minWidth: 180, maxWidth: 280 }} />
                                <TextField size="small" label="Vendor's lot no." value={x.supplierRef} onChange={(e) => setDraft(id, x.key, { supplierRef: e.target.value })} sx={{ width: 150 }} />
                                <TextField size="small" label="Came in" type="date" value={x.receivedOn} onChange={(e) => setDraft(id, x.key, { receivedOn: e.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ max: todayIso() }} sx={{ width: 160 }} />
                                <TextField size="small" label={`Quantity (${r.item.uom})`} type="number" value={x.quantity} onChange={(e) => setDraft(id, x.key, { quantity: e.target.value })}
                                  inputProps={{ min: 0, step: 'any', style: { textAlign: 'right' }, 'data-testid': 'entry-lot-qty' }} sx={{ width: 140 }} />
                                {x.lotId == null && <IconButton size="small" aria-label="Remove this row" onClick={() => setDrafts((d) => ({ ...d, [id]: d[id].filter((y) => y.key !== x.key) }))}><DeleteOutlineRounded fontSize="small" /></IconButton>}
                              </Box>
                            ))}
                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                              <Button size="small" startIcon={<AddRounded />} onClick={() => setDrafts((d) => ({ ...d, [id]: [...d[id], newDraft()] }))} data-testid="entry-add-lot">Add a lot</Button>
                              <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', ml: 'auto' }}>Together <b>{qtyText(total(ds))}</b> {r.item.uom} (book {qtyText(r.book)})</Typography>
                              <Button size="small" onClick={() => split(r)}>Cancel</Button>
                              <Button size="small" variant="contained" disabled={busy === id} onClick={() => void save(r)} data-testid="entry-save-lots">{busy === id ? 'Saving…' : 'Save the lots'}</Button>
                            </Box>
                          </>}
                        </Box>
                      </Box></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Box>
        </Box>
      )}
      {list.rows.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, p: 1.5, flexWrap: 'wrap', fontSize: 13, color: 'var(--c-text-2)' }}>
          Showing {list.rows.length} of {list.total}.
          {list.hasMore && <Button size="small" onClick={() => { void list.loadMore(); }} disabled={list.loadingMore}>{list.loadingMore ? 'Loading…' : 'Load more'}</Button>}
        </Box>
      )}
    </Box>
  );
}
