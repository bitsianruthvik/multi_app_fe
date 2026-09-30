import { Tooltip } from '@mui/material';
import type { ItemCost, ItemPrices } from '../api/money';
import { dayText, priceText, rateText, rupeeText } from '../lib/money';
import { Fact, Mono } from './ui';
import { Money } from './Money';

/**
 * The money chips of a catalog item's header: what it lists at, what we last
 * paid, what it costs on average and what our stock of it is worth. Plain
 * facts, in the same row as the rest — "not costed" where nobody has said.
 */
export function ItemMoneyFacts({ prices, cost }: { prices: ItemPrices | null; cost: ItemCost | null }) {
  const paid = prices?.lastPurchasePrice != null
    ? { price: prices.lastPurchasePrice, who: prices.lastPurchaseSupplier?.name, date: dayText(prices.lastPurchaseDate), po: prices.lastPurchaseOrder?.code }
    : cost?.lastReceipt ? { price: cost.lastReceipt.unitCost, who: cost.lastReceipt.party?.name, date: dayText(cost.lastReceipt.date), po: cost.lastReceipt.movement.code } : null;
  const ours = cost?.stock.ours;
  const theirs = cost?.stock.customers;
  return (
    <>
      <Fact label="List price">
        {prices?.listPrice != null ? <Mono>{rateText(prices.listPrice, prices.priceBasis)}</Mono> : <Money value={null} missing="not set" />}
      </Fact>
      <Fact label="Last paid">
        {paid ? (
          <Tooltip title={[paid.who, paid.date, paid.po].filter(Boolean).join(' · ') || 'Last price paid'}><span><Mono>{priceText(paid.price)}</Mono></span></Tooltip>
        ) : <Money value={null} missing="not bought yet" />}
      </Fact>
      <Fact label="Avg cost"><Money value={cost?.averageCost} digits={2} /></Fact>
      <Fact label="Stock value (ours)">
        {ours ? (
          ours.quantity <= 0 ? <Mono muted>none in stock</Mono> : (
            <Tooltip title={ours.uncostedQty > 0 ? `${Number(ours.uncostedQty.toFixed(3))} of ${Number(ours.quantity.toFixed(3))} ${cost?.item.uom ?? ''} has no cost and is left out` : ''}>
              <span>{ours.value > 0 || ours.uncostedQty <= 0 ? <Mono>{rupeeText(ours.value)}</Mono> : <Money value={null} />}
                {ours.uncostedQty > 0 && ours.value > 0 && <Mono muted> + some not costed</Mono>}</span>
            </Tooltip>
          )
        ) : <Mono muted>—</Mono>}
        {theirs && theirs.quantity > 0 && <Mono muted> · {Number(theirs.quantity.toFixed(3))} {cost?.item.uom} is a customer&rsquo;s</Mono>}
      </Fact>
    </>
  );
}
