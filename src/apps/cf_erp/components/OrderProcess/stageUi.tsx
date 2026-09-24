import type { ReactNode } from 'react';
import { Box, Tooltip } from '@mui/material';
import type { OrderStage, StageBlocker, StageState } from '../../api/types';
import { DECIDED_BY_HELP, STATE_HELP, STATE_WORD, blockerWho, requirementHelp, requirementWord } from '../../lib/process';
import { Badge, Mono, type Family } from '../ui';

/**
 * The small pieces the process pop-up and the order's stage strip share, so a
 * stage looks the same wherever it is drawn. Both read one object — the state
 * here is never worked out locally, only coloured.
 */

/** A state's colour family. Never colour alone: the badge carries an icon and the word too. */
const STATE_FAMILY: Record<StageState, Family> = {
  todo: 'warning',
  partial: 'info',
  done: 'success',
  not_applicable: 'neutral',
};

/** How far a stage has got, in a word, with the sentence on hover. */
export function StageStateBadge({ stage }: { stage: OrderStage }) {
  return <Badge family={STATE_FAMILY[stage.state]} label={STATE_WORD[stage.state]} title={`${STATE_HELP[stage.state]} ${DECIDED_BY_HELP[stage.decidedBy]}`} />;
}

/** Shown beside a stage the order can move past without finishing. */
export function OptionalBadge({ stage }: { stage: OrderStage }) {
  if (stage.requirement !== 'optional') return null;
  return <Badge family="neutral" noIcon label={requirementWord(stage.requirement)} title={requirementHelp(stage.requirement)} />;
}

/** The stage's place in the process — the same number the setup screen shows. */
export function StageNumber({ n, on = false }: { n: number; on?: boolean }) {
  return (
    <Box aria-hidden sx={{
      width: 26, height: 26, flexShrink: 0, borderRadius: 'var(--r-sm)', display: 'grid', placeItems: 'center',
      fontFamily: 'var(--font-mono)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums',
      background: on ? 'var(--c-primary-600)' : 'var(--c-primary-50)',
      color: on ? '#fff' : 'var(--c-primary-900)',
      border: `1px solid ${on ? 'var(--c-primary-600)' : 'var(--c-primary-200)'}`,
    }}>
      {n}
    </Box>
  );
}

/** Marks the stage that needs work next. Derived from the API's states, never enforced. */
export function NextMark({ title = 'The next stage that needs work' }: { title?: string }) {
  return (
    <Box component="span" title={title} sx={{
      flexShrink: 0, px: 0.75, py: '1px', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600,
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
