import { useCallback, useEffect, useRef, useState } from 'react';
import { cfApi } from '../api/client';

/**
 * Live badge counts for the second nav row (GET /nav-counts), as in fab_erp:
 * decoration only — never throws, never blocks; a failed fetch keeps the last
 * good counts or shows no badges. Cached module-wide for a minute and shared.
 */
const TTL_MS = 60_000;
type Counts = Record<string, number>;
let cache: { at: number; counts: Counts } | null = null;
let inflight: Promise<Counts> | null = null;

async function load(force: boolean): Promise<Counts> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.counts;
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await cfApi.get<{ counts: Counts }>('/nav-counts');
      cache = { at: Date.now(), counts: data?.counts ?? {} };
      return cache.counts;
    } catch {
      return cache?.counts ?? {};
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Drop the cache so the next read refetches — call after a change that moves a count. */
export function invalidateNavCounts() { cache = null; }

export function useNavCounts(): { counts: Counts; refresh: () => void } {
  const [counts, setCounts] = useState<Counts>(() => cache?.counts ?? {});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = useCallback((force: boolean) => { void load(force).then((c) => { if (alive.current) setCounts(c); }); }, []);
  useEffect(() => { run(false); }, [run]);
  const refresh = useCallback(() => { invalidateNavCounts(); run(true); }, [run]);
  return { counts, refresh };
}
