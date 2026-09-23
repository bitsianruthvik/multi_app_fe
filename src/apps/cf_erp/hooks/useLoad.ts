import { useCallback, useEffect, useState } from 'react';
import { CfApiError } from '../api/client';

/**
 * Loads data for a screen and lets it reload after a change. Keeps the last
 * good data while reloading, so a list does not flash empty after every save.
 */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<CfApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load()
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // `load` is recreated every render; the caller's deps say when it really changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** The company slug from the URL. */
export function useCompanySlug(): string {
  return window.location.pathname.split('/').filter(Boolean)[0] ?? '';
}
