import { Box, Tooltip, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import type { BoardCard, BoardColumn } from '../../api/buying';
import { useCompanySlug } from '../../hooks/useLoad';
import { appPath } from '../../navMeta';
import { VALUE_BASIS_WORD, ageText, boardValueText, cardValueText, moreHref } from '../../lib/buying';
import { Mono } from '../ui';

/**
 * The Buying board's columns, left to right, each a stage with its documents as
 * cards (user, 2026-10-02: "Documents on the board — no 'by material' view for
 * now"). Every figure comes from GET /buying/board: a column's count and value
 * cover all of its cards, also those beyond the cap ("N more" opens the list).
 */

const linkSx = { color: 'inherit', textDecoration: 'none', '&:hover': { color: 'var(--c-primary-700)', textDecoration: 'underline' } };

function Card({ card, company }: { card: BoardCard; company: string }) {
  const to = appPath(company, card.link);
  const valueTitle = card.value == null ? 'No price is known yet' : `${VALUE_BASIS_WORD[card.valueBasis]}${card.valueState === 'part' ? `; ${card.unpricedLines} line${card.unpricedLines === 1 ? '' : 's'} not priced` : ''}`;
  return (
    <Box data-testid="board-card" data-type={card.type} data-id={card.id}
      sx={{
        display: 'grid', gap: 0.5, p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-surface)', border: '1px solid var(--c-border)',
        boxShadow: 'var(--shadow-1, none)', minWidth: 0,
        '&:hover': { borderColor: 'var(--c-primary-200)' },
      }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0, justifyContent: 'space-between' }}>
        <Mono sx={{ fontWeight: 600, fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Box component={Link} to={to} sx={linkSx}>{card.code}</Box>
        </Mono>
        {card.type !== 'to_buy' && <Typography component="span" sx={{ fontSize: 11, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>{card.type === 'po' ? 'PO' : card.type === 'rfq' ? 'RFQ' : 'Request'}</Typography>}
      </Box>
      {card.party?.name && (
        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${card.party.role}: ${card.party.name}`}>
          {card.party.name}
        </Typography>
      )}
      {card.type === 'po' && !card.party?.name && <Typography sx={{ fontSize: 12.5, color: 'var(--c-warning-700)' }}>No supplier yet</Typography>}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', fontSize: 12 }}>
        {card.type !== 'to_buy' && <Box component="span" sx={{ color: 'var(--c-text-3)' }}>{card.items} {card.items === 1 ? 'item' : 'items'}</Box>}
        <Tooltip title={valueTitle}>
          <Box component="span" data-testid="card-value" sx={{ fontFamily: 'var(--font-mono)', color: card.value == null ? 'var(--c-text-3)' : 'var(--c-text)', fontWeight: card.value == null ? 400 : 600 }}>
            {cardValueText(card)}
          </Box>
        </Tooltip>
      </Box>
      {(card.ageDays != null || card.due) && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--c-text-3)' }}>
          {card.ageDays != null && <span title="Time at this stage">{ageText(card.ageDays)}</span>}
          {card.due && (
            <Box component="span" sx={{ color: card.due.overdue ? 'var(--c-danger-700)' : 'inherit', fontWeight: card.due.overdue ? 600 : 400 }}>
              {card.due.overdue ? 'overdue ' : 'due '}{card.due.date}
            </Box>
          )}
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

function Column({ column, company, compact }: { column: BoardColumn; company: string; compact: boolean }) {
  return (
    <Box data-testid="board-column" data-key={column.key} role="region" aria-label={`${column.label}: ${column.count}`}
      sx={{
        flex: `0 0 ${compact ? 190 : 240}px`, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0,
        p: 1, borderRadius: 'var(--r-md)', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)',
      }}>
      <Tooltip title={column.hint} placement="top-start">
        <Box sx={{ display: 'grid', gap: 0.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--c-text-2)' }}>{column.label}</Typography>
            <Mono sx={{ fontSize: 12 }}><span data-testid="column-count">{column.count}</span></Mono>
          </Box>
          <Box data-testid="column-value" sx={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: column.value == null ? 'var(--c-text-3)' : 'var(--c-text-2)' }}>
            {column.count === 0 ? '—' : boardValueText(column.value, column.unpriced, column.count)}
          </Box>
        </Box>
      </Tooltip>
      {column.cards.map((c) => <Card key={`${c.type}:${c.id}`} card={c} company={company} />)}
      {column.count === 0 && <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', py: 0.5 }}>Nothing here</Typography>}
      {column.more > 0 && (
        <Box component={Link} to={appPath(company, moreHref(column))} data-testid="column-more" sx={{ fontSize: 12.5, color: 'var(--c-primary-700)', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
          {column.more} more
        </Box>
      )}
    </Box>
  );
}

export function BuyingBoardView({ columns, compact = false }: { columns: BoardColumn[]; compact?: boolean }) {
  const company = useCompanySlug();
  return (
    <Box data-testid="buying-board" sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', overflowX: 'auto', pb: 1, minWidth: 0, scrollbarWidth: 'thin' }}>
      {columns.map((c) => <Column key={c.key} column={c} company={company} compact={compact} />)}
    </Box>
  );
}
