import { Box, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { PurchaseCard, PurchaseLane } from '../../api/purchase';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { rupeeText } from '../../lib/money';
import { NOT_PRICED, valueText } from '../../lib/purchaseFlow';
import { Mono } from '../ui';

/**
 * The Purchase tab's swim lanes: one column per stage, a purchase order as a card in exactly one of them. Every
 * figure is the server's (GET /purchase/board, GET /orders/:id/purchase). A value that is null is not priced —
 * never ₹0.
 */

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

export function PurchaseCardView({ card, company }: { card: PurchaseCard; company: string }) {
  const to = appPath(company, `purchase-orders/${card.id}`);
  return (
    <Box data-testid="purchase-card" data-id={card.id}
      sx={{
        display: 'grid', gap: 0.5, p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        boxShadow: 'var(--shadow-1, none)', minWidth: 0, '&:hover': { borderColor: 'var(--c-primary-200)' },
      }}>
      <Mono sx={{ fontWeight: 600, fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <Box component={Link} to={to} sx={linkSx}>{card.code}</Box>
      </Mono>
      {card.supplier
        ? <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={card.supplier.name}>{card.supplier.name}</Typography>
        : <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>No supplier yet</Typography>}
      {card.forOrder && (
        <Box>
          <Mono chip><Box component={Link} to={appPath(company, `orders/${card.forOrder.id}`)} sx={linkSx} title="The sales order this is bought for">{card.forOrder.code}</Box></Mono>
        </Box>
      )}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', fontSize: 12 }}>
        <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{card.lines} {card.lines === 1 ? 'line' : 'lines'}</Box>
        <Box component="span" data-testid="card-value" sx={{ fontFamily: 'var(--font-mono)', color: card.value == null ? 'var(--c-text-3)' : 'var(--c-text)', fontWeight: card.value == null ? 400 : 600 }}>
          {valueText(card.value)}
        </Box>
      </Box>
      {card.nextDue && (
        <Box component="span" data-testid="card-due" sx={{ fontSize: 11.5, color: card.overdue ? 'var(--c-danger-700)' : 'var(--c-text-3)', fontWeight: card.overdue ? 600 : 400 }}>
          {card.overdue ? 'overdue ' : 'due '}{card.nextDue}
        </Box>
      )}
      {card.tags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {card.tags.map((t) => (
            <Box key={t} component="span" sx={{ fontSize: 11, px: 0.5, py: '1px', borderRadius: 'var(--r-sm)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>{t}</Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

function Lane({ lane, company, compact }: { lane: PurchaseLane; company: string; compact: boolean }) {
  return (
    <Box data-testid="purchase-lane" data-key={lane.key} role="region" aria-label={`${lane.label}: ${lane.count}`}
      sx={{
        flex: `0 0 ${compact ? 190 : 240}px`, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0,
        p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
      }}>
      <Tooltip title={lane.hint} placement="top-start">
        <Box sx={{ display: 'grid', gap: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-2)' }}>{lane.label}</Typography>
            <Mono sx={{ fontSize: 12 }}><span data-testid="lane-count">{lane.count}</span></Mono>
          </Box>
          <Box data-testid="lane-value" sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-text-2)' }}>
            {lane.count === 0 ? '—' : lane.value > 0 ? rupeeText(lane.value, 0) : NOT_PRICED}
          </Box>
        </Box>
      </Tooltip>
      {lane.cards.map((c) => <PurchaseCardView key={c.id} card={c} company={company} />)}
      {lane.count === 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', py: 0.5 }}>Nothing here</Typography>}
    </Box>
  );
}

export function PurchaseLanes({ lanes, compact = false }: { lanes: PurchaseLane[]; compact?: boolean }) {
  const company = useCompanySlug();
  return (
    <Box data-testid="purchase-lanes" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', overflowX: 'auto', pb: 1, minWidth: 0, scrollbarWidth: 'thin' }}>
      {lanes.map((l) => <Lane key={l.key} lane={l} company={company} compact={compact} />)}
    </Box>
  );
}
