import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Meta } from './api';

/**
 * One set of filters for every screen. They live in the address, so a view can
 * be shared, and in the session, so they follow the reader from screen to screen.
 * The date range is any From and To date within the data; left empty, it means the whole data.
 */
export const FILTER_KEYS = ['finish', 'metal', 'weight', 'size', 'market', 'repeat', 'tests', 'customer'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const FILTER_LABEL: Record<FilterKey, string> = { finish: 'Finish', metal: 'Metal', weight: 'Piece weight', size: 'Order line size', market: 'Market', repeat: 'New or repeat', tests: 'Testing', customer: 'Customer' };

const STORE = 'sumangal_dashboard:filters';

export const MetaContext = createContext<Meta | null>(null);
export const useMeta = () => useContext(MetaContext);

export function useFilters() {
  const [params, setParams] = useSearchParams();
  const meta = useMeta();

  // Arriving on a screen with an empty address: carry the filters over from the last screen.
  useEffect(() => {
    if ([...params.keys()].length) return;
    try {
      const saved = sessionStorage.getItem(STORE);
      if (saved) setParams(new URLSearchParams(saved), { replace: true });
    } catch { /* storage may be unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = useCallback((next: URLSearchParams) => {
    setParams(next, { replace: true });
    try { sessionStorage.setItem(STORE, next.toString()); } catch { /* storage may be unavailable */ }
  }, [setParams]);

  const rawFrom = params.get('from') || '';
  const rawTo = params.get('to') || '';
  const values = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])) as Record<FilterKey, string>, [params]);

  // Empty means the first or last date of the data.
  const dates = useMemo(() => ({ from: rawFrom || meta?.from || '', to: rawTo || meta?.asOf || '' }), [meta, rawFrom, rawTo]);

  /** Sets the range. A date equal to the data's first or last day is stored as empty, so the address stays clean. */
  const setRange = (from: string, to: string) => {
    const n = new URLSearchParams(params);
    let f = from, t = to;
    if (f && t && f > t) [f, t] = [t, f];
    if (f && f !== meta?.from) n.set('from', f); else n.delete('from');
    if (t && t !== meta?.asOf) n.set('to', t); else n.delete('to');
    write(n);
  };
  const setValue = (k: FilterKey, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); write(n); };
  const clear = () => { const n = new URLSearchParams(); write(n); };

  const query = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (dates.from) q.set('from', dates.from);
    if (dates.to) q.set('to', dates.to);
    for (const k of FILTER_KEYS) if (values[k]) q.set(k, values[k]);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `?${q.toString()}`;
  }, [dates, values]);

  const active = FILTER_KEYS.filter((k) => values[k]);
  const rangeSet = !!(rawFrom || rawTo);
  return { values, setValue, setRange, rangeSet, clear, query, dates, active, ready: !!meta };
}
export type Filters = ReturnType<typeof useFilters>;
