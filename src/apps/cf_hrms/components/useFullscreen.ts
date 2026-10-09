import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Full screen for the org chart (spec §14).
 *
 * THE DOCUMENT goes full screen, not the chart element, and the chart region
 * makes itself `position: fixed; inset: 0` while `active`. Element-level full
 * screen would show only that element's subtree — and every MUI menu, select,
 * autocomplete list and dialog portals into `document.body`, outside it, so
 * the toolbar's drop-downs and "Close or delete…" would silently stop
 * appearing.
 *
 * Esc: in real full screen the BROWSER owns Esc and leaves full screen with it;
 * `fullscreenchange` tells us, and the fixed layout drops. Where the API is
 * missing (iPhone Safari) or refused, the fixed layout alone is the full
 * screen and Esc is handled here. Either way Esc always means "leave full
 * screen" first, whatever has focus — never hunt for the way out.
 */
export function useFullscreen() {
  const [active, setActive] = useState(false);
  // True while WE hold the browser's full screen, so its loss means "exit".
  const viaApi = useRef(false);

  const exit = useCallback(() => {
    if (viaApi.current && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    viaApi.current = false;
    setActive(false);
  }, []);

  const enter = useCallback(() => {
    setActive(true);
    const de = document.documentElement;
    if (typeof de.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
      viaApi.current = true;
      de.requestFullscreen().catch(() => {
        // Refused (no user gesture, an iframe without allowfullscreen): the
        // fixed layout is still a full-window chart. Keep it.
        viaApi.current = false;
      });
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && viaApi.current) {
        viaApi.current = false;
        setActive(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The CSS-only fallback's Esc. Capture phase, so it runs before the floating
  // panel's own Esc and full screen is always what Esc leaves first.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.fullscreenElement) return;
      const t = e.target instanceof Element ? e.target : null;
      // Esc that closes a dialog, menu or open list belongs to that, not us.
      if (document.querySelector('.MuiModal-root:not(.MuiModal-hidden)')) return;
      if (t?.closest('[aria-expanded="true"]')) return;
      e.stopPropagation();
      exit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, exit]);

  // Leaving the page must not leave the browser in full screen.
  useEffect(
    () => () => {
      if (viaApi.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    },
    [],
  );

  return { active, enter, exit };
}
