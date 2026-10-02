/** An entry chosen on the create form, held until the definition itself exists. */
export type PendingEntry =
  | { kind: 'node'; nodeId: number; label: string; path: string }
  | { kind: 'item'; itemId: number; label: string; code: string | null; isDefault: boolean };

/** What the create call sends: branches by node, items with their star. */
export function scopeBody(entries: PendingEntry[]) {
  return entries.map((e) => (e.kind === 'node' ? { nodeId: e.nodeId } : { itemId: e.itemId, isDefault: e.isDefault }));
}
