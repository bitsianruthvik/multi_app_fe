import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Unit and period filters, kept in the address (?unit=&range=&from=&to=) so a
 * view can be shared or bookmarked. The unit is also remembered per browser.
 */
export type RangeKey = 'today' | '7d' | '30d' | 'month' | 'lastMonth' | 'fy' | 'lastFy' | 'custom';

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', month: 'This month', lastMonth: 'Last month',
  fy: 'This financial year', lastFy: 'Last financial year', custom: 'Custom',
};

const UNIT_KEY = 'karni_dashboard:unit';
const IST_MS = 5.5 * 3600000;
const today = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);

export function rangeDates(key: RangeKey, from?: string, to?: string): { from: string; to: string } {
  const t = today();
  const [y, m] = t.split('-').map(Number);
  const fyY = m >= 4 ? y : y - 1;
  switch (key) {
    case 'today': return { from: t, to: t };
    case '7d': return { from: shift(t, -6), to: t };
    case '30d': return { from: shift(t, -29), to: t };
    case 'month': return { from: `${t.slice(0, 7)}-01`, to: t };
    case 'lastMonth': {
      const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
      return { from: first, to: last };
    }
    case 'lastFy': return { from: `${fyY - 1}-04-01`, to: `${fyY}-03-31` };
    case 'custom': return { from: from || `${fyY}-04-01`, to: to || t };
    case 'fy':
    default: return { from: `${fyY}-04-01`, to: t };
  }
}

function readUnit(): string {
  try { return localStorage.getItem(UNIT_KEY) || ''; } catch { return ''; }
}

export function useFilters(defaultRange: RangeKey = 'fy') {
  const [sp, setSp] = useSearchParams();
  const unit = sp.has('unit') ? sp.get('unit') || '' : readUnit();
  const range = (sp.get('range') as RangeKey) || defaultRange;
  const dates = rangeDates(range, sp.get('from') || undefined, sp.get('to') || undefined);

  const update = useCallback((patch: Record<string, string | null>) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') next.delete(k); else next.set(k, v); }
      return next;
    }, { replace: true });
  }, [setSp]);

  const setUnit = useCallback((u: string) => {
    try { localStorage.setItem(UNIT_KEY, u); } catch { /* storage blocked */ }
    update({ unit: u || '' });
  }, [update]);
  const setRange = useCallback((r: RangeKey, f?: string, t?: string) => {
    update({ range: r, from: r === 'custom' ? f || dates.from : null, to: r === 'custom' ? t || dates.to : null });
  }, [update, dates.from, dates.to]);

  /** Query string for a report: ?unit=&from=&to= (dates only when asked). */
  const query = useCallback((withDates = true) => {
    const q = new URLSearchParams();
    if (unit) q.set('unit', unit);
    if (withDates) { q.set('from', dates.from); q.set('to', dates.to); }
    const s = q.toString();
    return s ? `?${s}` : '';
  }, [unit, dates.from, dates.to]);

  return useMemo(() => ({ unit, range, ...dates, setUnit, setRange, query }), [unit, range, dates, setUnit, setRange, query]);
}
