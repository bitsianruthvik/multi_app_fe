import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Polled auto-refresh for the shop-floor screens (elevation plan §7.2).
 *
 * Task Queue and Machine Board are wall-mounted or left open all shift, so a
 * screen showing five-minute-old machine states is actively misleading — an
 * operator reads it as current. This keeps them honest.
 *
 * Three deliberate behaviours:
 *  - **Pauses when the tab is hidden.** Polling a background tab all night
 *    burns the user's battery and the server's capacity for nobody's benefit.
 *    On becoming visible again it refreshes immediately rather than waiting out
 *    the remaining interval, so what you see when you look back is current.
 *  - **Never overlaps.** A slow response won't stack requests; the next tick is
 *    scheduled after the previous one settles.
 *  - **User-pausable.** Someone mid-interaction (reading a row, comparing two
 *    machines) can stop the ground moving under them.
 *
 * Returns `lastUpdated` so the screen can say how stale it is — an auto-
 * refreshing view that doesn't show its age is just as untrustworthy as a
 * stale one.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  {
    intervalMs = 30_000,
    enabled = true,
  }: { intervalMs?: number; enabled?: boolean } = {},
) {
  const [paused, setPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep the latest callback without restarting the timer on every render —
  // callers rarely memoise, and a re-created interval would never fire.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      await refreshRef.current();
      setLastUpdated(Date.now());
    } catch {
      // Swallow: a failed poll must not break the screen or stop the loop.
      // The stale-age indicator will keep climbing, which is the honest signal.
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || paused) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') await run();
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };

    timer = setTimeout(tick, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void run();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, paused, intervalMs, run]);

  return {
    paused,
    setPaused,
    lastUpdated,
    busy,
    /** Force an immediate refresh (also used by a manual Refresh button). */
    refreshNow: run,
  };
}

/**
 * A clock that re-renders its consumer on a fixed beat.
 *
 * Elapsed timers ("running 1h 12m") must advance on their own — a duration
 * computed once at fetch time silently freezes, and a frozen timer on a
 * shop-floor board is worse than no timer because it looks live.
 *
 * Returns the current epoch ms; derive every duration from it so all timers on
 * a screen tick in lockstep instead of drifting apart.
 */
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Compact "12s ago" / "4m ago" for the freshness indicator. */
export function formatAge(since: number | null, now: number): string {
  if (since == null) return 'never';
  const sec = Math.max(0, Math.round((now - since) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}
