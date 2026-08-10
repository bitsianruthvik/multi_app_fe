import { Box, Chip, Tooltip, Typography } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRounded from '@mui/icons-material/RadioButtonUncheckedRounded';
import ChangeHistoryRounded from '@mui/icons-material/ChangeHistoryRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';

import { Surface } from '../components';
import type { OrderReadiness, ReadinessStage, StageState } from '../api/readiness';
import { STAGE_TAB } from '../api/readiness';

/**
 * The order's preparation, made visible.
 *
 * A sales order is prepared in five steps — lines → BOQ → nesting → flows →
 * tasks — and until this existed nothing on the screen said so. The tabs were
 * peers in no particular order, the whole preparation phase sat under the single
 * status 'draft', and an order with a 417-item BOQ, nesting done and flows
 * assigned looked exactly like one created thirty seconds ago.
 *
 * So: five segments, each with its real count, the current one carrying the
 * detail line, and every one clickable through to the tab where its work
 * happens. Knowing where you are should not be tribal knowledge.
 *
 * The counts come from the server's readiness object, the same one the Build
 * tasks warning is built from — the strip cannot say "ready" over a warning
 * that says otherwise.
 */

const STATE_COLOR: Record<StageState, string> = {
  done: 'var(--c-success-600)',
  partial: 'var(--c-warning-600)',
  todo: 'var(--c-text-3)',
};

function StageIcon({ state }: { state: StageState }) {
  const sx = { fontSize: 15, color: STATE_COLOR[state] };
  if (state === 'done') return <CheckCircleRounded sx={sx} />;
  if (state === 'partial') return <ChangeHistoryRounded sx={sx} />;
  return <RadioButtonUncheckedRounded sx={sx} />;
}

/** "3 / 417" reads as progress; a bare "3" reads as a total. */
function stageCount(s: ReadinessStage): string | null {
  if (s.total === 0) return null;
  if (s.state === 'partial' && s.total !== s.count) return `${s.count} / ${s.total}`;
  return String(s.total);
}

export default function OrderStageStrip({ readiness, onGoToTab, activeTab }: {
  readiness: OrderReadiness;
  onGoToTab: (tab: string) => void;
  activeTab?: string;
}) {
  const { stages, nextStage, preparationComplete, status } = readiness;
  const current = stages.find((s) => s.key === nextStage) ?? null;

  return (
    <Surface e={1} sx={{ px: 2, py: 1.25, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        {stages.map((s, i) => {
          const isNext = s.key === nextStage;
          const isActive = STAGE_TAB[s.key] === activeTab;
          const count = stageCount(s);
          return (
            <Box key={s.key} sx={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <ChevronRightRounded sx={{ fontSize: 16, color: 'var(--c-text-3)', mx: 0.25 }} />
              )}
              <Tooltip title={s.detail}>
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => onGoToTab(STAGE_TAB[s.key])}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onGoToTab(STAGE_TAB[s.key]); }}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 0.75,
                    px: 1, py: 0.5, borderRadius: 'var(--r-sm)', cursor: 'pointer',
                    // The stage you are looking at and the stage that needs work
                    // are different things, and both are worth seeing at once.
                    border: '1px solid',
                    borderColor: isActive ? 'var(--c-border)' : 'transparent',
                    bgcolor: isNext ? 'var(--c-surface-2)' : 'transparent',
                    '&:hover': { bgcolor: 'var(--c-surface-2)' },
                  }}
                >
                  <StageIcon state={s.state} />
                  <Typography sx={{
                    fontSize: 12.5,
                    fontWeight: isNext ? 600 : 500,
                    color: s.state === 'todo' ? 'var(--c-text-3)' : 'var(--c-text)',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.label}
                  </Typography>
                  {count && (
                    <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--c-text-2)' }}>
                      {count}
                    </Typography>
                  )}
                </Box>
              </Tooltip>
            </Box>
          );
        })}

        <Box sx={{ flex: 1 }} />

        {preparationComplete && status === 'draft' && (
          // The one case the status genuinely cannot express: everything is
          // prepared, and the only thing left is a commercial decision.
          <Chip
            size="small"
            label="Prepared — awaiting confirmation"
            sx={{
              height: 22, fontSize: 11, fontWeight: 600,
              bgcolor: 'var(--c-info-50)', color: 'var(--c-info-800)',
            }}
          />
        )}
      </Box>

      {current && (
        <Typography sx={{ fontSize: 12, color: 'var(--c-text-2)', mt: 0.75, pl: 0.5 }}>
          <Box component="span" sx={{ fontWeight: 600, color: 'var(--c-text)' }}>Next: {current.label}</Box>
          {' — '}{current.detail}
        </Typography>
      )}
    </Surface>
  );
}
