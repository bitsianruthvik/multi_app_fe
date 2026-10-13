import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A list screen's search and filters, kept in the address (§13.1).
 *
 * The address is the single source of truth: a filtered list can be bookmarked,
 * and Back brings it back as it was. Address params this hook was not told
 * about (`tab`, a selected record…) are left exactly as they are.
 */
export interface ListFilters {
  /** The search text as typed (updates at once; the address follows ~250 ms later). */
  q: string;
  setQ: (v: string) => void;
  /** Current value of each declared key; '' when not set. */
  values: Record<string, string>;
  /** Set or clear ('' / null) one filter. Writes the address with `replace`. */
  set: (key: string, value: string | null) => void;
  /**
   * Set or clear several filters in ONE address write — use it for a pair that
   * moves together (a from–to date range). Two `set` calls in the same tick can
   * lose the first one.
   */
  setMany: (patch: Record<string, string | null>) => void;
  /** Clears the search and every declared filter. Leaves other address params (e.g. `tab`) alone. */
  clear: () => void;
  /** How many declared filters are set (search not counted). */
  activeCount: number;
  /** True when the search or any filter is set. */
  isFiltered: boolean;
  /**
   * Non-empty values incl. the search, ready to send to the server / the Excel
   * download. The search here is the one in the address (so it settles ~250 ms
   * after the last keystroke — a server list does not refetch on every key).
   */
  params: Record<string, string>;
}

const SEARCH_DELAY_MS = 250;

export function useListFilters(
  keys: readonly string[],
  opts?: {
    searchKey?: string;
    /**
     * A filter that has a value while the address has none (Employees: status
     * `ACTIVE,NOTICE`). `params` carries it, so the list request and the Excel
     * download send it explicitly; `values` stays what the address says; it does
     * not count as a set filter, and `clear` returns to it.
     */
    defaults?: Record<string, string>;
  },
): ListFilters {
  const searchKey = opts?.searchKey ?? 'q';
  const defaults = opts?.defaults;
  const defaultSig = JSON.stringify(defaults ?? {});
  const [searchParams, setSearchParams] = useSearchParams();

  const addressQ = searchParams.get(searchKey) ?? '';
  const [text, setText] = useState(addressQ);
  // What this hook last wrote to the address, until the address shows it. A
  // change of the address that is NOT this value came from outside (Back, a
  // link) and the box must follow it.
  const [written, setWritten] = useState<string | null>(null);
  const [seenAddressQ, setSeenAddressQ] = useState(addressQ);

  if (addressQ !== seenAddressQ) {
    setSeenAddressQ(addressQ);
    if (addressQ !== written) setText(addressQ);
    setWritten(null);
  }

  // The debounced write. Re-armed on every keystroke; dropped when the box and
  // the address already agree.
  useEffect(() => {
    if (text === addressQ) return undefined;
    const timer = window.setTimeout(() => {
      setWritten(text);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (text) next.set(searchKey, text);
          else next.delete(searchKey);
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text, addressQ, searchKey, setSearchParams]);

  // Callers pass the keys as an inline array; compare by content, not identity.
  const keySig = keys.join('\u0000');
  const keyList = useMemo(() => (keySig ? keySig.split('\u0000') : []), [keySig]);

  const values = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of keyList) out[k] = searchParams.get(k) ?? '';
    return out;
  }, [keyList, searchParams]);

  const setMany = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const set = useCallback(
    (key: string, value: string | null) => setMany({ [key]: value }),
    [setMany],
  );

  const clear = useCallback(() => {
    setText('');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(searchKey);
        for (const k of keyList) next.delete(k);
        return next;
      },
      { replace: true },
    );
  }, [keyList, searchKey, setSearchParams]);

  const activeCount = keyList.reduce(
    (n, k) => (values[k] && values[k] !== (defaults?.[k] ?? '') ? n + 1 : n),
    0,
  );

  const params = useMemo(() => {
    const out: Record<string, string> = {};
    const q = addressQ.trim();
    if (q) out[searchKey] = q;
    const fallback = JSON.parse(defaultSig) as Record<string, string>;
    for (const k of keyList) {
      const v = values[k] || fallback[k] || '';
      if (v) out[k] = v;
    }
    return out;
  }, [addressQ, keyList, searchKey, values, defaultSig]);

  return {
    q: text,
    setQ: setText,
    values,
    set,
    setMany,
    clear,
    activeCount,
    isFiltered: activeCount > 0 || text.trim() !== '' || addressQ.trim() !== '',
    params,
  };
}

/**
 * Case-insensitive "all words appear" match of the search text against a row's
 * text. For a screen that filters in the browser because the server has no
 * search parameter. An empty search matches everything.
 */
export function matchesSearch(haystack: string, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * The server's own search rule (`matchesText` in lib/listFilters.js): the
 * trimmed text, as one phrase, appears in ANY of the listed fields, ignoring
 * case. A screen that filters in the browser uses this — not `matchesSearch` —
 * so what it shows is exactly what the Excel download will hold.
 */
export function matchesQuery(fields: unknown[], q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => String(f ?? '').toLowerCase().includes(needle));
}

/**
 * The server's yes/no rule (`flag` in lib/listFilters.js): '' is no filter,
 * '1' keeps the rows where the fact is true, '0' where it is false.
 */
export function matchesFlag(value: string, actual: boolean): boolean {
  if (value === '') return true;
  return (value === '1') === actual;
}

/** Options for a yes/no filter: the address carries '1' / '0', as the server expects. */
export const YES_NO_OPTIONS = [
  { value: '1', label: 'Yes' },
  { value: '0', label: 'No' },
];
