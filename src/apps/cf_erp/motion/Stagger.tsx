import { Children, cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { stagger as limits } from './tokens';

export interface StaggerProps {
  children?: ReactNode;
  /** Only the first `max` children animate (default 12); the rest render untouched. */
  max?: number;
  /** Delay step between children in ms (default 25; shrunk so the whole run stays ≤ 300 ms). */
  step?: number;
  /** rise (default) or fade. */
  variant?: 'rise' | 'fade';
}

type Styled = { className?: string; style?: CSSProperties };

/**
 * Staggers the enter animation of the first N children. Adds no wrapper — it
 * adds a class and an animation-delay to each child, so the children must
 * accept className / style (DOM elements and MUI components do). Use it on the
 * first render of a list only; for lists over ~50 rows it still caps at N.
 */
export function Stagger({ children, max = limits.max, step = limits.step, variant = 'rise' }: StaggerProps) {
  const n = Math.max(0, Math.min(max, limits.max));
  const gap = n > 1 ? Math.min(step, Math.floor(limits.total / n)) : 0;
  const cls = variant === 'fade' ? 'cfm-fade-in' : 'cfm-rise-in';
  let i = 0;
  return (
    <>
      {Children.map(children, (child) => {
        if (!isValidElement(child) || i >= n) return child;
        const el = child as ReactElement<Styled>;
        const k = i++;
        const prev = el.props.className;
        return cloneElement(el, {
          className: prev ? `${prev} ${cls}` : cls,
          style: { ...el.props.style, animationDelay: `${k * gap}ms` },
        });
      })}
    </>
  );
}
