import { Box, Typography } from '@mui/material';
import type { OrderTotal, OrderValue } from '../api/types';
import { rupeeText } from '../lib/money';
import { taxPartsText } from '../lib/gst';
import { Mono } from './ui';
import { OrderValueText } from './OrderValueText';

/**
 * The order's total from the LINE RATES, with what is missing from it said plainly — a partial total must not pass for
 * a whole one. Once acceptance terms exist the order's value is theirs (2026-10-18): the bar then says so first, and the
 * line total below it is only the estimate.
 */
export function OrderTotalBar({ total, lineCount, value }: { total: OrderTotal; lineCount?: number; value?: OrderValue }) {
  const byTerms = !!value && (value.basis === 'accepted' || value.basis === 'awaiting_approval');
  // Nothing priced yet: say so, rather than a ₹0 that reads as a price.
  const nothingPriced = lineCount != null && lineCount > 0 && total.unpricedLines.length >= lineCount;
  // Tax is shown once the server could work it out; until then the plain pre-tax total stands.
  // A total with an untaxed line is not "incl. GST" — show the pre-tax total and say why.
  const taxed = !nothingPriced && total.gross != null && total.taxable != null && total.taxComplete !== false;
  const taxMissing = !nothingPriced && total.taxComplete === false;
  const list = (nos: number[]) => nos.join(', ');
  return (
    <>
    {byTerms && (
      <Box data-testid="order-total-terms" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1.5, px: 2, pt: 1.25, borderTop: '1px solid var(--c-divider)' }}>
        <Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Order value (customer acceptance), before tax</Typography>
        <OrderValueText value={value} compact />
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-3)', width: '100%', textAlign: 'right' }}>The line rates below are the sales estimate only — billing and costing use the acceptance.</Typography>
      </Box>
    )}
    <Box data-testid="order-total" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1.5, px: 2, py: 1.25, borderTop: byTerms ? 'none' : '1px solid var(--c-divider)' }}>
      {!total.complete && (
        <Typography data-testid="order-total-warning" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
          Not the whole order:{' '}
          {total.unpricedLines.length > 0 && <>line{total.unpricedLines.length === 1 ? '' : 's'} {list(total.unpricedLines)} ha{total.unpricedLines.length === 1 ? 's' : 've'} no rate</>}
          {total.unpricedLines.length > 0 && total.unmeasuredLines.length > 0 && '; '}
          {total.unmeasuredLines.length > 0 && <>line{total.unmeasuredLines.length === 1 ? '' : 's'} {list(total.unmeasuredLines)} {total.unmeasuredLines.length === 1 ? 'has' : 'have'} no weight or length yet</>}.
        </Typography>
      )}
      {nothingPriced
        ? <><Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{byTerms ? 'Estimate from the line rates, before tax' : 'Order total, before tax'}</Typography><Mono muted sx={{ fontSize: 14 }}>not priced</Mono></>
        : taxed
          ? (
            <Box data-testid="order-tax" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'flex-end', columnGap: 1.5, rowGap: 0.5 }}>
              <Part label="Taxable" value={rupeeText(total.taxable)} />
              {taxPartsText(total).map((t) => <Part key={t.label} label={t.label} value={t.text} />)}
              <Part label={byTerms ? 'Estimate incl. GST' : 'Total incl. GST'} value={rupeeText(total.gross)} strong={!byTerms} />
            </Box>
          )
          : <>{taxMissing && <Typography data-testid="order-tax-missing" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>GST not worked out{total.taxNote ? `: ${total.taxNote}` : ' for every line.'}</Typography>}<Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{byTerms ? 'Estimate from the line rates, before tax' : 'Order total, before tax'}</Typography><Mono sx={{ fontWeight: byTerms ? 400 : 600, fontSize: 14 }}>{rupeeText(total.amount)}</Mono></>}
    </Box>
    </>
  );
}

function Part({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75 }}>
      <Typography component="span" sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>{label}</Typography>
      <Mono sx={strong ? { fontWeight: 600, fontSize: 14 } : { fontSize: 13.5 }}>{value}</Mono>
    </Box>
  );
}
