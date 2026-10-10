import { useEffect } from 'react';

/**
 * Warns before pending edits are lost by leaving: closing or reloading the tab, or following a
 * link. The app runs on a plain BrowserRouter, which cannot hold a route change back, so the clicks
 * that would leave are caught on their way down — before React sees them — and let through only if
 * the person agrees. A picker's own list is not leaving, so it is let alone. The browser's Back
 * button is the one way out this does not catch.
 *
 * The same guard as the BOM panel's edit mode (components/Bom/BomPanel.tsx), for a screen whose
 * pending edits live above its tabs: `tabs: true` also holds a switch to another tab.
 */
export function useLeaveGuard(active: boolean, message: string, { tabs = false }: { tabs?: boolean } = {}) {
  useEffect(() => {
    if (!active) return undefined;
    const otherTab = (el: Element | null) => tabs && !!el?.closest('[role="tab"][aria-selected="false"]');
    const leaving = (el: Element | null): boolean => {
      if (!el || el.closest('.MuiAutocomplete-popper')) return false;
      const link = el.closest('a[href]');
      if (link) return link.getAttribute('target') !== '_blank' && !link.hasAttribute('download');
      return otherTab(el);
    };
    const hold = (e: Event) => { if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); } };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (leaving(e.target instanceof Element ? e.target : null)) hold(e);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (otherTab(e.target instanceof Element ? e.target : null)) hold(e);
    };
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [active, message, tabs]);
}
