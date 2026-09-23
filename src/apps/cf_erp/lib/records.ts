import type { Sourcing } from '../api/types';

/**
 * Where a catalog item comes from when an order asks for one (user, 2026-09-23).
 * A temporary item is never offered the choice: it exists only to be made.
 */
export const SOURCING_LABEL: Record<Sourcing, string> = {
  stock: 'Stock',
  make: 'Made on the order',
  both: 'Either',
};

export const SOURCING_HELP: Record<Sourcing, string> = {
  stock: 'Always drawn from stock — a stock order is what makes it',
  make: 'Always made on the order that needs it — it needs a flow',
  both: 'From stock when there is free stock to cover it, otherwise made',
};

export const SOURCING_OPTIONS: { value: Sourcing; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'make', label: 'Made on the order' },
  { value: 'both', label: 'Either — stock first' },
];
