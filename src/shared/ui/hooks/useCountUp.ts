import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number toward its target (DESIGN_SYSTEM.md §5.7-1).
 *
 * Two behaviours that a naive version gets wrong, both of which show up as a
 * StatStrip that silently disagrees with the table under it:
 *
 *  1. **It animates from the previous value, not from zero.** Counting up from
 *     0 is right on mount; on an in-place refresh (0 → 2 after an assignment)
 *     restarting at zero reads as a glitch.
 *
 *  2. **It always lands exactly on `to`.** The value is committed synchronously
 *     when the target changes and again at the end of the animation, so the
 *     displayed number can never be stranded on a stale value if a frame is
 *     dropped, the tab is backgrounded (rAF stops firing entirely), or the
 *     effect is torn down mid-flight. A stat that lies is worse than a stat
 *     that doesn't animate.
 */
export function useCountUp(to: number, ms = 900): number {
  const [n, setN] = useState(to);
  // What's currently on screen — the start point for the next animation.
  const shownRef = useRef(to);

  useEffect(() => {
    const from = shownRef.current;
    if (from === to) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      shownRef.current = to;
      setN(to);
      return;
    }

    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      shownRef.current = v;
      setN(v);
      if (p < 1) {
        raf = requestAnimationFrame(step);
      } else {
        shownRef.current = to;
        setN(to);
      }
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      // Torn down mid-animation: commit the target so the next run starts from
      // a truthful value and nothing is left showing a half-finished number.
      shownRef.current = to;
      setN(to);
    };
  }, [to, ms]);

  return n;
}
