/** The words of reviews and actions (CF_HRMS_HIRING_SPEC.md §20.3), shared by every screen that shows them. */
import type { StatusTone } from '@shared/ui';
import type { ReviewStatus } from '../../api/reviews';

export const REVIEW_STATUS_TONE: Record<ReviewStatus, StatusTone> = { OPEN: 'info', EMPLOYEE_DONE: 'warning', DONE: 'success', CANCELLED: 'neutral' };
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { OPEN: 'Open', EMPLOYEE_DONE: 'Person has written', DONE: 'Done', CANCELLED: 'Cancelled' };
export const REVIEW_STATE_OPTIONS = [
  { value: 'DUE', label: 'Due' }, { value: 'OVERDUE', label: 'Overdue' }, { value: 'DONE', label: 'Done' }, { value: 'CANCELLED', label: 'Cancelled' },
];
export const REVIEW_KIND_OPTIONS = [{ value: 'CHECK_IN', label: 'Check-in' }, { value: 'FINAL', label: 'Final review' }];
export const ACTION_STATUS_OPTIONS = [{ value: 'OPEN', label: 'Open' }, { value: 'DONE', label: 'Done' }, { value: 'DROPPED', label: 'Dropped' }, { value: 'all', label: 'All' }];
