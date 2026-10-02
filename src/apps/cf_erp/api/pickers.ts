import { cfApi, qs } from './client';
import type { Party, PartyRole, SalesOrder } from './types';

/**
 * Server searches for pickers (components/ServerPicker). A picker asks the
 * server per keystroke (debounced) instead of loading a list once — a list
 * endpoint returns only its first N rows, so a picker that filtered those in
 * the browser could never find the rest (ARCHITECTURE.md §13).
 */

/** How many options a picker shows per keystroke — the search narrows the rest. */
export const PICKER_LIMIT = 30;

/** Parties by code / name / contact / email / phone. */
export const searchParties = (term: string, opts: { role?: PartyRole; status?: string } = {}) =>
  cfApi.get<Party[]>(`/parties${qs({ search: term, role: opts.role, status: opts.status, limit: PICKER_LIMIT })}`);

/** Sales orders by number / title / customer reference / customer. */
export const searchOrders = (term: string, opts: { open?: boolean } = {}) =>
  cfApi.get<SalesOrder[]>(`/orders${qs({ search: term, open: opts.open ? 1 : undefined, limit: PICKER_LIMIT })}`);
