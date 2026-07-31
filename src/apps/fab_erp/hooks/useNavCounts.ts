import { useCallback, useEffect, useRef, useState } from 'react';
import { fabGet } from '../api/client';

/**
 * Live badge counts for the contextual nav row (GET /nav-counts).
 *
 * The counts are what turn navigation into a status surface — you read
 * "Reconcile · 3 gaps" before deciding to click. But they are strictly
 * decoration: this hook never throws, never blocks, and returns an empty map on
 * failure so every badge simply disappears. Navigation must work with the
 * backend down.
 *
 * Cached module-wide for TTL_MS so switching sections doesn't refetch, and
 * shared across every mounted consumer.
 */

const TTL_MS = 60_000;

type Counts = Record<string, number>;

let cache: { at: number; counts: Counts } | null = null;
let inflight: Promise<Counts> | null = null;

async function load(force: boolean): Promise<Counts> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.counts;
  // Collapse concurrent callers (top nav + Setup hub mount together) into one
  // request rather than firing the same query twice on first paint.
  if (!force && inflight) return inflight;

  inflight = (async () => {
    try {
      const data = await fabGet<{ counts: Counts }>('nav-counts');
      const counts = data?.counts ?? {};
      cache = { at: Date.now(), counts };
      return counts;
    } catch {
      // Keep any previously good counts rather than blanking the whole bar on a
      // single transient failure.
      return cache?.counts ?? {};
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Drop the cache so the next read refetches — call after a mutation. */
export function invalidateNavCounts() {
  cache = null;
}

export function useNavCounts(): { counts: Counts; refresh: () => void } {
  const [counts, setCounts] = useState<Counts>(() => cache?.counts ?? {});
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback((force: boolean) => {
    void load(force).then((c) => { if (alive.current) setCounts(c); });
  }, []);

  useEffect(() => { run(false); }, [run]);

  const refresh = useCallback(() => { invalidateNavCounts(); run(true); }, [run]);

  return { counts, refresh };
}
