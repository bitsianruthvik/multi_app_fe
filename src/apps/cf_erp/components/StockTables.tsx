import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import type { Movement, StockRow, StockTotals } from '../api/types';
import { useCompanySlug } from '../hooks/useLoad';
import { appPath } from '../navMeta';
import { CATEGORY_LABEL, MOVEMENT_LABEL, qtyText } from '../lib/inventory';
import { Mono, StatStrip } from './ui';
import { DataTable, type DataColumn } from './DataTable';
import { BatchStatusBadge, CategoryBadge, MovementTypeChip } from './inventoryUi';

/**
 * Totals by what the stock counts as — only the ones that hold something, after
 * "On hand". Each figure is shown exactly: half a tonne must not read as "0".
 */
export function TotalsStrip({ totals, uom }: { totals: StockTotals & { reserved?: number; free?: number }; uom?: string }) {
  const unit = uom ? ` ${uom}` : '';
  const fig = (label: string, value: number, extra: { tone?: 'success' | 'info' | 'warning' | 'danger'; hint?: string } = {}) => ({
    label, value, display: `${qtyText(value)}${unit}`, ...extra,
  });
  const stats = [
    fig('On hand', totals.onHand, { hint: 'Everywhere, whatever it counts as' }),
    fig('Available', totals.available, { tone: 'success', hint: 'In storage, not held' }),
    ...(totals.in_process ? [fig('In process', totals.in_process, { tone: 'info', hint: 'In WIP areas beside a machine' })] : []),
    ...(totals.held ? [fig('Held', totals.held, { tone: 'warning', hint: 'In quarantine or on hold — not issued' })] : []),
    ...(totals.rejected ? [fig('Rejected', totals.rejected, { tone: 'danger', hint: 'Never issued — move or scrap it' })] : []),
    ...(totals.dispatch ? [fig('Dispatch', totals.dispatch, { hint: 'Finished and waiting to leave' })] : []),
    ...(totals.reserved ? [
      fig('Reserved', totals.reserved, { tone: 'info', hint: 'Set aside for released orders' }),
      fig('Free', totals.free ?? 0, { hint: 'Usable and not reserved' }),
    ] : []),
  ];
  return <StatStrip stats={stats} />;
}

const cellLink = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/**
 * What sits where. `hide` drops the column the page already names (the item on
 * an item page, the area on an area page); `bare` is for a table inside a card.
 */
export function StockTable({ rows, hide = [], bare = false, storageKey, empty, loading }: {
  rows: StockRow[]; hide?: ('item' | 'area')[]; bare?: boolean; storageKey?: string; empty?: ReactNode; loading?: boolean;
}) {
  const company = useCompanySlug();
  const columns: DataColumn<StockRow>[] = [
    ...(!hide.includes('item') ? [{
      key: 'item', header: 'Item', alwaysVisible: true, sortValue: (r: StockRow) => r.item.code, exportValue: (r: StockRow) => r.item.code,
      render: (r: StockRow) => (
        <Box sx={{ py: 0.5 }}>
          <Mono><Box component={Link} to={appPath(company, `items/${r.item.id}`)} sx={cellLink}>{r.item.code ?? '—'}</Box></Mono>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{r.item.name}</Typography>
        </Box>
      ),
    }] : []),
    ...(!hide.includes('area') ? [{
      key: 'area', header: 'Area', sortValue: (r: StockRow) => r.area.code,
      render: (r: StockRow) => <Mono><Box component={Link} to={appPath(company, `stocking-areas/${r.area.id}`)} sx={cellLink} title={r.area.name}>{r.area.code}</Box></Mono>,
    }] : []),
    {
      key: 'batch', header: 'Batch', sortValue: (r) => r.batch?.code,
      render: (r) => (r.batch ? (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Mono><Box component={Link} to={appPath(company, `batches/${r.batch.id}`)} sx={cellLink}>{r.batch.code}</Box></Mono>
          {r.batch.status !== 'available' && <BatchStatusBadge status={r.batch.status} />}
        </Box>
      ) : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>—</Box>),
    },
    { key: 'qty', header: 'Quantity', numeric: true, sortValue: (r) => r.quantity, render: (r) => <>{qtyText(r.quantity)} <Mono muted>{r.item.uom}</Mono></> },
    { key: 'category', header: 'Counts as', sortValue: (r) => r.category, exportValue: (r) => CATEGORY_LABEL[r.category], render: (r) => <CategoryBadge category={r.category} /> },
    { key: 'updated', header: 'Last moved', sortValue: (r) => r.updatedAt, render: (r) => <Mono muted>{String(r.updatedAt).slice(0, 10)}</Mono>, defaultHidden: true },
  ];
  return (
    <DataTable rows={rows} columns={columns} getRowId={(r) => `${r.area.id}-${r.item.id}-${r.batch?.id ?? 0}`} bare={bare} loading={loading}
      storageKey={storageKey} exportName={storageKey} empty={empty ?? <Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>Nothing in stock.</Typography>} />
  );
}

/** Movements, newest first; each opens its document. */
export function MovementsTable({ rows, empty = 'No movements yet.', bare = false, storageKey, emptyNode, loading }: {
  rows: Movement[]; empty?: string; bare?: boolean; storageKey?: string; emptyNode?: ReactNode; loading?: boolean;
}) {
  const company = useCompanySlug();
  const navigate = useNavigate();
  const columns: DataColumn<Movement>[] = [
    {
      key: 'code', header: 'Document', alwaysVisible: true, sortValue: (m) => m.code,
      render: (m) => (
        <Box sx={{ py: 0.5 }}>
          <Mono chip>{m.code}</Mono>
          {m.reversedBy && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', mt: 0.25 }}>reversed by {m.reversedBy.code}</Typography>}
        </Box>
      ),
    },
    { key: 'type', header: 'Type', sortValue: (m) => m.movementType, exportValue: (m) => MOVEMENT_LABEL[m.movementType], render: (m) => <MovementTypeChip type={m.movementType} reversal={!!m.reversalOf} /> },
    { key: 'date', header: 'Date', sortValue: (m) => m.movementDate, render: (m) => <Mono muted>{m.movementDate}</Mono> },
    { key: 'items', header: 'Items', sortValue: (m) => m.itemCodes, render: (m) => <><Mono>{m.itemCodes}</Mono>{m.lineCount > 1 && <Mono muted> · {m.lineCount} lines</Mono>}</> },
    { key: 'areas', header: 'Areas', sortValue: (m) => m.areaCodes, render: (m) => <Mono>{m.areaCodes}</Mono> },
    {
      key: 'for', header: 'For / from', sortValue: (m) => m.party?.name ?? m.order?.code ?? m.reason ?? m.reference,
      render: (m) => <Box sx={{ color: 'var(--c-text-2)' }}>{m.party?.name ?? (m.order ? `Order ${m.order.code}` : null) ?? m.reason ?? m.reference ?? '—'}</Box>,
    },
    { key: 'reference', header: 'Reference', sortValue: (m) => m.reference, render: (m) => <Mono muted>{m.reference ?? '—'}</Mono>, defaultHidden: true },
  ];
  return (
    <DataTable rows={rows} columns={columns} getRowId={(m) => m.id} onRowClick={(m) => navigate(appPath(company, `movements/${m.id}`))} bare={bare} loading={loading}
      storageKey={storageKey} exportName={storageKey} defaultSortKey="date" defaultSortDir="desc"
      empty={emptyNode ?? <Typography sx={{ color: 'var(--c-text-3)', p: 2 }}>{empty}</Typography>} />
  );
}
