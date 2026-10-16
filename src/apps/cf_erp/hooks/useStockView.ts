import { useCallback, useEffect, useRef, useState } from 'react';
import { CfApiError } from '../api/client';
import { getStockView, type StockViewAnswer, type StockViewParams, type StockViewRow } from '../api/stockView';
import type { SortState } from '../components/DataTable';
import { PAGE_SIZE } from './usePagedList';

type Filters = Omit<StockViewParams, 'sort' | 'dir' | 'limit' | 'offset'>;

/**
 * GET /stock/view one page at a time — usePagedList's pattern, but it keeps
 * the answer's totals and scrap rate too (usePagedList keeps only counts).
 */
export function useStockView(filters: Filters, pageSize = PAGE_SIZE) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [rows, setRows] = useState<StockViewRow[]>([]);
  const [answer, setAnswer] = useState<Omit<StockViewAnswer, 'rows'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<CfApiError | null>(null);
  const [tick, setTick] = useState(0);
  const gen = useRef(0);
  const loadedCount = useRef(0);
  const key = JSON.stringify({ ...filters, sort: sort?.key, dir: sort?.dir });

  useEffect(() => {
    const g = ++gen.current;
    setLoading(true);
    const want = tick > 0 ? Math.max(pageSize, Math.min(loadedCount.current, 500)) : pageSize;
    const p = JSON.parse(key) as StockViewParams;
    getStockView({ ...p, limit: want, offset: 0 })
      .then((a) => {
        if (g !== gen.current) return;
        const { rows: r, ...rest } = a;
        setRows(r); loadedCount.current = r.length;
        setAnswer(rest); setError(null);
      })
      .catch((e) => { if (g === gen.current) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e))); })
      .finally(() => { if (g === gen.current) setLoading(false); });
  }, [key, tick, pageSize]);

  const total = Number(answer?.total) || 0;
  const hasMore = rows.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const g = gen.current;
    setLoadingMore(true);
    try {
      const p = JSON.parse(key) as StockViewParams;
      const a = await getStockView({ ...p, limit: pageSize, offset: rows.length });
      if (g !== gen.current) return;
      setRows((prev) => { const next = [...prev, ...a.rows]; loadedCount.current = next.length; return next; });
      const { rows: _r, ...rest } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      setAnswer(rest);
    } catch (e) {
      if (g === gen.current) setError(e instanceof CfApiError ? e : new CfApiError(0, String(e)));
    } finally {
      if (g === gen.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, key, pageSize, rows.length]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return {
    rows, total, hasMore, loading, loadingMore, error, loadMore, reload, sort, setSort,
    loaded: answer != null,
    counts: answer?.counts ?? null,
    totals: answer?.totals ?? null,
    scrapRate: answer?.scrapRate ?? null,
  };
}
