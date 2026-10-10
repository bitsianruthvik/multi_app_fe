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
    setLoading(true);
    setError(null);
    (type === 'role' ? jobContentApi.forRole(id, asOf) : jobContentApi.forPosition(id, asOf))
      .then((d) => {
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
  return { data: mine, error, loading, reload: () => setTick((t) => t + 1), setData };
}
