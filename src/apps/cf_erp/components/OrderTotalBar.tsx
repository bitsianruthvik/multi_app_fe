import { Box, Typography } from '@mui/material';
import type { OrderTotal } from '../api/types';
import { rupeeText } from '../lib/money';
import { taxPartsText } from '../lib/gst';
import { Mono } from './ui';

/** The order's total, with what is missing from it said plainly — a partial total must not pass for a whole one. */
export function OrderTotalBar({ total, lineCount }: { total: OrderTotal; lineCount?: number }) {
  // Nothing priced yet: say so, rather than a ₹0 that reads as a price.
  const nothingPriced = lineCount != null && lineCount > 0 && total.unpricedLines.length >= lineCount;
  // Tax is shown once the server could work it out; until then the plain pre-tax total stands.
  // A total with an untaxed line is not "incl. GST" — show the pre-tax total and say why.
  const taxed = !nothingPriced && total.gross != null && total.taxable != null && total.taxComplete !== false;
  const taxMissing = !nothingPriced && total.taxComplete === false;
  const list = (nos: number[]) => nos.join(', ');
  return (
    <Box data-testid="order-total" sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1.5, px: 2, py: 1.25, borderTop: '1px solid var(--c-divider)' }}>
      {!total.complete && (
        <Typography data-testid="order-total-warning" sx={{ fontSize: 12.5, color: 'var(--c-warning-800)' }}>
          Not the whole order:{' '}
          {total.unpricedLines.length > 0 && <>line{total.unpricedLines.length === 1 ? '' : 's'} {list(total.unpricedLines)} ha{total.unpricedLines.length === 1 ? 's' : 've'} no rate</>}
          {total.unpricedLines.length > 0 && total.unmeasuredLines.length > 0 && '; '}
          {total.unmeasuredLines.length > 0 && <>line{total.unmeasuredLines.length === 1 ? '' : 's'} {list(total.unmeasuredLines)} {total.unmeasuredLines.length === 1 ? 'has' : 'have'} no weight or length yet</>}.
        </Typography>
      )}
      {nothingPriced
        ? <><Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Order total, before tax</Typography><Mono muted sx={{ fontSize: 14 }}>not priced</Mono></>
        : taxed
          ? (
            <Box data-testid="order-tax" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'flex-end', columnGap: 1.5, rowGap: 0.5 }}>
              <Part label="Taxable" value={rupeeText(total.taxable)} />
              {taxPartsText(total).map((t) => <Part key={t.label} label={t.label} value={t.text} />)}
              <Part label="Total incl. GST" value={rupeeText(total.gross)} strong />
            </Box>
          )
          : <>{taxMissing && <Typography data-testid="order-tax-missing" sx={{ fontSize: 12.5, color: 'var(--c-text-3)' }}>GST not worked out{total.taxNote ? `: ${total.taxNote}` : ' for every line.'}</Typography>}<Typography sx={{ fontSize: 13, color: 'var(--c-text-2)' }}>Order total, before tax</Typography><Mono sx={{ fontWeight: 600, fontSize: 14 }}>{rupeeText(total.amount)}</Mono></>}
    </Box>
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
