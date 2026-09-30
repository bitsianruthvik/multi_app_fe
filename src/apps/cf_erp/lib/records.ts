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

/** The things besides the renamed one that a folder holds, for the "Rename the folder too?" offer. */
export function folderSharers(node: { definitionCount: number; itemCount: number } | null | undefined, renamedIs: 'definition' | 'item'): { definitions: number; items: number } {
  if (!node) return { definitions: 0, items: 0 };
  return {
    definitions: Math.max(0, node.definitionCount - (renamedIs === 'definition' ? 1 : 0)),
    items: Math.max(0, node.itemCount - (renamedIs === 'item' ? 1 : 0)),
  };
}

/** "It also holds 3 other definitions — they will show the new name too." Null when the folder holds nothing else. */
export function folderSharingNote(others: { definitions: number; items: number }): string | null {
  const parts: string[] = [];
  if (others.definitions > 0) parts.push(`${others.definitions.toLocaleString('en-US')} other ${others.definitions === 1 ? 'definition' : 'definitions'}`);
  if (others.items > 0) parts.push(`${others.items.toLocaleString('en-US')} ${parts.length ? '' : 'other '}${others.items === 1 ? 'item' : 'items'}`.replace('  ', ' '));
  if (!parts.length) return null;
  const who = others.definitions + others.items === 1 ? 'it' : 'they';
  return `It also holds ${parts.join(' and ')} — ${who} will show the new name too.`;
}
