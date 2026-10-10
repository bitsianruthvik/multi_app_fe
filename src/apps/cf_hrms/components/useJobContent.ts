/**
 * Loads one role's or one seat's job content (`api/jobContent.ts`). Shared by
 * the read-only panel and the seat editor, which both need "the content for
 * this target, never the previous one's".
 */
import { useEffect, useState } from 'react';
import { jobContentApi, type JobContentData } from '../api/jobContent';

export interface JobTarget {
  type: 'role' | 'position';
  id: number;
}

/**
 * A short-lived memory of what was just read, so walking the org chart panel
 * position -> person -> back (each view unmounts the last) does not ask the
 * server for the same job twice. Sixty seconds, this tab only. A seat edit
 * writes its answer straight in; a ROLE edit clears everything, because a role
 * reaches every position holding it.
 */
const FRESH_MS = 60_000;
const cache = new Map<string, { at: number; data: JobContentData }>();
const keyOf = (type: string, id: number, asOf?: string) => `${type}:${id}:${asOf ?? ''}`;
export function clearJobContentCache() {
  cache.clear();
}

/** Loads one job's content; `reload` after an edit elsewhere. */
export function useJobContent(target: JobTarget | null, asOf?: string) {
  const [data, setData] = useState<JobContentData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const type = target?.type ?? null;
  const id = target?.id ?? null;

  useEffect(() => {
    if (type == null || id == null) return;
    let live = true;
    const key = keyOf(type, id, asOf);
    const hit = cache.get(key);
    // `tick` > 0 is an explicit reload: always ask.
    if (hit && tick === 0 && Date.now() - hit.at < FRESH_MS) {
      setData(hit.data);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    (type === 'role' ? jobContentApi.forRole(id, asOf) : jobContentApi.forPosition(id, asOf))
      .then((d) => {
        cache.set(key, { at: Date.now(), data: d });
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [type, id, asOf, tick]);

  // Content from the previous target must never sit under this target's title.
  const mine =
    data && type != null && (type === 'role' ? data.subject === 'ROLE' && data.roleId === id : data.positionId === id)
      ? data
      : null;
  /** After an edit that answered with the new content: show it and remember it. */
  const store = (next: JobContentData) => {
    if (type != null && id != null) cache.set(keyOf(type, id, asOf), { at: Date.now(), data: next });
    setData(next);
  };
  return { data: mine, error, loading, reload: () => setTick((t) => t + 1), setData: store };
}
