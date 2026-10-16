import { Box, Typography } from '@mui/material';
import type { ScrapRate, StockViewTotals as Totals } from '../api/stockView';
import { kgText, rupeeText } from '../lib/money';
import { NO_SCRAP_RATE, partyName, quantitiesText } from '../lib/stockView';
import { Surface } from './ui';

const label = { fontSize: 12, color: 'var(--c-text-2)' };
const big = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 22, fontWeight: 600, lineHeight: 1.2 };
const small = { fontSize: 12, color: 'var(--c-text-3)' };

/**
 * What we hold, by owner, over every match (the owner filter aside): our
 * value and weight, then one card per customer — their weight, quantities
 * per unit and a reference value that is never ours. A customer card filters
 * the list to that customer.
 */
export function StockViewTotals({ totals, scrapRate, owner, onOwner }: {
  totals: Totals; scrapRate: ScrapRate | null; owner: string; onOwner: (owner: string) => void;
}) {
  const o = totals.ours;
  const noRate = scrapRate ? scrapRate.ratePerKg == null : false;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(auto-fit, minmax(220px, 1fr))' }, gap: 1.5, mb: 2 }}>
      <Surface e={1} data-testid="totals-ours" sx={{ p: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
        <Typography sx={label}>Ours — value at cost</Typography>
        <Typography sx={big} data-testid="ours-value">{o.value == null ? 'not costed' : rupeeText(o.value)}</Typography>
        {o.uncostedQty > 0 && <Typography sx={small}>Some has no cost and is left out.</Typography>}
        <Typography sx={{ fontSize: 13, mt: 0.5 }} data-testid="ours-kg">{kgText(o.kg)}{o.unweighedItems > 0 && <Box component="span" sx={small}> · {o.unweighedItems} item{o.unweighedItems === 1 ? '' : 's'} with no weight</Box>}</Typography>
        {o.scrapKg > 0 && (
          <Typography sx={{ fontSize: 13, mt: 0.5 }} data-testid="ours-scrap">
            Scrap {kgText(o.scrapKg)}
            {noRate && <Box component="span" sx={{ display: 'block', ...small, color: 'var(--c-warning-800)' }}>{scrapRate?.note ?? NO_SCRAP_RATE}</Box>}
          </Typography>
        )}
      </Surface>
      {totals.customers.map((c) => {
        const active = owner === String(c.party.id);
        return (
          <Surface key={c.party.id} e={1} data-testid="totals-customer" role="button" tabIndex={0}
            onClick={() => onOwner(active ? '' : String(c.party.id))}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOwner(active ? '' : String(c.party.id)); } }}
            sx={{ p: 2, minWidth: 0, overflowWrap: 'anywhere', cursor: 'pointer', borderColor: active ? 'var(--c-primary-200)' : undefined, background: active ? 'var(--c-primary-50)' : undefined, '&:hover': { boxShadow: 'var(--e-2)' } }}>
            <Typography sx={label}>{partyName(c.party)}’s material</Typography>
            <Typography sx={big}>{kgText(c.kg)}</Typography>
            {c.quantities.length > 0 && <Typography sx={{ fontSize: 13 }}>{quantitiesText(c)}</Typography>}
            <Typography sx={small}>
              {c.referenceValue == null ? 'no reference value' : rupeeText(c.referenceValue)} reference value — not ours
            </Typography>
          </Surface>
        );
      })}
    </Box>
  );
}
