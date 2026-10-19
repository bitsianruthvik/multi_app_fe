import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { stagger } from '../motion';

/** How long a "saved" tick stays beside the action that saved (ms). Not motion — how long the confirmation is shown. */
const SHOWN_FOR = 2400;

/**
 * Motion (TM/CF_ERP_MOTION_SPEC.md): a "saved" tick shown briefly beside the action that just saved. `tick` is 0 while
 * nothing shows, else a new number per save — use it as the `<SuccessCheck key>` so a second save draws it again.
 * Never delays anything: `mark()` only sets state.
 */
export function useSavedCheck(): [number, () => void] {
  const [tick, setTick] = useState(0);
  const timer = useRef<number | null>(null);
  const mark = useCallback(() => {
    setTick((t) => t + 1);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; setTick(0); }, SHOWN_FOR);
  }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  return [tick, mark];
}

/**
 * The first-12-rows stagger (spec rule 4) for a hand-built table row, where `<Stagger>` cannot wrap the rows (fragments,
 * headings between them). Row `i` past the first 12 gets nothing; the whole run stays within the token's 300 ms.
 */
export function staggerRow(i: number): { className?: string; style?: CSSProperties } {
  if (i >= stagger.max) return {};
  return { className: 'cfm-rise-in', style: { animationDelay: `${i * Math.min(stagger.step, Math.floor(stagger.total / stagger.max))}ms` } };
}
