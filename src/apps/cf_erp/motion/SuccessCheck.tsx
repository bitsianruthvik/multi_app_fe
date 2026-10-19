import type { CSSProperties } from 'react';

export interface SuccessCheckProps {
  /** px, default 20. */
  size?: number;
  /** Stroke / ring colour. Default the success token. */
  color?: string;
  /** Accessible name. Default "Done". Pass '' to hide it from screen readers (decorative). */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * A check mark that draws itself once (ring pops, tick draws, ≈ 280 ms total).
 * Under reduced motion it is simply shown. Rendered as an SVG, present at once.
 */
export function SuccessCheck({ size = 20, color = 'var(--c-success-600, #0E9F6E)', label = 'Done', className, style }: SuccessCheckProps) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      className={className ? `cfm-check ${className}` : 'cfm-check'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      {...a11y}
    >
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" opacity="0.35" />
      <path d="M7 12.5l3.2 3.2L17 9" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
