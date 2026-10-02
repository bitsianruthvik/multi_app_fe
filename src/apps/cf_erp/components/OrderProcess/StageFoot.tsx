import { Box, Button, Tooltip } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import SkipNextRounded from '@mui/icons-material/SkipNextRounded';
import type { OrderStage } from '../../api/types';
import { forwardHelp, forwardLabel, stageSatisfied } from '../../lib/process';
import { DetailLine, OptionalBadge, StageStateBadge } from './stageUi';

/**
 * The foot of a stage tab: Back, where this stage stands for the line, and the
 * way on.
 *
 * The way on is never dead. A finished stage says "Next: Buying"; an unfinished
 * one says "Skip for now: Buying" rather than refusing — the tabs above already
 * let anyone go anywhere, so a foot that refused would only be lying. Confirm is not here:
 * it lives in the order header.
 */
export function StageFoot({ stages, current, checks = [], onGo }: {
  /** The stages the tabs show, in sequence — the line's own, or the order's roll-up. */
  stages: OrderStage[];
  current: OrderStage;
  /** Stages checked on this tab (Values on Structure): the way on is "skip" until they are settled too. */
  checks?: OrderStage[];
  onGo: (stageKey: string) => void;
}) {
  const idx = Math.max(0, stages.findIndex((s) => s.stageKey === current.stageKey));
  const prev = idx > 0 ? stages[idx - 1] : null;
  const next = idx < stages.length - 1 ? stages[idx + 1] : null;
  const satisfied = stageSatisfied(current) && checks.every(stageSatisfied);

  return (
    <Box component="nav" aria-label="Walk the stages" sx={{
      mt: 1, pt: 0.75, borderTop: '1px solid var(--c-divider)', minWidth: 0,
      display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5,
    }}>
      <Box sx={{
        display: 'grid', alignItems: 'center', columnGap: 1.5, rowGap: 1, minWidth: 0,
        gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', sm: 'auto minmax(0, 1fr) auto' },
        gridTemplateAreas: { xs: '"state state" "back fwd"', sm: '"back state fwd"' },
      }}>
        <Box sx={{ gridArea: 'back' }}>
          <Tooltip title={prev ? `Back to ${prev.label}` : 'This is the first stage.'}>
            <span>
              <Button size="small" startIcon={<ArrowBackRounded />} disabled={!prev} onClick={() => prev && onGo(prev.stageKey)}>Back</Button>
            </span>
          </Tooltip>
        </Box>
        <Box sx={{ gridArea: 'state', display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <StageStateBadge stage={current} />
          <OptionalBadge stage={current} />
          <DetailLine text={current.detail} sx={{ flex: '1 1 auto', fontSize: 13 }} />
        </Box>
        <Box sx={{ gridArea: 'fwd', justifySelf: 'end', minWidth: 0 }}>
          {next ? (
            <Tooltip title={forwardHelp(next, satisfied)}>
              <span>
                <Button size="small" variant="contained" endIcon={satisfied ? <ArrowForwardRounded /> : <SkipNextRounded />}
                  onClick={() => onGo(next.stageKey)} sx={{ maxWidth: '100%', '& .MuiButton-endIcon': { flexShrink: 0 } }}>
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{forwardLabel(next, satisfied)}</Box>
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
