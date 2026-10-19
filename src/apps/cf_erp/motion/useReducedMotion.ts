import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
    return window.matchMedia(QUERY) ?? null;
  } catch {
    return null;
  }
}

/** True when the user asked for reduced motion. No matchMedia (SSR, plain jsdom) → false; never throws. */
export function prefersReducedMotion(): boolean {
  const mq = mediaQuery();
  return !!mq?.matches;
}

/** True under jsdom (the test scripts): DOM-only effects (celebrate, nudge) and CountUp skip themselves there. */
export function isJsdom(): boolean {
  // window.navigator, not the global: under Node ≥ 21 the global `navigator` is Node's own.
  const nav = typeof window !== 'undefined' ? window.navigator : undefined;
  return /jsdom/i.test(nav?.userAgent || '');
}

/** True when DOM-only motion should not run at all. */
export function motionOff(): boolean {
  return typeof document === 'undefined' || isJsdom() || prefersReducedMotion();
}

function subscribe(onChange: () => void): () => void {
  const mq = mediaQuery();
  if (!mq) return () => {};
  try {
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener?.(onChange);
    return () => mq.removeListener?.(onChange);
  } catch {
    return () => {};
  }
}

/** Live `prefers-reduced-motion: reduce` — re-renders when the OS setting changes. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
