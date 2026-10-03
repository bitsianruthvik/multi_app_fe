import type { PurchaseStatus } from '../api/types';
import type { Family } from '../components/ui';

/** A purchase order's state in words. */
export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: 'Requested',
  requested: 'Requested',
  quoting: 'Quoting',
  ordered: 'Ordered',
  partially_received: 'Part received',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** Requested and quoting are not placed yet, ordered is waiting on the supplier, received is done. */
export const PURCHASE_STATUS_FAMILY: Record<PurchaseStatus, Family> = {
  draft: 'warning',
  requested: 'warning',
  quoting: 'info',
  ordered: 'info',
  partially_received: 'info',
  received: 'success',
  cancelled: 'neutral',
};

export const PURCHASE_FILTERS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'requested', label: 'Requested' },
  { value: 'quoting', label: 'Quoting' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Part received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];
