import { Box } from '@mui/material';
import type { OrderStage } from '../../api/types';
import { STATE_WORD } from '../../lib/process';
import { DetailLine, NextMark, OptionalBadge, StageNumber, StageStateBadge } from './stageUi';

/**
 * The stages of the process, in order, down the side of the pop-up.
 *
 * NOTHING HERE IS EVER DISABLED. A rail that locks a step is what sent the
 * sibling app's wizard into the ditch: it refused work the tabs behind it had
 * already done, and pointed at itself as the way to fix that. Every stage is
 * one click away at any time; the states are the API's answer, drawn, never
 * decided here.
 */
export function ProcessRail({ stages, current, nextStage, nextMarkTitle, onPick }: {
  stages: OrderStage[];
  current: string;
  /** The stage that needs work next in whatever these stages are about — marked, never enforced. */
  nextStage: string | null;
  nextMarkTitle?: string;
  onPick: (stageKey: string) => void;
}) {
  return (
    <Box
      component="ol"
      aria-label="Stages of this process"
      sx={{
        listStyle: 'none', m: 0, p: 0, display: 'flex', minWidth: 0,
        flexDirection: { xs: 'row', md: 'column' },
        gap: 0.75,
        overflowX: { xs: 'auto', md: 'visible' },
        overflowY: { xs: 'visible', md: 'auto' },
        pb: { xs: 0.5, md: 0 },
        scrollbarWidth: 'thin',
      }}
    >
      {stages.map((s, i) => {
        const on = s.stageKey === current;
        const next = s.stageKey === nextStage;
        return (
          <Box component="li" key={s.stageKey} sx={{ minWidth: 0, flexShrink: 0, width: { xs: 208, md: 'auto' } }}>
            <Box
              component="button"
              type="button"
              onClick={() => onPick(s.stageKey)}
              aria-current={on ? 'step' : undefined}
              aria-label={`${s.label} — ${STATE_WORD[s.state]}`}
              sx={{
                width: '100%', minWidth: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit',
                display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr)', alignItems: 'center', columnGap: 1, rowGap: 0.25,
                p: 1, borderRadius: 'var(--r-md)',
                border: `1px solid ${on ? 'var(--c-primary-200)' : 'var(--c-border)'}`,
                background: on ? 'var(--c-primary-50)' : 'var(--c-surface)',
                transition: 'background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease)',
                '&:hover': { background: on ? 'var(--c-primary-50)' : 'var(--c-surface-2)' },
              }}
            >
              <StageNumber n={i + 1} on={on} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                <Box sx={{ fontSize: 13.5, fontWeight: 500, color: 'var(--c-text)', minWidth: 0, overflowWrap: 'anywhere' }}>{s.label}</Box>
                {next && <NextMark title={nextMarkTitle} />}
              </Box>
              <Box sx={{ gridColumn: '2', display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', minWidth: 0 }}>
                <StageStateBadge stage={s} />
                <OptionalBadge stage={s} />
              </Box>
              <DetailLine text={s.detail} sx={{ gridColumn: '2', mt: 0.25 }} />
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
