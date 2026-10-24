import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { duration } from './tokens';
import { motionOff } from './useReducedMotion';

export interface CountUpProps {
  /** The final number. */
  value: number;
  /** How a number is shown (default: the number with the final value's decimals). Used for the final value too. */
  format?: (n: number) => ReactNode;
  /** ms, capped at 600. */
  ms?: number;
  className?: string;
  style?: CSSProperties;
}

const SR_ONLY: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

function decimals(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0;
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : Math.min(s.length - i - 1, 4);
}

/**
 * Counts a tile's number up from 0 the FIRST time it shows (≤ 600 ms), then
 * just shows later values as they are (pair with FlashOnChange for those).
 * The first render is already the final value, and it is the final value
 * whenever motion is off (reduced motion, jsdom/tests); while counting, the
 * moving digits are aria-hidden and the final value is there for screen readers.
 */
export function CountUp({ value, format, ms = duration.countUp, className, style }: CountUpProps) {
  const [shown, setShown] = useState<number | null>(null); // null = show the real value
  const fmt = format ?? ((n: number) => (Number.isFinite(value) ? n.toFixed(decimals(value)) : String(n)));

  // A layout effect, so the browser never paints the final value and then jumps back to 0.
  useLayoutEffect(() => {
    if (!Number.isFinite(value) || value === 0 || motionOff() || typeof requestAnimationFrame !== 'function') return undefined;
    const total = Math.min(Math.max(ms, 0), duration.countUp);
    const dp = decimals(value);
    const target = value;
    let raf = 0;
    let t0 = 0;
    setShown(0);
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / total, 1);
      if (p >= 1) { setShown(null); return; }
      const f = 10 ** dp;
      setShown(Math.round(target * (1 - (1 - p) ** 3) * f) / f);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); setShown(null); };
    // First show only: later value changes render directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (shown === null) return <span className={className} style={style}>{fmt(value)}</span>;
  return (
    <span className={className} style={{ position: 'relative', ...style }}>
      <span aria-hidden="true">{fmt(shown)}</span>
      <span style={SR_ONLY}>{fmt(value)}</span>
    </span>
  );
}
