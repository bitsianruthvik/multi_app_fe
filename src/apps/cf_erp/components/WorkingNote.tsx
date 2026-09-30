import { Box } from '@mui/material';
import { useElapsedSeconds } from '../hooks/useElapsedSeconds';
import { formatElapsed, TIMER_AFTER_SECONDS } from '../lib/working';

/**
 * The line that replaces a bare spinner: what is being worked out and roughly
 * how big, then a stopwatch once it has taken more than five seconds — so a
 * slow check reads as work in progress, not as a hang.
 */
export function WorkingNote({ children, elapsed }: { children: string; elapsed: number }) {
  return (
    <Box role="status" aria-live="polite" data-testid="working-note" sx={{ fontSize: 13.5, color: 'var(--c-text-2)', overflowWrap: 'anywhere' }}>
      {children}
      {elapsed >= TIMER_AFTER_SECONDS && <Box component="span" aria-hidden sx={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', ml: 0.75, color: 'var(--c-text-3)' }} data-testid="working-timer">{formatElapsed(elapsed)}</Box>}
    </Box>
  );
}

/** `<WorkingNote>` that runs its own clock while `active`. */
export function Working({ active, children }: { active: boolean; children: string }) {
  const elapsed = useElapsedSeconds(active);
  return active ? <WorkingNote elapsed={elapsed}>{children}</WorkingNote> : null;
}
