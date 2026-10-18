import type { LifeUnit, MachineResource, ResourceItem, ResourceKind, ToolPiece } from '../api/toolsResources';

/**
 * Pure rules of the machine resource card and the tool-life screen (§81), shared by the screens and the tests.
 */

export const KINDS: ResourceKind[] = ['tool', 'spare', 'consumable'];
export const KIND_LABEL: Record<ResourceKind, string> = { tool: 'Tool', spare: 'Spare', consumable: 'Consumable' };
export const LIFE_UNITS: LifeUnit[] = ['uses', 'hours', 'metres'];

/** A line on the card while it is being edited. `key` is stable for React; `id` is the saved row, if any. */
export interface ResourceDraft { key: string; id?: number; item: ResourceItem | null; kind: ResourceKind; qty: string; notes: string }

let seq = 0;
export const blankDraft = (): ResourceDraft => ({ key: `n${++seq}`, item: null, kind: 'consumable', qty: '1', notes: '' });

export const draftsFromServer = (rows: MachineResource[]): ResourceDraft[] => rows.map((r) => ({
  key: `s${r.id}`, id: r.id, kind: r.kind, qty: String(r.qty), notes: r.notes ?? '',
  item: { id: r.itemId, code: r.code, name: r.name, uom: r.uom, kind: r.itemKind, lifeUnit: r.lifeUnit, lifeLimit: r.lifeLimit },
}));

/** The kind a freshly picked item starts with: its family's, else consumable. */
export const defaultKind = (item: ResourceItem | null): ResourceKind => item?.kind ?? 'consumable';

/** Rows that name an item — an empty trailing line is not saved. */
export const filled = (rows: ResourceDraft[]) => rows.filter((r) => r.item);

export function toPayload(rows: ResourceDraft[]) {
  return filled(rows).map((r) => ({ itemId: (r.item as ResourceItem).id, kind: r.kind, qty: Number(r.qty), notes: r.notes.trim() || null }));
}

/** What stops a save, in words — the same checks the server makes, so the button says why before the trip. */
export function draftProblems(rows: ResourceDraft[]): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  filled(rows).forEach((r, i) => {
    const at = `Row ${i + 1}`;
    const item = r.item as ResourceItem;
    if (!(Number(r.qty) > 0)) out.push(`${at}: quantity is a number above zero.`);
    if (seen.has(item.id)) out.push(`${at}: ${item.code} is already on the list.`);
    seen.add(item.id);
  });
  return out;
}

export const isDirty = (rows: ResourceDraft[], saved: MachineResource[]): boolean => {
  const a = JSON.stringify(toPayload(rows));
  const b = JSON.stringify(saved.map((r) => ({ itemId: r.itemId, kind: r.kind, qty: r.qty, notes: r.notes?.trim() || null })));
  return a !== b;
};

/** "3 uses", "1.5 hours", "120 metres". */
export const lifeText = (unit: LifeUnit | null, limit: number | null): string => (!unit ? 'Not tracked' : limit == null ? `no limit (${unit})` : `${limit} ${unit}`);

/** "2 of 3 uses" for a piece. */
export const pieceLife = (p: ToolPiece): string => (p.lifeLimit == null ? `${p.lifeUsed} ${p.lifeUnit}` : `${p.lifeUsed} of ${p.lifeLimit} ${p.lifeUnit}`);

export const STATUS_LABEL: Record<string, string> = { in_use: 'In use', worn_out: 'Worn out', retired: 'Retired', void: 'Void' };
