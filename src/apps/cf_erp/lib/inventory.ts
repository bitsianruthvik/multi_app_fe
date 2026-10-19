import type { AreaPurpose, BatchStatus, LedgerMovementType, StockCategory, Weekday } from '../api/types';

/**
 * WHERE GOODS FROM OUTSIDE MAY BE RECEIVED (2026-10-19, the backend's stockingAreaService.RECEIVING_PURPOSES): a store, or
 * quarantine to be inspected — never the dispatch yard, a WIP bay or a scrap bay (production takes plates only from storage /
 * WIP). Stock / Movements › Receive and customer material list only these; a transfer moves goods on from there.
 */
export const RECEIVING_PURPOSES: readonly AreaPurpose[] = ['storage', 'quarantine'];
export const canReceiveInto = (a: { status: string; purpose: AreaPurpose }) => a.status === 'active' && RECEIVING_PURPOSES.includes(a.purpose);
export const NO_RECEIVING_AREA = 'No storage area to receive into. Make a storage area in Stores › Stocking areas.';

export const PURPOSE_LABEL: Record<AreaPurpose, string> = { storage: 'Storage', wip: 'Work in process', quarantine: 'Quarantine', dispatch: 'Dispatch', scrap: 'Scrap' };
export const PURPOSE_HELP: Record<AreaPurpose, string> = {
  storage: 'Stock here is available to use.',
  wip: 'Stock here is being worked on — beside a machine or in a bay.',
  quarantine: 'Stock here is held: not issued until it is moved back to storage.',
  dispatch: 'Finished and waiting to leave.',
  scrap: 'Scrap kept here until it is sold or sent back.',
};
export const CATEGORY_LABEL: Record<StockCategory, string> = { available: 'Available', in_process: 'In process', held: 'Held', rejected: 'Rejected', dispatch: 'Dispatch', scrap: 'Scrap' };
export const MOVEMENT_LABEL: Record<LedgerMovementType, string> = { receipt: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjustment: 'Count', scrap: 'Scrap', return: 'Returned to customer' };
export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = { available: 'Available', on_hold: 'On hold', rejected: 'Rejected' };
export const WEEKDAY_SHORT: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** A quantity without trailing zeros: 12, 0.5, 1234.75. */
export const qtyText = (n: number | null | undefined) => (n == null ? '—' : String(Number(Number(n).toFixed(6))));

/** Hours from minutes, for shift and calendar totals: 7.5 h. */
export const hoursText = (minutes: number) => `${Number((minutes / 60).toFixed(1))} h`;

/** Days as the week reads them: Mon–Sat, Mon, Wed, Fri, Every day. */
export function daysText(days: Weekday[]): string {
  if (days.length === 7) return 'Every day';
  const idx = days.map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length > 2) return `${WEEKDAY_SHORT[WEEKDAYS[idx[0]]]}–${WEEKDAY_SHORT[WEEKDAYS[idx[idx.length - 1]]]}`;
  return idx.map((i) => WEEKDAY_SHORT[WEEKDAYS[i]]).join(', ');
}
