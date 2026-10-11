import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Full screen for a dialog — the HRMS org chart's mechanism (cf_hrms/components/useFullscreen.ts, read-only reference),
 * kept here so the apps stay independent.
 *
 * THE DOCUMENT goes full screen, not the dialog, and the caller makes the dialog fill the window while `active`
 * (MUI `fullScreen`). Element-level full screen would show only that element's subtree, and every MUI menu, tooltip
 * and dialog portals into `document.body`, outside it.
 *
 * Esc: in real full screen the BROWSER owns Esc and leaves it; `fullscreenchange` tells us. Where the API is missing
 * (iPhone Safari, jsdom) or refused, the dialog filling the window alone is the full screen, and the caller's
 * `onClose(escapeKeyDown)` calls `exit()` instead of closing. Either way the first Esc leaves full screen and the
 * dialog stays; the second closes it.
 */
export function useDialogFullscreen() {
  const [active, setActive] = useState(false);
  // True while WE hold the browser's full screen, so its loss means "exit".
  const viaApi = useRef(false);

  const exit = useCallback(() => {
    if (viaApi.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    viaApi.current = false;
    setActive(false);
  }, []);

  const enter = useCallback(() => {
    setActive(true);
    const de = document.documentElement;
    if (typeof de.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
      viaApi.current = true;
      de.requestFullscreen().catch(() => { viaApi.current = false; });   // refused: the filled window is the full screen
    }
  }, []);

  const toggle = useCallback(() => { if (active) exit(); else enter(); }, [active, enter, exit]);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && viaApi.current) { viaApi.current = false; setActive(false); }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Leaving the screen must not leave the browser in full screen.
  useEffect(() => () => {
    if (viaApi.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  return { active, enter, exit, toggle };
}
