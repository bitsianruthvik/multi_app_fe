import { Box, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { getBuyingBoard, getLineMaterialReady, type BuyingCard, type BuyingColumn } from '../../api/requisitions';
import { useCompanySlug, useLoad } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { shortDate } from '../../lib/requisition';
import { EmptyState, ErrorNotice, Mono, SkeletonBlock } from '../ui';
import { MaterialReadyChip } from './MaterialReadyChip';

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

/** A small tag on a card: stock held for the order, a delivery date, material skipped. Words first, colour second. */
function Tag({ kind, label, title, tone = 'neutral' }: { kind: string; label: string; title: string; tone?: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }) {
  return (
    <Tooltip title={title}>
      <Box component="span" data-testid="board-tag" data-kind={kind}
        sx={{ fontSize: 11.5, px: 0.5, py: '1px', borderRadius: 'var(--r-sm)', background: `var(--c-${tone === 'neutral' ? 'surface-2' : `${tone}-50`})`, color: `var(--c-${tone === 'neutral' ? 'text-2' : `${tone}-800`})` }}>{label}</Box>
    </Tooltip>
  );
}

export function RequisitionCard({ card, company }: { card: BuyingCard; company: string }) {
  const c = card.counts;
  const mr = card.materialReady;
  return (
    <Box data-testid="req-card" data-id={card.id} data-status={card.status} data-waiting={c.waiting > 0 ? 'true' : 'false'}
      sx={{ display: 'grid', gap: 0.5, p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-surface)', border: '1px solid var(--c-border)', minWidth: 0, '&:hover': { borderColor: 'var(--c-primary-200)' } }}>
      <Mono sx={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <Box component={Link} to={`${appPath(company, `orders/${card.order.id}`)}?tab=buying`} sx={linkSx}>{card.code}</Box>
      </Mono>
      <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }} noWrap>{card.order.code} · line {card.line.lineNo}{card.line.name ? ` · ${card.line.name}` : ''}</Typography>
      <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>{card.sentence}</Typography>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {c.from_stock > 0 && <Tag kind="stock" tone="success" label={`From stock ${c.from_stock}`} title={`${c.from_stock} of ${c.lines} materials are held for this line. Nobody else can plan on that stock.`} />}
        {(c.covered > 0 || c.ordered_undated > 0) && (
          <Tag kind="order" tone={card.late ? 'danger' : 'info'} label={`On order ${c.covered + c.ordered_undated}${card.lastDate ? ` · last ${shortDate(card.lastDate)}` : ''}`}
            title={card.late ? 'A delivery is overdue.' : 'Bought, with receiving dates.'} />
        )}
        {c.asked > 0 && <Tag kind="asked" tone="warning" label={`Asked for ${c.asked}`} title="Asked for and not ordered yet. Production waits until it is ordered with a date." />}
        {c.skipped > 0 && <Tag kind="skipped" tone="warning" label={`Skipped ${c.skipped}`} title="Buying skipped. The work waits for stock." />}
        {c.open + c.part > 0 && <Tag kind="open" label={`Open ${c.open + c.part}`} title="Not decided yet: hold stock, buy, or skip." />}
      </Box>
      {mr && <Box><MaterialReadyChip state={mr.state} date={mr.readyDate} text={mr.text} testId="card-ready" load={() => getLineMaterialReady(card.line.id).then((r) => r.materials)} /></Box>}
    </Box>
  );
}

function Lane({ col, company }: { col: BuyingColumn; company: string }) {
  return (
    <Box data-testid="req-lane" data-key={col.key} role="region" aria-label={`${col.label}: ${col.count}`}
      sx={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
      <Tooltip title={col.hint} placement="top-start">
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-2)' }}>{col.label}</Typography>
          <Mono sx={{ fontSize: 12 }}>{col.count}</Mono>
        </Box>
      </Tooltip>
      {col.cards.map((c) => <RequisitionCard key={c.id} card={c} company={company} />)}
      {col.count === 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', py: 0.5 }}>Nothing here</Typography>}
    </Box>
  );
}

/**
 * The requisitions of every open order by how far each has got — and, first, the ones whose work is waiting for stock
 * because buying was skipped. A card is a requisition; open it to decide material by material.
 */
export function RequisitionBoard({ orderId, search, canManage }: { orderId: number | null; search: string; canManage: boolean }) {
  const company = useCompanySlug();
  const load = useLoad(() => getBuyingBoard({ orderId, search }), [orderId, search]);
  const cols = load.data?.columns ?? [];
  const cards = cols.flatMap((c) => c.cards);
  const waiting = load.data?.waitingForStock?.cards ?? [];
  const notRaised = load.data?.notRaised ?? [];
  return (
    <Box data-testid="req-board" sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <ErrorNotice error={load.error} onRetry={load.reload} />
      {!load.data && !load.error && <SkeletonBlock h={260} r={8} />}
      {load.data && cards.length === 0 && notRaised.length === 0 && (
        <EmptyState title="No requisitions yet" hint={canManage ? 'Open a sales order’s Buying stage and raise its requisition.' : 'A requisition is raised from a sales order’s Buying stage.'} />
      )}
      {waiting.length > 0 && (
        <Box data-testid="waiting-group" sx={{ display: 'grid', gap: 0.75, p: 1.25, borderRadius: 'var(--r-md)', border: '1px solid var(--c-warning-200, var(--c-border))', background: 'var(--c-warning-50)' }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-warning-800)' }}>{load.data?.waitingForStock?.label ?? 'Waiting for stock'} (skipped) · {load.data?.waitingForStock?.count ?? waiting.length}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>Buying was skipped for these. The work starts when the stock is in the store, and stops again if another order takes it.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 1 }}>
            {waiting.map((c) => <RequisitionCard key={c.id} card={c} company={company} />)}
          </Box>
        </Box>
      )}
      {cards.length > 0 && (
        <Box data-testid="req-lanes" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', overflowX: 'auto', pb: 1, minWidth: 0, scrollbarWidth: 'thin' }}>
          {cols.map((c) => <Lane key={c.key} col={c} company={company} />)}
        </Box>
      )}
      {notRaised.length > 0 && (
        <Box data-testid="not-raised" sx={{ display: 'grid', gap: 0.75 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>No requisition yet · {notRaised.length}</Typography>
          {notRaised.map((n) => (
            <Box key={`${n.order.id}-${n.line.id}`} data-testid="not-raised-row" sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
              <Box component={Link} to={`${appPath(company, `orders/${n.order.id}`)}?tab=buying`} sx={{ ...linkSx, fontFamily: 'var(--font-mono)' }}>{n.order.code}</Box>
              <span>line {n.line.lineNo} · {n.materials} {n.materials === 1 ? 'material' : 'materials'}</span>
              {n.materialReady && <MaterialReadyChip state={n.materialReady.state} date={n.materialReady.readyDate} text={n.materialReady.text} testId="not-raised-ready" />}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

