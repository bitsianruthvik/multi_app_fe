import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { duration } from './tokens';
import { prefersReducedMotion } from './useReducedMotion';

export interface FlashOnChangeProps {
  /** The value to watch (number, status…). A flash plays when it changes — never on first render. */
  value: unknown;
  children?: ReactNode;
  /** Element to render. Default span. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

/**
 * Briefly highlights its content (a colour fade) when `value` changes, so the
 * eye catches a number or status that just moved. Off under reduced motion.
 */
export function FlashOnChange({ value, children, as: Tag = 'span', className, style }: FlashOnChangeProps) {
  // 0 = none; 1 / 2 alternate so a quick second change restarts the animation.
  const [flash, setFlash] = useState<0 | 1 | 2>(0);
  const prev = useRef(value);

  useEffect(() => {
    if (Object.is(prev.current, value)) return undefined;
    prev.current = value;
    if (prefersReducedMotion()) return undefined;
    setFlash((f) => (f === 1 ? 2 : 1));
    const t = setTimeout(() => setFlash(0), duration.flash);
    return () => clearTimeout(t);
  }, [value]);

  const fc = flash === 1 ? 'cfm-flash' : flash === 2 ? 'cfm-flash-b' : '';
  const cls = [className, fc].filter(Boolean).join(' ') || undefined;
  return <Tag className={cls} style={style}>{children}</Tag>;
}
