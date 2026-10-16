import type { CustomerTotal, LedgerCheck, PartyRef, Tracking, UnitStatus, ViewCategory } from '../api/stockView';
import type { Family } from '../components/ui';
import { kgText } from './money';
import { qtyText } from './inventory';

/** What a Stock row counts as (GET /stock/view category). */
export const VIEW_CATEGORY_LABEL: Record<ViewCategory, string> = {
  available: 'Raw / available', in_process: 'In process (WIP)', finished: 'Finished', held: 'Held',
  rejected: 'Rejected', dispatch: 'Dispatch', scrap: 'Scrap', offcut: 'Offcut',
};
export const VIEW_CATEGORY_FAMILY: Record<ViewCategory, Family> = {
  available: 'success', in_process: 'info', finished: 'success', held: 'warning', rejected: 'danger', dispatch: 'neutral', scrap: 'danger', offcut: 'neutral',
};
export const VIEW_CATEGORIES: ViewCategory[] = ['available', 'in_process', 'finished', 'held', 'rejected', 'dispatch', 'scrap', 'offcut'];

/** The heading over each tracking mode's rows. */
export const TRACKING_HEADING: Record<Tracking, string> = {
  quantity: 'Counted by quantity — one total per item and area',
  batch: 'Kept in lots',
  individual: 'Tracked piece by piece',
};
export const TRACKING_CHIP: Record<Tracking, string> = { quantity: 'By quantity', batch: 'In lots', individual: 'Piece by piece' };
export const TRACKINGS: Tracking[] = ['quantity', 'batch', 'individual'];

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  in_process: 'In process', finished: 'Finished', joined: 'Joined into another', split: 'Split', dispatched: 'Dispatched',
  scrapped: 'Scrapped', returned: 'Returned', undone: 'Undone',
};
export const UNIT_STATUS_FAMILY: Record<UnitStatus, Family> = {
  in_process: 'info', finished: 'success', joined: 'neutral', split: 'neutral', dispatched: 'neutral', scrapped: 'danger', returned: 'warning', undone: 'warning',
};

export const NO_SCRAP_RATE = 'No scrap rate set — scrap is valued at 0.';

export const partyName = (p: PartyRef | null | undefined) => (p ? (p.name ?? p.code ?? 'Customer') : 'Ours');

const TONNE = ['t', 'mt', 'tonne', 'tonnes'];

/** A customer's quantities, one per unit — never summed across units. Tonnes read as kg. */
export function quantitiesText(c: Pick<CustomerTotal, 'quantities'>): string {
  const by = new Map<string, number>();
  for (const q of c.quantities) {
    const t = TONNE.includes(String(q.uom).toLowerCase());
    const u = t ? 'kg' : q.uom;
    by.set(u, (by.get(u) ?? 0) + (t ? q.quantity * 1000 : q.quantity));
  }
  return [...by.entries()].map(([u, q]) => (u.toLowerCase() === 'kg' ? kgText(q) : `${qtyText(q)} ${u}`)).join(', ');
}

/** The toast after GET /stock/check: which part disagrees, in words. */
export function ledgerCheckMessage(r: LedgerCheck): { ok: boolean; text: string } {
  const balancesBad = r.differences.length > 0;
  const unitsBad = !!r.units && !r.units.ok;
  if (r.ok && !balancesBad && !unitsBad) {
    const pieces = r.units ? ` All ${r.units.liveUnits} pieces agree with their lots.` : '';
    return { ok: true, text: `Ledger checked: all ${r.checked} balances agree with their movements.${pieces}` };
  }
  const parts: string[] = [];
  if (balancesBad) parts.push(r.differences.length === 1 ? '1 balance disagrees with the ledger' : `${r.differences.length} balances disagree with the ledger`);
  if (unitsBad) {
    const n = r.units!.differences.length;
    parts.push(n === 1 ? '1 lot does not match its pieces' : `${n} lots do not match their pieces`);
  }
  if (!parts.length) parts.push('The ledger does not agree');
  return { ok: false, text: `${parts.join('. ')}. Tell whoever looks after the system.` };
}
