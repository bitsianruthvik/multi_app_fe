import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A filter held in the URL (?status=draft), so a link from Home or the palette
 * lands on the filtered list and the back button undoes a filter change.
 * Setting the default removes the parameter; history is replaced, not pushed.
 */
export function useUrlParam(key: string, fallback: string): [string, (value: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback((next: string) => {
    // Several setters in one go (pick an order AND clear its production order; "clear all filters") each used
    // to start from the same old URL, so the last one wrote the others back (2026-11-14: the 3D tab never
    // changed order). They now build on one pending copy for the rest of the tick.
    const p = pendingParams ?? new URLSearchParams(window.location.search);
    if (next === fallback || next === '') p.delete(key); else p.set(key, next);
    if (!pendingParams) queueMicrotask(() => { pendingParams = null; });
    pendingParams = p;
    setParams(new URLSearchParams(p), { replace: true });
  }, [key, fallback, setParams]);
  return [value, set];
}

/** The URL being built by setters called in the same tick (see useUrlParam). */
let pendingParams: URLSearchParams | null = null;

/**
 * Opens a "new" dialog when the URL asks for one (?new=1, ?new=receipt) — the
 * Create menu and the palette link this way — then drops the parameter, so a
 * reload or the back button does not open it again.
 */
export function useNewParam(onNew: (value: string) => void) {
  const [params, setParams] = useSearchParams();
  const value = params.get('new');
  const handler = useRef(onNew);
  useEffect(() => { handler.current = onNew; });
  useEffect(() => {
    if (!value) return;
    handler.current(value);
    setParams((prev) => { const p = new URLSearchParams(prev); p.delete('new'); return p; }, { replace: true });
  }, [value, setParams]);
}
