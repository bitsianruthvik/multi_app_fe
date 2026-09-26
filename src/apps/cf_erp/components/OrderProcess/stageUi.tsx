import type { ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import HourglassEmptyRounded from '@mui/icons-material/HourglassEmptyRounded';
import SyncRounded from '@mui/icons-material/SyncRounded';
import RemoveCircleOutlineRounded from '@mui/icons-material/RemoveCircleOutlineRounded';
import type { OrderStage, StageBlocker, StageState } from '../../api/types';
import { DECIDED_BY_HELP, STATE_HELP, STATE_WORD, blockerWho, requirementHelp, requirementWord } from '../../lib/process';
import { Badge, Mono, type Family } from '../ui';

/**
 * The small pieces the order's stage tabs, their foot and the stage screens
 * share, so a stage looks the same wherever it is drawn. They all read one
 * object — the state here is never worked out locally, only coloured.
 */

/** A state's colour family. Never colour alone: the badge carries an icon and the word too. */
const STATE_FAMILY: Record<StageState, Family> = {
  todo: 'warning',
  partial: 'info',
  done: 'success',
  not_applicable: 'neutral',
};

/**
 * The glyph each state wears — the same one the badge draws for its family
 * (ui.tsx `Badge`), so the mark on a tab and the badge on a screen are
 * recognisably one thing. Keep the two in step.
 */
const STATE_ICON: Record<StageState, typeof CheckCircleRounded> = {
  todo: HourglassEmptyRounded,
  partial: SyncRounded,
  done: CheckCircleRounded,
  not_applicable: RemoveCircleOutlineRounded,
};

/** Bare on the surface the -600 tone holds its contrast; "not needed" is muted on purpose. */
const MARK_COLOUR: Record<StageState, string> = {
  todo: 'var(--c-warning-600)',
  partial: 'var(--c-info-600)',
  done: 'var(--c-success-600)',
  not_applicable: 'var(--c-text-3)',
};

/** How far a stage has got, in a word, with the sentence on hover. */
export function StageStateBadge({ stage }: { stage: OrderStage }) {
  return <Badge family={STATE_FAMILY[stage.state]} label={STATE_WORD[stage.state]} title={`${STATE_HELP[stage.state]} ${DECIDED_BY_HELP[stage.decidedBy]}`} />;
}

/**
 * The same state as a mark alone, for a tab. It is decoration to assistive
 * technology — the tab carries the word in its name — and it is never colour
 * alone: each state has its own glyph.
 */
export function StageStateMark({ state, size = 16 }: { state: StageState; size?: number }) {
  const Icon = STATE_ICON[state];
  return <Icon aria-hidden sx={{ fontSize: size, flexShrink: 0, color: MARK_COLOUR[state] }} />;
}

/** Shown beside a stage the order can move past without finishing. */
export function OptionalBadge({ stage }: { stage: OrderStage }) {
  if (stage.requirement !== 'optional') return null;
  return <Badge family="neutral" noIcon label={requirementWord(stage.requirement)} title={requirementHelp(stage.requirement)} />;
}

/** Marks the stage that needs work next. Derived from the API's states, never enforced. */
export function NextMark({ title = 'The next stage that needs work' }: { title?: string }) {
  return (
    <Box component="span" title={title} sx={{
      flexShrink: 0, px: 0.75, py: '1px', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, lineHeight: 1.5,
      letterSpacing: '.06em', textTransform: 'uppercase',
      background: 'var(--c-primary-50)', color: 'var(--c-primary-700)', border: '1px solid var(--c-primary-200)',
    }}>
      Next
    </Box>
  );
}

/** A stage's `detail` on one line, with the whole sentence on hover. */
export function DetailLine({ text, sx }: { text: string; sx?: object }) {
  return (
    <Tooltip title={text} placement="top-start">
      <Box sx={{ fontSize: 12.5, color: 'var(--c-text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...sx }}>
        {text}
      </Box>
    </Tooltip>
  );
}

/**
 * Every blocker as its own line, each naming the line it belongs to. A count
 * is a search; a count with its line number is somewhere to go.
 */
export function BlockerList({ blockers, heading }: { blockers: StageBlocker[]; heading?: ReactNode }) {
  if (!blockers.length) return null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.75 }}>
      {heading}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 0.5 }}>
        {blockers.map((b, i) => (
          <Box component="li" key={`${b.stageKey}:${b.lineId ?? 'order'}:${i}`} sx={{
            display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, minWidth: 0,
            borderRadius: 'var(--r-sm)', background: 'var(--c-warning-50)', border: '1px solid var(--c-warning-200)', color: 'var(--c-warning-800)',
          }}>
            <Mono chip sx={{ flexShrink: 0 }}>{blockerWho(b)}</Mono>
            <Box sx={{ fontSize: 13, minWidth: 0, overflowWrap: 'anywhere' }}>{b.message}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
