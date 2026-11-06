import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Meta } from './api';

/**
 * One set of filters for every screen. They live in the address, so a view can
 * be shared, and in the session, so they follow the reader from screen to screen.
 */
export type PeriodKey = 'all' | 'last12' | 'prev12' | 'last6';
export const PERIOD_LABEL: Record<PeriodKey, string> = { all: '2 years', last12: 'Last 12 months', prev12: 'Year before', last6: 'Last 6 months' };
export const FILTER_KEYS = ['finish', 'metal', 'weight', 'size', 'market', 'repeat', 'tests', 'customer'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export const FILTER_LABEL: Record<FilterKey, string> = { finish: 'Finish', metal: 'Metal', weight: 'Piece weight', size: 'Order line size', market: 'Market', repeat: 'New or repeat', tests: 'Testing', customer: 'Customer' };

const STORE = 'sumangal_dashboard:filters';
const shift = (iso: string, months: number) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); };

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

  const period = (params.get('period') as PeriodKey) || 'all';
  const values = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])) as Record<FilterKey, string>, [params]);

  const setPeriod = (p: PeriodKey) => { const n = new URLSearchParams(params); if (p === 'all') n.delete('period'); else n.set('period', p); write(n); };
  const setValue = (k: FilterKey, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); write(n); };
  const clear = () => { const n = new URLSearchParams(); write(n); };

  const dates = useMemo(() => {
    if (!meta) return { from: '', to: '' };
    const to = meta.asOf;
    if (period === 'last12') return { from: shift(to, -12), to };
    if (period === 'last6') return { from: shift(to, -6), to };
    if (period === 'prev12') return { from: meta.from, to: shift(to, -12) };
    return { from: meta.from, to };
  }, [meta, period]);

  const query = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (dates.from) q.set('from', dates.from);
    if (dates.to) q.set('to', dates.to);
    for (const k of FILTER_KEYS) if (values[k]) q.set(k, values[k]);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `?${q.toString()}`;
  }, [dates, values]);

  const active = FILTER_KEYS.filter((k) => values[k]);
  return { period, setPeriod, values, setValue, clear, query, dates, active, ready: !!meta };
}
export type Filters = ReturnType<typeof useFilters>;
