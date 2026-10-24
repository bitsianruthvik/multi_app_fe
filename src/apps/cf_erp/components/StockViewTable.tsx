import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, IconButton, Typography } from '@mui/material';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import { getStockLots, listUnits, ownerParam, type StockUnit, type StockViewRow } from '../api/stockView';
import { useCompanySlug, useLoad } from '../hooks/useLoad';
import type { SortState } from './DataTable';
import { appPath } from '../navMeta';
import { kgText, rupeeText, dayText } from '../lib/money';
import { qtyText } from '../lib/inventory';
import { NO_SCRAP_RATE, TRACKING_HEADING, VIEW_CATEGORY_FAMILY, VIEW_CATEGORY_LABEL, partyName } from '../lib/stockView';
import { BatchStatusBadge } from './inventoryUi';
import { UnitStatusBadge } from './PieceHistoryDialog';
import { Badge, ErrorNotice, Mono, SkeletonRows, Surface } from './ui';
import { FlashOnChange } from '../motion';
import { staggerRow } from '../hooks/useSavedCheck';

export function ViewCategoryBadge({ category }: { category: StockViewRow['category'] }) {
  return <Badge family={VIEW_CATEGORY_FAMILY[category] ?? 'neutral'} label={VIEW_CATEGORY_LABEL[category] ?? category} />;
}

const muted = { fontSize: 12, color: 'var(--c-text-3)' };

/** What a row is worth: ours at cost; a customer's is theirs (a reference value only); scrap at the scrap rate. */
export function ValueCell({ row }: { row: StockViewRow }) {
  if (row.owner) {
    return (
      <Box data-testid="value-theirs">
        <Box component="span" sx={{ color: 'var(--c-text-2)' }}>theirs</Box>
        {row.referenceValue != null && <Box sx={muted}>ref. {rupeeText(row.referenceValue)}</Box>}
      </Box>
    );
  }
  return (
    <Box>
      <Mono>{rupeeText(row.value)}</Mono>
      {row.scrap && row.scrap.ratePerKg == null && <Box sx={muted} data-testid="scrap-note">{row.scrap.note ?? NO_SCRAP_RATE}</Box>}
      {!row.scrap && row.value != null && row.uncostedQty > 0 && <Box sx={muted}>some has no cost</Box>}
    </Box>
  );
}

function LotsPanel({ row }: { row: StockViewRow }) {
  const company = useCompanySlug();
  const lots = useLoad(() => getStockLots(row), [row.key]);
  if (lots.error) return <ErrorNotice error={lots.error} onRetry={lots.reload} />;
  if (!lots.data) return <SkeletonRows rows={2} height={28} />;
  if (lots.data.length === 0) return <Typography sx={muted}>No lots here now.</Typography>;
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      {lots.data.map((l) => (
        <Box key={l.batch.id} data-testid="lot-row" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, fontSize: 13, minWidth: 0 }}>
          <Link to={appPath(company, `batches/${l.batch.id}`)}><Mono>{l.batch.code}</Mono></Link>
          <BatchStatusBadge status={l.batch.status} />
          <Mono>{qtyText(l.quantity)} {row.item.uom}</Mono>
          {l.kg != null && row.item.uom.toLowerCase() !== 'kg' && <Mono muted>{kgText(l.kg)}</Mono>}
          <span>{row.owner ? (l.referenceValue != null ? <Box component="span" sx={muted}>theirs · ref. {rupeeText(l.referenceValue)}</Box> : <Box component="span" sx={muted}>theirs</Box>) : rupeeText(l.value)}</span>
          {l.piece && <span>piece <Mono>{l.piece.code ?? '—'}</Mono></span>}
          {l.offcut && <span>offcut <Link to={appPath(company, 'offcuts')}><Mono>{l.offcut.offcutNo}</Mono></Link></span>}
          {l.ownerOrder && <span>for <Link to={appPath(company, `orders/${l.ownerOrder.id}`)}><Mono>{l.ownerOrder.code}</Mono></Link></span>}
          {l.receivedOn && <Box component="span" sx={muted}>received {dayText(l.receivedOn)}</Box>}
        </Box>
      ))}
    </Box>
  );
}

const PIECE_PAGE = 50;

