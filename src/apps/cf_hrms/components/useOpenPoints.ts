import { useCallback, useEffect, useState } from 'react';
import type { OpenPointGroup } from '../api/orgchart';
import { orgChartApi } from '../api/orgchart';

/**
 * The open points, fetched once and re-fetched after every change — shared by
 * the org chart's Doubts tab (which needs the count before the tab is opened)
 * and the `OrgChartOpenPoints` dialog. Its own file only because a component
 * file that also exports a hook defeats fast refresh.
 */
export function useOpenPoints({ enabled = true }: { enabled?: boolean } = {}) {
  const [groups, setGroups] = useState<OpenPointGroup[]>([]);
  // Loading from the first render when enabled, so a caller never sees an
  // empty, settled list — and a count of 0 — before the request has gone out.
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return orgChartApi
      .openPoints()
      .then((r) => {
        setGroups(Array.isArray(r) ? r : []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  // The endpoint answers OPEN points unless asked otherwise, so every point
  // here is an open one — this is the number the tab carries.
  const total = groups.reduce((a, g) => a + (g.points?.length ?? 0), 0);
  return { groups, loading, error, reload, total };
}
