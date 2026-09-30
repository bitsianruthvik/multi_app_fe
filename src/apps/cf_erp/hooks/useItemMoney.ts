import { cfApi } from '../api/client';
import type { ItemCost, ItemPrices } from '../api/money';
import { useLoad } from './useLoad';

/**
 * An item's prices and its cost, side by side — two endpoints, one header. Either
 * half can be refused (prices need the catalogue view, cost the inventory view);
 * the half that failed is just null and its chip reads "—".
 */
export function useItemMoney(itemId: number, enabled: boolean, version: string) {
  return useLoad(async () => {
    if (!enabled) return null;
    const [prices, cost] = await Promise.all([
      cfApi.get<ItemPrices>(`/records/${itemId}/prices`).catch(() => null),
      cfApi.get<ItemCost>(`/items/${itemId}/cost`).catch(() => null),
    ]);
    return { prices, cost };
  }, [itemId, enabled, version]);
}
