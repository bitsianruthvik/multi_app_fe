import type { MouseEvent } from 'react';
import { Box } from '@mui/material';
import { CHANGING_TITLE, linkedTitle, suggestTitle, type LinkState } from '../../lib/links';

/**
 * A row's "same design" chip, after its own code on line 1.
 *   ⧉ 4   linked: the same design as 4 other rows (a copy, or linked by hand)
 *   = 2   identical to 2 other rows, not linked — dashed, an offer
 * While the row is being changed the chip turns amber: Save asks what the copies do.
 * A click opens the list of those rows (LinkMembersPopover).
 */
export function LinkChip({ state, changing, name, onOpen }: {
  state: LinkState;
  /** A change waiting on this row reaches its copies. */
  changing?: boolean;
  /** The row's name, for the button's label. */
  name: string;
  onOpen: (anchor: HTMLElement) => void;
}) {
  if (state.kind !== 'linked' && state.kind !== 'suggest') return null;
  const linked = state.kind === 'linked';
  const n = linked ? state.others : state.others.length;
  const title = changing && linked ? CHANGING_TITLE : linked ? linkedTitle(n) : suggestTitle(n);
  return (
    <Box component="button" type="button" data-testid="row-link" data-state={changing && linked ? 'changing' : linked ? 'linked' : 'suggest'} title={title}
      aria-label={`${name}: ${title}`}
      onClick={(e: MouseEvent<HTMLElement>) => { e.stopPropagation(); onOpen(e.currentTarget); }}
      onDoubleClick={(e: MouseEvent) => e.stopPropagation()} onMouseDown={(e: MouseEvent) => e.stopPropagation()}
      sx={{
        font: 'inherit', fontSize: 10.5, lineHeight: '16px', px: 0.75, m: 0, flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer', borderRadius: 'var(--r-sm)',
        border: '1px solid', borderStyle: linked ? 'solid' : 'dashed',
        borderColor: changing && linked ? 'var(--c-warning-600)' : linked ? 'var(--c-primary-200)' : 'var(--c-border-strong, var(--c-border))',
        background: changing && linked ? 'var(--c-warning-200)' : linked ? 'var(--c-primary-50)' : 'transparent',
        color: changing && linked ? 'var(--c-warning-800)' : linked ? 'var(--c-primary-700)' : 'var(--c-text-2)',
        '&:hover, &:focus-visible': { borderColor: 'var(--c-primary-500)' },
      }}>{linked ? `⧉ ${n}` : `= ${n}`}</Box>
  );
}
