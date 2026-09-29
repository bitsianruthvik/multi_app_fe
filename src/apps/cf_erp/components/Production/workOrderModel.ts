import type { WorkOrderStatus } from '../../api/types';

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft', issued: 'Issued', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled',
};

/** The filters on the list: "open" is everything not finished or cancelled. */
export const WORK_ORDER_FILTERS = [
  { value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' },
];
export const inWorkOrderFilter = (status: WorkOrderStatus, filter: string) =>
  filter === 'all' || (filter === 'open' ? status === 'draft' || status === 'issued' || status === 'in_progress' : status === filter);
