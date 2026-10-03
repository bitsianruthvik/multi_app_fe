import { Box, Button, Radio, Tooltip, Typography } from '@mui/material';
import BoltRounded from '@mui/icons-material/BoltRounded';
import type { Comparison, ComparisonCell, ComparisonLine } from '../api/procurement';
import { qtyText } from '../lib/inventory';
import { dayText, priceText, rupeeText } from '../lib/money';
import { awardedTotals, canAward, cellFor, isExpired, NOT_QUOTED, type Choices } from '../lib/procurement';
import { Money } from './Money';
import { Mono } from './ui';

const cellSx = { px: 1.25, py: 1, verticalAlign: 'top', borderBottom: '1px solid var(--c-divider)', fontSize: 13 } as const;
const headSx = { ...cellSx, textAlign: 'left', fontWeight: 600, fontSize: 12.5, color: 'var(--c-text-2)', background: 'var(--c-surface-2)', verticalAlign: 'bottom' } as const;

/** One supplier's answer for one line: the landed unit price, the amount, and why it is marked. */
function Cell({ line, cell, name, chosen, editable, onPick }: {
  line: ComparisonLine; cell: ComparisonCell | undefined; name: string; chosen: boolean; editable: boolean; onPick: () => void;
}) {
  const quoted = !!cell && cell.unitPrice != null;
  const expired = isExpired(cell);
  const awardable = canAward(cell);
  const flags = [cell?.cheapest && quoted && !expired ? 'cheapest' : '', cell?.fastest && quoted && !expired ? 'fastest' : '', expired ? 'expired' : '', !quoted ? 'not-quoted' : '', chosen ? 'chosen' : ''].filter(Boolean).join(' ');
  const green = flags.includes('cheapest');
  return (
    <Box component="td" data-testid={`cmp-cell-${line.rfqLine.id}-${name}`} data-flags={flags}
      sx={{ ...cellSx, background: chosen ? 'var(--c-primary-50)' : green ? 'var(--c-success-50)' : undefined, opacity: expired ? 0.6 : 1, minWidth: 150 }}>
      {!quoted ? (
        <Money value={null} missing={NOT_QUOTED} />
      ) : (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <Radio size="small" sx={{ p: 0.25, mt: -0.25 }} checked={chosen} disabled={!editable || !awardable} onChange={onPick}
            inputProps={{ 'aria-label': `Award ${line.rfqLine.item.code ?? line.rfqLine.item.name} to ${name}` }} />
          <Box sx={{ minWidth: 0 }}>
            <Mono sx={{ fontWeight: green ? 600 : 400, color: green ? 'var(--c-success-800)' : undefined }}>{priceText(cell.landedUnit ?? cell.unitPrice)}</Mono>
            <Box component="span" sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}> each, landed</Box>
            <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)' }}>
              <Money value={cell.amount} digits={2} missing={NOT_QUOTED} /> for {qtyText(cell.partial && cell.qtyOffered != null ? cell.qtyOffered : line.rfqLine.quantity)}
            </Box>
            <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
              {cell.leadTimeDays != null ? `${cell.leadTimeDays} days` : 'lead time not stated'}
              {cell.gstRate != null ? ` · GST ${cell.gstRate}%` : ''}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
              {green && <Box component="span" sx={{ fontSize: 11, color: 'var(--c-success-800)', fontWeight: 600 }}>cheapest</Box>}
              {flags.includes('fastest') && <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontSize: 11, color: 'var(--c-info-800)', fontWeight: 600 }}><BoltRounded sx={{ fontSize: 13 }} />fastest</Box>}
              {cell.partial && <Tooltip title="The supplier offered less than the quantity asked. The rest goes back to the buy list."><Box component="span" sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-warning-800)' }}>offers {qtyText(cell.qtyOffered)} of {qtyText(line.rfqLine.quantity)}</Box></Tooltip>}
              {expired && <Tooltip title="The quote's validity date has passed. It can still be awarded, but check the price is still good."><Box component="span" sx={{ fontSize: 11, fontWeight: 600 }}>expired</Box></Tooltip>}
            </Box>
          </Box>
        </Box>
      )}
      {cell?.lastPaid && (
        <Box data-testid="cmp-last-paid" sx={{ fontSize: 11, color: 'var(--c-text-3)', mt: 0.25 }}>last paid {priceText(cell.lastPaid.price)}{cell.lastPaid.date ? ` on ${dayText(cell.lastPaid.date)}` : ''}</Box>
      )}
    </Box>
  );
}

