import { useCallback, useState } from 'react';

const KEY = (id: string) => `cf_erp.fullScreen.${id}`;
const read = (id: string) => { try { return window.localStorage.getItem(KEY(id)) === '1'; } catch { return false; } };
const write = (id: string, on: boolean) => { try { if (on) window.localStorage.setItem(KEY(id), '1'); else window.localStorage.removeItem(KEY(id)); } catch { /* private window: not remembered */ } };

/**
 * Full screen for one step of the order flow (components/FullScreen.tsx), remembered in this browser per step `id`
 * (a convenience only: storage that is blocked just means it starts normal).
 */
export function useFullScreen(id: string) {
  const [on, setOn] = useState(() => read(id));
  const set = useCallback((v: boolean) => { setOn(v); write(id, v); }, [id]);
  const toggle = useCallback(() => setOn((v) => { write(id, !v); return !v; }), [id]);
  return { on, set, toggle };
}
