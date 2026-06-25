import { useEffect, useState } from 'react';

/**
 * Animates a number counting up to its target on mount (DESIGN_SYSTEM.md
 * §5.7-1). Respects prefers-reduced-motion by jumping straight to the final
 * value (§6 accessibility contract).
 */
export function useCountUp(to: number, ms = 900): number {
  const [n, setN] = useState(to);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(to);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);

  return n;
}
