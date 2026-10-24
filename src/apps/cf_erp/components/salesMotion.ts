import { useEffect, useState } from 'react';
import { duration, nudge, stagger } from '../motion';

/*
 * Small motion helpers for the sales screens and the order page (TM/CF_ERP_MOTION_SPEC.md, area B).
 * Built only from the shared motion pieces and tokens; nothing here changes behaviour.
 */

/**
 * True from the render where `flag` turned from false to true — while `scope` stayed the same — until it turns
 * false again or the scope changes. For "a stage turned done", "the terms were approved": never true on first
 * show, never when the screen merely switched to another line / order (a new scope).
 */
export function useBecame(flag: boolean, scope: unknown = null): boolean {
  const [seen, setSeen] = useState({ flag, scope, became: false });
  if (seen.flag !== flag || !Object.is(seen.scope, scope)) {
    const became = flag && !seen.flag && Object.is(seen.scope, scope);
    setSeen({ flag, scope, became });
    return became;
  }
  return seen.became;
}

/**
 * The keys that appeared since the last change of `keys` — for a brief highlight of rows just added (or just
 * marked). Empty on first show and while `keys` is null (not loaded yet); a fresh set clears itself after a flash,
 * so a list that redraws later does not light the same rows up again.
 */
export function useFreshKeys(keys: readonly string[] | null): ReadonlySet<string> {
  const sig = keys ? keys.join('|') : null;
  const [seen, setSeen] = useState<{ sig: string | null; known: Set<string>; fresh: Set<string> }>(
    () => ({ sig, known: new Set(keys ?? []), fresh: new Set() }),
  );
  if (seen.sig !== sig) {
    const fresh = keys && seen.sig !== null ? new Set(keys.filter((k) => !seen.known.has(k))) : new Set<string>();
    setSeen({ sig, known: new Set(keys ?? []), fresh });
  }
  useEffect(() => {
    if (!seen.fresh.size) return undefined;
    const t = window.setTimeout(() => setSeen((s) => (s.fresh.size ? { ...s, fresh: new Set() } : s)), duration.flash);
    return () => window.clearTimeout(t);
  }, [seen.fresh]);
  return seen.fresh;
}

/** sx (for a row) that flashes its cells once — the shared highlight-flash keyframes, colour only. */
export const rowFlashSx = { '& > td': { animation: 'cfm-highlight-flash var(--m-dur-flash) var(--m-ease-standard)' } } as const;

/**
 * sx for a box around a DataTable: its first rows (≤ 12, whole run ≤ 300 ms) rise in as they mount.
 * Rows that stay mounted never replay; the reduced-motion kill-switch in motion.css turns it off.
 */
export function staggerRowsSx(max: number = stagger.max): Record<string, object> {
  const n = Math.min(max, stagger.max);
  const gap = n > 1 ? Math.min(stagger.step, Math.floor(stagger.total / n)) : 0;
  const sx: Record<string, object> = {};
  for (let i = 1; i <= n; i += 1) {
    sx[`& tbody > tr[data-row]:nth-of-type(${i})`] = {
      animation: `cfm-rise-in var(--m-dur-slow) var(--m-ease-standard) ${(i - 1) * gap}ms both`,
    };
  }
  return sx;
}

/** A button's action refused by the server (422): one "nope" nudge on the button. The screen shows the why. */
export function nudgeIfRefused(error: unknown, el: Element | null | undefined): void {
  if ((error as { status?: number } | null)?.status === 422) nudge(el);
}