function PiecesPanel({ row, onOpenPiece }: { row: StockViewRow; onOpenPiece: (id: number) => void }) {
  const company = useCompanySlug();
  const [more, setMore] = useState<StockUnit[]>([]);
  const [busy, setBusy] = useState(false);
  const first = useLoad(() => listUnits({ itemId: row.item.id, areaId: row.area.id, owner: ownerParam(row.owner), status: 'live', limit: PIECE_PAGE, offset: 0 }), [row.key]);
  if (first.error) return <ErrorNotice error={first.error} onRetry={first.reload} />;
  if (!first.data) return <SkeletonRows rows={2} height={28} />;
  const units = [...first.data.rows, ...more];
  const total = Number(first.data.total) || units.length;
  if (units.length === 0) return <Typography sx={muted}>No pieces here now.</Typography>;
  const loadMore = async () => {
    setBusy(true);
    try {
      const a = await listUnits({ itemId: row.item.id, areaId: row.area.id, owner: ownerParam(row.owner), status: 'live', limit: PIECE_PAGE, offset: units.length });
      setMore((m) => [...m, ...a.rows]);
    } finally { setBusy(false); }
  };
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      {units.map((u) => (
        <Box key={u.id} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.5, fontSize: 13, minWidth: 0 }}>
          <Box component="button" type="button" data-testid="piece-row" onClick={() => onOpenPiece(u.id)}
            sx={{ font: 'inherit', color: 'var(--c-primary-700)', background: 'none', border: 0, p: 0, cursor: 'pointer', textDecoration: 'underline dotted' }}>
            <Mono>{u.code}</Mono>
          </Box>
          <UnitStatusBadge status={u.status} />
          {u.batch && <span>lot <Link to={appPath(company, `batches/${u.batch.id}`)}><Mono>{u.batch.code}</Mono></Link></span>}
          {u.order && <span><Link to={appPath(company, `orders/${u.order.id}`)}><Mono>{u.order.code}</Mono></Link>{u.order.lineNo != null && ` · line ${u.order.lineNo}`}</span>}
          {u.parent && <Box component="span" sx={muted}>inside <Mono>{u.parent.code}</Mono></Box>}
        </Box>
      ))}
      {units.length < total && (
        <Box><Button size="small" onClick={() => { void loadMore(); }} disabled={busy}>{busy ? 'Loading…' : `Show more pieces (${total - units.length} left)`}</Button></Box>
      )}
    </Box>
  );
}

type ColKey = 'item' | 'area' | 'owner' | 'qty' | 'kg' | 'value' | 'category';
const HIDE = { md: { xs: 'none', md: 'table-cell' }, sm: { xs: 'none', sm: 'table-cell' } } as const;

