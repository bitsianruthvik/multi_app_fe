import type { PieceStatus, StepStatus } from '../api/types';

/** A step's status in words — "Waiting" rather than "not ready": waiting is normal, not a fault. */
export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  not_ready: 'Waiting', ready: 'Ready', in_progress: 'In progress', on_hold: 'On hold', done: 'Done',
};

export const PIECE_STATUS_LABEL: Record<PieceStatus, string> = {
  not_ready: 'Waiting', ready: 'Ready', in_progress: 'In progress', on_hold: 'On hold', complete: 'Complete',
};

export const STEP_FILTERS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'not_ready', label: 'Waiting' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
];

/** "4 / 6" for a step with a quantity above one, else nothing. */
export const progressText = (good: number, quantity: number) => (quantity > 1 || good > 0 ? `${Number(good.toFixed(3))} / ${Number(quantity.toFixed(3))}` : '');
