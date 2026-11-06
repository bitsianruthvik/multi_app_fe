import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@core/api/client';

/** sumangal_dashboard API. Every figure is worked out on the server from the loaded snapshot. */
function base(): string {
  const company = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
  return `/api/${company}/sumangal_dashboard`;
}

async function get<T>(path: string): Promise<T> {
  try {
    return await apiFetch<T>(`${base()}${path}`, { method: 'GET', timeout: 60000 });
  } catch (e) {
    const raw = /^API request failed: \d+ [^-]* - (\{.*\})$/s.exec((e as Error).message)?.[1];
    if (!raw) throw e;
    let body: { error?: string; message?: string };
    try { body = JSON.parse(raw); } catch { throw e; }
    throw new Error(body.error ?? body.message ?? (e as Error).message);
  }
}

/** Loads one report and keeps the last answer on screen while the next one loads. Pass null to skip. */
export function useReport<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!!path);
  const latest = useRef(0);
  const load = useCallback(async () => {
    if (!path) { setData(null); return; }
    const mine = ++latest.current;
    setLoading(true);
    try {
      const d = await get<T>(path);
      if (mine === latest.current) { setData(d); setError(null); }
    } catch (e) {
      if (mine === latest.current) setError(e);
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

export interface Meta {
  asOf: string;
  from: string;
  months: string[];
  options: {
    finish: string[]; metal: string[]; weight: string[]; size: string[]; market: string[]; repeat: string[]; tests: string[];
    customers: { id: number; name: string }[];
  };
}
