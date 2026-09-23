import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number toward its target (DESIGN_SYSTEM.md §5.7-1) — the same
 * behaviour as fab_erp's: it counts from the value on screen (not from zero)
 * on a refresh, and it always lands exactly on the target, even when a frame
 * is dropped or the tab is in the background. A stat that lies is worse than
 * one that does not animate.
 */
export function useCountUp(to: number, ms = 900): number {
  const [n, setN] = useState(to);
  const shownRef = useRef(to);

  useEffect(() => {
    const from = shownRef.current;
    if (from === to) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      shownRef.current = to;
      setN(to);
      return undefined;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      const v = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
      shownRef.current = v;
      setN(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else { shownRef.current = to; setN(to); }
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); shownRef.current = to; setN(to); };
  }, [to, ms]);

  return n;
}