function HeadCell({ label, sortKey, sort, onSort, display, width, align }: {
  label: string; sortKey?: string; sort: SortState | null; onSort: (s: SortState | null) => void; display?: Record<string, string>; width?: string | number; align?: 'right';
}) {
  const active = sortKey && sort?.key === sortKey;
  const next = () => {
    if (!sortKey) return;
    if (!active) onSort({ key: sortKey, dir: 'asc' });
    else if (sort?.dir === 'asc') onSort({ key: sortKey, dir: 'desc' });
    else onSort(null);
  };
  return (
    <Box component="th" sx={{ display, width, textAlign: align ?? 'left', p: 1, fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', borderBottom: '1px solid var(--c-divider)' }}>
      {sortKey ? (
        <Box component="button" type="button" onClick={next} data-sort={sortKey}
          sx={{ font: 'inherit', color: active ? 'var(--c-primary-700)' : 'inherit', background: 'none', border: 0, p: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
          {label}{active && (sort?.dir === 'asc' ? <ArrowUpwardRounded sx={{ fontSize: 14 }} /> : <ArrowDownwardRounded sx={{ fontSize: 14 }} />)}
        </Box>
      ) : label}
    </Box>
  );
}

/**
 * The Stock list (GET /stock/view): one row per item × area × owner × what it
 * counts as, under a heading per tracking mode. A row kept in lots opens to its
 * lots; a row tracked piece by piece opens to its pieces. No horizontal scroll:
 * less important columns move under the item on a narrow screen.
 */
export function StockViewTable({ rows, showOwner, loading, sort, onSort, onOpenPiece, empty, footer }: {
  rows: StockViewRow[]; showOwner: boolean; loading: boolean; sort: SortState | null; onSort: (s: SortState | null) => void;
  onOpenPiece: (id: number) => void; empty: ReactNode; footer?: ReactNode;
}) {
  const company = useCompanySlug();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    setOpened((s) => (s.has(key) ? s : new Set(s).add(key)));
  };
  if (loading && rows.length === 0) return <SkeletonRows rows={6} />;
  if (rows.length === 0) return <>{empty}</>;
  const cols: ColKey[] = ['item', 'area', ...(showOwner ? ['owner' as const] : []), 'qty', 'kg', 'value', 'category'];
  const span = cols.length + 1;
  const td = { p: 1, fontSize: 13, verticalAlign: 'top', borderBottom: '1px solid var(--c-divider)', overflowWrap: 'anywhere' } as const;
  return (
    <Surface e={1} sx={{ overflow: 'hidden', mb: 2 }}>
      <Box component="table" data-testid="stock-view-table" sx={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <Box component="th" sx={{ width: 40, borderBottom: '1px solid var(--c-divider)' }} />
            <HeadCell label="Item" sortKey="item" sort={sort} onSort={onSort} />
            <HeadCell label="Area" sortKey="area" sort={sort} onSort={onSort} display={HIDE.md} />
            {showOwner && <HeadCell label="Owner" sortKey="owner" sort={sort} onSort={onSort} display={HIDE.md} />}
            <HeadCell label="Quantity" sortKey="qty" sort={sort} onSort={onSort} width="22%" />
            <HeadCell label="kg" sort={sort} onSort={onSort} display={HIDE.sm} />
            <HeadCell label="Value" sort={sort} onSort={onSort} display={HIDE.sm} />
            <HeadCell label="Counts as" sortKey="category" sort={sort} onSort={onSort} width="24%" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const mode = r.item.trackedBy;
            const heading = i === 0 || rows[i - 1].item.trackedBy !== mode;
            const isOpen = open.has(r.key);
            return (
              <Fragment key={r.key}>
                {heading && (
                  <tr>
                    <Box component="td" colSpan={span} data-testid="tracking-heading" data-mode={mode}
                      sx={{ px: 1.5, py: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-divider)' }}>
                      {TRACKING_HEADING[mode] ?? mode}
                    </Box>
                  </tr>
                )}
                <tr data-testid="stock-row" data-key={r.key} data-open={r.open ?? ''} {...staggerRow(i)}>
                  <Box component="td" sx={{ ...td, p: 0.5 }}>
                    {r.open && (
                      <IconButton size="small" data-testid="row-expand" aria-expanded={isOpen} aria-label={r.open === 'lots' ? 'Show the lots' : 'Show the pieces'} onClick={() => toggle(r.key)}>
                        {isOpen ? <ExpandMoreRounded fontSize="small" /> : <ChevronRightRounded fontSize="small" />}
                      </IconButton>
                    )}
                  </Box>
                  <Box component="td" sx={td}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
                      <Link to={appPath(company, `items/${r.item.id}`)}><Mono>{r.item.code ?? '—'}</Mono></Link>
                      {r.item.kind === 'custom' && <Badge family="neutral" noIcon label="custom" title="Made for an order — not a catalog item." />}
                    </Box>
                    <Box sx={{ color: 'var(--c-text-2)' }}>{r.item.name}</Box>
                    {/* Narrow screens: the hidden columns, in one line under the item. */}
                    <Box sx={{ ...muted, display: { xs: 'block', md: 'none' } }}>
                      {r.area.code}{showOwner && ` · ${partyName(r.owner)}`}
                      <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                        {r.kg != null && ` · ${kgText(r.kg)}`} · {r.owner ? 'theirs' : rupeeText(r.value)}
                      </Box>
                    </Box>
                  </Box>
                  <Box component="td" sx={{ ...td, display: HIDE.md }}>{r.area.code}<Box sx={muted}>{r.area.name}</Box></Box>
                  {showOwner && <Box component="td" sx={{ ...td, display: HIDE.md }}>{partyName(r.owner)}</Box>}
                  <Box component="td" sx={td}>
                    <FlashOnChange value={r.quantity}><Mono>{qtyText(r.quantity)} {r.item.uom}</Mono></FlashOnChange>
                    {r.open === 'lots' && r.lots > 0 && <Box sx={muted}>in {r.lots} lot{r.lots === 1 ? '' : 's'}</Box>}
                  </Box>
                  <Box component="td" sx={{ ...td, display: HIDE.sm }}><Mono>{r.kg == null ? '—' : kgText(r.kg)}</Mono></Box>
                  <Box component="td" sx={{ ...td, display: HIDE.sm }}><ValueCell row={r} /></Box>
                  <Box component="td" sx={td}><ViewCategoryBadge category={r.category} /></Box>
                </tr>
                {opened.has(r.key) && (
                  <tr data-testid={r.open === 'lots' ? 'lots-panel' : 'pieces-panel'} style={isOpen ? undefined : { display: 'none' }}>
                    <Box component="td" colSpan={span} sx={{ ...td, pl: { xs: 2, sm: 6 }, background: 'var(--c-surface-2)' }}>
                      {r.open === 'lots' ? <LotsPanel row={r} /> : <PiecesPanel row={r} onOpenPiece={onOpenPiece} />}
                    </Box>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Box>
      {footer}
    </Surface>
  );
}
