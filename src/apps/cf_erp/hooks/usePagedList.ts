import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cfApi, qs, CfApiError } from '../api/client';
import type { ServerPaging, SortState } from '../components/DataTable';

/**
 * ONE PAGE AT A TIME, FILTERED BY THE SERVER. The pattern every cf_erp list
 * follows (backend: apps/cf_erp/lib/listing.js; ARCHITECTURE.md §13):
 *
 *   - search, chips, status, classification are sent to the server, never
 *     applied to the rows in the browser — a capped batch filtered here
 *     silently misses everything past the cap (2026-10-02: "the catalog says
 *     only 500 items are there");
 *   - chip / stat figures come from the server's `counts`, computed over ALL
 *     matching records;
 *   - the table shows the first page and a "Load more" button (DataTable
 *     `server` prop) until every match is reachable;
 *   - export asks the server for every match (`all=1`), not the loaded page.
 *
 * The endpoint answers `?paged=1&limit&offset&sort&dir` with
 * { rows, total, counts?, hasMore }.
 */
export interface PagedAnswer<T, C> {
  rows: T[];
  total: number;
  counts?: C;
  hasMore?: boolean;
  truncated?: boolean;
}

export type ListParams = Record<string, string | number | undefined | null>;

export const PAGE_SIZE = 100;

export function usePagedList<T, C = unknown>(
  path: string,
  params: ListParams,
  opts: { pageSize?: number; enabled?: boolean; defaultSort?: SortState | null } = {},
) {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const enabled = opts.enabled ?? true;
  const [sort, setSort] = useState<SortState | null>(opts.defaultSort ?? null);
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<C | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [tick, setTick] = useState(0);
  // Each request carries the generation it was made for; an answer for an older
  // filter (typing fast) is dropped instead of overwriting the newer one.
  const gen = useRef(0);
  const loadedCount = useRef(0);

  const query = useCallback((extra: ListParams) => `${path}${qs({
    ...params, paged: 1, sort: sort?.key, dir: sort?.dir, ...extra,
  })}`,
  // `params` is compared by value below (key) — a new object each render must not refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [path, JSON.stringify(params), sort?.key, sort?.dir]);

  const key = query({});

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const g = ++gen.current;
    setLoading(true);
    // A reload keeps what was loaded: it asks again for as many rows as are showing.
    const want = tick > 0 ? Math.max(pageSize, Math.min(loadedCount.current, 500)) : pageSize;
    cfApi.get<PagedAnswer<T, C>>(query({ limit: want, offset: 0 }))
      .then((a) => {
        if (g !== gen.current) return;
        setRows(a.rows); loadedCount.current = a.rows.length;
        setTotal(Number(a.total) || 0);
        setCounts(a.counts ?? null);
        setError(null);
        setLoaded(true);
      })
      .catch((e) => { if (g === gen.current) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); })
      .finally(() => { if (g === gen.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, enabled]);

  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const g = gen.current;
    setLoadingMore(true);
    try {
      const a = await cfApi.get<PagedAnswer<T, C>>(query({ limit: pageSize, offset: rows.length }));
      if (g !== gen.current) return;
      setRows((prev) => {
        const next = [...prev, ...a.rows];
        loadedCount.current = next.length;
        return next;
      });
      setTotal(Number(a.total) || 0);
      if (a.counts) setCounts(a.counts);
    } catch (e) {
      if (g === gen.current) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    } finally {
      if (g === gen.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, query, pageSize, rows.length]);

  /** Every matching row, straight from the server — for an export. */
  const exportAll = useCallback(async () => (await cfApi.get<PagedAnswer<T, C>>(query({ all: 1, limit: undefined, offset: undefined }), { timeoutMs: 120_000 })).rows, [query]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const server: ServerPaging<T> = useMemo(() => ({
    total, hasMore, loadingMore, onLoadMore: loadMore, sort, onSort: setSort, exportAll,
  }), [total, hasMore, loadingMore, loadMore, sort, exportAll]);

  return {
    rows,
    total,
    counts,
    /** True until the first answer for the current filters arrives. */
    loading,
    /** False before the very first answer — a table shows skeleton rows then. */
    loaded,
    loadingMore,
    error,
    hasMore,
    loadMore,
    reload,
    sort,
    setSort,
    exportAll,
    /** Spread into <DataTable server={…}>. */
    server,
    /** Patch a loaded row in place (after an inline edit) without refetching. */
    setRows,
  };
}

/** The value after it has stopped changing for `ms` — for search-as-you-type. */
export function useDebounced<V>(value: V, ms = 250): V {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}
