import type { BuyRow } from '../api/types';

/** Which rows of the buy list to show: everything, what releases need, or what is only planned. */
export type BuyKind = 'all' | 'released' | 'planned';

export const isPlanned = (r: Pick<BuyRow, 'planned'>) => r.planned === true;

/** "planned · SO-20260930-0001/10 — not released yet". */
export const plannedChipText = (r: Pick<BuyRow, 'source'>) =>
  `planned · ${r.source ? `${r.source.orderCode}/${r.source.lineNo}` : 'a confirmed line'} — not released yet`;

export const byKind = <T extends Pick<BuyRow, 'planned'>>(rows: T[], kind: BuyKind): T[] =>
  kind === 'planned' ? rows.filter(isPlanned) : kind === 'released' ? rows.filter((r) => !isPlanned(r)) : rows;

/** A row is an item, or an item's planned material from one line — the two must not share a key. */
export const buyRowId = (r: Pick<BuyRow, 'item' | 'planned' | 'source'>) =>
  isPlanned(r) ? `${r.item.id}:p${r.source?.lineId ?? ''}` : String(r.item.id);
