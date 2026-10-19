import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { HelpContext, type HelpRequest } from './helpContext';

// The panel, the renderer and every topic load on the first open — none of it is in the main bundle.
const HelpDrawer = lazy(() => import('./HelpDrawer'));

/** Typing in a field: `?` is a character there, not a shortcut. */
function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/**
 * One help panel for the whole CF ERP shell. HelpButtons ask it to open; `?` opens it for the current screen
 * (not while typing in a field, and not over an open dialog); Esc closes it (the Drawer's own).
 */
export function HelpProvider({ children, onShortcuts }: { children: ReactNode; onShortcuts?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [req, setReq] = useState<HelpRequest & { n: number }>({ n: 0 });

  const openHelp = useCallback((r?: HelpRequest) => {
    setReq((prev) => ({ topic: r?.topic, tab: r?.tab ?? null, n: prev.n + 1 }));
    setLoaded(true);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      // A dialog already open keeps the keyboard.
      if (document.querySelector('.MuiDialog-root, .MuiDrawer-modal')) return;
      e.preventDefault();
      openHelp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openHelp]);

  const api = useMemo(() => ({ open: openHelp }), [openHelp]);
  return (
    <HelpContext.Provider value={api}>
      {children}
      {loaded && (
        <Suspense fallback={null}>
          <HelpDrawer open={open} request={req} onClose={() => setOpen(false)} onShortcuts={onShortcuts ? () => { setOpen(false); onShortcuts(); } : undefined} />
        </Suspense>
      )}
    </HelpContext.Provider>
  );
}
