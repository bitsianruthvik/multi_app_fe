import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import ChangeHistoryRounded from '@mui/icons-material/ChangeHistoryRounded';
import DoNotDisturbAltRounded from '@mui/icons-material/DoNotDisturbAltRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';

/**
 * The state of one step in a sequence — a wizard rail, a stage strip, a tab set
 * whose tabs are steps rather than peers.
 *
 *  done            finished
 *  partial         started, not finished
 *  todo            outstanding, and reachable now
 *  not_applicable  this record needs no work at this step
 *  pending         not reachable yet — an earlier step is unfinished
 *
 * `not_applicable` and `pending` are the two that get forgotten, and both are
 * distinct from `todo`: nothing is outstanding in either, so neither should
 * read as a thing you failed to do. They are drawn muted, and `pending` as a
 * lock, so it cannot be mistaken for "nothing to do here".
 */
export type StageState = 'done' | 'partial' | 'todo' | 'not_applicable' | 'pending';

const STATE_COLOR: Record<StageState, string> = {
  done: 'var(--c-success-600)',
  partial: 'var(--c-warning-600)',
  todo: 'var(--c-text-3)',
  not_applicable: 'var(--c-text-3)',
  pending: 'var(--c-text-3)',
};

export function StageIcon({ state, size = 15 }: { state: StageState; size?: number }) {
  const sx = { fontSize: size, color: STATE_COLOR[state] };
  if (state === 'done') return <CheckCircleRounded sx={sx} />;
  if (state === 'partial') return <ChangeHistoryRounded sx={sx} />;
  if (state === 'not_applicable') return <DoNotDisturbAltRounded sx={{ ...sx, opacity: 0.6 }} />;
  if (state === 'pending') return <LockOutlined sx={{ ...sx, opacity: 0.55 }} />;
  return <RadioButtonUncheckedRounded sx={sx} />;
}
