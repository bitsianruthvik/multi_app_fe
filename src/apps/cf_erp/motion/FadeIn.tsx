import type { CSSProperties, ElementType, ReactNode } from 'react';

type Variant = 'fade' | 'rise' | 'pop';
const CLASS: Record<Variant, string> = { fade: 'cfm-fade-in', rise: 'cfm-rise-in', pop: 'cfm-pop' };

export interface FadeInProps {
  children?: ReactNode;
  /** fade (opacity), rise (opacity + 6px up), pop (opacity + slight scale). Default fade. */
  variant?: Variant;
  /** Element to render. Default div. */
  as?: ElementType;
  /** Small delay in ms (keep ≤ 120). */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  [key: `data-${string}`]: string | undefined;
}

/**
 * Plays a one-time enter animation on mount. The content is in the DOM at once
 * (only styled), so tests and screen readers see it immediately. Pure CSS — the
 * reduced-motion kill-switch in motion.css turns it off.
 */
export function FadeIn({ children, variant = 'fade', as: Tag = 'div', delay, className, style, ...rest }: FadeInProps) {
  const cls = className ? `${CLASS[variant]} ${className}` : CLASS[variant];
  const st = delay ? { ...style, animationDelay: `${delay}ms` } : style;
  return <Tag className={cls} style={st} {...rest}>{children}</Tag>;
}