/**
 * The comparison: lines down, suppliers across. Landed means the price with the freight shared in, and before GST
 * (GST is recoverable, so it does not decide the ranking). The cheapest landed price on a line is green, the fastest
 * delivery is marked, an expired quote is greyed and cannot be awarded. Pick one supplier per line; a line can be
 * left unawarded.
 */
export function RfqComparison({ comparison, choices, onChoose, editable, onCheapest, busy, dirty, onSave, cheapestLabel = 'Award cheapest on every line' }: {
  comparison: Comparison; choices: Choices; onChoose: (rfqLineId: number, supplierId: number | null) => void; editable: boolean;
  onCheapest?: () => void; busy?: boolean; dirty?: boolean; onSave?: () => void; cheapestLabel?: string;
}) {
  const { lines, suppliers } = comparison;
  if (!lines.length || !suppliers.length) {
    return <Typography sx={{ fontSize: 13.5, color: 'var(--c-text-2)', py: 2 }}>{suppliers.length ? 'There are no lines to compare.' : 'No quotes are in yet. Record a supplier’s quotation and it will appear here.'}</Typography>;
  }
  const totals = awardedTotals(comparison, choices);
  const awardedCount = lines.filter((l) => choices[l.rfqLine.id] != null).length;
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)', flex: '1 1 260px' }}>
          Landed = the price with freight shared in, before GST. {awardedCount} of {lines.length} {lines.length === 1 ? 'line' : 'lines'} awarded.
        </Typography>
        {editable && onCheapest && <Button variant="outlined" onClick={onCheapest} disabled={busy}>{cheapestLabel}</Button>}
        {editable && onSave && <Button variant="contained" onClick={onSave} disabled={busy || !dirty}>Save awards</Button>}
      </Box>
      <Box sx={{ overflowX: 'auto', border: '1px solid var(--c-divider)', borderRadius: 'var(--r-md)' }}>
        <Box component="table" data-testid="cmp-table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <Box component="th" sx={{ ...headSx, minWidth: 200, position: 'sticky', left: 0, zIndex: 1 }}>Line</Box>
              {suppliers.map((s) => <Box component="th" key={s.id} sx={headSx}>{s.name}</Box>)}
              <Box component="th" sx={headSx}>Awarded to</Box>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const chosen = choices[line.rfqLine.id] ?? null;
              const who = suppliers.find((s) => s.id === chosen);
              return (
                <tr key={line.rfqLine.id}>
                  <Box component="td" sx={{ ...cellSx, position: 'sticky', left: 0, background: 'var(--c-surface)', zIndex: 1 }}>
                    <Mono>{line.rfqLine.item.code ?? '—'}</Mono>
                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-2)', whiteSpace: 'normal' }}>{line.rfqLine.item.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)' }}>{qtyText(line.rfqLine.quantity)} {line.rfqLine.item.uom}</Typography>
                  </Box>
                  {suppliers.map((s) => (
                    <Cell key={s.id} line={line} cell={cellFor(line, s.id)} name={String(s.id)} chosen={chosen === s.id} editable={editable} onPick={() => onChoose(line.rfqLine.id, s.id)} />
                  ))}
                  <Box component="td" sx={cellSx} data-testid={`cmp-awarded-${line.rfqLine.id}`}>
                    {who ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <span>{who.name}</span>
                      {editable && <Button size="small" onClick={() => onChoose(line.rfqLine.id, null)} sx={{ minWidth: 0, py: 0 }}>Clear</Button>}
                    </Box> : <Box component="span" sx={{ color: 'var(--c-text-3)' }}>Not awarded</Box>}
                  </Box>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <Box component="td" sx={{ ...cellSx, fontWeight: 600 }}>Quote total</Box>
              {suppliers.map((s) => (
                <Box component="td" key={s.id} sx={cellSx} data-testid={`cmp-total-${s.id}`}>
                  <Box sx={{ fontSize: 12.5 }}><Money value={s.total} digits={2} missing={NOT_QUOTED} strong /></Box>
                  <Box sx={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                    {s.landedTotal != null ? `${rupeeText(s.landedTotal, 2)} landed · ` : ''}{s.linesQuoted} of {lines.length} quoted
                  </Box>
                  {totals.get(s.id) && <Box sx={{ fontSize: 11.5, color: 'var(--c-primary-700)', mt: 0.25 }} data-testid={`cmp-awarded-total-${s.id}`}>
                    Awarded: {totals.get(s.id)!.lines} {totals.get(s.id)!.lines === 1 ? 'line' : 'lines'}, {rupeeText(totals.get(s.id)!.amount, 2, NOT_QUOTED)}
                  </Box>}
                </Box>
              ))}
              <td />
            </tr>
          </tfoot>
        </Box>
      </Box>
    </Box>
  );
}
