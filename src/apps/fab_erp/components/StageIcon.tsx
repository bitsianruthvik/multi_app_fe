import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import ChangeHistoryRounded from '@mui/icons-material/ChangeHistoryRounded';
import DoNotDisturbAltRounded from '@mui/icons-material/DoNotDisturbAltRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';

import type { StageState } from '../api/readiness';

/**
 * StageIcon — one glyph for a preparation stage's state, everywhere one is
 * drawn (the wizard rail, `OrderStageStrip`).
 *
 * De-duplicated (U3): `SalesOrderWizard.tsx` and `OrderStageStrip.tsx` each
 * carried their own `StepIcon`/`StageIcon` plus their own `STATE_COLOR` map,
 * and neither map had an entry for `'not_applicable'` — the state a stage
 * genuinely does not apply in (Production on a quote, today). Reading
 * `STATE_COLOR[state]` for it returned `undefined`, so MUI silently drew the
 * icon in its default color instead of the muted, deliberate "this step is
 * skipped" treatment a real state deserves.
 */
const STATE_COLOR: Record<StageState, string> = {
  done: 'var(--c-success-600)',
  partial: 'var(--c-warning-600)',
  todo: 'var(--c-text-3)',
  // Muted and distinct from `todo`: unlike an unfinished step, nothing here
  // is outstanding — there is simply no work this order needs at this stage.
  not_applicable: 'var(--c-text-3)',
  // Not reached yet — an earlier stage is unfinished. Drawn as a lock so it
  // cannot be mistaken for "nothing outstanding".
  pending: 'var(--c-text-3)',
};

export default function StageIcon({ state, size = 15 }: { state: StageState; size?: number }) {
  const sx = { fontSize: size, color: STATE_COLOR[state] };
  if (state === 'done') return <CheckCircleRounded sx={sx} />;
  if (state === 'partial') return <ChangeHistoryRounded sx={sx} />;
  if (state === 'not_applicable') return <DoNotDisturbAltRounded sx={{ ...sx, opacity: 0.6 }} />;
  if (state === 'pending') return <LockOutlined sx={{ ...sx, opacity: 0.55 }} />;
  return <RadioButtonUncheckedRounded sx={sx} />;
}
