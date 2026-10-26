/** The reporting check (CF_HRMS_HIRING_SPEC.md §40.5), read for a screen; `reload` after anything that changes reporting. */
import { useCallback, useEffect, useState } from 'react';
import { orgApi, type Consistency } from '../api/organisation';

/** Reads the check; `reload` after anything that changes reporting. */
export function useConsistency(enabled = true) {
  const [data, setData] = useState<Consistency | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    orgApi.consistency
      .read()
      .then((r) => { if (live) { setData(r); setError(null); } })
      .catch((e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [enabled, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, error, reload };
}
