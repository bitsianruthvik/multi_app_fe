import type { PurchaseStatus } from '../api/types';
import type { Family } from '../components/ui';

/** A purchase order's state in words. */
export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Part received',
  received: 'Received',
  cancelled: 'Cancelled',
};

/** Draft is unsent, ordered is waiting on the supplier, received is done. */
export const PURCHASE_STATUS_FAMILY: Record<PurchaseStatus, Family> = {
  draft: 'warning',
  ordered: 'info',
  partially_received: 'info',
  received: 'success',
  cancelled: 'neutral',
};

export const PURCHASE_FILTERS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'partially_received', label: 'Part received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];
